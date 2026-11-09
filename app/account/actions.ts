"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cancelBooking } from "@/lib/booking-service";
import { cancelEventRegistration } from "@/lib/event-service";
import { getCurrentUser } from "@/lib/session";
import { getStripe, makeRefunder, stripeConfig } from "@/lib/stripe-service";

const schema = z.object({
  bookingId: z.string().trim().min(1).max(60),
  refund: z.enum(["credit", "money"]).optional(),
});

/** Cancels one of MY bookings. The user comes from the session, never from the form. */
export async function cancelMyBooking(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount%2Fbookings");
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/account/bookings?cancel=error");

  const choice = parsed.data.refund === "money" ? "MONEY" : parsed.data.refund === "credit" ? "CREDIT" : undefined;
  const stripeCfg = stripeConfig();
  // Money back needs Stripe. Without keys nothing is changed and the client sees the demo message.
  if (choice === "MONEY" && !stripeCfg) redirect("/account/bookings?cancel=money_off");

  const { prisma } = await import("@/lib/prisma");
  let outcome = "error";
  try {
    const r = await cancelBooking(prisma, {
      userId: user.id,
      bookingId: parsed.data.bookingId,
      refundChoice: choice,
      refund: stripeCfg ? makeRefunder(getStripe(stripeCfg.secretKey), prisma) : undefined,
    });
    if (r.ok) {
      outcome =
        r.refund === "CREDIT" ? "credit_given" : r.refund === "MONEY" ? "refund_requested" : r.creditReturned ? "returned" : r.paidWith === "CREDIT" ? (r.early ? "credit_expired" : "late") : r.paidWith === "STRIPE" ? "late_paid" : "ok";
    } else {
      outcome =
        r.code === "PAST" ? "past" : r.code === "CHOICE_REQUIRED" ? "choose" : r.code === "REFUND_FAILED" ? "refund_failed" : r.code === "REFUND_OFF" ? "money_off" : "error";
    }
  } catch (error) {
    console.error("[cancel] failed", error instanceof Error ? error.message : error);
  }
  redirect(`/account/bookings?cancel=${outcome}`);
}

/** Cancels MY place at an event. Rules (7 days for tickets, donations never refunded) live in lib/event-service.ts. */
export async function cancelMyEventPlace(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount%2Fbookings");
  const parsed = z.object({ bookingId: z.string().trim().min(1).max(60) }).safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/account/bookings?cancel=error");

  const stripeCfg = stripeConfig();
  const { prisma } = await import("@/lib/prisma");
  let outcome = "error";
  try {
    const r = await cancelEventRegistration(prisma, {
      userId: user.id,
      bookingId: parsed.data.bookingId,
      refund: stripeCfg ? makeRefunder(getStripe(stripeCfg.secretKey), prisma) : undefined,
    });
    if (r.ok) {
      outcome = r.reason === "TICKET_EARLY" ? "event_refund" : r.reason === "TICKET_LATE" ? "event_no_refund" : "event_done";
    } else {
      outcome = r.code === "PAST" ? "past" : r.code === "REFUND_OFF" ? "event_money_off" : r.code === "REFUND_FAILED" ? "refund_failed" : "error";
    }
  } catch (error) {
    console.error("[event cancel] failed", error instanceof Error ? error.message : error);
  }
  redirect(`/account/bookings?cancel=${outcome}`);
}
