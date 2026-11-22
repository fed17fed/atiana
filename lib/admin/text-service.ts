/**
 * Text editor service (task 12.7). No delete exists anywhere: a save, a restore and "Back to default" each
 * write ONE new ContentRevision row and update the ContentBlock row. Old versions stay for ever.
 * Every change writes one audit row (key only, never the text itself).
 * `db` is passed in so the DB tests can use the test database.
 *
 * Stored value: the ContentBlock holds the text the site shows. "Back to default" stores an EMPTY value in the block
 * (the read layer treats an empty value as "not edited", so the site follows the code default again) and the default
 * text in the new revision (so the history is readable).
 * Stale form check: the form carries the version it was opened with (the block's updatedAt in ms, "0" = no row yet).
 * The save is refused if the version changed meanwhile; the check and the write are one atomic step.
 */
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { recordAdminAction } from "./audit";
import { MAX_NOTE_LENGTH, getTextEntry, type TextEntry } from "./text-registry";
import { checkText } from "./text-rules";

type Db = Pick<PrismaClient, "contentBlock" | "contentRevision" | "adminAuditLog" | "$transaction">;

export type TextResult =
  | { ok: true; message: string; version: string; value: string; edited: boolean }
  | { ok: false; code: "NOT_FOUND" | "INVALID" | "STALE" | "NO_CHANGE"; message: string; problems?: string[] };

export const STALE_MESSAGE = "Someone changed this text after you opened it. Reload to see it. Your text stays in the box until you reload.";

class StaleError extends Error {}

export function cleanNote(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_LENGTH) : "";
}

export const versionOf = (row: { updatedAt: Date } | null): string => (row ? String(row.updatedAt.getTime()) : "0");

/** The text the site shows now (before tokens are filled): the block value, or the code default when the block is empty / missing. */
export function effectiveValue(block: { value: string } | null, entry: Pick<TextEntry, "defaultText">): string {
  return block && block.value.trim() !== "" ? block.value : entry.defaultText;
}

/** "Edited" = the block holds a text that differs from the code default. */
export function isEdited(block: { value: string } | null, entry: Pick<TextEntry, "defaultText">): boolean {
  return !!block && block.value.trim() !== "" && block.value !== entry.defaultText;
}

type Write = {
  entry: TextEntry;
  blockValue: string; // what the block stores ("" = follow the code default)
  revisionValue: string; // what the history shows
  note: string;
  adminId: string;
  version: string | null; // null = no stale check from the form (restore / back to default); still atomic
  action: string;
  summary: string;
  skipIfSame: string | null; // the effective text; if equal, nothing is written
};

async function write(db: Db, w: Write): Promise<TextResult> {
  const { entry } = w;
  try {
    const saved = await db.$transaction(async (tx) => {
      const cur = await tx.contentBlock.findUnique({ where: { key: entry.key }, select: { value: true, updatedAt: true } });
      if (w.version !== null && w.version !== versionOf(cur)) throw new StaleError();
      if (w.skipIfSame !== null && effectiveValue(cur, entry) === w.skipIfSame) return null;
      let updatedAt: Date;
      if (cur) {
        // The where clause carries the version we read. If another save won in between, nothing matches (P2025) -> stale.
        updatedAt = (await tx.contentBlock.update({ where: { key: entry.key, updatedAt: cur.updatedAt }, data: { value: w.blockValue, kind: entry.kind, updatedById: w.adminId }, select: { updatedAt: true } })).updatedAt;
      } else {
        updatedAt = (await tx.contentBlock.create({ data: { key: entry.key, value: w.blockValue, kind: entry.kind, updatedById: w.adminId }, select: { updatedAt: true } })).updatedAt;
      }
      await tx.contentRevision.create({ data: { key: entry.key, value: w.revisionValue, note: w.note, createdById: w.adminId } });
      return updatedAt;
    });
    if (saved === null) return { ok: false, code: "NO_CHANGE", message: "No changes to save." };
    await recordAdminAction(db, { userId: w.adminId, action: w.action, entity: "ContentBlock", entityId: entry.key, summary: w.summary });
    return { ok: true, message: "", version: String(saved.getTime()), value: w.blockValue === "" ? entry.defaultText : w.blockValue, edited: isEdited({ value: w.blockValue }, entry) };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (error instanceof StaleError || code === "P2025" || code === "P2002") return { ok: false, code: "STALE", message: STALE_MESSAGE };
    throw error;
  }
}

