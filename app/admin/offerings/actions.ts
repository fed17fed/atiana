"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { createOffering, setOfferingPublished, updateOffering } from "@/lib/admin/offerings-service";
import { OFFERINGS_TAG } from "@/lib/offerings-cache";

export type OfferingState =
  | { status: "idle" }
  | { status: "ok"; message: string; version?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

const FAILED: OfferingState = { status: "error", message: "Sorry, the offering could not be saved. Try again." };

/** Admin only, re-checked on every call. After a save the public cache tag is expired, so the pages show the change at once. */
export async function saveOffering(_prev: OfferingState, formData: FormData): Promise<OfferingState> {
  const admin = await requireAdmin("/admin/offerings");
  const raw = Object.fromEntries(formData.entries());
  const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : null;
  let createdId: string | null = null;
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = id ? await updateOffering(prisma, id, raw, admin.id) : await createOffering(prisma, raw, admin.id);
    if (!r.ok) return { status: "error", message: r.message, fieldErrors: r.fieldErrors };
    updateTag(OFFERINGS_TAG);
    if (!id) createdId = r.id;
    else return { status: "ok", message: r.message, version: r.version };
  } catch (error) {
    console.error("[admin offerings] save failed", error instanceof Error ? error.message : error);
    return FAILED;
  }
  if (createdId) redirect(`/admin/offerings/${createdId}?saved=created`); // outside try/catch: redirect works by throwing
  return FAILED;
}

/** Hide (show = false) or restore. The id is bound on the page; the form only sends a click. */
export async function setOfferingVisible(id: string, show: boolean, formData?: FormData): Promise<void> {
  void formData; // sent by the form, not needed
  const admin = await requireAdmin("/admin/offerings");
  let flag = "failed";
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await setOfferingPublished(prisma, id, show, admin.id);
    if (r.ok) {
      updateTag(OFFERINGS_TAG);
      flag = show ? "restored" : "hidden";
    }
  } catch (error) {
    console.error("[admin offerings] visibility failed", error instanceof Error ? error.message : error);
  }
  redirect(`/admin/offerings?saved=${flag}`);
}
