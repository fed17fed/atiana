/**
 * The real events (Phase 11, task 11.8; owner decision 2026-11-12). One entry per date.
 * Dates: plan section 13.5 B (moon phases from USNO, eclipse from NASA), same day as the astronomy event, skip 24 Dec.
 * Texts: docs/real-sessions-content.md via content/session-texts.ts. PRICES ARE DEMO PRICES. Times are Europe/Dublin wall-clock times.
 * Used by the pages (so /events works without a database) and by prisma/seed-events.ts.
 */
import type { EventPricing, Mode } from "@/lib/generated/prisma/enums";
import { DEFAULT_CAPACITY } from "@/lib/booking-rules";
import {
  TEXT_FULL_MOON,
  TEXT_LUNAR_ECLIPSE,
  TEXT_NEW_MOON,
  TEXT_WINTER_SOLSTICE,
  type SessionLongText,
} from "./session-texts";

export type EventDef = {
  slug: string;
  title: string;
  pricing: EventPricing;
  mode: Mode;
  /** Dublin wall-clock start (for events with a greeting: the start of the greeting) */
  start: { year: number; month: number; day: number; hour: number; minute: number };
  minutes: number;
  lengthLabel: string;
  spots: number;
  /** Ticket price in cents (PAID only) */
  priceCents: number | null;
  summary: string;
  long: SessionLongText;
  /** Events with a greeting first: minutes between the start and the main activation (the door closes at the activation) */
  activationAfterMinutes?: number;
  location: string | null;
  image: string;
  imageAlt: string;
};

const NEW_MOON_TITLE = "New Moon Kundalini Energy Activation by Atiana";
const FULL_MOON_TITLE = "Full Moon Kundalini Energy Activation by Atiana";
const NEW_MOON_SUMMARY =
  "An online New Moon Kundalini Energy Activation with Atiana: 60 minutes of energy transmission to set a fresh start. Lie down at home.";
const FULL_MOON_SUMMARY =
  "An online Full Moon Kundalini Energy Activation with Atiana: 30 minutes of energy transmission under the full moon. Lie down at home.";

// Demo pictures stay for now (real moon pictures wait for Tatiana's OK on the rights, plan 13.8 Q7).
const IMG_FULL = { image: "/demo/singing-bowl-sage.webp", imageAlt: "A singing bowl and sage on a table (stock photo, demo)" };
const IMG_NEW = { image: "/demo/online-yoga-laptop.webp", imageAlt: "Woman doing breathing practice in front of a laptop (stock photo, demo)" };
const IMG_ECLIPSE = { image: "/demo/group-circle-room.webp", imageAlt: "A group sitting in a circle in a bright room (stock photo, demo)" };
const IMG_SOLSTICE = { image: "/demo/terrace-meditation.webp", imageAlt: "Person meditating on a wooden terrace (stock photo, demo)" };

const moon = (
  kind: "new" | "full",
  year: number,
  month: number,
  day: number,
  hour: number,
): EventDef => ({
  slug: `${kind}-moon-${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  title: kind === "new" ? NEW_MOON_TITLE : FULL_MOON_TITLE,
  pricing: "PAID",
  mode: "ONLINE",
  start: { year, month, day, hour, minute: 0 },
  minutes: kind === "new" ? 60 : 30,
  lengthLabel: kind === "new" ? "60 min" : "30 min",
  spots: DEFAULT_CAPACITY,
  priceCents: 3000,
  summary: kind === "new" ? NEW_MOON_SUMMARY : FULL_MOON_SUMMARY,
  long: kind === "new" ? TEXT_NEW_MOON : TEXT_FULL_MOON,
  location: null,
  ...(kind === "new" ? IMG_NEW : IMG_FULL),
});

export const events: EventDef[] = [
  moon("full", 2026, 11, 24, 20),
  moon("new", 2026, 12, 9, 20),
  {
    slug: "winter-solstice-2026-12-21",
    title: "Winter Solstice Kundalini Energy Activation",
    pricing: "PAID",
    mode: "ONLINE",
    start: { year: 2026, month: 12, day: 21, hour: 21, minute: 0 },
    minutes: 75,
    lengthLabel: "75 min (15 min greeting, then 60 min activation)",
    spots: DEFAULT_CAPACITY,
    priceCents: 6000,
    summary:
      "An online Winter Solstice Kundalini Energy Activation with Atiana: a special 60-minute energy transmission on the longest night. Lie down at home.",
    long: TEXT_WINTER_SOLSTICE,
    activationAfterMinutes: 15,
    location: null,
    ...IMG_SOLSTICE,
  },
  moon("new", 2027, 1, 7, 20),
  moon("full", 2027, 1, 22, 20),
  moon("new", 2027, 2, 6, 20),
  {
    slug: "lunar-eclipse-2027-02-20",
    title: "Lunar Eclipse Kundalini Energy Activation by Atiana",
    pricing: "PAID",
    mode: "ONLINE",
    start: { year: 2027, month: 2, day: 20, hour: 22, minute: 30 },
    minutes: 60,
    lengthLabel: "60 min",
    spots: DEFAULT_CAPACITY,
    priceCents: 3000,
    summary:
      "An online Lunar Eclipse Kundalini Energy Activation with Atiana: 60 minutes to cleanse, set an intention and renew. Lie down at home.",
    long: TEXT_LUNAR_ECLIPSE,
    location: null,
    ...IMG_ECLIPSE,
  },
];

/** The 4 first demo events. They are hidden (published = false) by the seed, never deleted. */
export const HIDDEN_DEMO_EVENT_SLUGS = [
  "winter-breath-hour",
  "sound-and-stillness-sunday",
  "winter-light-half-day",
  "slow-morning-by-the-hills",
] as const;

export const eventTypeLabel: Record<EventPricing, string> = { FREE: "Free", DONATION: "By donation", PAID: "Paid" };
export const eventModeLabel: Record<Mode, string> = { ONLINE: "Online (Zoom)", IN_PERSON: "In person" };

export function priceLine(e: { pricing: EventPricing; priceCents: number | null }): string {
  if (e.pricing === "FREE") return "Free";
  if (e.pricing === "DONATION") return "Pay what feels right";
  return `€${(e.priceCents ?? 0) / 100} [demo price]`;
}

export function findEvent(slug: string) {
  return events.find((e) => e.slug === slug);
}
