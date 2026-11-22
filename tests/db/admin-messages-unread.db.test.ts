import { afterAll, describe, expect, it } from "vitest";
import { markMessageRead, markMessageUnread } from "@/lib/admin/messages-service";
import { listMessages } from "@/lib/admin/read-queries";
import { dbTestsOn, getDb, testUser, unique } from "./helpers";

// Local test database only. A test message is created (never deleted); "Mark as unread" is a conditional update + one audit row.
describe.skipIf(!dbTestsOn)("messages: Mark as unread (DB)", () => {
  afterAll(async () => {
    (await getDb()).$disconnect();
  });

  it("read -> unread -> read; idempotent; parallel clicks change once; audit rows hold no personal data; the text never changes", async () => {
    const db = await getDb();
    const admin = await testUser(db, 931);
    const m = await db.contactMessage.create({ data: { name: "ZZ Unread", email: `${unique("u")}@atiana.test`, message: "Please call me" } });
    const audits = (action: string) => db.adminAuditLog.count({ where: { action, entityId: m.id } });

    expect(await markMessageUnread(db, m.id, admin.id)).toEqual({ ok: true, changed: false }); // already unread: nothing
    expect(await audits("message.markUnread")).toBe(0);

    expect(await markMessageRead(db, m.id, admin.id)).toEqual({ ok: true, changed: true });
    const unreadWhileRead = (await listMessages(db, { q: null, page: 1 })).unread;
    expect(await markMessageUnread(db, m.id, admin.id)).toEqual({ ok: true, changed: true });
    const row = await db.contactMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.readAt).toBeNull();
    expect(row).toMatchObject({ name: "ZZ Unread", message: "Please call me" });
    expect((await listMessages(db, { q: null, page: 1 })).unread).toBe(unreadWhileRead + 1);
    expect(await audits("message.markUnread")).toBe(1);

    // second click and two parallel clicks: no change, no new audit row
    expect(await markMessageUnread(db, m.id, admin.id)).toEqual({ ok: true, changed: false });
    await markMessageRead(db, m.id, admin.id);
    const pair = await Promise.all([markMessageUnread(db, m.id, admin.id), markMessageUnread(db, m.id, admin.id)]);
    expect(pair.filter((r) => r.ok && r.changed)).toHaveLength(1);
    expect(await audits("message.markUnread")).toBe(2);

    const a = await db.adminAuditLog.findFirstOrThrow({ where: { action: "message.markUnread", entityId: m.id } });
    expect(a.summary).not.toMatch(/ZZ Unread|call me|@/);
    expect(await markMessageUnread(db, "no-such-id", admin.id)).toMatchObject({ ok: false });
    expect(await markMessageUnread(db, 7, admin.id)).toMatchObject({ ok: false });
  });
});
