/** Task 12.8: the offering form rules (pure, no database). */
import { describe, expect, it } from "vitest";
import { centsToPriceInput, isAcceptableImageUrl, parseOfferingForm, parsePriceToCents, textProblems } from "@/lib/offerings-schema";

const base = { title: "Moon Flow", summary: "A calm online class.", body: "## Hello\n\nJoin {{JOIN_EARLY_MINUTES}} minutes before the start.", published: "on" };
const klass = { ...base, level: "All levels", minutes: "45", price: "12", sortOrder: "30", activationAfterMinutes: "" };
const event = { ...base, eventPricing: "PAID", mode: "ONLINE", price: "30", minutes: "60", lengthLabel: "60 min", slug: "full-moon-2027-03-22" };

const fieldErrors = (r: ReturnType<typeof parseOfferingForm>) => (r.ok ? {} : r.fieldErrors);

describe("prices", () => {
  it("parses euros", () => {
    expect(parsePriceToCents("12")).toBe(1200);
    expect(parsePriceToCents("12.5")).toBe(1250);
    expect(parsePriceToCents("12,50")).toBe(1250);
    expect(parsePriceToCents("€ 0")).toBe(0);
    expect(parsePriceToCents(" 30 ")).toBe(3000);
  });
  it("refuses junk", () => {
    for (const bad of ["", null, undefined, "abc", "-5", "12.345", "1e3", "12 EUR"]) expect(parsePriceToCents(bad)).toBeNull();
  });
  it("shows cents back in the input", () => {
    expect(centsToPriceInput(3000)).toBe("30");
    expect(centsToPriceInput(1250)).toBe("12.50");
    expect(centsToPriceInput(null)).toBe("");
  });
});

describe("class", () => {
  it("accepts a normal class (and a free one with price 0)", () => {
    const r = parseOfferingForm(klass, { type: "GROUP_CLASS", isNew: false });
    expect(r.ok && r.data).toMatchObject({ title: "Moon Flow", level: "All levels", minutes: 45, priceCents: 1200, sortOrder: 30, mode: "ONLINE", eventPricing: null, image: null, slug: null, published: true });
    const free = parseOfferingForm({ ...klass, price: "0" }, { type: "GROUP_CLASS", isNew: false });
    expect(free.ok && free.data.priceCents).toBe(0);
  });
  it("minutes and price are required; a class cannot be in person", () => {
    const r = parseOfferingForm({ ...klass, minutes: "", price: "", mode: "IN_PERSON" }, { type: "GROUP_CLASS", isNew: false });
    expect(Object.keys(fieldErrors(r)).sort()).toEqual(["minutes", "price"]);
    const ok = parseOfferingForm({ ...klass, mode: "IN_PERSON" }, { type: "GROUP_CLASS", isNew: false });
    expect(ok.ok && ok.data.mode).toBe("ONLINE");
  });
  it("greeting minutes must be smaller than the session minutes", () => {
    expect(fieldErrors(parseOfferingForm({ ...klass, activationAfterMinutes: "45" }, { type: "GROUP_CLASS", isNew: false })).activationAfterMinutes).toBeDefined();
    const ok = parseOfferingForm({ ...klass, activationAfterMinutes: "15" }, { type: "GROUP_CLASS", isNew: false });
    expect(ok.ok && ok.data.activationAfterMinutes).toBe(15);
  });
  it("a class has no image: an image sent by a hand-made request is ignored", () => {
    const r = parseOfferingForm({ ...klass, image: "/real/event-full-moon-01.webp", imageAlt: "x" }, { type: "GROUP_CLASS", isNew: false });
    expect(r.ok && r.data.image).toBeNull();
  });
});

