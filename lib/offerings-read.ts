/**
 * The database read behind the public pages (task 12.8). No Next.js here, so the DB tests can run it on the test database.
 * It throws when the database cannot be read; offerings-cache.ts catches that and uses the code content.
 */
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { chooseList, classFromRow, codeOfferings, eventFromRow, oneToOneFromRow, type OfferingRow, type PublicOfferings } from "./offerings-public";

export async function readPublicOfferings(db: Pick<PrismaClient, "offering">, now: Date = new Date()): Promise<PublicOfferings> {
  const include = { priceOptions: { orderBy: { amountCents: "asc" as const }, take: 1 } };
  const [plain, events, counts] = await Promise.all([
    db.offering.findMany({ where: { published: true, type: { in: ["GROUP_CLASS", "ONE_TO_ONE"] } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include }),
    db.offering.findMany({
      where: { published: true, type: "EVENT" },
      orderBy: [{ createdAt: "asc" }],
      include: { ...include, sessions: { where: { status: { in: ["SCHEDULED", "CANCELLED"] } }, orderBy: { startsAt: "asc" }, select: { startsAt: true, endsAt: true, capacity: true, status: true } } },
    }),
    db.offering.groupBy({ by: ["type"], _count: { _all: true } }),
  ]);
  const total = (t: string) => counts.find((c) => c.type === t)?._count._all ?? 0;
  const noSessions = (r: (typeof plain)[number]): OfferingRow => ({ ...r, sessions: [] });
  const classes = chooseList(plain.filter((r) => r.type === "GROUP_CLASS").map((r) => classFromRow(noSessions(r))), total("GROUP_CLASS"), () => codeOfferings().classes);
  const oneToOne = chooseList(plain.filter((r) => r.type === "ONE_TO_ONE").map((r) => oneToOneFromRow(noSessions(r))), total("ONE_TO_ONE"), () => codeOfferings().oneToOne);
  const ev = chooseList(events.map((r) => eventFromRow(r, now)), total("EVENT"), () => codeOfferings().events);
  return { classes: classes.list, oneToOne: oneToOne.list, events: ev.list, source: { classes: classes.source, oneToOne: oneToOne.source, events: ev.source } };
}
