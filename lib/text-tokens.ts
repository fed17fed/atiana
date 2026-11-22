/**
 * Rule tokens for editable texts (task 12.5, plan 14.3 rule 2).
 * A text never writes a rule number ("24 hours"). It writes a token ({{CANCELLATION_HOURS}}) and the page fills it from
 * lib/booking-rules.ts. So code, FAQ and legal texts always say the same number.
 *
 * Pure functions, no database, no Next.js. Used by getText (read) and by the save validator (admin editors, tasks 12.7 and 12.13).
 */
import {
  CANCELLATION_HOURS,
  CANCEL_CREDIT_VALID_WEEKS,
  EVENT_REFUND_DAYS,
  HOLD_MINUTES,
  JOIN_EARLY_MINUTES,
  REMINDER_HOURS,
} from "./booking-rules";
import { COMPANY } from "./company";

/** Rule tokens. The value is always a number written as text. */
export const RULE_TOKENS = {
  CANCELLATION_HOURS: String(CANCELLATION_HOURS),
  EVENT_REFUND_DAYS: String(EVENT_REFUND_DAYS),
  JOIN_EARLY_MINUTES: String(JOIN_EARLY_MINUTES),
  REMINDER_HOURS: String(REMINDER_HOURS),
  HOLD_MINUTES: String(HOLD_MINUTES),
  CANCEL_CREDIT_VALID_WEEKS: String(CANCEL_CREDIT_VALID_WEEKS),
} as const satisfies Record<string, string>;

/**
 * Site tokens (contact email, company data), all from ONE place: lib/company.ts (owner answer Q4, 2026-11-21).
 * The public text check (plan 14.3 rule 4) blocks email addresses typed by hand; the token is the allowed way.
 * Values are placeholders until the owner gives the company data (Phase 10). `{{LAST_UPDATED}}` comes with the legal editor (12.13).
 */
export const SITE_TOKENS: Readonly<Record<string, string>> = {
  CONTACT_EMAIL: COMPANY.contactEmail,
  COMPANY_NAME: COMPANY.name,
  COMPANY_ADDRESS: COMPANY.address,
  CRO_NUMBER: COMPANY.croNumber,
};

/** Every token a text may use. */
export const ALL_TOKENS: Readonly<Record<string, string>> = { ...RULE_TOKENS, ...SITE_TOKENS };

export const TOKEN_NAMES: readonly string[] = Object.keys(ALL_TOKENS);

// {{NAME}} with optional spaces inside. Names are letters, digits and "_".
const TOKEN_RE = /\{\{\s*([A-Za-z0-9_]*)\s*\}\}/g;

/** Names of all `{{...}}` tokens found in the text (known or not), in order, with repeats. */
export function findTokens(text: string): string[] {
  return Array.from(text.matchAll(TOKEN_RE), (m) => m[1]);
}

/** Replaces known tokens with their values. Unknown tokens stay as they are (use validateText before saving). */
export function fillTokens(text: string, tokens: Readonly<Record<string, string>> = ALL_TOKENS): string {
  return text.replace(TOKEN_RE, (whole, name: string) => (Object.hasOwn(tokens, name) ? tokens[name] : whole));
}

export type TextProblem = {
  code: "UNKNOWN_TOKEN" | "BROKEN_TOKEN" | "HARD_CODED_RULE";
  /** The part of the text that caused the problem. */
  match: string;
  /** Short English message for the admin form. */
  message: string;
};

/** Unknown tokens and broken braces ("{{" or "}}" alone). */
export function validateTokens(text: string, tokens: Readonly<Record<string, string>> = ALL_TOKENS): TextProblem[] {
  const problems: TextProblem[] = [];
  for (const name of findTokens(text)) {
    if (!name || !Object.hasOwn(tokens, name)) {
      problems.push({
        code: "UNKNOWN_TOKEN",
        match: `{{${name}}}`,
        message: `Unknown token {{${name}}}. Allowed tokens: ${Object.keys(tokens).map((n) => `{{${n}}}`).join(", ")}.`,
      });
    }
  }
  const rest = text.replace(TOKEN_RE, "");
  const broken = /\{\{|\}\}/.exec(rest);
  if (broken) {
    problems.push({ code: "BROKEN_TOKEN", match: broken[0], message: "Broken token: every {{ needs a closing }} and a name inside." });
  }
  return problems;
}

/**
 * Numbers that are NOT booking rules and may stay plain text (docs/admin/text-keys.md section 2.3, finding F-3).
 * They are removed from the text before the rule-phrase check. This list is the "allow list".
 */
const ALLOWED_PLAIN: RegExp[] = [
  /\b14[- ]?days?\b/gi, // EU withdrawal right
  /\b(?:112|999)\b/g, // emergency numbers
  /\b\d+[- ]?(?:minutes?|mins?|hours?)\s+after\s+(?:a|an|the|your|you)?\s*(?:meal|lunch|snack|dinner|breakfast|eating|food)\b/gi, // health advice
  /\b\d+[- ]?(?:minutes?|mins?|hours?)\s+after\s+(?:the\s+)?(?:start|greeting|beginning)\b/gi, // session structure (data)
  // "I will hold the space for you for the duration of 60 minutes" = how long the session lasts, not a seat hold (task 12.8: found in the Lunar Eclipse text)
  /\bhold(?:s|ing)?\s+the\s+space\b[^.!?\n]{0,60}?\b\d+(?:\.\d+)?[- ]?(?:minutes?|mins?)\b/gi,
];

