/**
 * Offering form rules (task 12.8: classes, 1:1 and events). Pure: no database, no Next.js.
 * The server action calls `parseOfferingForm` (the real check). The form only shows hints with the same helpers.
 *
 * Rules (plan 14.3, owner answers 14.10):
 *  - Long texts use rule TOKENS ({{CANCELLATION_HOURS}}), never a hand-written rule number (validateText).
 *  - Public texts never hold a Zoom link or an email address (the Zoom link has its own session field, 12.9).
 *  - Session lengths are plain text (Q9). Each offering has its own copy of the long text (Q8).
 *  - Empty inputs arrive as "" or null: both mean "nothing typed".
 */
import { z } from "zod";
import { altSchema } from "@/lib/images/rules";
import { validateText } from "@/lib/text-tokens";

export type OfferingKind = "GROUP_CLASS" | "ONE_TO_ONE" | "EVENT";
export type OfferingMode = "ONLINE" | "IN_PERSON";
export type OfferingPricing = "FREE" | "DONATION" | "PAID";

export const KIND_LABEL: Record<OfferingKind, string> = { GROUP_CLASS: "Class", ONE_TO_ONE: "1:1", EVENT: "Event" };

export const TITLE_MAX = 120;
export const SUMMARY_MAX = 400;
export const BODY_MAX = 20000;
export const LEVEL_MAX = 60;
export const LENGTH_LABEL_MAX = 80;
export const LOCATION_MAX = 120;
export const SLUG_MIN = 3;
export const SLUG_MAX = 60;
export const MAX_PRICE_CENTS = 100_000; // EUR 1000
export const MAX_MINUTES = 600;
export const MAX_ORDER = 999;
export const NEW_CLASS_ORDER_DEFAULT = 100;

const oneLine = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const multiLine = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "");
const checkbox = (v: unknown) => v === true || v === "on" || v === "true";

