/**
 * Tasks 12.9 / 12.10 on the LOCAL test database (see helpers.ts): sessions (create, weekly repeat, edit, cancel rule),
 * events get their date here, the private Zoom link never leaks, 1:1 slot hide, packages, library seed.
 * Nothing is deleted: test rows stay with unique names; sessions are cancelled (updated) at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { cancelSession, countSessions, createSessions, listSessions, SESSIONS_PAGE_SIZE, restoreSession, updateSession } from "@/lib/admin/sessions-service";
import { addOneToOneSlots } from "@/lib/slots-service";
import { updateSlotZoom } from "@/lib/admin/sessions-service";
import { updatePackage } from "@/lib/admin/packages-service";
import { createBooking } from "@/lib/booking-service";
import { getBookableSession, getOneToOneSlots, getScheduleWeek, getActivePackages } from "@/lib/catalog-queries";
import { getUpcomingEvents } from "@/lib/event-queries";
import { readPublicOfferings } from "@/lib/offerings-read";
import { libraryPhotos, seedLibraryPhotos } from "@/lib/seed-library-photos";
import { dbTestsOn, getDb, hideTestData, newSession, testFreeClassOffering, testOffering, testUser, unique } from "./helpers";

const d = describe.skipIf(!dbTestsOn);
const SECRET = "https://zoom.us/j/55501234567?pwd=SECRETPASSWORD123";
const MIN = 60_000;

let db: PrismaClient;
let adminId: string;
const users: { id: string }[] = [];

async function newOffering(type: "GROUP_CLASS" | "EVENT", extra: { mode?: "ONLINE" | "IN_PERSON" } = {}) {
  const slug = unique(`zz-dbtest-s${type === "EVENT" ? "e" : "c"}`);
  return db.offering.create({
    data: { slug, type, title: `ZZ ${slug}`, published: true, mode: extra.mode ?? "ONLINE", eventPricing: type === "EVENT" ? "FREE" : null, minutes: 60, summary: "x" },
  });
}
const form = (offeringId: string, over: Record<string, unknown> = {}) => ({ offeringId, date: "2040-10-23", time: "19:00", minutes: "60", capacity: "12", zoomUrl: "", repeatWeeks: "1", skip: [], ...over });
const seatRows = (sessionId: string) => db.booking.count({ where: { sessionId, status: { in: ["PENDING", "CONFIRMED"] } } });

beforeAll(async () => {
  if (!dbTestsOn) return;
  db = await getDb();
  adminId = (await testUser(db, 950)).id;
  for (let i = 951; i <= 956; i++) users.push(await testUser(db, i));
}, 60_000);

afterAll(async () => {
  if (dbTestsOn) await hideTestData(db);
}, 60_000);

d("sessions admin (local test database)", () => {
  it("weekly repeat: Dublin time -> UTC across the October clock change, skipped dates, audit row without the Zoom link", async () => {
    const o = await newOffering("GROUP_CLASS");
    // 2040-10-28 is the last Sunday of October: Dublin goes from summer time (UTC+1) to winter time (UTC+0).
    const r = await createSessions(db, form(o.id, { repeatWeeks: "4", skip: ["2040-11-06"], zoomUrl: SECRET }), adminId);
    expect(r).toMatchObject({ ok: true, created: 3, skipped: 0 });
    const rows = await db.classSession.findMany({ where: { offeringId: o.id }, orderBy: { startsAt: "asc" } });
    expect(rows.map((x) => x.startsAt.toISOString())).toEqual(["2040-10-23T18:00:00.000Z", "2040-10-30T19:00:00.000Z", "2040-11-13T19:00:00.000Z"]);
    expect(rows.every((x) => x.capacity === 12 && x.zoomUrl === SECRET && x.status === "SCHEDULED")).toBe(true);
    // 2nd run: nothing new
    expect(await createSessions(db, form(o.id, { repeatWeeks: "4", skip: ["2040-11-06"], zoomUrl: SECRET }), adminId)).toMatchObject({ ok: true, created: 0, skipped: 3 });
    expect(await db.classSession.count({ where: { offeringId: o.id } })).toBe(3);
    // audit: one row for the first run, the Zoom link is not in any audit row
    const audit = await db.adminAuditLog.findMany({ where: { userId: adminId, action: "session.create" } });
    expect(audit.some((a) => a.summary.includes(o.title))).toBe(true);
    expect(JSON.stringify(await db.adminAuditLog.findMany({ where: { userId: adminId } }))).not.toMatch(/zoom\.us|SECRETPASSWORD|55501234567/);
  }, 60_000);

  it("a class session shows on the schedule data at the right instant; the private Zoom link is in no public read", async () => {
    const o = await newOffering("GROUP_CLASS");
    const r = await createSessions(db, form(o.id, { date: "2040-12-04", time: "18:30", zoomUrl: SECRET }), adminId);
    expect(r.ok).toBe(true);
    const week = await getScheduleWeek(db, { weekOffset: 0, now: new Date("2040-12-03T10:00:00Z") });
    const mine = week.items.find((i) => i.slug === o.slug);
    expect(mine?.startsAt).toBe("2040-12-04T18:30:00.000Z"); // winter: Dublin = UTC
    expect(JSON.stringify(week)).not.toMatch(/zoom|SECRET/i);
    const s = await db.classSession.findFirstOrThrow({ where: { offeringId: o.id } });
    expect(JSON.stringify(await getBookableSession(db, s.id, new Date("2040-12-01T00:00:00Z")))).not.toMatch(/zoom|SECRET/i);
    expect(JSON.stringify(await readPublicOfferings(db, new Date("2040-12-01T00:00:00Z")))).not.toMatch(/zoom\.us|SECRET/i);
    expect(JSON.stringify(await getUpcomingEvents(db, { now: new Date("2040-12-01T00:00:00Z") }))).not.toMatch(/zoom\.us|SECRET/i);
    // the admin list says "has a link", never the link
    const list = await listSessions(db, { offeringId: o.id, now: new Date("2040-12-01T00:00:00Z") });
    expect(list).toHaveLength(1);
    expect(list[0].hasZoom).toBe(true);
    expect(JSON.stringify(list)).not.toMatch(/zoom\.us|SECRET/i);
  }, 60_000);

  it("refuses: past time, in-person Zoom link, bad link, repeat on an event, 1:1 offering", async () => {
    const c = await newOffering("GROUP_CLASS");
    const inPerson = await newOffering("GROUP_CLASS", { mode: "IN_PERSON" });
    const e = await newOffering("EVENT");
    const oto = await testOffering(db, "ONE_TO_ONE");
    expect(await createSessions(db, form(c.id, { date: "2020-01-01" }), adminId)).toMatchObject({ ok: false, fieldErrors: { date: [expect.stringContaining("past")] } });
    expect(await createSessions(db, form(inPerson.id, { zoomUrl: SECRET }), adminId)).toMatchObject({ ok: false, fieldErrors: { zoomUrl: expect.any(Array) } });
    expect(await createSessions(db, form(c.id, { zoomUrl: "http://zoom.us/j/1" }), adminId)).toMatchObject({ ok: false, fieldErrors: { zoomUrl: expect.any(Array) } });
    expect(await createSessions(db, form(c.id, { zoomUrl: "javascript:alert(1)" }), adminId)).toMatchObject({ ok: false, fieldErrors: { zoomUrl: expect.any(Array) } });
    expect(await createSessions(db, form(e.id, { repeatWeeks: "3" }), adminId)).toMatchObject({ ok: false, fieldErrors: { repeatWeeks: expect.any(Array) } });
    expect(await createSessions(db, form(oto.id), adminId)).toMatchObject({ ok: false, fieldErrors: { offeringId: expect.any(Array) } });
    expect(await createSessions(db, form(c.id, { repeatWeeks: "2", skip: ["2040-10-23", "2040-10-30"] }), adminId)).toMatchObject({ ok: false, fieldErrors: { repeatWeeks: expect.any(Array) } });
    expect(await createSessions(db, form("nope"), adminId)).toMatchObject({ ok: false });
    expect(await db.classSession.count({ where: { offeringId: { in: [c.id, inPerson.id, e.id] } } })).toBe(0);
  }, 60_000);

  it("an event gets its date here: one date only, it shows on the public event data, a cancelled event leaves the list", async () => {
    const e = await newOffering("EVENT");
    const at = new Date("2040-09-01T00:00:00Z");
    expect((await readPublicOfferings(db, at)).events.find((x) => x.slug === e.slug)?.session).toBeNull(); // no date yet
    expect(await createSessions(db, form(e.id, { date: "2040-09-10", time: "20:00", capacity: "20" }), adminId)).toMatchObject({ ok: true, created: 1 });
    const ev = (await readPublicOfferings(db, at)).events.find((x) => x.slug === e.slug);
    expect(ev?.session).toMatchObject({ startsAt: "2040-09-10T19:00:00.000Z", capacity: 20, cancelled: false }); // summer: Dublin = UTC+1
    expect((await getUpcomingEvents(db, { now: at })).some((x) => x.slug === e.slug)).toBe(true);
    // a second date for the same event is refused (the pages show one date)
    expect(await createSessions(db, form(e.id, { date: "2040-09-17" }), adminId)).toMatchObject({ ok: false, fieldErrors: { offeringId: [expect.stringContaining("already has a date")] } });
    // two parallel creates: exactly one wins
    const e2 = await newOffering("EVENT");
    const par = await Promise.all([1, 2, 3, 4].map((n) => createSessions(db, form(e2.id, { date: `2040-09-${10 + n}` }), adminId)));
    expect(par.filter((p) => p.ok).length).toBe(1);
    expect(await db.classSession.count({ where: { offeringId: e2.id } })).toBe(1);
    // cancel (0 bookings) -> not in the upcoming list
    const s = await db.classSession.findFirstOrThrow({ where: { offeringId: e.id } });
    expect(await cancelSession(db, s.id, adminId, "session")).toMatchObject({ ok: true, changed: true });
    expect((await getUpcomingEvents(db, { now: at })).some((x) => x.slug === e.slug)).toBe(false);
  }, 60_000);

  it("cancel: refused with a booking (same seat rule as the engine), allowed with 0, old unpaid hold does not block, safe twice", async () => {
    const o = await testFreeClassOffering(db);
    const s = await newSession(db, o.id, 5);
    // a CONFIRMED booking blocks
    const b = await createBooking(db, { userId: users[0].id, sessionId: s.id, method: "FREE", disclaimerAccepted: true });
    expect(b.ok).toBe(true);
    const blocked = await cancelSession(db, s.id, adminId, "session");
    expect(blocked).toMatchObject({ ok: false, code: "HAS_BOOKINGS", bookings: 1 });
    expect(blocked.ok === false && blocked.message).toContain("1 booking");
    expect((await db.classSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("SCHEDULED");
    // a FRESH unpaid hold blocks too (it is a seat)
    const fresh = await db.booking.create({ data: { userId: users[1].id, sessionId: s.id, status: "PENDING", paidWith: "STRIPE", userKey: `${s.id}:${users[1].id}` } });
    expect(await cancelSession(db, s.id, adminId, "session")).toMatchObject({ ok: false, bookings: 2 });
    // client cancels both -> 0 seats -> admin can cancel
    await db.booking.updateMany({ where: { sessionId: s.id }, data: { status: "CANCELLED", userKey: null, slotKey: null } });
    void fresh;
    expect(await cancelSession(db, s.id, adminId, "session")).toMatchObject({ ok: true, changed: true });
    expect(await cancelSession(db, s.id, adminId, "session")).toMatchObject({ ok: true, changed: false }); // twice is safe
    expect(await createBooking(db, { userId: users[2].id, sessionId: s.id, method: "FREE", disclaimerAccepted: true })).toEqual({ ok: false, code: "NOT_FOUND" });
    // restore -> bookable again
    expect(await restoreSession(db, s.id, adminId, "session")).toMatchObject({ ok: true, changed: true });
    expect((await createBooking(db, { userId: users[2].id, sessionId: s.id, method: "FREE", disclaimerAccepted: true })).ok).toBe(true);

    // an OLD unpaid hold (40 min) is not a seat: cancel works and the hold is released
    const s2 = await newSession(db, o.id, 5);
    const old = await db.booking.create({
      data: { userId: users[3].id, sessionId: s2.id, status: "PENDING", paidWith: "STRIPE", userKey: `${s2.id}:${users[3].id}`, createdAt: new Date(Date.now() - 40 * MIN) },
    });
    expect(await cancelSession(db, s2.id, adminId, "session")).toMatchObject({ ok: true, changed: true });
    expect((await db.booking.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("CANCELLED");
    // a hold 20 minutes old still counts
    const s3 = await newSession(db, o.id, 5);
    await db.booking.create({ data: { userId: users[4].id, sessionId: s3.id, status: "PENDING", paidWith: "STRIPE", userKey: `${s3.id}:${users[4].id}`, createdAt: new Date(Date.now() - 20 * MIN) } });
    expect(await cancelSession(db, s3.id, adminId, "session")).toMatchObject({ ok: false, code: "HAS_BOOKINGS" });
    // audit rows written
    expect(await db.adminAuditLog.count({ where: { userId: adminId, action: { in: ["session.cancel", "session.restore"] }, entityId: s.id } })).toBe(2);
  }, 60_000);

  it("cancel and booking at the same moment: one wins, the data is always consistent (6 rounds)", async () => {
    const o = await testFreeClassOffering(db);
    for (let i = 0; i < 6; i++) {
      const s = await newSession(db, o.id, 5);
      const [c, b] = await Promise.all([cancelSession(db, s.id, adminId, "session"), createBooking(db, { userId: users[5].id, sessionId: s.id, method: "FREE", disclaimerAccepted: true })]);
      const status = (await db.classSession.findUniqueOrThrow({ where: { id: s.id } })).status;
      const seats = await seatRows(s.id);
      if (c.ok) {
        expect(b).toEqual({ ok: false, code: "NOT_FOUND" });
        expect(status).toBe("CANCELLED");
        expect(seats).toBe(0);
      } else {
        expect(c).toMatchObject({ code: "HAS_BOOKINGS" });
        expect(b.ok).toBe(true);
        expect(status).toBe("SCHEDULED");
        expect(seats).toBe(1);
      }
    }
  }, 120_000);

  it("edit: stale form, past time, time locked while booked, capacity not below seats, Zoom change allowed, clash", async () => {
    const o = await newOffering("GROUP_CLASS");
    await createSessions(db, form(o.id, { date: "2040-05-07", time: "10:00", zoomUrl: "https://zoom.us/j/111" }), adminId);
    await createSessions(db, form(o.id, { date: "2040-05-14", time: "10:00" }), adminId);
    const [a, other] = await db.classSession.findMany({ where: { offeringId: o.id }, orderBy: { startsAt: "asc" } });
    const edit = (over: Record<string, unknown>) => updateSession(db, a.id, { date: "2040-05-07", time: "10:00", minutes: "60", capacity: "12", zoomUrl: "https://zoom.us/j/111", version: String(a.updatedAt.getTime()), ...over }, adminId);

    expect(await edit({ version: "1" })).toMatchObject({ ok: false, message: expect.stringContaining("changed by someone else") });
    expect(await edit({ date: "2020-01-01" })).toMatchObject({ ok: false, fieldErrors: { date: [expect.stringContaining("past")] } });
    expect(await edit({ date: "2040-05-14" })).toMatchObject({ ok: false, fieldErrors: { date: [expect.stringContaining("already has a session")] } });
    const ok = await edit({ time: "11:00", capacity: "8", zoomUrl: "https://zoom.us/j/222" });
    expect(ok).toMatchObject({ ok: true });
    const after = await db.classSession.findUniqueOrThrow({ where: { id: a.id } });
    expect(after).toMatchObject({ capacity: 8, zoomUrl: "https://zoom.us/j/222" });
    expect(after.startsAt.toISOString()).toBe("2040-05-07T10:00:00.000Z"); // summer 11:00 Dublin
    // the stale version of the first form is now refused
    expect(await edit({ time: "12:00" })).toMatchObject({ ok: false, message: expect.stringContaining("changed by someone else") });
    // with a booking: time locked, capacity floor, Zoom link still editable
    await db.booking.create({ data: { userId: users[0].id, sessionId: a.id, status: "CONFIRMED", paidWith: "FREE", userKey: `${a.id}:${users[0].id}` } });
    const v = (await db.classSession.findUniqueOrThrow({ where: { id: a.id } })).updatedAt.getTime();
    const edit2 = (over: Record<string, unknown>) => updateSession(db, a.id, { date: "2040-05-07", time: "11:00", minutes: "60", capacity: "8", zoomUrl: "https://zoom.us/j/222", version: String(v), ...over }, adminId);
    expect(await edit2({ time: "12:00" })).toMatchObject({ ok: false, fieldErrors: { date: [expect.stringContaining("booked")] } });
    expect(await edit2({ capacity: "1", zoomUrl: "" })).toMatchObject({ ok: true }); // 1 seat taken, capacity 1 is allowed
    await db.booking.updateMany({ where: { sessionId: a.id }, data: { status: "CANCELLED", userKey: null } });
    // audit: field names only
    const logs = await db.adminAuditLog.findMany({ where: { entityId: a.id, action: "session.update" }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.summary).join("|")).toMatch(/time, capacity, Zoom link/);
    expect(JSON.stringify(logs)).not.toMatch(/zoom\.us|\/j\/222/);
    void other;
  }, 60_000);
});

d("1:1 slots and packages (local test database)", () => {
  it("a hidden 1:1 slot cannot be booked and is not offered; restore brings it back; a booked slot cannot be hidden", async () => {
    const o = await testOffering(db, "ONE_TO_ONE");
    const s = await newSession(db, o.id, 1);
    const now = new Date();
    const offered = async () => (await getOneToOneSlots(db, { now, limit: 5000 })).some((x) => x.id === s.id);
    expect(await offered()).toBe(true);
    expect(await cancelSession(db, s.id, adminId, "slot")).toMatchObject({ ok: true, changed: true });
    expect(await offered()).toBe(false);
    expect(await createBooking(db, { userId: users[0].id, sessionId: s.id, method: "STRIPE", disclaimerAccepted: true })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await restoreSession(db, s.id, adminId, "slot")).toMatchObject({ ok: true, changed: true });
    expect(await offered()).toBe(true);
    // a booked slot cannot be hidden
    await db.booking.create({ data: { userId: users[1].id, sessionId: s.id, status: "CONFIRMED", paidWith: "CREDIT", userKey: `${s.id}:${users[1].id}`, slotKey: s.id } });
    expect(await cancelSession(db, s.id, adminId, "slot")).toMatchObject({ ok: false, code: "HAS_BOOKINGS" });
    await db.booking.updateMany({ where: { sessionId: s.id }, data: { status: "CANCELLED", userKey: null, slotKey: null } });
    expect(await db.adminAuditLog.count({ where: { entityId: s.id, action: { in: ["slot.hide", "slot.restore"] } } })).toBe(2);
  }, 60_000);

  it("1:1 slots: optional private Zoom link on add and edit; empty = placeholder; in-person refused; audit has no link", async () => {
    const o = await testOffering(db, "ONE_TO_ONE");
    const link = "https://zoom.us/j/55501234567?pwd=SECRETPASSWORD123";
    const day = (n: number) => new Date(Date.UTC(2050, 0, 1) + n * 86_400_000).toISOString().slice(0, 10); // 2050 + up to ~270 years: no clash with old test rows
    const n = Math.floor(Math.random() * 100_000);
    const dateA = day(n);
    const base = { offeringId: o.id, time: "09:15", minutes: "60", repeatWeeks: "1" };
    expect(await addOneToOneSlots(db, { ...base, date: dateA, zoomUrl: "http://zoom.us/j/1" })).toMatchObject({ ok: false, fieldErrors: { zoomUrl: expect.any(Array) } });
    const r = await addOneToOneSlots(db, { ...base, date: dateA, zoomUrl: link });
    expect(r).toMatchObject({ ok: true, created: 1 });
    const slot = await db.classSession.findFirstOrThrow({ where: { offeringId: o.id, zoomUrl: link, startsAt: { gte: new Date(`${dateA}T00:00:00Z`) } } });
    // empty link on add keeps today's placeholder
    const r2 = await addOneToOneSlots(db, { ...base, date: day(n + 100_001), zoomUrl: "" });
    expect(r2.ok).toBe(true);
    // edit: change, clear (placeholder), bad link refused
    const next = "https://us02web.zoom.us/j/999?pwd=NEW";
    expect(await updateSlotZoom(db, slot.id, { zoomUrl: next }, adminId)).toMatchObject({ ok: true });
    expect((await db.classSession.findUniqueOrThrow({ where: { id: slot.id } })).zoomUrl).toBe(next);
    expect(await updateSlotZoom(db, slot.id, { zoomUrl: "ftp://x.y" }, adminId)).toMatchObject({ ok: false, fieldErrors: { zoomUrl: expect.any(Array) } });
    expect(await updateSlotZoom(db, slot.id, { zoomUrl: "" }, adminId)).toMatchObject({ ok: true });
    expect((await db.classSession.findUniqueOrThrow({ where: { id: slot.id } })).zoomUrl).toBe("https://zoom.example/demo-link-placeholder");
    // audit rows never contain a link
    const rows = await db.adminAuditLog.findMany({ where: { entityId: slot.id } });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(rows)).not.toMatch(/zoom\.us|SECRET|NEW|https?:/i);
    // a class session id is not a 1:1 slot
    const c = await newSession(db, (await testOffering(db, "GROUP_CLASS")).id, 5);
    expect(await updateSlotZoom(db, c.id, { zoomUrl: next }, adminId)).toMatchObject({ ok: false });
  }, 60_000);

  it("N18-1: sessions list pages (25 per page): every row once, stable order, filters kept, nothing cut", async () => {
    const o = await newOffering("GROUP_CLASS");
    const base = Date.UTC(2046, 0, 1, 10, 0, 0) + Math.floor(Math.random() * 1e6) * 60_000;
    await db.classSession.createMany({ data: Array.from({ length: 60 }, (_, i) => ({ offeringId: o.id, startsAt: new Date(base + i * 3_600_000), endsAt: new Date(base + i * 3_600_000 + 3_600_000), capacity: 5 })) });
    await db.classSession.updateMany({ where: { offeringId: o.id, startsAt: { gte: new Date(base + 50 * 3_600_000) } }, data: { status: "CANCELLED" } });
    const now = new Date("2040-12-01T00:00:00Z");
    const all = { offeringId: o.id, now };
    expect(await countSessions(db, all)).toBe(60);
    const seen: string[] = [];
    for (let p = 1; p <= 3; p++) {
      const rows = await listSessions(db, { ...all, page: p });
      expect(rows.length).toBe(p < 3 ? SESSIONS_PAGE_SIZE : 60 - 2 * SESSIONS_PAGE_SIZE);
      seen.push(...rows.map((r) => r.id));
      if (p > 1) expect(rows[0].startsAt.getTime()).toBeGreaterThan((await listSessions(db, { ...all, page: p - 1 })).at(-1)!.startsAt.getTime()); // soonest first, continues
    }
    expect(new Set(seen).size).toBe(60);
    expect(await listSessions(db, { ...all, page: 4 })).toEqual([]);
    // filter: cancelled only = 10 rows, 1 page; the 60th row is reachable (the old cut at 200 could hide it)
    expect(await countSessions(db, { ...all, status: "CANCELLED" })).toBe(10);
    expect((await listSessions(db, { ...all, status: "CANCELLED", page: 1 })).length).toBe(10);
    // past: latest first
    const past = await listSessions(db, { offeringId: o.id, when: "past", now: new Date(base + 100 * 3_600_000), page: 1 });
    expect(past[0].startsAt.getTime()).toBeGreaterThan(past[1].startsAt.getTime());
  }, 60_000);

  it("packages: edit name, price and Active; stale form refused; bad price refused; audit; active list follows", async () => {
    const p = await db.package.create({ data: { name: unique("ZZ pack"), credits: 3, validDays: 30, priceCents: 4500, appliesTo: ["GROUP_CLASS"], active: true } });
    const v = String(p.updatedAt.getTime());
    expect(await updatePackage(db, p.id, { name: "ab", price: "45", active: "on", version: v }, adminId)).toMatchObject({ ok: false, fieldErrors: { name: expect.any(Array) } });
    for (const bad of ["0", "0.10", "abc", "-5", "99999", ""]) expect(await updatePackage(db, p.id, { name: "Three classes", price: bad, active: "on", version: v }, adminId), bad).toMatchObject({ ok: false, fieldErrors: { price: expect.any(Array) } });
    expect(await updatePackage(db, p.id, { name: "Mail me@x.com", price: "45", active: "on", version: v }, adminId)).toMatchObject({ ok: false });
    const r = await updatePackage(db, p.id, { name: "Three classes", price: "42,50", active: null, version: v }, adminId);
    expect(r).toMatchObject({ ok: true });
    expect(await db.package.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ name: "Three classes", priceCents: 4250, active: false, credits: 3, validDays: 30 });
    expect((await getActivePackages(db)).some((x) => x.id === p.id)).toBe(false); // inactive: not offered
    expect(await updatePackage(db, p.id, { name: "Three classes", price: "42.50", active: "on", version: v }, adminId)).toMatchObject({ ok: false, message: expect.stringContaining("changed by someone else") });
    expect(await updatePackage(db, "nope", { name: "Three classes", price: "42", active: "on", version: "" }, adminId)).toMatchObject({ ok: false });
    expect((await db.adminAuditLog.findFirstOrThrow({ where: { entityId: p.id, action: "package.update" } })).summary).toBe('Edited package "Three classes": name, price, set Inactive');
    await db.package.update({ where: { id: p.id }, data: { active: false } }); // keep test data inactive (nothing deleted)
  }, 60_000);

  it("library seed: 10 photos, second run creates nothing, rows hold the real alt texts", async () => {
    const measure = async () => ({ width: 800, height: 600, bytes: 12345 });
    const first = await seedLibraryPhotos(db, measure);
    expect(first.created + first.unchanged).toBe(10);
    const second = await seedLibraryPhotos(db, measure);
    expect(second).toEqual({ created: 0, unchanged: 10 });
    for (const p of libraryPhotos()) expect((await db.mediaImage.findUniqueOrThrow({ where: { url: `/real/${p.file}` } })).alt).toBe(p.alt);
  }, 60_000);
});
