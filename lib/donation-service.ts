/**
 * Stand-alone donations (/donate). No login needed: a guest gives an email (the name is not saved).
 * Rules (owner, 2026-11-11): EUR only, whole cents, minimum EUR 1, maximum EUR 1,000, never refunded.
 * Only the Stripe webhook marks the order PAID (lib/stripe-service.ts). Nothing is created when Stripe is off.
 */
import { createHmac } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "./generated/prisma/client";
import { DONATION_MESSAGES, parseDonationAmount, type DonationFieldErrors, type DonationState } from "./donation-amount";
import { PAYMENTS_OFF_MESSAGE } from "./stripe-service";

export const DONATION_DESCRIPTION = "Donation to KEA by Atiana";

export const donorSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Please enter your email.")
    .max(200, "Please use 200 characters or fewer.")
    .pipe(z.email("Please enter a valid email, for example anna@example.com.")),
});

// ---------- Order ----------

export type DonationOrderInput = { userId: string | null; email: string; amountCents: number; ipHash?: string | null };

// ---------- Rate limit (no new table) ----------
// Owner rule 2026-11-11: at most 5 donation starts per hour from one visitor (IP). Only active when Stripe is on.
// Serverless = no memory counter. We count recent donation ORDERS in the database. The IP hash is kept in the
// existing OrderItem.refId column as "ip:<hash>" (a donation item has no other use for refId). Raw IPs are never saved.
export const DONATION_LIMIT_PER_HOUR = 5;
export const DONATION_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const IP_PREFIX = "ip:";

/** Hash of the visitor IP (HMAC, so it cannot be reversed with a table of IPs). Null when the IP is unknown. */
export function hashIp(ip: string | null | undefined, secret = process.env.AUTH_SECRET || "kea-donation-limit"): string | null {
  const t = ip?.trim();
  if (!t) return null;
  return createHmac("sha256", secret).update(t).digest("hex").slice(0, 32);
}

/**
 * How many donation starts this visitor made in the last hour: the bigger of the IP count and the email count.
 * The email match is exact, ignoring case only (lower() = lower()). Prisma "insensitive" would be an ILIKE where
 * "_" and "%" act as wildcards.
 */
export async function countRecentDonationStarts(
  db: Pick<PrismaClient, "order" | "$queryRaw">,
  q: { ipHash: string | null; email: string; now?: Date },
): Promise<number> {
  const since = new Date((q.now ?? new Date()).getTime() - DONATION_LIMIT_WINDOW_MS);
  const byEmail = db
    .$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM "Order" o
      WHERE o."createdAt" > ${since} AND lower(o."email") = lower(${q.email})
      AND EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = o."id" AND i."type" = 'DONATION')`
    .then((rows) => rows[0]?.n ?? 0);
  const byIp = q.ipHash
    ? db.order.count({ where: { createdAt: { gt: since }, items: { some: { type: "DONATION", refId: IP_PREFIX + q.ipHash } } } })
    : Promise.resolve(0);
  return Math.max(await byEmail, await byIp);
}

export class DonationLimitError extends Error {
  constructor() {
    super("Donation limit reached");
  }
}

/**
 * "Check the count" and "create the order" in ONE transaction. Two advisory locks (one for the IP hash, one for the
 * lowercased email, always taken in the same order) make parallel starts of the same visitor wait for each other, so
 * the next one sees the orders of the one before. Locks are released by the database at commit (pg_advisory_xact_lock).
 * Throws DonationLimitError when the visitor already has DONATION_LIMIT_PER_HOUR starts in the last hour.
 */
export async function createDonationOrderLimited(
  db: Pick<PrismaClient, "$transaction">,
  input: DonationOrderInput,
  now: Date = new Date(),
) {
  const keys = [`donation-email:${input.email.trim().toLowerCase()}`, ...(input.ipHash ? [`donation-ip:${input.ipHash}`] : [])].sort();
  return db.$transaction(
    async (tx) => {
      for (const k of keys) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${k}, 0))`;
      const n = await countRecentDonationStarts(tx, { ipHash: input.ipHash ?? null, email: input.email, now });
      if (n >= DONATION_LIMIT_PER_HOUR) throw new DonationLimitError();
      return createDonationOrder(tx, input);
    },
    { maxWait: 15_000, timeout: 20_000 },
  );
}

