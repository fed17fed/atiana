/**
 * Booking engine for group classes and 1:1 slots (one engine, see schema.prisma).
 * Safety against double booking:
 *  1. Every booking runs in a transaction that first locks the ClassSession row (SELECT ... FOR UPDATE),
 *     then counts the active seats. Two parallel requests are handled one after the other.
 *  2. Database unique keys on Booking (userKey, slotKey) are a second safety net.
 * Stripe only marks orders PAID in the webhook (lib/stripe-service.ts).
 */
import { Prisma, type PrismaClient } from "./generated/prisma/client";
import type { OfferingType } from "./generated/prisma/enums";
import {
  bookingKeys,
  canCancel,
  holdCutoff,
  isRefundable,
  pickCreditGrant,
  spotsLeft,
} from "./booking-rules";

export type Db = PrismaClient | Prisma.TransactionClient;

export type BookingErrorCode =
  | "NOT_FOUND" // session does not exist, is cancelled, or the offering is not published
  | "PAST" // the class already started
  | "FULL"
  | "ALREADY_BOOKED"
  | "NO_CREDIT"
  | "NO_PRICE"
  | "DISCLAIMER"
  | "TYPE_MISMATCH";

export type CreateBookingResult =
  | {
      ok: true;
      bookingId: string;
      status: "CONFIRMED" | "PENDING";
      orderId: string | null;
      amountCents: number;
      description: string;
      sessionId: string;
    }
  | { ok: false; code: BookingErrorCode };

export type CreateBookingInput = {
  userId: string;
  sessionId: string;
  /** CREDIT = book now with a credit. STRIPE = keep a seat (PENDING) and create an unpaid order. */
  method: "CREDIT" | "STRIPE";
  disclaimerAccepted: boolean;
  /** Only allow this offering type (group page vs 1:1 page). */
  expectType?: OfferingType;
  now?: Date;
};

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

export async function lockSession(tx: Prisma.TransactionClient, sessionId: string) {
  await tx.$queryRaw`SELECT "id" FROM "ClassSession" WHERE "id" = ${sessionId} FOR UPDATE`;
}

/** Cancels unpaid holds in one session that are older than the hold time (frees the unique keys). */
export async function releaseExpiredHoldsForSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
  now: Date,
) {
  return tx.booking.updateMany({
    where: { sessionId, status: "PENDING", paidWith: "STRIPE", createdAt: { lt: holdCutoff(now) } },
    data: { status: "CANCELLED", userKey: null, slotKey: null },
  });
}

export async function createBooking(db: PrismaClient, input: CreateBookingInput): Promise<CreateBookingResult> {
  const now = input.now ?? new Date();
  if (!input.disclaimerAccepted) return { ok: false, code: "DISCLAIMER" };

  try {
    return await db.$transaction(async (tx): Promise<CreateBookingResult> => {
      await lockSession(tx, input.sessionId);

      const session = await tx.classSession.findUnique({
        where: { id: input.sessionId },
        include: { offering: { include: { priceOptions: { orderBy: { amountCents: "asc" } } } } },
      });
      if (!session || session.status !== "SCHEDULED" || !session.offering.published) {
        return { ok: false, code: "NOT_FOUND" };
      }
      if (input.expectType && session.offering.type !== input.expectType) {
        return { ok: false, code: "TYPE_MISMATCH" };
      }
      if (session.startsAt.getTime() <= now.getTime()) return { ok: false, code: "PAST" };

      await releaseExpiredHoldsForSession(tx, session.id, now);

      const mine = await tx.booking.findFirst({
        where: { sessionId: session.id, userId: input.userId, status: { in: ["PENDING", "CONFIRMED"] } },
        select: { id: true },
      });
      if (mine) return { ok: false, code: "ALREADY_BOOKED" };

      const active = await tx.booking.count({
        where: { sessionId: session.id, status: { in: ["PENDING", "CONFIRMED"] } },
      });
      if (spotsLeft(session.capacity, active) <= 0) return { ok: false, code: "FULL" };

      const keys = bookingKeys({ sessionId: session.id, userId: input.userId, capacity: session.capacity });
      const description = `${session.offering.title}`;

      if (input.method === "CREDIT") {
        const grants = await tx.creditGrant.findMany({
          where: { userId: input.userId, creditsLeft: { gt: 0 } },
        });
        const grant = pickCreditGrant(grants, session.offering.type, now);
        if (!grant) return { ok: false, code: "NO_CREDIT" };
        // Atomic: only succeeds while a credit is left (protects against two parallel uses).
        const used = await tx.creditGrant.updateMany({
          where: { id: grant.id, creditsLeft: { gt: 0 } },
          data: { creditsLeft: { decrement: 1 } },
        });
        if (used.count !== 1) return { ok: false, code: "NO_CREDIT" };
        const booking = await tx.booking.create({
          data: {
            userId: input.userId,
            sessionId: session.id,
            status: "CONFIRMED",
            paidWith: "CREDIT",
            creditGrantId: grant.id,
            disclaimerAcceptedAt: now,
            ...keys,
          },
        });
        return {
          ok: true,
          bookingId: booking.id,
          status: "CONFIRMED",
          orderId: null,
          amountCents: 0,
          description,
          sessionId: session.id,
        };
      }

      const price = session.offering.priceOptions[0];
      if (!price) return { ok: false, code: "NO_PRICE" };
      const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId }, select: { email: true } });
      const itemType = session.offering.type === "ONE_TO_ONE" ? "ONE_TO_ONE" : "CLASS";
      const order = await tx.order.create({
        data: {
          userId: input.userId,
          email: user.email,
          status: "PENDING",
          currency: price.currency,
          subtotalCents: price.amountCents,
          totalCents: price.amountCents,
          items: {
            create: [
              {
                type: itemType,
                description,
                quantity: 1,
                unitPriceCents: price.amountCents,
                totalCents: price.amountCents,
                refId: session.id,
              },
            ],
          },
        },
      });
      const booking = await tx.booking.create({
        data: {
          userId: input.userId,
          sessionId: session.id,
          status: "PENDING",
          paidWith: "STRIPE",
          disclaimerAcceptedAt: now,
          orderId: order.id,
          ...keys,
        },
      });
      return {
        ok: true,
        bookingId: booking.id,
        status: "PENDING",
        orderId: order.id,
        amountCents: price.amountCents,
        description,
        sessionId: session.id,
      };
    }, TX_OPTIONS);
  } catch (error) {
    // Safety net: the database refused a second active booking.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const text = JSON.stringify(error.meta ?? {}) + error.message;
      return { ok: false, code: /userKey/.test(text) ? "ALREADY_BOOKED" : "FULL" };
    }
    throw error;
  }
}

