import { describe, expect, it, vi } from "vitest";
import {
  createCheckoutSession,
  processStripeEvent,
  stripeConfig,
  verifyWebhook,
  type StripeEventLike,
} from "@/lib/stripe-service";

type Obj = Record<string, unknown>;

/** Tiny in-memory stand-in for the parts of Prisma that the webhook uses. */
function fakeDb(seed: { order: Obj; items: Obj[]; bookings?: Obj[]; packages?: Obj[] }) {
  const state = {
    events: new Set<string>(),
    order: { ...seed.order },
    bookings: (seed.bookings ?? []).map((b) => ({ ...b })),
    grants: [] as Obj[],
  };
  const tx = {
    stripeEvent: {
      createMany: async ({ data }: { data: { id: string }[] }) => {
        let count = 0;
        for (const d of data) {
          if (!state.events.has(d.id)) {
            state.events.add(d.id);
            count++;
          }
        }
        return { count };
      },
    },
    order: {
      findFirst: async () => ({ ...state.order, items: seed.items }),
      updateMany: async ({ where, data }: { where: { id: string; status: string | { in: string[] } }; data: Obj }) => {
        const allowed = typeof where.status === "string" ? [where.status] : where.status.in;
        if (where.id === state.order.id && allowed.includes(state.order.status as string)) {
          Object.assign(state.order, data);
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    booking: {
      findMany: async () => state.bookings.map((b) => ({ ...b })),
      updateMany: async ({ where, data }: { where: { id?: string; status?: string }; data: Obj }) => {
        let count = 0;
        for (const b of state.bookings) {
          if ((!where.id || b.id === where.id) && (!where.status || b.status === where.status)) {
            Object.assign(b, data);
            count++;
          }
        }
        return { count };
      },
    },
    package: { findUnique: async ({ where }: { where: { id: string } }) => (seed.packages ?? []).find((p) => p.id === where.id) ?? null },
    creditGrant: {
      create: async ({ data }: { data: Obj }) => {
        const g = { id: `g${state.grants.length + 1}`, ...data };
        state.grants.push(g);
        return g;
      },
    },
  };
  const db = { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } as never;
  return { db, state };
}

const completed = (over: Obj = {}, id = "evt_1"): StripeEventLike => ({
  id,
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", client_reference_id: "ord_1", payment_status: "paid", amount_total: 1500, ...over } },
});

const classOrder = () =>
  fakeDb({
    order: { id: "ord_1", userId: "u1", status: "PENDING", totalCents: 1500, stripeSessionId: "cs_1" },
    items: [{ type: "CLASS", refId: "s1", quantity: 1 }],
    bookings: [{ id: "b1", status: "PENDING", orderId: "ord_1" }],
  });

describe("stripeConfig (feature is OFF without keys)", () => {
  it("off when nothing is set", () => expect(stripeConfig({})).toBeNull());
  it("off when only one key is set", () => {
    expect(stripeConfig({ STRIPE_SECRET_KEY: "sk_test_x" })).toBeNull();
    expect(stripeConfig({ STRIPE_WEBHOOK_SECRET: "whsec_x" })).toBeNull();
  });
  it("off for blank values", () => expect(stripeConfig({ STRIPE_SECRET_KEY: " ", STRIPE_WEBHOOK_SECRET: " " })).toBeNull());
  it("on when both are set", () => {
    expect(stripeConfig({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" })).toEqual({
      secretKey: "sk_test_x",
      webhookSecret: "whsec_x",
    });
  });
});

describe("processStripeEvent", () => {
  it("marks the order PAID and confirms the booking", async () => {
    const { db, state } = classOrder();
    const r = await processStripeEvent(db, completed());
    expect(r).toMatchObject({ status: "paid", orderId: "ord_1", confirmedBookingIds: ["b1"] });
    expect(state.order.status).toBe("PAID");
    expect(state.bookings[0].status).toBe("CONFIRMED");
  });

  it("the same event twice: second call does nothing (idempotent by StripeEvent id)", async () => {
    const { db, state } = classOrder();
    expect((await processStripeEvent(db, completed())).status).toBe("paid");
    expect((await processStripeEvent(db, completed())).status).toBe("duplicate");
    expect(state.grants).toHaveLength(0);
  });

  it("a different event id for an already paid order: order is PAID only once, no second grant", async () => {
    const { db, state } = fakeDb({
      order: { id: "ord_1", userId: "u1", status: "PENDING", totalCents: 6000 },
      items: [{ type: "PACKAGE", refId: "p5", quantity: 1 }],
      packages: [{ id: "p5", credits: 5, validDays: 70, appliesTo: ["GROUP_CLASS"] }],
    });
    const ev = (id: string) => completed({ amount_total: 6000 }, id);
    expect((await processStripeEvent(db, ev("evt_a"))).status).toBe("paid");
    expect((await processStripeEvent(db, ev("evt_b"))).status).toBe("already-paid");
    expect(state.grants).toHaveLength(1);
  });

  it("package order grants credits with expiry from validDays", async () => {
    const { db, state } = fakeDb({
      order: { id: "ord_1", userId: "u1", status: "PENDING", totalCents: 6000 },
      items: [{ type: "PACKAGE", refId: "p5", quantity: 1 }],
      packages: [{ id: "p5", credits: 5, validDays: 70, appliesTo: ["GROUP_CLASS"] }],
    });
    const now = new Date("2026-11-10T10:00:00Z");
    const r = await processStripeEvent(db, completed({ amount_total: 6000 }), now);
    expect(r.status).toBe("paid");
    expect(state.grants).toHaveLength(1);
    expect(state.grants[0]).toMatchObject({ userId: "u1", creditsTotal: 5, creditsLeft: 5, source: "PURCHASE" });
    expect((state.grants[0].expiresAt as Date).toISOString()).toBe("2027-01-19T10:00:00.000Z");
  });

  it("wrong amount: order stays PENDING", async () => {
    const { db, state } = classOrder();
    const log = vi.fn();
    const r = await processStripeEvent(db, completed({ amount_total: 100 }), new Date(), log);
    expect(r).toEqual({ status: "ignored", reason: "amount mismatch" });
    expect(state.order.status).toBe("PENDING");
    expect(log).toHaveBeenCalled();
  });

  it("session not paid yet: ignored", async () => {
    const { db, state } = classOrder();
    const r = await processStripeEvent(db, completed({ payment_status: "unpaid" }));
    expect(r.status).toBe("ignored");
    expect(state.order.status).toBe("PENDING");
  });

  it("unknown order: ignored, nothing crashes", async () => {
    const { db } = classOrder();
    const dbNone = { $transaction: (fn: (t: unknown) => unknown) => (db as { $transaction: typeof fn }).$transaction((t: unknown) => fn({ ...(t as object), order: { findFirst: async () => null } })) } as never;
    expect((await processStripeEvent(dbNone, completed())).status).toBe("ignored");
  });

  it("unused event types are stored and ignored", async () => {
    const { db } = classOrder();
    const r = await processStripeEvent(db, { id: "evt_x", type: "customer.created", data: { object: {} } });
    expect(r.status).toBe("ignored");
  });

  it("expired checkout: order CANCELLED and the held seat is released", async () => {
    const { db, state } = classOrder();
    const r = await processStripeEvent(db, { id: "evt_e", type: "checkout.session.expired", data: { object: { id: "cs_1", client_reference_id: "ord_1" } } });
    expect(r).toEqual({ status: "cancelled", orderId: "ord_1" });
    expect(state.order.status).toBe("CANCELLED");
    expect(state.bookings[0]).toMatchObject({ status: "CANCELLED", userKey: null, slotKey: null });
  });

  it("paid after the hold was released: order is PAID, booking stays cancelled and a warning is logged", async () => {
    const { db, state } = fakeDb({
      order: { id: "ord_1", userId: "u1", status: "CANCELLED", totalCents: 1500 },
      items: [{ type: "CLASS", refId: "s1", quantity: 1 }],
      bookings: [{ id: "b1", status: "CANCELLED", orderId: "ord_1" }],
    });
    const log = vi.fn();
    const r = await processStripeEvent(db, completed(), new Date(), log);
    expect(r.status).toBe("paid");
    expect(state.order.status).toBe("PAID");
    expect(state.bookings[0].status).toBe("CANCELLED");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("already cancelled"));
  });
});

describe("createCheckoutSession", () => {
  it("sends order id, EUR cents and a 30 minute expiry to Stripe", async () => {
    const create = vi.fn().mockResolvedValue({ id: "cs_9", url: "https://checkout.stripe.test/x" });
    const now = new Date("2026-11-10T10:00:00Z");
    const s = await createCheckoutSession(
      { checkout: { sessions: { create } } } as never,
      { id: "ord_1", email: "a@b.test", currency: "EUR", items: [{ description: "Single class", quantity: 1, unitPriceCents: 1500 }] },
      { success: "https://x/ok", cancel: "https://x/no" },
      now,
    );
    expect(s.url).toBe("https://checkout.stripe.test/x");
    const arg = create.mock.calls[0][0];
    expect(arg).toMatchObject({
      mode: "payment",
      client_reference_id: "ord_1",
      metadata: { orderId: "ord_1" },
      customer_email: "a@b.test",
      expires_at: Math.floor(now.getTime() / 1000) + 1800,
    });
    expect(arg.line_items[0].price_data).toMatchObject({ currency: "eur", unit_amount: 1500 });
  });
});

describe("verifyWebhook", () => {
  it("rejects a missing signature", () => {
    expect(() => verifyWebhook({ webhooks: { constructEvent: vi.fn() } } as never, "{}", null, "whsec")).toThrow(/signature/);
  });
  it("passes the raw body, the signature and the secret to Stripe", () => {
    const constructEvent = vi.fn().mockReturnValue({ id: "evt_1", type: "x", data: { object: {} } });
    verifyWebhook({ webhooks: { constructEvent } } as never, "RAW", "sig", "whsec");
    expect(constructEvent).toHaveBeenCalledWith("RAW", "sig", "whsec");
  });
  it("a wrong signature throws (Stripe error is not swallowed)", () => {
    const constructEvent = vi.fn(() => {
      throw new Error("No signatures found matching");
    });
    expect(() => verifyWebhook({ webhooks: { constructEvent } } as never, "RAW", "bad", "whsec")).toThrow();
  });
});
