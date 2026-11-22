// Idempotent seed: the photos in public/real/ -> image library (MediaImage), task 12.9 prep. LOCAL database only (assertSeedTarget).
// Creates missing rows only; rows that exist are never changed; nothing is deleted; files are not copied (they are already public).
// Run: scripts/with-local-db.sh dev npm run db:seed-library-photos   (second run reports created 0)
import "dotenv/config";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import sharp from "sharp";
import { assertSeedTarget } from "../lib/assert-local-db";
import { PrismaClient } from "../lib/generated/prisma/client";
import { seedLibraryPhotos } from "../lib/seed-library-photos";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is not set");
  assertSeedTarget(url);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  console.log(`Seeding database host: ${new URL(url).hostname}`);
  try {
    const dir = join(process.cwd(), "public", "real");
    const r = await seedLibraryPhotos(prisma, async (file) => {
      const path = join(dir, file);
      const meta = await sharp(path).metadata();
      if (!meta.width || !meta.height) throw new Error(`Cannot read the size of ${file}`);
      return { width: meta.width, height: meta.height, bytes: (await stat(path)).size };
    });
    console.log(`Library photos: created ${r.created}, unchanged ${r.unchanged}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
