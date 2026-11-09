"use server";

import { requireAdmin } from "@/lib/session";
import { addOneToOneSlots } from "@/lib/slots-service";

export type SlotState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

/** Admin only: re-checked on the server on every call (the page check is not enough). */
export async function addSlots(_prev: SlotState, formData: FormData): Promise<SlotState> {
  await requireAdmin("/admin/slots");
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await addOneToOneSlots(prisma, Object.fromEntries(formData.entries()));
    if (!r.ok) return { status: "error", message: r.message, fieldErrors: r.fieldErrors };
    return { status: "ok", message: `Added ${r.created} slot${r.created === 1 ? "" : "s"}${r.skipped ? ` (${r.skipped} already existed)` : ""}.` };
  } catch (error) {
    console.error("[admin slots] failed", error instanceof Error ? error.message : error);
    return { status: "error", message: "Sorry, the slots could not be saved." };
  }
}
