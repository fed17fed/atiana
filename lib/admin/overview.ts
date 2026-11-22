/** Data for the admin overview (wireframe A2): only what exists today (sessions, bookings, messages). */
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { seatTaken } from "@/lib/catalog-queries";

const DAY_MS = 24 * 60 * 60 * 1000;
export const OVERVIEW_DAYS = 7;

export async function getNextSessions(db: PrismaClient, now = new Date()) {
  const rows = await db.classSession.findMany({
    where: { status: "SCHEDULED", startsAt: { gt: now, lte: new Date(now.getTime() + OVERVIEW_DAYS * DAY_MS) } },
    orderBy: { startsAt: "asc" },
    take: 8,
    select: {
      id: true,
      startsAt: true,
      capacity: true,
      offering: { select: { title: true } },
      _count: { select: { bookings: { where: seatTaken(now) } } },
    },
  });
  return rows.map((r) => ({ id: r.id, startsAt: r.startsAt, title: r.offering.title, booked: r._count.bookings, capacity: r.capacity }));
}

export async function getNewBookings(db: PrismaClient, now = new Date()) {
  const where = { createdAt: { gte: new Date(now.getTime() - OVERVIEW_DAYS * DAY_MS) }, status: { in: ["CONFIRMED", "ATTENDED"] as ("CONFIRMED" | "ATTENDED")[] } };
  const [count, latest] = await Promise.all([
    db.booking.count({ where }),
    db.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, createdAt: true, session: { select: { startsAt: true, offering: { select: { title: true } } } } },
    }),
  ]);
  return { count, latest: latest.map((b) => ({ id: b.id, createdAt: b.createdAt, title: b.session.offering.title, startsAt: b.session.startsAt })) };
}

/** Unread messages (readAt is empty), of any age: an old unread message still needs an answer. */
export async function getNewMessages(db: PrismaClient) {
  const where = { readAt: null };
  const [count, latest] = await Promise.all([
    db.contactMessage.count({ where }),
    db.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, name: true, createdAt: true } }),
  ]);
  return { count, latest };
}
