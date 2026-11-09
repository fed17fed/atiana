/**
 * Events: registration, cancel and admin cancel (Phase 5).
 * Same safety as classes: one transaction that locks the session row, the shared "seat taken" rule with the
 * hold cutoff, and the unique key per user and session. One registration per user per event.
 * Pricing (Offering.eventPricing): FREE, DONATION (minimum 0), PAID (ticket).
 * Rules:
 *  - Free and donation EUR 0: confirmed at once, no Stripe. Cancel any time before the start.
 *  - Donation above 0 and paid tickets go through Stripe Checkout (the webhook confirms).
 *  - A donation is NEVER refunded.
 *  - Paid ticket: money back if cancelled 7 days or more before the start (EVENT_REFUND_DAYS), later no.
 *  - If KEA cancels the event, every ticket holder gets a full refund.
 */
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import {
  bookingKeys,
  isEventRefundable,
  MAX_DONATION_CENTS,
  MIN_CARD_PAYMENT_CENTS,
  spotsLeft,
} from "./booking-rules";
import { lockSession, releaseExpiredHoldsForSession, type Refunder } from "./booking-service";

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

export type EventErrorCode =
  | "NOT_FOUND"
  | "CLOSED" // started or cancelled
  | "FULL"
  | "ALREADY_REGISTERED"
  | "DISCLAIMER"
  | "AMOUNT_INVALID"
  | "AMOUNT_TOO_SMALL" // above 0 but below the Stripe minimum
  | "AMOUNT_TOO_BIG"
  | "NO_PRICE"
  | "PAYMENTS_OFF";

export type RegisterResult =
  | {
      ok: true;
      bookingId: string;
      /** CONFIRMED = no payment needed. PENDING = pay with Stripe Checkout next. */
      status: "CONFIRMED" | "PENDING";
      kind: "FREE" | "DONATION_ZERO" | "DONATION" | "PAID";
      orderId: string | null;
      amountCents: number;
      description: string;
      slug: string;
    }
  | { ok: false; code: EventErrorCode };

