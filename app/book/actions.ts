"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cancelBooking, createBooking, type BookingErrorCode } from "@/lib/booking-service";
import { sendBookingConfirmations } from "@/lib/notifications";
import { createPackageOrder } from "@/lib/orders-service";
import { requestOrigin } from "@/lib/request-origin";
import { getCurrentUser } from "@/lib/session";
import { createCheckoutSession, getStripe, PAYMENTS_OFF_MESSAGE, stripeConfig } from "@/lib/stripe-service";

export type BookState =
  | { status: "idle" }
  | { status: "error"; message: string; field?: "disclaimer" | "pay" }
  | { status: "demo-off"; message: string };

const bookSchema = z.object({
  sessionId: z.string().trim().min(1).max(60),
  kind: z.enum(["class", "one"]),
  pay: z.enum(["card", "credit"], { error: "Please choose how you want to pay." }),
  disclaimer: z.literal("on", { error: "Please confirm that you have read the Health Disclaimer." }),
});

const ERROR_TEXT: Record<BookingErrorCode, string> = {
  NOT_FOUND: "This class is not available any more.",
  PAST: "This class has already started.",
  FULL: "Sorry, this class is full now. Please choose another time.",
  ALREADY_BOOKED: "You already have a booking for this class. See My bookings.",
  NO_CREDIT: "You have no usable credit for this booking. You can pay by card instead.",
  NO_PRICE: "This class has no price yet. Please try again later.",
  DISCLAIMER: "Please confirm that you have read the Health Disclaimer.",
  TYPE_MISMATCH: "This booking page does not match the class. Please start again from the schedule.",
};

/** Books a class or a 1:1 slot. Card payments start Stripe Checkout (OFF without Stripe keys). */
export async function startBooking(_prev: BookState, formData: FormData): Promise<BookState> {
  const parsed = bookSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0] === "disclaimer" ? "disclaimer" : issue.path[0] === "pay" ? "pay" : undefined;
    return { status: "error", message: issue.message, field };
  }
  const { sessionId, kind, pay } = parsed.data;
  const backPath = kind === "one" ? `/one-to-one/book?slot=${sessionId}` : `/book/class?session=${sessionId}`;

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(backPath)}`);

  const stripeCfg = stripeConfig();
  // Nothing is reserved when the payment cannot start.
  if (pay === "card" && !stripeCfg) return { status: "demo-off", message: PAYMENTS_OFF_MESSAGE };

  const { prisma } = await import("@/lib/prisma");
  let result;
  try {
    result = await createBooking(prisma, {
      userId: user.id,
      sessionId,
      method: pay === "credit" ? "CREDIT" : "STRIPE",
      disclaimerAccepted: true,
      expectType: kind === "one" ? "ONE_TO_ONE" : "GROUP_CLASS",
    });
  } catch (error) {
    console.error("[book] failed", error instanceof Error ? error.message : error);
    return { status: "error", message: "Sorry, something went wrong. Please try again." };
  }
  if (!result.ok) return { status: "error", message: ERROR_TEXT[result.code], field: result.code === "NO_CREDIT" ? "pay" : undefined };

  if (pay === "credit") {
    await sendBookingConfirmations(prisma, [result.bookingId]);
    redirect("/account/bookings?booked=1");
  }

  // Card: Stripe Checkout. The webhook (not this page) marks the order PAID.
  let checkoutUrl: string | null = null;
  try {
    const origin = await requestOrigin();
    const session = await createCheckoutSession(
      getStripe(stripeCfg!.secretKey),
      {
        id: result.orderId!,
        email: user.email,
        currency: "EUR",
        items: [{ description: result.description, quantity: 1, unitPriceCents: result.amountCents }],
      },
      { success: `${origin}/account/bookings?paid=1`, cancel: `${origin}${backPath}` },
    );
    await prisma.order.update({ where: { id: result.orderId! }, data: { stripeSessionId: session.id } });
    checkoutUrl = session.url;
  } catch (error) {
    console.error("[book] Stripe checkout failed", error instanceof Error ? error.message : error);
  }
  if (!checkoutUrl) {
    // Give the seat back right away.
    await cancelBooking(prisma, { userId: user.id, bookingId: result.bookingId });
    return { status: "error", message: "We could not start the payment. Your seat was not kept. Please try again." };
  }
  redirect(checkoutUrl);
}

const packSchema = z.object({ packageId: z.string().trim().min(1).max(60) });

export type PackState = BookState;

/** Buys a class pack with Stripe Checkout (OFF without Stripe keys). Credits arrive after the webhook. */
export async function buyPack(_prev: PackState, formData: FormData): Promise<PackState> {
  const parsed = packSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", message: "Please choose a pack." };

  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/classes#packs")}`);

  const stripeCfg = stripeConfig();
  if (!stripeCfg) return { status: "demo-off", message: PAYMENTS_OFF_MESSAGE };

  const { prisma } = await import("@/lib/prisma");
  let url: string | null = null;
  try {
    const order = await createPackageOrder(prisma, { userId: user.id, packageId: parsed.data.packageId });
    if (!order.ok) return { status: "error", message: "This pack is not available." };
    const origin = await requestOrigin();
    const session = await createCheckoutSession(
      getStripe(stripeCfg.secretKey),
      {
        id: order.orderId,
        email: order.email,
        currency: order.currency,
        items: [{ description: order.description, quantity: 1, unitPriceCents: order.amountCents }],
      },
      { success: `${origin}/account/credits?paid=1`, cancel: `${origin}/classes#packs` },
    );
    await prisma.order.update({ where: { id: order.orderId }, data: { stripeSessionId: session.id } });
    url = session.url;
  } catch (error) {
    console.error("[pack] Stripe checkout failed", error instanceof Error ? error.message : error);
  }
  if (!url) return { status: "error", message: "We could not start the payment. Please try again." };
  redirect(url);
}
