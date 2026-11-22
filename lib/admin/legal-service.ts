/**
 * Legal editor service (task 12.13, plan 14.5). NO delete exists anywhere: every change is a NEW LegalVersion row.
 *
 * Version rows of one page (slug), by version number:
 *   v1  = the lawyer-approved .mdx file, imported with rule tokens (lawyerApproved = true, approvedAt = 2026-11-19)
 *   vN  = "Save draft" (DRAFT, never public), "Publish" (the draft row becomes PUBLISHED), "Restore lawyer-approved version" (a new PUBLISHED copy)
 * The public page shows the highest PUBLISHED version. The "waiting draft" is the highest version when it is a DRAFT.
 * Every write runs in one transaction under a per-page advisory lock, so two admins (or two tabs) cannot take the same version number.
 * Stale form check: the form carries the highest version number it was opened with; a save is refused if it changed meanwhile.
 * Audit rows hold the page and the version number only, never the text.
 */
import { loadLegalDoc, type LegalSlug, isLegalSlug, legalSlugs } from "@/lib/legal";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import {
  LEGAL_APPROVED_ON,
  checkLegalBody,
  deriveLegalState,
  isoDateToUtcNoon,
  sameIgnoringDate,
  setLastUpdatedLine,
  tokenizeLegalBody,
} from "@/lib/legal-versions";
import { normalizeText } from "./text-rules";
export { readPublishedLegalDoc } from "@/lib/legal-published";
import { recordAdminAction } from "./audit";
import { cleanNote } from "./text-service";

type Db = Pick<PrismaClient, "legalVersion" | "adminAuditLog" | "$transaction">;

export type LegalRow = {
  id: string;
  slug: string;
  version: number;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED";
  lawyerApproved: boolean;
  approvedAt: Date | null;
  publishedAt: Date | null;
  note: string;
  createdAt: Date;
  createdBy: { email: string | null } | null;
};

const ROW_SELECT = {
  id: true,
  slug: true,
  version: true,
  title: true,
  body: true,
  status: true,
  lawyerApproved: true,
  approvedAt: true,
  publishedAt: true,
  note: true,
  createdAt: true,
  createdBy: { select: { email: true } },
} as const;

export type LegalResult =
  | { ok: true; message: string; version: string; value: string }
  | { ok: false; code: "NOT_FOUND" | "INVALID" | "STALE" | "NO_CHANGE" | "NEEDS_CONFIRM"; message: string; problems?: string[] };

export const LEGAL_STALE_MESSAGE = "This page changed after you opened it (a new draft or version exists). Reload to see it. Your text stays in the box until you reload.";

class StaleError extends Error {}

// ---------------------------------------------------------------- import of version 1 (the lawyer-approved file)

export type FileVersion = { title: string; body: string; versionDate: string };

/** The .mdx file as version 1: rule numbers become tokens, the text is trimmed. The rendered text stays identical (tests). */
export async function fileVersionOne(slug: string): Promise<FileVersion | null> {
  const doc = await loadLegalDoc(slug);
  if (!doc) return null;
  return { title: doc.title, body: normalizeText(tokenizeLegalBody(slug, doc.body).body), versionDate: doc.updated };
}

/**
 * Makes sure version 1 exists for the page (create if missing, never change). Safe to call again and from two places at once
 * (the unique key slug+version is the last guard). Returns true when it created the row.
 */
export async function ensureBaseVersion(db: Pick<PrismaClient, "legalVersion">, slug: string): Promise<boolean> {
  const exists = await db.legalVersion.findUnique({ where: { slug_version: { slug, version: 1 } }, select: { id: true } });
  if (exists) return false;
  const f = await fileVersionOne(slug);
  if (!f) throw new Error(`No file for the legal page "${slug}".`);
  try {
    await db.legalVersion.create({
      data: {
        slug,
        version: 1,
        title: f.title,
        body: f.body,
        status: "PUBLISHED",
        lawyerApproved: true,
        approvedAt: isoDateToUtcNoon(LEGAL_APPROVED_ON),
        publishedAt: isoDateToUtcNoon(f.versionDate || LEGAL_APPROVED_ON), // the "Version date" the page already shows
        note: "Imported from the lawyer-approved file (version 1).",
      },
    });
    return true;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "P2002") return false; // another request was faster
    throw error;
  }
}

