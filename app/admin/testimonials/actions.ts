"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { createTestimonial, setTestimonialPublished, updateTestimonial } from "@/lib/admin/testimonials-service";
import { TESTIMONIALS_TAG } from "@/lib/testimonials-cache";

export type TestimonialState =
  | { status: "idle" }
  | { status: "ok"; message: string; version?: string }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

const FAILED: TestimonialState = { status: "error", message: "Sorry, the testimonial could not be saved. Try again." };

/** Admin only, re-checked on every call. After a save the Home cache tag is expired, so the page shows the change at once. */
export async function saveTestimonial(_prev: TestimonialState, formData: FormData): Promise<TestimonialState> {
  const admin = await requireAdmin("/admin/testimonials");
  const raw = Object.fromEntries(formData.entries());
  const id = typeof raw.id === "string" && raw.id !== "" ? raw.id : null;
  let created = false;
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = id ? await updateTestimonial(prisma, id, raw, admin.id) : await createTestimonial(prisma, raw, admin.id);
    if (!r.ok) return { status: "error", message: r.message, fieldErrors: r.fieldErrors };
    updateTag(TESTIMONIALS_TAG);
    if (!id) created = true;
    else return { status: "ok", message: r.message, version: r.version };
  } catch (error) {
    console.error("[admin testimonials] save failed", error instanceof Error ? error.message : error);
    return FAILED;
  }
  if (created) redirect("/admin/testimonials?saved=added"); // outside try/catch: redirect works by throwing
  return FAILED;
}

/** Hide (show = false for Hide) or show again. The id is bound on the page; the form only sends a click. */
export async function setTestimonialVisible(id: string, show: boolean, formData?: FormData): Promise<void> {
  void formData; // sent by the form, not needed
  const admin = await requireAdmin("/admin/testimonials");
  let flag = "failed";
  try {
    const { prisma } = await import("@/lib/prisma");
    const r = await setTestimonialPublished(prisma, id, show, admin.id);
    if (r.ok) {
      updateTag(TESTIMONIALS_TAG);
      flag = show ? "shown" : "hidden";
    }
  } catch (error) {
    console.error("[admin testimonials] visibility failed", error instanceof Error ? error.message : error);
  }
  redirect(`/admin/testimonials?saved=${flag}`);
}
