// Idempotent demo seed for classes, packs, 1:1 offerings and sessions (Phase 4). Never deletes.
// Run: npm run db:seed-classes      (uses DIRECT_URL, else DATABASE_URL, from .env)
// A second run on the same day reports 0 changes. Later runs only add new future weeks.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEMO_ZOOM_URL, SINGLE_CLASS_PRICE_CENTS, classTypes, oneToOneOfferings, packs } from "../content/catalog";
import { planGroupSessions, planOneToOneSlots } from "../lib/demo-schedule";
import { PrismaClient } from "../lib/generated/prisma/client";

type Counts = { created: number; updated: number; unchanged: number };
const newCounts = (): Counts => ({ created: 0, updated: 0, unchanged: 0 });

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  console.log(`Seeding database host: ${new URL(url).hostname}`);
  const now = new Date();

  const offerings = newCounts();
  const prices = newCounts();
  const packCounts = newCounts();
  const sessions = newCounts();

  try {
    const offeringIds = new Map<string, string>();

    const defs = [
      ...classTypes.map((c) => ({
        slug: c.slug,
        type: "GROUP_CLASS" as const,
        title: c.title,
        summary: `${c.level} · ${c.minutes} minutes · Online (Zoom)`,
        body: c.text,
        mode: "ONLINE" as const,
        location: null as string | null,
        priceName: "Single class",
        priceCents: SINGLE_CLASS_PRICE_CENTS,
      })),
      ...oneToOneOfferings.map((o) => ({
        slug: o.slug,
        type: "ONE_TO_ONE" as const,
        title: o.title,
        summary: o.summary,
        body: "",
        mode: o.mode,
        location: o.location,
        priceName: o.priceName,
        priceCents: o.priceCents,
      })),
    ];

    for (const d of defs) {
      const before = await prisma.offering.findUnique({ where: { slug: d.slug }, include: { priceOptions: true } });
      const data = { type: d.type, title: d.title, summary: d.summary, body: d.body, mode: d.mode, location: d.location, published: true };
      const same =
        before &&
        before.type === d.type &&
        before.title === d.title &&
        before.summary === d.summary &&
        before.body === d.body &&
        before.mode === d.mode &&
        before.location === d.location &&
        before.published;
      const offering = await prisma.offering.upsert({
        where: { slug: d.slug },
        create: { slug: d.slug, ...data },
        update: same ? {} : data,
      });
      offeringIds.set(d.slug, offering.id);
      if (!before) offerings.created++;
      else if (same) offerings.unchanged++;
      else offerings.updated++;

      const price = before?.priceOptions.find((p) => p.name === d.priceName);
      if (!price) {
        await prisma.priceOption.create({
          data: { offeringId: offering.id, name: d.priceName, amountCents: d.priceCents, currency: "EUR" },
        });
        prices.created++;
      } else if (price.amountCents !== d.priceCents) {
        await prisma.priceOption.update({ where: { id: price.id }, data: { amountCents: d.priceCents } });
        prices.updated++;
      } else prices.unchanged++;
    }

    for (const p of packs) {
      const before = await prisma.package.findFirst({ where: { name: p.name } });
      const data = {
        credits: p.credits,
        validDays: p.validDays,
        priceCents: p.priceCents,
        appliesTo: ["GROUP_CLASS" as const],
        active: true,
      };
      if (!before) {
        await prisma.package.create({ data: { name: p.name, ...data } });
        packCounts.created++;
      } else if (
        before.credits === p.credits &&
        before.validDays === p.validDays &&
        before.priceCents === p.priceCents &&
        before.active
      ) {
        packCounts.unchanged++;
      } else {
        await prisma.package.update({ where: { id: before.id }, data });
        packCounts.updated++;
      }
    }

    const planned = [...planGroupSessions(now), ...planOneToOneSlots(now)];
    for (const s of planned) {
      const offeringId = offeringIds.get(s.offeringSlug);
      if (!offeringId) continue;
      const oneToOne = oneToOneOfferings.find((o) => o.slug === s.offeringSlug);
      const before = await prisma.classSession.findUnique({
        where: { offeringId_startsAt: { offeringId, startsAt: s.startsAt } },
      });
      if (before) {
        sessions.unchanged++; // existing sessions are never changed (admin may have edited them)
        continue;
      }
      await prisma.classSession.create({
        data: {
          offeringId,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          capacity: s.capacity,
          zoomUrl: !oneToOne || oneToOne.mode === "ONLINE" ? DEMO_ZOOM_URL : null,
          location: oneToOne?.location ?? null,
          status: "SCHEDULED",
        },
      });
      sessions.created++;
    }

    const fmt = (n: string, c: Counts) => `${n}: created ${c.created}, updated ${c.updated}, unchanged ${c.unchanged}`;
    console.log(fmt("Offerings", offerings));
    console.log(fmt("Price options", prices));
    console.log(fmt("Packages", packCounts));
    console.log(fmt("Sessions", sessions));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
