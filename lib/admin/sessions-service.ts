/**
 * Sessions admin service (task 12.9) and 1:1 slot hide/restore (task 12.10).
 * - Create (also "repeat weekly"), edit time / length / capacity / Zoom link, cancel, restore. There is NO delete.
 * - Cancel rule (owner answer Q7): only a session with 0 active bookings. "Active" = the booking engine's seat rule:
 *   the session row is locked (SELECT ... FOR UPDATE, same as a booking), old unpaid holds are released, then
 *   PENDING + CONFIRMED bookings are counted. A booking made at the same moment either gets in first (cancel is refused)
 *   or finds a cancelled session (booking is refused).
 * - A "hidden" 1:1 slot is a CANCELLED session: the booking engine only books SCHEDULED sessions, so a hidden slot cannot be booked.
 * - The Zoom link is private: it is never written to the audit log, never returned by list queries, never in an error message.
 * - Every change writes one audit row (names of changed fields, no values).
 * `db` is passed in, so the DB tests can use the test database.
 */
import { DEMO_ZOOM_URL } from "@/content/catalog";
import { lockSession, releaseExpiredHoldsForSession } from "@/lib/booking-service";
import { seatTaken } from "@/lib/catalog-queries";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { formatAdminDateTime } from "./format";
import { recordAdminAction, type AuditEntry } from "./audit";
import { slotZoomSchema } from "@/lib/slots-schema";
import { createSessionSchema, editSessionSchema, planSessions, SESSION_KIND_LABEL, type SessionKind } from "./sessions-schema";

type Db = Pick<PrismaClient, "classSession" | "offering" | "booking" | "adminAuditLog" | "$transaction">;

export type FieldErrors = Record<string, string[]>;
export type CreateResult = { ok: true; created: number; skipped: number; message: string } | { ok: false; message: string; fieldErrors?: FieldErrors };
export type EditResult = { ok: true; id: string; message: string; version: string } | { ok: false; message: string; fieldErrors?: FieldErrors };
export type CancelResult =
  | { ok: true; message: string; changed: boolean }
  | { ok: false; code: "NOT_FOUND" | "STARTED" | "HAS_BOOKINGS" | "TOO_LATE"; message: string; bookings?: number };

const SESSION_KINDS: SessionKind[] = ["GROUP_CLASS", "EVENT"];
const FIX = "Please fix the problems below.";

const flatten = (e: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }): FieldErrors =>
  Object.fromEntries(Object.entries(e.flatten().fieldErrors).filter(([, v]) => v && v.length > 0)) as FieldErrors;

const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

/**
 * One transaction. Audit rows are collected inside and written AFTER the commit: a failed audit write (for example a missing
 * table on a database that is not migrated yet) must not undo the change that already succeeded.
 */
async function runTx<T>(db: Db, fn: (tx: Prisma.TransactionClient, audit: (e: AuditEntry) => void) => Promise<T>): Promise<T> {
  const entries: AuditEntry[] = [];
  const result = await db.$transaction((tx) => fn(tx, (e) => entries.push(e)), TX_OPTIONS);
  for (const e of entries) await recordAdminAction(db, e);
  return result;
}

/** Number of seats a session holds right now: the booking engine's rule (old unpaid holds are released first). Call inside the locked transaction. */
async function activeBookings(tx: Prisma.TransactionClient, sessionId: string, now: Date): Promise<number> {
  await releaseExpiredHoldsForSession(tx, sessionId, now);
  return tx.booking.count({ where: { sessionId, status: { in: ["PENDING", "CONFIRMED"] } } });
}

export function blockedMessage(bookings: number): string {
  return `This session has ${bookings} booking${bookings === 1 ? "" : "s"}. Contact ${bookings === 1 ? "this client" : "these clients"} first. A session with bookings cannot be cancelled here.`;
}

// ---------- create ----------

