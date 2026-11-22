// Idempotent seed for the 3 demo reviews of the Home page (task 12.11). LOCAL database only (assertSeedTarget).
// It only creates missing rows (isDemo = true). Rows that exist are never changed (the admin may have edited them), nothing is deleted.
// Run: npm run db:seed-testimonials   (second run reports 0 created)
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { testimonials } from "../content/home";
import { assertSeedTarget } from "../lib/assert-local-db";
import { PrismaClient } from "../lib/generated/prisma/client";
import { splitWho } from "../lib/testimonials";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is not set");
  assertSeedTarget(url);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  console.log(`Seeding database host: ${new URL(url).hostname}`);
  let created = 0;
  let unchanged = 0;
  try {
    for (const [i, t] of testimonials.entries()) {
      const { name, place } = splitWho(t.who);
      const found = await prisma.testimonial.findFirst({ where: { name, text: t.quote }, select: { id: true } });
      if (found) {
        unchanged++;
        continue;
      }
      await prisma.testimonial.create({ data: { name, place, text: t.quote, isDemo: true, published: true, sortOrder: i + 1 } });
      created++;
    }
    console.log(`Testimonials: created ${created}, unchanged ${unchanged}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
