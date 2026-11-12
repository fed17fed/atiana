/**
 * Catalog for classes, packs and 1:1. Classes = the 4 real classes of Atiana (docs/real-sessions-content.md, 2026-11-12);
 * 1:1 and packs are still demo. DEMO PRICES ONLY. The owner sets real prices later.
 * Used by the pages (so /classes works without a database) and by prisma/seed-classes.ts.
 */
import { DEFAULT_CAPACITY } from "@/lib/booking-rules";
import { TEXT_BLITZ, TEXT_DIVE_DEEP, TEXT_GRATITUDE, TEXT_KEA, type SessionLongText } from "./session-texts";
import type { Mode } from "@/lib/generated/prisma/enums";

export const DEMO_ZOOM_URL = "https://zoom.example/demo-link-placeholder"; // placeholder only: the real link is never stored in code
export const DEMO_SESSION_WEEKS = 8;
export const DEMO_CLASS_CAPACITY = DEFAULT_CAPACITY; // the number lives in lib/booking-rules.ts

export type ClassType = {
  slug: string;
  title: string;
  level: string;
  minutes: number;
  /** Price of ONE class in cents. 0 = free class (login needed, no Stripe, no credit). */
  priceCents: number;
  /** Short text for cards and search engines (max 160 characters) */
  text: string;
  /** Full text: opening, what happens, what you need, how to join */
  long: SessionLongText;
  /** Classes with a greeting first: minutes between the start and the main activation (the door closes at the activation) */
  activationAfterMinutes?: number;
};

/** The 4 real classes (Phase 11, owner decision 2026-11-12). Prices are demo prices: EUR 20 / free / EUR 30. */
export const classTypes: ClassType[] = [
  {
    slug: "blitz-for-bliss",
    title: "Blitz for Bliss - 30 minutes Kundalini Energy Activation",
    level: "All levels",
    minutes: 30,
    priceCents: 2000,
    text: "A 30-minute online Kundalini Energy Activation for busy souls. Lie down at home and receive energy transmission with Atiana.",
    long: TEXT_BLITZ,
  },
  {
    slug: "dive-deep",
    title: "Dive Deep - 1.5 hours Kundalini Energy Activation and transmission",
    level: "All levels",
    minutes: 90,
    priceCents: 3000,
    text: "A 90-minute online Kundalini Energy Activation and transmission with Atiana. Greeting first, then a deep activation.",
    long: TEXT_DIVE_DEEP,
    activationAfterMinutes: 30,
  },
  {
    slug: "gratitude",
    title: "Gratitude - 30 minutes Kundalini Energy Activation",
    level: "All levels",
    minutes: 30,
    priceCents: 0,
    text: "A free 30-minute online Kundalini Energy Activation with Atiana. Lie down at home, listen to music and let gratitude arise.",
    long: TEXT_GRATITUDE,
  },
  {
    slug: "kundalini-energy-activation",
    title: "Kundalini Energy Activation by Atiana",
    level: "All levels",
    minutes: 60,
    priceCents: 3000,
    text: "KEA (Kundalini Energy Activation) is an online session of energy transmission with Atiana. Lie down, listen to music and allow what arises.",
    long: TEXT_KEA,
  },
];

/** The 4 first demo classes. They are hidden (published = false) by the seed, never deleted. */
export const HIDDEN_DEMO_CLASS_SLUGS = ["morning-energy-class", "evening-transmission", "beginners-introduction", "breath-and-stillness"] as const;

export type PackDef = {
  name: string;
  credits: number;
  validDays: number;
  validWeeks: number;
  priceCents: number;
  note: string;
};

export const packs: PackDef[] = [
  { name: "5-class pack", credits: 5, validDays: 70, validWeeks: 10, priceCents: 6000, note: "€12 per class" },
  { name: "10-class pack", credits: 10, validDays: 112, validWeeks: 16, priceCents: 10500, note: "Best value" },
];

/** 1:1 package (owner decision 2026-11-09): 5 sessions, EUR 300 demo price, credits valid 16 weeks. */
export const oneToOnePacks: PackDef[] = [
  { name: "5-session 1:1 package", credits: 5, validDays: 112, validWeeks: 16, priceCents: 30000, note: "€60 per session" },
];

/**
 * Weekly pattern of the real classes (owner answers 2026-11-12). Times are Europe/Dublin wall-clock times.
 * weekday: 0 = Sunday ... 6 = Saturday.
 */
export const weeklyPattern = [
  { weekday: 2, hour: 12, minute: 0, classSlug: "blitz-for-bliss" },
  { weekday: 3, hour: 18, minute: 30, classSlug: "dive-deep" },
  { weekday: 4, hour: 12, minute: 0, classSlug: "gratitude" },
  { weekday: 0, hour: 19, minute: 30, classSlug: "kundalini-energy-activation" },
] as const;

export type OneToOneDef = {
  slug: string;
  title: string;
  mode: Mode;
  minutes: number;
  priceCents: number;
  priceName: string;
  location: string | null;
  summary: string;
};

export const oneToOneOfferings: OneToOneDef[] = [
  {
    slug: "online-1-1",
    title: "Online 1:1 (Zoom)",
    mode: "ONLINE",
    minutes: 60,
    priceCents: 6000,
    priceName: "Online 1:1",
    location: null,
    summary:
      "Join from your own home. We talk for a few minutes about what you would like. Then we practise together, step by step.",
  },
  {
    slug: "in-person-1-1",
    title: "In person 1:1",
    mode: "IN_PERSON",
    minutes: 60,
    priceCents: 8000, // [OWNER: confirm in-person price]
    priceName: "In person 1:1",
    location: "Dublin, Ireland (demo location)", // [OWNER: address and city of the in-person room]
    summary:
      "Meet your teacher face to face in a quiet room in Ireland. Please arrive 5 minutes early and wear comfortable clothes.",
  },
];

/**
 * Demo 1:1 slots: 5 per week for 4 weeks = 20 slots. weekday 0 = Sunday ... 6 = Saturday.
 */
export const oneToOneWeeklySlots = [
  { weekday: 1, hour: 11, minute: 0, offering: "online-1-1" },
  { weekday: 3, hour: 14, minute: 0, offering: "online-1-1" },
  { weekday: 4, hour: 18, minute: 0, offering: "online-1-1" },
  { weekday: 6, hour: 10, minute: 0, offering: "in-person-1-1" },
  { weekday: 6, hour: 11, minute: 30, offering: "in-person-1-1" },
] as const;
export const DEMO_SLOT_WEEKS = 4;