export async function registerForEvent(
  db: PrismaClient,
  input: {
    userId: string;
    sessionId: string;
    disclaimerAccepted: boolean;
    /** DONATION events only: amount in cents (0 or more). */
    donationCents?: number | null;
    /** False when Stripe is off: nothing is reserved for a payment that cannot start. */
    paymentsOn: boolean;
    now?: Date;
  },
): Promise<RegisterResult> {
  const now = input.now ?? new Date();
  if (!input.disclaimerAccepted) return { ok: false, code: "DISCLAIMER" };

  try {
    return await db.$transaction(async (tx): Promise<RegisterResult> => {
      await lockSession(tx, input.sessionId);
      const session = await tx.classSession.findUnique({
        where: { id: input.sessionId },
        include: { offering: { include: { priceOptions: { orderBy: { amountCents: "asc" } } } } },
      });
      const o = session?.offering;
      if (!session || !o || o.type !== "EVENT" || !o.published || !o.eventPricing) return { ok: false, code: "NOT_FOUND" };
      if (session.status !== "SCHEDULED" || session.startsAt.getTime() <= now.getTime()) return { ok: false, code: "CLOSED" };

      // Decide the kind and the amount BEFORE reserving anything.
      let kind: "FREE" | "DONATION_ZERO" | "DONATION" | "PAID";
      let amountCents = 0;
      if (o.eventPricing === "FREE") {
        kind = "FREE";
      } else if (o.eventPricing === "DONATION") {
        const d = input.donationCents;
        if (d === null || d === undefined || !Number.isInteger(d) || d < 0) return { ok: false, code: "AMOUNT_INVALID" };
        if (d > MAX_DONATION_CENTS) return { ok: false, code: "AMOUNT_TOO_BIG" };
        if (d === 0) kind = "DONATION_ZERO";
        else if (d < MIN_CARD_PAYMENT_CENTS) return { ok: false, code: "AMOUNT_TOO_SMALL" };
        else {
          kind = "DONATION";
          amountCents = d;
        }
      } else {
        const price = o.priceOptions[0];
        if (!price) return { ok: false, code: "NO_PRICE" };
        kind = "PAID";
        amountCents = price.amountCents;
      }
      if ((kind === "DONATION" || kind === "PAID") && !input.paymentsOn) return { ok: false, code: "PAYMENTS_OFF" };

      await releaseExpiredHoldsForSession(tx, session.id, now);
      const mine = await tx.booking.findFirst({
        where: { sessionId: session.id, userId: input.userId, status: { in: ["PENDING", "CONFIRMED"] } },
        select: { id: true },
      });
      if (mine) return { ok: false, code: "ALREADY_REGISTERED" };
      const active = await tx.booking.count({ where: { sessionId: session.id, status: { in: ["PENDING", "CONFIRMED"] } } });
      if (spotsLeft(session.capacity, active) <= 0) return { ok: false, code: "FULL" };

      const keys = bookingKeys({ sessionId: session.id, userId: input.userId, capacity: session.capacity });
      const base = { slug: o.slug, description: o.title };

      if (kind === "FREE" || kind === "DONATION_ZERO") {
        const b = await tx.booking.create({
          data: { userId: input.userId, sessionId: session.id, status: "CONFIRMED", paidWith: "FREE", disclaimerAcceptedAt: now, ...keys },
        });
        return { ok: true, bookingId: b.id, status: "CONFIRMED", kind, orderId: null, amountCents: 0, ...base };
      }

      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { email: true } });
      const itemDescription = kind === "DONATION" ? `Donation – ${o.title}` : o.title;
      const order = await tx.order.create({
        data: {
          userId: input.userId,
          email: user.email,
          status: "PENDING",
          currency: "EUR",
          subtotalCents: amountCents,
          totalCents: amountCents,
          items: {
            create: [
              {
                type: kind === "DONATION" ? "DONATION" : "EVENT",
                description: itemDescription,
                quantity: 1,
                unitPriceCents: amountCents,
                totalCents: amountCents,
                refId: session.id,
              },
            ],
          },
        },
      });
      const b = await tx.booking.create({
        data: { userId: input.userId, sessionId: session.id, status: "PENDING", paidWith: "STRIPE", disclaimerAcceptedAt: now, orderId: order.id, ...keys },
      });
      return { ok: true, bookingId: b.id, status: "PENDING", kind, orderId: order.id, amountCents, ...base, description: itemDescription };
    }, TX_OPTIONS);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return { ok: false, code: "ALREADY_REGISTERED" }; // safety net: the unique key refused a second seat
    }
    throw error;
  }
}

export type CancelEventResult =
  | { ok: true; refund: "STARTED" | "NONE"; reason: "FREE" | "DONATION" | "UNPAID" | "TICKET_EARLY" | "TICKET_LATE" }
  | { ok: false; code: "NOT_FOUND" | "NOT_ACTIVE" | "PAST" | "REFUND_OFF" | "REFUND_FAILED" };

