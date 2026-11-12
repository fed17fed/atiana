/**
 * Helpers for tests that talk to a LOCAL test database (localhost only, enforced by assertLocalDb; never Neon). They only run with RUN_DB_TESTS=true
 * (npm run test:db). Rule: nothing is deleted. Test data uses fixed users and one hidden offering;
 * sessions are cancelled (updated) after the run.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { assertLocalDb } from "@/lib/assert-local-db";

export const dbTestsOn = process.env.RUN_DB_TESTS === "true" && !!process.env.DATABASE_URL;

// Safety guard: DB tests run ONLY on a local database. Throws before any query (also when this file is imported).
if (dbTestsOn) assertLocalDb(process.env.DATABASE_URL, "the DB tests");

export async function getDb(): Promise<PrismaClient> {
  assertLocalDb(process.env.DATABASE_URL, "the DB tests");
  const { getPrisma } = await import("@/lib/prisma");
  return getPrisma();
}

export async function testUser(db: PrismaClient, n: number) {
  const email = `dbtest-${n}@atiana.test`;
  await db.user.createMany({ data: [{ email, name: `DB Test ${n}` }], skipDuplicates: true });
  return db.user.findUniqueOrThrow({ where: { email } });
}

export async function testOffering(db: PrismaClient, kind: "GROUP_CLASS" | "ONE_TO_ONE") {
  const slug = kind === "GROUP_CLASS" ? "zz-dbtest-class" : "zz-dbtest-1to1";
  await db.offering.createMany({
    data: [
      {
        slug,
        type: kind,
        title: kind === "GROUP_CLASS" ? "ZZ DB test class" : "ZZ DB test 1:1",
        published: true,
        mode: "ONLINE",
      },
    ],
    skipDuplicates: true,
  });
  const o = await db.offering.update({ where: { slug }, data: { published: true } });
  const price = await db.priceOption.findFirst({ where: { offeringId: o.id } });
  if (!price) await db.priceOption.create({ data: { offeringId: o.id, name: "Test price", amountCents: 1500 } });
  return o;
}

/** Hidden FREE class (price option with 0 cents) for tests of free booking (task 11.6). */
export async function testFreeClassOffering(db: PrismaClient) {
  const slug = "zz-dbtest-class-free";
  await db.offering.createMany({
    data: [{ slug, type: "GROUP_CLASS", title: "ZZ DB test free class", published: true, mode: "ONLINE" }],
    skipDuplicates: true,
  });
  const o = await db.offering.update({ where: { slug }, data: { published: true } });
  const price = await db.priceOption.findFirst({ where: { offeringId: o.id } });
  if (!price) await db.priceOption.create({ data: { offeringId: o.id, name: "Free", amountCents: 0 } });
  else if (price.amountCents !== 0) await db.priceOption.update({ where: { id: price.id }, data: { amountCents: 0 } });
  return o;
}

/** Hidden event offering for tests (FREE, DONATION or PAID with a EUR 45 ticket). */
export async function testEventOffering(db: PrismaClient, pricing: "FREE" | "DONATION" | "PAID") {
  const slug = `zz-dbtest-event-${pricing.toLowerCase()}`;
  await db.offering.createMany({
    data: [{ slug, type: "EVENT", title: `ZZ DB test event ${pricing}`, published: true, mode: "ONLINE", eventPricing: pricing }],
    skipDuplicates: true,
  });
  const o = await db.offering.update({ where: { slug }, data: { published: true, eventPricing: pricing } });
  if (pricing === "PAID" && !(await db.priceOption.findFirst({ where: { offeringId: o.id } }))) {
    await db.priceOption.create({ data: { offeringId: o.id, name: "Ticket", amountCents: 4500 } });
  }
  return o;
}

/** A new far-future session (year 2040) with a random start so runs never collide. */
export async function newSession(db: PrismaClient, offeringId: string, capacity: number, startsAt?: Date) {
  const start = startsAt ?? new Date(Date.UTC(2040, 0, 1) + Math.floor(Math.random() * 3e8) * 1000);
  return db.classSession.create({
    data: { offeringId, startsAt: start, endsAt: new Date(start.getTime() + 3600_000), capacity, zoomUrl: "https://zoom.example/test" },
  });
}

export function unique(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** Hide the test offering and cancel its sessions again (update only, nothing deleted). */
export async function hideTestData(db: PrismaClient) {
  const offerings = await db.offering.findMany({ where: { slug: { startsWith: "zz-dbtest" } }, select: { id: true } });
  const ids = offerings.map((o) => o.id);
  await db.offering.updateMany({ where: { id: { in: ids } }, data: { published: false } });
  await db.classSession.updateMany({ where: { offeringId: { in: ids }, status: "SCHEDULED" }, data: { status: "CANCELLED" } });
}
