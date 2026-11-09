/**
 * FAQ: 15 questions from docs/demo-content.md section 13 (approved 2026-11-09).
 * Demo values are shown as "(demo price)" / "(demo value)". [OWNER: ...] notes stay visible
 * where the text gives no demo value.
 */
export type FaqItem = { q: string; a: string };
export type FaqGroup = { id: string; title: string; items: FaqItem[] };

export const faqGroups: FaqGroup[] = [
  {
    id: "classes-zoom",
    title: "Classes & Zoom",
    items: [
      {
        q: "Do I need experience?",
        a: "No. All classes welcome beginners. If you are new, start with the Beginners' Introduction.",
      },
      {
        q: "What do I need for a class?",
        a: "A device with Zoom, a quiet place, a chair or a mat, and comfortable clothes. Headphones can help.",
      },
      {
        q: "Do I have to turn my camera on?",
        a: "No. Camera on or off is your choice. The teacher will still guide you clearly.",
      },
      {
        q: "When do I get the Zoom link?",
        a: "We send it by email right after you book. We also send a reminder 24 hours before the class.",
      },
    ],
  },
  {
    id: "packs-credits",
    title: "Packs & credits",
    items: [
      {
        q: "What is a class pack?",
        a: "A pack gives you several credits at a lower price. One credit books one group class. A 5-pack is €60 and a 10-pack is €105 (demo price).",
      },
      {
        q: "How long do credits last?",
        a: 'Credits from a 5-pack are valid for 10 weeks. Credits from a 10-pack are valid for 16 weeks. You can see the date in "My credits". (demo values)',
      },
      {
        q: "Can I share my credits with a friend?",
        a: "No. Credits belong to your account. You can invite a friend with your link and earn a free credit.",
      },
    ],
  },
  {
    id: "booking-cancellation",
    title: "Booking & cancellation",
    items: [
      {
        q: "Can I cancel a class?",
        a: 'Yes. Cancel up to 24 hours before the class and you get your credit back. If you paid by card, you also get a credit. [OWNER: confirm "credit back" also for single paid classes]',
      },
      {
        q: "What if I miss the 24-hour limit or do not show up?",
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
        a: 'Yes, up to 24 hours before. Use "My bookings" or write to us.',
      },
    ],
  },
  {
    id: "shop",
    title: "Shop",
    items: [
      {
        q: "How much is shipping and how long does it take?",
        a: "Shipping is €5 in Ireland and takes 2–4 working days. (demo value) [OWNER: shipping area; physical or digital]",
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
export function plainText(answer: string): string {
  return answer
    .replace(/\[OWNER:[^\]]*\]/g, "")
    .replace(/\s*\(demo (?:price|value|values)\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const faqCount = faqGroups.reduce((n, g) => n + g.items.length, 0);