/** The client cancels their own event place. */
export async function cancelEventRegistration(
  db: PrismaClient,
  input: { userId: string; bookingId: string; now?: Date; refund?: Refunder },
): Promise<CancelEventResult> {
  const now = input.now ?? new Date();

  const load = (c: Pick<PrismaClient, "booking">) =>
    c.booking.findFirst({
      where: { id: input.bookingId, userId: input.userId }, // the user is part of the query: nobody else's booking
      include: { session: { include: { offering: true } }, order: { include: { items: true } } },
    });
  type Loaded = NonNullable<Awaited<ReturnType<typeof load>>>;
  const classify = (b: Loaded) => {
    const isTicketPaid = b.status === "CONFIRMED" && b.paidWith === "STRIPE" && b.order?.items.some((i) => i.type === "EVENT") === true;
    const isDonationPaid = b.status === "CONFIRMED" && b.paidWith === "STRIPE" && b.order?.items.some((i) => i.type === "DONATION") === true;
    if (b.status === "PENDING") return "UNPAID" as const;
    if (isTicketPaid) return isEventRefundable(b.session.startsAt, now) ? ("TICKET_EARLY" as const) : ("TICKET_LATE" as const);
    if (isDonationPaid) return "DONATION" as const;
    return "FREE" as const;
  };

  const pre = await load(db);
  if (!pre || pre.session.offering.type !== "EVENT") return { ok: false, code: "NOT_FOUND" };
  if (pre.status !== "PENDING" && pre.status !== "CONFIRMED") return { ok: false, code: "NOT_ACTIVE" };
  if (pre.session.startsAt.getTime() <= now.getTime()) return { ok: false, code: "PAST" };

  // Early ticket: ask Stripe FIRST (idempotent key per booking), then cancel the place.
  if (classify(pre) === "TICKET_EARLY") {
    if (!input.refund || !pre.orderId) return { ok: false, code: "REFUND_OFF" };
    try {
      await input.refund({ orderId: pre.orderId, bookingId: pre.id });
      await db.order.updateMany({ where: { id: pre.orderId, refundStartedAt: null }, data: { refundStartedAt: now } });
    } catch (error) {
      console.error("[event refund] Stripe refund failed", error instanceof Error ? error.message : error);
      return { ok: false, code: "REFUND_FAILED" };
    }
  }

  return db.$transaction(async (tx): Promise<CancelEventResult> => {
    const b = await load(tx as unknown as PrismaClient);
    if (!b || b.session.offering.type !== "EVENT") return { ok: false, code: "NOT_FOUND" };
    if (b.status !== "PENDING" && b.status !== "CONFIRMED") return { ok: false, code: "NOT_ACTIVE" };
    const reason = classify(b);
    // Gate: only one of two parallel requests can cancel.
    const changed = await tx.booking.updateMany({
      where: { id: b.id, status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED", userKey: null, slotKey: null },
    });
    if (changed.count !== 1) return { ok: false, code: "NOT_ACTIVE" };
    if (reason === "UNPAID" && b.orderId) {
      await tx.order.updateMany({ where: { id: b.orderId, status: "PENDING" }, data: { status: "CANCELLED" } });
    }
    return { ok: true, refund: reason === "TICKET_EARLY" ? "STARTED" : "NONE", reason };
  }, TX_OPTIONS);
}

export type AdminCancelResult = {
  cancelledRegistrations: number;
  /** Refunds started in THIS run. */
  refundsStarted: number;
  /** Tickets whose refund was already started in an earlier run (Stripe is not asked again). */
  refundsAlreadyStarted: number;
  refundsFailed: number;
};

/**
 * KEA cancels the whole event: the event is set to CANCELLED, every registration is cancelled and every paid
 * ticket gets a full refund (Stripe, idempotent key per booking, so running it again never refunds twice).
 * Donations are not refunded. The order becomes REFUNDED later, when Stripe confirms (webhook charge.refunded).
 */
export async function cancelEventByAdmin(
  db: PrismaClient,
  input: { sessionId: string; refund: Refunder },
): Promise<AdminCancelResult | { ok: false; code: "NOT_FOUND" }> {
  const session = await db.classSession.findUnique({ where: { id: input.sessionId }, include: { offering: true } });
  if (!session || session.offering.type !== "EVENT") return { ok: false, code: "NOT_FOUND" };

  const cancelled = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await lockSession(tx, session.id);
    await tx.classSession.update({ where: { id: session.id }, data: { status: "CANCELLED" } });
    const r = await tx.booking.updateMany({
      where: { sessionId: session.id, status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED", userKey: null, slotKey: null },
    });
    // Unpaid holds: the orders are cancelled too.
    await tx.order.updateMany({
      where: { status: "PENDING", bookings: { some: { sessionId: session.id } } },
      data: { status: "CANCELLED" },
    });
    return r.count;
  }, TX_OPTIONS);

  // Every PAID ticket order of this event (also from earlier runs, until Stripe confirms the refund).
  const paid = await db.booking.findMany({
    where: { sessionId: session.id, order: { status: "PAID", items: { some: { type: "EVENT" } } } },
    select: { id: true, orderId: true, order: { select: { refundStartedAt: true } } },
  });
  let started = 0;
  let already = 0;
  let failed = 0;
  for (const b of paid) {
    if (!b.orderId) continue;
    if (b.order?.refundStartedAt) {
      already++; // a refund was started before: do not ask Stripe again
      continue;
    }
    try {
      await input.refund({ orderId: b.orderId, bookingId: b.id });
      await db.order.updateMany({ where: { id: b.orderId, refundStartedAt: null }, data: { refundStartedAt: new Date() } });
      started++;
    } catch (error) {
      failed++;
      console.error("[event admin cancel] refund failed", b.id, error instanceof Error ? error.message : error);
    }
  }
  return { cancelledRegistrations: cancelled, refundsStarted: started, refundsAlreadyStarted: already, refundsFailed: failed };
}
