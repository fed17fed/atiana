import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LocalRange, TimeZoneName } from "@/components/booking/LocalTime";
import { EventRegisterForm } from "@/components/events/EventRegisterForm";
import { Crumbs } from "@/components/ui/Crumbs";
import { DbNotice } from "@/components/ui/DbNotice";
import { Icon } from "@/components/ui/Icon";
import { JsonLd } from "@/components/seo/JsonLd";
import { eventModeLabel, eventTypeLabel, events, findEvent, priceLine, type EventDef } from "@/content/events";
import { EVENT_REFUND_DAYS, spotsLabel } from "@/lib/booking-rules";
import { getEventBySlug, getMyEventRegistration } from "@/lib/event-queries";
import { eventJsonLd } from "@/lib/jsonld";
import { formatEuro } from "@/lib/orders-service";
import { mailConfig } from "@/lib/mail";
import { safeDb } from "@/lib/safe";
import { getCurrentUser } from "@/lib/session";
import { getSiteUrl } from "@/lib/site";
import { stripeConfig } from "@/lib/stripe-service";
import { zonedToUtc } from "@/lib/time";

// The 4 event pages are prerendered at build time (generateStaticParams), so reading `params` blocks nothing.
// This lets a wrong slug answer with a real 404 before anything is streamed.
export const instant = false;

export function generateStaticParams() {
  return events.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const e = findEvent(slug);
  if (!e) return {};
  return {
    title: e.title,
    description: e.summary,
    alternates: { canonical: `/events/${e.slug}` },
    openGraph: { title: `${e.title} – KEA by Atiana`, description: e.summary, url: `/events/${e.slug}`, images: [{ url: e.image, alt: e.imageAlt }] },
  };
}

