/**
 * Public offerings (task 12.8): what /classes, /one-to-one, /events, /events/[slug], calendar.ics and the sitemap show.
 * Pure: no database, no Next.js. The database read is in offerings-cache.ts.
 *
 * Source rule (plan 14.3): DB rows win. The code content (content/catalog.ts, content/events.ts) is used only when
 *  - the database cannot be read (no table yet on live, no DATABASE_URL, database down), or
 *  - the database has NO offering of that kind at all (fresh database).
 * If an admin hides every class, the page shows no class (it does not bring the code list back).
 * Long texts keep rule tokens in the database; they are filled here, so a visitor never sees "{{...}}".
 */
import { classTypes, oneToOneOfferings } from "@/content/catalog";
import { events as codeEvents } from "@/content/events";
import { longTextToMarkdown } from "@/content/session-texts";
import type { EventPricing, Mode } from "@/lib/generated/prisma/enums";
import { fillTokens } from "@/lib/text-tokens";
import { zonedToUtc } from "@/lib/time";

export type PublicClass = {
  slug: string;
  title: string;
  level: string;
  minutes: number;
  priceCents: number;
  summary: string;
  body: string; // markdown, tokens filled
  activationAfterMinutes: number | null;
};

export type PublicOneToOne = {
  slug: string;
  title: string;
  mode: Mode;
  minutes: number;
  priceCents: number;
  summary: string;
  location: string | null;
};

export type PublicEvent = {
  slug: string;
  title: string;
  summary: string;
  body: string; // markdown, tokens filled
  pricing: EventPricing;
  mode: Mode;
  lengthLabel: string;
  minutes: number | null;
  activationAfterMinutes: number | null;
  location: string | null;
  image: string | null;
  imageAlt: string;
  priceCents: number | null;
  /** The next upcoming session, else the latest one, else null (an event without a date yet). ISO strings (UTC). */
  session: { startsAt: string; endsAt: string; capacity: number; cancelled: boolean } | null;
};

/**
 * Final lists for the pages. `source` tells where each list came from: "db", or "code" (database unreadable or empty).
 * An empty list from the database means the admin hid everything: the page shows none (the code list does not come back).
 */
export type PublicOfferings = {
  classes: PublicClass[];
  oneToOne: PublicOneToOne[];
  events: PublicEvent[];
  source: { classes: "db" | "code"; oneToOne: "db" | "code"; events: "db" | "code" };
};

/** Today's code content for everything (used when the database cannot be read). */
export function codeOfferings(): PublicOfferings {
  return { classes: codeClassList(), oneToOne: codeOneToOneList(), events: codeEventList(), source: { classes: "code", oneToOne: "code", events: "code" } };
}

// ---------- code content (today's pages) ----------

export function codeClassList(): PublicClass[] {
  return classTypes.map((c) => ({
    slug: c.slug,
    title: c.title,
    level: c.level,
    minutes: c.minutes,
    priceCents: c.priceCents,
    summary: fillTokens(c.text),
    body: fillTokens(longTextToMarkdown(c.long)),
    activationAfterMinutes: c.activationAfterMinutes ?? null,
  }));
}

export function codeOneToOneList(): PublicOneToOne[] {
  return oneToOneOfferings.map((o) => ({ slug: o.slug, title: o.title, mode: o.mode, minutes: o.minutes, priceCents: o.priceCents, summary: fillTokens(o.summary), location: o.location }));
}

export function codeEventList(): PublicEvent[] {
  return codeEvents.map((e) => {
    const start = zonedToUtc(e.start);
    return {
      slug: e.slug,
      title: e.title,
      summary: fillTokens(e.summary),
      body: fillTokens(longTextToMarkdown(e.long)),
      pricing: e.pricing,
      mode: e.mode,
      lengthLabel: e.lengthLabel,
      minutes: e.minutes,
      activationAfterMinutes: e.activationAfterMinutes ?? null,
      location: e.location,
      image: e.image,
      imageAlt: e.imageAlt,
      priceCents: e.priceCents,
      session: { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + e.minutes * 60_000).toISOString(), capacity: e.spots, cancelled: false },
    };
  });
}

// ---------- database rows -> public items ----------

type Price = { amountCents: number }[];
export type OfferingRow = {
  slug: string;
  type: "GROUP_CLASS" | "ONE_TO_ONE" | "EVENT";
  title: string;
  summary: string;
  body: string;
  image: string | null;
  imageAlt: string | null;
  mode: Mode;
  location: string | null;
  eventPricing: EventPricing | null;
  level: string | null;
  minutes: number | null;
  lengthLabel: string | null;
  activationAfterMinutes: number | null;
  adminEditedAt: Date | null;
  priceOptions: Price;
  sessions: { startsAt: Date; endsAt: Date; capacity: number; status: "SCHEDULED" | "CANCELLED" | "COMPLETED" | string }[];
};

