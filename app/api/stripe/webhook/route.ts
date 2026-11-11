import type { NextRequest } from "next/server";
import { sendBookingConfirmations, sendDonationThanks } from "@/lib/notifications";
import { getStripe, processStripeEvent, stripeConfig, verifyWebhook } from "@/lib/stripe-service";

/** Stripe webhook. OFF (503) without STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET. This is the only place that marks orders PAID. */
export async function POST(req: NextRequest) {
  const cfg = stripeConfig();
  if (!cfg) return Response.json({ error: "Payments are not active yet." }, { status: 503 });

  // The signature is checked against the exact raw body.
  const raw = await req.text();
  let event;
  try {
    event = verifyWebhook(getStripe(cfg.secretKey), raw, req.headers.get("stripe-signature"), cfg.webhookSecret);
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    const { prisma } = await import("@/lib/prisma");
    const result = await processStripeEvent(prisma, event);
    if (result.status === "paid" && result.confirmedBookingIds.length > 0) {
      await sendBookingConfirmations(prisma, result.confirmedBookingIds);
    }
    if (result.status === "paid") {
      // Stand-alone donation: thank-you email (off without Resend). The donor name is not saved.
      await sendDonationThanks(prisma, result.orderId);
    }
    return Response.json({ received: true, result: result.status });
  } catch (error) {
    console.error("[stripe webhook] failed", error instanceof Error ? error.message : error);
    // 500 makes Stripe try again later; the event is only stored when processing succeeded.
    return Response.json({ error: "Processing failed." }, { status: 500 });
  }
}
