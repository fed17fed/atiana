import type { Metadata } from "next";
import Link from "next/link";
import { cancelMyBooking, cancelMyEventPlace } from "@/app/account/actions";
import { LocalTime } from "@/components/booking/LocalTime";
import { DbNotice } from "@/components/ui/DbNotice";
import { Icon } from "@/components/ui/Icon";
import { getMyBookings } from "@/lib/account-queries";
import { CANCELLATION_HOURS, CANCEL_CREDIT_VALID_DAYS, EVENT_REFUND_DAYS, canCancel, isEventRefundable, isRefundable } from "@/lib/booking-rules";
import { mailConfig } from "@/lib/mail";
import { safeDb } from "@/lib/safe";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "My bookings" };

const NOTES: Record<string, { cls: string; text: string }> = {
  booked: { cls: "a-success", text: "You are booked. We sent a confirmation to your email." },
  paid: { cls: "a-success", text: "Thank you. Your payment is being confirmed. Your booking shows as Confirmed in a moment." },
  returned: { cls: "a-success", text: "Your booking is cancelled and your credit was returned." },
  credit_expired: { cls: "a-warn", text: "Your booking is cancelled. The credit you used has expired, so it cannot be returned." },
  booked_demo: { cls: "a-success", text: "You are booked. Demo: confirmation emails are not active yet. Your Zoom link is shown below." },
  event_refund: { cls: "a-success", text: "Your place is cancelled. Your refund was started. [MAIL]" },
  event_no_refund: { cls: "a-warn", text: `Your place is cancelled. No refund, because the event is less than ${EVENT_REFUND_DAYS} days away.` },
  event_money_off: { cls: "a-warn", text: "Demo: money back is not active yet because the Stripe keys are not added. Nothing was changed, your place is still saved." },
  event_donation: { cls: "a-warn", text: "Your place is cancelled. Your donation is not refunded." },
  event_done: { cls: "a-success", text: "Your place is cancelled. Thank you for letting us know." },
  late: { cls: "a-warn", text: `Your booking is cancelled. It was less than ${CANCELLATION_HOURS} hours before the start, so the credit is not returned.` },
  credit_given: { cls: "a-success", text: "Your booking is cancelled. We added 1 class credit to your account (see My credits)." },
  refund_requested: { cls: "a-success", text: "Your booking is cancelled and your money-back request was sent. The order shows as Refunded when the card payment is returned." },
  late_paid: { cls: "a-warn", text: `Your booking is cancelled. It was less than ${CANCELLATION_HOURS} hours before the start, so there is no credit and no refund.` },
  choose: { cls: "a-error", text: "Please choose: a class credit or your money back." },
  money_off: { cls: "a-warn", text: "Demo: money back is not active yet because the Stripe keys are not added. Nothing was changed. You can choose a class credit instead." },
  refund_failed: { cls: "a-error", text: "We could not start the refund, so your booking was not cancelled. Please try again or contact us." },
  ok: { cls: "a-success", text: "Your booking is cancelled." },
  past: { cls: "a-error", text: "This class has already started and cannot be cancelled online." },
  error: { cls: "a-error", text: "Sorry, we could not cancel this booking." },
};

const STATUS: Record<string, { label: string; cls: string }> = {
  CONFIRMED: { label: "Confirmed", cls: "s-confirmed" },
  PENDING: { label: "Waiting for payment", cls: "s-pending" },
  CANCELLED: { label: "Cancelled", cls: "s-cancelled" },
  ATTENDED: { label: "Attended", cls: "s-past" },
  NO_SHOW: { label: "Missed", cls: "s-past" },
};

