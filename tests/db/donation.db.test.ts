import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { countRecentDonationStarts, createDonationOrder, createDonationOrderLimited, DONATION_LIMIT_PER_HOUR, DonationLimitError, hashIp } from "@/lib/donation-service";
import { sendDonationThanks } from "@/lib/notifications";
import { processStripeEvent } from "@/lib/stripe-service";
import { dbTestsOn, getDb, testUser, unique } from "./helpers";

const d = describe.skipIf(!dbTestsOn);
let db: PrismaClient;

beforeAll(async () => {
  if (dbTestsOn) db = await getDb();
}, 60_000);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const completed = (orderId: string, cents: number, pi = unique("pi"), evt = unique("evt")) => ({
  id: evt,
  type: "checkout.session.completed",
  data: { object: { id: unique("cs"), client_reference_id: orderId, payment_status: "paid", amount_total: cents, payment_intent: pi } },
});

d("donation orders (Neon dev)", () => {
  it("guest order: userId null, DONATION item, PENDING; paid once by the webhook, replay does nothing", async () => {
    const email = `${unique("guest")}@atiana.test`;
    const { orderId } = await createDonationOrder(db, { userId: null, email, amountCents: 2500 });
    const before = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    expect(before).toMatchObject({ userId: null, email, status: "PENDING", currency: "EUR", totalCents: 2500 });
    expect(before.items.map((i) => i.type)).toEqual(["DONATION"]);

    const evt = completed(orderId, 2500);
    const first = await processStripeEvent(db, evt);
    expect(first.status).toBe("paid");
    // Same event again, and the same payment under a new event id, in parallel.
    const replays = await Promise.all([
      processStripeEvent(db, evt),
      processStripeEvent(db, evt),
      processStripeEvent(db, completed(orderId, 2500)),
      processStripeEvent(db, completed(orderId, 2500)),
    ]);
    expect(replays.every((r) => r.status === "duplicate" || r.status === "already-paid")).toBe(true);
    const after = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(after.status).toBe("PAID");
    expect(after.paidAt).not.toBeNull();
  }, 60_000);

  it("amount mismatch does not mark the donation PAID", async () => {
    const { orderId } = await createDonationOrder(db, { userId: null, email: `${unique("g")}@atiana.test`, amountCents: 1000 });
    const r = await processStripeEvent(db, completed(orderId, 999999));
    expect(r.status).toBe("ignored");
    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("PENDING");
  });

  it("logged-in order is linked to the user and shows in their orders", async () => {
    const user = await testUser(db, 1);
    const { orderId } = await createDonationOrder(db, { userId: user.id, email: user.email, amountCents: 100 });
    const row = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(row.userId).toBe(user.id);
  });

  it("rate limit counts recent starts by IP hash and by email (real database)", async () => {
    const ip = hashIp(unique("10.0.0"))!;
    const email = `${unique("rl")}@atiana.test`;
    expect(await countRecentDonationStarts(db, { ipHash: ip, email })).toBe(0);
    for (let i = 0; i < 3; i++) await createDonationOrder(db, { userId: null, email: `${unique("o")}@atiana.test`, amountCents: 100, ipHash: ip });
    expect(await countRecentDonationStarts(db, { ipHash: ip, email })).toBe(3);
    await createDonationOrder(db, { userId: null, email: email.toUpperCase(), amountCents: 100 });
    expect(await countRecentDonationStarts(db, { ipHash: null, email })).toBe(1); // email match ignores case
    // an hour later nothing counts
    expect(await countRecentDonationStarts(db, { ipHash: ip, email, now: new Date(Date.now() + 61 * 60_000) })).toBe(0);
  }, 60_000);

  it("atomic limit: 10 parallel starts from one IP (different emails) and 10 from one email give at most 5 orders each", async () => {
    const ip = hashIp(unique("10.1.1"))!;
    const byIp = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => createDonationOrderLimited(db, { userId: null, email: `${unique("ipb" + i)}@atiana.test`, amountCents: 100, ipHash: ip })),
    );
    expect(byIp.filter((r) => r.status === "fulfilled")).toHaveLength(DONATION_LIMIT_PER_HOUR);
    for (const r of byIp) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(DonationLimitError);

    const email = `${unique("emb")}@atiana.test`;
    const byEmail = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => createDonationOrderLimited(db, { userId: null, email: i % 2 ? email.toUpperCase() : email, amountCents: 100, ipHash: hashIp(unique("10.2." + i)) })),
    );
    expect(byEmail.filter((r) => r.status === "fulfilled")).toHaveLength(DONATION_LIMIT_PER_HOUR);
    expect(await countRecentDonationStarts(db, { ipHash: null, email })).toBe(DONATION_LIMIT_PER_HOUR);
  }, 90_000);

  it("thank-you email goes out once for a paid stand-alone donation, not for an unpaid one", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "KEA <kea@example.test>");
    const email = `${unique("thanks")}@atiana.test`;
    const { orderId } = await createDonationOrder(db, { userId: null, email, amountCents: 5000 });
    await sendDonationThanks(db, orderId, "Anna"); // still PENDING
    expect(fetchMock).not.toHaveBeenCalled();
    await processStripeEvent(db, completed(orderId, 5000));
    await sendDonationThanks(db, orderId, "Anna");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual([email]);
    expect(body.text).toContain("€50");
  }, 60_000);
});
