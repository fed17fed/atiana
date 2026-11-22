// Makes one user an ADMIN. Never deletes. Safe to run twice (2nd run: "already ADMIN, 0 changes").
// Local:  scripts/with-local-db.sh dev npm run set-admin -- admin@atiana.test
// Live:   only with the owner's OK (task 12.19), after a Neon backup branch, with --allow-remote.
// Flags:  --create (make the user if missing, so the magic link finds it later)  --dry-run (show, change nothing)
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { checkSetAdminTarget, parseSetAdminArgs } from "../lib/set-admin-args";

async function main() {
  const args = parseSetAdminArgs(process.argv.slice(2));
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  checkSetAdminTarget(url, args.allowRemote);
  console.log(`Database host: ${new URL(url as string).hostname}`);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url as string }) });
  try {
    const user = await prisma.user.findUnique({ where: { email: args.email }, select: { id: true, role: true } });
    if (user?.role === "ADMIN") return console.log("Already ADMIN. 0 changes.");
    if (!user && !args.create) {
      throw new Error("No user with this email. The person logs in once first, or use --create.");
    }
    if (args.dryRun) return console.log(user ? `Dry run: would change ${user.role} -> ADMIN.` : "Dry run: would create an ADMIN user.");
    if (user) {
      await prisma.user.update({ where: { email: args.email }, data: { role: "ADMIN" } });
      console.log(`Changed ${user.role} -> ADMIN. 1 change.`);
    } else {
      await prisma.user.create({ data: { email: args.email, role: "ADMIN" } });
      console.log("Created ADMIN user. 1 change.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "set-admin failed");
  process.exit(1);
});
