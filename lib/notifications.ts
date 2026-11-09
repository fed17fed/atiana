/** Emails about bookings. They go out through lib/mail.ts (logged only when Resend is off). */
import type { PrismaClient } from "./generated/prisma/client";
import { CANCELLATION_HOURS } from "./booking-rules";
import { sendMail } from "./mail";
import { BUSINESS_TZ, formatDateTime } from "./time";

type SessionForMail = {
  startsAt: Date;
  zoomUrl: string | null;
  location: string | null;
  offering: { title: string; mode: "ONLINE" | "IN_PERSON"; location: string | null };
};

export function buildBookingMail(
  kind: "confirmation" | "reminder",
  to: string,
  s: SessionForMail,
) {
  const when = `${formatDateTime(s.startsAt, BUSINESS_TZ)} (${BUSINESS_TZ} time)`;
  const where =
    s.offering.mode === "ONLINE"
      ? s.zoomUrl
        ? `Zoom link: ${s.zoomUrl}`
        : "Your Zoom link will be sent before the class."
      : `Place: ${s.location ?? s.offering.location ?? "see My account"}`;
  const subject =
    kind === "confirmation"
      ? `You are booked: ${s.offering.title}`
      : `Reminder: ${s.offering.title} is coming up`;
  const intro =
    kind === "confirmation"
      ? "Your booking is confirmed."
      : "A friendly reminder about your class in the next 24 hours.";
  const text = [
    intro,
    "",
    s.offering.title,
    when,
    where,
    "",
    `You can cancel up to ${CANCELLATION_HOURS} hours before the start in My account.`,
    "",
    "KEA by Atiana (demo site)",
  ].join("\n");
  return { to, subject, text };
}

/** Sends the confirmation (with the Zoom link) for bookings that are CONFIRMED. Never throws. */
export async function sendBookingConfirmations(db: PrismaClient, bookingIds: string[]) {
  for (const id of bookingIds) {
    try {
      const b = await db.booking.findUnique({
        where: { id },
        include: { user: true, session: { include: { offering: true } } },
      });
      // The Zoom link goes out only for CONFIRMED bookings.
      if (!b || b.status !== "CONFIRMED") continue;
      await sendMail(buildBookingMail("confirmation", b.user.email, b.session));
    } catch (error) {
      console.error("[mail] confirmation failed", error instanceof Error ? error.message : error);
    }
  }
}
