import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { createTestimonial, setTestimonialPublished, updateTestimonial } from "@/lib/admin/testimonials-service";
import { listBookings, listMessages, listOrders, listReferrals, listSubscribers, exportSubscribers, PAGE_SIZE } from "@/lib/admin/read-queries";
import { uploadImage } from "@/lib/images/service";
import { dbTestsOn, getDb, newSession, testOffering, testUser, unique } from "./helpers";

// Local test database only (see helpers.ts). Nothing is deleted: test rows stay, with unique names.
describe.skipIf(!dbTestsOn)("testimonials, images and read views (DB)", () => {
  afterAll(async () => {
    (await getDb()).$disconnect();
  });

  const base = { text: "Calm and kind.", sortOrder: "5", published: "on" };

  it("testimonials: create, consent rule, version check, hide/show, audit, no row is ever removed", async () => {
    const db = await getDb();
    const admin = await testUser(db, 910);
    const before = await db.testimonial.count();
    const name = unique("T");

    // new real review without the confirmation: refused, nothing written
    const refused = await createTestimonial(db, { ...base, name, isDemo: null }, admin.id);
    expect(refused.ok).toBe(false);
    expect(await db.testimonial.count()).toBe(before);

    // new demo review
    const created = await createTestimonial(db, { ...base, name, place: "Cork", isDemo: "on" }, admin.id);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const id = created.id;
    const row = await db.testimonial.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ name, place: "Cork", isDemo: true, published: true, sortOrder: 5 });

    // demo -> real needs the confirmation (server side, even if the form is bypassed)
    const noConsent = await updateTestimonial(db, id, { ...base, name, isDemo: null }, admin.id);
    expect(noConsent.ok).toBe(false);
    expect((await db.testimonial.findUniqueOrThrow({ where: { id } })).isDemo).toBe(true);

    // stale form (someone else saved): refused
    const stale = await updateTestimonial(db, id, { ...base, name, isDemo: "on", version: "1" }, admin.id);
    expect(stale.ok).toBe(false);

    const real = await updateTestimonial(db, id, { ...base, name, isDemo: null, clientAgreed: "on", version: String(row.updatedAt.getTime()) }, admin.id);
    expect(real.ok).toBe(true);
    expect((await db.testimonial.findUniqueOrThrow({ where: { id } })).isDemo).toBe(false);

    // already real: a later edit needs no new confirmation
    expect((await updateTestimonial(db, id, { ...base, name, text: "Calm.", isDemo: null }, admin.id)).ok).toBe(true);

    // hide / show
    expect((await setTestimonialPublished(db, id, false, admin.id)).ok).toBe(true);
    expect((await db.testimonial.findUniqueOrThrow({ where: { id } })).published).toBe(false);
    expect((await setTestimonialPublished(db, id, true, admin.id)).ok).toBe(true);
    expect((await setTestimonialPublished(db, "no-such-id", true, admin.id)).ok).toBe(false);

    // audit: create, update (x3 with 1 real label change), hide, show
    const log = await db.adminAuditLog.findMany({ where: { entity: "Testimonial", entityId: id }, orderBy: { createdAt: "asc" } });
    expect(log.map((l) => l.action).sort()).toEqual(["testimonial.create", "testimonial.hide", "testimonial.show", "testimonial.update", "testimonial.update"]);
    expect(log.some((l) => /Demo label removed/.test(l.summary))).toBe(true);
    expect(log.every((l) => l.userId === admin.id && !l.summary.includes(name))).toBe(true);
    expect(await db.testimonial.count()).toBe(before + 1); // only one row added, none removed
  });

  it("a Prisma null for place (cleared field) is saved as no place", async () => {
    const db = await getDb();
    const admin = await testUser(db, 910);
    const r = await createTestimonial(db, { ...base, name: unique("N"), place: null, isDemo: "on" }, admin.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect((await db.testimonial.findUniqueOrThrow({ where: { id: r.id } })).place).toBeNull();
  });

  it("image upload (local folder): file + library row + audit; refuses bad input", async () => {
    const db = await getDb();
    const admin = await testUser(db, 910);
    const env = { LOCAL_UPLOAD_DIR: mkdtempSync(join(tmpdir(), "atiana-dbup-")) };
    const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#393" } }).png().toBuffer();
    const alt = unique("Green box");
    const r = await uploadImage(db, { size: bytes.length, bytes }, alt, admin.id, env);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.image.url).toMatch(/^\/uploads\/[0-9]{8}-[0-9a-f]{12}\.webp$/);
    expect(await db.mediaImage.findUniqueOrThrow({ where: { id: r.image.id } })).toMatchObject({ alt, storage: "local", width: 64, height: 32, createdById: admin.id });
    expect(readdirSync(env.LOCAL_UPLOAD_DIR)).toHaveLength(1);
    expect(await db.adminAuditLog.count({ where: { entity: "MediaImage", entityId: r.image.id, action: "image.upload" } })).toBe(1);
    const count = await db.mediaImage.count();
    expect((await uploadImage(db, { size: bytes.length, bytes }, "", admin.id, env)).ok).toBe(false);
    expect((await uploadImage(db, { size: bytes.length, bytes }, "x", admin.id, { VERCEL: "1" })).ok).toBe(false);
    expect(await db.mediaImage.count()).toBe(count);
    expect(readdirSync(env.LOCAL_UPLOAD_DIR)).toHaveLength(1);
  });

  it("read views: search by email (case-insensitive, wildcards are literal), paging, newest first", async () => {
    const db = await getDb();
    const tag = unique("rv").toLowerCase();
    const mk = (email: string) => db.newsletterSubscriber.create({ data: { email, status: "ACTIVE", source: "dbtest", consentAt: new Date() } });
    await mk(`${tag}_a@atiana.test`);
    await mk(`${tag}xa@atiana.test`); // "_" must NOT match "x"
    await mk(`=${tag}@atiana.test`);
    const one = await listSubscribers(db, { q: `${tag}_a`.toUpperCase(), page: 1 });
    expect(one.total).toBe(1);
    expect(one.rows[0].email).toBe(`${tag}_a@atiana.test`);
    expect((await listSubscribers(db, { q: `${tag}%`, page: 1 })).total).toBe(0);
    expect((await listSubscribers(db, { q: tag, page: 1 })).total).toBe(3);
    expect((await listSubscribers(db, { q: "no-such-person@nowhere.test", page: 1 })).total).toBe(0);
    const ex = await exportSubscribers(db, tag);
    expect(ex).toHaveLength(3);
    expect(Object.keys(ex[0]).sort()).toEqual(["consentAt", "createdAt", "email", "source", "status"]); // no token column
    const all = await listSubscribers(db, { q: null, page: 1 });
    expect(all.rows.length).toBeLessThanOrEqual(PAGE_SIZE);
    const times = all.rows.map((r) => r.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect((await listSubscribers(db, { q: null, page: 9999 })).rows).toHaveLength(0);
  });

  it("read views: bookings, orders, messages, referrals are found by email", async () => {
    const db = await getDb();
    const tag = unique("rv2").toLowerCase();
    const u = await db.user.create({ data: { email: `${tag}@atiana.test`, name: "RV Client" } });
    const u2 = await db.user.create({ data: { email: `${tag}-friend@atiana.test` } });
    const o = await testOffering(db, "GROUP_CLASS");
    const sess = await newSession(db, o.id, 5);
    await db.booking.create({ data: { userId: u.id, sessionId: sess.id, status: "CONFIRMED", paidWith: "FREE" } });
    await db.order.create({ data: { email: `${tag}@atiana.test`, status: "PAID", totalCents: 1500, subtotalCents: 1500, items: { create: [{ type: "CLASS", description: "Test class", unitPriceCents: 1500, totalCents: 1500 }] } } });
    await db.contactMessage.create({ data: { name: "RV", email: `${tag}@atiana.test`, message: "Hello\n<b>x</b>" } });
    await db.referral.create({ data: { referrerId: u.id, referredUserId: u2.id } });

    const b = await listBookings(db, { q: tag.toUpperCase(), page: 1 });
    expect(b.total).toBe(1);
    expect(b.rows[0]).toMatchObject({ status: "CONFIRMED", paidWith: "FREE", user: { email: `${tag}@atiana.test` } });
    expect(b.rows[0].session.offering.title).toBeTruthy();
    const ord = await listOrders(db, { q: tag, page: 1 });
    expect(ord.total).toBe(1);
    expect(ord.rows[0].items[0].description).toBe("Test class");
    expect((await listMessages(db, { q: tag, page: 1 })).rows[0].message).toBe("Hello\n<b>x</b>");
    expect((await listReferrals(db, { q: `${tag}-friend`, page: 1 })).total).toBe(1); // by the invited person
    expect((await listReferrals(db, { q: `${tag}@`, page: 1 })).total).toBe(1); // by the inviter
    expect((await listBookings(db, { q: "nobody-here@x.test", page: 1 })).total).toBe(0);
  });
});
