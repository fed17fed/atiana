/**
 * Legal page versions (task 12.13, plan 14.5). PURE functions: no database, no file system, no Next.js.
 * - Import: the rule numbers of the lawyer-approved files become tokens ({{CANCELLATION_HOURS}} ...), the rendered text stays identical.
 * - Save check for a legal text (same checks as every editable text, plus no HTML).
 * - "Last updated" line and version date (studio time zone, Europe/Dublin).
 * - Line diff between two versions.
 */
import { checkText, normalizeText } from "@/lib/admin/text-rules";
import { BUSINESS_TZ } from "@/lib/time";
import { fillTokens, validateTokens } from "@/lib/text-tokens";

/** The lawyer approved all 5 pages on this day (owner, plan 14.5). Version 1 = the .mdx file = this approved text. */
export const LEGAL_APPROVED_ON = "2026-11-19";
export const LEGAL_MAX_LENGTH = 60000;

/** Midday UTC of an ISO date ("2026-11-10"): the same calendar day in Dublin in winter AND summer. */
export function isoDateToUtcNoon(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

/** "2026-11-21" in the studio time zone. This is the "Version date" shown at the bottom of a legal page. */
export function legalIsoDate(at: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** "21 November 2026" in the studio time zone. This is the text of the "Last updated:" line. */
export function legalDateLabel(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TZ, day: "numeric", month: "long", year: "numeric" }).format(at);
}

const LAST_UPDATED_RE = /^Last updated:.*$/m;

/** Sets the "Last updated: <date>." line (the first one in the text). Returns the text unchanged when there is no such line. */
export function setLastUpdatedLine(body: string, at: Date): { body: string; found: boolean } {
  if (!LAST_UPDATED_RE.test(body)) return { body, found: false };
  return { body: body.replace(LAST_UPDATED_RE, `Last updated: ${legalDateLabel(at)}.`), found: true };
}

/** Two texts are "the same" when only the Last updated line differs. */
export function sameIgnoringDate(a: string, b: string): boolean {
  const strip = (t: string) => normalizeText(t).replace(LAST_UPDATED_RE, "Last updated: -");
  return strip(a) === strip(b);
}

// ---------------------------------------------------------------- import (finding F-1)

type Replacement = { re: RegExp; token: string; unit: string; expected: number };

/**
 * Which plain rule numbers of the approved files become tokens. Only these two pages (docs/admin/text-keys.md, F-1 and section 8).
 * Other numbers stay plain on purpose: "16 weeks" (hidden package), "14-day" (EU law), "2 hours / 30 minutes after a snack" (health advice).
 * `expected` = how many places the current files have (a test checks it, so a changed file does not go unnoticed).
 */
export const LEGAL_TOKEN_IMPORT: Readonly<Record<string, readonly Replacement[]>> = {
  "booking-cancellation": [
    { re: /\b24 hours\b/g, token: "CANCELLATION_HOURS", unit: "hours", expected: 5 },
    { re: /\b10 weeks\b/g, token: "CANCEL_CREDIT_VALID_WEEKS", unit: "weeks", expected: 2 },
    { re: /\b30 minutes\b/g, token: "HOLD_MINUTES", unit: "minutes", expected: 1 },
    { re: /\b5 minutes\b/g, token: "JOIN_EARLY_MINUTES", unit: "minutes", expected: 1 },
    { re: /\b7 days\b/g, token: "EVENT_REFUND_DAYS", unit: "days", expected: 1 },
  ],
  terms: [{ re: /\b5 minutes\b/g, token: "JOIN_EARLY_MINUTES", unit: "minutes", expected: 1 }],
};

/** Replaces the plain rule numbers by tokens. `counts` = how many places each rule had. Pure. */
export function tokenizeLegalBody(slug: string, body: string): { body: string; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  let out = body;
  for (const r of Object.hasOwn(LEGAL_TOKEN_IMPORT, slug) ? LEGAL_TOKEN_IMPORT[slug] : []) {
    let n = 0;
    out = out.replace(r.re, () => {
      n++;
      return `{{${r.token}}} ${r.unit}`;
    });
    counts[r.token] = n;
  }
  return { body: out, counts };
}

// ---------------------------------------------------------------- save check

/** "valid 16 weeks" is the hidden 1:1 package (owner Q6: keep the lawyer-approved text as it is). It is not a booking-rule constant. */
const PACK_WEEKS_RE = /\b16 weeks\b/g;

export type LegalCheck = { ok: true; value: string } | { ok: false; problems: string[] };

