import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { cancelBooking, createBooking } from "@/lib/booking-service";
import { processStripeEvent } from "@/lib/stripe-service";
import { createPackageOrder } from "@/lib/orders-service";
import { getMyBookings, getMyCredits, getMyOrders } from "@/lib/account-queries";
import { sendReminders } from "@/lib/cron-service";
import { addOneToOneSlots } from "@/lib/slots-service";
import { getOneToOneSlots } from "@/lib/catalog-queries";
import { dbTestsOn, getDb, hideTestData, newSession, testOffering, testUser, unique } from "./helpers";

const d = describe.skipIf(!dbTestsOn);
let db: PrismaClient;
let groupId: string;
let oneId: string;

beforeAll(async () => {
  if (!dbTestsOn) return;
  db = await getDb();
  groupId = (await testOffering(db, "GROUP_CLASS")).id;
  oneId = (await testOffering(db, "ONE_TO_ONE")).id;
}, 60_000);
afterAll(async () => {
  if (dbTestsOn) await hideTestData(db);
}, 60_000);

const completedEvent = (id: string, orderId: string, amount: number) => ({
  id,
  type: "checkout.session.completed",
  data: { object: { id: `cs_${id}`, client_reference_id: orderId, payment_status: "paid", amount_total: amount } },
});

d("webhook with the real database", () => {
  it("class payment: PAID once, booking CONFIRMED, replayed event changes nothing", async () => {
    const u = await testUser(db, 1);
    const s = await newSession(db, groupId, 5);
    const r = await createBooking(db, { userId: u.id, sessionId: s.id, method: "STRIPE", disclaimerAccepted: true });
    if (!r.ok) throw new Error("setup");
    const evId = unique("evt");
    const first = await processStripeEvent(db, completedEvent(evId, r.orderId!, 1500));
    expect(first.status).toBe("paid");
    const again = await processStripeEvent(db, completedEvent(evId, r.orderId!, 1500));
    expect(again.status).toBe("duplicate");
    const other = await processStripeEvent(db, completedEvent(unique("evt"), r.orderId!, 1500));
    expect(other.status).toBe("already-paid");
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId! } });
    expect(order.status).toBe("PAID");
    expect(order.paidAt).not.toBeNull();
    expect((await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status).toBe("CONFIRMED");
    expect(await db.stripeEvent.count({ where: { id: evId } })).toBe(1);
  }, 60_000);

  it("pack payment: credits appear once with the right expiry and total", async () => {
    const u = await testUser(db, 2);
    const pack = await db.package.findFirstOrThrow({ where: { name: "5-class pack" } });
    const o = await createPackageOrder(db, { userId: u.id, packageId: pack.id });
    if (!o.ok) throw new Error("setup");
    const now = new Date("2026-11-10T10:00:00Z");
    const ev = completedEvent(unique("evt"), o.orderId, o.amountCents);
    const before = await db.creditGrant.findMany({ where: { userId: u.id, packageId: pack.id }, select: { id: true } });
    const paid = await processStripeEvent(db, ev, now);
    expect(paid.status).toBe("paid");
    expect((await processStripeEvent(db, ev, now)).status).toBe("duplicate");
    const all = await db.creditGrant.findMany({ where: { userId: u.id, packageId: pack.id } });
    const grants = all.filter((g) => !before.some((b) => b.id === g.id));
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ creditsTotal: 5, creditsLeft: 5, source: "PURCHASE" });
    expect(grants[0].expiresAt?.toISOString()).toBe("2027-01-19T10:00:00.000Z");
    expect(grants[0].appliesTo).toEqual(["GROUP_CLASS"]);
  }, 60_000);

  it("a parallel replay of the same event still pays once", async () => {
    const u = await testUser(db, 3);
    const pack = await db.package.findFirstOrThrow({ where: { name: "10-class pack" } });
    const o = await createPackageOrder(db, { userId: u.id, packageId: pack.id });
    if (!o.ok) throw new Error("setup");
    const ev = completedEvent(unique("evt"), o.orderId, o.amountCents);
    const countBefore = await db.creditGrant.count({ where: { userId: u.id, packageId: pack.id } });
    const results = await Promise.allSettled([processStripeEvent(db, ev), processStripeEvent(db, ev), processStripeEvent(db, ev)]);
    const statuses = results.map((r) => (r.status === "fulfilled" ? r.value.status : "error"));
    expect(statuses.filter((s) => s === "paid")).toHaveLength(1);
    expect(await db.creditGrant.count({ where: { userId: u.id, packageId: pack.id } })).toBe(countBefore + 1);
  }, 60_000);
});

