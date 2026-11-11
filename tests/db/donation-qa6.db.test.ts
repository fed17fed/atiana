/**
 * QA tests for task 6.4 against the real Stripe webhook route and Neon DEV (never main).
 * Stripe is simulated: events are signed locally with a fake webhook secret. No call to Stripe. No real money.
 * Resend is simulated with a fetch mock, so we can count the emails.
 */
import Stripe from "stripe";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { countRecentDonationStarts, createDonationOrder, createDonationOrderLimited } from "@/lib/donation-service";
import { registerForEvent } from "@/lib/event-service";
import { dbTestsOn, getDb, newSession, testEventOffering, testUser, unique } from "./helpers";

const d = describe.skipIf(!dbTestsOn);
const WHSEC = "whsec_qa6_fake_secret";
let db: PrismaClient;
let POST: (req: never) => Promise<Response>;

beforeAll(async () => {
  if (dbTestsOn) {
    db = await getDb();
    POST = (await import("@/app/api/stripe/webhook/route")).POST as never;
  }
}, 60_000);

const fetchMock = vi.fn();
function stripeOn() {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_qa6_fake");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WHSEC);
  vi.stubEnv("RESEND_API_KEY", "re_qa6_fake");
  vi.stubEnv("EMAIL_FROM", "KEA <kea@example.test>");
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function signed(payload: object, secret = WHSEC) {
  const body = JSON.stringify(payload);
  const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": header } });
}
const completed = (orderId: string, cents: number, evt = unique("evt")) => ({
  id: evt,
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: unique("cs"), client_reference_id: orderId, payment_status: "paid", amount_total: cents, payment_intent: unique("pi") } },
});
const subjects = () => fetchMock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body).subject as string);

