"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { cleanKey } from "@/lib/admin/text-registry";
import { resetText, restoreText, saveText } from "@/lib/admin/text-service";
import { TEXTS_TAG } from "@/lib/site-text";

export type TextSaveState =
  | { status: "idle" }
  | { status: "ok"; message: string; version: string; value: string }
  | { status: "error"; message: string; problems?: string[]; stale?: boolean };

const FAILED: TextSaveState = { status: "error", message: "Sorry, the text could not be saved. Try again." };

/** Admin only, re-checked on every call. After a save the text cache tag is expired, so the public pages show the change at once. */
export async function saveTextAction(_prev: TextSaveState, formData: FormData): Promise<TextSaveState> {
  const admin = await requireAdmin("/admin/texts");
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await saveText(prisma, { key: formData.get("key"), value: formData.get("value"), note: formData.get("note"), version: formData.get("version") }, admin.id);
    if (!r.ok) return { status: "error", message: r.message, problems: r.problems, stale: r.code === "STALE" };
    updateTag(TEXTS_TAG);
    return { status: "ok", message: r.message, version: r.version, value: r.value };
  } catch (error) {
    console.error("[admin texts] save failed", error instanceof Error ? error.message : error);
    return FAILED;
  }
}

/** "Back to default". The key is bound on the page; it is checked against the code list again on the server. */
export async function backToDefaultAction(key: string, formData?: FormData): Promise<void> {
  void formData; // sent by the dialog form, not needed
  const admin = await requireAdmin("/admin/texts");
  const k = cleanKey(key);
  let flag = "failed";
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await resetText(prisma, k, admin.id);
    if (r.ok) {
      updateTag(TEXTS_TAG);
      flag = "default";
    } else if (r.code === "NO_CHANGE") flag = "nochange";
  } catch (error) {
    console.error("[admin texts] reset failed", error instanceof Error ? error.message : error);
  }
  // n = a new number each time: the editor page uses it as its React key, so it starts fresh with the default text.
  redirect(`/admin/texts/${k ?? ""}?done=${flag}&n=${Date.now()}`);
}

/** Restore an old version (or "default") as a new version. Goes back to the history page. */
export async function restoreTextAction(key: string, revisionId: string, formData?: FormData): Promise<void> {
  void formData;
  const admin = await requireAdmin("/admin/texts");
  const k = cleanKey(key);
  let flag = "failed";
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await restoreText(prisma, k, revisionId, admin.id);
    if (r.ok) {
      updateTag(TEXTS_TAG);
      flag = "restored";
    } else if (r.code === "NO_CHANGE") flag = "nochange";
    else if (r.code === "INVALID") flag = "invalid";
  } catch (error) {
    console.error("[admin texts] restore failed", error instanceof Error ? error.message : error);
  }
  redirect(`/admin/texts/${k ?? ""}/history?done=${flag}`);
}
