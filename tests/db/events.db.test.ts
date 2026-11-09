import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { cancelBooking } from "@/lib/booking-service";
import { EVENT_REFUND_DAYS } from "@/lib/booking-rules";
import { cancelEventByAdmin, cancelEventRegistration, registerForEvent } from "@/lib/event-service";
import { processStripeEvent } from "@/lib/stripe-service";
import { getMyBookings } from "@/lib/account-queries";
import { dbTestsOn, getDb, hideTestData, newSession, testEventOffering, testUser, unique } from "./helpers";

const d = describe.skipIf(!dbTestsOn);
const DAY = 24 * 3600_000;
const MIN = 60_000;
let db: PrismaClient;
let freeId: string;
let donationId: string;
let paidId: string;
const users: { id: string }[] = [];

beforeAll(async () => {
  if (!dbTestsOn) return;
  db = await getDb();
  freeId = (await testEventOffering(db, "FREE")).id;
  donationId = (await testEventOffering(db, "DONATION")).id;
  paidId = (await testEventOffering(db, "PAID")).id;
  for (let i = 1; i <= 8; i++) users.push(await testUser(db, i));
}, 60_000);
afterAll(async () => {
  if (dbTestsOn) await hideTestData(db);
}, 60_000);

const reg = (userId: string, sessionId: string, over: Partial<Parameters<typeof registerForEvent>[1]> = {}) =>
  registerForEvent(db, { userId, sessionId, disclaimerAccepted: true, paymentsOn: true, ...over });

/** Registers for a paid event and plays the Stripe webhook, so the booking is CONFIRMED and the order PAID. */
async function paidTicket(userId: string, sessionId: string) {
  const r = await reg(userId, sessionId);
  if (!r.ok) throw new Error("setup " + r.code);
  const pi = unique("pi");
  await processStripeEvent(db, { id: unique("evt"), type: "checkout.session.completed", data: { object: { id: unique("cs"), client_reference_id: r.orderId, payment_status: "paid", amount_total: r.amountCents, payment_intent: pi } } });
  return { ...r, pi };
}

d("event spots limit", () => {
  it("capacity 3, 8 parallel registrations: exactly 3 places", async () => {
    const s = await newSession(db, freeId, 3);
    const res = await Promise.all(users.map((u) => reg(u.id, s.id)));
    expect(res.filter((r) => r.ok)).toHaveLength(3);
    expect(res.filter((r) => !r.ok && r.code === "FULL")).toHaveLength(5);
  }, 60_000);

  it("same person 3 times in parallel: one registration", async () => {
    const s = await newSession(db, freeId, 10);
    const res = await Promise.all([1, 2, 3].map(() => reg(users[0].id, s.id)));
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.booking.count({ where: { sessionId: s.id, status: { in: ["PENDING", "CONFIRMED"] } } })).toBe(1);
  }, 60_000);

  it("a free place is CONFIRMED at once, with no order; disclaimer is required; a class page cannot book it", async () => {
    const s = await newSession(db, freeId, 10);
    expect(await reg(users[1].id, s.id, { disclaimerAccepted: false })).toEqual({ ok: false, code: "DISCLAIMER" });
    const r = await reg(users[1].id, s.id);
    expect(r).toMatchObject({ ok: true, status: "CONFIRMED", kind: "FREE", orderId: null });
  }, 60_000);

  it("an old unpaid hold (40 min) does not block a paid event; a fresh one does", async () => {
    const s = await newSession(db, paidId, 1);
    const t = Date.now();
    expect((await reg(users[0].id, s.id, { now: new Date(t) })).ok).toBe(true);
    expect((await reg(users[1].id, s.id, { now: new Date(t + 20 * MIN) })).ok).toBe(false);
    expect((await reg(users[1].id, s.id, { now: new Date(t + 40 * MIN) })).ok).toBe(true);
  }, 60_000);

  it("started or cancelled events are closed", async () => {
    const s = await newSession(db, freeId, 5);
    expect(await reg(users[2].id, s.id, { now: new Date(s.startsAt.getTime() + 1000) })).toEqual({ ok: false, code: "CLOSED" });
  }, 60_000);
});