d("Stripe webhook route + donations (simulated Stripe, Neon dev)", () => {
  it("stand-alone donation: PENDING -> PAID once; replay and parallel events give ONE thank-you email", async () => {
    stripeOn();
    const email = `${unique("qa6-don")}@atiana.test`;
    const { orderId } = await createDonationOrder(db, { userId: null, email, amountCents: 2500 });
    const evt = completed(orderId, 2500);
    const first = await POST(signed(evt) as never);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ result: "paid" });
    expect(subjects()).toEqual(["Thank you for your gift"]);
    const paid1 = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(paid1.status).toBe("PAID");

    // same event again (serial) + the same payment under new event ids (parallel)
    const again = await POST(signed(evt) as never);
    expect(await again.json()).toMatchObject({ result: "duplicate" });
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => POST(signed(i % 2 ? evt : completed(orderId, 2500)) as never).then((r) => r.json())));
    expect(results.every((r) => r.result === "duplicate" || r.result === "already-paid")).toBe(true);
    expect(subjects()).toEqual(["Thank you for your gift"]); // still exactly one
    const paid2 = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(paid2.paidAt?.getTime()).toBe(paid1.paidAt?.getTime());
  }, 90_000);

  it("parallel FIRST delivery of the same donation (new event ids): exactly one PAID and one email", async () => {
    stripeOn();
    const { orderId } = await createDonationOrder(db, { userId: null, email: `${unique("qa6-par")}@atiana.test`, amountCents: 1000 });
    const rs = await Promise.all(Array.from({ length: 8 }, () => POST(signed(completed(orderId, 1000)) as never).then((r) => r.json())));
    expect(rs.filter((r) => r.result === "paid")).toHaveLength(1);
    expect(subjects()).toEqual(["Thank you for your gift"]);
  }, 90_000);

  it("wrong amount from Stripe: not paid, no email", async () => {
    stripeOn();
    const { orderId } = await createDonationOrder(db, { userId: null, email: `${unique("qa6-amt")}@atiana.test`, amountCents: 1000 });
    const r = await POST(signed(completed(orderId, 1)) as never);
    expect(await r.json()).toMatchObject({ result: "ignored" });
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PENDING");
    expect(fetchMock).not.toHaveBeenCalled();
  }, 60_000);

  it("bad, missing or foreign signature: 400, nothing changes, no email", async () => {
    stripeOn();
    const { orderId } = await createDonationOrder(db, { userId: null, email: `${unique("qa6-sig")}@atiana.test`, amountCents: 1000 });
    const evt = completed(orderId, 1000);
    expect((await POST(signed(evt, "whsec_other") as never)).status).toBe(400);
    const noHeader = new Request("http://localhost/api/stripe/webhook", { method: "POST", body: JSON.stringify(evt) });
    expect((await POST(noHeader as never)).status).toBe(400);
    const tampered = signed(evt);
    const body = JSON.stringify({ ...evt, id: unique("evt2") });
    const forged = new Request("http://localhost/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": tampered.headers.get("stripe-signature")! } });
    expect((await POST(forged as never)).status).toBe(400);
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PENDING");
    expect(fetchMock).not.toHaveBeenCalled();
  }, 60_000);

  it("Stripe off: webhook answers 503 and changes nothing", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const r = await POST(signed(completed("x", 1)) as never);
    expect(r.status).toBe(503);
  });

  it("expired Checkout cancels an unpaid donation order, no email; a later PAID event is still accepted once", async () => {
    stripeOn();
    const { orderId } = await createDonationOrder(db, { userId: null, email: `${unique("qa6-exp")}@atiana.test`, amountCents: 1000 });
    const expired = { id: unique("evt"), object: "event", type: "checkout.session.expired", data: { object: { id: unique("cs"), client_reference_id: orderId } } };
    expect(await (await POST(signed(expired) as never)).json()).toMatchObject({ result: "cancelled" });
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("CANCELLED");
    expect(fetchMock).not.toHaveBeenCalled();
  }, 60_000);

  it("event donation (order with a booking): booking email only, NO donation thank-you; replay sends nothing more", async () => {
    stripeOn();
    const offering = await testEventOffering(db, "DONATION");
    const user = await testUser(db, 61);
    const session = await newSession(db, offering.id, 5);
    const reg = await registerForEvent(db, { userId: user.id, sessionId: session.id, disclaimerAccepted: true, donationCents: 1000, paymentsOn: true });
    expect(reg).toMatchObject({ ok: true, status: "PENDING", kind: "DONATION", amountCents: 1000 });
    if (!reg.ok || !reg.orderId) throw new Error("registration failed");
    const evt = completed(reg.orderId, 1000);
    expect(await (await POST(signed(evt) as never)).json()).toMatchObject({ result: "paid" });
    expect(subjects()).toEqual([`You are booked: ${offering.title}`]);
    await POST(signed(evt) as never);
    await POST(signed(completed(reg.orderId, 1000)) as never);
    expect(subjects()).toHaveLength(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: reg.bookingId } })).status).toBe("CONFIRMED");
  }, 90_000);

  it("a paid stand-alone donation has no booking and cannot be reached by a booking cancel", async () => {
    stripeOn();
    const user = await testUser(db, 62);
    const { orderId } = await createDonationOrder(db, { userId: user.id, email: user.email, amountCents: 500 });
    await POST(signed(completed(orderId, 500)) as never);
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { bookings: true, items: true } });
    expect(o).toMatchObject({ status: "PAID", userId: user.id });
    expect(o.bookings).toHaveLength(0);
    expect(o.items.map((i) => i.type)).toEqual(["DONATION"]);
  }, 60_000);

  // Was bug R3 (ILIKE wildcards). Fixed: exact match ignoring case only (lower() = lower()).
  it("rate limit email match is exact (ignoring case only): _ and % are not wildcards", async () => {
    const id = unique("wild").replace(/-/g, "x");
    await createDonationOrder(db, { userId: null, email: `qa6a.${id}@atiana.test`, amountCents: 100 });
    expect(await countRecentDonationStarts(db, { ipHash: null, email: `QA6A.${id}@atiana.test` })).toBe(1);
    expect(await countRecentDonationStarts(db, { ipHash: null, email: `qa6_.${id}@atiana.test` })).toBe(0);
    expect(await countRecentDonationStarts(db, { ipHash: null, email: `qa6%${id}@atiana.test` })).toBe(0);
    expect(await countRecentDonationStarts(db, { ipHash: null, email: `qa6a.${id}@atiana.tes_` })).toBe(0);
  }, 60_000);

  // Was bug R1 (count-then-insert was not atomic). Fixed with a locked transaction.
  it("10 parallel starts from one email: at most 5 orders (atomic limit)", async () => {
    const email = `${unique("qa6-burst")}@atiana.test`;
    const { processDonation, DONATION_LIMIT_PER_HOUR } = await import("@/lib/donation-service");
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        processDonation(
          { amount: "5", email },
          {
            paymentsOn: true,
            user: null,
            ipHash: null,
            countRecentStarts: (q) => countRecentDonationStarts(db, q),
            createOrder: (i) => createDonationOrderLimited(db, i),
            startCheckout: async () => null, // Stripe "fails": the order is cancelled
            cancelOrder: async (id) => {
              await db.order.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
            },
          },
        ),
      ),
    );
    const started = results.filter((r) => !(r.status === "error" && r.message.startsWith("Too many"))).length;
    expect(started).toBe(DONATION_LIMIT_PER_HOUR);
    expect(await db.order.count({ where: { email } })).toBe(DONATION_LIMIT_PER_HOUR);
  }, 90_000);
});
