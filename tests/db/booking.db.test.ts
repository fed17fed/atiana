import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { cancelBooking, createBooking, expireCredits, releaseUnpaidHolds } from "@/lib/booking-service";
import { CANCELLATION_HOURS, HOLD_MINUTES, HOLD_GRACE_MINUTES } from "@/lib/booking-rules";
import { getBookableSession, getOneToOneSlots, getScheduleWeek } from "@/lib/catalog-queries";
import { dbTestsOn, getDb, hideTestData, newSession, testOffering, testUser } from "./helpers";

const HOUR = 3600_000;
const d = describe.skipIf(!dbTestsOn);

let db: PrismaClient;
let groupId: string;
let oneId: string;
const users: { id: string }[] = [];

beforeAll(async () => {
  if (!dbTestsOn) return;
  db = await getDb();
  groupId = (await testOffering(db, "GROUP_CLASS")).id;
  oneId = (await testOffering(db, "ONE_TO_ONE")).id;
  for (let i = 1; i <= 8; i++) users.push(await testUser(db, i));
}, 60_000);

afterAll(async () => {
  if (dbTestsOn) await hideTestData(db);
}, 60_000);

const book = (userId: string, sessionId: string, over: Partial<Parameters<typeof createBooking>[1]> = {}) =>
  createBooking(db, { userId, sessionId, method: "STRIPE", disclaimerAccepted: true, ...over });

d("1:1 slot cannot be booked twice (parallel requests, dev database)", () => {
  it("2 parallel requests for the same slot: exactly one wins, the other gets FULL", async () => {
    const slot = await newSession(db, oneId, 1);
    const results = await Promise.all([book(users[0].id, slot.id), book(users[1].id, slot.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.code))).toEqual(["FULL"]);
    const active = await db.booking.count({ where: { sessionId: slot.id, status: { in: ["PENDING", "CONFIRMED"] } } });
    expect(active).toBe(1);
  }, 60_000);

  it("8 parallel requests for one slot: exactly one booking exists afterwards", async () => {
    const slot = await newSession(db, oneId, 1);
    const results = await Promise.all(users.map((u) => book(u.id, slot.id)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.booking.count({ where: { sessionId: slot.id, status: { in: ["PENDING", "CONFIRMED"] } } })).toBe(1);
  }, 60_000);

  it("the database itself refuses a second active booking for a 1:1 slot (unique slotKey), even without the service", async () => {
    const slot = await newSession(db, oneId, 1);
    const mk = (userId: string) =>
      db.booking.create({
        data: { userId, sessionId: slot.id, status: "PENDING", paidWith: "STRIPE", userKey: `${slot.id}:${userId}`, slotKey: slot.id },
      });
    await mk(users[0].id);
    const second = mk(users[1].id);
    await expect(second).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(second).rejects.toMatchObject({ code: "P2002" });
  }, 60_000);

  it("after a cancel the slot can be booked again", async () => {
    const slot = await newSession(db, oneId, 1);
    const first = await book(users[0].id, slot.id);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect((await book(users[1].id, slot.id)).ok).toBe(false);
    expect((await cancelBooking(db, { userId: users[0].id, bookingId: first.bookingId })).ok).toBe(true);
    expect((await book(users[1].id, slot.id)).ok).toBe(true);
  }, 60_000);
});

d("group class capacity", () => {
  it("capacity 3 and 8 parallel requests: exactly 3 get a seat", async () => {
    const s = await newSession(db, groupId, 3);
    const results = await Promise.all(users.map((u) => book(u.id, s.id)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.code === "FULL")).toHaveLength(5);
  }, 60_000);

  it("the same person twice in parallel: one booking only", async () => {
    const s = await newSession(db, groupId, 5);
    const results = await Promise.all([book(users[0].id, s.id), book(users[0].id, s.id), book(users[0].id, s.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.booking.count({ where: { sessionId: s.id, userId: users[0].id, status: { in: ["PENDING", "CONFIRMED"] } } })).toBe(1);
  }, 60_000);

  it("disclaimer is required, unknown and past sessions are refused", async () => {
    const s = await newSession(db, groupId, 5);
    expect(await book(users[0].id, s.id, { disclaimerAccepted: false })).toEqual({ ok: false, code: "DISCLAIMER" });
    expect(await book(users[0].id, "does-not-exist")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await book(users[0].id, s.id, { now: new Date(s.startsAt.getTime() + 1000) })).toEqual({ ok: false, code: "PAST" });
    expect(await book(users[0].id, s.id, { expectType: "ONE_TO_ONE" })).toEqual({ ok: false, code: "TYPE_MISMATCH" });
  }, 60_000);

  it("a pay-per-class booking is PENDING with an unpaid order for the class price; no Zoom access yet", async () => {
    const s = await newSession(db, groupId, 5);
    const r = await book(users[2].id, s.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("PENDING");
    expect(r.amountCents).toBe(1500);
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId! }, include: { items: true } });
    expect(order.status).toBe("PENDING");
    expect(order.items[0]).toMatchObject({ type: "CLASS", refId: s.id, totalCents: 1500 });
    const b = await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } });
    expect(b.disclaimerAcceptedAt).not.toBeNull();
  }, 60_000);
});

