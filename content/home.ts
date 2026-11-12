import { DEFAULT_CAPACITY } from "@/lib/booking-rules";

/**
 * STATIC demo data for the home page. Real classes come from the database in Phase 4
 * (task 4.1). Weekly pattern is used instead of calendar dates so the demo never looks old.
 */
export type NextClass = {
  id: string;
  title: string;
  weekday: string; // short, for the date box
  weekdayLong: string;
  time: string;
  minutes: number;
  spotsLeft: number;
};

/** Real weekly classes (Europe/Dublin times; same pattern as content/catalog.ts weeklyPattern). */
export const nextClasses: NextClass[] = [
  { id: "blitz", title: "Blitz for Bliss", weekday: "Tue", weekdayLong: "Tuesday", time: "12:00", minutes: 30, spotsLeft: DEFAULT_CAPACITY },
  { id: "dive-deep", title: "Dive Deep", weekday: "Wed", weekdayLong: "Wednesday", time: "18:30", minutes: 90, spotsLeft: DEFAULT_CAPACITY },
  { id: "gratitude", title: "Gratitude (free)", weekday: "Thu", weekdayLong: "Thursday", time: "12:00", minutes: 30, spotsLeft: DEFAULT_CAPACITY },
  { id: "kea", title: "Kundalini Energy Activation", weekday: "Sun", weekdayLong: "Sunday", time: "19:30", minutes: 60, spotsLeft: DEFAULT_CAPACITY },
];

/** Teacher text: only facts from Atiana's own words (docs/real-sessions-content.md section 4). */
export const TEACHER_BIO =
  "My name is Atiana, and I am a facilitator of Kundalini energy activation based in Dublin, Ireland. I host online sessions and events for people around the world.";
export const INSTAGRAM_NAME = "kundalini_by_atiana";
export const INSTAGRAM_URL = "https://www.instagram.com/kundalini_by_atiana/";

export function spotsLabel(n: number): string {
  if (n <= 0) return "Full";
  if (n === 1) return "Only 1 spot left";
  if (n <= 3) return `Only ${n} spots left`;
  return `${n} spots left`;
}

export const testimonials = [
  { quote: "I thought I was too busy to sit still. Now my Friday morning class is the best part of my week.", who: "Maeve, Dublin" },
  { quote: "The group is small and kind. I felt welcome from the first minute.", who: "Conor, Cork" },
  { quote: "The Saturday session gave me a quiet I did not know I was missing. I still use the breathing at work.", who: "Niamh, Galway" },
];
