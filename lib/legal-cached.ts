import { cacheLife, cacheTag } from "next/cache";
import { loadLegalDoc, type LegalDoc } from "./legal";
import { readPublishedLegalDoc } from "./legal-published";
import { prisma } from "./prisma";

/** Cache tag of the legal pages. The legal editor (publish, restore) calls updateTag with it, so a new version is public at once. */
export const LEGAL_TAG = "legal-pages";

/**
 * The text of one legal page (task 12.13): the newest PUBLISHED LegalVersion from the database, tokens filled with the real rule numbers.
 * FALLBACK: no row, no table, no DATABASE_URL, database down, or a row with an unknown token -> the lawyer-approved .mdx file (= version 1).
 * The legal pages never break because of the database.
 * The database error is caught INSIDE the cache scope on purpose (an error thrown out of a "use cache" function fails `next build`),
 * and a failure is cached for only 30 seconds, so the page asks the database again soon (same pattern as lib/site-text-cache.ts).
 */
export async function getLegalDoc(slug: string): Promise<LegalDoc | null> {
  "use cache";
  cacheTag(LEGAL_TAG);
  try {
    const doc = await readPublishedLegalDoc(prisma, slug);
    cacheLife("minutes"); // safety net: even without a tag call, a change shows within minutes
    if (doc) return doc;
  } catch (error) {
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    console.warn("[legal] database read failed, using the .mdx file:", error instanceof Error ? error.message.split("\n").pop() : error);
  }
  return loadLegalDoc(slug);
}
