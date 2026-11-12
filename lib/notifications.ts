/** Emails about bookings. They go out through lib/mail.ts (logged only when Resend is off). */
import type { PrismaClient } from "./generated/prisma/client";
import { CANCELLATION_HOURS, EVENT_REFUND_DAYS } from "./booking-rules";
import { sendMail } from "./mail";
import { formatEuro } from "./orders-service";
import { BUSINESS_TZ, formatDateTime } from "./time";

type SessionForMail = {
  startsAt: Date;
  zoomUrl: string | null;
  location: string | null;
  offering: { title: string; mode: "ONLINE" | "IN_PERSON"; location: string | null; type?: string; eventPricing?: string | null };
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
      : `A friendly reminder about your class in the next ${CANCELLATION_HOURS} hours.`;
  const text = [
    intro,
    "",
    s.offering.title,
    when,
    where,
    "",
    s.offering.type === "EVENT"
      ? s.offering.eventPricing === "PAID"
        ? `Cancel up to ${EVENT_REFUND_DAYS} days before the event and get your money back. You can cancel in My account.`
        : "You can cancel any time before the event starts in My account."
      : `You can cancel up to ${CANCELLATION_HOURS} hours before the start in My account.`,
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

// ---------- Donations ----------

/** Thank-you email for a stand-alone donation. Plain text. No tax or charity claim (owner has not confirmed any). */
export function buildDonationThanksMail(to: string, amountCents: number, name?: string | null) {
  const amount = formatEuro(amountCents);
  const text = [
    name ? `Dear ${name.replace(/[\r\n]+/g, " ").trim()},` : "Hello,",
    "",
    `Thank you for your gift of ${amount}. Your donation has arrived. It means a lot to us.`,
    "",
    "KEA by Atiana (demo site)",
  ].join("\n");
  return { to, subject: "Thank you for your gift", text };
}

/**
 * Sends the thank-you email after the webhook marked a donation order PAID. Never throws.
 * Only for stand-alone donations: event donations (an order that has bookings) get the booking email instead.
 */
export async function sendDonationThanks(db: PrismaClient, orderId: string, name?: string | null) {
  try {
    const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true, bookings: { select: { id: true }, take: 1 } } });
    if (!order || order.status !== "PAID") return;
    if (order.bookings.length > 0 || !order.items.some((i) => i.type === "DONATION")) return;
    await sendMail(buildDonationThanksMail(order.email, order.totalCents, name));
  } catch (error) {
    console.error("[mail] donation thanks failed", error instanceof Error ? error.message : error);
  }
}