d("account pages: a user sees only own data", () => {
  it("bookings, credits and orders are filtered by user; Zoom link only when CONFIRMED", async () => {
    const a = await testUser(db, 4);
    const b = await testUser(db, 5);
    const s = await newSession(db, groupId, 5);
    const ra = await createBooking(db, { userId: a.id, sessionId: s.id, method: "STRIPE", disclaimerAccepted: true });
    if (!ra.ok) throw new Error("setup");
    await db.creditGrant.create({ data: { userId: a.id, creditsTotal: 3, creditsLeft: 3, source: "ADMIN" } });

    const mineA = await getMyBookings(db, a.id);
    const mineB = await getMyBookings(db, b.id);
    expect(mineA.some((x) => x.id === ra.bookingId)).toBe(true);
    expect(mineB.some((x) => x.id === ra.bookingId)).toBe(false);
    // PENDING: no Zoom link yet.
    expect(mineA.find((x) => x.id === ra.bookingId)?.zoomUrl).toBeNull();

    const ordersA = await getMyOrders(db, a.id);
    const ordersB = await getMyOrders(db, b.id);
    expect(ordersA.some((x) => x.id === ra.orderId)).toBe(true);
    expect(ordersB.some((x) => x.id === ra.orderId)).toBe(false);
    expect(ordersA.every((x) => x.userId === a.id)).toBe(true);

    expect((await getMyCredits(db, a.id)).every((c) => c.userId === a.id)).toBe(true);
    expect((await getMyCredits(db, b.id)).every((c) => c.userId === b.id)).toBe(true);

    await processStripeEvent(db, completedEvent(unique("evt"), ra.orderId!, 1500));
    const after = await getMyBookings(db, a.id);
    expect(after.find((x) => x.id === ra.bookingId)).toMatchObject({ status: "CONFIRMED", zoomUrl: "https://zoom.example/test" });
    expect((await getMyBookings(db, b.id)).some((x) => x.id === ra.bookingId)).toBe(false);
  }, 60_000);
});

d("reminders", () => {
  it("sends (logs) once for classes in the next 24 hours, and not again", async () => {
    const u = await testUser(db, 6);
    const now = new Date(Date.UTC(2041, 5, 1, 6, 0, 0) + Math.floor(Math.random() * 1e6) * 1000);
    const soon = await newSession(db, groupId, 5, new Date(now.getTime() + 10 * 3600_000));
    const far = await newSession(db, groupId, 5, new Date(now.getTime() + 40 * 3600_000));
    for (const s of [soon, far]) {
      await db.booking.create({
        data: { userId: u.id, sessionId: s.id, status: "CONFIRMED", paidWith: "FREE", userKey: `${s.id}:${u.id}` },
      });
    }
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const first = await sendReminders(db, now);
    const second = await sendReminders(db, now);
    spy.mockRestore();
    expect(first.logged + first.sent).toBeGreaterThanOrEqual(1);
    expect(second.logged + second.sent).toBe(0);
    const b = await db.booking.findFirstOrThrow({ where: { sessionId: soon.id, userId: u.id } });
    expect(b.reminderSentAt).not.toBeNull();
    expect((await db.booking.findFirstOrThrow({ where: { sessionId: far.id, userId: u.id } })).reminderSentAt).toBeNull();
  }, 60_000);
});

