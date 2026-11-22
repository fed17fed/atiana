import { afterAll, describe, expect, it } from "vitest";
import { countOfferings, createOffering, listOfferings, OFFERINGS_PAGE_SIZE, setOfferingPublished, updateOffering } from "@/lib/admin/offerings-service";
import { eventSlugExists } from "@/lib/offerings-lookup";
import { readPublicOfferings } from "@/lib/offerings-read";
import { seedAction } from "@/lib/seed-offerings";
import { events as codeEvents } from "@/content/events";
import { dbTestsOn, getDb, newSession, testUser, unique } from "./helpers";

// Local test database only (see helpers.ts). Nothing is deleted: test rows stay (hidden at the end), with unique names.
describe.skipIf(!dbTestsOn)("offerings admin (DB): create, edit, hide, restore, public read (task 12.8)", () => {
  const made: string[] = [];
  afterAll(async () => {
    const db = await getDb();
    await db.offering.updateMany({ where: { id: { in: made } }, data: { published: false } }); // hide again, nothing deleted
    await db.$disconnect();
  });

  const form = (slug: string, extra: Record<string, unknown> = {}) => ({
    type: "EVENT",
    slug,
    title: "ZZ test event",
    summary: "A test event.",
    body: "## What you need\n\n- Join {{JOIN_EARLY_MINUTES}} minutes before the start.",
    eventPricing: "PAID",
    price: "25",
    mode: "ONLINE",
    minutes: "60",
    lengthLabel: "60 min",
    published: "on",
    ...extra,
  });

  it("an event made in the admin: saved, priced, audited, reachable (slug check) and listed by the public read", async () => {
    const db = await getDb();
    const admin = await testUser(db, 920);
    const slug = unique("zz-dbtest-offer");
    const auditBefore = await db.adminAuditLog.count({ where: { action: "offering.create" } });

    const r = await createOffering(db, form(slug), admin.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    made.push(r.id);
    const row = await db.offering.findUniqueOrThrow({ where: { id: r.id }, include: { priceOptions: true } });
    expect(row).toMatchObject({ type: "EVENT", slug, published: true, eventPricing: "PAID", minutes: 60, lengthLabel: "60 min" });
    expect(row.adminEditedAt).not.toBeNull(); // seeds skip it
    expect(row.body).toContain("{{JOIN_EARLY_MINUTES}}"); // saved as a token
    expect(row.priceOptions.map((p) => [p.name, p.amountCents])).toEqual([["Ticket", 2500]]);
    expect(await db.adminAuditLog.count({ where: { action: "offering.create" } })).toBe(auditBefore + 1);
    const log = await db.adminAuditLog.findFirstOrThrow({ where: { entityId: r.id, action: "offering.create" } });
    expect(log.userId).toBe(admin.id);
    expect(log.summary).not.toMatch(/What you need/); // no text in the log

    // reachable: the proxy slug check says yes, the public read has it (no date yet = no session)
    const codeSlugs = codeEvents.map((e) => e.slug);
    expect(await eventSlugExists(db, slug, codeSlugs)).toBe(true);
    expect(await eventSlugExists(db, `${slug}-nope`, codeSlugs)).toBe(false);
    const pub = await readPublicOfferings(db);
    expect(pub.source.events).toBe("db");
    const ev = pub.events.find((e) => e.slug === slug);
    expect(ev).toMatchObject({ title: "ZZ test event", pricing: "PAID", priceCents: 2500, session: null, image: null });
    expect(ev?.body).not.toContain("{{"); // token filled for the visitor

    // a session added later (12.9) shows up as the event date
    const session = await newSession(db, r.id, 8);
    const again = (await readPublicOfferings(db)).events.find((e) => e.slug === slug);
    expect(again?.session?.startsAt).toBe(session.startsAt.toISOString());
  });

  it("same URL name twice is refused; 1:1 cannot be created; a bad text is refused and nothing is written", async () => {
    const db = await getDb();
    const admin = await testUser(db, 920);
    const slug = unique("zz-dbtest-offer");
    const a = await createOffering(db, form(slug), admin.id);
    expect(a.ok).toBe(true);
    if (a.ok) made.push(a.id);
    const count = await db.offering.count();
    const dup = await createOffering(db, form(slug), admin.id);
    expect(dup.ok).toBe(false);
    expect(!dup.ok && dup.fieldErrors?.slug?.[0]).toContain("already used");
    const oto = await createOffering(db, form(unique("zz-dbtest-offer"), { type: "ONE_TO_ONE" }), admin.id);
    expect(oto.ok).toBe(false);
    const bad = await createOffering(db, form(unique("zz-dbtest-offer"), { body: "Cancel up to 24 hours before. Mail me@example.com" }), admin.id);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && Object.keys(bad.fieldErrors ?? {})).toContain("body");
    expect(await db.offering.count()).toBe(count);
  });

  it("image: only from the library (or the one it already has); it shows in the public read with its alt text", async () => {
    const db = await getDb();
    const admin = await testUser(db, 920);
    const slug = unique("zz-dbtest-offer");
    const url = `/uploads/20261121-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}.webp`;
    const notInLibrary = await createOffering(db, form(slug, { image: url, imageAlt: "A moon" }), admin.id);
    expect(notInLibrary.ok).toBe(false);
    expect(!notInLibrary.ok && notInLibrary.fieldErrors?.image).toBeDefined();
    await db.mediaImage.create({ data: { url, alt: "Library alt", storage: "local", width: 800, height: 600, bytes: 1000, createdById: admin.id } });
    const r = await createOffering(db, form(slug, { image: url, imageAlt: "A moon over the sea" }), admin.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    made.push(r.id);
    const ev = (await readPublicOfferings(db)).events.find((e) => e.slug === slug);
    expect(ev).toMatchObject({ image: url, imageAlt: "A moon over the sea" });
    // alt text is required with an image
    const noAlt = await updateOffering(db, r.id, form(slug, { image: url, imageAlt: "" }), admin.id);
    expect(noAlt.ok).toBe(false);
    // removing the image: the event has none (the code image does not come back)
    const removed = await updateOffering(db, r.id, form(slug, { image: "", imageAlt: "" }), admin.id);
    expect(removed.ok).toBe(true);
    expect((await readPublicOfferings(db)).events.find((e) => e.slug === slug)?.image).toBeNull();
  });

  it("edit: price follows the cheapest option, version check, locked fields, audit names fields only", async () => {
    const db = await getDb();
    const admin = await testUser(db, 920);
    const slug = unique("zz-dbtest-offer");
    const r = await createOffering(db, form(slug), admin.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    made.push(r.id);
    const row = await db.offering.findUniqueOrThrow({ where: { id: r.id } });

    const stale = await updateOffering(db, r.id, { ...form(slug), version: "1" }, admin.id);
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.message).toContain("changed by someone else");

    // type and slug cannot be changed through a hand-made request
    const ok = await updateOffering(db, r.id, { ...form("other-slug", { type: "GROUP_CLASS", title: "ZZ renamed", price: "40" }), version: String(row.updatedAt.getTime()) }, admin.id);
    expect(ok.ok).toBe(true);
    const after = await db.offering.findUniqueOrThrow({ where: { id: r.id }, include: { priceOptions: true } });
    expect(after).toMatchObject({ type: "EVENT", slug, title: "ZZ renamed" });
    expect(after.priceOptions.map((p) => p.amountCents)).toEqual([4000]);
    const log = await db.adminAuditLog.findFirstOrThrow({ where: { entityId: r.id, action: "offering.update" }, orderBy: { createdAt: "desc" } });
    expect(log.summary).toContain("title");
    expect(log.summary).toContain("price");
    expect(log.summary).not.toContain("ZZ test event"); // old text is not logged

    // switching to Free keeps the old price row (nothing removed)
    const free = await updateOffering(db, r.id, form(slug, { eventPricing: "FREE", price: "" }), admin.id);
    expect(free.ok).toBe(true);
    expect((await db.priceOption.count({ where: { offeringId: r.id } }))).toBe(1);
    // not found
    expect((await updateOffering(db, "nope", form(slug), admin.id)).ok).toBe(false);
  });

  it("Hide and Restore: only the flag changes; row, price and sessions stay; seed would skip it; audit rows", async () => {
    const db = await getDb();
    const admin = await testUser(db, 920);
    const slug = unique("zz-dbtest-offer");
    const r = await createOffering(db, form(slug), admin.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    made.push(r.id);
    await newSession(db, r.id, 8);
    const counts = async () => [await db.offering.count(), await db.priceOption.count(), await db.classSession.count()];
    const before = await counts();

    const hidden = await setOfferingPublished(db, r.id, false, admin.id);
    expect(hidden.ok).toBe(true);
    expect(await counts()).toEqual(before);
    const pub = await readPublicOfferings(db);
    expect(pub.events.some((e) => e.slug === slug)).toBe(false);
    expect(await eventSlugExists(db, slug, codeEvents.map((e) => e.slug))).toBe(false); // hidden = 404
    expect((await listOfferings(db, { published: false, type: "EVENT" })).some((o) => o.id === r.id)).toBe(true); // newest first: on page 1 even when the test DB has hundreds of rows

    const restored = await setOfferingPublished(db, r.id, true, admin.id);
    expect(restored.ok).toBe(true);
    expect(await eventSlugExists(db, slug, codeEvents.map((e) => e.slug))).toBe(true);
    expect((await readPublicOfferings(db)).events.some((e) => e.slug === slug)).toBe(true);
    expect(await counts()).toEqual(before);
    const actions = (await db.adminAuditLog.findMany({ where: { entityId: r.id }, orderBy: { createdAt: "asc" }, select: { action: true } })).map((a) => a.action);
    expect(actions).toEqual(["offering.create", "offering.hide", "offering.restore"]);

    // a seed never touches an admin-edited row, not even to publish it again
    const row = await db.offering.findUniqueOrThrow({ where: { id: r.id } });
    expect(seedAction(row, { title: "Code title", published: true })).toBe("skip-edited");
  });

  it("class: free class (price 0), cheapest price option updated, 1:1 keeps its format, list filters work", async () => {
    const db = await getDb();
    const admin = await testUser(db, 920);
    const slug = unique("zz-dbtest-offer");
    const r = await createOffering(db, { type: "GROUP_CLASS", slug, title: "ZZ test class", summary: "A class.", body: "", level: "All levels", minutes: "30", price: "0", sortOrder: "500", published: "on" }, admin.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    made.push(r.id);
    const pub = await readPublicOfferings(db);
    expect(pub.classes.find((c) => c.slug === slug)).toMatchObject({ priceCents: 0, minutes: 30, level: "All levels" });
    expect(pub.classes.at(-1)?.slug).toBe(slug); // order number 500 = last
    const classes = await listOfferings(db, { type: "GROUP_CLASS" });
    expect(classes.every((o) => o.type === "GROUP_CLASS")).toBe(true);

    // a 1:1 (made directly, the admin cannot create one): editable, but its format is locked
    const oto = await db.offering.create({ data: { slug: unique("zz-dbtest-offer-oto"), type: "ONE_TO_ONE", title: "ZZ 1:1", summary: "x", mode: "ONLINE", published: true } });
    made.push(oto.id);
    const res = await updateOffering(db, oto.id, { title: "ZZ 1:1 edited", summary: "ZZ summary", body: "", minutes: "50", price: "61", mode: "IN_PERSON", location: "Dublin", published: "on" }, admin.id);
    expect(res.ok).toBe(true);
    const after = await db.offering.findUniqueOrThrow({ where: { id: oto.id }, include: { priceOptions: true } });
    expect(after).toMatchObject({ mode: "ONLINE", title: "ZZ 1:1 edited", minutes: 50, location: null });
    expect(after.priceOptions.map((p) => [p.name, p.amountCents])).toEqual([["Online 1:1", 6100]]);
  });

  it("A12-1: paging shows every row once (no 300 cut); a new hidden event is on page 1 of the Hidden filter", async () => {
    const db = await getDb();
    const admin = await testUser(db, 920);
    const slug = unique("zz-dbtest-offer-page");
    const r = await createOffering(db, form(slug), admin.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    made.push(r.id);
    expect((await setOfferingPublished(db, r.id, false, admin.id)).ok).toBe(true);
    const hiddenEvents = { type: "EVENT" as const, published: false };
    expect((await listOfferings(db, { ...hiddenEvents, page: 1 })).some((o) => o.id === r.id)).toBe(true);
    const total = await countOfferings(db, hiddenEvents);
    const seen: string[] = [];
    for (let p = 1; p <= Math.ceil(total / OFFERINGS_PAGE_SIZE); p++) {
      const rows = await listOfferings(db, { ...hiddenEvents, page: p });
      expect(rows.length).toBeLessThanOrEqual(OFFERINGS_PAGE_SIZE);
      seen.push(...rows.map((o) => o.id));
    }
    expect(seen.length).toBe(total);
    expect(new Set(seen).size).toBe(total); // pages never overlap
    expect(await listOfferings(db, { ...hiddenEvents, page: Math.ceil(total / OFFERINGS_PAGE_SIZE) + 1 })).toEqual([]);
    expect(await countOfferings(db)).toBeGreaterThanOrEqual(total);
  }, 60_000);
});
