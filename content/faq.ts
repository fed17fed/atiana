/**
 * FAQ structure: groups, order, flags and the KEY of every text (task 12.6).
 * The texts themselves (questions, answers, group titles) are code defaults in content/site-texts.ts (FAQ_TEXTS) and can be
 * edited in the admin (ContentBlock). Order of groups / questions and the flags `packOnly` / referral stay in code (plan 14.3).
 * Demo values are shown as "(demo price)" / "(demo value)". [OWNER: ...] notes stay visible where the text gives no value.
 */
import { SITE_TEXT_DEFAULTS } from "@/content/site-texts";
import { inlineToPlain } from "@/lib/inline-text";
import { fillTokens } from "@/lib/text-tokens";

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

type FaqItemDef = {
  /** Text keys are `${key}.q` and `${key}.a`. */
  key: string;
  packOnly?: boolean;
  /** Key of the referral sentence (shown only when "Refer a friend" is on). */
  referralNoteKey?: string;
};
type FaqGroupDef = {
  id: string;
  /** Text key of the group title. */
  titleKey: string;
  titleWithoutPacksKey?: string;
  items: FaqItemDef[];
};

/** Order and flags (code). Keys never change after they are in the DB. */
export const FAQ_STRUCTURE: FaqGroupDef[] = [
  {
    id: "classes-zoom",
    titleKey: "faq.group.classesZoom.title",
    items: [
      { key: "faq.classesZoom.experience" },
      { key: "faq.classesZoom.whatNeed" },
      { key: "faq.classesZoom.camera" },
      { key: "faq.classesZoom.zoomLink" },
    ],
  },
  {
    id: "credits",
    titleKey: "faq.group.credits.title",
    titleWithoutPacksKey: "faq.group.credits.titleWithoutPacks",
    items: [
      { key: "faq.credits.whatIsPack", packOnly: true },
      { key: "faq.credits.howLong", packOnly: true },
      { key: "faq.credits.share", referralNoteKey: "faq.credits.share.referralNote" },
    ],
  },
  {
    id: "booking-cancellation",
    titleKey: "faq.group.booking.title",
    items: [{ key: "faq.booking.cancel" }, { key: "faq.booking.missLimit" }, { key: "faq.booking.cancelledByKea" }],
  },
  {
    id: "one-to-one",
    titleKey: "faq.group.oneToOne.title",
    items: [{ key: "faq.oneToOne.difference" }, { key: "faq.oneToOne.move" }],
  },
  {
    id: "other",
    titleKey: "faq.group.other.title",
    items: [{ key: "faq.other.medical" }, { key: "faq.other.contact" }],
  },
];

/** All text keys the FAQ page needs (for tests and for the editor list). */
export const FAQ_TEXT_KEYS: string[] = FAQ_STRUCTURE.flatMap((g) => [
  g.titleKey,
  ...(g.titleWithoutPacksKey ? [g.titleWithoutPacksKey] : []),
  ...g.items.flatMap((i) => [`${i.key}.q`, `${i.key}.a`, ...(i.referralNoteKey ? [i.referralNoteKey] : [])]),
]);

/** Builds the full group list from a key -> text lookup (already filled with tokens). */
export function buildFaqGroups(text: (key: string) => string): FaqGroup[] {
  return FAQ_STRUCTURE.map((g) => ({
    id: g.id,
    title: text(g.titleKey),
    ...(g.titleWithoutPacksKey ? { titleWithoutPacks: text(g.titleWithoutPacksKey) } : {}),
    items: g.items.map((i) => ({
      q: text(`${i.key}.q`),
      a: text(`${i.key}.a`),
      ...(i.packOnly ? { packOnly: true } : {}),
      ...(i.referralNoteKey ? { referralNote: text(i.referralNoteKey) } : {}),
    })),
  }));
}

/** The code defaults (today's FAQ), tokens filled. Used when the database has no edited text. */
export const faqGroups: FaqGroup[] = buildFaqGroups((key) => fillTokens(SITE_TEXT_DEFAULTS[key] ?? ""));

/** FAQ groups for the page: pack questions and referral sentences are left out while packs / referral are hidden. */
export function visibleFaqGroups(showPacks: boolean, showReferral = false, groups: FaqGroup[] = faqGroups): FaqGroup[] {
  return groups
    .map((g) => ({
      id: g.id,
      title: showPacks ? g.title : (g.titleWithoutPacks ?? g.title),
      items: g.items
        .filter((i) => showPacks || !i.packOnly)
        .map((i) => ({ q: i.q, a: showReferral && i.referralNote ? `${i.a} ${i.referralNote}` : i.a })),
    }))
    .filter((g) => g.items.length > 0);
}

/** Text for search engines: no [OWNER: ...] notes, no "(demo ...)" tags, no *marks* and no [label](link) marks. */
export function plainText(answer: string): string {
  return inlineToPlain(answer.replace(/\[OWNER:[^\]]*\]/g, ""))
    .replace(/\s*\(demo (?:price|value|values)\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const faqCount = faqGroups.reduce((n, g) => n + g.items.length, 0);