// Plan 14.3 rule 4: no Zoom links and no email addresses in public text. {{CONTACT_EMAIL}} is the allowed way.
const PRIVATE_RE = /zoom\.us|zoomgov\.com|[^\s@]+@[^\s@]+\.[^\s@]+/i;
const PRIVATE_MSG = "Do not put email addresses or Zoom links in a public text. Use {{CONTACT_EMAIL}} for the contact email.";
const BAD_LINK_RE = /\]\(\s*(?:javascript|data|vbscript):/i;
const BAD_LINK_MSG = "Only http, https and mailto links are allowed.";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "12", "12.5", "12,50", "€12" -> cents. null = not a price. */
export function parsePriceToCents(raw: unknown): number | null {
  const t = oneLine(raw).replace(/^€\s*/, "");
  const m = /^(\d{1,4})(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
  return cents;
}

export function centsToPriceInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return Number.isInteger(cents / 100) ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** The save check for a long text field. Empty list = fine. Messages are short, in English, for the form. */
export function textProblems(text: string): string[] {
  const out: string[] = [];
  for (const p of validateText(text)) out.push(p.message);
  if (PRIVATE_RE.test(text)) out.push(PRIVATE_MSG);
  if (BAD_LINK_RE.test(text)) out.push(BAD_LINK_MSG);
  return out;
}

const text = (max: number, name: string) =>
  z.preprocess(oneLine, z.string().max(max, `${name}: at most ${max} characters.`));

/** An image address we accept. The service also checks it against the library (or the current image). */
export function isAcceptableImageUrl(url: string): boolean {
  if (/^\/uploads\/[0-9]{8}-[0-9a-f]{12}\.webp$/.test(url)) return true; // local development uploads
  if (/^\/real\/[A-Za-z0-9._-]+\.(?:webp|jpg|jpeg|png)$/.test(url)) return true; // photos that ship with the site
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.username && !u.password && /\.public\.blob\.vercel-storage\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

const baseSchema = z.object({
  title: z.preprocess(oneLine, z.string().min(3, "Title is required (at least 3 characters).").max(TITLE_MAX, `Title: at most ${TITLE_MAX} characters.`)),
  summary: z.preprocess(oneLine, z.string().min(1, "The short summary is required.").max(SUMMARY_MAX, `Summary: at most ${SUMMARY_MAX} characters.`)),
  body: z.preprocess(multiLine, z.string().max(BODY_MAX, `Text: at most ${BODY_MAX} characters.`)),
  level: text(LEVEL_MAX, "Level"),
  lengthLabel: text(LENGTH_LABEL_MAX, "Length label"),
  location: text(LOCATION_MAX, "Place"),
  minutes: z.preprocess((v) => (oneLine(v) === "" ? null : Number(oneLine(v))), z.number("Minutes must be a number.").int("Minutes must be a whole number.").min(1, "Minutes must be at least 1.").max(MAX_MINUTES, `Minutes: at most ${MAX_MINUTES}.`).nullable()),
  activationAfterMinutes: z.preprocess(
    (v) => (oneLine(v) === "" ? null : Number(oneLine(v))),
    z.number("Greeting minutes must be a number.").int("Greeting minutes must be a whole number.").min(1, "Greeting minutes must be at least 1.").max(MAX_MINUTES, `Greeting minutes: at most ${MAX_MINUTES}.`).nullable(),
  ),
  sortOrder: z.preprocess((v) => (oneLine(v) === "" ? 0 : Number(oneLine(v))), z.number("Order must be a number.").int("Order must be a whole number.").min(0, "Order cannot be negative.").max(MAX_ORDER, `Order is at most ${MAX_ORDER}.`)),
  published: z.preprocess(checkbox, z.boolean()),
});

export type OfferingContext = {
  type: OfferingKind;
  /** true = creating a new offering (slug is read and checked) */
  isNew: boolean;
};

export type OfferingData = {
  slug: string | null; // only when creating
  title: string;
  summary: string;
  body: string;
  level: string | null;
  minutes: number | null;
  lengthLabel: string | null;
  activationAfterMinutes: number | null;
  mode: OfferingMode;
  location: string | null;
  eventPricing: OfferingPricing | null;
  priceCents: number | null; // null = this offering has no editable price
  image: string | null;
  imageAlt: string | null;
  sortOrder: number | null; // null = leave as it is
  published: boolean;
};

export type OfferingParse = { ok: true; data: OfferingData } | { ok: false; fieldErrors: Record<string, string[]> };

function add(errors: Record<string, string[]>, key: string, message: string) {
  (errors[key] ??= []).push(message);
}

export function parseOfferingForm(raw: Record<string, unknown>, ctx: OfferingContext): OfferingParse {
  const errors: Record<string, string[]> = {};
  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) add(errors, String(issue.path[0] ?? "form"), issue.message);
  }
  const base = parsed.success ? parsed.data : null;

  // slug (only when creating; it is locked afterwards so public links never break)
  let slug: string | null = null;
  if (ctx.isNew) {
    const s = oneLine(raw.slug).toLowerCase();
    if (s.length < SLUG_MIN || s.length > SLUG_MAX || !SLUG_RE.test(s)) {
      add(errors, "slug", `URL name: ${SLUG_MIN}-${SLUG_MAX} characters, only small letters, numbers and single dashes (example: full-moon-2027-03-22).`);
    } else slug = s;
  }

  // text safety: tokens, hand-written rule numbers, private data
  if (base) {
    for (const key of ["summary", "body"] as const) for (const m of textProblems(base[key])) add(errors, key, m);
    for (const key of ["title", "level", "lengthLabel", "location"] as const) {
      if (PRIVATE_RE.test(base[key])) add(errors, key, PRIVATE_MSG);
    }
  }

  const isClass = ctx.type === "GROUP_CLASS";
  const isOneToOne = ctx.type === "ONE_TO_ONE";
  const isEvent = ctx.type === "EVENT";

  // mode: classes are always online; the 1:1 format is fixed (the 1:1 page finds its two cards by format)
  let mode: OfferingMode = "ONLINE";
  if (!isClass) {
    const m = oneLine(raw.mode);
    if (m === "ONLINE" || m === "IN_PERSON") mode = m;
    else add(errors, "mode", "Choose online or in person.");
  }
  if (base && mode === "IN_PERSON" && base.location === "") add(errors, "location", "Place is required for an in-person offering.");

  // minutes
  if (base) {
    if ((isClass || isOneToOne) && base.minutes === null && !errors.minutes) add(errors, "minutes", "Minutes is required.");
    if (base.activationAfterMinutes !== null && !(isClass || isEvent)) base.activationAfterMinutes = null;
    if (base.activationAfterMinutes !== null && base.minutes !== null && base.activationAfterMinutes >= base.minutes) {
      add(errors, "activationAfterMinutes", "Greeting minutes must be less than the session minutes.");
    }
  }

  // pricing + price
  let eventPricing: OfferingPricing | null = null;
  if (isEvent) {
    const p = oneLine(raw.eventPricing);
    if (p === "FREE" || p === "DONATION" || p === "PAID") eventPricing = p;
    else add(errors, "eventPricing", "Choose free, donation or paid.");
  }
  let priceCents: number | null = null;
  const needsPrice = isClass || isOneToOne || eventPricing === "PAID";
  if (needsPrice) {
    const cents = parsePriceToCents(raw.price);
    if (cents === null) add(errors, "price", isClass ? "Price is required. Write 0 for a free class." : "Price is required (example: 30 or 12.50).");
    else if (cents > MAX_PRICE_CENTS) add(errors, "price", `Price is at most ${MAX_PRICE_CENTS / 100} EUR.`);
    else if (cents === 0 && !isClass) add(errors, "price", "Price must be more than 0. For a free event choose Free.");
    else priceCents = cents;
  }

  // image + alt text
  // Only events show a picture on the public site (cards, event page, link preview). Classes and 1:1 pages have no image.
  const image = isEvent ? oneLine(raw.image) : "";
  let imageUrl: string | null = null;
  let imageAlt: string | null = null;
  if (image !== "") {
    if (!isAcceptableImageUrl(image)) add(errors, "image", "Choose an image from the library.");
    else imageUrl = image;
    const alt = altSchema.safeParse(raw.imageAlt);
    if (!alt.success) add(errors, "imageAlt", alt.error.issues[0].message);
    else imageAlt = alt.data;
  }

  if (!base || Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      slug,
      title: base.title,
      summary: base.summary,
      body: base.body,
      level: isClass && base.level !== "" ? base.level : null,
      minutes: base.minutes,
      lengthLabel: isEvent && base.lengthLabel !== "" ? base.lengthLabel : null,
      activationAfterMinutes: base.activationAfterMinutes,
      mode,
      location: mode === "IN_PERSON" ? base.location : null,
      eventPricing,
      priceCents,
      image: imageUrl,
      imageAlt,
      sortOrder: isClass ? base.sortOrder : null,
      published: base.published,
    },
  };
}