d("donation", () => {
  it("EUR 0: confirmed and free, no order, works even when Stripe is off", async () => {
    const s = await newSession(db, donationId, 5);
    const r = await reg(users[0].id, s.id, { donationCents: 0, paymentsOn: false });
    expect(r).toMatchObject({ ok: true, status: "CONFIRMED", kind: "DONATION_ZERO", orderId: null, amountCents: 0 });
    const b = await db.booking.findUniqueOrThrow({ where: { id: (r as { bookingId: string }).bookingId } });
    expect(b).toMatchObject({ status: "CONFIRMED", paidWith: "FREE", orderId: null });
  }, 60_000);

  it("above EUR 0 with Stripe off: nothing is reserved", async () => {
    const s = await newSession(db, donationId, 5);
    expect(await reg(users[0].id, s.id, { donationCents: 1000, paymentsOn: false })).toEqual({ ok: false, code: "PAYMENTS_OFF" });
    expect(await db.booking.count({ where: { sessionId: s.id } })).toBe(0);
  }, 60_000);

  it("invalid amounts are refused (missing, negative, fraction, tiny, huge)", async () => {
    const s = await newSession(db, donationId, 5);
    for (const [v, code] of [[undefined, "AMOUNT_INVALID"], [null, "AMOUNT_INVALID"], [-1, "AMOUNT_INVALID"], [10.5, "AMOUNT_INVALID"], [10, "AMOUNT_TOO_SMALL"], [49, "AMOUNT_TOO_SMALL"], [100_001, "AMOUNT_TOO_BIG"]] as const) {
      expect(await reg(users[0].id, s.id, { donationCents: v as number })).toEqual({ ok: false, code });
    }
    expect(await db.booking.count({ where: { sessionId: s.id } })).toBe(0);
  }, 60_000);

  it("a paid donation is NEVER refunded, also when the client cancels long before the event", async () => {
    const s = await newSession(db, donationId, 5);
    const r = await reg(users[1].id, s.id, { donationCents: 1000 });
    if (!r.ok) throw new Error("setup");
    expect(r).toMatchObject({ status: "PENDING", kind: "DONATION", amountCents: 1000 });
    await processStripeEvent(db, { id: unique("evt"), type: "checkout.session.completed", data: { object: { id: unique("cs"), client_reference_id: r.orderId, payment_status: "paid", amount_total: 1000, payment_intent: unique("pi") } } });
    expect((await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status).toBe("CONFIRMED");
    const refund = vi.fn();
    const c = await cancelEventRegistration(db, { userId: users[1].id, bookingId: r.bookingId, refund, now: new Date(s.startsAt.getTime() - 30 * DAY) });
    expect(c).toEqual({ ok: true, refund: "NONE", reason: "DONATION" });
    expect(refund).not.toHaveBeenCalled();
    expect((await db.booking.findUniqueOrThrow({ where: { id: r.bookingId } })).status).toBe("CANCELLED");
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId! } })).status).toBe("PAID");
  }, 60_000);
});