export async function createSessions(db: Db, raw: Record<string, unknown>, adminId: string, now: Date = new Date()): Promise<CreateResult> {
  const parsed = createSessionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: FIX, fieldErrors: flatten(parsed.error) };
  const f = parsed.data;

  const offering = await db.offering.findUnique({ where: { id: f.offeringId }, select: { id: true, type: true, title: true, mode: true } });
  if (!offering || !SESSION_KINDS.includes(offering.type as SessionKind)) {
    return { ok: false, message: FIX, fieldErrors: { offeringId: ["Choose a class or an event. 1:1 times are added on the 1:1 slots page."] } };
  }
  const kind = offering.type as SessionKind;
  const errors: FieldErrors = {};
  if (offering.mode === "IN_PERSON" && f.zoomUrl) errors.zoomUrl = ["This is an in-person offering. It has no Zoom link."];
  if (kind === "EVENT" && f.repeatWeeks > 1) errors.repeatWeeks = ["An event has one date. Repeat is for classes."];

  const plan = planSessions(f);
  if (plan.length === 0) errors.repeatWeeks = ["Tick at least one date."];
  if (plan.some((p) => p.startsAt.getTime() <= now.getTime())) errors.date = ["This time is in the past. Choose a later date or time."];
  if (Object.keys(errors).length > 0) return { ok: false, message: FIX, fieldErrors: errors };

  const result = await db.$transaction(async (tx): Promise<{ created: number } | { error: FieldErrors }> => {
    if (kind === "EVENT") {
      // One date per event: the public pages show "the next session", the booking form needs one session. Lock the offering, then check.
      await tx.$queryRaw`SELECT "id" FROM "Offering" WHERE "id" = ${offering.id} FOR UPDATE`;
      const existing = await tx.classSession.count({ where: { offeringId: offering.id } });
      if (existing > 0) return { error: { offeringId: ["This event already has a date. Open its session in the list and edit it."] } };
    }
    const r = await tx.classSession.createMany({
      data: plan.map((p) => ({ offeringId: offering.id, startsAt: p.startsAt, endsAt: p.endsAt, capacity: f.capacity, zoomUrl: f.zoomUrl, location: null })),
      skipDuplicates: true,
    });
    return { created: r.count };
  });
  if ("error" in result) return { ok: false, message: FIX, fieldErrors: result.error };

  const skipped = plan.length - result.created;
  if (result.created > 0) {
    await recordAdminAction(db, {
      userId: adminId,
      action: "session.create",
      entity: "ClassSession",
      summary: `Added ${result.created} ${SESSION_KIND_LABEL[kind].toLowerCase()} session(s) of "${offering.title}", first: ${formatAdminDateTime(plan[0].startsAt)}, capacity ${f.capacity}${f.zoomUrl ? ", Zoom link set" : ""}${skipped ? `, ${skipped} already existed` : ""}`,
    });
  }
  const message = result.created === 0 ? "Nothing was added: all these times already exist." : `Added ${result.created} session${result.created === 1 ? "" : "s"}${skipped ? ` (${skipped} already existed)` : ""}.`;
  return { ok: true, created: result.created, skipped, message };
}

// ---------- edit ----------

