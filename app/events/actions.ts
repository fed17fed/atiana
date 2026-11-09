"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { parseEuroToCents } from "@/lib/booking-rules";
import { cancelEventRegistration, registerForEvent, type EventErrorCode } from "@/lib/event-service";
import { sendBookingConfirmations } from "@/lib/notifications";
import { requestOrigin } from "@/lib/request-origin";
import { getCurrentUser } from "@/lib/session";
import { createCheckoutSession, getStripe, PAYMENTS_OFF_MESSAGE, stripeConfig } from "@/lib/stripe-service";

export type EventState =
  | { status: "idle" }
  | { status: "error"; message: string; field?: "disclaimer" | "amount" }
  | { status: "demo-off"; message: string };

const schema = z.object({
  sessionId: z.string().trim().min(1).max(60),
  disclaimer: z.literal("on", { error: "Please tick the box to continue." }),
  amount: z.string().max(20).optional(),
});

const ERROR_TEXT: Record<EventErrorCode, string> = {
  NOT_FOUND: "Sorry, we could not register you. Please try again.",
  CLOSED: "Registration is closed.",
  FULL: "This event is full. Join the newsletter and we will tell you about new dates.",
  ALREADY_REGISTERED: "You are registered for this event.",
  DISCLAIMER: "Please tick the box to continue.",
  AMOUNT_INVALID: "Please enter an amount of €0 or more.",
  AMOUNT_TOO_SMALL: "Card payments start at €0.50. Please choose €0 or at least €0.50.",
  AMOUNT_TOO_BIG: "This amount is too large for an online payment. Please write to us.",
  NO_PRICE: "Sorry, we could not register you. Please try again.",
  PAYMENTS_OFF: PAYMENTS_OFF_MESSAGE,
};

/** Registers the logged-in user for an event. Card payments use Stripe Checkout (OFF without Stripe keys). */
export async function registerEvent(_prev: EventState, formData: FormData): Promise<EventState> {
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { status: "error", message: issue.message, field: issue.path[0] === "disclaimer" ? "disclaimer" : undefined };
  }
  const { sessionId, amount } = parsed.data;

  const { prisma } = await import("@/lib/prisma");
  // We need the slug for the login return address and the redirect.
  const row = await prisma.classSession
    .findUnique({ where: { id: sessionId }, select: { offering: { select: { slug: true, type: true } } } })
    .catch(() => null);
  if (!row || row.offering.type !== "EVENT") return { status: "error", message: ERROR_TEXT.NOT_FOUND };
  const slug = row.offering.slug;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/events/${slug}`)}`);

  const stripeCfg = stripeConfig();
  let donationCents: number | null = null;
  if (amount !== undefined) donationCents = amount.trim() === "" ? null : parseEuroToCents(amount);

  let result;
  try {
    result = await registerForEvent(prisma, {
      userId: user.id,
      sessionId,
      disclaimerAccepted: true,
      donationCents,
      paymentsOn: stripeCfg !== null,
    });
  } catch (error) {
    console.error("[event] register failed", error instanceof Error ? error.message : error);
    return { status: "error", message: ERROR_TEXT.NOT_FOUND };
  }
  if (!result.ok) {
    if (result.code === "PAYMENTS_OFF") return { status: "demo-off", message: PAYMENTS_OFF_MESSAGE };
    const field = result.code.startsWith("AMOUNT") ? "amount" : result.code === "DISCLAIMER" ? "disclaimer" : undefined;
    return { status: "error", message: ERROR_TEXT[result.code], field };
  }

  if (result.status === "CONFIRMED") {
    await sendBookingConfirmations(prisma, [result.bookingId]);
    redirect(`/events/${slug}?done=1`);
  }

  // Card: Stripe Checkout. The webhook (not this page) marks the order PAID and confirms the place.
  let url: string | null = null;
  try {
    const origin = await requestOrigin();
    const session = await createCheckoutSession(
      getStripe(stripeCfg!.secretKey),
      { id: result.orderId!, email: user.email, currency: "EUR", items: [{ description: result.description, quantity: 1, unitPriceCents: result.amountCents }] },
      { success: `${origin}/events/${slug}?done=1`, cancel: `${origin}/events/${slug}` },
    );
    await prisma.order.update({ where: { id: result.orderId! }, data: { stripeSessionId: session.id } });
    url = session.url;
  } catch (error) {
    console.error("[event] Stripe checkout failed", error instanceof Error ? error.message : error);
  }
  if (!url) {
    await cancelEventRegistration(prisma, { userId: user.id, bookingId: result.bookingId }); // give the place back
    return { status: "error", message: "Sorry, we could not register you. Please try again." };
  }
  redirect(url);
}