export default async function EventPage({ params, searchParams }: PageProps<"/events/[slug]">) {
  const { slug } = await params;
  const e = findEvent(slug);
  if (!e) notFound(); // real 404: the check happens before anything is streamed
  const startsAt = zonedToUtc(e.start);
  const endsAt = new Date(startsAt.getTime() + e.minutes * 60_000);
  const siteUrl = getSiteUrl();

  return (
    <>
      <JsonLd
        data={eventJsonLd(siteUrl, {
          slug: e.slug,
          title: e.title,
          summary: e.summary,
          pricing: e.pricing,
          mode: e.mode,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          location: e.location,
          image: e.image,
          priceCents: e.priceCents,
          soldOut: false,
          cancelled: false,
        })}
      />
      <Crumbs items={[{ label: "Events", href: "/events" }, { label: e.title }]} />
      <div className="wrap">
        <div className="ev-detail">
          <div className="grid gap-6" style={{ alignContent: "start" }}>
            <div className="ev-photo">
              <Image src={e.image} alt={e.imageAlt} width={1200} height={900} priority sizes="(min-width: 960px) 700px, 100vw" />
            </div>
            <div>
              <div className="row-wrap" style={{ gap: 8, marginBottom: 10, minHeight: 30 }}>
                <span className={`badge ${e.mode === "ONLINE" ? "b-online" : "b-person"}`}>{eventModeLabel[e.mode]}</span>
                <span className="badge b-free">{eventTypeLabel[e.pricing]}</span>
                <Suspense fallback={null}>
                  <SpotsBadge slug={e.slug} />
                </Suspense>
              </div>
              <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.4rem)" }}>{e.title}</h1>
              <p className="lead">{e.summary}</p>
            </div>
            <dl className="ev-facts">
              <div>
                <dt>Date and time</dt>
                <dd>
                  <LocalRange startIso={startsAt.toISOString()} endIso={endsAt.toISOString()} />
                </dd>
              </div>
              <div>
                <dt>Length</dt>
                <dd>{e.lengthLabel}</dd>
              </div>
              <div>
                <dt>Place</dt>
                <dd>{e.mode === "ONLINE" ? "Online (Zoom)" : e.location}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{priceLine(e)}</dd>
              </div>
            </dl>
            <p className="hint" style={{ margin: 0 }}>
              Times are shown in your time zone (<TimeZoneName />). All events run on Dublin time.
            </p>
            <section aria-labelledby="about-h">
              <h2 id="about-h" style={{ fontSize: "1.6rem" }}>
                About this event
              </h2>
              <p>{e.body}</p>
              <p>
                <Link href="/legal/health-disclaimer">Health notice</Link>
              </p>
            </section>
            <section aria-labelledby="extra-h">
              <h2 id="extra-h" style={{ fontSize: "1.6rem" }}>
                {e.extraTitle}
              </h2>
              <p>{e.extra}</p>
            </section>
            <section aria-labelledby="cancel-h">
              <h2 id="cancel-h" style={{ fontSize: "1.6rem" }}>
                {e.pricing === "PAID" ? "Cancelling a paid event" : "Cancelling"}
              </h2>
              {e.pricing === "PAID" && (
                <p>
                  You get your money back if you cancel {EVENT_REFUND_DAYS} days or more before the event starts. If you cancel later, we cannot give the money back. If we cancel the event, you get all your money back.
                </p>
              )}
              {e.pricing === "FREE" && (
                <p>You can cancel any time before the event starts. Please cancel if you cannot come, so someone else can take your spot.</p>
              )}
              {e.pricing === "DONATION" && (
                <p>
                  You can cancel any time before the event starts. A donation is not refunded, also when you cancel before the event.
                </p>
              )}
              {e.pricing === "DONATION" && (
                <p>
                  Every person is welcome, whatever they can give. If you choose €0, we do not ask for a card. If you can give more, it helps us keep events open for everyone. This is a donation to KEA by Atiana for the event.
                </p>
              )}
            </section>
          </div>

          <aside className="ev-side" id="register" aria-label="Registration">
            <Suspense fallback={<div className="ev-panel" style={{ minHeight: 360 }} role="status"><span className="sr-only">Loading...</span></div>}>
              <Panel e={e} searchParams={searchParams} />
            </Suspense>
          </aside>
        </div>
      </div>
      <div className="ev-bar">
        <a className="btn btn-primary" href="#register">
          Register for this event
        </a>
      </div>
    </>
  );
}

async function SpotsBadge({ slug }: { slug: string }) {
  const ev = await safeDb("event spots", async () => {
    const { prisma } = await import("@/lib/prisma");
    return getEventBySlug(prisma, slug);
  });
  if (!ev || ev.cancelled || ev.started) return null;
  const full = ev.spotsLeft <= 0;
  return <span className={`badge ${full ? "b-sold" : ev.spotsLeft <= 3 ? "b-low" : "b-spots"}`}>{full ? "Sold out" : spotsLabel(ev.spotsLeft)}</span>;
}

function SuccessBlock({ e, kind, donation }: { e: EventDef; kind: "free" | "donation0" | "donation" | "ticket"; donation: number }) {
  const emailsOff = mailConfig() === null;
  const demo = emailsOff ? " Demo: confirmation emails are not active yet." : "";
  const zoom = e.mode === "ONLINE" ? " Your Zoom link is on your booking page." : "";
  let h = "You are registered";
  let t = "";
  if (kind === "free") t = `Your place is saved.${zoom}${demo}`;
  else if (kind === "donation0") t = `Your place is saved. You chose €0, so there was no payment.${zoom}${demo}`;
  else if (kind === "donation") {
    h = "You are registered. Thank you for your gift";
    t = `Your place is saved and your donation of ${formatEuro(donation)} was received.${zoom}${demo} Stripe test mode: no real money is taken.`;
  } else {
    h = "Your ticket is ready";
    t = `Thank you. Your place is saved and your payment was received. The address and what to bring are on your booking page. Cancel up to ${EVENT_REFUND_DAYS} days before the event to get your money back.${demo} Stripe test mode: no real money is taken.`;
  }
  return (
    <div className="alert a-success" role="status">
      <Icon name="check" />
      <div>
        <b>{h}</b>
        <p>{t.trim()}</p>
        <p className="row-wrap" style={{ marginTop: 8 }}>
          <a href={`/events/${e.slug}/calendar.ics`}>Add to calendar</a>
          <Link href="/account/bookings">View my bookings</Link>
        </p>
      </div>
    </div>
  );
}