export async function updateSession(db: Db, id: string, raw: Record<string, unknown>, adminId: string, now: Date = new Date()): Promise<EditResult> {
  const parsed = editSessionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: FIX, fieldErrors: flatten(parsed.error) };
  const f = parsed.data;
  const plan = planSessions({ date: f.date, time: f.time, minutes: f.minutes, repeatWeeks: 1, skip: [] })[0];

  return runTx(db, async (tx, audit): Promise<EditResult> => {
    await lockSession(tx, id);
    const cur = await tx.classSession.findUnique({ where: { id }, include: { offering: { select: { title: true, type: true, mode: true } } } });
    if (!cur || !SESSION_KINDS.includes(cur.offering.type as SessionKind)) return { ok: false, message: "This session was not found." };
    // Stale-form check: two tabs must not silently overwrite each other.
    if (f.version !== "" && f.version !== String(cur.updatedAt.getTime())) return { ok: false, message: "This session was changed by someone else. Reload the page and try again." };
    if (cur.status === "CANCELLED") return { ok: false, message: "This session is cancelled. Restore it first, then edit it." };
    if (cur.startsAt.getTime() <= now.getTime()) return { ok: false, message: "This session has started or is in the past. It cannot be changed." };

    const errors: FieldErrors = {};
    if (cur.offering.mode === "IN_PERSON" && f.zoomUrl) errors.zoomUrl = ["This is an in-person offering. It has no Zoom link."];
    const timeChanged = plan.startsAt.getTime() !== cur.startsAt.getTime() || plan.endsAt.getTime() !== cur.endsAt.getTime();
    if (timeChanged && plan.startsAt.getTime() <= now.getTime()) errors.date = ["This time is in the past. Choose a later date or time."];
    const booked = await activeBookings(tx, id, now);
    if (timeChanged && booked > 0) errors.date = [`${booked} ${booked === 1 ? "person has" : "people have"} booked this session. The time cannot be changed here. Contact them first.`];
    if (f.capacity < booked) errors.capacity = [`${booked} ${booked === 1 ? "seat is" : "seats are"} already taken. Capacity cannot be lower.`];
    if (timeChanged && !errors.date) {
      const clash = await tx.classSession.findFirst({ where: { offeringId: cur.offeringId, startsAt: plan.startsAt, NOT: { id } }, select: { id: true } });
      if (clash) errors.date = ["This class already has a session at this time."];
    }
    if (Object.keys(errors).length > 0) return { ok: false, message: FIX, fieldErrors: errors };

    const changed: string[] = [];
    if (timeChanged) changed.push(plan.startsAt.getTime() !== cur.startsAt.getTime() ? "time" : "length");
    if (f.capacity !== cur.capacity) changed.push("capacity");
    if ((f.zoomUrl ?? null) !== (cur.zoomUrl ?? null)) changed.push("Zoom link");
    const saved = await tx.classSession.update({
      where: { id },
      data: { startsAt: plan.startsAt, endsAt: plan.endsAt, capacity: f.capacity, zoomUrl: f.zoomUrl },
      select: { updatedAt: true },
    });
    audit({
      userId: adminId,
      action: "session.update",
      entity: "ClassSession",
      entityId: id,
      summary: `Edited session of "${cur.offering.title}" (${formatAdminDateTime(plan.startsAt)})${changed.length ? `: ${changed.join(", ")}` : ": no field changed"}`,
    });
    return { ok: true, id, message: "Saved.", version: String(saved.updatedAt.getTime()) };
  });
}

// ---------- 1:1 slot: private Zoom link ----------

/**
 * Set or clear the private Zoom link of ONE 1:1 slot (task 12.18). Empty = back to the placeholder (same as a new slot without a link).
 * The link is never put into the audit text or into a message. Only a future, online 1:1 slot can be changed.
 */
export async function updateSlotZoom(db: Db, id: string, raw: Record<string, unknown>, adminId: string, now: Date = new Date()): Promise<EditResult> {
  const parsed = slotZoomSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: FIX, fieldErrors: flatten(parsed.error) };
  const link = parsed.data.zoomUrl;
  return runTx(db, async (tx, audit): Promise<EditResult> => {
    await lockSession(tx, id);
    const cur = await tx.classSession.findUnique({ where: { id }, select: { zoomUrl: true, startsAt: true, updatedAt: true, offering: { select: { title: true, type: true, mode: true } } } });
    if (!cur || cur.offering.type !== "ONE_TO_ONE") return { ok: false, message: "This slot was not found." };
    if (cur.offering.mode !== "ONLINE") return { ok: false, message: FIX, fieldErrors: { zoomUrl: ["This is an in-person offering. It has no Zoom link."] } };
    if (cur.startsAt.getTime() <= now.getTime()) return { ok: false, message: "This slot has started or is in the past. It cannot be changed." };
    const next = link ?? DEMO_ZOOM_URL;
    if (next === cur.zoomUrl) return { ok: true, id, message: "No change.", version: String(cur.updatedAt.getTime()) };
    const saved = await tx.classSession.update({ where: { id }, data: { zoomUrl: next }, select: { updatedAt: true } });
    audit({
      userId: adminId,
      action: "slot.zoom",
      entity: "ClassSession",
      entityId: id,
      summary: `${link ? "Zoom link set" : "Zoom link cleared"} on 1:1 slot of "${cur.offering.title}" (${formatAdminDateTime(cur.startsAt)})`,
    });
    return { ok: true, id, message: link ? "Zoom link saved." : "Zoom link removed. The placeholder is used.", version: String(saved.updatedAt.getTime()) };
  });
}

