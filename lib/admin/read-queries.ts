/**
 * Read-only lists for the admin (task 12.14): bookings, orders, subscribers, referrals, contact messages.
 * Search is by e-mail only. Newest first, 25 per page. Nothing here changes data. `db` is passed in (tests use the test database).
 */
import type { PrismaClient } from "@/lib/generated/prisma/client";

export const PAGE_SIZE = 25;
export const MAX_QUERY_LENGTH = 120;

// NUL and the other control characters (U+0000-U+001F, U+007F-U+009F). Postgres refuses a NUL byte in text, which made the page say
// "database not available" (N19-1). They are removed from every admin search / filter value, in this one place.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

/** Any admin address parameter (search text, filter id): first value, control characters removed, trimmed, cut to `max`, empty -> null. */
export function cleanParam(raw: unknown, max: number = MAX_QUERY_LENGTH): string | null {
  const v = (Array.isArray(raw) ? raw[0] : raw) as unknown;
  if (typeof v !== "string") return null;
  const t = v.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return t === "" ? null : t;
}

/** Admin search box: control characters removed, trimmed, max 120 chars, empty -> null. */
export function cleanQuery(raw: unknown): string | null {
  return cleanParam(raw, MAX_QUERY_LENGTH);
}

/** Page number from the address: whole number >= 1 (junk -> 1). */
export function cleanPage(raw: unknown): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const n = typeof v === "string" && /^\d{1,6}$/.test(v) ? Number(v) : 1;
  return n >= 1 ? n : 1;
}

/** In a LIKE pattern, "%" and "_" are wildcards. A searched e-mail like "a_b@x.com" must not match "aXb@x.com". */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const emailContains = (q: string | null) => (q ? { contains: escapeLike(q), mode: "insensitive" as const } : undefined);
const paging = (page: number) => ({ skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });

type Db = PrismaClient;
export type ListArgs = { q: string | null; page: number };

export async function listBookings(db: Db, { q, page }: ListArgs) {
  const where = q ? { user: { email: emailContains(q) } } : {};
  const [rows, total] = await Promise.all([
    db.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...paging(page),
      select: {
        id: true,
        status: true,
        paidWith: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        session: { select: { startsAt: true, offering: { select: { title: true } } } },
      },
    }),
    db.booking.count({ where }),
  ]);
  return { rows, total };
}

export async function listOrders(db: Db, { q, page }: ListArgs) {
  const where = q ? { email: emailContains(q) } : {};
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...paging(page),
      select: { id: true, email: true, status: true, currency: true, totalCents: true, paidAt: true, createdAt: true, items: { select: { description: true, quantity: true }, take: 3 } },
    }),
    db.order.count({ where }),
  ]);
  return { rows, total };
}

export async function listSubscribers(db: Db, { q, page }: ListArgs) {
  const where = q ? { email: emailContains(q) } : {};
  const [rows, total] = await Promise.all([
    db.newsletterSubscriber.findMany({ where, orderBy: { createdAt: "desc" }, ...paging(page), select: { id: true, email: true, status: true, source: true, consentAt: true, createdAt: true } }),
    db.newsletterSubscriber.count({ where }),
  ]);
  return { rows, total };
}

/** For the CSV file: same filter, no paging, but never more than EXPORT_MAX rows. Never exports the confirm token. */
export const EXPORT_MAX = 50_000;
export async function exportSubscribers(db: Db, q: string | null) {
  return db.newsletterSubscriber.findMany({
    where: q ? { email: emailContains(q) } : {},
    orderBy: { createdAt: "desc" },
    take: EXPORT_MAX,
    select: { email: true, status: true, source: true, consentAt: true, createdAt: true },
  });
}

export async function listReferrals(db: Db, { q, page }: ListArgs) {
  const where = q ? { OR: [{ referrer: { email: emailContains(q) } }, { referredUser: { email: emailContains(q) } }] } : {};
  const [rows, total] = await Promise.all([
    db.referral.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...paging(page),
      select: { id: true, status: true, createdAt: true, rewardCreditGrantId: true, referrer: { select: { email: true } }, referredUser: { select: { email: true } } },
    }),
    db.referral.count({ where }),
  ]);
  return { rows, total };
}

export async function listMessages(db: Db, { q, page }: ListArgs) {
  const where = q ? { email: emailContains(q) } : {};
  const [rows, total, unread] = await Promise.all([
    db.contactMessage.findMany({ where, orderBy: { createdAt: "desc" }, ...paging(page), select: { id: true, name: true, email: true, message: true, createdAt: true, readAt: true } }),
    db.contactMessage.count({ where }),
    db.contactMessage.count({ where: { readAt: null } }),
  ]);
  return { rows, total, unread };
}

/**
 * For the bookings CSV (task 12.7): same filter as the list, no paging, never more than EXPORT_MAX rows.
 * Only what an admin needs. NOT selected on purpose: Zoom link, payment ids, credit ids, tokens, the unique keys.
 */
export async function exportBookings(db: Db, q: string | null) {
  return db.booking.findMany({
    where: q ? { user: { email: emailContains(q) } } : {},
    orderBy: { createdAt: "desc" },
    take: EXPORT_MAX,
    select: {
      createdAt: true,
      status: true,
      paidWith: true,
      user: { select: { name: true, email: true } },
      session: { select: { startsAt: true, offering: { select: { title: true } } } },
    },
  });
}
