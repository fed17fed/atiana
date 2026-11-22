import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { deleteImage, uploadImage } from "@/lib/images/service";
import { dbTestsOn, getDb, testOffering, testUser, unique } from "./helpers";

// Local test database only (see helpers.ts). Image Delete (owner decision 2026-11-22): only the test's own new rows are removed.
describe.skipIf(!dbTestsOn)("image library Delete (DB)", () => {
  afterAll(async () => {
    (await getDb()).$disconnect();
  });

  it("blocked while an offering uses it; after the offering stops using it: file + row removed, audit row written; site photos are never deleted", async () => {
    const db = await getDb();
    const admin = await testUser(db, 920);
    const env = { LOCAL_UPLOAD_DIR: mkdtempSync(join(tmpdir(), "atiana-del-")) };
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#7a4" } }).png().toBuffer();
    const up = await uploadImage(db, { size: png.length, bytes: png }, unique("Alt"), admin.id, env);
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect(readdirSync(env.LOCAL_UPLOAD_DIR)).toHaveLength(1);

    const offering = await testOffering(db, "GROUP_CLASS");
    await db.offering.update({ where: { id: offering.id }, data: { image: up.image.url } });
    const blocked = await deleteImage(db, up.image.id, admin.id, env);
    expect(blocked).toMatchObject({ ok: false, reason: "in-use", usedBy: [offering.title] });
    expect(await db.mediaImage.count({ where: { id: up.image.id } })).toBe(1);
    expect(readdirSync(env.LOCAL_UPLOAD_DIR)).toHaveLength(1);

    await db.offering.update({ where: { id: offering.id }, data: { image: null } });
    expect(await deleteImage(db, up.image.id, admin.id, env)).toEqual({ ok: true });
    expect(await db.mediaImage.count({ where: { id: up.image.id } })).toBe(0);
    expect(readdirSync(env.LOCAL_UPLOAD_DIR)).toHaveLength(0);
    expect(await db.adminAuditLog.count({ where: { action: "image.delete", entityId: up.image.id, userId: admin.id } })).toBe(1);
    expect(await deleteImage(db, up.image.id, admin.id, env)).toEqual({ ok: false, reason: "missing" });

    const site = await db.mediaImage.create({ data: { url: `/real/${unique("t")}.webp`, alt: "Site", storage: "local", width: 1, height: 1, bytes: 1 } });
    expect(await deleteImage(db, site.id, admin.id, env)).toEqual({ ok: false, reason: "site-photo" });
    expect(await db.mediaImage.count({ where: { id: site.id } })).toBe(1);
  });
});
