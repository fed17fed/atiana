/**
 * Code defaults for editable texts (tasks 12.5 / 12.6). key -> default text.
 * - Key names follow docs/admin/text-keys.md: <page>.<section>.<item>. A key never changes after it is in the DB.
 * - A default may contain rule tokens ({{CANCELLATION_HOURS}} ...) and site tokens ({{CONTACT_EMAIL}} ...). They are filled
 *   by getText() from lib/booking-rules.ts / lib/text-tokens.ts. NEVER write a rule number by hand in a text here.
 * - Kinds: TEXT = plain, INLINE / MARKDOWN = may use *italic* and [label](/link). Rendered by components/ui/RichText.tsx.
 * - The DB (ContentBlock) stores only what an admin changed. An empty table = the site looks exactly like these texts.
 * Home, About and FAQ are here (task 12.6). Other pages stay in code (owner answer Q10).
 */
import { INSTAGRAM_NAME, INSTAGRAM_URL, TEACHER_BIO } from "@/content/home";
import { SITE_NAME } from "@/lib/site";

/** Teacher block shown on Home and About (one text, one edit changes both pages). */
export const SHARED_TEXTS = {
  "shared.teacher.imageAlt": "Portrait of Atiana in a white blouse, eyes closed, in a forest scene",
  "shared.teacher.eyebrow": "Meet your teacher",
  "shared.teacher.title": "Hello, I am Atiana.",
  "shared.teacher.bio": TEACHER_BIO,
  "shared.teacher.instagramName": INSTAGRAM_NAME,
  "shared.teacher.instagramUrl": INSTAGRAM_URL,
} as const satisfies Record<string, string>;

export const HOME_TEXTS = {
  "home.meta.title": `${SITE_NAME} – live classes, 1:1 sessions and events`,
  "home.meta.description":
    "Warm, simple breath and stillness practice. Live classes on Zoom, 1:1 sessions and events. All levels welcome. Demo site.",
  "home.meta.ogTitle": `${SITE_NAME} – come home to your own light`,
  "home.meta.ogDescription": "Live classes on Zoom, 1:1 sessions and events for breath, energy and stillness.",
  "home.hero.eyebrow": "Online classes · 1:1 · events",
  "home.hero.title": "Come home to your *own light.*",
  "home.hero.lead": "Warm, simple practice you can do from your living room or by the hills in Ireland.",
  "home.hero.ctaPrimary": "See the schedule",
  "home.hero.ctaSecondary": "How it works",
  "home.hero.trust.zoom": "Live on Zoom",
  "home.hero.trust.levels": "All levels welcome",
  "home.hero.trust.cancel": "Cancel up to {{CANCELLATION_HOURS}} hours before · free classes any time",
  "home.hero.imageAlt": "Woman in white sitting in a forest scene with one arm raised and one hand open, eyes closed",
  "home.hero.card.kicker": "Next class",
  "home.next.eyebrow": "This week",
  "home.next.title": "Next classes",
  "home.next.lead": "Join live from home. Pick a time that fits your day. No experience needed.",
  "home.next.cta": "See full schedule",
  "home.next.hint": "Demo times. The live schedule comes with online booking.",
  "home.offers.eyebrow": "Three ways to practise",
  "home.offers.title": "Ways to practise",
  "home.offers.classes.badge": "Online",
  "home.offers.classes.imageAlt": "A woman doing a gentle stretch on a mat in front of a laptop at home",
  "home.offers.classes.title": "Group classes",
  "home.offers.classes.text": "Live on Zoom, every week. All levels.",
  "home.offers.classes.pricePrefix": "Free or from",
  "home.offers.classes.link": "See classes",
  "home.offers.oneToOne.badge": "Online or in person",
  "home.offers.oneToOne.imageAlt": "A bundle of burning incense sticks in front of a wooden house",
  "home.offers.oneToOne.title": "1:1 sessions",
  "home.offers.oneToOne.text": "Personal guidance, online or in person.",
  "home.offers.oneToOne.pricePrefix": "From",
  "home.offers.oneToOne.link": "Book a session",
  "home.offers.events.badge": "Events",
  "home.offers.events.imageAlt": "Full moon seen between tall bare trees at night",
  "home.offers.events.title": "Events",
  "home.offers.events.text": "Longer sessions and special days. Free, by donation or paid.",
  "home.offers.events.price": "Free · donation · paid",
  "home.offers.events.link": "See events",
  "home.quotes.title": "What people say",
  "home.how.title": "How it works",
  "home.how.step1.title": "Choose a class",
  "home.how.step1.text": "Pick a time on the schedule. Beginners are very welcome.",
  "home.how.step2.title": "Book and pay",
  "home.how.step2.text": "Pay once, use a credit, or join a free class.",
  "home.how.step3.title": "Join on Zoom",
  "home.how.step3.text":
    "Your link comes by email. Cancel up to {{CANCELLATION_HOURS}} hours before and keep your credit. Free classes: cancel any time before the start.",
  "home.teacher.cta": "About KEA by Atiana",
  "home.nl.eyebrow": "Newsletter",
  "home.nl.title": "One calm email a week",
  "home.nl.text": "Practice ideas and new dates. No spam.",
  "home.cta.title": "Ready for your first class?",
  "home.cta.text": "Take a few quiet minutes for yourself this week. We will keep a seat for you.",
  "home.cta.primary": "Book a class",
  "home.cta.secondary": "Read the questions people ask",
} as const satisfies Record<string, string>;

