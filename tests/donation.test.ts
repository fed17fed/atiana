import { describe, expect, it, vi } from "vitest";
import { buildDonationThanksMail } from "@/lib/notifications";
import { DONATION_MESSAGES, parseDonationAmount } from "@/lib/donation-amount";
import { countRecentDonationStarts, createDonationOrder, DONATION_LIMIT_PER_HOUR, DonationLimitError, hashIp, processDonation, type DonationDeps } from "@/lib/donation-service";
import { clientIp } from "@/lib/client-ip";
import { PAYMENTS_OFF_MESSAGE } from "@/lib/stripe-service";

describe("parseDonationAmount", () => {
  it.each([
    ["1", 100],
    ["1.00", 100],
    ["10", 1000],
    ["12.5", 1250],
    ["12,50", 1250],
    ["€25", 2500],
    [" 50 ", 5000],
    ["1000", 100000],
    ["1000.00", 100000],
    ["0.1", null], // 10 cents: too small
  ])("accepts %s", (input, cents) => {
    const r = parseDonationAmount(input);
    if (cents === null) expect(r.ok).toBe(false);
    else expect(r).toEqual({ ok: true, cents });
  });

  it("refuses 0.99 and 0 and empty with the approved text", () => {
    for (const v of ["0.99", "0", "0.00", "", "   "]) {
      const r = parseDonationAmount(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toBe("Please enter an amount of €1 or more.");
    }
  });

  it("refuses 1000.01 and bigger with the max text", () => {
    for (const v of ["1000.01", "1001", "99999999999999999999"]) {
      const r = parseDonationAmount(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("TOO_BIG");
    }
    expect(DONATION_MESSAGES.tooBig).toContain("€1,000");
  });

  it("refuses negative numbers", () => {
    for (const v of ["-5", "-0.5", "- 3"]) {
      const r = parseDonationAmount(v);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("TOO_SMALL");
    }
  });

  it("refuses text, NaN, exponents, more than 2 decimals, thousand separators and non-strings", () => {
    for (const v of ["abc", "NaN", "Infinity", "1e3", "10.123", "5.001", "1,000", "1.000,50", "10 euro", "0x10", "1..0", "10.", ".5"]) {
      expect(parseDonationAmount(v).ok, v).toBe(false);
    }
    for (const v of [undefined, null, 10, {}, ["10"]]) {
      expect(parseDonationAmount(v).ok).toBe(false);
    }
  });
});

function fakeDb() {
  const created: Record<string, unknown>[] = [];
  return { created, db: { order: { create: vi.fn(async (a: { data: Record<string, unknown> }) => { created.push(a.data); return { id: "ord_1" }; }) } } };
}

describe("createDonationOrder", () => {
  it("guest: userId null, email saved, status PENDING, one DONATION item in EUR", async () => {
    const { db, created } = fakeDb();
    const r = await createDonationOrder(db as never, { userId: null, email: "guest@example.com", amountCents: 2500 });
    expect(r).toEqual({ orderId: "ord_1" });
    expect(created[0]).toMatchObject({ userId: null, email: "guest@example.com", status: "PENDING", currency: "EUR", subtotalCents: 2500, totalCents: 2500 });
    const items = (created[0].items as { create: Record<string, unknown>[] }).create;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "DONATION", quantity: 1, unitPriceCents: 2500, totalCents: 2500 });
  });
  it("logged in: order is linked to the user", async () => {
    const { db, created } = fakeDb();
    await createDonationOrder(db as never, { userId: "user_1", email: "me@example.com", amountCents: 100 });
    expect(created[0]).toMatchObject({ userId: "user_1", email: "me@example.com", totalCents: 100 });
  });
});

function deps(over: Partial<DonationDeps> = {}) {
  const d = {
    paymentsOn: true,
    user: null,
    createOrder: vi.fn().mockResolvedValue({ orderId: "ord_1" }),
    startCheckout: vi.fn().mockResolvedValue("https://checkout.stripe.test/x"),
    cancelOrder: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    ...over,
  } satisfies DonationDeps;
  return d;
}
const good = { amount: "25", email: "guest@example.com" };