// ---------- cancel / restore (sessions) and hide / restore (1:1 slots) ----------

type Label = "session" | "slot";

/** Cancel a session (or hide a 1:1 slot). Refused when it has active bookings, or has started. Safe to run twice. */
export async function cancelSession(db: Db, id: string, adminId: string, label: Label = "session", now: Date = new Date()): Promise<CancelResult> {
  return runTx(db, async (tx, audit): Promise<CancelResult> => {
    await lockSession(tx, id);
    const cur = await tx.classSession.findUnique({ where: { id }, select: { status: true, startsAt: true, offering: { select: { title: true } } } });
    if (!cur) return { ok: false, code: "NOT_FOUND", message: "This session was not found." };
    if (cur.status === "CANCELLED") return { ok: true, message: label === "slot" ? "This slot is already hidden." : "This session is already cancelled.", changed: false };
    if (cur.startsAt.getTime() <= now.getTime()) return { ok: false, code: "STARTED", message: "This session has started or is in the past. It cannot be cancelled." };
    const booked = await activeBookings(tx, id, now);
    if (booked > 0) return { ok: false, code: "HAS_BOOKINGS", bookings: booked, message: blockedMessage(booked) };
    await tx.classSession.update({ where: { id }, data: { status: "CANCELLED" } });
    audit({
      userId: adminId,
      action: label === "slot" ? "slot.hide" : "session.cancel",
      entity: "ClassSession",
      entityId: id,
      summary: `${label === "slot" ? "Hid slot" : "Cancelled session"} of "${cur.offering.title}" (${formatAdminDateTime(cur.startsAt)})`,
    });
    return { ok: true, message: label === "slot" ? "Hidden. Nobody can book this slot now." : "Cancelled. It is off the site.", changed: true };
  });
}

/** Bring a cancelled / hidden session back. Only for a future session. Safe to run twice. */
export async function restoreSession(db: Db, id: string, adminId: string, label: Label = "session", now: Date = new Date()): Promise<CancelResult> {
  return runTx(db, async (tx, audit): Promise<CancelResult> => {
    await lockSession(tx, id);
    const cur = await tx.classSession.findUnique({ where: { id }, select: { status: true, startsAt: true, offering: { select: { title: true } } } });
    if (!cur) return { ok: false, code: "NOT_FOUND", message: "This session was not found." };
    if (cur.status === "SCHEDULED") return { ok: true, message: "It is already on the site.", changed: false };
    if (cur.startsAt.getTime() <= now.getTime()) return { ok: false, code: "TOO_LATE", message: "This time is in the past. It cannot be restored." };
    await tx.classSession.update({ where: { id }, data: { status: "SCHEDULED" } });
    audit({
      userId: adminId,
      action: label === "slot" ? "slot.restore" : "session.restore",
      entity: "ClassSession",
      entityId: id,
      summary: `Restored ${label} of "${cur.offering.title}" (${formatAdminDateTime(cur.startsAt)})`,
    });
    return { ok: true, message: label === "slot" ? "Restored. The slot can be booked again." : "Restored. It is on the site again.", changed: true };
  });
}

