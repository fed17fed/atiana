/** Read queries for the event pages. Spots use the shared "seat taken" rule (fresh holds only). */
import type { PrismaClient } from "./generated/prisma/client";
import type { EventPricing, Mode } from "./generated/prisma/enums";
import { spotsLeft } from "./booking-rules";
import { seatTaken } from "./catalog-queries";

export type EventItem = {
  sessionId: string;
  slug: string;
  title: string;
  pricing: EventPricing;
  mode: Mode;
  startsAt: string;
  endsAt: string;
  location: string | null;
  image: string | null;
  priceCents: number | null;
  capacity: number;
  spotsLeft: number;
  cancelled: boolean;
  started: boolean;
};

const include = (now: Date) =>
  ({
    offering: { include: { priceOptions: { orderBy: { amountCents: "asc" }, take: 1 } } },
    _count: { select: { bookings: { where: seatTaken(now) } } },
  }) as const;

type Row = Awaited<ReturnType<PrismaClient["classSession"]["findFirstOrThrow"]>> & {
  offering: { slug: string; title: string; eventPricing: EventPricing | null; mode: Mode; location: string | null; image: string | null; priceOptions: { amountCents: number }[] };
  _count: { bookings: number };
};

function toItem(s: Row, now: Date): EventItem {
  return {
    sessionId: s.id,
    slug: s.offering.slug,
    title: s.offering.title,
    pricing: s.offering.eventPricing ?? "FREE",
    mode: s.offering.mode,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    location: s.location ?? s.offering.location,
    image: s.offering.image,
    priceCents: s.offering.priceOptions[0]?.amountCents ?? null,
    capacity: s.capacity,
    spotsLeft: spotsLeft(s.capacity, s._count.bookings),
    cancelled: s.status === "CANCELLED",
    started: s.startsAt.getTime() <= now.getTime(),
  };
}

export async function getUpcomingEvents(db: PrismaClient, opts: { pricing?: EventPricing; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const rows = await db.classSession.findMany({
    where: {
      status: "SCHEDULED",
      startsAt: { gt: now },
      offering: { type: "EVENT", published: true, ...(opts.pricing ? { eventPricing: opts.pricing } : {}) },
    },
    orderBy: { startsAt: "asc" },
    include: include(now),
  });
  return rows.map((r) => toItem(r as unknown as Row, now));
}

export async function getEventBySlug(db: PrismaClient, slug: string, now = new Date()) {
  const row = await db.classSession.findFirst({
    where: { offering: { slug, type: "EVENT", published: true } },
    orderBy: { startsAt: "desc" },
    include: include(now),
  });
  return row ? toItem(row as unknown as Row, now) : null;
}

/** The logged-in user's active registration for one event (Zoom link / place only when CONFIRMED). */
export async function getMyEventRegistration(db: PrismaClient, userId: string, sessionId: string) {
  const b = await db.booking.findFirst({
    where: { userId, sessionId, status: { in: ["PENDING", "CONFIRMED"] } },
    include: { session: true, order: { include: { items: true } } },
  });
  if (!b) return null;
  const donation = b.order?.items.find((i) => i.type === "DONATION");
  return {
    bookingId: b.id,
    status: b.status as "PENDING" | "CONFIRMED",
    paidWith: b.paidWith,
    donationCents: donation && b.order?.status === "PAID" ? donation.totalCents : 0,
    ticketPaid: b.order?.status === "PAID" && b.order.items.some((i) => i.type === "EVENT"),
    zoomUrl: b.status === "CONFIRMED" ? b.session.zoomUrl : null,
  };
}
