/**
 * Contact messages: the only changes an admin can make are "Mark as read" (task 12.7) and "Mark as unread" (2026-11-21). Messages are never edited or removed.
 * One audit row per message that really changed. The audit summary holds no name, no e-mail and no message text.
 */
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { recordAdminAction } from "./audit";

type Db = Pick<PrismaClient, "contactMessage" | "adminAuditLog">;

export type MarkReadResult = { ok: true; changed: boolean } | { ok: false; message: string };

export async function markMessageRead(db: Db, id: unknown, adminId: string, now = new Date()): Promise<MarkReadResult> {
  if (typeof id !== "string" || id === "" || id.length > 64) return { ok: false, message: "This message was not found." };
  // One conditional update: a second click (or two tabs) changes nothing and writes no second audit row.
  const r = await db.contactMessage.updateMany({ where: { id, readAt: null }, data: { readAt: now } });
  if (r.count === 0) {
    const exists = await db.contactMessage.findUnique({ where: { id }, select: { id: true } });
    return exists ? { ok: true, changed: false } : { ok: false, message: "This message was not found." };
  }
  await recordAdminAction(db, { userId: adminId, action: "message.markRead", entity: "ContactMessage", entityId: id, summary: "Marked a contact message as read" });
  return { ok: true, changed: true };
}

/** "Mark as unread": the same idea the other way round. Only a message that is read changes (one conditional update), so a second click writes no second audit row. */
export async function markMessageUnread(db: Db, id: unknown, adminId: string): Promise<MarkReadResult> {
  if (typeof id !== "string" || id === "" || id.length > 64) return { ok: false, message: "This message was not found." };
  const r = await db.contactMessage.updateMany({ where: { id, readAt: { not: null } }, data: { readAt: null } });
  if (r.count === 0) {
    const exists = await db.contactMessage.findUnique({ where: { id }, select: { id: true } });
    return exists ? { ok: true, changed: false } : { ok: false, message: "This message was not found." };
  }
  await recordAdminAction(db, { userId: adminId, action: "message.markUnread", entity: "ContactMessage", entityId: id, summary: "Marked a contact message as unread" });
  return { ok: true, changed: true };
}
