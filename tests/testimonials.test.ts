import { describe, expect, it } from "vitest";
import { defaultTestimonials, pickTestimonials, splitWho, whoLabel } from "@/lib/testimonials";
import { CONSENT_MESSAGE, needsClientConsent, parseTestimonialForm } from "@/lib/testimonials-schema";
import { testimonials as codeList } from "@/content/home";

const ok = { name: "Anna", place: "Dublin", text: "I felt calm.", sortOrder: "1", published: "on", isDemo: "on" };

describe("testimonial form", () => {
  it("accepts a valid demo review", () => {
    const r = parseTestimonialForm(ok, null);
    expect(r).toEqual({ ok: true, data: { name: "Anna", place: "Dublin", text: "I felt calm.", sortOrder: 1, published: true, isDemo: true } });
  });
  it("null and empty values do not crash (React empties inputs to null)", () => {
    const r = parseTestimonialForm({ name: "Anna", place: null, text: "Hi", sortOrder: null, published: null, isDemo: "on" }, null);
    expect(r).toEqual({ ok: true, data: { name: "Anna", place: null, text: "Hi", sortOrder: 0, published: false, isDemo: true } });
  });
  it("name and quote are required; errors per field", () => {
    const r = parseTestimonialForm({ name: "  ", text: null, isDemo: "on" }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.name?.[0]).toMatch(/required/);
      expect(r.fieldErrors.text?.[0]).toMatch(/required/);
    }
  });
  it("quote max 400 characters, order 0-999 whole number", () => {
    const long = parseTestimonialForm({ ...ok, text: "x".repeat(401) }, null);
    expect(long.ok).toBe(false);
    expect(parseTestimonialForm({ ...ok, text: "x".repeat(400) }, null).ok).toBe(true);
    for (const bad of ["-1", "1000", "1.5", "abc"]) expect(parseTestimonialForm({ ...ok, sortOrder: bad }, null).ok, bad).toBe(false);
  });
  it("refuses email addresses and Zoom links in public text", () => {
    expect(parseTestimonialForm({ ...ok, text: "write to me@example.com" }, null).ok).toBe(false);
    expect(parseTestimonialForm({ ...ok, text: "join https://us02web.zoom.us/j/123" }, null).ok).toBe(false);
    expect(parseTestimonialForm({ ...ok, place: "a@b.co" }, null).ok).toBe(false);
  });
  it("HTML in the quote is accepted as plain text (React escapes it when shown)", () => {
    const r = parseTestimonialForm({ ...ok, text: "<script>alert(1)</script>" }, null);
    expect(r.ok && r.data.text).toBe("<script>alert(1)</script>");
  });
});

describe("Demo label consent (owner decision)", () => {
  it("needsClientConsent: only when the result is a real review and it is new or was a demo", () => {
    expect(needsClientConsent(null, false)).toBe(true);
    expect(needsClientConsent(true, false)).toBe(true);
    expect(needsClientConsent(false, false)).toBe(false); // already real: editing the text needs no new confirmation
    expect(needsClientConsent(true, true)).toBe(false);
    expect(needsClientConsent(null, true)).toBe(false);
    expect(needsClientConsent(false, true)).toBe(false);
  });
  it("demo -> real without the confirmation is refused", () => {
    const r = parseTestimonialForm({ ...ok, isDemo: null }, true);
    expect(r).toEqual({ ok: false, fieldErrors: { clientAgreed: [CONSENT_MESSAGE] } });
  });
  it("demo -> real with the confirmation is accepted", () => {
    const r = parseTestimonialForm({ ...ok, isDemo: null, clientAgreed: "on" }, true);
    expect(r.ok && r.data.isDemo).toBe(false);
  });
  it("a NEW real review needs the confirmation too", () => {
    expect(parseTestimonialForm({ ...ok, isDemo: null }, null).ok).toBe(false);
    expect(parseTestimonialForm({ ...ok, isDemo: null, clientAgreed: "on" }, null).ok).toBe(true);
  });
  it("the confirmation error comes together with other errors", () => {
    const r = parseTestimonialForm({ name: "", text: "x", isDemo: null }, true);
    expect(!r.ok && Object.keys(r.fieldErrors).sort()).toEqual(["clientAgreed", "name"]);
  });
  it("editing a review that is already real needs no confirmation", () => {
    expect(parseTestimonialForm({ ...ok, isDemo: null }, false).ok).toBe(true);
  });
  it("ticking the box while it stays a demo changes nothing", () => {
    expect(parseTestimonialForm({ ...ok, clientAgreed: "on" }, true).ok).toBe(true);
  });
});

describe("Home reviews: database or code fallback", () => {
  const row = (o: Partial<{ id: string; name: string; place: string | null; text: string; isDemo: boolean }> = {}) => ({ id: "r1", name: "Anna", place: "Dublin" as string | null, text: "Calm.", isDemo: false, ...o });
  it("the code list has the 3 reviews and all are demo", () => {
    expect(codeList).toHaveLength(3);
    const d = defaultTestimonials();
    expect(d.map((x) => x.isDemo)).toEqual([true, true, true]);
  });
  it("database error -> code list", () => expect(pickTestimonials(null, false)).toEqual(defaultTestimonials()));
  it("empty table -> code list", () => expect(pickTestimonials([], false)).toEqual(defaultTestimonials()));
  it("rows -> exactly those rows, demo label only for isDemo", () => {
    const r = pickTestimonials([row({ isDemo: true }), row({ id: "r2", name: "Tom", place: null })], true);
    expect(r).toEqual([
      { key: "r1", quote: "Calm.", who: "Anna, Dublin", isDemo: true },
      { key: "r2", quote: "Calm.", who: "Tom", isDemo: false },
    ]);
  });
  it("rows exist but all hidden -> nothing is shown (not the code list)", () => expect(pickTestimonials([], true)).toEqual([]));
  it("who helpers", () => {
    expect(whoLabel("Anna", null)).toBe("Anna");
    expect(splitWho("Maeve, Dublin")).toEqual({ name: "Maeve", place: "Dublin" });
    expect(splitWho("Tom")).toEqual({ name: "Tom", place: null });
  });
});