d("admin adds 1:1 slots", () => {
  it("creates weekly slots in Dublin time, skips duplicates, refuses a class offering", async () => {
    const now = new Date("2040-01-01T00:00:00Z");
    const form = { offeringId: oneId, date: `2040-0${3}-06`, time: "14:00", minutes: 60, repeatWeeks: 3 };
    const r1 = await addOneToOneSlots(db, form, now);
    const r2 = await addOneToOneSlots(db, form, now);
    expect(r1.ok && r1.created >= 0).toBe(true);
    expect(r2.ok && r2.created).toBe(0);
    const slots = await db.classSession.findMany({ where: { offeringId: oneId, startsAt: { gte: new Date("2040-03-06T00:00:00Z"), lt: new Date("2040-03-30T00:00:00Z") } }, orderBy: { startsAt: "asc" } });
    expect(slots.filter((s) => s.capacity === 1).length).toBeGreaterThanOrEqual(3);
    expect((await addOneToOneSlots(db, { ...form, offeringId: groupId }, now)).ok).toBe(false);
    expect((await addOneToOneSlots(db, { ...form, time: "25:99" }, now)).ok).toBe(false);
    expect((await getOneToOneSlots(db, { now: new Date("2039-01-01T00:00:00Z") })).every((s) => s.capacity === 1)).toBe(true);
  }, 60_000);
});

