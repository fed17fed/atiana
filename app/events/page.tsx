import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EventCard, type EventCardData } from "@/components/events/EventCard";
import { Crumbs } from "@/components/ui/Crumbs";
import { DbNotice } from "@/components/ui/DbNotice";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { getUpcomingEvents } from "@/lib/event-queries";
import type { EventPricing } from "@/lib/generated/prisma/enums";
import { loadPublicOfferings } from "@/lib/offerings-cache";
import { upcomingEvents, type PublicEvent } from "@/lib/offerings-public";
import { safeDb } from "@/lib/safe";

export const metadata: Metadata = {
  title: "Events",
  description: "Longer sessions and special days. Some events are free, some work by donation, some are paid. Spots are limited. Demo site.",
  alternates: { canonical: "/events" },
  openGraph: { title: "Events – KEA by Atiana", url: "/events" },
};

const FILTERS: { key: string; label: string; pricing?: EventPricing }[] = [
  { key: "all", label: "All" },
  { key: "free", label: "Free", pricing: "FREE" },
  { key: "donation", label: "Donation", pricing: "DONATION" },
  { key: "paid", label: "Paid", pricing: "PAID" },
];

export default function EventsPage({ searchParams }: PageProps<"/events">) {
  return (
    <>
      <Crumbs items={[{ label: "Events" }]} />
      <div className="wrap page-head">
        <h1>Events</h1>
        <p className="lead">
          Longer sessions and special days. Some events are free. Some work by donation. Some are paid. Spots are limited, so register early.
        </p>
      </div>
      <Suspense fallback={<PageSkeleton minHeight={720} />}>
        <EventList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function toCard(e: PublicEvent, spotsLeft: number | null): EventCardData | null {
  if (!e.session) return null; // an event without a date is not listed (its page can still be opened)
  return {
    slug: e.slug,
    title: e.title,
    summary: e.summary,
    pricing: e.pricing,
    mode: e.mode,
    startsAt: e.session.startsAt,
    endsAt: e.session.endsAt,
    lengthLabel: e.lengthLabel,
    location: e.location,
    image: e.image,
    imageAlt: e.imageAlt,
    priceCents: e.priceCents,
    spotsLeft,
  };
}

async function EventList({ searchParams }: { searchParams: PageProps<"/events">["searchParams"] }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const filter = FILTERS.find((f) => f.key === raw) ?? FILTERS[0];

  // Events: the database (admin), or today's code content when the database cannot be read or is empty (task 12.8).
  const { events } = await loadPublicOfferings();
  // Live spots use the shared "seat taken" rule. null = the database could not answer: cards show no spots.
  const rows = await safeDb("events", async () => {
    const { prisma } = await import("@/lib/prisma");
    return getUpcomingEvents(prisma, { pricing: filter.pricing });
  });
  const spots = new Map((rows ?? []).map((r) => [r.slug, r.spotsLeft]));
  const cards = upcomingEvents(events, filter.pricing).flatMap((e) => {
    const c = toCard(e, rows === null ? null : (spots.get(e.slug) ?? null));
    return c ? [c] : [];
  });

  return (
    <div className="wrap" style={{ paddingBottom: 72 }}>
      <nav aria-label="Filter events by type" style={{ marginBottom: 24 }}>
        <div className="fmt-seg" style={{ maxWidth: 520 }}>
          {FILTERS.map((f) => (
            <Link key={f.key} href={f.key === "all" ? "/events" : `/events?type=${f.key}`} aria-current={f.key === filter.key ? "true" : undefined}>
              {f.label}
            </Link>
          ))}
        </div>
      </nav>
      {rows === null && <div style={{ marginBottom: 20 }}><DbNotice what="live spots and registration" /></div>}
      {cards.length === 0 ? (
        <div className="empty">
          <h2>No events right now</h2>
          <p>New events are coming. Join the newsletter and we will tell you first.</p>
          <Link className="btn btn-primary" href="/#newsletter">
            Subscribe
          </Link>
        </div>
      ) : (
        <div className="ev-grid">
          {cards.map((c, i) => (
            <EventCard key={c.slug} e={c} priority={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}
