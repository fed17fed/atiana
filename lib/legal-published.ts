/**
 * The public side of the legal editor (task 12.13): the published text of a legal page from the database.
 * Small on purpose (no admin code): the public pages import this file.
 */
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { isLegalSlug, type LegalDoc } from "@/lib/legal";
import { hasOnlyKnownTokens, legalIsoDate, renderLegalBody } from "@/lib/legal-versions";

/** The public text: highest PUBLISHED version, tokens filled. null = use the file (no row, empty text, unknown token). Never throws on a bad row. */
export async function readPublishedLegalDoc(db: Pick<PrismaClient, "legalVersion">, slug: string): Promise<LegalDoc | null> {
  if (!isLegalSlug(slug)) return null;
  const row = await db.legalVersion.findFirst({ where: { slug, status: "PUBLISHED" }, orderBy: { version: "desc" }, select: { title: true, body: true, publishedAt: true, createdAt: true } });
  if (!row || row.body.trim() === "" || !hasOnlyKnownTokens(row.body)) return null;
  return { slug, title: row.title, updated: legalIsoDate(row.publishedAt ?? row.createdAt), draftNotice: "", body: renderLegalBody(row.body) };
}

