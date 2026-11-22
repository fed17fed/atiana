/** Small helpers for the sessions pages (kept out of the client form file, so server pages can import them). */
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { listSessionOfferings } from "./sessions-service";
import type { SessionOfferingOption } from "@/components/admin/SessionForm";

export { DEFAULT_CAPACITY } from "./sessions-schema";

export async function listSessionOfferingsForForm(db: Pick<PrismaClient, "offering">): Promise<SessionOfferingOption[]> {
  const rows = await listSessionOfferings(db);
  return rows.map((o) => ({
    id: o.id,
    title: o.title,
    kind: o.type as "GROUP_CLASS" | "EVENT",
    online: o.mode === "ONLINE",
    minutes: o.minutes,
    hasDate: o._count.sessions > 0,
    published: o.published,
  }));
}
