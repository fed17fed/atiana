// Idempotent demo seed for the 4 events (Phase 5). Never deletes. Run: npm run db:seed-events
// Second run reports 0 changes.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEMO_ZOOM_URL } from "../content/catalog";
import { events } from "../content/events";
import { PrismaClient } from "../lib/generated/prisma/client";
import { zonedToUtc } from "../lib/time";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  console.log(`Seeding database host: ${new URL(url).hostname}`);
  const c = { offerings: [0, 0, 0], prices: [0, 0, 0], sessions: [0, 0, 0] }; // created, updated, unchanged
  try {
    for (const e of events) {
      const data = {
        type: "EVENT" as const,
        title: e.title,
        summary: e.summary,
        body: e.body,
        image: e.image,
        mode: e.mode,
        location: e.location,
        published: true,
        eventPricing: e.pricing,
      };
      const before = await prisma.offering.findUnique({ where: { slug: e.slug }, include: { priceOptions: true } });
      const same = before && (Object.keys(data) as (keyof typeof data)[]).every((k) => before[k] === data[k]);
      const offering = await prisma.offering.upsert({ where: { slug: e.slug }, create: { slug: e.slug, ...data }, update: same ? {} : data });
      c.offerings[!before ? 0 : same ? 2 : 1]++;

      if (e.priceCents !== null) {
        const price = before?.priceOptions.find((p) => p.name === "Ticket");
        if (!price) {
          await prisma.priceOption.create({ data: { offeringId: offering.id, name: "Ticket", amountCents: e.priceCents, currency: "EUR" } });
          c.prices[0]++;
        } else if (price.amountCents !== e.priceCents) {
          await prisma.priceOption.update({ where: { id: price.id }, data: { amountCents: e.priceCents } });
          c.prices[1]++;
        } else c.prices[2]++;
      }

      const startsAt = zonedToUtc(e.start);
      const existing = await prisma.classSession.findUnique({ where: { offeringId_startsAt: { offeringId: offering.id, startsAt } } });
      if (existing) {
        c.sessions[2]++; // never change an existing session (admin may have edited it)
      } else {
        await prisma.classSession.create({
          data: {
            offeringId: offering.id,
            startsAt,
            endsAt: new Date(startsAt.getTime() + e.minutes * 60_000),
            capacity: e.spots,
            zoomUrl: e.mode === "ONLINE" ? DEMO_ZOOM_URL : null,
            location: e.location,
            status: "SCHEDULED",
          },
        });
        c.sessions[0]++;
      }
    }
    const f = (n: string, a: number[]) => `${n}: created ${a[0]}, updated ${a[1]}, unchanged ${a[2]}`;
    console.log(f("Event offerings", c.offerings));
    console.log(f("Price options", c.prices));
    console.log(f("Event sessions", c.sessions));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
