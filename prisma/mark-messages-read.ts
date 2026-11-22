// One-time data step (2026-11-21, owner decision): mark all EXISTING contact messages as read, so the new "Unread" tag only shows messages that arrive from now on.
// readAt = the time this script runs (NOT the message date: we do not pretend somebody read it on that day).
// Only rows with readAt = NULL are updated. Nothing is deleted. Safe to run twice: the 2nd run reports 0 changes.
// LOCAL databases only (assertLocalDb): scripts/with-local-db.sh dev|test npm run db:mark-messages-read
// Live (Neon) is a separate step with the owner's OK and a backup branch (task 12.19).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertLocalDb } from "../lib/assert-local-db";
import { PrismaClient } from "../lib/generated/prisma/client";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is not set");
  assertLocalDb(url, "the mark-messages-read step");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  console.log(`Database host: ${new URL(url).hostname}`);
  try {
    const total = await prisma.contactMessage.count();
    const unreadBefore = await prisma.contactMessage.count({ where: { readAt: null } });
    const r = await prisma.contactMessage.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
    const unreadAfter = await prisma.contactMessage.count({ where: { readAt: null } });
    console.log(`Messages: total ${total}; unread before ${unreadBefore}; marked read now ${r.count}; unread after ${unreadAfter}; total after ${await prisma.contactMessage.count()}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