/** A DB text, tokens filled. Empty = "not written": the code default (if there is one) is used. */
function text(db: string | null | undefined, fallback = ""): string {
  return fillTokens(typeof db === "string" && db.trim() !== "" ? db : fallback);
}

export function classFromRow(r: OfferingRow): PublicClass {
  const def = classTypes.find((c) => c.slug === r.slug);
  return {
    slug: r.slug,
    title: r.title,
    level: r.level ?? def?.level ?? "",
    minutes: r.minutes ?? def?.minutes ?? 0,
    priceCents: r.priceOptions[0]?.amountCents ?? def?.priceCents ?? 0,
    summary: text(r.summary, def ? def.text : ""),
    body: text(r.body, def ? longTextToMarkdown(def.long) : ""),
    // After an admin edit an empty greeting field means "no greeting"; before that the code value still counts.
    activationAfterMinutes: r.activationAfterMinutes ?? (r.adminEditedAt ? null : (def?.activationAfterMinutes ?? null)),
  };
}

export function oneToOneFromRow(r: OfferingRow): PublicOneToOne {
  const def = oneToOneOfferings.find((o) => o.slug === r.slug);
  return {
    slug: r.slug,
    title: r.title,
    mode: r.mode,
    minutes: r.minutes ?? def?.minutes ?? 60,
    priceCents: r.priceOptions[0]?.amountCents ?? def?.priceCents ?? 0,
    summary: text(r.summary, def?.summary ?? ""),
    location: r.location ?? def?.location ?? null,
  };
}

/** The session shown for an event: the next upcoming scheduled one, else the latest one, else none. */
export function pickEventSession(sessions: OfferingRow["sessions"], now: Date): PublicEvent["session"] {
  if (sessions.length === 0) return null;
  const sorted = [...sessions].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const next = sorted.find((s) => s.status === "SCHEDULED" && s.startsAt.getTime() > now.getTime());
  const s = next ?? sorted[sorted.length - 1];
  return { startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), capacity: s.capacity, cancelled: s.status === "CANCELLED" };
}

export function eventFromRow(r: OfferingRow, now: Date): PublicEvent {
  const def = codeEvents.find((e) => e.slug === r.slug);
  const minutes = r.minutes ?? def?.minutes ?? null;
  const session = pickEventSession(r.sessions, now);
  // After an admin edit an empty image means "no image"; before that the code image still counts.
  const image = r.image ?? (r.adminEditedAt ? null : (def?.image ?? null));
  return {
    slug: r.slug,
    title: r.title,
    summary: text(r.summary, def?.summary ?? ""),
    body: text(r.body, def ? longTextToMarkdown(def.long) : ""),
    pricing: r.eventPricing ?? "FREE",
    mode: r.mode,
    lengthLabel: r.lengthLabel ?? def?.lengthLabel ?? (minutes ? `${minutes} min` : ""),
    minutes,
    activationAfterMinutes: r.activationAfterMinutes ?? (r.adminEditedAt ? null : (def?.activationAfterMinutes ?? null)),
    location: r.location ?? def?.location ?? null,
    image,
    imageAlt: r.imageAlt ?? (image !== null && image === def?.image ? def.imageAlt : ""),
    priceCents: r.priceOptions[0]?.amountCents ?? null,
    session,
  };
}

// ---------- choosing between database and code ----------

/** rows = published rows of ONE kind; total = how many rows of that kind exist at all (published or hidden). */
export function chooseList<T>(rows: T[], total: number, code: () => T[]): { list: T[]; source: "db" | "code" } {
  if (total === 0) return { list: code(), source: "code" };
  return { list: rows, source: "db" };
}

export function findPublicEvent(list: PublicEvent[], slug: string): PublicEvent | undefined {
  return list.find((e) => e.slug === slug);
}

/** Paths of the public event pages for the sitemap. */
export function eventSlugs(list: PublicEvent[]): string[] {
  return list.map((e) => e.slug);
}

/** Events for the Events page: upcoming and not cancelled, optional pricing filter, earliest first. An event without a date is not listed. */
export function upcomingEvents(list: PublicEvent[], pricing: EventPricing | undefined, now: Date = new Date()): PublicEvent[] {
  return list
    .filter((e) => (!pricing || e.pricing === pricing) && e.session !== null && !e.session.cancelled && new Date(e.session.startsAt).getTime() > now.getTime())
    .sort((a, b) => a.session!.startsAt.localeCompare(b.session!.startsAt));
}