// ---------------------------------------------------------------- reading

export type LegalState = {
  slug: LegalSlug;
  title: string;
  /** All versions, newest first. When the database has no row yet, one virtual version 1 (from the file) is shown. */
  versions: LegalRow[];
  published: LegalRow | null;
  approved: LegalRow | null;
  draft: LegalRow | null;
  maxVersion: number;
  /** true = nothing in the database yet; the page shows the file. */
  fromFile: boolean;
};

async function virtualRow(slug: string): Promise<LegalRow | null> {
  const f = await fileVersionOne(slug);
  if (!f) return null;
  return {
    id: "file",
    slug,
    version: 1,
    title: f.title,
    body: f.body,
    status: "PUBLISHED",
    lawyerApproved: true,
    approvedAt: isoDateToUtcNoon(LEGAL_APPROVED_ON),
    publishedAt: isoDateToUtcNoon(f.versionDate || LEGAL_APPROVED_ON),
    note: "From the lawyer-approved file (version 1).",
    createdAt: isoDateToUtcNoon(LEGAL_APPROVED_ON),
    createdBy: null,
  };
}

export async function loadLegalState(db: Pick<PrismaClient, "legalVersion">, slug: string): Promise<LegalState | null> {
  if (!isLegalSlug(slug)) return null;
  const rows = (await db.legalVersion.findMany({ where: { slug }, orderBy: { version: "desc" }, select: ROW_SELECT })) as LegalRow[];
  let versions = rows;
  let fromFile = false;
  if (rows.length === 0) {
    const v = await virtualRow(slug);
    if (!v) return null;
    versions = [v];
    fromFile = true;
  }
  const s = deriveLegalState(versions);
  return { slug, title: versions[0].title, versions, published: s.published, approved: s.approved, draft: s.draft, maxVersion: s.maxVersion, fromFile };
}

export type LegalOverviewItem = {
  slug: LegalSlug;
  title: string;
  version: number;
  approved: boolean;
  approvedAt: Date | null;
  versionDate: Date | null;
  draftWaiting: boolean;
};

/** One row per legal page for the list (A6) and the overview card. One query (no texts); a page without rows shows the file as version 1. */
export async function listLegalOverview(db: Pick<PrismaClient, "legalVersion">): Promise<LegalOverviewItem[]> {
  const rows = await db.legalVersion.findMany({
    where: { slug: { in: [...legalSlugs] } },
    orderBy: { version: "desc" },
    select: { slug: true, version: true, title: true, status: true, lawyerApproved: true, approvedAt: true, publishedAt: true },
  });
  const out: LegalOverviewItem[] = [];
  for (const slug of legalSlugs) {
    const mine = rows.filter((r) => r.slug === slug);
    if (mine.length === 0) {
      const v = await virtualRow(slug);
      if (v) out.push({ slug, title: v.title, version: 1, approved: true, approvedAt: v.approvedAt, versionDate: v.publishedAt, draftWaiting: false });
      continue;
    }
    const s = deriveLegalState(mine);
    out.push({
      slug,
      title: mine[0].title,
      version: s.published?.version ?? 0,
      approved: !!s.published?.lawyerApproved,
      approvedAt: s.published?.approvedAt ?? s.approved?.approvedAt ?? null,
      versionDate: s.published?.publishedAt ?? null,
      draftWaiting: !!s.draft,
    });
  }
  return out;
}