describe("event", () => {
  it("accepts a paid event with a slug when creating", () => {
    const r = parseOfferingForm(event, { type: "EVENT", isNew: true });
    expect(r.ok && r.data).toMatchObject({ slug: "full-moon-2027-03-22", eventPricing: "PAID", priceCents: 3000, lengthLabel: "60 min", level: null, sortOrder: null });
  });
  it("free and donation events have no price; paid needs more than 0", () => {
    for (const eventPricing of ["FREE", "DONATION"]) {
      const r = parseOfferingForm({ ...event, eventPricing, price: "" }, { type: "EVENT", isNew: true });
      expect(r.ok && r.data.priceCents).toBeNull();
    }
    expect(fieldErrors(parseOfferingForm({ ...event, price: "0" }, { type: "EVENT", isNew: true })).price).toBeDefined();
    expect(fieldErrors(parseOfferingForm({ ...event, price: "" }, { type: "EVENT", isNew: true })).price).toBeDefined();
    expect(fieldErrors(parseOfferingForm({ ...event, price: "5000" }, { type: "EVENT", isNew: true })).price).toBeDefined();
  });
  it("an in-person event needs a place; an online one drops it", () => {
    expect(fieldErrors(parseOfferingForm({ ...event, mode: "IN_PERSON", location: "" }, { type: "EVENT", isNew: true })).location).toBeDefined();
    const r = parseOfferingForm({ ...event, mode: "ONLINE", location: "Somewhere" }, { type: "EVENT", isNew: true });
    expect(r.ok && r.data.location).toBeNull();
  });
  it("slug rules (only when creating)", () => {
    for (const slug of ["", "ab", "Full Moon", "full_moon", "-x-y", "x--y", "calendar.ics", "a/b", "x".repeat(61)]) {
      expect(fieldErrors(parseOfferingForm({ ...event, slug }, { type: "EVENT", isNew: true })).slug, slug).toBeDefined();
    }
    const upper = parseOfferingForm({ ...event, slug: "  Full-Moon-2027  " }, { type: "EVENT", isNew: true });
    expect(upper.ok && upper.data.slug).toBe("full-moon-2027");
    const edit = parseOfferingForm({ ...event, slug: "ignored" }, { type: "EVENT", isNew: false });
    expect(edit.ok && edit.data.slug).toBeNull();
  });
  it("image needs alt text; the address must be an upload, a shipped photo or Vercel Blob", () => {
    expect(fieldErrors(parseOfferingForm({ ...event, image: "/real/event-full-moon-01.webp", imageAlt: "" }, { type: "EVENT", isNew: true })).imageAlt).toBeDefined();
    expect(fieldErrors(parseOfferingForm({ ...event, image: "https://evil.example/x.webp", imageAlt: "x" }, { type: "EVENT", isNew: true })).image).toBeDefined();
    const ok = parseOfferingForm({ ...event, image: "/uploads/20261121-0123456789ab.webp", imageAlt: "  A  moon  " }, { type: "EVENT", isNew: true });
    expect(ok.ok && [ok.data.image, ok.data.imageAlt]).toEqual(["/uploads/20261121-0123456789ab.webp", "A moon"]);
    expect(isAcceptableImageUrl("https://abc123.public.blob.vercel-storage.com/uploads/x.webp")).toBe(true);
    expect(isAcceptableImageUrl("https://abc123.public.blob.vercel-storage.com.evil.test/x.webp")).toBe(false);
    expect(isAcceptableImageUrl("http://abc123.public.blob.vercel-storage.com/x.webp")).toBe(false);
    expect(isAcceptableImageUrl("//evil.test/x.webp")).toBe(false);
    expect(isAcceptableImageUrl("javascript:alert(1)")).toBe(false);
    expect(isAcceptableImageUrl("/uploads/../../etc/passwd")).toBe(false);
  });
});

describe("1:1", () => {
  it("minutes and price are required; price must be more than 0", () => {
    const ok = parseOfferingForm({ ...base, minutes: "60", price: "60", mode: "ONLINE" }, { type: "ONE_TO_ONE", isNew: false });
    expect(ok.ok && ok.data).toMatchObject({ minutes: 60, priceCents: 6000, level: null, lengthLabel: null, activationAfterMinutes: null });
    expect(fieldErrors(parseOfferingForm({ ...base, minutes: "60", price: "0", mode: "ONLINE" }, { type: "ONE_TO_ONE", isNew: false })).price).toBeDefined();
  });
});

describe("texts: tokens, rule numbers, private data (plan 14.3)", () => {
  it("a hand-written rule number is refused in the summary and the body", () => {
    const r = parseOfferingForm({ ...klass, body: "Cancel up to 24 hours before the class." , summary: "Please join 5 minutes before." }, { type: "GROUP_CLASS", isNew: false });
    const e = fieldErrors(r);
    expect(e.body?.[0]).toContain("{{CANCELLATION_HOURS}}");
    expect(e.summary?.[0]).toContain("{{JOIN_EARLY_MINUTES}}");
  });
  it("an unknown token is refused", () => {
    expect(fieldErrors(parseOfferingForm({ ...klass, body: "Hello {{NOPE}}" }, { type: "GROUP_CLASS", isNew: false })).body?.[0]).toContain("Unknown token");
  });
  it("session lengths and health advice stay plain text", () => {
    const body = "Allow 60 minutes of undisturbed time. A light stomach: 2 hours after lunch or 30 minutes after a snack. The first 30 minutes are a greeting.";
    expect(textProblems(body)).toEqual([]);
  });
  it("no Zoom link, no email address, no javascript link", () => {
    expect(textProblems("Join https://us02web.zoom.us/j/123")).not.toEqual([]);
    expect(textProblems("Write to me@example.com")).not.toEqual([]);
    expect(textProblems("Write to {{CONTACT_EMAIL}}")).toEqual([]);
    expect(textProblems("[click](javascript:alert(1))")).not.toEqual([]);
    expect(textProblems("[ok](https://example.com) and [mail](mailto:x)")).toEqual([]);
    expect(fieldErrors(parseOfferingForm({ ...klass, title: "Call me@example.com" }, { type: "GROUP_CLASS", isNew: false })).title).toBeDefined();
  });
});

describe("empty inputs (React gives null)", () => {
  it("null text fields do not crash", () => {
    const r = parseOfferingForm({ ...klass, level: null, body: null, activationAfterMinutes: null, image: null, imageAlt: null }, { type: "GROUP_CLASS", isNew: false });
    expect(r.ok && r.data).toMatchObject({ level: null, body: "", activationAfterMinutes: null, image: null });
  });
  it("title and summary are required", () => {
    const e = fieldErrors(parseOfferingForm({ ...klass, title: null, summary: "" }, { type: "GROUP_CLASS", isNew: false }));
    expect(Object.keys(e).sort()).toEqual(["summary", "title"]);
  });
  it("published is false when the box is not sent", () => {
    const r = parseOfferingForm({ ...klass, published: undefined }, { type: "GROUP_CLASS", isNew: false });
    expect(r.ok && r.data.published).toBe(false);
  });
});
