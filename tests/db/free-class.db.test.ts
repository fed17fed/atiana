/** Free class booking (task 11.6): same seat rule, row lock and unique keys as a paid booking. Local test database only. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { cancelBooking, createBooking } from "@/lib/booking-service";
import { dbTestsOn, getDb, hideTestData, newSession, testFreeClassOffering, testOffering, testUser } from "./helpers";

const HOUR = 3600_000;
const d = describe.skipIf(!dbTestsOn);

let db: PrismaClient;
let freeId: string;
let paidId: string;
const users: { id: string }[] = [];

beforeAll(async () => {
  if (!dbTestsOn) return;
  db = await getDb();
  freeId = (await testFreeClassOffering(db)).id;
  paidId = (await testOffering(db, "GROUP_CLASS")).id;
  for (let i = 1; i <= 8; i++) users.push(await testUser(db, i));
}, 60_000);

afterAll(async () => {
  if (dbTestsOn) await hideTestData(db);
}, 60_000);

const book = (userId: string, sessionId: string, over: Partial<Parameters<typeof createBooking>[1]> = {}) =>
  createBooking(db, { userId, sessionId, method: "FREE", disclaimerAccepted: true, ...over });
const active = (sessionId: string) => db.booking.count({ where: { sessionId, status: { in: ["PENDING", "CONFIRMED"] } } });

d("free class booking (local test database)", () => {
  it("books at once: CONFIRMED, paidWith FREE, no order, no credit used", async () => {
    const s = await newSession(db, freeId, 5);
    const grant = await db.creditGrant.create({
      data: { userId: users[0].id, creditsTotal: 1, creditsLeft: 1, appliesTo: ["GROUP_CLASS"], source: "ADMIN", expiresAt: new Date(Date.now() + 30 * 24 * HOUR) },
    });
    const r = await book(users[0].id, s.id);
    expect(r.ok && r.status).toBe("CONFIRMED");
    expect(r.ok && r.paidWith).toBe("FREE");
    expect(r.ok && r.orderId).toBeNull();
    const b = await db.booking.findFirstOrThrow({ where: { sessionId: s.id } });
    expect(b.paidWith).toBe("FREE");
    expect(b.orderId).toBeNull();
    expect(b.creditGrantId).toBeNull();
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: grant.id } })).creditsLeft).toBe(1);
    expect(await db.orderItem.count({ where: { refId: s.id } })).toBe(0);
    await db.creditGrant.update({ where: { id: grant.id }, data: { creditsLeft: 0 } });
  }, 60_000);

  it("a stale form that says STRIPE or CREDIT on a free class still gives a FREE booking: no order, no credit", async () => {
    const s = await newSession(db, freeId, 5);
    const a = await book(users[1].id, s.id, { method: "STRIPE" });
    const c = await book(users[2].id, s.id, { method: "CREDIT" });
    expect(a.ok && a.paidWith).toBe("FREE");
    expect(c.ok && c.paidWith).toBe("FREE");
    expect(await db.orderItem.count({ where: { refId: s.id } })).toBe(0);
  }, 60_000);

  it("method FREE on a class with a price is refused (NOT_FREE), nothing is created", async () => {
    const s = await newSession(db, paidId, 5);
    const r = await book(users[0].id, s.id);
    expect(r).toEqual({ ok: false, code: "NOT_FREE" });
    expect(await db.booking.count({ where: { sessionId: s.id } })).toBe(0);
  }, 60_000);

  it("disclaimer is required, a started class is closed (no late join), a cancelled session is not found", async () => {
    const s = await newSession(db, freeId, 5);
    expect(await book(users[0].id, s.id, { disclaimerAccepted: false })).toEqual({ ok: false, code: "DISCLAIMER" });
    const past = await newSession(db, freeId, 5, new Date(Date.now() - 5 * 60_000));
    expect(await book(users[0].id, past.id)).toEqual({ ok: false, code: "PAST" });
    const exact = await newSession(db, freeId, 5, new Date(Date.UTC(2040, 5, 1, Math.floor(Math.random() * 20), Math.floor(Math.random() * 59), 7)));
    expect(await book(users[0].id, exact.id, { now: exact.startsAt })).toEqual({ ok: false, code: "PAST" });
    await db.classSession.update({ where: { id: s.id }, data: { status: "CANCELLED" } });
    expect(await book(users[0].id, s.id)).toEqual({ ok: false, code: "NOT_FOUND" });
  }, 60_000);

  it("8 parallel bookings on capacity 3: exactly 3 win, 5 get FULL", async () => {
    const s = await newSession(db, freeId, 3);
    const results = await Promise.all(users.map((u) => book(u.id, s.id)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.code))).toEqual(Array(5).fill("FULL"));
    expect(await active(s.id)).toBe(3);
    expect(await db.orderItem.count({ where: { refId: s.id } })).toBe(0);
  }, 60_000);

  it("last seat: 2 parallel requests for capacity 1, exactly one wins", async () => {
    const s = await newSession(db, freeId, 1);
    const results = await Promise.all([book(users[0].id, s.id), book(users[1].id, s.id)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => (r.ok ? "" : r.code))).toEqual(["FULL"]);
    expect(await active(s.id)).toBe(1);
  }, 60_000);

  it("double click: the same user 5 times in parallel gets exactly one seat", async () => {
    const s = await newSession(db, freeId, 5);
    const results = await Promise.all(Array.from({ length: 5 }, () => book(users[3].id, s.id)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && (r.code === "ALREADY_BOOKED" || r.code === "FULL"))).toBe(true);
    expect(await active(s.id)).toBe(1);
  }, 60_000);

  it("the database itself refuses a second active booking of the same user (unique userKey)", async () => {
    const s = await newSession(db, freeId, 5);
    const mk = () =>
      db.booking.create({
        data: { userId: users[4].id, sessionId: s.id, status: "CONFIRMED", paidWith: "FREE", userKey: `${s.id}:${users[4].id}` },
      });
    await mk();
    await expect(mk()).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await expect(mk()).rejects.toMatchObject({ code: "P2002" });
  }, 60_000);

  it("cancel: allowed before the start, frees the seat and the keys, gives no credit; double cancel is safe", async () => {
    const s = await newSession(db, freeId, 1);
    const r = await book(users[0].id, s.id);
    expect(r.ok).toBe(true);
    const bookingId = r.ok ? r.bookingId : "";
    const [c1, c2] = await Promise.all([
      cancelBooking(db, { userId: users[0].id, bookingId }),
      cancelBooking(db, { userId: users[0].id, bookingId }),
    ]);
    expect([c1.ok, c2.ok].filter(Boolean)).toHaveLength(1);
    const ok = [c1, c2].find((x) => x.ok);
    expect(ok && ok.ok && ok.creditReturned).toBe(false);
    expect(ok && ok.ok && ok.paidWith).toBe("FREE");
    const row = await db.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.status).toBe("CANCELLED");
    expect(row.userKey).toBeNull();
    expect(row.slotKey).toBeNull();
    // the seat can be booked again (capacity 1, by another user)
    expect((await book(users[1].id, s.id)).ok).toBe(true);
  }, 60_000);

  it("cancel after the start is refused (PAST)", async () => {
    const s = await newSession(db, freeId, 5, new Date(Date.now() + 60 * 60_000));
    const r = await book(users[5].id, s.id);
    const bookingId = r.ok ? r.bookingId : "";
    const later = new Date(s.startsAt.getTime() + 60_000);
    expect(await cancelBooking(db, { userId: users[5].id, bookingId, now: later })).toEqual({ ok: false, code: "PAST" });
  }, 60_000);
});