// ---------------------------------------------------------------- writing

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function lockPage(tx: Tx, slug: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`legal:${slug}`}, 0))`;
}

const isUniqueError = (error: unknown) => (error as { code?: string } | null)?.code === "P2002" || (error as { code?: string } | null)?.code === "P2025";

/** "Save draft". Creates a NEW DRAFT row (the old draft stays in the history). Not public. */
export async function saveLegalDraft(db: Db, input: { key: unknown; value: unknown; note?: unknown; version?: unknown }, adminId: string): Promise<LegalResult> {
  const slug = typeof input.key === "string" ? input.key : "";
  if (!isLegalSlug(slug)) return { ok: false, code: "NOT_FOUND", message: "This legal page was not found." };
  const checked = checkLegalBody(input.value);
  if (!checked.ok) return { ok: false, code: "INVALID", message: "Cannot save. Please fix the problems below.", problems: checked.problems };
  const formVersion = typeof input.version === "string" && /^\d{1,6}$/.test(input.version) ? Number(input.version) : null;
  if (formVersion === null) return { ok: false, code: "STALE", message: LEGAL_STALE_MESSAGE }; // a form without a version is never trusted
  try {
    await ensureBaseVersion(db, slug);
    const saved = await db.$transaction(async (tx) => {
      await lockPage(tx, slug);
      const latest = await tx.legalVersion.findFirst({ where: { slug }, orderBy: { version: "desc" }, select: { version: true, title: true, body: true } });
      if (!latest || latest.version !== formVersion) throw new StaleError();
      if (normalizeText(latest.body) === checked.value) return null;
      return tx.legalVersion.create({
        data: { slug, version: latest.version + 1, title: latest.title, body: checked.value, status: "DRAFT", lawyerApproved: false, note: cleanNote(input.note), createdById: adminId },
        select: { version: true },
      });
    });
    if (saved === null) return { ok: false, code: "NO_CHANGE", message: "No changes to save: the text is the same as the latest version." };
    await recordAdminAction(db, { userId: adminId, action: "legal.saveDraft", entity: "LegalVersion", entityId: `${slug}#${saved.version}`, summary: `Saved a draft of ${slug} (version ${saved.version})` });
    return { ok: true, message: "Draft saved. It is not public.", version: String(saved.version), value: checked.value };
  } catch (error) {
    if (error instanceof StaleError || isUniqueError(error)) return { ok: false, code: "STALE", message: LEGAL_STALE_MESSAGE };
    throw error;
  }
}

/**
 * "Publish": the waiting draft becomes the public text. The checkbox "not checked by a lawyer" is enforced HERE (not only in the form).
 * The "Last updated:" line is set to today (studio time zone). Only the newest row can be published, and only while it is a DRAFT.
 */
export async function publishLegalDraft(db: Db, input: { slug: unknown; version: unknown; confirm: unknown }, adminId: string, now: Date = new Date()): Promise<LegalResult> {
  const slug = typeof input.slug === "string" ? input.slug : "";
  if (!isLegalSlug(slug)) return { ok: false, code: "NOT_FOUND", message: "This legal page was not found." };
  if (input.confirm !== "yes") return { ok: false, code: "NEEDS_CONFIRM", message: 'Please tick "I understand this text is not checked by a lawyer" before you publish.' };
  const formVersion = typeof input.version === "string" && /^\d{1,6}$/.test(input.version) ? Number(input.version) : null;
  if (formVersion === null) return { ok: false, code: "STALE", message: LEGAL_STALE_MESSAGE };
  try {
    const result = await db.$transaction(async (tx) => {
      await lockPage(tx, slug);
      const latest = await tx.legalVersion.findFirst({ where: { slug }, orderBy: { version: "desc" }, select: { id: true, version: true, status: true, body: true } });
      if (!latest || latest.status !== "DRAFT" || latest.version !== formVersion) throw new StaleError();
      const approved = await tx.legalVersion.findFirst({ where: { slug, status: "PUBLISHED", lawyerApproved: true }, orderBy: { version: "desc" }, select: { body: true } });
      if (approved && sameIgnoringDate(latest.body, approved.body)) return { kind: "same" as const };
      const check = checkLegalBody(latest.body); // rules may have changed since the draft was saved
      if (!check.ok) return { kind: "invalid" as const, problems: check.problems };
      const prepared = setLastUpdatedLine(check.value, now).body;
      await tx.legalVersion.update({ where: { id: latest.id, status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt: now, body: prepared, lawyerApproved: false, approvedAt: null } });
      return { kind: "published" as const, version: latest.version, body: prepared };
    });
    if (result.kind === "same") return { ok: false, code: "NO_CHANGE", message: "The draft is the same as the lawyer-approved text. Nothing to publish. To go back to the approved text, use Restore lawyer-approved version." };
    if (result.kind === "invalid") return { ok: false, code: "INVALID", message: "The draft does not pass today's checks, so it was not published.", problems: result.problems };
    await recordAdminAction(db, { userId: adminId, action: "legal.publish", entity: "LegalVersion", entityId: `${slug}#${result.version}`, summary: `Published ${slug} version ${result.version} (not checked by a lawyer)` });
    return { ok: true, message: "Published. The public page shows this version now.", version: String(result.version), value: result.body };
  } catch (error) {
    if (error instanceof StaleError || isUniqueError(error)) return { ok: false, code: "STALE", message: LEGAL_STALE_MESSAGE };
    throw error;
  }
}

