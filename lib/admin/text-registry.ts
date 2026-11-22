/**
 * Editable texts as the admin sees them (task 12.7, wireframes A3/A4). Pure: no database, no Next.js.
 * The list of keys and the code defaults come from content/site-texts.ts (the only source). This file adds
 * a friendly name, the page, and the kind (how the text is shown on the site, so the editor and the preview match).
 *
 * Kinds (the same names as the ContentKind enum in the database):
 * - INLINE   one line shown with RichText: *italic* and [label](link) work.
 * - MARKDOWN paragraphs (blank line = new paragraph), shown with RichText: *italic* and [label](link) work.
 * - TEXT     plain text. No marks are applied (an asterisk stays an asterisk).
 * - META     search engine / link preview text. Plain.
 * - ALT      image description for screen readers. Plain.
 * - URL      a link address (https only).
 */
import { SITE_TEXT_DEFAULTS } from "@/content/site-texts";

export type TextKind = "TEXT" | "INLINE" | "MARKDOWN" | "META" | "ALT" | "URL";
export type TextPageId = "home" | "about" | "faq" | "shared";

export const TEXT_PAGES: readonly { id: TextPageId; label: string; path: string }[] = [
  { id: "home", label: "Home", path: "/" },
  { id: "about", label: "About", path: "/about" },
  { id: "faq", label: "FAQ", path: "/faq" },
  { id: "shared", label: "Shared (Home and About)", path: "/" },
];

export type TextEntry = {
  key: string;
  page: TextPageId;
  pageLabel: string;
  /** Public page where the text can be seen ("View page" link). */
  pagePath: string;
  kind: TextKind;
  /** Friendly name, e.g. "Home – hero title". */
  label: string;
  /** The code default (may hold tokens). */
  defaultText: string;
  /** Plain text is shown in a single line box or a bigger box; marks are applied only for INLINE and MARKDOWN. */
  multiline: boolean;
  maxLength: number;
};

/** Texts that the page shows with RichText on ONE line (see app/page.tsx, about, faq). */
const INLINE_KEYS = new Set(["home.hero.title", "about.teacher.healthNote", "about.expect.healthHint", "faq.page.lead"]);

export const MAX_TEXT_LENGTH = 2000;
export const MAX_URL_LENGTH = 300;
export const MAX_NOTE_LENGTH = 200;

export function kindOf(key: string): TextKind {
  if (INLINE_KEYS.has(key)) return "INLINE";
  const parts = key.split(".");
  const last = parts[parts.length - 1];
  if (parts.includes("meta")) return "META";
  if (last === "imageAlt") return "ALT";
  if (last === "instagramUrl" || /Url$/.test(last)) return "URL";
  if (last === "a" || key === "faq.credits.share.referralNote") return "MARKDOWN";
  return "TEXT";
}

const WORDS: Record<string, string> = { q: "question", a: "answer", imageAlt: "image description", ogTitle: "link preview title", ogDescription: "link preview text", cta: "button", ctaPrimary: "main button", ctaSecondary: "second button", instagramUrl: "Instagram link", instagramName: "Instagram name", oneToOne: "1:1" };

function words(part: string): string {
  if (Object.hasOwn(WORDS, part)) return WORDS[part];
  return part.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

/** "home.hero.title" -> "Home – hero title"; "faq.booking.cancel.q" -> "FAQ – booking cancel question". */
export function labelOf(key: string): string {
  const [page, ...rest] = key.split(".");
  const pageLabel = TEXT_PAGES.find((p) => p.id === page)?.label.split(" (")[0] ?? page;
  return `${pageLabel} – ${rest.map(words).join(" ")}`;
}

function build(key: string, defaultText: string): TextEntry {
  const page = (key.split(".")[0] as TextPageId) ?? "home";
  const info = TEXT_PAGES.find((p) => p.id === page) ?? TEXT_PAGES[0];
  const kind = kindOf(key);
  return {
    key,
    page: info.id,
    pageLabel: info.label,
    pagePath: info.path,
    kind,
    label: labelOf(key),
    defaultText,
    multiline: kind === "MARKDOWN" || defaultText.length > 90,
    maxLength: kind === "URL" ? MAX_URL_LENGTH : MAX_TEXT_LENGTH,
  };
}

/** All editable texts in the order of the code file (shared, home, about, faq). */
export const TEXT_ENTRIES: readonly TextEntry[] = Object.entries(SITE_TEXT_DEFAULTS).map(([key, text]) => build(key, text));

const BY_KEY = new Map(TEXT_ENTRIES.map((e) => [e.key, e]));

/** null for a key that is not in the code file (the admin can never write a key the site does not know). */
export function getTextEntry(key: string): TextEntry | null {
  return BY_KEY.get(key) ?? null;
}

/** The key as it arrives from a form or an address: a string, short, only key characters. */
export function cleanKey(raw: unknown): string | null {
  return typeof raw === "string" && raw.length <= 120 && /^[A-Za-z0-9.]+$/.test(raw) ? raw : null;
}
