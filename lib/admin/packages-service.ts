/**
 * Packages admin (task 12.10): edit name, price and the Active switch of a credit pack. No create, no delete.
 * Seats (credits), validity and what the pack applies to are shown but not edited here: they are part of the owner's rules and of
 * credits already sold. A new price only changes FUTURE purchases (an order stores its own price).
 * Packs stay hidden on the public site while SHOW_PACKS is off (lib/features.ts): this screen does not change that flag.
 */
import { z } from "zod";
import { MIN_CARD_PAYMENT_CENTS } from "@/lib/booking-rules";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { MAX_PRICE_CENTS, centsToPriceInput, parsePriceToCents } from "@/lib/offerings-schema";
import { recordAdminAction } from "./audit";

type Db = Pick<PrismaClient, "package" | "adminAuditLog">;

export const PACKAGE_NAME_MAX = 80;
const PRIVATE_RE = /zoom\.us|zoomgov\.com|[^\s@]+@[^\s@]+\.[^\s@]+/i;
const oneLine = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const checkbox = (v: unknown) => v === true || v === "on" || v === "true";

export const packageSchema = z.object({
  name: z.preprocess(oneLine, z.string().min(3, "Name is required (at least 3 characters).").max(PACKAGE_NAME_MAX, `Name: at most ${PACKAGE_NAME_MAX} characters.`).refine((v) => !PRIVATE_RE.test(v), "Do not put email addresses or Zoom links in a name.")),
  price: z.preprocess(
    (v) => parsePriceToCents(v),
    z.number({ message: "Price: type euros, for example 60 or 105.50." }).int().min(MIN_CARD_PAYMENT_CENTS, "Price: at least 0.50 euro (the card payment minimum).").max(MAX_PRICE_CENTS, `Price: at most ${MAX_PRICE_CENTS / 100} euro.`),
  ),
  active: z.preprocess(checkbox, z.boolean()),
  version: z.preprocess(oneLine, z.string()),
});

export type PackageResult = { ok: true; id: string; message: string; version: string } | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function updatePackage(db: Db, id: string, raw: Record<string, unknown>, adminId: string): Promise<PackageResult> {
  const parsed = packageSchema.safeParse(raw);
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    return { ok: false, message: "Please fix the problems below.", fieldErrors: Object.fromEntries(Object.entries(fe).filter(([, v]) => v?.length)) as Record<string, string[]> };
  }
  const f = parsed.data;
  const cur = await db.package.findUnique({ where: { id } });
  if (!cur) return { ok: false, message: "This package was not found." };
  // Stale-form check: two tabs must not silently overwrite each other.
  if (f.version !== "" && f.version !== String(cur.updatedAt.getTime())) return { ok: false, message: "This package was changed by someone else. Reload the page and try again." };
  const changed: string[] = [];
  if (cur.name !== f.name) changed.push("name");
  if (cur.priceCents !== f.price) changed.push("price");
  if (cur.active !== f.active) changed.push(f.active ? "set Active" : "set Inactive");
  const saved = await db.package.update({ where: { id }, data: { name: f.name, priceCents: f.price, active: f.active }, select: { updatedAt: true } });
  await recordAdminAction(db, {
    userId: adminId,
    action: "package.update",
    entity: "Package",
    entityId: id,
    summary: `Edited package "${f.name}"${changed.length ? `: ${changed.join(", ")}` : ": no field changed"}`,
  });
  return { ok: true, id, message: "Saved.", version: String(saved.updatedAt.getTime()) };
}

export async function listPackages(db: Pick<PrismaClient, "package">) {
  return db.package.findMany({ orderBy: [{ priceCents: "asc" }, { createdAt: "asc" }], take: 100 });
}

export { centsToPriceInput };