/**
 * "Restore lawyer-approved version": ONE click, a NEW PUBLISHED version with the text of the latest lawyer-approved version.
 * The text is the one the lawyer checked, so no "not checked" tick is needed. A waiting draft stays in the history (it is not public and is no longer the newest).
 */
export async function restoreLawyerApproved(db: Db, slugRaw: unknown, adminId: string): Promise<LegalResult> {
  const slug = typeof slugRaw === "string" ? slugRaw : "";
  if (!isLegalSlug(slug)) return { ok: false, code: "NOT_FOUND", message: "This legal page was not found." };
  try {
    await ensureBaseVersion(db, slug);
    const result = await db.$transaction(async (tx) => {
      await lockPage(tx, slug);
      const latest = await tx.legalVersion.findFirst({ where: { slug }, orderBy: { version: "desc" }, select: { id: true, version: true, status: true } });
      const approved = await tx.legalVersion.findFirst({ where: { slug, status: "PUBLISHED", lawyerApproved: true }, orderBy: { version: "desc" }, select: { id: true, version: true, title: true, body: true, approvedAt: true, publishedAt: true } });
      if (!latest || !approved) return null;
      if (latest.id === approved.id) return { kind: "same" as const };
      const row = await tx.legalVersion.create({
        data: {
          slug,
          version: latest.version + 1,
          title: approved.title,
          body: approved.body,
          status: "PUBLISHED",
          lawyerApproved: true,
          approvedAt: approved.approvedAt,
          publishedAt: approved.publishedAt, // the approved text keeps its own version date ("Last updated" line inside the text)
          note: `Restored the lawyer-approved version ${approved.version}.`,
          createdById: adminId,
        },
        select: { version: true },
      });
      return { kind: "restored" as const, version: row.version, from: approved.version, body: approved.body };
    });
    if (result === null) return { ok: false, code: "NOT_FOUND", message: "There is no lawyer-approved version for this page." };
    if (result.kind === "same") return { ok: false, code: "NO_CHANGE", message: "The newest version is already the lawyer-approved text." };
    await recordAdminAction(db, { userId: adminId, action: "legal.restoreApproved", entity: "LegalVersion", entityId: `${slug}#${result.version}`, summary: `Restored the lawyer-approved version ${result.from} of ${slug} as version ${result.version}` });
    return { ok: true, message: "The lawyer-approved text is public again (saved as a new version).", version: String(result.version), value: result.body };
  } catch (error) {
    if (isUniqueError(error)) return { ok: false, code: "STALE", message: LEGAL_STALE_MESSAGE };
    throw error;
  }
}