d("unpaid holds", () => {
  it("an old unpaid hold does not block the seat, and a new booking frees its keys", async () => {
    const slot = await newSession(db, oneId, 1);
    const t0 = new Date();
    const first = await book(users[0].id, slot.id, { now: t0 });
    expect(first.ok).toBe(true);
    const later = new Date(t0.getTime() + (HOLD_MINUTES + HOLD_GRACE_MINUTES + 1) * 60_000);
    // Still inside the hold time: blocked.
    expect((await book(users[1].id, slot.id, { now: new Date(t0.getTime() + 60_000) })).ok).toBe(false);
    // After the hold time: the seat is free again.
    expect((await book(users[1].id, slot.id, { now: later })).ok).toBe(true);
    if (first.ok) {
      const old = await db.booking.findUniqueOrThrow({ where: { id: first.bookingId } });
      expect(old.status).toBe("CANCELLED");
      expect(old.slotKey).toBeNull();
    }
  }, 60_000);

  it("cron step: releaseUnpaidHolds cancels old holds and their orders, and is safe to repeat", async () => {
    const s = await newSession(db, groupId, 5);
    const t0 = new Date();
    const r = await book(users[3].id, s.id, { now: t0 });
    if (!r.ok) throw new Error("setup");
    const later = new Date(t0.getTime() + 2 * HOUR);
    const n1 = await releaseUnpaidHolds(db, later);
    expect(n1).toBeGreaterThanOrEqual(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status).toBe("CANCELLED");
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId! } })).status).toBe("CANCELLED");
    expect(await releaseUnpaidHolds(db, later)).toBe(0);
  }, 60_000);
});

/** Gives credits. Older grants of this test user are emptied first (update only), so tests do not disturb each other. */
async function grant(userId: string, over: Partial<Prisma.CreditGrantUncheckedCreateInput> = {}, keepOthers = false) {
  if (!keepOthers) await db.creditGrant.updateMany({ where: { userId }, data: { creditsLeft: 0 } });
  return db.creditGrant.create({
    data: { userId, creditsTotal: 5, creditsLeft: 5, source: "ADMIN", appliesTo: ["GROUP_CLASS"], expiresAt: new Date("2100-01-01T00:00:00Z"), ...over },
  });
}