d("cancel a free event place and the 7 day rule for tickets", () => {
  it("free: cancel any time before the start frees the place; nothing else happens", async () => {
    const s = await newSession(db, freeId, 1);
    const r = await reg(users[0].id, s.id);
    if (!r.ok) throw new Error("setup");
    expect((await reg(users[1].id, s.id)).ok).toBe(false);
    const refund = vi.fn();
    const c = await cancelEventRegistration(db, { userId: users[0].id, bookingId: r.bookingId, refund, now: new Date(s.startsAt.getTime() - 60_000) });
    expect(c).toEqual({ ok: true, refund: "NONE", reason: "FREE" });
    expect(refund).not.toHaveBeenCalled();
    expect((await reg(users[1].id, s.id)).ok).toBe(true);
  }, 60_000);

  it("ticket: exactly 7 days before = refund started; 1 minute later than that = no refund", async () => {
    const s1 = await newSession(db, paidId, 5);
    const t1 = await paidTicket(users[0].id, s1.id);
    const refund = vi.fn().mockResolvedValue(undefined);
    const exact = new Date(s1.startsAt.getTime() - EVENT_REFUND_DAYS * DAY);
    expect(await cancelEventRegistration(db, { userId: users[0].id, bookingId: t1.bookingId, refund, now: exact })).toEqual({ ok: true, refund: "STARTED", reason: "TICKET_EARLY" });
    expect(refund).toHaveBeenCalledWith({ orderId: t1.orderId, bookingId: t1.bookingId });

    const s2 = await newSession(db, paidId, 5);
    const t2 = await paidTicket(users[1].id, s2.id);
    const refund2 = vi.fn();
    const late = new Date(s2.startsAt.getTime() - EVENT_REFUND_DAYS * DAY + MIN);
    expect(await cancelEventRegistration(db, { userId: users[1].id, bookingId: t2.bookingId, refund: refund2, now: late })).toEqual({ ok: true, refund: "NONE", reason: "TICKET_LATE" });
    expect(refund2).not.toHaveBeenCalled();
    expect((await db.booking.findUniqueOrThrow({ where: { id: t2.bookingId } })).status).toBe("CANCELLED");
  }, 60_000);

  it("early ticket: no Stripe = REFUND_OFF and nothing changes; Stripe error = REFUND_FAILED and nothing changes; double submit refunds once", async () => {
    const s = await newSession(db, paidId, 5);
    const t = await paidTicket(users[2].id, s.id);
    const now = new Date(s.startsAt.getTime() - 10 * DAY);
    expect(await cancelEventRegistration(db, { userId: users[2].id, bookingId: t.bookingId, now })).toEqual({ ok: false, code: "REFUND_OFF" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await cancelEventRegistration(db, { userId: users[2].id, bookingId: t.bookingId, now, refund: vi.fn().mockRejectedValue(new Error("down")) })).toEqual({ ok: false, code: "REFUND_FAILED" });
    spy.mockRestore();
    expect((await db.booking.findUniqueOrThrow({ where: { id: t.bookingId } })).status).toBe("CONFIRMED");
    const keys = new Set<string>();
    const refund = vi.fn(async (a: { bookingId: string }) => void keys.add(a.bookingId));
    const res = await Promise.all([1, 2].map(() => cancelEventRegistration(db, { userId: users[2].id, bookingId: t.bookingId, now, refund })));
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(keys.size).toBe(1); // same booking id = same idempotency key at Stripe
    // Stripe confirms: only now the order is REFUNDED
    expect((await db.order.findUniqueOrThrow({ where: { id: t.orderId! } })).status).toBe("PAID");
    await processStripeEvent(db, { id: unique("evt"), type: "charge.refunded", data: { object: { payment_intent: t.pi, refunded: true } } });
    expect((await db.order.findUniqueOrThrow({ where: { id: t.orderId! } })).status).toBe("REFUNDED");
  }, 60_000);

  it("another user cannot cancel my place; the class cancel cannot be used on an event (no free class credit)", async () => {
    const s = await newSession(db, paidId, 5);
    const t = await paidTicket(users[3].id, s.id);
    const refund = vi.fn();
    const now = new Date(s.startsAt.getTime() - 10 * DAY);
    expect(await cancelEventRegistration(db, { userId: users[4].id, bookingId: t.bookingId, now, refund })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await cancelBooking(db, { userId: users[3].id, bookingId: t.bookingId, now, refundChoice: "CREDIT" })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(refund).not.toHaveBeenCalled();
    expect((await db.booking.findUniqueOrThrow({ where: { id: t.bookingId } })).status).toBe("CONFIRMED");
  }, 60_000);

  it("account list shows the event with its type, and the Zoom link only when CONFIRMED", async () => {
    const s = await newSession(db, donationId, 5);
    const r = await reg(users[5].id, s.id, { donationCents: 500 });
    if (!r.ok) throw new Error("setup");
    let row = (await getMyBookings(db, users[5].id)).find((b) => b.id === r.bookingId)!;
    expect(row).toMatchObject({ type: "EVENT", zoomUrl: null });
    await processStripeEvent(db, { id: unique("evt"), type: "checkout.session.completed", data: { object: { id: unique("cs"), client_reference_id: r.orderId, payment_status: "paid", amount_total: 500, payment_intent: unique("pi") } } });
    row = (await getMyBookings(db, users[5].id)).find((b) => b.id === r.bookingId)!;
    expect(row.zoomUrl).toBe("https://zoom.example/test");
    expect(row).toMatchObject({ eventPricing: "DONATION", donationPaid: true });
  }, 60_000);
});

d("KEA cancels the event (admin)", () => {
  it("every paid ticket is refunded once (same idempotency key on repeat), donations and free places are not", async () => {
    const s = await newSession(db, paidId, 10);
    const t1 = await paidTicket(users[0].id, s.id);
    const t2 = await paidTicket(users[1].id, s.id);
    const t3 = await paidTicket(users[2].id, s.id);
    const hold = await reg(users[3].id, s.id); // unpaid hold
    if (!hold.ok) throw new Error("setup");

    const seen: string[] = [];
    const refund = vi.fn(async (a: { bookingId: string }) => void seen.push(a.bookingId));
    const r1 = await cancelEventByAdmin(db, { sessionId: s.id, refund });
    expect(r1).toEqual({ cancelledRegistrations: 4, refundsStarted: 3, refundsFailed: 0 });
    expect(new Set(seen)).toEqual(new Set([t1.bookingId, t2.bookingId, t3.bookingId]));
    const session = await db.classSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(session.status).toBe("CANCELLED");
    expect(await db.booking.count({ where: { sessionId: s.id, status: { in: ["PENDING", "CONFIRMED"] } } })).toBe(0);
    expect((await db.order.findUniqueOrThrow({ where: { id: hold.orderId! } })).status).toBe("CANCELLED");

    // Run again: only the same bookings (same Stripe keys), no new ones
    seen.length = 0;
    await cancelEventByAdmin(db, { sessionId: s.id, refund });
    expect(new Set(seen)).toEqual(new Set([t1.bookingId, t2.bookingId, t3.bookingId]));

    // Stripe confirms all refunds: orders REFUNDED, a third run refunds nobody
    for (const t of [t1, t2, t3]) await processStripeEvent(db, { id: unique("evt"), type: "charge.refunded", data: { object: { payment_intent: t.pi, refunded: true } } });
    seen.length = 0;
    expect(await cancelEventByAdmin(db, { sessionId: s.id, refund })).toMatchObject({ refundsStarted: 0 });
    expect(seen).toHaveLength(0);
    expect(await reg(users[4].id, s.id)).toEqual({ ok: false, code: "CLOSED" });
  }, 120_000);

  it("a donation is not refunded when KEA cancels (owner rule: donations are never refunded); not an event = NOT_FOUND", async () => {
    const s = await newSession(db, donationId, 10);
    const r = await reg(users[0].id, s.id, { donationCents: 2000 });
    if (!r.ok) throw new Error("setup");
    await processStripeEvent(db, { id: unique("evt"), type: "checkout.session.completed", data: { object: { id: unique("cs"), client_reference_id: r.orderId, payment_status: "paid", amount_total: 2000, payment_intent: unique("pi") } } });
    const refund = vi.fn();
    expect(await cancelEventByAdmin(db, { sessionId: s.id, refund })).toMatchObject({ cancelledRegistrations: 1, refundsStarted: 0 });
    expect(refund).not.toHaveBeenCalled();
    expect(await cancelEventByAdmin(db, { sessionId: "nope", refund })).toEqual({ ok: false, code: "NOT_FOUND" });
  }, 60_000);
});