/** Creates the unpaid donation order (type DONATION). Guest: userId null + email. Logged in: linked to the user. */
export async function createDonationOrder(db: Pick<PrismaClient, "order">, input: DonationOrderInput) {
  const order = await db.order.create({
    data: {
      userId: input.userId,
      email: input.email,
      status: "PENDING",
      currency: "EUR",
      subtotalCents: input.amountCents,
      totalCents: input.amountCents,
      items: {
        create: [
          {
            type: "DONATION",
            description: DONATION_DESCRIPTION,
            quantity: 1,
            unitPriceCents: input.amountCents,
            totalCents: input.amountCents,
            refId: input.ipHash ? IP_PREFIX + input.ipHash : null,
          },
        ],
      },
    },
    select: { id: true },
  });
  return { orderId: order.id };
}

// ---------- The whole submit flow (dependencies are passed in, so it is easy to test) ----------

export type DonationDeps = {
  /** True when Stripe keys are set. False = nothing is created. */
  paymentsOn: boolean;
  /** The logged-in user, if any. */
  user: { id: string; email: string } | null;
  /** Absent = Turnstile is switched off. */
  verifyHuman?: (token: string) => Promise<boolean>;
  /** Hash of the visitor IP (null if unknown). */
  ipHash?: string | null;
  /** Starts in the last hour for this visitor. Absent = no limit. */
  countRecentStarts?: (q: { ipHash: string | null; email: string }) => Promise<number>;
  createOrder: (input: DonationOrderInput) => Promise<{ orderId: string }>;
  /** Creates the Stripe Checkout session, saves its id on the order, returns the Stripe URL (or null on failure). */
  startCheckout: (o: { orderId: string; email: string; amountCents: number }) => Promise<string | null>;
  /** Marks the order CANCELLED when Stripe failed (nothing is deleted). */
  cancelOrder: (orderId: string) => Promise<void>;
  log?: (message: string, error?: unknown) => void;
};

export type DonationResult = DonationState | { status: "redirect"; url: string };

const asText = (v: unknown) => (typeof v === "string" ? v : "");

export async function processDonation(raw: Record<string, unknown>, deps: DonationDeps): Promise<DonationResult> {
  const log = deps.log ?? (() => {});

  // Honeypot: real people leave it empty. Nothing is created.
  if (asText(raw.website).trim() !== "") return { status: "error", message: DONATION_MESSAGES.generic };

  const fieldErrors: DonationFieldErrors = {};
  const amount = parseDonationAmount(raw.amount);
  if (!amount.ok) fieldErrors.amount = amount.message;
  const donor = donorSchema.safeParse({ email: asText(raw.email) });
  if (!donor.success) {
    for (const issue of donor.error.issues) {
      const key = issue.path[0] as "email";
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
  }
  if (!amount.ok || !donor.success) {
    return { status: "error", message: DONATION_MESSAGES.fieldsInvalid, fieldErrors };
  }

  if (!deps.paymentsOn) return { status: "demo-off", message: PAYMENTS_OFF_MESSAGE };

  if (deps.verifyHuman) {
    const token = asText(raw["cf-turnstile-response"]);
    let human = false;
    try {
      human = token !== "" && (await deps.verifyHuman(token));
    } catch (error) {
      log("Turnstile check failed", error);
    }
    if (!human) return { status: "error", message: DONATION_MESSAGES.spam };
  }

  const { email } = donor.data;

  // Rate limit (only reached when Stripe is on, because the demo-off answer came before).
  if (deps.countRecentStarts) {
    try {
      const n = await deps.countRecentStarts({ ipHash: deps.ipHash ?? null, email });
      if (n >= DONATION_LIMIT_PER_HOUR) return { status: "error", message: DONATION_MESSAGES.tooMany };
    } catch (error) {
      log("Rate limit check failed", error);
      return { status: "error", message: DONATION_MESSAGES.generic };
    }
  }

  let orderId: string;
  try {
    ({ orderId } = await deps.createOrder({ userId: deps.user?.id ?? null, email, amountCents: amount.cents, ipHash: deps.ipHash ?? null }));
  } catch (error) {
    if (error instanceof DonationLimitError) return { status: "error", message: DONATION_MESSAGES.tooMany };
    log("Donation order was not created (database not ready?)", error);
    return { status: "error", message: DONATION_MESSAGES.generic };
  }

  let url: string | null = null;
  try {
    url = await deps.startCheckout({ orderId, email, amountCents: amount.cents });
  } catch (error) {
    log("Stripe checkout failed", error);
  }
  if (!url) {
    try {
      await deps.cancelOrder(orderId);
    } catch (error) {
      log("Could not cancel the unpaid donation order", error);
    }
    return { status: "error", message: DONATION_MESSAGES.generic };
  }
  return { status: "redirect", url };
}