export const ABOUT_TEXTS = {
  "about.meta.title": "About",
  "about.meta.description":
    "KEA by Atiana is a small, friendly space for breath, energy and stillness. Meet Atiana and see what to expect in a session.",
  "about.meta.ogTitle": "About KEA by Atiana",
  "about.hero.eyebrow": "About us",
  "about.hero.title": "About KEA by Atiana",
  "about.hero.lead": "A small, friendly space for breath, energy and stillness.",
  "about.hero.imageAlt": "A thin crescent moon above a still, frozen sea at sunset",
  "about.teacher.healthNote":
    "KEA is not a medical service. We do not treat illness and we do not make promises about results. Please read our [Health notice](/legal/health-disclaimer).",
  "about.values.title": "Our values",
  "about.values.gentle.title": "Gentle",
  "about.values.gentle.text": "We go at your pace. You can rest, skip or sit out any part of a class.",
  "about.values.clear.title": "Clear",
  "about.values.clear.text": "We use simple words and short steps. No special terms, no pressure.",
  "about.values.welcoming.title": "Welcoming",
  "about.values.welcoming.text": "All levels, all bodies, all backgrounds. You belong here.",
  "about.expect.title": "What to expect in a class",
  "about.expect.before.title": "Before",
  "about.expect.before.text":
    "You get an email with your Zoom link. Find a quiet spot with a yoga mat or a comfy rug. Wear comfortable clothes. Have water nearby.",
  "about.expect.start.title": "At the start",
  "about.expect.start.text":
    "Please join {{JOIN_EARLY_MINUTES}} minutes before the start. Doors close at the start time, and we cannot let you in later.",
  "about.expect.during.title": "During the class",
  "about.expect.during.text":
    "You lie down, listen to music and allow what arises. Please keep your camera on, with your full body visible. You can stop at any time.",
  "about.expect.after.title": "After",
  "about.expect.after.text":
    "There is a short quiet minute. You can ask questions. Then you get a short thank-you email.",
  "about.expect.healthHint": "Classes are not medical care. See our [Health notice](/legal/health-disclaimer).",
  "about.expect.cta": "Book your first class",
} as const satisfies Record<string, string>;

