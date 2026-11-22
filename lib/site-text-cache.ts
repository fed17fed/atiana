import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";

/** Cache tag of all editable texts. The admin save (12.7) calls revalidateTag/updateTag with it. */
export const TEXTS_TAG = "site-texts";

/**
 * Reads ALL edited texts in one query (about 130 small rows at most) and caches the result with a tag.
 * Returns null when the database cannot be read (no table yet on live, no DATABASE_URL, database down).
 * The error is caught HERE, inside the cache scope, on purpose: an error thrown out of a "use cache" function
 * makes `next build` fail even when the caller catches it (checked 2026-11-21). A failure is cached for only 30 seconds (revalidate),
 * so once the table exists the page asks the database again soon instead of keeping the default.
 */
export async function loadTextBlocks(): Promise<Record<string, string> | null> {
  "use cache";
  cacheTag(TEXTS_TAG);
  try {
    const rows = await prisma.contentBlock.findMany({ select: { key: true, value: true } });
    cacheLife("minutes"); // safety net: even without a tag call, a change shows within minutes
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch (error) {
    // Short, but not so short that Next.js treats it as "dynamic" (needs expire >= 5 min and stale >= 30 s to stay in the build).
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    console.warn("[site-text] database read failed, using code defaults:", error instanceof Error ? error.message.split("\n").pop() : error);
    return null;
  }
}
