// Idempotent demo seed for the 4 events (Phase 5). Never deletes. Run: npm run db:seed-events
// Second run reports 0 changes.
// Phase 12 (task 12.8): creates missing events, updates events nobody has edited, and SKIPS events with adminEditedAt
// (offering, price and session: an admin edit is never overwritten, a moved session is never added a second time).
// Long texts are saved with rule TOKENS ({{JOIN_EARLY_MINUTES}}), not a filled number (finding F-2).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEMO_ZOOM_URL } from "../content/catalog";
import { HIDDEN_DEMO_EVENT_SLUGS, events } from "../content/events";
import { longTextToMarkdown } from "../content/session-texts";
import { assertSeedTarget } from "../lib/assert-local-db";
import { seedAction } from "../lib/seed-offerings";
import { PrismaClient } from "../lib/generated/prisma/client";
import { zonedToUtc } from "../lib/time";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is not set");
  assertSeedTarget(url); // local database only (ALLOW_REMOTE_DB_SEED=true only with the owner's OK, task 11.14)
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  console.log(`Seeding database host: ${new URL(url).hostname}`);
  const c = { offerings: [0, 0, 0, 0], prices: [0, 0, 0, 0], sessions: [0, 0, 0, 0] }; // created, updated, unchanged, skipped (admin edited)
  try {
    for (const [index, e] of events.entries()) {
      const data = {
        type: "EVENT" as const,
        title: e.title,
        summary: e.summary,
        body: longTextToMarkdown(e.long), // tokens, not filled numbers
        image: e.image,
        imageAlt: e.imageAlt,
        mode: e.mode,
        location: e.location,
        published: true,
        eventPricing: e.pricing,
        minutes: e.minutes,
        lengthLabel: e.lengthLabel,
        activationAfterMinutes: e.activationAfterMinutes ?? null,
        sortOrder: index * 10,
      };
      const before = await prisma.offering.findUnique({ where: { slug: e.slug }, include: { priceOptions: true } });
      const action = seedAction(before, data);
      if (action === "skip-edited") {
        c.offerings[3]++;
        if (e.priceCents !== null) c.prices[3]++;
        c.sessions[3]++;
        continue;
      }
      const offering = await prisma.offering.upsert({ where: { slug: e.slug }, create: { slug: e.slug, ...data }, update: action === "update" ? data : {} });
      c.offerings[action === "create" ? 0 : action === "update" ? 1 : 2]++;

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
      // An event has ONE date. If it already has a session (even one the admin moved to another day), the seed adds nothing (task 12.9).
      const existing = await prisma.classSession.findFirst({ where: { offeringId: offering.id }, select: { id: true } });
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
    // The 4 first demo events are hidden, never deleted (their sessions and registrations stay in the database).
    const hide = await prisma.offering.updateMany({
      where: { slug: { in: [...HIDDEN_DEMO_EVENT_SLUGS] }, published: true, adminEditedAt: null }, // an admin who restored one keeps it
      data: { published: false },
    });
    console.log(`Old demo events hidden now: ${hide.count}`);
    const f = (n: string, a: number[]) => `${n}: created ${a[0]}, updated ${a[1]}, unchanged ${a[2]}, skipped (admin edited) ${a[3]}`;
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