d("cancel a card-paid booking: client chooses credit or money", () => {
  const H = 3600_000;
  async function paidBooking(userN: number) {
    const u = await testUser(db, userN);
    const s = await newSession(db, groupId, 5);
    const r = await createBooking(db, { userId: u.id, sessionId: s.id, method: "STRIPE", disclaimerAccepted: true });
    if (!r.ok) throw new Error("setup");
    await processStripeEvent(db, { id: unique("evt"), type: "checkout.session.completed", data: { object: { id: `cs_${unique("x")}`, client_reference_id: r.orderId, payment_status: "paid", amount_total: 1500, payment_intent: unique("pi") } } });
    return { u, s, r };
  }
  const early = (s: { startsAt: Date }) => new Date(s.startsAt.getTime() - 30 * H);
  const late = (s: { startsAt: Date }) => new Date(s.startsAt.getTime() - 10 * H);

  it("early + credit: booking cancelled, exactly 1 new credit of the right type and expiry", async () => {
    const { u, s, r } = await paidBooking(1);
    const now = early(s);
    const c = await cancelBooking(db, { userId: u.id, bookingId: r.bookingId, now, refundChoice: "CREDIT" });
    expect(c).toMatchObject({ ok: true, refund: "CREDIT", creditReturned: true });
    expect((await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status).toBe("CANCELLED");
    const g = await db.creditGrant.findMany({ where: { userId: u.id, source: "CANCELLATION", createdAt: { gte: new Date(Date.now() - 120_000) } } });
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ creditsTotal: 1, creditsLeft: 1 });
    expect(g[0].appliesTo).toEqual(["GROUP_CLASS"]);
    expect(g[0].expiresAt?.toISOString()).toBe(new Date(now.getTime() + 70 * 86400_000).toISOString());
  }, 60_000);

  it("double submit (parallel): only one credit is given", async () => {
    const { u, s, r } = await paidBooking(2);
    const now = early(s);
    const before = await db.creditGrant.count({ where: { userId: u.id, source: "CANCELLATION" } });
    const res = await Promise.all([1, 2, 3].map(() => cancelBooking(db, { userId: u.id, bookingId: r.bookingId, now, refundChoice: "CREDIT" })));
    expect(res.filter((x) => x.ok)).toHaveLength(1);
    expect(await db.creditGrant.count({ where: { userId: u.id, source: "CANCELLATION" } })).toBe(before + 1);
  }, 60_000);

  it("early + money: Stripe refund called once with the booking id, booking cancelled, order stays PAID until the webhook", async () => {
    const { u, s, r } = await paidBooking(3);
    const refund = vi.fn().mockResolvedValue(undefined);
    const c = await cancelBooking(db, { userId: u.id, bookingId: r.bookingId, now: early(s), refundChoice: "MONEY", refund });
    expect(c).toMatchObject({ ok: true, refund: "MONEY", creditReturned: false });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith({ orderId: r.orderId, bookingId: r.bookingId });
    expect((await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status).toBe("CANCELLED");
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId! } })).status).toBe("PAID");
    // Stripe confirms later:
    const pi = (await db.order.findUniqueOrThrow({ where: { id: r.orderId! } })).stripePaymentIntentId!;
    expect((await processStripeEvent(db, { id: unique("evt"), type: "charge.refunded", data: { object: { payment_intent: pi, refunded: true } } })).status).toBe("refunded");
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId! } })).status).toBe("REFUNDED");
    // second submit: nothing more happens
    expect(await cancelBooking(db, { userId: u.id, bookingId: r.bookingId, now: early(s), refundChoice: "MONEY", refund })).toEqual({ ok: false, code: "NOT_ACTIVE" });
    expect(refund).toHaveBeenCalledTimes(1);
  }, 60_000);

  it("money without Stripe: REFUND_OFF, booking unchanged; Stripe failure: REFUND_FAILED, booking unchanged", async () => {
    const { u, s, r } = await paidBooking(4);
    expect(await cancelBooking(db, { userId: u.id, bookingId: r.bookingId, now: early(s), refundChoice: "MONEY" })).toEqual({ ok: false, code: "REFUND_OFF" });
    const bad = vi.fn().mockRejectedValue(new Error("stripe down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await cancelBooking(db, { userId: u.id, bookingId: r.bookingId, now: early(s), refundChoice: "MONEY", refund: bad })).toEqual({ ok: false, code: "REFUND_FAILED" });
    spy.mockRestore();
    expect((await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status).toBe("CONFIRMED");
  }, 60_000);

  it("early without a choice: CHOICE_REQUIRED, booking unchanged", async () => {
    const { u, s, r } = await paidBooking(5);
    expect(await cancelBooking(db, { userId: u.id, bookingId: r.bookingId, now: early(s) })).toEqual({ ok: false, code: "CHOICE_REQUIRED" });
    expect((await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status).toBe("CONFIRMED");
  }, 60_000);

  it("under 24 h: no credit, no refund, Stripe is not called (even if money is chosen)", async () => {
    const { u, s, r } = await paidBooking(6);
    const refund = vi.fn();
    const before = await db.creditGrant.count({ where: { userId: u.id, source: "CANCELLATION" } });
    const c = await cancelBooking(db, { userId: u.id, bookingId: r.bookingId, now: late(s), refundChoice: "MONEY", refund });
    expect(c).toMatchObject({ ok: true, early: false, refund: null, creditReturned: false });
    expect(refund).not.toHaveBeenCalled();
    expect(await db.creditGrant.count({ where: { userId: u.id, source: "CANCELLATION" } })).toBe(before);
  }, 60_000);

  it("another user cannot cancel or refund my booking", async () => {
    const { s, r } = await paidBooking(1);
    const other = await testUser(db, 2);
    const refund = vi.fn();
    expect(await cancelBooking(db, { userId: other.id, bookingId: r.bookingId, now: early(s), refundChoice: "MONEY", refund })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await cancelBooking(db, { userId: other.id, bookingId: r.bookingId, now: early(s), refundChoice: "CREDIT" })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(refund).not.toHaveBeenCalled();
    expect((await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status).toBe("CONFIRMED");
  }, 60_000);
});

d("expired credit on a booking (B3)", () => {
  it("account list marks the credit as expired; early cancel does not return it and is not 'late'", async () => {
    const u = await testUser(db, 4);
    await db.creditGrant.updateMany({ where: { userId: u.id }, data: { creditsLeft: 0 } });
    const g = await db.creditGrant.create({ data: { userId: u.id, creditsTotal: 1, creditsLeft: 1, source: "ADMIN", appliesTo: ["GROUP_CLASS"], expiresAt: new Date("2100-01-01T00:00:00Z") } });
    const s = await newSession(db, groupId, 5);
    const r = await createBooking(db, { userId: u.id, sessionId: s.id, method: "CREDIT", disclaimerAccepted: true });
    if (!r.ok) throw new Error("setup");
    expect((await getMyBookings(db, u.id)).find((b) => b.id === r.bookingId)?.creditExpired).toBe(false);
    await db.creditGrant.update({ where: { id: g.id }, data: { expiresAt: new Date("2020-01-01T00:00:00Z") } });
    expect((await getMyBookings(db, u.id)).find((b) => b.id === r.bookingId)?.creditExpired).toBe(true);
    const c = await cancelBooking(db, { userId: u.id, bookingId: r.bookingId });
    expect(c).toMatchObject({ ok: true, creditReturned: false, early: true });
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: g.id } })).creditsLeft).toBe(0);
  }, 60_000);
});
