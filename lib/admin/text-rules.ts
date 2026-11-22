/**
 * The save check for one editable text (task 12.7). Pure. Runs on the SERVER on every save and restore
 * (the form never decides). It adds the checks of plan 14.3 to validateText (tokens and rule numbers):
 * not empty, not too long, one line where the page shows one line, no Zoom link, no typed e-mail address,
 * only safe link addresses, and an https address for URL texts.
 */
import { isSafeHref } from "@/lib/inline-text";
import { validateText } from "@/lib/text-tokens";
import type { TextEntry } from "./text-registry";

export type TextCheck = { ok: true; value: string } | { ok: false; problems: string[] };

const ZOOM_RE = /\bzoom\.(?:us|com)\b/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/i;
const LINK_MARK_RE = /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g;

/** Line breaks become "\n" and the ends are trimmed. Nothing else is changed. */
export function normalizeText(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").trim();
}

export function checkText(entry: Pick<TextEntry, "kind" | "maxLength" | "multiline">, raw: unknown): TextCheck {
  if (typeof raw !== "string") return { ok: false, problems: ["The text is missing."] };
  const value = normalizeText(raw);
  const problems: string[] = [];
  if (value === "") {
    return { ok: false, problems: ["The text cannot be empty. To use the original text again, click Back to default."] };
  }
  if (value.length > entry.maxLength) problems.push(`The text is too long: ${value.length} of ${entry.maxLength} characters.`);
  if (entry.kind !== "MARKDOWN" && value.includes("\n")) problems.push("This text must be one paragraph. Remove the line breaks.");
  if (ZOOM_RE.test(value)) problems.push("Do not put a Zoom link in a public text. The Zoom link belongs only to the session.");
  if (EMAIL_RE.test(value)) problems.push("Do not type an email address in a public text. Use the token {{CONTACT_EMAIL}} instead.");
  if (entry.kind === "INLINE" || entry.kind === "MARKDOWN") {
    for (const m of value.matchAll(LINK_MARK_RE)) {
      if (!isSafeHref(m[2])) problems.push(`The link address "${m[2]}" is not allowed. Use a site path like /contact, or an address that starts with https://.`);
    }
  }
  if (entry.kind === "URL" && !/^https:\/\/[^\s]+$/.test(value)) problems.push("The address must start with https:// and have no spaces.");
  for (const p of validateText(value)) problems.push(p.message);
  return problems.length ? { ok: false, problems } : { ok: true, value };
}
