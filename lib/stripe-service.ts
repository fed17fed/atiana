/**
 * Stripe Checkout + webhook. OFF unless STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are both set.
 * Rule: ONLY the webhook marks an order PAID (processStripeEvent). It is idempotent:
 * a Stripe event id is stored once in StripeEvent, and an order changes PENDING -> PAID only once.
 */
import Stripe from "stripe";
import type { Prisma, PrismaClient } from "./generated/prisma/client";
import type { EnvLike } from "./mail";
import { creditExpiry, HOLD_MINUTES } from "./booking-rules";

export function stripeConfig(env: EnvLike = process.env) {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  return secretKey && webhookSecret ? { secretKey, webhookSecret } : null;
}

export const PAYMENTS_OFF_MESSAGE =
  "Demo: payments are not active yet. Online payment will be switched on when the Stripe keys are added.";

export function getStripe(secretKey: string) {
  return new Stripe(secretKey);
}

export type CheckoutOrder = {
  id: string;
  email: string;
  currency: string;
  items: { description: string; quantity: number; unitPriceCents: number }[];
  /** Extra Stripe metadata (for example the donor name). orderId is always set by us. */
  metadata?: Record<string, string>;
};

/** Creates a Stripe Checkout Session for an unpaid order. The order id is stored on the session. */
export async function createCheckoutSession(
  stripe: Pick<Stripe, "checkout">,
  order: CheckoutOrder,
  urls: { success: string; cancel: string },
  now: Date = new Date(),
) {
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.email,
    client_reference_id: order.id,
    metadata: { ...(order.metadata ?? {}), orderId: order.id },
    line_items: order.items.map((i) => ({
      quantity: i.quantity,
      price_data: {
        currency: order.currency.toLowerCase(),
        unit_amount: i.unitPriceCents,
        product_data: { name: i.description },
      },
    })),
    success_url: urls.success,
    cancel_url: urls.cancel,
    // Stripe minimum is 30 minutes. Same time as the seat hold.
    expires_at: Math.floor(now.getTime() / 1000) + HOLD_MINUTES * 60,
  });
  return session;
}

// ---------- Webhook ----------

export type StripeEventLike = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export type ProcessResult =
  | { status: "duplicate" }
  | { status: "ignored"; reason: string }
  | { status: "paid"; orderId: string; confirmedBookingIds: string[]; grantIds: string[] }
  | { status: "already-paid"; orderId: string }
  | { status: "cancelled"; orderId: string }
  | { status: "refunded"; orderId: string };

type Tx = Prisma.TransactionClient;

