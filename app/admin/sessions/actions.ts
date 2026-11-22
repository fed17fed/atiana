"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { cancelSession, createSessions, restoreSession, updateSession } from "@/lib/admin/sessions-service";
import { OFFERINGS_TAG } from "@/lib/offerings-cache";

export type SessionState =
  | { status: "idle" }
  | { status: "ok"; message: string; version?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

const FAILED: SessionState = { status: "error", message: "Sorry, the session could not be saved. Try again." };

/** Admin only, re-checked on every call. Events show their date through the offerings cache, so its tag is expired after every change. */
export async function saveSession(_prev: SessionState, formData: FormData): Promise<SessionState> {
  const admin = await requireAdmin("/admin/sessions");
  const raw: Record<string, unknown> = { ...Object.fromEntries(formData.entries()), skip: formData.getAll("skip") };
  const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : null;
  let flag: string | null = null;
  try {
    const { prisma } = await import("@/lib/prisma");
    if (id) {
      const r = await updateSession(prisma, id, raw, admin.id);
      if (!r.ok) return { status: "error", message: r.message, fieldErrors: r.fieldErrors };
      updateTag(OFFERINGS_TAG);
      return { status: "ok", message: r.message, version: r.version };
    }
    const r = await createSessions(prisma, raw, admin.id);
    if (!r.ok) return { status: "error", message: r.message, fieldErrors: r.fieldErrors };
    updateTag(OFFERINGS_TAG);
    flag = r.created === 0 ? "none" : `created-${Math.min(r.created, 99)}`;
  } catch (error) {
    console.error("[admin sessions] save failed", error instanceof Error ? error.message : error); // never the form values: they hold the private Zoom link
    return FAILED;
  }
  redirect(`/admin/sessions?saved=${flag}`); // outside try/catch: redirect works by throwing
}

/** Cancel (cancel = true) or restore. The id is bound on the page; the form only sends a click. Refused when the session has bookings. */
export async function setSessionCancelled(id: string, cancel: boolean, formData?: FormData): Promise<void> {
  void formData; // sent by the form, not needed
  const admin = await requireAdmin("/admin/sessions");
  let flag = "failed";
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = cancel ? await cancelSession(prisma, id, admin.id, "session") : await restoreSession(prisma, id, admin.id, "session");
    if (r.ok) {
      updateTag(OFFERINGS_TAG);
      flag = cancel ? "cancelled" : "restored";
    } else if (r.code === "HAS_BOOKINGS") flag = "blocked";
  } catch (error) {
    console.error("[admin sessions] cancel failed", error instanceof Error ? error.message : error);
  }
  redirect(`/admin/sessions?saved=${flag}`);
}
