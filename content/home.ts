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

export const nextClasses: NextClass[] = [
  { id: "beginners", title: "Beginners' Introduction", weekday: "Tue", weekdayLong: "Tuesday", time: "18:00", minutes: 45, spotsLeft: 12 },
  { id: "morning", title: "Morning Energy Class", weekday: "Fri", weekdayLong: "Friday", time: "07:30", minutes: 45, spotsLeft: 8 },
  { id: "evening", title: "Evening Transmission", weekday: "Sun", weekdayLong: "Sunday", time: "19:30", minutes: 60, spotsLeft: 2 },
];

export function spotsLabel(n: number): string {
  if (n <= 0) return "Full";
  if (n === 1) return "Only 1 spot left";
  if (n <= 3) return `Only ${n} spots left`;
  return `${n} spots left`;
}

export const testimonials = [
  { quote: "I thought I was too busy to sit still. Now my Friday morning class is the best part of my week.", who: "Maeve, Dublin" },
  { quote: "The group is small and kind. I felt welcome from the first minute, even with my camera off.", who: "Conor, Cork" },
  { quote: "The Saturday session gave me a quiet I did not know I was missing. I still use the breathing at work.", who: "Niamh, Galway" },
];
