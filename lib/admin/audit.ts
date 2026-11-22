/**
 * Admin audit log (task 12.3): one row per admin action, never edited or deleted.
 * Writing the log must never break the action that already succeeded, so errors are only logged.
 */
import type { PrismaClient } from "@/lib/generated/prisma/client";

export type AuditEntry = {
  userId: string;
  action: string; // e.g. "slots.add"
  entity: string; // e.g. "ClassSession"
  entityId?: string | null;
  summary?: string;
};

const MAX_SUMMARY = 300;

/** One short line. Removes line breaks and cuts long text. Callers must not pass secrets or Zoom links. */
export function cleanSummary(text: string | undefined): string {
  const one = (text ?? "").replace(/\s+/g, " ").trim();
  return one.length > MAX_SUMMARY ? `${one.slice(0, MAX_SUMMARY - 1)}…` : one;
}

export async function recordAdminAction(db: Pick<PrismaClient, "adminAuditLog">, entry: AuditEntry): Promise<boolean> {
  try {
    await db.adminAuditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action.slice(0, 80),
        entity: entry.entity.slice(0, 80),
        entityId: entry.entityId ?? null,
        summary: cleanSummary(entry.summary),
      },
    });
    return true;
  } catch (error) {
    // Example: the live database has no AdminAuditLog table yet. The admin action itself is not undone.
    console.warn("[admin audit] could not write the log", error instanceof Error ? error.message.split("\n").pop() : error);
    return false;
  }
}
