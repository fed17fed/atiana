import { readFile } from "node:fs/promises";
import path from "node:path";

/** The 5 legal pages. Only these slugs can be loaded (no user-controlled file paths). */
export const legalSlugs = [
  "privacy",
  "cookies",
  "terms",
  "booking-cancellation",
  "health-disclaimer",
] as const;

export type LegalSlug = (typeof legalSlugs)[number];

export type LegalDoc = {
  slug: LegalSlug;
  title: string;
  updated: string;
  /** The draft warning sentence (shown in the banner). */
  draftNotice: string;
  /** Markdown body without the front matter and without the draft sentence. */
  body: string;
};

const LEGAL_DIR = path.join(process.cwd(), "content", "legal");

export function isLegalSlug(value: string): value is LegalSlug {
  return (legalSlugs as readonly string[]).includes(value);
}

/** Reads `key: "value"` lines from a simple front matter block. */
export function parseFrontmatter(source: string): { data: Record<string, string>; content: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, content: source };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    data[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return { data, content: source.slice(match[0].length) };
}

/** Splits the leading "**DRAFT – ...**" line from the body. */
export function splitDraftNotice(content: string): { notice: string; body: string } {
  const m = /^\s*\*\*(DRAFT[^*]*)\*\*\s*\r?\n/.exec(content);
  if (!m) return { notice: "DRAFT – must be checked by a lawyer before go-live.", body: content };
  return { notice: m[1].trim(), body: content.slice(m[0].length).replace(/^\s+/, "") };
}

export async function loadLegalDoc(slug: string): Promise<LegalDoc | null> {
  if (!isLegalSlug(slug)) return null;
  let source: string;
  try {
    source = await readFile(path.join(LEGAL_DIR, `${slug}.mdx`), "utf8");
  } catch {
    return null;
  }
  const { data, content } = parseFrontmatter(source);
  const { notice, body } = splitDraftNotice(content);
  return {
    slug,
    title: data.title ?? slug,
    updated: data.updated ?? "",
    draftNotice: notice,
    body,
  };
}