/**
 * Rule PHRASES: a number tied to a rule word. A bare number is never a problem ("30 minutes after a snack" is fine,
 * although 30 is also HOLD_MINUTES). Each phrase stays inside one sentence (no ".", "!", "?" or new line between the words).
 */
const NUM = String.raw`\d+(?:\.\d+)?`;
const GAP = String.raw`[^.!?\n]{0,50}?`;
const BEFORE = String.raw`(?:before|prior to|ahead of|in advance)`;
const RULE_PHRASES: { token: string; re: RegExp }[] = [
  // "24 hours before", "24 hours or more before", "less than 24 hours before the class"
  { token: "CANCELLATION_HOURS", re: new RegExp(String.raw`\b${NUM}[- ]?(?:hours?|hrs?)\b[^.!?\n]{0,15}?\b${BEFORE}\b`, "gi") },
  // "cancel up to 24 hours", "move ... 24 hours", "refund ... 48 hours", "deadline: 24 hours"
  { token: "CANCELLATION_HOURS", re: new RegExp(String.raw`\b(?:cancel\w*|reschedul\w*|move|moved|moving|deadline|refund\w*)\b${GAP}\b${NUM}[- ]?(?:hours?|hrs?)\b`, "gi") },
  // "we remind you 24 hours before", "reminder ... 24 hours"
  { token: "REMINDER_HOURS", re: new RegExp(String.raw`\bremind\w*\b${GAP}\b${NUM}[- ]?(?:hours?|hrs?)\b`, "gi") },
  // "7 days before", "7 days or more before"
  { token: "EVENT_REFUND_DAYS", re: new RegExp(String.raw`\b${NUM}[- ]?days?\b[^.!?\n]{0,15}?\b${BEFORE}\b`, "gi") },
  // "refund ... 7 days", "cancel ... 7 days"
  { token: "EVENT_REFUND_DAYS", re: new RegExp(String.raw`\b(?:cancel\w*|refund\w*|deadline)\b${GAP}\b${NUM}[- ]?days?\b`, "gi") },
  // "5 minutes before the start", "5 minutes early"
  { token: "JOIN_EARLY_MINUTES", re: new RegExp(String.raw`\b${NUM}[- ]?(?:minutes?|mins?)\b[^.!?\n]{0,15}?\b(?:before|early|prior to|ahead of)\b`, "gi") },
  // "join ... 5 minutes", "arrive ... 5 minutes"
  { token: "JOIN_EARLY_MINUTES", re: new RegExp(String.raw`\b(?:join|joining|arrive|arriving|log ?in|be there|be online)\b${GAP}\b${NUM}[- ]?(?:minutes?|mins?)\b`, "gi") },
  // "we hold your seat for 30 minutes", "reserved for 30 minutes"
  { token: "HOLD_MINUTES", re: new RegExp(String.raw`\b(?:hold|holds|held|holding|reserve[ds]?|kept|keep|keeps)\b${GAP}\b${NUM}[- ]?(?:minutes?|mins?)\b`, "gi") },
  // "valid for 10 weeks", "expires after 10 weeks"
  { token: "CANCEL_CREDIT_VALID_WEEKS", re: new RegExp(String.raw`\b(?:valid|validity|expires?|expiry|expiring|lasts?|good for)\b${GAP}\b${NUM}[- ]?weeks?\b`, "gi") },
  { token: "CANCEL_CREDIT_VALID_WEEKS", re: new RegExp(String.raw`\b${NUM}[- ]?weeks?\b[^.!?\n]{0,15}?\b(?:valid|validity)\b`, "gi") },
];

/** Replaces tokens with a neutral word, so a token never counts as a number, and removes allowed plain numbers. */
function prepareForRuleCheck(text: string): string {
  let t = text.replace(TOKEN_RE, "TOKEN");
  for (const re of ALLOWED_PLAIN) t = t.replace(re, (m) => " ".repeat(m.length)); // keep positions
  return t;
}

/** Finds rule phrases that use a plain number. Overlapping phrases at the same place are reported once. */
export function findHardCodedRules(text: string): TextProblem[] {
  const t = prepareForRuleCheck(text);
  const seen = new Set<string>();
  const problems: TextProblem[] = [];
  for (const { token, re } of RULE_PHRASES) {
    for (const m of t.matchAll(re)) {
      const match = m[0].trim();
      const id = `${m.index}:${match.length}`;
      if (seen.has(id)) continue;
      seen.add(id);
      problems.push({
        code: "HARD_CODED_RULE",
        match,
        message: `"${match}" is a booking rule with a plain number. Use the token {{${token}}} instead, so the text always matches the real rule.`,
      });
    }
  }
  return problems;
}

/** The save check for editable texts: unknown tokens, broken braces and rule numbers written by hand. Empty list = OK to save. */
export function validateText(text: string): TextProblem[] {
  return [...validateTokens(text), ...findHardCodedRules(text)];
}
