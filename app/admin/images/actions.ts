"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { deleteImage, uploadImage } from "@/lib/images/service";

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

/** Second step of Delete (the first step is the "Are you sure?" dialog). Admin only. Result is shown with ?deleted=... */
export async function deleteImageAction(id: string): Promise<void> {
  const admin = await requireAdmin("/admin/images");
  let flag = "failed";
  let used = "";
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await deleteImage(prisma, id, admin.id);
    if (r.ok) flag = "ok";
    else {
      flag = r.reason;
      if (r.usedBy) used = r.usedBy.join(", ").slice(0, 300);
    }
  } catch (error) {
    console.error("[admin images] delete failed", error instanceof Error ? error.message : error);
  }
  redirect(`/admin/images?${new URLSearchParams({ deleted: flag, ...(used ? { used } : {}) }).toString()}`);
}
