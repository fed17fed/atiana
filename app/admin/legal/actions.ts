"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import type { TextSaveState } from "@/app/admin/texts/actions";
import { publishLegalDraft, restoreLawyerApproved, saveLegalDraft } from "@/lib/admin/legal-service";
import { LEGAL_TAG } from "@/lib/legal-cached";
import { isLegalSlug } from "@/lib/legal";
import { requireAdmin } from "@/lib/session";

const FAILED: TextSaveState = { status: "error", message: "Sorry, the draft could not be saved. Try again." };
const safeSlug = (slug: string) => (isLegalSlug(slug) ? slug : "");

/** "Save draft" (editor, wireframe A7). Admin only, re-checked on every call. A draft is never public, so no cache is touched. */
export async function saveLegalDraftAction(_prev: TextSaveState, formData: FormData): Promise<TextSaveState> {
  const admin = await requireAdmin("/admin/legal");
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await saveLegalDraft(prisma, { key: formData.get("key"), value: formData.get("value"), note: formData.get("note"), version: formData.get("version") }, admin.id);
    if (!r.ok) return { status: "error", message: r.message, problems: r.problems, stale: r.code === "STALE" };
    return { status: "ok", message: r.message, version: r.version, value: r.value };
  } catch (error) {
    console.error("[admin legal] save draft failed", error instanceof Error ? error.message : error);
    return FAILED;
  }
}

/** "Publish" (wireframe A8). The slug is bound on the page and checked again; the tick box is checked again in the service. */
export async function publishLegalAction(slug: string, formData: FormData): Promise<void> {
  const admin = await requireAdmin("/admin/legal");
  const s = safeSlug(slug);
  let flag = "failed";
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await publishLegalDraft(prisma, { slug: s, version: formData.get("version"), confirm: formData.get("confirm") }, admin.id);
    if (r.ok) {
      updateTag(LEGAL_TAG); // the public page shows the new text at once
      flag = "published";
    } else flag = { NO_CHANGE: "same", NEEDS_CONFIRM: "confirm", STALE: "stale", INVALID: "invalid", NOT_FOUND: "failed" }[r.code];
  } catch (error) {
    console.error("[admin legal] publish failed", error instanceof Error ? error.message : error);
  }
  redirect(`/admin/legal/${s}/publish?done=${flag}`);
}

/** "Restore lawyer-approved version": one click, a new published version. The slug is bound on the page and checked again. */
export async function restoreLawyerApprovedAction(slug: string, formData?: FormData): Promise<void> {
  void formData; // sent by the dialog form, not needed
  const admin = await requireAdmin("/admin/legal");
  const s = safeSlug(slug);
  let flag = "failed";
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await restoreLawyerApproved(prisma, s, admin.id);
    if (r.ok) {
      updateTag(LEGAL_TAG);
      flag = "restored";
    } else if (r.code === "NO_CHANGE") flag = "nochange";
  } catch (error) {
    console.error("[admin legal] restore failed", error instanceof Error ? error.message : error);
  }
  // n = a new number each time: the editor page uses it as its React key, so it starts fresh with the restored text.
  redirect(`/admin/legal/${s}?done=${flag}&n=${Date.now()}`);
}
