// Idempotent import of the lawyer-approved legal files as version 1 (task 12.13). LOCAL database only (assertSeedTarget).
// It only CREATES a missing version 1 per page (rule numbers become tokens; the shown text stays identical). Nothing is changed or deleted.
// Run: scripts/with-local-db.sh dev|test npm run db:seed-legal   (second run reports 0 created)
// The admin pages also import version 1 by themselves when it is missing, so this script is optional.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { ensureBaseVersion } from "../lib/admin/legal-service";
import { assertSeedTarget } from "../lib/assert-local-db";
import { PrismaClient } from "../lib/generated/prisma/client";
import { legalSlugs } from "../lib/legal";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is not set");
  assertSeedTarget(url);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  console.log(`Seeding database host: ${new URL(url).hostname}`);
  let created = 0;
  let unchanged = 0;
  try {
    for (const slug of legalSlugs) {
      if (await ensureBaseVersion(prisma, slug)) created++;
      else unchanged++;
    }
    console.log(`Legal pages (version 1): created ${created}, unchanged ${unchanged}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
