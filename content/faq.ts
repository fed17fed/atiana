/**
 * FAQ: 15 questions from docs/demo-content.md section 13 (approved 2026-11-09).
 * Demo values are shown as "(demo price)" / "(demo value)". [OWNER: ...] notes stay visible
 * where the text gives no demo value.
 */
import { CANCELLATION_HOURS } from "@/lib/booking-rules";

export type FaqItem = {
  q: string;
  a: string;
  /** Shown only when packs are on (lib/features.ts). */
  packOnly?: boolean;
  /** Added to the answer only when "Refer a friend" is on (lib/features.ts). */
  referralNote?: string;
};
export type FaqGroup = {
  id: string;
  title: string;
  /** Title used while packs are hidden (so the page never says "packs") */
  titleWithoutPacks?: string;
  items: FaqItem[];
};

export const faqGroups: FaqGroup[] = [
  {
    id: "classes-zoom",
    title: "Classes & Zoom",
    items: [
      {
        q: "Do I need experience?",
        a: "No. All sessions welcome beginners. You only need to lie down, listen to the music and allow what arises.",
      },
      {
        q: "What do I need for a class?",
        a: "A device with Zoom, a quiet place, a yoga mat or comfy rug to lie on, and comfortable clothes. Wireless headphones or a speaker give good sound. Please keep your camera on.",
      },
      {
        q: "Do I need my camera on?",
        a: "Yes. Please keep your camera on and lie down so that your full body is visible from the side, from head to toes. The teacher watches each person during the session. We do not record sessions.",
      },
      {
        q: "When do I get the Zoom link?",
        a: `We send it by email right after you book. We also send a reminder ${CANCELLATION_HOURS} hours before the class.`,
      },
    ],
  },
  {
    id: "credits",
    title: "Packs & credits",
    titleWithoutPacks: "Credits",
    items: [
      {
        packOnly: true,
        q: "What is a class pack?",
        a: "A pack gives you several credits at a lower price. One credit books one group class. A 5-pack is €60 and a 10-pack is €105 (demo price).",
      },
      {
        packOnly: true,
        q: "How long do credits last?",
        a: 'Credits from a 5-pack are valid for 10 weeks. Credits from a 10-pack are valid for 16 weeks. You can see the date in "My credits". (demo values)',
      },
      {
        q: "Can I share my credits with a friend?",
        a: "No. Credits belong to your account.",
        referralNote: "You can invite a friend with your link and earn a free credit.",
      },
    ],
  },
  {
    id: "booking-cancellation",
    title: "Booking & cancellation",
    items: [
      {
        q: "Can I cancel a class?",
        a: `Yes. Cancel up to ${CANCELLATION_HOURS} hours before the class and you get your credit back. If you paid by card, you also get a credit. A free class can be cancelled any time before it starts. [OWNER: confirm "credit back" also for single paid classes]`,
      },
      {
        q: `What if I miss the ${CANCELLATION_HOURS}-hour limit or do not show up?`,
        a: "The credit is used and we cannot refund it. If you had a real problem, write to us and we will try to help.",
      },
      {
        q: "What if a class is cancelled by KEA?",
        a: "We will email you. You get your credit back, or you can move to another class.",
      },
    ],
  },
  {
    id: "one-to-one",
    title: "1:1 sessions",
    items: [
      {
        q: "How is a 1:1 session different from a group class?",
        a: "It is only for you and your teacher. You choose the topic and the pace. You can meet online or in person.",
      },
      {
        q: "Can I move my 1:1 session?",
        a: `Yes, up to ${CANCELLATION_HOURS} hours before. Use "My bookings" or write to us.`,
      },
    ],
  },
  {
    id: "other",
    title: "Other",
    items: [
      {
        q: "Are your classes medical care?",
        a: "No. Our classes are for relaxation and wellbeing only. They do not replace advice from a doctor. If you are pregnant or have a medical condition, please talk to your doctor first.",
      },
      {
        q: "How can I contact you or leave the newsletter?",
        a: "Use the Contact page or write to [CONTACT EMAIL]. Every newsletter has an unsubscribe link at the bottom.",
      },
    ],
  },
];

/** Text for search engines: no [OWNER: ...] notes and no "(demo ...)" tags. */
/** FAQ groups for the page: pack questions and referral sentences are left out while packs / referral are hidden. */
export function visibleFaqGroups(showPacks: boolean, showReferral = false): FaqGroup[] {
  return faqGroups
    .map((g) => ({
      id: g.id,
      title: showPacks ? g.title : (g.titleWithoutPacks ?? g.title),
      items: g.items
        .filter((i) => showPacks || !i.packOnly)
        .map((i) => ({ q: i.q, a: showReferral && i.referralNote ? `${i.a} ${i.referralNote}` : i.a })),
    }))
    .filter((g) => g.items.length > 0);
}

export function plainText(answer: string): string {
  return answer
    .replace(/\[OWNER:[^\]]*\]/g, "")
    .replace(/\s*\(demo (?:price|value|values)\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const faqCount = faqGroups.reduce((n, g) => n + g.items.length, 0);
