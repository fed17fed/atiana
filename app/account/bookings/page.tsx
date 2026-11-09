import type { Metadata } from "next";
import Link from "next/link";
import { cancelMyBooking } from "@/app/account/actions";
import { LocalTime } from "@/components/booking/LocalTime";
import { DbNotice } from "@/components/ui/DbNotice";
import { Icon } from "@/components/ui/Icon";
import { getMyBookings } from "@/lib/account-queries";
import { CANCELLATION_HOURS, canCancel, isRefundable } from "@/lib/booking-rules";
import { safeDb } from "@/lib/safe";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "My bookings" };

const NOTES: Record<string, { cls: string; text: string }> = {
  booked: { cls: "a-success", text: "You are booked. We sent a confirmation to your email." },
  paid: { cls: "a-success", text: "Thank you. Your payment is being confirmed. Your booking shows as Confirmed in a moment." },
  returned: { cls: "a-success", text: "Your booking is cancelled and your credit was returned." },
  late: { cls: "a-warn", text: `Your booking is cancelled. It was less than ${CANCELLATION_HOURS} hours before the start, so the credit is not returned.` },
  paid_cancel: { cls: "a-warn", text: "Your booking is cancelled. Refunds for card payments: the team will contact you. (Demo rule not decided yet.)" },
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
  const noteKey = one(sp.booked) ? "booked" : one(sp.paid) ? "paid" : one(sp.cancel) === "paid" ? "paid_cancel" : (one(sp.cancel) ?? "");
  const note = NOTES[noteKey];

  const bookings = await safeDb("my bookings", async () => {
    const { prisma } = await import("@/lib/prisma");
    return getMyBookings(prisma, user.id);
  });
  if (!bookings) return <DbNotice what="your bookings" />;

  const now = new Date();
  const upcoming = bookings.filter((b) => b.startsAt > now && b.status !== "CANCELLED").reverse();
  const rest = bookings.filter((b) => !(b.startsAt > now && b.status !== "CANCELLED"));

  const card = (b: (typeof bookings)[number]) => {
    const st = STATUS[b.status];
    const active = (b.status === "CONFIRMED" || b.status === "PENDING") && canCancel(b.startsAt, now);
    const early = isRefundable(b.startsAt, now);
    return (
      <li className="acc-card" key={b.id}>
        <div className="row">
          <h3>{b.title}</h3>
          <span className={`status ${st.cls}`}>{st.label}</span>
        </div>
        <div className="meta">
          <span>
            <LocalTime iso={b.startsAt.toISOString()} format="dayTime" />
          </span>
          <span>{b.mode === "ONLINE" ? "Online · Zoom" : "In person"}</span>
          <span>{b.paidWith === "CREDIT" ? "Paid with a credit" : b.paidWith === "STRIPE" ? "Paid by card" : ""}</span>
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
        {b.status === "PENDING" && <p className="note">The Zoom link is shown after the payment is confirmed.</p>}
        {active && (
          <form action={cancelMyBooking} className="row">
            <input type="hidden" name="bookingId" value={b.id} />
            <p className="note">
              {b.paidWith === "CREDIT"
                ? early
                  ? "Cancelling now returns your credit."
                  : `Less than ${CANCELLATION_HOURS} hours before the start: cancelling does not return your credit.`
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