export default async function BookingsPage({ searchParams }: PageProps<"/account/bookings">) {
  const user = await requireUser("/account/bookings");
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const noteKey = one(sp.booked) ? (one(sp.booked) === "demo" ? "booked_demo" : "booked") : one(sp.paid) ? "paid" : (one(sp.cancel) ?? "");
  const base = NOTES[noteKey];
  const note = base && { ...base, text: base.text.replace(" [MAIL]", mailConfig() === null ? " Demo: confirmation emails are not active yet." : "") };

  const bookings = await safeDb("my bookings", async () => {
    const { prisma } = await import("@/lib/prisma");
    return getMyBookings(prisma, user.id);
  });
  if (!bookings) return <DbNotice what="your bookings" />;

  const now = new Date();
  const upcoming = bookings.filter((b) => b.startsAt > now && b.status !== "CANCELLED" && !b.staleHold).reverse();
  const rest = bookings.filter((b) => !(b.startsAt > now && b.status !== "CANCELLED" && !b.staleHold));

  const card = (b: (typeof bookings)[number]) => {
    const st = STATUS[b.status];
    const active = (b.status === "CONFIRMED" || b.status === "PENDING") && canCancel(b.startsAt, now) && !b.staleHold;
    const early = isRefundable(b.startsAt, now);
    return (
      <li className="acc-card" key={b.id}>
        <div className="row">
          <h3>{b.title}</h3>
          <span className={`status ${b.sessionCancelled || b.staleHold ? "s-cancelled" : st.cls}`}>{b.sessionCancelled ? "Cancelled by KEA" : b.staleHold ? "Payment not completed" : st.label}</span>
        </div>
        <div className="meta">
          <span>
            <LocalTime iso={b.startsAt.toISOString()} format="dayTime" />
          </span>
          <span>{b.mode === "ONLINE" ? "Online · Zoom" : "In person"}</span>
          <span>{b.type === "EVENT" ? (b.eventPricing === "PAID" ? "Event ticket" : "Event") : b.paidWith === "CREDIT" ? "Paid with a credit" : b.paidWith === "STRIPE" ? "Paid by card" : ""}</span>
        </div>
        {b.status === "CONFIRMED" && b.zoomUrl && (
          <p style={{ margin: 0 }}>
            <Icon name="video" className="size-5! inline-block align-middle" />{" "}
            <a href={b.zoomUrl} target="_blank" rel="noopener noreferrer">
              Open the Zoom link
            </a>
          </p>
        )}
        {b.status === "CONFIRMED" && !b.zoomUrl && b.location && <p style={{ margin: 0 }}>Place: {b.location}</p>}
        {b.staleHold && <p className="note">The payment was not completed in time, so the seat was released. You can book again.</p>}
        {b.status === "PENDING" && !b.staleHold && <p className="note">{b.mode === "ONLINE" ? "The Zoom link is shown after the payment is confirmed." : "The place is shown after the payment is confirmed."}</p>}
        {b.type === "EVENT" && b.sessionCancelled && (
          <p className="note">We cancelled this event. If you paid for a ticket, you get all your money back.</p>
        )}
        {b.type === "EVENT" && active && !b.sessionCancelled && (
          <form action={cancelMyEventPlace} className="row">
            <input type="hidden" name="bookingId" value={b.id} />
            <p className="note">
              {b.ticketPaid
                ? isEventRefundable(b.startsAt, now)
                  ? "Cancel your place? We will send your refund to your card."
                  : `The event starts in less than ${EVENT_REFUND_DAYS} days. If you cancel now, you will not get your money back. Cancel anyway?`
                : b.eventPricing === "DONATION"
                  ? "You can cancel any time before the event starts. A donation is not refunded, also when you cancel before the event."
                  : "You can cancel any time before the event starts. Please cancel if you cannot come, so someone else can take your spot."}
            </p>
            <button className="btn btn-outline btn-sm" type="submit">
              Cancel my place
            </button>
          </form>
        )}
        {b.type !== "EVENT" && active && b.status === "CONFIRMED" && b.paidWith === "STRIPE" && early && (
          <form action={cancelMyBooking} className="stack">
            <input type="hidden" name="bookingId" value={b.id} />
            <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
              <legend className="legend" style={{ marginBottom: 6 }}>
                Cancel this booking and get:
              </legend>
              <label className="optcard">
                <span className="check radio">
                  <input type="radio" name="refund" value="credit" defaultChecked />
                  <span className="box" />
                  <span className="txt">
                    <b>1 class credit</b>
                    <small>Use it for another booking. Valid for {CANCEL_CREDIT_VALID_DAYS / 7} weeks.</small>
                  </span>
                </span>
              </label>
              <label className="optcard">
                <span className="check radio">
                  <input type="radio" name="refund" value="money" />
                  <span className="box" />
                  <span className="txt">
                    <b>Money back</b>
                    <small>Refund to your card (can take a few days).</small>
                  </span>
                </span>
              </label>
            </fieldset>
            <div className="row">
              <p className="note">You cancel at least {CANCELLATION_HOURS} hours before the start.</p>
              <button className="btn btn-outline btn-sm" type="submit">
                Cancel booking
              </button>
            </div>
          </form>
        )}
        {b.type !== "EVENT" && active && !(b.status === "CONFIRMED" && b.paidWith === "STRIPE" && early) && (
          <form action={cancelMyBooking} className="row">
            <input type="hidden" name="bookingId" value={b.id} />
            <p className="note">
              {b.paidWith === "CREDIT"
                ? b.creditExpired
                  ? "This credit has expired, so it cannot be returned if you cancel."
                  : early
                  ? "Cancelling now returns your credit."
                  : `Less than ${CANCELLATION_HOURS} hours before the start: cancelling does not return your credit.`
                : b.paidWith === "STRIPE" && b.status === "CONFIRMED"
                  ? `Less than ${CANCELLATION_HOURS} hours before the start: cancelling gives no credit and no refund.`
                  : `You can cancel up to ${CANCELLATION_HOURS} hours before the start.`}
            </p>
            <button className="btn btn-outline btn-sm" type="submit">
              Cancel booking
            </button>
          </form>
        )}
      </li>
    );
  };

  return (
    <div className="grid gap-6">
      {note && (
        <div className={`alert ${note.cls}`} role="status">
          <Icon name={note.cls === "a-error" ? "error" : note.cls === "a-warn" ? "info" : "check"} />
          <div>
            <p>{note.text}</p>
          </div>
        </div>
      )}
      <section aria-labelledby="up-h">
        <h2 id="up-h" className="!text-2xl">Upcoming</h2>
        {upcoming.length === 0 ? (
          <div className="empty">
            <h3>No upcoming bookings</h3>
            <p>Pick a class on the schedule.</p>
            <Link className="btn btn-primary" href="/schedule">
              See the schedule
            </Link>
          </div>
        ) : (
          <ul className="acc-list">{upcoming.map(card)}</ul>
        )}
      </section>
      {rest.length > 0 && (
        <section aria-labelledby="past-h">
          <h2 id="past-h" className="!text-2xl">Past and cancelled</h2>
          <ul className="acc-list">{rest.map(card)}</ul>
        </section>
      )}
    </div>
  );
}
