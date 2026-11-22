/**
 * Does a public event page exist? (used by proxy.ts for a real HTTP 404, task 12.8)
 * Database rows win. Code events count only when the database has NO event at all (same rule as offerings-public.ts).
 * It throws when the database cannot be read: the caller then falls back to the code slug list, like before.
 * The first query also asks for `adminEditedAt`, so a database without the Phase 12 columns fails here, exactly as the page loader does.
 */
import type { PrismaClient } from "@/lib/generated/prisma/client";

export async function eventSlugExists(db: Pick<PrismaClient, "offering">, slug: string, codeSlugs: readonly string[]): Promise<boolean> {
  const hit = await db.offering.findFirst({ where: { slug, type: "EVENT", published: true }, select: { id: true, adminEditedAt: true } });
  if (hit) return true;
  const any = await db.offering.count({ where: { type: "EVENT" } });
  return any === 0 ? codeSlugs.includes(slug) : false;
}
