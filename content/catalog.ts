/**
 * Demo catalog for classes, packs and 1:1 (texts and prices from docs/demo-content.md, approved 2026-11-09).
 * DEMO PRICES ONLY. The owner sets real prices later.
 * Used by the pages (so /classes works without a database) and by prisma/seed-classes.ts.
 */
import type { Mode } from "@/lib/generated/prisma/enums";

export const SINGLE_CLASS_PRICE_CENTS = 1500; // demo price
export const DEMO_ZOOM_URL = "https://zoom.us/j/0000000000"; // placeholder from the plan
export const DEMO_SESSION_WEEKS = 8;
export const DEMO_CLASS_CAPACITY = 12;

export type ClassType = {
  slug: string;
  title: string;
  level: string;
  minutes: number;
  text: string;
};

export const classTypes: ClassType[] = [
  {
    slug: "morning-energy-class",
    title: "Morning Energy Class",
    level: "All levels",
    minutes: 45,
    text: "Start your day with slow movement and warm, steady breathing. We wake up the body gently and set a clear mood for the hours ahead. You will learn simple moves you can repeat at home. The pace is easy and you can adjust everything to your own comfort. Many people say they feel awake and a little lighter afterwards. Bring a glass of water and wear comfortable clothes. Come as you are, even if you are still half asleep.",
  },
  {
    slug: "evening-transmission",
    title: "Evening Transmission",
    level: "All levels",
    minutes: 60,
    text: "A quiet hour to close your day. We begin with soft breathing, then we sit in guided stillness. The teacher leads you with a calm voice and gives you time to rest between steps. You may feel more settled before bed. You do not need to do anything perfectly. Dim the lights, find a comfortable seat or lie down, and let the evening slow. This class is a good way to mark the end of a busy day.",
  },
  {
    slug: "beginners-introduction",
    title: "Beginners' Introduction",
    level: "Beginners",
    minutes: 45,
    text: "New to breath and energy practice? Start here. We explain every step in plain words and go slowly. You will learn three basic breathing patterns, a simple way to sit, and how to rest. There are no hard poses and no special knowledge needed. You can ask questions at any point. By the end you will have a small routine to try at home. This is the best first class for anyone who feels unsure.",
  },
  {
    slug: "breath-and-stillness",
    title: "Breath & Stillness",
    level: "All levels",
    minutes: 45,
    text: "A soft class built around the breath. We practise slow, even breathing and then rest in silence together. There is very little movement, so it suits tired days and busy minds. You may notice you feel calmer and more spacious. Stay as long as is comfortable and pause whenever you need to. If a breathing pattern does not feel right, return to normal breathing. Perfect for a lunch break or a quiet evening.",
  },
];

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
 * Weekly demo pattern (approved 2026-11-09): Tuesday, Thursday, Friday, Sunday.
 * Times are Europe/Dublin wall-clock times. weekday: 0 = Sunday ... 6 = Saturday.
 */
export const weeklyPattern = [
  { weekday: 2, hour: 18, minute: 0, classSlug: "beginners-introduction" },
  { weekday: 4, hour: 12, minute: 30, classSlug: "breath-and-stillness" },
  { weekday: 5, hour: 7, minute: 30, classSlug: "morning-energy-class" },
  { weekday: 0, hour: 19, minute: 30, classSlug: "evening-transmission" },
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
