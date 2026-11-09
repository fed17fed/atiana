import { DEMO_ZOOM_URL } from "@/content/catalog";
import type { PrismaClient } from "./generated/prisma/client";
import { planSlots, slotFormSchema } from "./slots-schema";

export type AddSlotsResult =
  | { ok: true; created: number; skipped: number }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

/** Admin adds 1:1 slots (capacity 1). Existing slots at the same time are skipped, never changed. */
export async function addOneToOneSlots(db: PrismaClient, raw: unknown, now = new Date()): Promise<AddSlotsResult> {
  const parsed = slotFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: "Please check the fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const offering = await db.offering.findFirst({ where: { id: parsed.data.offeringId, type: "ONE_TO_ONE" } });
  if (!offering) return { ok: false, message: "This 1:1 offering was not found." };

  const plan = planSlots(parsed.data, now);
  if (plan.length === 0) return { ok: false, message: "All chosen times are in the past." };

  const result = await db.classSession.createMany({
    data: plan.map((p) => ({
      offeringId: offering.id,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      capacity: 1,
      location: offering.mode === "IN_PERSON" ? offering.location : null,
      zoomUrl: offering.mode === "ONLINE" ? DEMO_ZOOM_URL : null,
    })),
    skipDuplicates: true,
  });
  return { ok: true, created: result.count, skipped: plan.length - result.count };
}