// ---------- reads for the screens ----------

export type SessionRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  status: "SCHEDULED" | "CANCELLED";
  booked: number;
  hasZoom: boolean;
  offeringId: string;
  title: string;
  kind: SessionKind;
  online: boolean;
};

export const SESSIONS_PAGE_SIZE = 25;

type SessionListOpts = { offeringId?: string; when?: "upcoming" | "past"; status?: "SCHEDULED" | "CANCELLED"; now?: Date; page?: number };
const sessionWhere = (opts: SessionListOpts, now: Date) => ({
  offering: { type: { in: SESSION_KINDS }, ...(opts.offeringId ? { id: opts.offeringId } : {}) },
  endsAt: opts.when === "past" ? { lte: now } : { gt: now },
  ...(opts.status ? { status: opts.status } : {}),
});

/** Number of sessions for the same filter (for "Page 2 of 7"). Pass the same `now` as for the list. */
export async function countSessions(db: Pick<PrismaClient, "classSession">, opts: SessionListOpts = {}) {
  return db.classSession.count({ where: sessionWhere(opts, opts.now ?? new Date()) });
}

/**
 * List for /admin/sessions, one page at a time (SESSIONS_PAGE_SIZE rows, page 1 = first). Nothing is cut.
 * Order: by start time (upcoming: soonest first, past: latest first), id as tie-break, so pages never overlap.
 * The Zoom link itself is never returned: only "set or not".
 */
export async function listSessions(db: Pick<PrismaClient, "classSession">, opts: SessionListOpts = {}): Promise<SessionRow[]> {
  const now = opts.now ?? new Date();
  const past = opts.when === "past";
  const page = Math.max(1, Math.trunc(opts.page ?? 1) || 1);
  const rows = await db.classSession.findMany({
    where: sessionWhere(opts, now),
    orderBy: [{ startsAt: past ? "desc" : "asc" }, { id: "asc" }],
    skip: (page - 1) * SESSIONS_PAGE_SIZE,
    take: SESSIONS_PAGE_SIZE,
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      status: true,
      zoomUrl: true,
      offering: { select: { id: true, title: true, type: true, mode: true } },
      _count: { select: { bookings: { where: seatTaken(now) } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    capacity: r.capacity,
    status: r.status === "CANCELLED" ? "CANCELLED" : "SCHEDULED",
    booked: r._count.bookings,
    hasZoom: r.zoomUrl !== null && r.zoomUrl !== "",
    offeringId: r.offering.id,
    title: r.offering.title,
    kind: r.offering.type as SessionKind,
    online: r.offering.mode === "ONLINE",
  }));
}

/** Class and event offerings for the select boxes. */
export async function listSessionOfferings(db: Pick<PrismaClient, "offering">) {
  return db.offering.findMany({
    where: { type: { in: SESSION_KINDS } },
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { title: "asc" }],
    select: { id: true, title: true, type: true, mode: true, minutes: true, published: true, _count: { select: { sessions: true } } },
  });
}

/** One session for the edit page. This is the only read that returns the Zoom link: it goes into the admin's own form field. */
export async function getSessionForEdit(db: Pick<PrismaClient, "classSession">, id: string) {
  return db.classSession.findUnique({
    where: { id },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      status: true,
      zoomUrl: true,
      updatedAt: true,
      offering: { select: { id: true, title: true, type: true, mode: true, published: true } },
    },
  });
}

/** Clients who hold a seat (shown to the admin when cancel is blocked, so they can be contacted). Admin screen only. */
export async function listSeatHolders(db: Pick<PrismaClient, "booking">, sessionId: string, now: Date = new Date()) {
  const rows = await db.booking.findMany({
    where: { sessionId, ...seatTaken(now) },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, status: true, user: { select: { name: true, email: true } } },
  });
  return rows.map((b) => ({ id: b.id, status: b.status, name: b.user.name ?? "", email: b.user.email }));
}
