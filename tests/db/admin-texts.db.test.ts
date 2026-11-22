import { afterAll, describe, expect, it } from "vitest";
import { bookingsToCsv } from "@/lib/admin/bookings-csv";
import { markMessageRead } from "@/lib/admin/messages-service";
import { exportBookings, listMessages } from "@/lib/admin/read-queries";
import { getTextEntry } from "@/lib/admin/text-registry";
import { listRevisions, loadBlocks, resetText, restoreText, saveText, versionOf } from "@/lib/admin/text-service";
import { resolveText } from "@/lib/site-text";
import { dbTestsOn, getDb, newSession, testOffering, testUser, unique } from "./helpers";

// Local test database only (see helpers.ts). Nothing is deleted. The tests use the real text key
// "home.next.hint" (a plain text); they always end with "Back to default", so the site text is the default again.
const KEY = "home.next.hint";
describe.skipIf(!dbTestsOn)("text editor, messages read flag, bookings CSV (DB, task 12.7)", () => {
  afterAll(async () => {
    (await getDb()).$disconnect();
  });

  const entry = getTextEntry(KEY)!;
  const current = async () => {
    const db = await getDb();
    return versionOf(await db.contentBlock.findUnique({ where: { key: KEY }, select: { updatedAt: true } }));
  };

  it("save -> revision + audit; stale form refused; checks run on the server; restore and back to default are NEW revisions; 0 rows deleted", async () => {
    const db = await getDb();
    const admin = await testUser(db, 920);
    const counts = async () => ({ block: await db.contentBlock.count(), rev: await db.contentRevision.count({ where: { key: KEY } }), audit: await db.adminAuditLog.count({ where: { entity: "ContentBlock", entityId: KEY } }) });

    // start clean for this key: follow the default (a no-op if it is already default)
    await resetText(db, KEY, admin.id);
    const start = await counts();
    const keyHad = await db.contentBlock.count({ where: { key: KEY } });
    const v0 = await current();

    // invalid values: refused, nothing written
    for (const bad of ["", "   ", "Cancel up to 24 hours before", "Use {{NOPE}}", "Join zoom.us/j/1", "mail me a@b.com", "a\nb"]) {
      const r = await saveText(db, { key: KEY, value: bad, version: v0 }, admin.id);
      expect(r.ok, bad).toBe(false);
    }
    expect(await counts()).toEqual(start);

    // unknown key and missing version are refused
    expect((await saveText(db, { key: "no.such.key", value: "x", version: "0" }, admin.id)).ok).toBe(false);
    expect((await saveText(db, { key: KEY, value: "x" }, admin.id)).ok).toBe(false);

    // good save with a rule token
    const t1 = unique("Hint {{CANCELLATION_HOURS}}");
    const r1 = await saveText(db, { key: KEY, value: t1, note: "first", version: v0 }, admin.id);
    expect(r1.ok).toBe(true);
    let c = await counts();
    expect(c).toEqual({ block: start.block + (keyHad === 0 ? 1 : 0), rev: start.rev + 1, audit: start.audit + 1 });
    const row1 = await db.contentBlock.findUniqueOrThrow({ where: { key: KEY } });
    expect(row1).toMatchObject({ value: t1, kind: "TEXT", updatedById: admin.id });
    // what the site would show: token filled
    expect(resolveText(row1.value, entry.defaultText)).toMatch(/^Hint 24-/);
    const audit = await db.adminAuditLog.findFirstOrThrow({ where: { entity: "ContentBlock", entityId: KEY, action: "text.update" }, orderBy: { createdAt: "desc" } });
    expect(audit.summary).toBe(`Edited the text ${KEY}`);
    expect(audit.summary).not.toContain(t1);

    // same text again: no change, no revision
    const same = await saveText(db, { key: KEY, value: t1, version: String(row1.updatedAt.getTime()) }, admin.id);
    expect(same).toMatchObject({ ok: false, code: "NO_CHANGE" });

    // stale form: the second tab still holds v0
    const stale = await saveText(db, { key: KEY, value: unique("Other"), version: v0 }, admin.id);
    expect(stale).toMatchObject({ ok: false, code: "STALE" });
    expect((await db.contentBlock.findUniqueOrThrow({ where: { key: KEY } })).value).toBe(t1);

    // two saves with the same version at the same time: exactly one wins
    const v1 = String(row1.updatedAt.getTime());
    const race = await Promise.all([saveText(db, { key: KEY, value: unique("A"), version: v1 }, admin.id), saveText(db, { key: KEY, value: unique("B"), version: v1 }, admin.id)]);
    expect(race.filter((r) => r.ok)).toHaveLength(1);
    expect(race.filter((r) => !r.ok && r.code === "STALE")).toHaveLength(1);

    // history: newest first, restore the first saved text as a NEW version
    const revs = await listRevisions(db, KEY);
    expect(revs.length).toBeGreaterThanOrEqual(start.rev + 2);
    const old = revs.find((r) => r.value === t1)!;
    const before = await counts();
    const restored = await restoreText(db, KEY, old.id, admin.id);
    expect(restored.ok).toBe(true);
    c = await counts();
    expect(c.rev).toBe(before.rev + 1);
    expect((await db.contentBlock.findUniqueOrThrow({ where: { key: KEY } })).value).toBe(t1);
    expect((await db.contentRevision.findUniqueOrThrow({ where: { id: old.id } })).value).toBe(t1); // the old row is untouched
    // a revision of another key cannot be restored here
    const other = await db.contentRevision.create({ data: { key: "zz.dbtest.other", value: "x" } });
    expect(await restoreText(db, KEY, other.id, admin.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await restoreText(db, KEY, "nope", admin.id)).toMatchObject({ ok: false });

    // back to default: block follows the code (empty value), revision keeps the default text, nothing deleted
    const preReset = await counts();
    const reset = await resetText(db, KEY, admin.id);
    expect(reset.ok).toBe(true);
    const after = await counts();
    expect(after).toEqual({ block: preReset.block, rev: preReset.rev + 1, audit: preReset.audit + 1 });
    const blocks = await loadBlocks(db);
    expect(blocks.get(KEY)?.value).toBe("");
    expect(resolveText(blocks.get(KEY)?.value, entry.defaultText)).toBe(entry.defaultText);
    const last = (await listRevisions(db, KEY))[0];
    expect(last).toMatchObject({ value: entry.defaultText, note: "Back to default" });
    // already default: nothing more is written
    expect(await resetText(db, KEY, admin.id)).toMatchObject({ ok: false, code: "NO_CHANGE" });
    expect((await counts()).rev).toBe(after.rev);

    // restore "default" works as back to default (here: no change)
    expect(await restoreText(db, KEY, "default", admin.id)).toMatchObject({ ok: false, code: "NO_CHANGE" });
  });

  it("messages: readAt starts empty, Mark as read sets it once, one audit row, no personal data in the audit", async () => {
    const db = await getDb();
    const admin = await testUser(db, 920);
    const email = `${unique("m")}@atiana.test`;
    const m = await db.contactMessage.create({ data: { name: "ZZ Reader", email, message: "Hello there" } });
    expect(m.readAt).toBeNull();
    const unreadBefore = (await listMessages(db, { q: null, page: 1 })).unread;
    const audits = () => db.adminAuditLog.count({ where: { action: "message.markRead", entityId: m.id } });

    expect(await markMessageRead(db, m.id, admin.id)).toEqual({ ok: true, changed: true });
    const row = await db.contactMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.readAt).toBeInstanceOf(Date);
    expect(row).toMatchObject({ name: "ZZ Reader", email, message: "Hello there" }); // nothing else changed
    expect((await listMessages(db, { q: null, page: 1 })).unread).toBe(unreadBefore - 1);
    expect(await audits()).toBe(1);

    // second click and a parallel pair: no change, no new audit row
    expect(await markMessageRead(db, m.id, admin.id)).toEqual({ ok: true, changed: false });
    const m2 = await db.contactMessage.create({ data: { name: "ZZ Two", email: `${unique("n")}@atiana.test`, message: "Hi" } });
    const pair = await Promise.all([markMessageRead(db, m2.id, admin.id), markMessageRead(db, m2.id, admin.id)]);
    expect(pair.filter((r) => r.ok && r.changed)).toHaveLength(1);
    expect(await db.adminAuditLog.count({ where: { action: "message.markRead", entityId: m2.id } })).toBe(1);
    expect(await audits()).toBe(1);

    const a = await db.adminAuditLog.findFirstOrThrow({ where: { action: "message.markRead", entityId: m.id } });
    expect(a.summary).not.toMatch(/ZZ Reader|Hello|@/);
    expect(await markMessageRead(db, "no-such-id", admin.id)).toMatchObject({ ok: false });
    expect(await markMessageRead(db, 5, admin.id)).toMatchObject({ ok: false });
  });

  it("bookings export: filter by email, safe cells, no Zoom link / payment ids", async () => {
    const db = await getDb();
    const user = await testUser(db, 921);
    const off = await testOffering(db, "GROUP_CLASS");
    const session = await newSession(db, off.id, 5);
    await db.classSession.update({ where: { id: session.id }, data: { zoomUrl: "https://zoom.us/j/999999999?pwd=SECRETPWD" } });
    await db.booking.create({ data: { userId: user.id, sessionId: session.id, status: "CONFIRMED", paidWith: "FREE", userKey: `${session.id}:${user.id}` } });
    const rows = await exportBookings(db, "dbtest-921");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.user.email.includes("dbtest-921"))).toBe(true);
    const csv = bookingsToCsv(rows);
    expect(csv).toContain("dbtest-921@atiana.test");
    expect(csv).not.toMatch(/zoom|SECRETPWD|pwd=/i);
    expect(Object.keys(rows[0]).sort()).toEqual(["createdAt", "paidWith", "session", "status", "user"]);
    expect((await exportBookings(db, "no-such-person-xyz")).length).toBe(0);
  });
});
