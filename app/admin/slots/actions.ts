"use server";

import { redirect } from "next/navigation";
import { recordAdminAction } from "@/lib/admin/audit";
import { cancelSession, restoreSession, updateSlotZoom } from "@/lib/admin/sessions-service";
import { requireAdmin } from "@/lib/session";
import { addOneToOneSlots } from "@/lib/slots-service";

export type SlotState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

/** Admin only: re-checked on the server on every call (the page check is not enough). */
export async function addSlots(_prev: SlotState, formData: FormData): Promise<SlotState> {
  const admin = await requireAdmin("/admin/slots");
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await addOneToOneSlots(prisma, Object.fromEntries(formData.entries()));
    if (!r.ok) return { status: "error", message: r.message, fieldErrors: r.fieldErrors };
    if (r.created > 0) {
      await recordAdminAction(prisma, { userId: admin.id, action: "slots.add", entity: "ClassSession", summary: `Added ${r.created} 1:1 slot(s), ${r.skipped} already existed` });
    }
    return { status: "ok", message: `Added ${r.created} slot${r.created === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} already existed)` : ""}.` };
  } catch (error) {
    console.error("[admin slots] failed", error instanceof Error ? error.message : error);
    return { status: "error", message: "Sorry, the slots could not be saved." };
  }
}

/**
 * Hide (hide = true) or restore a 1:1 slot. A hidden slot is a cancelled session: nobody can book it.
 * Same rule as cancelling a session: refused when the slot has a booking (task 12.10). The id and the "show from" day are bound on the page.
 */
export async function setSlotHidden(id: string, hide: boolean, from: string, formData?: FormData): Promise<void> {
  void formData; // sent by the form, not needed
  const admin = await requireAdmin("/admin/slots");
  let flag = "failed";
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = hide ? await cancelSession(prisma, id, admin.id, "slot") : await restoreSession(prisma, id, admin.id, "slot");
    if (r.ok) flag = hide ? "hidden" : "restored";
    else if (r.code === "HAS_BOOKINGS") flag = "blocked";
  } catch (error) {
    console.error("[admin slots] hide failed", error instanceof Error ? error.message : error);
  }
  const keep = /^\d{4}-\d{2}-\d{2}$/.test(from) ? `&from=${from}` : ""; // stay on the same "show from" day
  redirect(`/admin/slots?saved=${flag}${keep}`); // outside try/catch: redirect works by throwing
}

/** Admin only: set or clear the private Zoom link of one slot. The link is never logged. */
export async function saveSlotZoom(id: string, _prev: SlotState, formData: FormData): Promise<SlotState> {
  const admin = await requireAdmin("/admin/slots");
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await updateSlotZoom(prisma, id, { zoomUrl: formData.get("zoomUrl") }, admin.id);
    if (!r.ok) return { status: "error", message: r.message, fieldErrors: r.fieldErrors };
    return { status: "ok", message: r.message };
  } catch (error) {
    console.error("[admin slots] zoom failed", error instanceof Error ? error.message : error);
    return { status: "error", message: "Sorry, the Zoom link could not be saved." };
  }
}