async function Panel({ e, searchParams }: { e: EventDef; searchParams: PageProps<"/events/[slug]">["searchParams"] }) {
  const sp = await searchParams;
  const done = sp.done !== undefined;
  const user = await getCurrentUser();
  const data = await safeDb("event panel", async () => {
    const { prisma } = await import("@/lib/prisma");
    const ev = await getEventBySlug(prisma, e.slug);
    const reg = ev && user ? await getMyEventRegistration(prisma, user.id, ev.sessionId) : null;
    return { ev, reg };
  });

  if (data === null) {
    return (
      <div className="ev-panel">
        <h2>Register for this event</h2>
        <DbNotice what="registration" />
      </div>
    );
  }
  const { ev, reg } = data;
  const closed = !ev || ev.cancelled || ev.started;
  const priceLabel = e.priceCents !== null ? `${formatEuro(e.priceCents)} [demo price]` : "";

  let body: React.ReactNode;
  if (reg) {
    const kind = e.pricing === "FREE" ? "free" : e.pricing === "PAID" ? "ticket" : reg.donationCents > 0 ? "donation" : "donation0";
    body = (
      <>
        {done && reg.status === "CONFIRMED" ? (
          <SuccessBlock e={e} kind={kind} donation={reg.donationCents} />
        ) : reg.status === "PENDING" ? (
          <div className="alert a-info" role="status">
            <Icon name="info" />
            <div>
              <p>Thank you. Your payment is being confirmed. Your place shows as confirmed in a moment.</p>
            </div>
          </div>
        ) : (
          <div className="alert a-success" role="status">
            <Icon name="check" />
            <div>
              <p>You are registered for this event.</p>
            </div>
          </div>
        )}
        <Link className="btn btn-outline" href="/account/bookings">
          View my bookings
        </Link>
      </>
    );
  } else if (closed) {
    body = (
      <div className="alert a-info" role="status">
        <Icon name="info" />
        <div>
          <p>Registration is closed.</p>
          {ev?.started && <p>This event has ended.</p>}
        </div>
      </div>
    );
  } else if (ev.spotsLeft <= 0) {
    body = (
      <>
        <div className="alert a-warn" role="status">
          <Icon name="info" />
          <div>
            <p>This event is full. Join the newsletter and we will tell you about new dates.</p>
          </div>
        </div>
        <Link className="btn btn-primary" href="/#newsletter">
          Subscribe
        </Link>
      </>
    );
  } else if (!user) {
    body = (
      <>
        <h3 style={{ fontSize: "1.25rem", margin: 0 }}>Log in to register</h3>
        <p style={{ margin: 0 }}>Please log in with an email link before you register. No password needed. This is needed for free events too.</p>
        <Link className="btn btn-primary" href={`/login?next=${encodeURIComponent(`/events/${e.slug}`)}`}>
          Log in to register
        </Link>
      </>
    );
  } else {
    body = <EventRegisterForm sessionId={ev.sessionId} pricing={e.pricing} priceLabel={priceLabel} paymentsOn={stripeConfig() !== null} />;
  }

  return (
    <div className="ev-panel">
      <h2>Register for this event</h2>
      {ev && !closed && !reg && <p className="hint" style={{ margin: 0 }}>{ev.spotsLeft <= 0 ? "Sold out" : spotsLabel(ev.spotsLeft)}</p>}
      {e.pricing === "PAID" && !reg && <p className="hint" style={{ margin: 0 }}>Cancel up to {EVENT_REFUND_DAYS} days before the event and get your money back.</p>}
      {body}
    </div>
  );
}
