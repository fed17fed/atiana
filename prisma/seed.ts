// Idempotent demo seed (task 2.4): only creates or updates, never deletes.
// Run: npx prisma db seed      (uses DIRECT_URL, else DATABASE_URL, from .env)
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { assertSeedUsersSafe, seedUsers } from "./seed-data";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is not set");
  assertSeedUsersSafe(seedUsers);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const host = new URL(url).hostname;
  console.log(`Seeding database host: ${host}`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  try {
    for (const u of seedUsers) {
      const before = await prisma.user.findUnique({ where: { email: u.email } });
      const same =
        before && before.name === u.name && before.role === u.role && before.referralCode === u.referralCode;
      await prisma.user.upsert({
        where: { email: u.email },
        create: { email: u.email, name: u.name, role: u.role, referralCode: u.referralCode },
        update: { name: u.name, role: u.role, referralCode: u.referralCode },
      });
      if (!before) created++;
      else if (same) unchanged++;
      else updated++;
    }
    console.log(`Users: created ${created}, updated ${updated}, unchanged ${unchanged}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
