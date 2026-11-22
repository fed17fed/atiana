/**
 * Text read layer (task 12.5): getText(key) = DB text (if an admin edited it) or the code default.
 * - Never throws: no table (live database not migrated yet), no DATABASE_URL, database down -> the code default.
 * - Rule tokens ({{CANCELLATION_HOURS}} ...) are filled from lib/booking-rules.ts, in the DB text AND in the default.
 * - A DB text with an unknown token or broken braces is ignored (the default is shown), so a bad row never shows "{{...}}".
 */
import { SITE_TEXT_DEFAULTS } from "@/content/site-texts";
import { loadTextBlocks } from "./site-text-cache";
import { fillTokens, validateTokens } from "./text-tokens";

export { TEXTS_TAG } from "./site-text-cache";

/** Pure part: picks the text and fills the tokens. `dbValue` null/undefined/empty means "not edited". */
export function resolveText(dbValue: string | null | undefined, defaultText: string): string {
  if (typeof dbValue === "string" && dbValue.trim() !== "" && validateTokens(dbValue).length === 0) {
    return fillTokens(dbValue);
  }
  return fillTokens(defaultText);
}

async function readBlocks(): Promise<Record<string, string>> {
  try {
    // null = the database could not be read (already logged in the cache file). Never throws, so a page never breaks.
    return (await loadTextBlocks()) ?? {};
  } catch (error) {
    console.warn("[site-text] could not load texts, using code defaults:", error instanceof Error ? error.message.split("\n").pop() : error);
    return {};
  }
}

/** The text for one key. `fallback` (optional) overrides the default from content/site-texts.ts. Unknown key without default -> "". */
export async function getText(key: string, fallback?: string): Promise<string> {
  const blocks = await readBlocks();
  return resolveText(Object.hasOwn(blocks, key) ? blocks[key] : undefined, fallback ?? SITE_TEXT_DEFAULTS[key] ?? "");
}

/** Several texts with one cache read. `defaults` maps key -> code default. */
export async function getTexts<K extends string>(defaults: Record<K, string>): Promise<Record<K, string>> {
  const blocks = await readBlocks();
  const out = {} as Record<K, string>;
  for (const key of Object.keys(defaults) as K[]) {
    out[key] = resolveText(Object.hasOwn(blocks, key) ? blocks[key] : undefined, defaults[key]);
  }
  return out;
}
