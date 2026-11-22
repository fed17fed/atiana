/**
 * Upload service (task 12.12): check -> convert to WebP -> save -> library row -> audit row. Nothing is ever removed.
 * `db` and `env` are passed in, so tests can use the test database and fake environments.
 */
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { recordAdminAction } from "@/lib/admin/audit";
import { toWebp } from "./convert";
import { checkUpload, WRONG_TYPE_MESSAGE } from "./rules";
import { imageStorageMode, NOT_ACTIVE_MESSAGE, saveWebp } from "./storage";

type Db = Pick<PrismaClient, "mediaImage" | "adminAuditLog">;

export type UploadResult =
  | { ok: true; image: { id: string; url: string; alt: string; width: number; height: number } }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function uploadImage(db: Db, file: { size: number; bytes: Buffer } | null, altRaw: unknown, adminId: string, env: Record<string, string | undefined> = process.env): Promise<UploadResult> {
  const mode = imageStorageMode(env);
  if (mode === "off") return { ok: false, message: NOT_ACTIVE_MESSAGE }; // before anything else: no work, no file, no write
  const checked = checkUpload(file && { size: file.size, head: file.bytes.subarray(0, 16) }, altRaw);
  if (!checked.ok) return { ok: false, message: "Please fix the problems below.", fieldErrors: checked.fieldErrors };
  let webp;
  try {
    webp = await toWebp(file!.bytes);
  } catch {
    // Right first bytes but not a readable picture (broken file, too many pixels).
    return { ok: false, message: "Please fix the problems below.", fieldErrors: { file: [`${WRONG_TYPE_MESSAGE} This file could not be read as a picture.`] } };
  }
  const saved = await saveWebp(webp.bytes, mode, env);
  const row = await db.mediaImage.create({
    data: { url: saved.url, alt: checked.alt, storage: saved.storage, width: webp.width, height: webp.height, bytes: webp.bytes.length, createdById: adminId },
    select: { id: true, url: true, alt: true, width: true, height: true },
  });
  await recordAdminAction(db, {
    userId: adminId,
    action: "image.upload",
    entity: "MediaImage",
    entityId: row.id,
    summary: `Uploaded an image ${webp.width}x${webp.height}, ${Math.round(webp.bytes.length / 1024)} KB (${saved.storage})`,
  });
  return { ok: true, image: row };
}
