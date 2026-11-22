"use server";

import { requireAdmin } from "@/lib/session";
import { updatePackage } from "@/lib/admin/packages-service";

export type PackageState =
  | { status: "idle" }
  | { status: "ok"; message: string; version?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

const FAILED: PackageState = { status: "error", message: "Sorry, the package could not be saved. Try again." };

/** Admin only, re-checked on every call. Packs are hidden on the public site by SHOW_PACKS, so no public cache needs a refresh. */
export async function savePackage(_prev: PackageState, formData: FormData): Promise<PackageState> {
  const admin = await requireAdmin("/admin/packages");
  const raw = Object.fromEntries(formData.entries());
  const id = typeof raw.id === "string" ? raw.id : "";
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await updatePackage(prisma, id, raw, admin.id);
    if (!r.ok) return { status: "error", message: r.message, fieldErrors: r.fieldErrors };
    return { status: "ok", message: r.message, version: r.version };
  } catch (error) {
    console.error("[admin packages] save failed", error instanceof Error ? error.message : error);
    return FAILED;
  }
}
