import { holdCutoff } from "./booking-rules";
/** Queries for /account. EVERY query filters by userId: a user sees only their own data. */
import type { PrismaClient } from "./generated/prisma/client";

export async function getMyBookings(db: PrismaClient, userId: string) {
  const rows = await db.booking.findMany({
    where: { userId },
    orderBy: { session: { startsAt: "desc" } },
    include: { session: { include: { offering: true } }, creditGrant: { select: { expiresAt: true, expiredAt: true } }, order: { select: { status: true, items: { select: { type: true, totalCents: true } } } } },
  });
  const now = new Date();
  return rows.map((b) => ({
    id: b.id,
    status: b.status,
    paidWith: b.paidWith,
    startsAt: b.session.startsAt,
    endsAt: b.session.endsAt,
    title: b.session.offering.title,
    type: b.session.offering.type,
    mode: b.session.offering.mode,
    // The Zoom link is only handed out for CONFIRMED bookings.
    zoomUrl: b.status === "CONFIRMED" ? b.session.zoomUrl : null,
    location: b.status === "CONFIRMED" ? (b.session.location ?? b.session.offering.location) : null,
    createdAt: b.createdAt,
    /** Unpaid card hold older than the hold time: the seat is already free, the payment never finished. */
    staleHold: b.status === "PENDING" && b.paidWith === "STRIPE" && b.createdAt < holdCutoff(now),
    sessionCancelled: b.session.status === "CANCELLED",
    eventPricing: b.session.offering.eventPricing,
    eventSlug: b.session.offering.slug,
    /** A donation was paid (it is never refunded). */
    donationPaid: b.order?.status === "PAID" && b.order.items.some((i) => i.type === "DONATION"),
    ticketPaid: b.order?.status === "PAID" && b.order.items.some((i) => i.type === "EVENT"),
    orderStatus: b.order?.status ?? null,
    /** True when the credit used for this booking has expired (it cannot be returned on cancel). */
    creditExpired:
      b.paidWith === "CREDIT" &&
      !!b.creditGrant &&
      (b.creditGrant.expiredAt !== null || (b.creditGrant.expiresAt !== null && b.creditGrant.expiresAt <= now)),
  }));
}

export async function getMyCredits(db: PrismaClient, userId: string) {
  return db.creditGrant.findMany({
    where: { userId },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
    include: { package: { select: { name: true } } },
  });
}

export async function getMyOrders(db: PrismaClient, userId: string) {
  return db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
}
