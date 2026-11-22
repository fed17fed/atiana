/**
 * Offerings admin service (task 12.8): classes, 1:1 and events. There is NO delete: an offering is hidden (published = false)
 * and can be restored. Every change sets `adminEditedAt` (so the seeds skip the row) and writes one audit row.
 * The audit summary names the offering title and the changed fields, never the text itself and never a Zoom link.
 * `db` is passed in so the DB tests can use the test database.
 */
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { recordAdminAction } from "./audit";
import { KIND_LABEL, parseOfferingForm, type OfferingData, type OfferingKind } from "@/lib/offerings-schema";

type Db = Pick<PrismaClient, "offering" | "priceOption" | "mediaImage" | "adminAuditLog" | "$transaction">;

export type ServiceResult = { ok: true; id: string; message: string; version?: string } | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

const PRICE_NAME: Record<OfferingKind, (mode: string) => string> = {
  GROUP_CLASS: () => "Single class",
  EVENT: () => "Ticket",
  ONE_TO_ONE: (mode) => (mode === "IN_PERSON" ? "In person 1:1" : "Online 1:1"),
};

/** The image must come from the library (MediaImage) or be the image the offering already has. No other address is stored. */
async function imageIsAllowed(db: Pick<Db, "mediaImage">, url: string, currentImage: string | null): Promise<boolean> {
  if (currentImage !== null && url === currentImage) return true;
  const hit = await db.mediaImage.findUnique({ where: { url }, select: { id: true } });
  return hit !== null;
}

const IMAGE_ERROR = "Choose an image from the library (or upload a new one).";

export async function createOffering(db: Db, raw: Record<string, unknown>, adminId: string): Promise<ServiceResult> {
  const type = raw.type;
  if (type !== "GROUP_CLASS" && type !== "EVENT") {
    return { ok: false, message: "Please fix the problems below.", fieldErrors: { type: ["Choose Class or Event. The two 1:1 formats already exist: edit them from the list."] } };
  }
  const parsed = parseOfferingForm(raw, { type, isNew: true });
  const fieldErrors: Record<string, string[]> = parsed.ok ? {} : { ...parsed.fieldErrors };
  const slug = parsed.ok ? parsed.data.slug : typeof raw.slug === "string" ? raw.slug.trim().toLowerCase() : "";
  if (slug && /^[a-z0-9-]+$/.test(slug)) {
    const taken = await db.offering.findUnique({ where: { slug }, select: { id: true } });
    if (taken) (fieldErrors.slug ??= []).push("This URL name is already used. Choose another one.");
  }
  if (parsed.ok && parsed.data.image && !(await imageIsAllowed(db, parsed.data.image, null))) (fieldErrors.image ??= []).push(IMAGE_ERROR);
  if (!parsed.ok || Object.keys(fieldErrors).length > 0) return { ok: false, message: "Please fix the problems below.", fieldErrors };
  const d = parsed.data;

  const row = await db.$transaction(async (tx) => {
    const created = await tx.offering.create({
      data: { ...offeringColumns(d), type, slug: d.slug!, sortOrder: d.sortOrder ?? 0, adminEditedAt: new Date() },
      select: { id: true },
    });
    if (d.priceCents !== null) {
      await tx.priceOption.create({ data: { offeringId: created.id, name: PRICE_NAME[type](d.mode), amountCents: d.priceCents, currency: "EUR" } });
    }
    return created;
  });
  await recordAdminAction(db, {
    userId: adminId,
    action: "offering.create",
    entity: "Offering",
    entityId: row.id,
    summary: `Added ${KIND_LABEL[type].toLowerCase()} "${d.title}" (${d.published ? "published" : "hidden"})`,
  });
  return { ok: true, id: row.id, message: "Saved." };
}

export async function updateOffering(db: Db, id: string, raw: Record<string, unknown>, adminId: string): Promise<ServiceResult> {
  const current = await db.offering.findUnique({ where: { id }, include: { priceOptions: { orderBy: { amountCents: "asc" }, take: 1 } } });
  if (!current) return { ok: false, message: "This offering was not found." };
  // Two tabs: the second save must not silently overwrite the first one.
  if (typeof raw.version === "string" && raw.version !== "" && raw.version !== String(current.updatedAt.getTime())) {
    return { ok: false, message: "This offering was changed by someone else. Reload the page and try again." };
  }
  // Locked: type and slug never change; a 1:1 keeps its format (the 1:1 page finds its two cards by format).
  const input = current.type === "ONE_TO_ONE" ? { ...raw, mode: current.mode } : raw;
  const parsed = parseOfferingForm(input, { type: current.type, isNew: false });
  const fieldErrors: Record<string, string[]> = parsed.ok ? {} : { ...parsed.fieldErrors };
  if (parsed.ok && parsed.data.image && !(await imageIsAllowed(db, parsed.data.image, current.image))) (fieldErrors.image ??= []).push(IMAGE_ERROR);
  if (!parsed.ok || Object.keys(fieldErrors).length > 0) return { ok: false, message: "Please fix the problems below.", fieldErrors };
  const d = parsed.data;

  const saved = await db.$transaction(async (tx) => {
    const row = await tx.offering.update({
      where: { id },
      data: { ...offeringColumns(d), ...(d.sortOrder === null ? {} : { sortOrder: d.sortOrder }), adminEditedAt: new Date() },
      select: { updatedAt: true },
    });
    if (d.priceCents !== null) {
      const price = current.priceOptions[0]; // the cheapest option: the one the booking engine uses
      if (!price) await tx.priceOption.create({ data: { offeringId: id, name: PRICE_NAME[current.type](d.mode), amountCents: d.priceCents, currency: "EUR" } });
      else if (price.amountCents !== d.priceCents) await tx.priceOption.update({ where: { id: price.id }, data: { amountCents: d.priceCents } });
    }
    return row;
  });

  const changed = changedFields(current, d);
  await recordAdminAction(db, {
    userId: adminId,
    action: "offering.update",
    entity: "Offering",
    entityId: id,
    summary: `Edited ${KIND_LABEL[current.type].toLowerCase()} "${d.title}"${changed.length ? `: ${changed.join(", ")}` : ": no field changed"}`,
  });
  return { ok: true, id, message: "Saved.", version: String(saved.updatedAt.getTime()) };
}