export const FAQ_TEXTS = {
  "faq.meta.title": "FAQ",
  "faq.meta.description": "Answers about classes, Zoom, credits, booking and cancellation and 1:1 sessions.",
  "faq.meta.ogTitle": "Questions people ask – KEA by Atiana",
  "faq.page.eyebrow": "FAQ",
  "faq.page.title": "Questions people ask",
  "faq.page.lead":
    "Short answers about classes, credits and booking. Cannot find yours? Please [write to us](/contact).",
  "faq.group.classesZoom.title": "Classes & Zoom",
  "faq.group.credits.title": "Packs & credits",
  "faq.group.credits.titleWithoutPacks": "Credits",
  "faq.group.booking.title": "Booking & cancellation",
  "faq.group.oneToOne.title": "1:1 sessions",
  "faq.group.other.title": "Other",
  "faq.classesZoom.experience.q": "Do I need experience?",
  "faq.classesZoom.experience.a":
    "No. All sessions welcome beginners. You only need to lie down, listen to the music and allow what arises.",
  "faq.classesZoom.whatNeed.q": "What do I need for a class?",
  "faq.classesZoom.whatNeed.a":
    "A device with Zoom, a quiet place, a yoga mat or comfy rug to lie on, and comfortable clothes. Wireless headphones or a speaker give good sound. Please keep your camera on.",
  "faq.classesZoom.camera.q": "Do I need my camera on?",
  "faq.classesZoom.camera.a":
    "Yes. Please keep your camera on and lie down so that your full body is visible from the side, from head to toes. The teacher watches each person during the session. We do not record sessions.",
  "faq.classesZoom.zoomLink.q": "When do I get the Zoom link?",
  "faq.classesZoom.zoomLink.a":
    "We send it by email right after you book. We also send a reminder {{REMINDER_HOURS}} hours before the class.",
  "faq.credits.whatIsPack.q": "What is a class pack?",
  "faq.credits.whatIsPack.a":
    "A pack gives you several credits at a lower price. One credit books one group class. A 5-pack is €60 and a 10-pack is €105 (demo price).",
  "faq.credits.howLong.q": "How long do credits last?",
  "faq.credits.howLong.a":
    'Credits from a 5-pack are valid for 10 weeks. Credits from a 10-pack are valid for 16 weeks. You can see the date in "My credits". (demo values)',
  "faq.credits.share.q": "Can I share my credits with a friend?",
  "faq.credits.share.a": "No. Credits belong to your account.",
  "faq.credits.share.referralNote": "You can invite a friend with your link and earn a free credit.",
  "faq.booking.cancel.q": "Can I cancel a class?",
  "faq.booking.cancel.a":
    'Yes. In "My bookings" you can cancel up to {{CANCELLATION_HOURS}} hours before the class starts. If you used a credit, it goes back to your account (an expired credit is not returned). If you paid for a single class by card, you choose: 1 class credit, valid for {{CANCEL_CREDIT_VALID_WEEKS}} weeks, or your money back to your card. A free class can be cancelled any time before it starts.',
  "faq.booking.missLimit.q": "What if I miss the {{CANCELLATION_HOURS}}-hour limit or do not show up?",
  "faq.booking.missLimit.a":
    "The credit is used and we cannot refund it. If you had a real problem, write to us and we will try to help.",
  "faq.booking.cancelledByKea.q": "What if a class is cancelled by KEA?",
  "faq.booking.cancelledByKea.a": "We will email you. If you used a credit, you get your credit back. If you paid by card, you get your money back.",
  "faq.oneToOne.difference.q": "How is a 1:1 session different from a group class?",
  "faq.oneToOne.difference.a":
    "It is only for you and your teacher. You choose the topic and the pace. You can meet online or in person.",
  "faq.oneToOne.move.q": "Can I move my 1:1 session?",
  "faq.oneToOne.move.a":
    'No, there is no "move" button. To change the time, cancel your 1:1 session in "My bookings" and book a new time. The cancel rules are the same as for group classes: up to {{CANCELLATION_HOURS}} hours before the start you get your credit back or, if you paid by card, you choose 1 credit or your money back. Later than that, there is no credit and no refund.',
  "faq.other.medical.q": "Are your classes medical care?",
  "faq.other.medical.a":
    "No. Our classes are for relaxation and wellbeing only. They do not replace advice from a doctor. If you are pregnant or have a medical condition, please talk to your doctor first.",
  "faq.other.contact.q": "How can I contact you or leave the newsletter?",
  "faq.other.contact.a":
    "Use the Contact page or write to {{CONTACT_EMAIL}}. Every newsletter has an unsubscribe link at the bottom.",
} as const satisfies Record<string, string>;

export const SITE_TEXT_DEFAULTS: Readonly<Record<string, string>> = {
  ...SHARED_TEXTS,
  ...HOME_TEXTS,
  ...ABOUT_TEXTS,
  ...FAQ_TEXTS,
};