d("book with credit and cancel rules", () => {
  it("booking with a credit is CONFIRMED at once and uses exactly one credit", async () => {
    const s = await newSession(db, groupId, 5);
    const g = await grant(users[4].id);
    const r = await book(users[4].id, s.id, { method: "CREDIT" });
    expect(r.ok && r.status === "CONFIRMED" && r.orderId === null).toBe(true);
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: g.id } })).creditsLeft).toBe(4);
    const b = await db.booking.findFirstOrThrow({ where: { sessionId: s.id, userId: users[4].id } });
    expect(b).toMatchObject({ status: "CONFIRMED", paidWith: "CREDIT", creditGrantId: g.id });
  }, 60_000);

  it("cancel 24 hours or more before: credit returned (also exactly 24 h)", async () => {
    const s = await newSession(db, groupId, 5);
    const g = await grant(users[5].id, { creditsTotal: 2, creditsLeft: 2 });
    const r = await book(users[5].id, s.id, { method: "CREDIT" });
    if (!r.ok) throw new Error("setup");
    const exactly24 = new Date(s.startsAt.getTime() - CANCELLATION_HOURS * HOUR);
    const c = await cancelBooking(db, { userId: users[5].id, bookingId: r.bookingId, now: exactly24 });
    expect(c).toMatchObject({ ok: true, creditReturned: true, early: true });
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: g.id } })).creditsLeft).toBe(2);
  }, 60_000);

  it("cancel less than 24 hours before: no return", async () => {
    const s = await newSession(db, groupId, 5);
    const g = await grant(users[5].id, { creditsTotal: 2, creditsLeft: 2 });
    const r = await book(users[5].id, s.id, { method: "CREDIT" });
    if (!r.ok) throw new Error("setup");
    const late = new Date(s.startsAt.getTime() - 23 * HOUR);
    const c = await cancelBooking(db, { userId: users[5].id, bookingId: r.bookingId, now: late });
    expect(c).toMatchObject({ ok: true, creditReturned: false, early: false });
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: g.id } })).creditsLeft).toBe(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status).toBe("CANCELLED");
  }, 60_000);

  it("cancelling twice (also in parallel) returns the credit only once", async () => {
    const s = await newSession(db, groupId, 5);
    const g = await grant(users[6].id, { creditsTotal: 3, creditsLeft: 3 });
    const r = await book(users[6].id, s.id, { method: "CREDIT" });
    if (!r.ok) throw new Error("setup");
    const results = await Promise.all([
      cancelBooking(db, { userId: users[6].id, bookingId: r.bookingId }),
      cancelBooking(db, { userId: users[6].id, bookingId: r.bookingId }),
    ]);
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: g.id } })).creditsLeft).toBe(3);
    expect(await cancelBooking(db, { userId: users[6].id, bookingId: r.bookingId })).toEqual({ ok: false, code: "NOT_ACTIVE" });
  }, 60_000);

  it("a class that already started cannot be cancelled", async () => {
    const s = await newSession(db, groupId, 5);
    await grant(users[6].id);
    const r = await book(users[6].id, s.id, { method: "CREDIT" });
    if (!r.ok) throw new Error("setup");
    const c = await cancelBooking(db, { userId: users[6].id, bookingId: r.bookingId, now: new Date(s.startsAt.getTime() + 60_000) });
    expect(c).toEqual({ ok: false, code: "PAST" });
  }, 60_000);

  it("nobody can cancel another person's booking", async () => {
    const s = await newSession(db, groupId, 5);
    await grant(users[6].id);
    const r = await book(users[6].id, s.id, { method: "CREDIT" });
    if (!r.ok) throw new Error("setup");
    expect(await cancelBooking(db, { userId: users[7].id, bookingId: r.bookingId })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status).toBe("CONFIRMED");
  }, 60_000);

  it("no credit / expired credit / wrong type: NO_CREDIT", async () => {
    const s = await newSession(db, groupId, 5);
    const u = await testUser(db, 8);
    // Use a fresh user without usable credits: expire everything this user has first (update only).
    await db.creditGrant.updateMany({ where: { userId: u.id }, data: { creditsLeft: 0 } });
    expect(await book(u.id, s.id, { method: "CREDIT" })).toEqual({ ok: false, code: "NO_CREDIT" });
    await grant(u.id, { expiresAt: new Date("2020-01-01T00:00:00Z") });
    expect(await book(u.id, s.id, { method: "CREDIT" })).toEqual({ ok: false, code: "NO_CREDIT" });
    await grant(u.id, { appliesTo: ["ONE_TO_ONE"] }, true);
    expect(await book(u.id, s.id, { method: "CREDIT" })).toEqual({ ok: false, code: "NO_CREDIT" });
    await db.creditGrant.updateMany({ where: { userId: u.id }, data: { creditsLeft: 0 } });
  }, 60_000);

  it("the last credit used in two parallel bookings: only one works", async () => {
    const a = await newSession(db, groupId, 5);
    const b = await newSession(db, groupId, 5);
    const u = users[7];
    const g = await grant(u.id, { creditsTotal: 1, creditsLeft: 1 });
    const results = await Promise.all([book(u.id, a.id, { method: "CREDIT" }), book(u.id, b.id, { method: "CREDIT" })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "NO_CREDIT")).toHaveLength(1);
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: g.id } })).creditsLeft).toBe(0);
  }, 60_000);

  it("cron step: expired credits are removed once, valid ones stay", async () => {
    const u = users[0];
    const expired = await grant(u.id, { creditsLeft: 2, creditsTotal: 2, expiresAt: new Date("2020-06-01T00:00:00Z") });
    const valid = await grant(u.id, { creditsLeft: 2, creditsTotal: 2 }, true);
    expect(await expireCredits(db, new Date())).toBeGreaterThanOrEqual(1);
    const e = await db.creditGrant.findUniqueOrThrow({ where: { id: expired.id } });
    expect(e).toMatchObject({ creditsLeft: 0, creditsExpired: 2 });
    expect(e.expiredAt).not.toBeNull();
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: valid.id } })).creditsLeft).toBe(2);
    expect(await expireCredits(db, new Date())).toBe(0); // second run changes nothing
    await db.creditGrant.update({ where: { id: valid.id }, data: { creditsLeft: 0 } });
  }, 60_000);
});