/** The save check for a legal text, run on the SERVER on every draft save and every publish. Same rules as the other texts, plus: no HTML tags. */
export function checkLegalBody(raw: unknown): LegalCheck {
  if (typeof raw !== "string") return { ok: false, problems: ["The text is missing."] };
  const value = normalizeText(raw);
  if (value.length > LEGAL_MAX_LENGTH) return { ok: false, problems: [`The text is too long: ${value.length} of ${LEGAL_MAX_LENGTH} characters.`] }; // before the slower checks
  // The 16-weeks pack phrase is allowed: hide it from the rule check only (the stored text is not changed).
  const checked = checkText({ kind: "MARKDOWN", maxLength: LEGAL_MAX_LENGTH, multiline: true }, value.replace(PACK_WEEKS_RE, "16 weeks"));
  const problems = checked.ok ? [] : [...checked.problems];
  if (/<\/?[a-z][^>]*>|<!--/i.test(value)) problems.push("Do not use HTML. Tags would show as plain characters. Use the Markdown marks (## headings, - lists, **bold**).");
  return problems.length ? { ok: false, problems } : { ok: true, value };
}

/** True when the text can be shown with its tokens filled (no unknown token). Used by the public page before it trusts a database text. */
export function hasOnlyKnownTokens(body: string): boolean {
  return validateTokens(body).length === 0;
}

/** The text a visitor sees: tokens filled with the real numbers. */
export function renderLegalBody(body: string): string {
  return fillTokens(body);
}

// ---------------------------------------------------------------- diff

export type DiffLine = { type: "same" | "add" | "del"; text: string };

const MAX_DIFF_CELLS = 4_000_000;

/** Line diff (longest common subsequence). `del` = only in the old text, `add` = only in the new text. Huge inputs fall back to "all removed, all added". */
export function lineDiff(oldText: string, newText: string): { lines: DiffLine[]; added: number; removed: number } {
  const a = normalizeText(oldText).split("\n");
  const b = normalizeText(newText).split("\n");
  const lines: DiffLine[] = [];
  if ((a.length + 1) * (b.length + 1) > MAX_DIFF_CELLS) {
    for (const t of a) lines.push({ type: "del", text: t });
    for (const t of b) lines.push({ type: "add", text: t });
  } else {
    const w = b.length + 1;
    const dp = new Uint32Array((a.length + 1) * w);
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        lines.push({ type: "same", text: a[i] });
        i++;
        j++;
      } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
        lines.push({ type: "del", text: a[i++] });
      } else {
        lines.push({ type: "add", text: b[j++] });
      }
    }
    while (i < a.length) lines.push({ type: "del", text: a[i++] });
    while (j < b.length) lines.push({ type: "add", text: b[j++] });
  }
  return { lines, added: lines.filter((l) => l.type === "add").length, removed: lines.filter((l) => l.type === "del").length };
}

/** Keeps the changed lines and `context` unchanged lines around them. A gap becomes one { gap: n } marker. */
export function diffWithContext(lines: DiffLine[], context = 2): (DiffLine | { gap: number })[] {
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, i) => {
    if (l.type === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out: (DiffLine | { gap: number })[] = [];
  let gap = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (gap) out.push({ gap });
      gap = 0;
      out.push(l);
    } else gap++;
  });
  if (gap) out.push({ gap });
  return out;
}

// ---------------------------------------------------------------- which version is what

type VersionLike = { version: number; status: "DRAFT" | "PUBLISHED"; lawyerApproved: boolean };

/**
 * Rows of ONE page, newest first (highest version number first).
 * - published = the newest PUBLISHED row (what visitors see)
 * - approved  = the newest PUBLISHED row that the lawyer approved (what "Restore" brings back, and what the diff compares with)
 * - draft     = the newest row, if it is a DRAFT (the waiting draft). A draft that is older than a published row is history, not waiting.
 */
export function deriveLegalState<T extends VersionLike>(rowsNewestFirst: readonly T[]): { published: T | null; approved: T | null; draft: T | null; maxVersion: number } {
  const published = rowsNewestFirst.find((r) => r.status === "PUBLISHED") ?? null;
  const approved = rowsNewestFirst.find((r) => r.status === "PUBLISHED" && r.lawyerApproved) ?? null;
  const first = rowsNewestFirst[0] ?? null;
  return { published, approved, draft: first && first.status === "DRAFT" ? first : null, maxVersion: first?.version ?? 0 };
}