describe("processDonation", () => {
  it("guest: creates a guest order (userId null) and redirects to Stripe", async () => {
    const d = deps();
    const r = await processDonation(good, d);
    expect(r).toEqual({ status: "redirect", url: "https://checkout.stripe.test/x" });
    expect(d.createOrder).toHaveBeenCalledWith({ userId: null, email: "guest@example.com", amountCents: 2500, ipHash: null });
    expect(d.startCheckout).toHaveBeenCalledWith({ orderId: "ord_1", email: "guest@example.com", amountCents: 2500 });
  });

  it("logged in: the order is linked to the user", async () => {
    const d = deps({ user: { id: "user_1", email: "me@example.com" } });
    await processDonation({ amount: "10", email: "me@example.com" }, d);
    expect(d.createOrder).toHaveBeenCalledWith({ userId: "user_1", email: "me@example.com", amountCents: 1000, ipHash: null });
  });

  it("Stripe off: honest demo message, NOTHING is created", async () => {
    const d = deps({ paymentsOn: false });
    const r = await processDonation(good, d);
    expect(r).toEqual({ status: "demo-off", message: PAYMENTS_OFF_MESSAGE });
    expect(d.createOrder).not.toHaveBeenCalled();
    expect(d.startCheckout).not.toHaveBeenCalled();
  });

  it("bad amount: field error, nothing created", async () => {
    const d = deps();
    for (const amount of ["0.99", "1000.01", "abc", "-1", "10.555"]) {
      const r = await processDonation({ ...good, amount }, d);
      expect(r.status).toBe("error");
      if (r.status === "error") expect(r.fieldErrors?.amount).toBeTruthy();
    }
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it("bad or missing email: field error", async () => {
    const d = deps();
    for (const email of ["", "nope", "a@b", "x".repeat(210) + "@example.com"]) {
      const r = await processDonation({ ...good, email }, d);
      expect(r.status).toBe("error");
      if (r.status === "error") expect(r.fieldErrors?.email).toBeTruthy();
    }
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it("honeypot filled: nothing is created", async () => {
    const d = deps();
    const r = await processDonation({ ...good, website: "http://spam.test" }, d);
    expect(r.status).toBe("error");
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it("Turnstile on: a missing or wrong token creates nothing; a good one passes", async () => {
    const verifyHuman = vi.fn(async (t: string) => t === "ok");
    const d = deps({ verifyHuman });
    expect((await processDonation(good, d)).status).toBe("error");
    expect((await processDonation({ ...good, "cf-turnstile-response": "bad" }, d)).status).toBe("error");
    expect(d.createOrder).not.toHaveBeenCalled();
    expect((await processDonation({ ...good, "cf-turnstile-response": "ok" }, d)).status).toBe("redirect");
  });

  it("Stripe fails: the order is cancelled (not deleted) and the visitor gets an error", async () => {
    const d = deps({ startCheckout: vi.fn().mockRejectedValue(new Error("stripe down")) });
    const r = await processDonation(good, d);
    expect(r.status).toBe("error");
    expect(d.cancelOrder).toHaveBeenCalledWith("ord_1");
  });

  it("database not ready: friendly error, never throws", async () => {
    const d = deps({ createOrder: vi.fn().mockRejectedValue(new Error("no table")) });
    const r = await processDonation(good, d);
    expect(r.status).toBe("error");
    expect(d.startCheckout).not.toHaveBeenCalled();
  });
});

describe("thank-you email", () => {
  it("has the amount, a greeting and no tax or refund claim", () => {
    const m = buildDonationThanksMail("a@b.test", 2500, "Anna\r\nBcc: x");
    expect(m.to).toBe("a@b.test");
    expect(m.text).toContain("€25");
    expect(m.text.split("\n")[0]).toBe("Dear Anna Bcc: x,");
    expect(m.text).not.toMatch(/tax|refund|charity/i);
    expect(buildDonationThanksMail("a@b.test", 1000).text.startsWith("Hello,")).toBe(true);
  });
});

// ---------- Rate limit: 5 starts per hour per IP, only when Stripe is on ----------

/** In-memory stand-in for the two queries of the limit: raw email count and order.count by IP ref. */
function limitDb(orders: { createdAt: Date; email: string; ref: string | null }[]) {
  return {
    $queryRaw: async (_strings: TemplateStringsArray, since: Date, email: string) => [
      { n: orders.filter((o) => o.createdAt > since && o.email.toLowerCase() === email.toLowerCase()).length },
    ],
    order: {
      count: async ({ where }: { where: { createdAt: { gt: Date }; items: { some: { refId: string } } } }) =>
        orders.filter((o) => o.createdAt > where.createdAt.gt && o.ref === where.items.some.refId).length,
    },
  };
}
const NOW = new Date("2026-11-11T12:00:00Z");
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const ipHash = hashIp("203.0.113.7");
const limitedDeps = (orders: Parameters<typeof limitDb>[0], over: Partial<DonationDeps> = {}) =>
  deps({
    ipHash,
    countRecentStarts: (q) => countRecentDonationStarts(limitDb(orders) as never, { ...q, now: NOW }),
    ...over,
  });
const startsFromIp = (n: number, min = 10) =>
  Array.from({ length: n }, (_, i) => ({ createdAt: ago(min + i), email: `other${i}@example.com`, ref: "ip:" + ipHash }));

describe("donation rate limit", () => {
  it("limit is 5 per hour", () => expect(DONATION_LIMIT_PER_HOUR).toBe(5));

  it("5th start is OK (4 before it), 6th is blocked with the new text", async () => {
    const ok = limitedDeps(startsFromIp(4));
    expect((await processDonation(good, ok)).status).toBe("redirect");
    const blocked = limitedDeps(startsFromIp(5));
    const r = await processDonation(good, blocked);
    expect(r).toEqual({ status: "error", message: "Too many tries. Please wait a little and try again." });
    expect(blocked.createOrder).not.toHaveBeenCalled();
  });

  it("the same email is also limited (even from another IP)", async () => {
    const orders = Array.from({ length: 5 }, (_, i) => ({ createdAt: ago(5 + i), email: "Guest@Example.com", ref: "ip:other" + i }));
    const r = await processDonation(good, limitedDeps(orders));
    expect(r.status === "error" && r.message).toMatch(/Too many tries/);
  });

  it("resets after 1 hour: old starts do not count", async () => {
    const r = await processDonation(good, limitedDeps(startsFromIp(8, 61)));
    expect(r.status).toBe("redirect");
    const edge = await processDonation(good, limitedDeps(startsFromIp(5, 50)));
    expect(edge.status).toBe("error");
  });

  it("another visitor (other IP and email) is not affected", async () => {
    const r = await processDonation({ ...good, email: "new@example.com" }, limitedDeps(startsFromIp(9), { ipHash: hashIp("198.51.100.1") }));
    expect(r.status).toBe("redirect");
  });

  it("Stripe off: the limit is not checked and nothing is created", async () => {
    const count = vi.fn().mockResolvedValue(99);
    const d = deps({ paymentsOn: false, ipHash, countRecentStarts: count });
    const r = await processDonation(good, d);
    expect(r.status).toBe("demo-off");
    expect(count).not.toHaveBeenCalled();
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it("unknown IP: only the email limit applies; a failing check never creates an order", async () => {
    expect(hashIp("")).toBeNull();
    const d = deps({ countRecentStarts: vi.fn().mockRejectedValue(new Error("db")) });
    expect((await processDonation(good, d)).status).toBe("error");
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it("the IP is saved only as a hash", () => {
    expect(ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(ipHash).not.toContain("203");
  });
});

describe("atomic limit: the order step may refuse", () => {
  it("DonationLimitError from createOrder gives the too-many text and no Stripe call", async () => {
    const d = deps({ createOrder: vi.fn().mockRejectedValue(new DonationLimitError()) });
    const r = await processDonation(good, d);
    expect(r).toEqual({ status: "error", message: "Too many tries. Please wait a little and try again." });
    expect(d.startCheckout).not.toHaveBeenCalled();
  });
});

describe("clientIp (which header is trusted)", () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
  it("on Vercel: x-vercel-forwarded-for first, then x-real-ip; a spoofed first x-forwarded-for entry is ignored", () => {
    const env = { VERCEL: "1" };
    expect(clientIp(h({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), env)).toBe("203.0.113.7");
    expect(clientIp(h({ "x-real-ip": "203.0.113.8", "x-forwarded-for": "6.6.6.6, 203.0.113.8" }), env)).toBe("203.0.113.8");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }), env)).toBe("203.0.113.9");
  });
  it("elsewhere: the RIGHT-most x-forwarded-for entry (added by our proxy), never the first", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.5" }), {})).toBe("203.0.113.5");
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.5" }), {})).toBe("203.0.113.5");
  });
  it("falls back to x-real-ip, handles IPv6, and refuses junk or missing headers", () => {
    expect(clientIp(h({ "x-real-ip": "203.0.113.4" }), {})).toBe("203.0.113.4");
    expect(clientIp(h({ "x-forwarded-for": "2001:db8::1" }), {})).toBe("2001:db8::1");
    expect(clientIp(h({ "x-forwarded-for": "<script>" }), {})).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "9".repeat(60) }), {})).toBeNull();
    expect(clientIp(h({}), {})).toBeNull();
  });
  it("a visitor who changes the first entry gets the same IP hash", () => {
    const a = hashIp(clientIp(h({ "x-forwarded-for": "1.1.1.1, 203.0.113.5" }), {}));
    const b = hashIp(clientIp(h({ "x-forwarded-for": "9.9.9.9, 203.0.113.5" }), {}));
    expect(a).toBe(b);
  });
});