export type CancelBookingResult =
  | {
      ok: true;
      creditReturned: boolean;
      paidWith: "STRIPE" | "CREDIT" | "FREE" | null;
      /** True when the cancellation was early enough (24 h rule). */
      early: boolean;
    }
  | { ok: false; code: "NOT_FOUND" | "NOT_ACTIVE" | "PAST" };

/** Cancels a booking of this user. The credit comes back only if it is early enough. */
export async function cancelBooking(
  db: PrismaClient,
  input: { userId: string; bookingId: string; now?: Date },
): Promise<CancelBookingResult> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx): Promise<CancelBookingResult> => {
    // userId in the filter: a user can never cancel somebody else's booking.
    const booking = await tx.booking.findFirst({
      where: { id: input.bookingId, userId: input.userId },
      include: { session: true },
    });
    if (!booking) return { ok: false, code: "NOT_FOUND" };
    if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
      return { ok: false, code: "NOT_ACTIVE" };
    }
    if (!canCancel(booking.session.startsAt, now)) return { ok: false, code: "PAST" };

    // Gate: only one of two parallel cancel requests can change the status.
    const changed = await tx.booking.updateMany({
      where: { id: booking.id, status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED", userKey: null, slotKey: null },
    });
    if (changed.count !== 1) return { ok: false, code: "NOT_ACTIVE" };

    const early = isRefundable(booking.session.startsAt, now);
    let creditReturned = false;
    if (booking.paidWith === "CREDIT" && booking.creditGrantId && early) {
      const grant = await tx.creditGrant.findUnique({ where: { id: booking.creditGrantId } });
      // An expired credit is not given back.
      if (grant && (!grant.expiresAt || grant.expiresAt.getTime() > now.getTime())) {
        const back = await tx.creditGrant.updateMany({
          where: { id: grant.id, creditsLeft: { lt: grant.creditsTotal } },
          data: { creditsLeft: { increment: 1 } },
        });
        creditReturned = back.count === 1;
      }
    }
    if (booking.status === "PENDING" && booking.orderId) {
      await tx.order.updateMany({
        where: { id: booking.orderId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    }
    return { ok: true, creditReturned, paidWith: booking.paidWith, early };
  }, TX_OPTIONS);
}

/** Cancels unpaid Stripe holds older than the hold time and their unpaid orders. Safe to run many times. */
export async function releaseUnpaidHolds(db: PrismaClient, now: Date = new Date()) {
  const stale = await db.booking.findMany({
    where: { status: "PENDING", paidWith: "STRIPE", createdAt: { lt: holdCutoff(now) } },
    select: { id: true, orderId: true },
  });
  let released = 0;
  for (const b of stale) {
    await db.$transaction(async (tx) => {
      const r = await tx.booking.updateMany({
        where: { id: b.id, status: "PENDING" },
        data: { status: "CANCELLED", userKey: null, slotKey: null },
      });
      if (r.count === 1) {
        released += 1;
        if (b.orderId) {
          await tx.order.updateMany({ where: { id: b.orderId, status: "PENDING" }, data: { status: "CANCELLED" } });
        }
      }
    });
  }
  return released;
}

/** Removes unused credits of expired grants (one atomic statement). Returns the number of grants changed. */
export async function expireCredits(db: PrismaClient, now: Date = new Date()) {
  return db.$executeRaw`
    UPDATE "CreditGrant"
    SET "creditsExpired" = "creditsLeft", "creditsLeft" = 0, "expiredAt" = ${now}
    WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= ${now} AND "expiredAt" IS NULL AND "creditsLeft" > 0`;
}
