"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { markMessageRead, markMessageUnread } from "@/lib/admin/messages-service";

/** "Mark as read". Admin only, re-checked on every call. The id is bound on the page; the form only sends a click. The page reloads its list by itself. */
export async function markMessageReadAction(id: string, formData?: FormData): Promise<void> {
  void formData; // sent by the form, not needed
  const admin = await requireAdmin("/admin/messages");
  try {
    const { prisma } = await import("@/lib/prisma");
    await markMessageRead(prisma, id, admin.id);
    revalidatePath("/admin/messages"); // without this the list on screen would not refresh after the click
  } catch (error) {
    console.error("[admin messages] mark as read failed", error instanceof Error ? error.message : error);
  }
}

/** "Mark as unread". Same rules as "Mark as read": admin only, id bound on the page, nothing is removed. */
export async function markMessageUnreadAction(id: string, formData?: FormData): Promise<void> {
  void formData;
  const admin = await requireAdmin("/admin/messages");
  try {
    const { prisma } = await import("@/lib/prisma");
    await markMessageUnread(prisma, id, admin.id);
    revalidatePath("/admin/messages");
  } catch (error) {
    console.error("[admin messages] mark as unread failed", error instanceof Error ? error.message : error);
  }
}