/** Hide / restore. Never a delete. Existing bookings stay. Sets adminEditedAt, so a seed can never publish the row again. */
export async function setOfferingPublished(db: Db, id: string, published: boolean, adminId: string): Promise<ServiceResult> {
  const current = await db.offering.findUnique({ where: { id }, select: { published: true, title: true, type: true } });
  if (!current) return { ok: false, message: "This offering was not found." };
  if (current.published !== published) {
    await db.offering.update({ where: { id }, data: { published, adminEditedAt: new Date() } });
    await recordAdminAction(db, {
      userId: adminId,
      action: published ? "offering.restore" : "offering.hide",
      entity: "Offering",
      entityId: id,
      summary: `${published ? "Restored" : "Hid"} ${KIND_LABEL[current.type].toLowerCase()} "${current.title}"`,
    });
  }
  return { ok: true, id, message: published ? "Restored. It is on the site again." : "Hidden from the site." };
}

function offeringColumns(d: OfferingData) {
  return {
    title: d.title,
    summary: d.summary,
    body: d.body,
    level: d.level,
    minutes: d.minutes,
    lengthLabel: d.lengthLabel,
    activationAfterMinutes: d.activationAfterMinutes,
    mode: d.mode,
    location: d.location,
    eventPricing: d.eventPricing,
    image: d.image,
    imageAlt: d.imageAlt,
    published: d.published,
  } satisfies Prisma.OfferingUncheckedUpdateInput;
}

type CurrentRow = Awaited<ReturnType<Db["offering"]["findUniqueOrThrow"]>> & { priceOptions: { amountCents: number }[] };

/** Names of the fields that changed (no values: the log must not hold texts). */
export function changedFields(c: CurrentRow, d: OfferingData): string[] {
  const out: string[] = [];
  const cmp = (name: string, a: unknown, b: unknown) => {
    if ((a ?? null) !== (b ?? null)) out.push(name);
  };
  cmp("title", c.title, d.title);
  cmp("summary", c.summary, d.summary);
  cmp("text", c.body, d.body);
  cmp("level", c.level, d.level);
  cmp("minutes", c.minutes, d.minutes);
  cmp("length label", c.lengthLabel, d.lengthLabel);
  cmp("greeting minutes", c.activationAfterMinutes, d.activationAfterMinutes);
  cmp("format", c.mode, d.mode);
  cmp("place", c.location, d.location);
  cmp("event type", c.eventPricing, d.eventPricing);
  cmp("image", c.image, d.image);
  cmp("alt text", c.imageAlt, d.imageAlt);
  if (d.sortOrder !== null) cmp("order", c.sortOrder, d.sortOrder);
  cmp("published", c.published, d.published);
  if (d.priceCents !== null) cmp("price", c.priceOptions[0]?.amountCents ?? null, d.priceCents);
  return out;
}

export const OFFERINGS_PAGE_SIZE = 25;

type ListOpts = { type?: OfferingKind; published?: boolean; page?: number };
const listWhere = (opts: ListOpts) => ({ ...(opts.type ? { type: opts.type } : {}), ...(opts.published === undefined ? {} : { published: opts.published }) });

/** Number of rows for the same filter (for "Page 2 of 7"). */
export async function countOfferings(db: Pick<PrismaClient, "offering">, opts: ListOpts = {}) {
  return db.offering.count({ where: listWhere(opts) });
}

/**
 * List for the admin screen, one page at a time (OFFERINGS_PAGE_SIZE rows, page 1 = first). Nothing is cut: every row is on some page.
 * Order: type, then the shop order number, then NEWEST first (a new or just-hidden item is on page 1), id as the last tie-break so pages never overlap.
 */
export async function listOfferings(db: Pick<PrismaClient, "offering">, opts: ListOpts = {}) {
  const page = Math.max(1, Math.trunc(opts.page ?? 1) || 1);
  return db.offering.findMany({
    where: listWhere(opts),
    orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * OFFERINGS_PAGE_SIZE,
    take: OFFERINGS_PAGE_SIZE,
    select: {
      id: true,
      type: true,
      title: true,
      slug: true,
      published: true,
      mode: true,
      eventPricing: true,
      adminEditedAt: true,
      priceOptions: { orderBy: { amountCents: "asc" }, take: 1, select: { amountCents: true } },
    },
  });
}
