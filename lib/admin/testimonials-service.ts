/**
 * Testimonials admin service (task 12.11). No delete exists: a review is hidden (published = false) and can be shown again.
 * Every change writes one audit row. The summary never holds the client's name or text.
 * `db` is passed in so the DB tests can use the test database.
 */
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { recordAdminAction } from "./audit";
import { needsClientConsent, parseTestimonialForm } from "@/lib/testimonials-schema";

type Db = Pick<PrismaClient, "testimonial" | "adminAuditLog">;

export type ServiceResult = { ok: true; id: string; message: string; version?: string } | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function createTestimonial(db: Db, raw: Record<string, unknown>, adminId: string): Promise<ServiceResult> {
  const parsed = parseTestimonialForm(raw, null);
  if (!parsed.ok) return { ok: false, message: "Please fix the problems below.", fieldErrors: parsed.fieldErrors };
  const row = await db.testimonial.create({ data: parsed.data, select: { id: true } });
  await recordAdminAction(db, {
    userId: adminId,
    action: "testimonial.create",
    entity: "Testimonial",
    entityId: row.id,
    summary: `Added a ${parsed.data.isDemo ? "demo" : "real (client agreed)"} testimonial, ${parsed.data.published ? "shown" : "hidden"}`,
  });
  return { ok: true, id: row.id, message: "Testimonial added." };
}

export async function updateTestimonial(db: Db, id: string, raw: Record<string, unknown>, adminId: string): Promise<ServiceResult> {
  const current = await db.testimonial.findUnique({ where: { id }, select: { isDemo: true, updatedAt: true } });
  if (!current) return { ok: false, message: "This testimonial was not found." };
  // Two tabs: the second save must not silently overwrite the first one.
  if (typeof raw.version === "string" && raw.version !== "" && raw.version !== String(current.updatedAt.getTime())) {
    return { ok: false, message: "This testimonial was changed by someone else. Reload the page and try again." };
  }
  const parsed = parseTestimonialForm(raw, current.isDemo);
  if (!parsed.ok) return { ok: false, message: "Please fix the problems below.", fieldErrors: parsed.fieldErrors };
  const saved = await db.testimonial.update({ where: { id }, data: parsed.data, select: { updatedAt: true } });
  const labelChange = current.isDemo && !parsed.data.isDemo ? " Demo label removed (client agreed confirmed)." : "";
  await recordAdminAction(db, { userId: adminId, action: "testimonial.update", entity: "Testimonial", entityId: id, summary: `Edited a testimonial.${labelChange}` });
  return { ok: true, id, message: "Saved. The Home page shows it now.", version: String(saved.updatedAt.getTime()) };
}

/** Hide / show. Never a delete. */
export async function setTestimonialPublished(db: Db, id: string, published: boolean, adminId: string): Promise<ServiceResult> {
  const current = await db.testimonial.findUnique({ where: { id }, select: { published: true } });
  if (!current) return { ok: false, message: "This testimonial was not found." };
  if (current.published !== published) {
    await db.testimonial.update({ where: { id }, data: { published } });
    await recordAdminAction(db, { userId: adminId, action: published ? "testimonial.show" : "testimonial.hide", entity: "Testimonial", entityId: id, summary: published ? "Shown on the site" : "Hidden from the site" });
  }
  return { ok: true, id, message: published ? "Shown on the site." : "Hidden from the site." };
}

export { needsClientConsent };
