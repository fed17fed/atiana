import { SITE_DESCRIPTION, SITE_NAME } from "./site";
import type { FaqGroup } from "@/content/faq";
import { plainText } from "@/content/faq";

export function organizationJsonLd(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: siteUrl,
    logo: `${siteUrl}/brand/kea-logo-light.svg`,
    description: SITE_DESCRIPTION,
    // Company name, address and email are placeholders until the owner gives the facts.
  };
}

export function websiteJsonLd(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl,
  };
}

export function faqJsonLd(groups: FaqGroup[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((g) =>
      g.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: plainText(item.a) },
      })),
    ),
  };
}

export type EventLd = {
  slug: string;
  title: string;
  summary: string;
  pricing: "FREE" | "DONATION" | "PAID";
  mode: "ONLINE" | "IN_PERSON";
  startsAt: string;
  endsAt: string;
  location: string | null;
  image: string;
  priceCents: number | null;
  soldOut: boolean;
  cancelled: boolean;
};

/** schema.org Event for an event detail page. Free and donation events have price 0 (pay what you want). */
export function eventJsonLd(siteUrl: string, e: EventLd) {
  const url = `${siteUrl}/events/${e.slug}`;
  const online = e.mode === "ONLINE";
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: e.summary,
    startDate: e.startsAt,
    endDate: e.endsAt,
    eventStatus: e.cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: online ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    location: online
      ? { "@type": "VirtualLocation", url }
      : { "@type": "Place", name: e.location ?? "Ireland", address: { "@type": "PostalAddress", addressRegion: "County Wicklow", addressCountry: "IE" } },
    image: [`${siteUrl}${e.image}`],
    organizer: { "@type": "Organization", name: SITE_NAME, url: siteUrl },
    offers: {
      "@type": "Offer",
      url,
      price: ((e.priceCents ?? 0) / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: e.soldOut ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
    },
  };
}
