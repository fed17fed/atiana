import { afterAll, describe, expect, it } from "vitest";
import { dbTestsOn, getDb } from "./helpers";

// Local test database only (see helpers.ts). Nothing is deleted: the test key is updated, never removed.
describe.skipIf(!dbTestsOn)("Phase 12 tables (DB, task 12.4/12.5)", () => {
  afterAll(async () => {
    (await getDb()).$disconnect();
  });
  it("ContentBlock: unique key, kind default TEXT, readable like the cached loader reads it", async () => {
    const db = await getDb();
    const key = "zz.dbtest.text";
    const value = `Cancel up to {{CANCELLATION_HOURS}} hours (${Date.now()})`;
    await db.contentBlock.upsert({ where: { key }, create: { key, value }, update: { value } });
    const rows = await db.contentBlock.findMany({ select: { key: true, value: true } });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(map[key]).toBe(value);
    expect((await db.contentBlock.findUniqueOrThrow({ where: { key } })).kind).toBe("TEXT");
    await expect(db.contentBlock.create({ data: { key, value: "dup" } })).rejects.toThrow();
  });
  it("ContentRevision and LegalVersion accept rows; LegalVersion (slug, version) is unique", async () => {
    const db = await getDb();
    await db.contentRevision.create({ data: { key: "zz.dbtest.text", value: "v", note: "db test" } });
    expect(await db.contentRevision.count({ where: { key: "zz.dbtest.text" } })).toBeGreaterThan(0);
    const slug = "zz-dbtest-legal";
    await db.legalVersion.upsert({
      where: { slug_version: { slug, version: 1 } },
      create: { slug, version: 1, title: "T", body: "B" },
      update: {},
    });
    const lv = await db.legalVersion.findUniqueOrThrow({ where: { slug_version: { slug, version: 1 } } });
    expect(lv).toMatchObject({ status: "DRAFT", lawyerApproved: false, approvedAt: null, note: "" });
    await expect(db.legalVersion.create({ data: { slug, version: 1, title: "T2", body: "B2" } })).rejects.toThrow();
  });
  it("old rows keep valid defaults in the new Offering and Testimonial columns", async () => {
    const db = await getDb();
    const o = await db.offering.findFirstOrThrow({ select: { sortOrder: true, adminEditedAt: true, imageAlt: true, minutes: true } });
    expect(o.sortOrder).toBe(0);
    expect(o.adminEditedAt).toBeNull();
    const slug = "zz-dbtest-testimonial";
    const existing = await db.testimonial.findFirst({ where: { name: slug } });
    const t = existing ?? (await db.testimonial.create({ data: { name: slug, text: "ok" } }));
    expect(t).toMatchObject({ isDemo: false, sortOrder: 0, place: null });
    expect(t.updatedAt).toBeInstanceOf(Date);
  });
});
