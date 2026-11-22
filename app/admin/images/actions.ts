"use server";

import { requireAdmin } from "@/lib/session";
import { uploadImage } from "@/lib/images/service";

export type UploadState =
  | { status: "idle" }
  | { status: "ok"; message: string; image: { id: string; url: string; alt: string; width: number; height: number } }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

/** Admin only, re-checked on every call. The file is checked again here (size, real type, alt text): the browser check is only a help. */
export async function uploadImageAction(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const admin = await requireAdmin("/admin/images");
  try {
    const f = formData.get("file");
    const file = f instanceof File && f.size > 0 ? { size: f.size, bytes: Buffer.from(await f.arrayBuffer()) } : null;
    const { prisma } = await import("@/lib/prisma");
    const r = await uploadImage(prisma, file, formData.get("alt"), admin.id);
    if (!r.ok) return { status: "error", message: r.message, fieldErrors: r.fieldErrors };
    return { status: "ok", message: "Image uploaded and saved as WebP.", image: r.image };
  } catch (error) {
    console.error("[admin images] upload failed", error instanceof Error ? error.message : error);
    return { status: "error", message: "Upload failed. Try again." };
  }
}
