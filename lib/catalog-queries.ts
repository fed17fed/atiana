/** Read queries for the public pages (classes, schedule, 1:1). */
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import type { Mode } from "./generated/prisma/enums";
import { holdCutoff, spotsLeft } from "./booking-rules";
import { weekRange } from "./time";

export type ScheduleItem = {
  id: string;
  startsAt: string; // ISO (UTC)
  endsAt: string;
  title: string;
  slug: string;
  mode: Mode;
  location: string | null;
  minutes: number;
  priceCents: number | null;
  capacity: number;
  spotsLeft: number;
};

/**
 * A booking takes a seat when it is CONFIRMED, or PENDING (unpaid card hold) and younger than the hold time.
 * Same rule as the booking engine (releaseExpiredHoldsForSession), so the pages never show "Full" for an old hold.
 */
export function seatTaken(now: Date): Prisma.BookingWhereInput {
  return { OR: [{ status: "CONFIRMED" }, { status: "PENDING", createdAt: { gte: holdCutoff(now) } }] };
}

function toItem(s: {
  id: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  location: string | null;
  offering: { title: string; slug: string; mode: Mode; location: string | null; priceOptions: { amountCents: number }[] };
  _count: { bookings: number };
}): ScheduleItem {
  return {
    id: s.id,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    title: s.offering.title,
    slug: s.offering.slug,
    mode: s.offering.mode,
    location: s.location ?? s.offering.location,
    minutes: Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000),
    priceCents: s.offering.priceOptions[0]?.amountCents ?? null,
    capacity: s.capacity,
    spotsLeft: spotsLeft(s.capacity, s._count.bookings),
  };
}

const sessionInclude = (now: Date) =>
  ({
    offering: { include: { priceOptions: { orderBy: { amountCents: "asc" }, take: 1 } } },
    _count: { select: { bookings: { where: seatTaken(now) } } },
  }) satisfies Prisma.ClassSessionInclude;

/** Group classes of one Dublin week (weekOffset 0 = this week). Past sessions are hidden. */
export async function getScheduleWeek(
  db: PrismaClient,
  opts: { weekOffset: number; classSlug?: string; now?: Date },
) {
  const now = opts.now ?? new Date();
  const { start, end } = weekRange(now, opts.weekOffset);
  const rows = await db.classSession.findMany({
    where: {
      status: "SCHEDULED",
      startsAt: { gt: now, gte: start, lt: end },
      offering: { type: "GROUP_CLASS", published: true, ...(opts.classSlug ? { slug: opts.classSlug } : {}) },
    },
    orderBy: { startsAt: "asc" },
    include: sessionInclude(now),
  });
  return { start, end, items: rows.map(toItem) };
}

/** Is there any later group class after this week? (for the "Show next week" button) */
export async function hasSessionsAfter(db: PrismaClient, after: Date) {
  const n = await db.classSession.count({
    where: { status: "SCHEDULED", startsAt: { gte: after }, offering: { type: "GROUP_CLASS", published: true } },
  });
  return n > 0;
}

export async function getBookableSession(db: PrismaClient, sessionId: string, now = new Date()) {
  const row = await db.classSession.findFirst({
    where: { id: sessionId, status: "SCHEDULED", startsAt: { gt: now }, offering: { published: true } },
    include: sessionInclude(now),
  });
  if (!row) return null;
  return { item: toItem(row), type: row.offering.type };
}

/** Free 1:1 slots (capacity 1, nobody holds them), optionally for one format. */
export async function getOneToOneSlots(db: PrismaClient, opts: { mode?: Mode; now?: Date; limit?: number }) {
  const now = opts.now ?? new Date();
  const rows = await db.classSession.findMany({
    where: {
      status: "SCHEDULED",
      startsAt: { gt: now },
      offering: { type: "ONE_TO_ONE", published: true, ...(opts.mode ? { mode: opts.mode } : {}) },
      bookings: { none: seatTaken(now) },
    },
    orderBy: { startsAt: "asc" },
    take: opts.limit ?? 200,
    include: sessionInclude(now),
  });
  return rows.map(toItem);
}

export async function getActivePackages(db: PrismaClient, type: "GROUP_CLASS" | "ONE_TO_ONE" = "GROUP_CLASS") {
  return db.package.findMany({ where: { active: true, appliesTo: { has: type } }, orderBy: { priceCents: "asc" } });
}

/** Sessions (of the given ids) that this user already holds a seat in. */
export async function getUserActiveSessionIds(db: PrismaClient, userId: string, sessionIds: string[]) {
  if (sessionIds.length === 0) return new Set<string>();
  const rows = await db.booking.findMany({
    where: { userId, sessionId: { in: sessionIds }, ...seatTaken(new Date()) },
    select: { sessionId: true },
  });
  return new Set(rows.map((r) => r.sessionId));
}

/** Credits that the user can use now for an offering type (sum of creditsLeft of valid grants). */
export async function countUsableCredits(
  db: PrismaClient,
  userId: string,
  type: "GROUP_CLASS" | "ONE_TO_ONE",
  now = new Date(),
) {
  const grants = await db.creditGrant.findMany({
    where: {
      userId,
      creditsLeft: { gt: 0 },
      appliesTo: { has: type },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { creditsLeft: true },
  });
  return grants.reduce((n, g) => n + g.creditsLeft, 0);
}
