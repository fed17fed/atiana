/**
 * QA tests for task 6.4 (donate page). Extra cases on top of tests/donation.test.ts:
 * amount tampering, honeypot, no raw IP, limit edge cases, no refund path, no donor name.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseDonationAmount } from "@/lib/donation-amount";
import { createDonationOrder, DONATION_LIMIT_PER_HOUR, hashIp, processDonation, type DonationDeps } from "@/lib/donation-service";
import { buildDonationThanksMail } from "@/lib/notifications";

const deps = (over: Partial<DonationDeps> = {}) =>
  ({
    paymentsOn: true,
    user: null,
    createOrder: vi.fn().mockResolvedValue({ orderId: "ord_1" }),
    startCheckout: vi.fn().mockResolvedValue("https://checkout.stripe.test/x"),
    cancelOrder: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    ...over,
  }) satisfies DonationDeps;

describe("QA 6.4: amount tampering (server side)", () => {
  it.each([
    "-1", "-0.01", "-100", "- 5", "0", "0.00", "0.99", "00.50", ".5", "+10", "10.", "1,000", "1 000", "1_000", "0x10", "1e2", "1E2",
    "Infinity", "-Infinity", "NaN", "null", "undefined", "true", "10abc", "abc10", "10 20", "10;DROP TABLE", "<script>", "１０", "٣٠", "10.001", "1000.01", "1000.1", "99999999", "9".repeat(400),
    "10\n20", "10\u0000", "\t", "€", "€€10", "$10", "10€",
  ])("refuses %j", (input) => {
    expect(parseDonationAmount(input).ok).toBe(false);
  });

  it.each([[1], [1000], [null], [undefined], [["10"]], [{ toString: () => "10" }], [true], [new Uint8Array(1)]])("refuses non-string %j", (input) => {
    expect(parseDonationAmount(input as unknown).ok).toBe(false);
  });

  it.each([
    ["1", 100], ["1.0", 100], ["1.00", 100], ["0001", 100], ["000010.5", 1050], ["1000", 100000], ["1000.0", 100000], ["1000.00", 100000], ["999.99", 99999], ["€ 10", 1000], ["10,5", 1050], ["  25  ", 2500],
  ])("accepts %j as %i cents (whole cents, no float rounding)", (input, cents) => {
    expect(parseDonationAmount(input)).toEqual({ ok: true, cents });
  });

  it("every accepted amount is a whole number of cents between 100 and 100000", () => {
    for (let c = 0; c <= 100500; c += 7) {
      const euros = (c / 100).toFixed(2);
      const r = parseDonationAmount(euros);
      if (r.ok) {
        expect(Number.isInteger(r.cents)).toBe(true);
        expect(r.cents).toBe(c);
        expect(c).toBeGreaterThanOrEqual(100);
        expect(c).toBeLessThanOrEqual(100000);
      } else expect(c < 100 || c > 100000).toBe(true);
    }
  });

  it("the server never passes a tampered amount on: only parsed cents reach Stripe", async () => {
    const d = deps();
    await processDonation({ amount: "25", email: "a@example.com", amountCents: "1", unitPriceCents: "1", totalCents: "1" }, d);
    expect(d.startCheckout).toHaveBeenCalledWith({ orderId: "ord_1", email: "a@example.com", amountCents: 2500 });
  });
});

describe("QA 6.4: spam and misuse", () => {
  it.each(["x", " ", "http://spam.example", "0"])("honeypot value %j: nothing created, no Stripe", async (website) => {
    const d = deps();
    const r = await processDonation({ amount: "10", email: "a@example.com", website }, d);
    if (website.trim() === "") expect(r.status).toBe("redirect");
    else {
      expect(r.status).toBe("error");
      expect(d.createOrder).not.toHaveBeenCalled();
      expect(d.startCheckout).not.toHaveBeenCalled();
    }
  });

  it("Turnstile off (no verifyHuman): never blocks", async () => {
    expect((await processDonation({ amount: "10", email: "a@example.com" }, deps())).status).toBe("redirect");
  });

  it("email with line break or header injection is refused", async () => {
    const d = deps();
    for (const email of ["a@example.com\nBcc: x@evil.test", "a@example.com,b@example.com", "a b@example.com", "<a@example.com>", `${"a".repeat(201)}@example.com`]) {
      const r = await processDonation({ amount: "10", email }, d);
      expect(r.status).toBe("error");
    }
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it("form fields of the wrong type (File, array) are treated as empty", async () => {
    const d = deps();
    const r = await processDonation({ amount: new Blob(["10"]), email: ["a@example.com"] }, d);
    expect(r.status).toBe("error");
    expect(d.createOrder).not.toHaveBeenCalled();
  });

  it("no donor name is read, saved or sent anywhere", async () => {
    const d = deps();
    await processDonation({ amount: "10", email: "a@example.com", name: "Eve Evil", donorName: "Eve" }, d);
    expect(JSON.stringify(vi.mocked(d.createOrder).mock.calls)).not.toMatch(/Eve/);
    expect(JSON.stringify(vi.mocked(d.startCheckout).mock.calls)).not.toMatch(/Eve/);
    expect(buildDonationThanksMail("a@example.com", 1000).text.split("\n")[0]).toBe("Hello,");
  });

  it("the page code has no name field, no refund/tax/charity words, no [OWNER] note", () => {
    const files = ["app/donate/page.tsx", "components/donate/DonateForm.tsx", "lib/donation-amount.ts", "lib/donation-service.ts"].map((f) => readFileSync(f, "utf8"));
    const all = files.join("\n");
    expect(all).not.toMatch(/\[OWNER/);
    expect(all).not.toMatch(/tax[- ]?deduct|charity|non-?profit|gift aid|registered/i);
    expect(files[1]).not.toMatch(/name="name"|name="donorName"/);
    expect(all).not.toMatch(/refunds\.create|refundDonation/);
  });
});

describe("QA 6.4: rate-limit edge cases", () => {
  it("raw IP is never given to the database layer, only the hash", async () => {
    const created: unknown[] = [];
    const db = { order: { create: vi.fn(async (a: unknown) => (created.push(a), { id: "o1" })) } };
    await createDonationOrder(db as never, { userId: null, email: "a@example.com", amountCents: 100, ipHash: hashIp("203.0.113.7") });
    expect(JSON.stringify(created)).not.toContain("203.0.113.7");
    expect(JSON.stringify(created)).toMatch(/"refId":"ip:[0-9a-f]{32}"/);
  });

  it("hashIp: trims, is stable, depends on the secret, and null for empty or blank", () => {
    expect(hashIp("  203.0.113.7 ", "s")).toBe(hashIp("203.0.113.7", "s"));
    expect(hashIp("203.0.113.7", "s1")).not.toBe(hashIp("203.0.113.7", "s2"));
    expect(hashIp("203.0.113.7", "s")).not.toBe(hashIp("203.0.113.8", "s"));
    expect(hashIp("   ")).toBeNull();
    expect(hashIp(undefined)).toBeNull();
    expect(hashIp(null)).toBeNull();
  });

  it("limit is exactly 5: counts 0..4 pass, 5 and more are blocked", async () => {
    for (const n of [0, 1, 4]) expect((await processDonation({ amount: "5", email: "a@example.com" }, deps({ countRecentStarts: async () => n }))).status).toBe("redirect");
    for (const n of [5, 6, 50]) {
      const d = deps({ countRecentStarts: async () => n });
      const r = await processDonation({ amount: "5", email: "a@example.com" }, d);
      expect(r).toEqual({ status: "error", message: "Too many tries. Please wait a little and try again." });
      expect(d.createOrder).not.toHaveBeenCalled();
    }
    expect(DONATION_LIMIT_PER_HOUR).toBe(5);
  });

  it("an invalid form does not use up the limit (no DB call before validation)", async () => {
    const count = vi.fn().mockResolvedValue(0);
    await processDonation({ amount: "0", email: "bad" }, deps({ countRecentStarts: count }));
    expect(count).not.toHaveBeenCalled();
  });
});