/** Handles one verified Stripe event. Safe to call many times with the same event. */
export async function processStripeEvent(
  db: Pick<PrismaClient, "$transaction">,
  event: StripeEventLike,
  now: Date = new Date(),
  log: (m: string) => void = (m) => console.warn(m),
): Promise<ProcessResult> {
  return db.$transaction(async (tx: Tx): Promise<ProcessResult> => {
    // Idempotency: the first insert wins. Count 0 = we saw this event already.
    const inserted = await tx.stripeEvent.createMany({
      data: [{ id: event.id, type: event.type }],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return { status: "duplicate" };

    if (event.type === "charge.refunded") {
      // Stripe confirms the money went back: only now the order becomes REFUNDED.
      const charge = event.data.object as { payment_intent?: string | null; refunded?: boolean };
      if (!charge.payment_intent || charge.refunded !== true) return { status: "ignored", reason: "refund not complete" };
      const found = await tx.order.findFirst({ where: { stripePaymentIntentId: charge.payment_intent } });
      if (!found) return { status: "ignored", reason: "order not found" };
      const r = await tx.order.updateMany({ where: { id: found.id, status: "PAID" }, data: { status: "REFUNDED" } });
      return r.count === 1 ? { status: "refunded", orderId: found.id } : { status: "ignored", reason: "order is not paid" };
    }

    if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.expired") {
      return { status: "ignored", reason: `event type ${event.type} is not used` };
    }

    const obj = event.data.object as {
      id?: string;
      client_reference_id?: string | null;
      payment_status?: string;
      payment_intent?: string | null;
      amount_total?: number | null;
      currency?: string | null;
    };
    const stripeSessionId = typeof obj.id === "string" ? obj.id : null;
    const orderRef = typeof obj.client_reference_id === "string" ? obj.client_reference_id : null;
    if (!stripeSessionId && !orderRef) return { status: "ignored", reason: "no session id" };

    const order = await tx.order.findFirst({
      where: {
        OR: [
          ...(stripeSessionId ? [{ stripeSessionId }] : []),
          ...(orderRef ? [{ id: orderRef }] : []),
        ],
      },
      include: { items: true },
    });
    if (!order) return { status: "ignored", reason: "order not found" };

    if (event.type === "checkout.session.expired") {
      const r = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      if (r.count === 1) {
        await tx.booking.updateMany({
          where: { orderId: order.id, status: "PENDING" },
          data: { status: "CANCELLED", userKey: null, slotKey: null },
        });
        return { status: "cancelled", orderId: order.id };
      }
      return { status: "ignored", reason: "order is not pending" };
    }

    // checkout.session.completed
    if (obj.payment_status !== "paid") return { status: "ignored", reason: "not paid yet" };
    if (typeof obj.amount_total === "number" && obj.amount_total !== order.totalCents) {
      log(`[stripe] amount mismatch for order ${order.id}: stripe ${obj.amount_total}, order ${order.totalCents}`);
      return { status: "ignored", reason: "amount mismatch" };
    }

    // Only one caller can change PENDING -> PAID. A cancelled (expired hold) order that was paid is also accepted.
    const paid = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["PENDING", "CANCELLED"] } },
      data: {
        status: "PAID",
        paidAt: now,
        stripeSessionId: stripeSessionId ?? order.stripeSessionId,
        ...(typeof obj.payment_intent === "string" ? { stripePaymentIntentId: obj.payment_intent } : {}),
      },
    });
    if (paid.count !== 1) return { status: "already-paid", orderId: order.id };

    const confirmedBookingIds: string[] = [];
    const grantIds: string[] = [];

    const sessionItems = order.items.filter((i) => i.type === "CLASS" || i.type === "ONE_TO_ONE" || i.type === "EVENT" || i.type === "DONATION");
    if (sessionItems.length > 0) {
      const bookings = await tx.booking.findMany({ where: { orderId: order.id } });
      for (const b of bookings) {
        if (b.status === "PENDING") {
          const r = await tx.booking.updateMany({
            where: { id: b.id, status: "PENDING" },
            data: { status: "CONFIRMED" },
          });
          if (r.count === 1) confirmedBookingIds.push(b.id);
        } else if (b.status === "CANCELLED") {
          // Paid after the seat hold was released. Needs a human (refund or new seat).
          log(`[stripe] order ${order.id} was paid but booking ${b.id} was already cancelled. Check and refund or rebook.`);
        }
      }
    }

    for (const item of order.items.filter((i) => i.type === "PACKAGE")) {
      if (!item.refId) continue;
      const pack = await tx.package.findUnique({ where: { id: item.refId } });
      if (!pack || !order.userId) {
        log(`[stripe] order ${order.id}: package or user missing; credits NOT granted`);
        continue;
      }
      for (let n = 0; n < item.quantity; n++) {
        const grant = await tx.creditGrant.create({
          data: {
            userId: order.userId,
            packageId: pack.id,
            creditsTotal: pack.credits,
            creditsLeft: pack.credits,
            expiresAt: creditExpiry(now, pack.validDays),
            appliesTo: pack.appliesTo,
            source: "PURCHASE",
          },
        });
        grantIds.push(grant.id);
      }
    }

    return { status: "paid", orderId: order.id, confirmedBookingIds, grantIds };
  }, { maxWait: 10_000, timeout: 20_000 });
}

/** Verifies the Stripe signature. Throws when the signature is wrong. */
export function verifyWebhook(
  stripe: Pick<Stripe, "webhooks">,
  rawBody: string,
  signature: string | null,
  secret: string,
): StripeEventLike {
  if (!signature) throw new Error("Missing stripe-signature header");
  return stripe.webhooks.constructEvent(rawBody, signature, secret) as unknown as StripeEventLike;
}

/**
 * Builds the refund function for cancelBooking. One idempotency key per booking: asking twice gives the same refund.
 * The payment intent comes from the order (saved by the webhook) or, if missing, from the Checkout Session.
 */
export function makeRefunder(
  stripe: Pick<Stripe, "refunds" | "checkout">,
  db: Pick<PrismaClient, "order">,
) {
  return async ({ orderId, bookingId }: { orderId: string; bookingId: string }) => {
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "PAID") throw new Error("Order is not paid");
    let paymentIntent = order.stripePaymentIntentId;
    if (!paymentIntent && order.stripeSessionId) {
      const s = await stripe.checkout.sessions.retrieve(order.stripeSessionId);
      paymentIntent = typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null);
    }
    if (!paymentIntent) throw new Error("No payment found for this order");
    await stripe.refunds.create(
      { payment_intent: paymentIntent, metadata: { orderId, bookingId } },
      { idempotencyKey: `refund-booking-${bookingId}` },
    );
  };
}
