import { afterAll, describe, expect, it } from "vitest";
import { ensureBaseVersion, listLegalOverview, loadLegalState, publishLegalDraft, readPublishedLegalDoc, restoreLawyerApproved, saveLegalDraft } from "@/lib/admin/legal-service";
import { legalSlugs, loadLegalDoc } from "@/lib/legal";
import { dbTestsOn, getDb, testUser } from "./helpers";

// Local test database only (see helpers.ts). Nothing is deleted: versions only grow. The flow uses the real page "cookies" and ALWAYS ends with
// "Restore lawyer-approved version", so the public text is the lawyer-approved text again when the test ends.
const SLUG = "cookies";

describe.skipIf(!dbTestsOn)("legal editor (DB, task 12.13)", () => {
  afterAll(async () => {
    (await getDb()).$disconnect();
  });

  it("import: version 1 for all 5 pages is created once; the PUBLIC text from the database is identical to the .mdx file", async () => {
    const db = await getDb();
    for (const slug of legalSlugs) await ensureBaseVersion(db, slug);
    const before = await db.legalVersion.count({ where: { slug: { in: [...legalSlugs] } } });
    for (const slug of legalSlugs) expect(await ensureBaseVersion(db, slug), `${slug} second run`).toBe(false); // idempotent: 0 changes
    expect(await db.legalVersion.count({ where: { slug: { in: [...legalSlugs] } } })).toBe(before);
    // two parallel imports of an existing page still create nothing
    expect(await Promise.all([ensureBaseVersion(db, "terms"), ensureBaseVersion(db, "terms")])).toEqual([false, false]);

    for (const slug of legalSlugs) {
      const v1 = await db.legalVersion.findUniqueOrThrow({ where: { slug_version: { slug, version: 1 } } });
      expect(v1).toMatchObject({ status: "PUBLISHED", lawyerApproved: true });
      expect(v1.approvedAt?.toISOString().slice(0, 10)).toBe("2026-11-19");
      const file = (await loadLegalDoc(slug))!;
      const fromDb = (await readPublishedLegalDoc(db, slug))!;
      // identical visible text: title, version date (bottom of the page) and body (tokens filled)
      expect({ title: fromDb.title, updated: fromDb.updated, body: fromDb.body }, slug).toEqual({ title: file.title, updated: file.updated, body: file.body.trim() });
    }
    // the rule numbers are tokens in the stored text
    const bc = await db.legalVersion.findUniqueOrThrow({ where: { slug_version: { slug: "booking-cancellation", version: 1 } } });
    expect(bc.body.match(/\{\{CANCELLATION_HOURS\}\}/g)).toHaveLength(5);
    expect(bc.body).toContain("{{HOLD_MINUTES}} minutes");
  });

  it("a bad published row (unknown token, or empty text) is never shown: the public read says null = use the file; Restore repairs it", async () => {
    const db = await getDb();
    const admin = await testUser(db, 930);
    const slug = "health-disclaimer";
    await ensureBaseVersion(db, slug);
    const file = (await loadLegalDoc(slug))!;
    const max = (await db.legalVersion.findFirstOrThrow({ where: { slug }, orderBy: { version: "desc" } })).version;
    await db.legalVersion.create({ data: { slug, version: max + 1, title: "T", body: "Hello {{NOPE}}", status: "PUBLISHED", publishedAt: new Date() } });
    expect(await readPublishedLegalDoc(db, slug)).toBeNull();
    await db.legalVersion.create({ data: { slug, version: max + 2, title: "T", body: "   ", status: "PUBLISHED", publishedAt: new Date() } });
    expect(await readPublishedLegalDoc(db, slug)).toBeNull();
    expect(await readPublishedLegalDoc(db, "nope")).toBeNull();
    expect(await restoreLawyerApproved(db, slug, admin.id)).toMatchObject({ ok: true });
    expect((await readPublishedLegalDoc(db, slug))!.body).toBe(file.body.trim());
  });

  it("draft -> publish -> restore: drafts are private, checks and stale guards work on the server, every version is kept", async () => {
    const db = await getDb();
    const admin = await testUser(db, 930);
    await ensureBaseVersion(db, SLUG);
    const start = (await loadLegalState(db, SLUG))!;
    // start from a clean state: the lawyer text is the newest version (restore if an earlier run left something)
    await restoreLawyerApproved(db, SLUG, admin.id);
    const s0 = (await loadLegalState(db, SLUG))!;
    expect(s0.published?.lawyerApproved).toBe(true);
    expect(s0.draft).toBeNull();
    const v0 = s0.maxVersion;
    const approvedBody = s0.approved!.body;
    const publicBefore = (await readPublishedLegalDoc(db, SLUG))!;
    const counts = async () => db.legalVersion.count({ where: { slug: SLUG } });
    const c0 = await counts();
    expect(c0).toBeGreaterThanOrEqual(start.versions.length);

    // server checks
    expect(await saveLegalDraft(db, { key: "nope", value: "x", version: String(v0) }, admin.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await saveLegalDraft(db, { key: SLUG, value: approvedBody + "\n\nCancel up to 24 hours before.", version: String(v0) }, admin.id)).toMatchObject({ ok: false, code: "INVALID" });
    expect(await saveLegalDraft(db, { key: SLUG, value: approvedBody + "\n\n{{NOPE}}", version: String(v0) }, admin.id)).toMatchObject({ ok: false, code: "INVALID" });
    expect(await saveLegalDraft(db, { key: SLUG, value: approvedBody, version: String(v0) }, admin.id)).toMatchObject({ ok: false, code: "NO_CHANGE" });
    expect(await saveLegalDraft(db, { key: SLUG, value: approvedBody + "\n\nTest sentence.", version: String(v0 - 1) }, admin.id)).toMatchObject({ ok: false, code: "STALE" });
    expect(await saveLegalDraft(db, { key: SLUG, value: approvedBody + "\n\nTest sentence." }, admin.id)).toMatchObject({ ok: false, code: "STALE" }); // no version in the form
    expect(await counts()).toBe(c0); // nothing was written by the refused saves

    // two tabs save at the same time with the same form version: exactly one wins
    const draftText = approvedBody + "\n\nTest sentence one.";
    const pair = await Promise.all([
      saveLegalDraft(db, { key: SLUG, value: draftText, note: "tab 1", version: String(v0) }, admin.id),
      saveLegalDraft(db, { key: SLUG, value: draftText + " More.", note: "tab 2", version: String(v0) }, admin.id),
    ]);
    expect(pair.filter((r) => r.ok)).toHaveLength(1);
    expect(pair.filter((r) => !r.ok && r.code === "STALE")).toHaveLength(1);
    expect(await counts()).toBe(c0 + 1);

    // the draft is NOT public
    const s1 = (await loadLegalState(db, SLUG))!;
    expect(s1.draft?.version).toBe(v0 + 1);
    expect(s1.draft?.lawyerApproved).toBe(false);
    expect((await readPublishedLegalDoc(db, SLUG))!.body).toBe(publicBefore.body);
    expect((await listLegalOverview(db)).find((r) => r.slug === SLUG)).toMatchObject({ approved: true, draftWaiting: true });
    // the audit row has the page and the version, never the text
    const audit = await db.adminAuditLog.findFirstOrThrow({ where: { action: "legal.saveDraft", entityId: `${SLUG}#${v0 + 1}` } });
    expect(audit.summary).toBe(`Saved a draft of ${SLUG} (version ${v0 + 1})`);
    expect(audit.summary).not.toMatch(/Test sentence/);

    // a second draft is a NEW row (the first stays)
    const second = await saveLegalDraft(db, { key: SLUG, value: draftText + "\n\nSecond.", version: String(v0 + 1) }, admin.id);
    expect(second).toMatchObject({ ok: true, version: String(v0 + 2) });
    expect(await counts()).toBe(c0 + 2);

    // publish: the tick box is checked on the server; wrong version refused
    const now = new Date("2026-12-05T10:00:00Z");
    expect(await publishLegalDraft(db, { slug: SLUG, version: String(v0 + 2), confirm: undefined }, admin.id, now)).toMatchObject({ ok: false, code: "NEEDS_CONFIRM" });
    expect(await publishLegalDraft(db, { slug: SLUG, version: String(v0 + 2), confirm: "on" }, admin.id, now)).toMatchObject({ ok: false, code: "NEEDS_CONFIRM" });
    expect(await publishLegalDraft(db, { slug: SLUG, version: String(v0 + 1), confirm: "yes" }, admin.id, now)).toMatchObject({ ok: false, code: "STALE" }); // an older draft cannot be published
    expect((await readPublishedLegalDoc(db, SLUG))!.body).toBe(publicBefore.body);
    // two parallel publishes: exactly one
    const pub = await Promise.all([publishLegalDraft(db, { slug: SLUG, version: String(v0 + 2), confirm: "yes" }, admin.id, now), publishLegalDraft(db, { slug: SLUG, version: String(v0 + 2), confirm: "yes" }, admin.id, now)]);
    expect(pub.filter((r) => r.ok)).toHaveLength(1);

    const pubDoc = (await readPublishedLegalDoc(db, SLUG))!;
    expect(pubDoc.body).toContain("Second.");
    expect(pubDoc.body).toContain("Last updated: 5 December 2026."); // set automatically on publish
    expect(pubDoc.updated).toBe("2026-12-05");
    const s2 = (await loadLegalState(db, SLUG))!;
    expect(s2.published).toMatchObject({ version: v0 + 2, lawyerApproved: false, approvedAt: null });
    expect(s2.approved?.version).toBe(s0.approved!.version);
    expect((await listLegalOverview(db)).find((r) => r.slug === SLUG)).toMatchObject({ approved: false, draftWaiting: false }); // badge: Changed after lawyer approval
    expect(await db.adminAuditLog.count({ where: { action: "legal.publish", entityId: `${SLUG}#${v0 + 2}` } })).toBe(1);

    // restore the lawyer-approved version: a NEW published version with the approved text
    const restored = await restoreLawyerApproved(db, SLUG, admin.id);
    expect(restored).toMatchObject({ ok: true, version: String(v0 + 3) });
    const after = (await readPublishedLegalDoc(db, SLUG))!;
    expect(after).toEqual(publicBefore); // the very same public text as before the test
    expect(await restoreLawyerApproved(db, SLUG, admin.id)).toMatchObject({ ok: false, code: "NO_CHANGE" });
    expect((await listLegalOverview(db)).find((r) => r.slug === SLUG)).toMatchObject({ approved: true });

    // all versions are still there (0 rows deleted): 1 import + drafts + publish + restores
    const rows = await db.legalVersion.findMany({ where: { slug: SLUG }, orderBy: { version: "asc" }, select: { version: true, status: true, body: true } });
    expect(rows.length).toBe(c0 + 3);
    expect(rows.find((r) => r.version === v0 + 1)).toMatchObject({ status: "DRAFT" }); // the first draft is still there
    expect(rows.find((r) => r.version === v0 + 1)!.body).toContain("Test sentence one.");

    // a waiting draft and then Restore: the restore is the newest and public; the draft stays in the history
    const d = await saveLegalDraft(db, { key: SLUG, value: approvedBody + "\n\nAnother draft.", version: String(v0 + 3) }, admin.id);
    expect(d).toMatchObject({ ok: true });
    expect(await publishLegalDraft(db, { slug: SLUG, version: String(v0 + 4), confirm: "yes" }, admin.id, now)).toMatchObject({ ok: true });
    expect(await saveLegalDraft(db, { key: SLUG, value: approvedBody, version: String(v0 + 4) }, admin.id)).toMatchObject({ ok: true }); // draft equal to the approved text
    expect(await publishLegalDraft(db, { slug: SLUG, version: String(v0 + 5), confirm: "yes" }, admin.id, now)).toMatchObject({ ok: false, code: "NO_CHANGE" }); // nothing to publish
    expect(await restoreLawyerApproved(db, SLUG, admin.id)).toMatchObject({ ok: true, version: String(v0 + 6) });
    const end = (await loadLegalState(db, SLUG))!;
    expect(end.draft).toBeNull();
    expect(end.published).toMatchObject({ version: v0 + 6, lawyerApproved: true });
    expect(await readPublishedLegalDoc(db, SLUG)).toEqual(publicBefore);
  });
});
