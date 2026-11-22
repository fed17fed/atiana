// Idempotent demo seed for classes, packs, 1:1 offerings and sessions (Phase 4). Never deletes.
// Phase 12 (task 12.8): creates missing offerings, updates rows nobody has edited, and SKIPS rows with adminEditedAt (an admin edit is never overwritten).
// Long texts are saved with rule TOKENS ({{JOIN_EARLY_MINUTES}}), not a filled number (finding F-2).
// Run: npm run db:seed-classes      (uses DIRECT_URL, else DATABASE_URL, from .env)
// A second run on the same day reports 0 changes. Later runs only add new future weeks.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { longTextToMarkdown } from "../content/session-texts";
import { DEMO_ZOOM_URL, HIDDEN_DEMO_CLASS_SLUGS, classTypes, oneToOneOfferings, oneToOnePacks, packs } from "../content/catalog";
import { planGroupSessions, planOneToOneSlots } from "../lib/demo-schedule";
import { assertSeedTarget } from "../lib/assert-local-db";
import { seedAction } from "../lib/seed-offerings";
import { PrismaClient } from "../lib/generated/prisma/client";

type Counts = { created: number; updated: number; unchanged: number; skipped: number };
const newCounts = (): Counts => ({ created: 0, updated: 0, unchanged: 0, skipped: 0 });

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is not set");
  assertSeedTarget(url); // local database only (ALLOW_REMOTE_DB_SEED=true only with the owner's OK, task 11.14)
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  console.log(`Seeding database host: ${new URL(url).hostname}`);
  const now = new Date();

  const offerings = newCounts();
  const prices = newCounts();
  const packCounts = newCounts();
  const sessions = newCounts();
  let hidden = 0;

  try {
    const offeringIds = new Map<string, string>();

    const defs = [
      ...classTypes.map((c, i) => ({
        slug: c.slug,
        type: "GROUP_CLASS" as const,
        title: c.title,
        summary: c.text,
        body: longTextToMarkdown(c.long), // tokens, not filled numbers
        mode: "ONLINE" as const,
        location: null as string | null,
        level: c.level as string | null,
        minutes: c.minutes as number | null,
        activationAfterMinutes: (c.activationAfterMinutes ?? null) as number | null,
        sortOrder: i * 10,
        priceName: "Single class",
        priceCents: c.priceCents,
      })),
      ...oneToOneOfferings.map((o, i) => ({
        slug: o.slug,
        type: "ONE_TO_ONE" as const,
        title: o.title,
        summary: o.summary,
        body: "",
        mode: o.mode,
        location: o.location,
        level: null as string | null,
        minutes: o.minutes as number | null,
        activationAfterMinutes: null as number | null,
        sortOrder: i * 10,
        priceName: o.priceName,
        priceCents: o.priceCents,
      })),
    ];

    for (const d of defs) {
      const before = await prisma.offering.findUnique({ where: { slug: d.slug }, include: { priceOptions: true } });
      const data = {
        type: d.type,
        title: d.title,
        summary: d.summary,
        body: d.body,
        mode: d.mode,
        location: d.location,
        level: d.level,
        minutes: d.minutes,
        activationAfterMinutes: d.activationAfterMinutes,
        sortOrder: d.sortOrder,
        published: true,
      };
      const action = seedAction(before, data);
      if (action === "skip-edited") {
        offeringIds.set(d.slug, before!.id); // sessions may still be planned for it; the row and its price stay as the admin left them
        offerings.skipped++;
        continue;
      }
      const offering = await prisma.offering.upsert({
        where: { slug: d.slug },
        create: { slug: d.slug, ...data },
        update: action === "update" ? data : {},
      });
      offeringIds.set(d.slug, offering.id);
      if (action === "create") offerings.created++;
      else if (action === "unchanged") offerings.unchanged++;
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

    // The 4 first demo classes are hidden, never deleted (their sessions and bookings stay in the database).
    const hide = await prisma.offering.updateMany({
      where: { slug: { in: [...HIDDEN_DEMO_CLASS_SLUGS] }, published: true, adminEditedAt: null }, // an admin who restored one keeps it
      data: { published: false },
    });
    hidden = hide.count;

    for (const p of [
      ...packs.map((x) => ({ ...x, appliesTo: "GROUP_CLASS" as const })),
      ...oneToOnePacks.map((x) => ({ ...x, appliesTo: "ONE_TO_ONE" as const })),
    ]) {
      // The admin may have renamed the pack (task 12.10): find it by name OR by its fixed terms (seats, days, type), never create a copy.
      const before = await prisma.package.findFirst({ where: { OR: [{ name: p.name }, { credits: p.credits, validDays: p.validDays, appliesTo: { equals: [p.appliesTo] } }] } });
      const data = {
        credits: p.credits,
        validDays: p.validDays,
        priceCents: p.priceCents,
        appliesTo: [p.appliesTo],
        active: true,
      };
      if (!before) {
        await prisma.package.create({ data: { name: p.name, ...data } });
        packCounts.created++;
      } else {
        // The database is the master after Phase 12 (owner answer Q6): the admin edits name, price and the Active switch.
        // The seed never changes a pack that exists.
        packCounts.unchanged++;
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

    const fmt = (n: string, c: Counts) => `${n}: created ${c.created}, updated ${c.updated}, unchanged ${c.unchanged}, skipped (admin edited) ${c.skipped}`;
    console.log(fmt("Offerings", offerings));
    console.log(fmt("Price options", prices));
    console.log(fmt("Packages", packCounts));
    console.log(fmt("Sessions", sessions));
    console.log(`Old demo classes hidden now: ${hidden}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
