import { afterAll, describe, expect, it } from "vitest";
import { recordAdminAction } from "@/lib/admin/audit";
import { dbTestsOn, getDb, testUser } from "./helpers";

// Local test database only (see helpers.ts). Audit rows are append-only: nothing is deleted.
describe.skipIf(!dbTestsOn)("AdminAuditLog (DB)", () => {
  afterAll(async () => {
    (await getDb()).$disconnect();
  });
  it("writes a row for a real user and reads it back", async () => {
    const db = await getDb();
    const u = await testUser(db, 901);
    const marker = `db test ${Date.now()}`;
    expect(await recordAdminAction(db, { userId: u.id, action: "test.audit", entity: "Test", entityId: "x1", summary: marker })).toBe(true);
    const row = await db.adminAuditLog.findFirstOrThrow({ where: { summary: marker } });
    expect(row).toMatchObject({ userId: u.id, action: "test.audit", entity: "Test", entityId: "x1" });
    expect(row.createdAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
  it("returns false and does not throw for an unknown user (foreign key)", async () => {
    const db = await getDb();
    const warn = console.warn;
    console.warn = () => {};
    const ok = await recordAdminAction(db, { userId: "no-such-user", action: "test.audit", entity: "Test" });
    console.warn = warn;
    expect(ok).toBe(false);
  });
});
