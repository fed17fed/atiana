"use server";

import { redirect } from "next/navigation";
import { makeVerifyHuman, turnstileConfig } from "@/lib/contact-service";
import type { DonationState } from "@/lib/donation-amount";
import { clientIp } from "@/lib/client-ip";
import { headers } from "next/headers";
import { createDonationOrderLimited, DONATION_DESCRIPTION, hashIp, processDonation } from "@/lib/donation-service";
import { requestOrigin } from "@/lib/request-origin";
import { getCurrentUser } from "@/lib/session";
import { createCheckoutSession, getStripe, stripeConfig } from "@/lib/stripe-service";

/**
 * Donation form. No login needed. Card payment goes through Stripe Checkout (OFF without Stripe keys:
 * then nothing is saved). The webhook, not this action, marks the order PAID.
 */
export async function donate(_prev: DonationState, formData: FormData): Promise<DonationState> {
  const stripeCfg = stripeConfig();
  const turnstile = turnstileConfig();
  const user = await getCurrentUser();
  // Import inside the function: a missing DATABASE_URL must not crash the page.
  const { prisma } = await import("@/lib/prisma");

  // Only a hash of the IP is used (never the raw IP). See lib/client-ip.ts for which header is trusted.
  const ipHash = hashIp(clientIp(await headers()));

  const result = await processDonation(Object.fromEntries(formData.entries()), {
    paymentsOn: stripeCfg !== null,
    ipHash,
    user: user ? { id: user.id, email: user.email } : null,
    verifyHuman: turnstile ? makeVerifyHuman(turnstile.secret) : undefined,
    // Limit check + order creation in one locked transaction (parallel starts cannot pass the limit).
    createOrder: (input) => createDonationOrderLimited(prisma, input),
    startCheckout: async ({ orderId, email, amountCents }) => {
      const origin = await requestOrigin();
      const session = await createCheckoutSession(
        getStripe(stripeCfg!.secretKey),
        {
          id: orderId,
          email,
          currency: "EUR",
          items: [{ description: DONATION_DESCRIPTION, quantity: 1, unitPriceCents: amountCents }],
        },
        { success: `${origin}/donate?done=1`, cancel: `${origin}/donate?cancelled=1` },
      );
      await prisma.order.update({ where: { id: orderId }, data: { stripeSessionId: session.id } });
      return session.url;
    },
    cancelOrder: async (orderId) => {
      await prisma.order.updateMany({ where: { id: orderId, status: "PENDING" }, data: { status: "CANCELLED" } });
    },
    log: (message, error) => console.error(`[donate] ${message}`, error instanceof Error ? error.message : (error ?? "")),
  });

  if (result.status === "redirect") redirect(result.url);
  return result;
}