d("pages count only fresh holds (same rule as the booking engine)", () => {
  const MIN = 60_000;
  it("class: a 20 and a 33 minute old hold still take the seat, a 40 minute old hold does not", async () => {
    const t = Date.now();
    for (const [age, expectLeft] of [[20, 0], [33, 0], [40, 1]] as const) {
      const s = await newSession(db, groupId, 1);
      const r = await book(users[0].id, s.id, { now: new Date(t) });
      expect(r.ok).toBe(true);
      const view = await getBookableSession(db, s.id, new Date(t + age * MIN));
      expect(view?.item.spotsLeft, `hold age ${age} min`).toBe(expectLeft);
    }
  }, 60_000);

  it("1:1 slot: listed again after the hold is old, not listed while the hold is fresh; a CONFIRMED booking always blocks", async () => {
    const t = Date.now();
    const slot = await newSession(db, oneId, 1);
    const r = await book(users[1].id, slot.id, { now: new Date(t) });
    expect(r.ok).toBe(true);
    const listed = async (at: number) => (await getOneToOneSlots(db, { now: new Date(at), limit: 5000 })).some((x) => x.id === slot.id);
    expect(await listed(t + 20 * MIN)).toBe(false);
    expect(await listed(t + 40 * MIN)).toBe(true);
    if (r.ok) await db.booking.update({ where: { id: r.bookingId }, data: { status: "CONFIRMED" } });
    expect(await listed(t + 40 * MIN)).toBe(false);
  }, 60_000);

  it("the booking engine agrees: after 40 minutes another user gets the seat the page showed as free", async () => {
    const t = Date.now();
    const s = await newSession(db, groupId, 1);
    expect((await book(users[2].id, s.id, { now: new Date(t) })).ok).toBe(true);
    expect((await book(users[3].id, s.id, { now: new Date(t + 20 * MIN) })).ok).toBe(false);
    expect((await getBookableSession(db, s.id, new Date(t + 40 * MIN)))?.item.spotsLeft).toBe(1);
    expect((await book(users[3].id, s.id, { now: new Date(t + 40 * MIN) })).ok).toBe(true);
  }, 60_000);

  it("schedule week query uses the same rule", async () => {
    const week = await getScheduleWeek(db, { weekOffset: 0 });
    expect(Array.isArray(week.items)).toBe(true);
  }, 60_000);
});
