import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";
import { codeOfferings, findPublicEvent, type PublicEvent, type PublicOfferings } from "./offerings-public";
import { readPublicOfferings } from "./offerings-read";
import { safeDb } from "./safe";

/** Cache tag. The admin actions (and the session admin, 12.9) call updateTag with it, so a change shows on the pages at once. */
export const OFFERINGS_TAG = "offerings";

/**
 * Reads the published classes, 1:1 offerings and events for the public pages. Same pattern as site-text-cache.ts:
 * the error is caught INSIDE the cache scope (an error thrown out of a "use cache" function would fail `next build`),
 * a failure is cached for only 30 seconds. On any failure, or an empty offering table, the pages get today's code content.
 */
export async function loadPublicOfferings(): Promise<PublicOfferings> {
  "use cache";
  cacheTag(OFFERINGS_TAG);
  try {
    const result = await readPublicOfferings(prisma);
    cacheLife("minutes"); // safety net: even without a tag call, a change shows within minutes
    return result;
  } catch (error) {
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    console.warn("[offerings] database read failed, using the code content:", error instanceof Error ? error.message.split("\n").pop() : error);
    return codeOfferings();
  }
}

/** One public event by its URL name, or undefined (unknown or hidden). */
export async function getPublicEvent(slug: string): Promise<PublicEvent | undefined> {
  const all = await loadPublicOfferings();
  return findPublicEvent(all.events, slug);
}

/**
 * For the event page and calendar.ics: the cached list first (fast, and what the build baked in for the code events),
 * then ONE fresh database read when the slug is not in it. Why: a page for a brand-new URL name can be rendered from
 * cached data that is older than the admin save (checked on a production build: the first visit to a new event answered
 * "not found" for about a second). A fresh read on a miss makes an event made in the admin reachable at once.
 * Hidden or unknown events are still not found. If the database cannot be read, only the cached/code list is used.
 */
export async function findEventForPage(slug: string): Promise<PublicEvent | undefined> {
  const cached = await getPublicEvent(slug);
  if (cached) return cached;
  const fresh = await safeDb("public event", async () => {
    const { prisma: db } = await import("./prisma");
    return readPublicOfferings(db);
  });
  return fresh ? findPublicEvent(fresh.events, slug) : undefined;
}
