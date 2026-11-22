/**
 * Pure helpers for the tiny text marks used in editable texts (task 12.6). Only two marks are understood:
 *   *italic*            -> <em>
 *   [label](address)    -> link (address: /site-path, https://..., http://... or mailto:...)
 * Everything else is plain text. No raw HTML is ever created, so a text from the database cannot inject markup (XSS).
 * A link with another kind of address (javascript:, //host, data: ...) is shown as plain label text.
 */
export type InlinePart =
  | { type: "text"; value: string }
  | { type: "em"; value: string }
  | { type: "link"; label: string; href: string };

// The address may hold one level of brackets, e.g. [x](javascript:alert(1)): the whole mark is consumed (and then refused).
const INLINE_RE = /\[([^\]\n]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*([^*\n]+)\*/g;

/** Only site paths (one leading "/", not "//"), http(s) and mailto are allowed. */
export function isSafeHref(href: string): boolean {
  if (/^\/(?![/\\])/.test(href)) return true;
  return /^(?:https?:\/\/|mailto:)[^\s]+$/i.test(href);
}

/** Pure parser (unit tested). */
export function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ type: "text", value: text.slice(last, start) });
    if (m[3] !== undefined) {
      parts.push({ type: "em", value: m[3] });
    } else if (isSafeHref(m[2])) {
      parts.push({ type: "link", label: m[1], href: m[2] });
    } else {
      parts.push({ type: "text", value: m[1] });
    }
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}

/** The text without marks, for search engines (JSON-LD) and meta tags: "[a](/b)" -> "a", "*x*" -> "x". */
export function inlineToPlain(text: string): string {
  return parseInline(text)
    .map((p) => (p.type === "link" ? p.label : p.value))
    .join("");
}

/** Splits an answer into paragraphs at blank lines (an empty text gives no paragraph). */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