/** Save from the editor form. */
export async function saveText(db: Db, input: { key: unknown; value: unknown; note?: unknown; version?: unknown }, adminId: string): Promise<TextResult> {
  const entry = typeof input.key === "string" ? getTextEntry(input.key) : null;
  if (!entry) return { ok: false, code: "NOT_FOUND", message: "This text was not found." };
  const checked = checkText(entry, input.value);
  if (!checked.ok) return { ok: false, code: "INVALID", message: "Cannot save. Please fix the problems below.", problems: checked.problems };
  const version = typeof input.version === "string" && /^\d{1,16}$/.test(input.version) ? input.version : null;
  if (version === null) return { ok: false, code: "STALE", message: STALE_MESSAGE }; // a form without a version is never trusted
  const r = await write(db, {
    entry,
    blockValue: checked.value,
    revisionValue: checked.value,
    note: cleanNote(input.note),
    adminId,
    version,
    action: "text.update",
    summary: `Edited the text ${entry.key}`,
    skipIfSame: checked.value,
  });
  return r.ok ? { ...r, message: "Saved. Visible on the site now." } : r;
}

/** "Back to default": the site follows the code text again. A new revision with the default text is written. */
export async function resetText(db: Db, key: unknown, adminId: string): Promise<TextResult> {
  const entry = typeof key === "string" ? getTextEntry(key) : null;
  if (!entry) return { ok: false, code: "NOT_FOUND", message: "This text was not found." };
  const r = await write(db, { entry, blockValue: "", revisionValue: entry.defaultText, note: "Back to default", adminId, version: null, action: "text.reset", summary: `Back to the default text for ${entry.key}`, skipIfSame: entry.defaultText });
  return r.ok ? { ...r, message: "Back to the default text. Visible on the site now." } : r;
}

/** Restore an old version (or "default") as a NEW version. The old row is never changed. */
export async function restoreText(db: Db, key: unknown, revisionId: unknown, adminId: string): Promise<TextResult> {
  const entry = typeof key === "string" ? getTextEntry(key) : null;
  if (!entry) return { ok: false, code: "NOT_FOUND", message: "This text was not found." };
  if (revisionId === "default") return resetText(db, key, adminId);
  if (typeof revisionId !== "string" || revisionId === "") return { ok: false, code: "NOT_FOUND", message: "This version was not found." };
  const rev = await db.contentRevision.findFirst({ where: { id: revisionId, key: entry.key }, select: { value: true, createdAt: true } });
  if (!rev) return { ok: false, code: "NOT_FOUND", message: "This version was not found." };
  const checked = checkText(entry, rev.value);
  if (!checked.ok) return { ok: false, code: "INVALID", message: "This old version does not pass today's checks, so it cannot be restored.", problems: checked.problems };
  const r = await write(db, {
    entry,
    blockValue: checked.value,
    revisionValue: checked.value,
    note: `Restored the version from ${rev.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    adminId,
    version: null,
    action: "text.restore",
    summary: `Restored an old version of ${entry.key}`,
    skipIfSame: checked.value,
  });
  return r.ok ? { ...r, message: "Version restored as a new version." } : r;
}

/** Edited texts for the list: key -> row. One query (about 130 rows at most). */
export async function loadBlocks(db: Pick<PrismaClient, "contentBlock">) {
  const rows = await db.contentBlock.findMany({ select: { key: true, value: true, updatedAt: true, updatedBy: { select: { email: true } } } });
  return new Map(rows.map((r) => [r.key, r]));
}

export async function listRevisions(db: Pick<PrismaClient, "contentRevision">, key: string) {
  return db.contentRevision.findMany({
    where: { key },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
    select: { id: true, value: true, note: true, createdAt: true, createdBy: { select: { email: true } } },
  });
}
