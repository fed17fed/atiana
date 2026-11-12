import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookForm } from "@/components/booking/BookForm";
import { LocalTime, TimeZoneName } from "@/components/booking/LocalTime";
import { ActivationTime } from "@/components/booking/ActivationTime";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Crumbs } from "@/components/ui/Crumbs";
import { DbNotice } from "@/components/ui/DbNotice";
import { Icon } from "@/components/ui/Icon";
import { CANCELLATION_HOURS, isFreePrice, priceText, spotsLabel } from "@/lib/booking-rules";
import { countUsableCredits, getBookableSession } from "@/lib/catalog-queries";
import { classTypes } from "@/content/catalog";
import { safeDb } from "@/lib/safe";
import { getCurrentUser } from "@/lib/session";
import { stripeConfig } from "@/lib/stripe-service";

export const metadata: Metadata = {
  title: "Book a class",
  robots: { index: false, follow: false },
};

export default function BookClassPage({ searchParams }: PageProps<"/book/class">) {
  return (
    <>
      <Crumbs items={[{ label: "Schedule", href: "/schedule" }, { label: "Book" }]} />
      <div className="wrap page-head">
        <h1>Book a class</h1>
      </div>
      <Suspense fallback={<PageSkeleton minHeight={640} narrow />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/book/class">["searchParams"] }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.session) ? sp.session[0] : sp.session;
  const sessionId = (raw ?? "").slice(0, 60);
  if (!sessionId) notFound();
  const user = await getCurrentUser();
  const data = await safeDb("book session", async () => {
    const { prisma } = await import("@/lib/prisma");
    const s = await getBookableSession(prisma, sessionId);
    const credits = s && user ? await countUsableCredits(prisma, user.id, "GROUP_CLASS") : 0;
    return { s, credits };
  });

  if (data === null) {
    return (
      <div className="narrow">
        <DbNotice what="booking" />
      </div>
    );
  }
  if (!data.s || data.s.type !== "GROUP_CLASS") notFound();
  const c = data.s.item;
  const full = c.spotsLeft <= 0;
  const price = priceText(c.priceCents);
  const free = isFreePrice(c.priceCents);
  const activationAfter = classTypes.find((t) => t.slug === c.slug)?.activationAfterMinutes;
  const loginHref = `/login?next=${encodeURIComponent(`/book/class?session=${sessionId}`)}`;

  return (
    <div className="narrow">
      <div className="bk">
        <section className="panel" aria-labelledby="bk-h">
          <p className="step-k">Your class</p>
          <h2 id="bk-h">{c.title}</h2>
          <p style={{ margin: "0 0 18px" }}>
            <b>
              <LocalTime iso={c.startsAt} format="dayTime" />
            </b>{" "}
            · Online · Zoom · {c.minutes} min
            <br />
            <span className="hint">
              Your time zone: <TimeZoneName />. {spotsLabel(c.spotsLeft)}.
            </span>
            {activationAfter && (
              <>
                <br />
                <span className="hint">
                  <ActivationTime startIso={c.startsAt} afterMinutes={activationAfter} /> The door closes when the activation starts.
                </span>
              </>
            )}
          </p>
          {full ? (
            <div className="alert a-warn" role="status">
              <Icon name="info" />
              <div>
                <p>Sorry, this class is full. Please choose another time on the schedule.</p>
              </div>
            </div>
          ) : (
            <BookForm
              sessionId={sessionId}
              kind="class"
              priceLabel={price}
              loggedIn={!!user}
              credits={data.credits}
              paymentsOn={stripeConfig() !== null}
              free={free}
              loginHref={loginHref}
            />
          )}
        </section>
        <aside className="summary" aria-label="Your class">
          <h2>Your class</h2>
          <dl>
            <div><dt>Class</dt><dd>{c.title}</dd></div>
            <div><dt>When</dt><dd><LocalTime iso={c.startsAt} format="dayTime" /></dd></div>
            <div><dt>Length</dt><dd>{c.minutes} minutes</dd></div>
            <div><dt>Booking for</dt><dd>{user ? user.email : "Guest"}</dd></div>
            <div className="tot"><dt>Total</dt><dd className="s-total">{price}</dd></div>
          </dl>
          <p className="note">
            <Icon name="check" />
            <span>
              {free ? "Cancel any time before it starts." : `Cancel up to ${CANCELLATION_HOURS} hours before.`} The Zoom link is sent after your booking is confirmed.
            </span>
          </p>
        </aside>
      </div>
    </div>
  );
}
