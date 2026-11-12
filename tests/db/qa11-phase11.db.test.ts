/** QA tests for Phase 11 (tester, task 11.12). LOCAL test database only (guard in helpers.ts). Nothing is deleted. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { createBooking } from "@/lib/booking-service";
import { registerForEvent } from "@/lib/event-service";
import { dbTestsOn, getDb, hideTestData, newSession, testEventOffering, testFreeClassOffering, testOffering, testUser } from "./helpers";

const d = describe.skipIf(!dbTestsOn);
let db: PrismaClient;
let paidClass: string;
let freeClass: string;
let paidEvent: string;
const users: { id: string }[] = [];

beforeAll(async () => {
  if (!dbTestsOn) return;
  db = await getDb();
  paidClass = (await testOffering(db, "GROUP_CLASS")).id;
  freeClass = (await testFreeClassOffering(db)).id;
  paidEvent = (await testEventOffering(db, "PAID")).id;
  for (let i = 1; i <= 4; i++) users.push(await testUser(db, 30 + i));
}, 60_000);
afterAll(async () => {
  if (dbTestsOn) await hideTestData(db);
}, 60_000);

d("QA11 seeded real content (test database)", () => {
  it("class prices in the database: Blitz 2000, Dive Deep 3000, Gratitude 0, KEA 3000; published", async () => {
    const rows = await db.offering.findMany({ where: { slug: { in: ["blitz-for-bliss", "dive-deep", "gratitude", "kundalini-energy-activation"] } }, include: { priceOptions: true } });
    const m = Object.fromEntries(rows.map((o) => [o.slug, [o.published, o.priceOptions.map((p) => p.amountCents)]]));
    expect(m).toEqual({
      "blitz-for-bliss": [true, [2000]], "dive-deep": [true, [3000]], gratitude: [true, [0]], "kundalini-energy-activation": [true, [3000]],
    });
  });
  it("7 events with the plan dates (UTC = Dublin in winter) and prices 3000 / solstice 6000", async () => {
    const rows = await db.offering.findMany({ where: { type: "EVENT", published: true, slug: { not: { startsWith: "zz-" } } }, include: { sessions: true, priceOptions: true }, orderBy: { slug: "asc" } });
    const got = rows.map((o) => `${o.slug}|${o.sessions.map((s) => s.startsAt.toISOString()).join(",")}|${o.priceOptions[0]?.amountCents}`).sort();
    expect(got).toEqual([
      "full-moon-2026-11-24|2026-11-24T20:00:00.000Z|3000", "full-moon-2027-01-22|2027-01-22T20:00:00.000Z|3000",
      "lunar-eclipse-2027-02-20|2027-02-20T22:30:00.000Z|3000", "new-moon-2026-12-09|2026-12-09T20:00:00.000Z|3000",
      "new-moon-2027-01-07|2027-01-07T20:00:00.000Z|3000", "new-moon-2027-02-06|2027-02-06T20:00:00.000Z|3000",
      "winter-solstice-2026-12-21|2026-12-21T21:00:00.000Z|6000",
    ]);
    const sol = rows.find((o) => o.slug.startsWith("winter-solstice"))!.sessions[0];
    expect(sol.endsAt.toISOString()).toBe("2026-12-21T22:15:00.000Z");
  });
  it("old demo classes are hidden (not deleted); no pack is needed to see the class list", async () => {
    const old = await db.offering.findMany({ where: { slug: { in: ["morning-energy-class", "evening-transmission", "beginners-introduction", "breath-and-stillness"] } } });
    for (const o of old) expect(o.published, o.slug).toBe(false);
  });
});

d("QA11 booking closes at the start (no late join)", () => {
  it("paid class: 1 ms before the start is open, at the start and 10 minutes after (greeting time) are closed", async () => {
    const s = await newSession(db, paidClass, 5);
    const credit = await db.creditGrant.create({
      data: { userId: users[0].id, creditsTotal: 3, creditsLeft: 3, appliesTo: ["GROUP_CLASS"], source: "ADMIN", expiresAt: new Date(s.startsAt.getTime() + 30 * 86400_000) },
    });
    const at = (ms: number) => createBooking(db, { userId: users[0].id, sessionId: s.id, method: "CREDIT", disclaimerAccepted: true, now: new Date(s.startsAt.getTime() + ms) });
    expect(await at(0)).toEqual({ ok: false, code: "PAST" });
    expect(await at(10 * 60_000)).toEqual({ ok: false, code: "PAST" });
    const ok = await at(-1);
    expect(ok.ok).toBe(true);
    // a refused late booking must not take a credit: only the one successful booking used one
    expect((await db.creditGrant.findUniqueOrThrow({ where: { id: credit.id } })).creditsLeft).toBe(2);
    await db.creditGrant.update({ where: { id: credit.id }, data: { creditsLeft: 0 } });
  }, 60_000);
  it("free class: closed at the start, nothing is created", async () => {
    const s = await newSession(db, freeClass, 5);
    const r = await createBooking(db, { userId: users[1].id, sessionId: s.id, method: "FREE", disclaimerAccepted: true, now: s.startsAt });
    expect(r).toEqual({ ok: false, code: "PAST" });
    expect(await db.booking.count({ where: { sessionId: s.id } })).toBe(0);
  }, 60_000);
  it("event: closed at the start and during the greeting; open 1 ms before; no order for a closed try", async () => {
    const s = await newSession(db, paidEvent, 5);
    const reg = (ms: number) => registerForEvent(db, { userId: users[2].id, sessionId: s.id, disclaimerAccepted: true, paymentsOn: true, now: new Date(s.startsAt.getTime() + ms) });
    expect(await reg(0)).toEqual({ ok: false, code: "CLOSED" });
    expect(await reg(10 * 60_000)).toEqual({ ok: false, code: "CLOSED" });
    expect(await db.booking.count({ where: { sessionId: s.id } })).toBe(0);
    const ok = await reg(-1);
    expect(ok.ok && ok.status).toBe("PENDING");
  }, 60_000);
  it("paid event with Stripe off (keys missing): nothing is reserved, honest PAYMENTS_OFF", async () => {
    const s = await newSession(db, paidEvent, 5);
    const r = await registerForEvent(db, { userId: users[3].id, sessionId: s.id, disclaimerAccepted: true, paymentsOn: false });
    expect(r).toEqual({ ok: false, code: "PAYMENTS_OFF" });
    expect(await db.booking.count({ where: { sessionId: s.id } })).toBe(0);
  }, 60_000);
});
