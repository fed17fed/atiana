/**
 * The four demo events (texts from docs/demo-content.md section 5.2, approved 2026-11-09).
 * All dates, prices, the teacher and the venue are DEMO values. Times are Europe/Dublin wall-clock times.
 * Used by the pages (so /events works without a database) and by prisma/seed-events.ts.
 */
import type { EventPricing, Mode } from "@/lib/generated/prisma/enums";

export type EventDef = {
  slug: string;
  title: string;
  pricing: EventPricing;
  mode: Mode;
  /** Dublin wall-clock start */
  start: { year: number; month: number; day: number; hour: number; minute: number };
  minutes: number;
  lengthLabel: string;
  spots: number;
  /** Ticket price in cents (PAID only) */
  priceCents: number | null;
  summary: string;
  body: string;
  /** "How to join" (online) or "What to bring" (in person) */
  extraTitle: string;
  extra: string;
  location: string | null;
  image: string;
  imageAlt: string;
};

export const DEMO_EVENT_LOCATION = "Demo venue, County Wicklow";

export const events: EventDef[] = [
  {
    slug: "winter-breath-hour",
    title: "Winter Breath Hour",
    pricing: "FREE",
    mode: "ONLINE",
    start: { year: 2026, month: 12, day: 9, hour: 19, minute: 0 },
    minutes: 60,
    lengthLabel: "60 min",
    spots: 40,
    priceCents: null,
    summary: "A free hour of slow breathing for dark winter evenings. Join from your sofa, camera on or off.",
    body: "The days are short and the evenings are long. This free hour is a gentle way to slow down. Aoife Brennan guides you through easy breathing patterns and a few minutes of quiet rest. There is no special knowledge needed, and nothing to do perfectly. If you are new to KEA, this is a good way to meet the teacher and the group. You can stay on a chair, on the floor or on your bed. You can keep your camera off. If a pattern does not feel right, go back to your normal breath. This is not medical care. Please read our Health notice.",
    extraTitle: "How to join",
    extra: "Log in and register. Your Zoom link will be on your booking page. [Demo: Zoom link is a placeholder.] Find a quiet spot, a chair or a mat, and a glass of water. Open the link 10 minutes early.",
    location: null,
    image: "/demo/online-yoga-laptop.webp",
    imageAlt: "Woman doing breathing practice in front of a laptop (stock photo, demo)",
  },
  {
    slug: "sound-and-stillness-sunday",
    title: "Sound and Stillness Sunday",
    pricing: "DONATION",
    mode: "ONLINE",
    start: { year: 2027, month: 1, day: 17, hour: 11, minute: 0 },
    minutes: 90,
    lengthLabel: "90 min",
    spots: 30,
    priceCents: null,
    summary: "A slow Sunday morning of gentle breathing, soft sound and quiet rest. Pay what feels right, or nothing at all.",
    body: "Start the new year slowly. In this 90-minute session we begin with easy breathing, then we listen to soft sounds and rest in silence together. Aoife Brennan guides each step in plain words. You do not need to be calm or flexible. Lie down, sit, or wrap yourself in a blanket. Many people tell us they feel more settled after a longer, quiet session like this. Your donation helps us keep events open to people with all budgets. You can pay what feels right for you, including nothing. Everyone gets the same welcome. This is not medical care. Please read our Health notice.",
    extraTitle: "How to join",
    extra: "Log in, choose your amount and register. Your Zoom link will be on your booking page. [Demo: Zoom link is a placeholder.] Bring a blanket, a cushion and a glass of water. Headphones help with the sound.",
    location: null,
    image: "/demo/singing-bowl-sage.webp",
    imageAlt: "Singing bowl with sage and crystals (stock photo, demo)",
  },
  {
    slug: "winter-light-half-day",
    title: "Winter Light Half-Day",
    pricing: "PAID",
    mode: "IN_PERSON",
    start: { year: 2026, month: 12, day: 12, hour: 10, minute: 0 },
    minutes: 180,
    lengthLabel: "3 hours",
    spots: 14,
    priceCents: 4500,
    summary: "Three quiet hours of breath, gentle movement and rest in a bright room in County Wicklow. Small group, tea at the end.",
    body: "Come and spend a slow Saturday morning with us. We start with a short welcome, then practise gentle movement and easy breathing. In the middle there is a long rest, with time to lie down and be still. At the end we share a warm cup of tea and a little time to talk, if you wish. The group is small, so everyone gets attention. Aoife Brennan explains every step, and you can rest at any time. All levels are welcome, also complete beginners. This is not medical care. If you are pregnant or have a health condition, please talk to your doctor first and read our Health notice.",
    extraTitle: "What to bring",
    extra: "A yoga mat (a few spare mats are available), a blanket, a water bottle and comfortable layers. Please arrive 10 minutes early.",
    location: DEMO_EVENT_LOCATION,
    image: "/demo/yoga-studio-windows.webp",
    imageAlt: "Bright yoga studio with large windows (stock photo, demo)",
  },
  {
    slug: "slow-morning-by-the-hills",
    title: "Slow Morning by the Hills",
    pricing: "PAID",
    mode: "IN_PERSON",
    start: { year: 2027, month: 2, day: 20, hour: 10, minute: 30 },
    minutes: 150,
    lengthLabel: "2 hours 30 minutes",
    spots: 12,
    priceCents: 3500,
    summary: "A calm late-winter morning with breath, a short quiet walk and a long rest. Small group, all levels.",
    body: "Winter is nearly over. Come and greet the lighter days with us. We begin indoors with warm breathing and slow movement. Then we take a short, easy walk outside, in silence if the weather is kind. Back inside, we finish with a long rest and a quiet minute together. The pace is slow and you decide how much to do. Aoife Brennan guides every part in simple words. You do not need any experience. If the weather is poor, we stay indoors and practise longer. This is not medical care. Please read our Health notice and talk to your doctor if you are unsure.",
    extraTitle: "What to bring",
    extra: "A mat, a blanket, a water bottle, and warm, waterproof shoes and a coat for the short walk. Please arrive 10 minutes early.",
    location: DEMO_EVENT_LOCATION,
    image: "/demo/terrace-meditation.webp",
    imageAlt: "Person meditating on a wooden terrace (stock photo, demo)",
  },
];

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
