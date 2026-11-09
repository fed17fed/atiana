"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { cancelBooking } from "@/lib/booking-service";
import { getCurrentUser } from "@/lib/session";

const schema = z.object({ bookingId: z.string().trim().min(1).max(60) });

/** Cancels one of MY bookings. The user comes from the session, never from the form. */
export async function cancelMyBooking(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=%2Faccount%2Fbookings");
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/account/bookings?cancel=error");

  const { prisma } = await import("@/lib/prisma");
  let outcome = "error";
  try {
    const r = await cancelBooking(prisma, { userId: user.id, bookingId: parsed.data.bookingId });
    if (r.ok) {
      outcome = r.creditReturned ? "returned" : r.paidWith === "CREDIT" ? "late" : r.paidWith === "STRIPE" ? "paid" : "ok";
    } else {
      outcome = r.code === "PAST" ? "past" : "error";
    }
  } catch (error) {
    console.error("[cancel] failed", error instanceof Error ? error.message : error);
  }
  redirect(`/account/bookings?cancel=${outcome}`);
}
