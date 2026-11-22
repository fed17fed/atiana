/** Task 12.7: text registry (kinds, names), the save check (checkText) and the pure parts of the editor. No database. */
import { describe, expect, it } from "vitest";
import { cleanKey, getTextEntry, kindOf, labelOf, TEXT_ENTRIES, TEXT_PAGES } from "@/lib/admin/text-registry";
import { checkText, normalizeText } from "@/lib/admin/text-rules";
import { cleanNote, effectiveValue, isEdited, versionOf } from "@/lib/admin/text-service";
import { SITE_TEXT_DEFAULTS } from "@/content/site-texts";

const entry = (key: string) => getTextEntry(key)!;

describe("registry", () => {
  it("has one entry per key of the code file, in the same order", () => {
    expect(TEXT_ENTRIES.map((e) => e.key)).toEqual(Object.keys(SITE_TEXT_DEFAULTS));
    expect(TEXT_ENTRIES).toHaveLength(128);
    expect(new Set(TEXT_ENTRIES.map((e) => e.page))).toEqual(new Set(TEXT_PAGES.map((p) => p.id)));
  });
  it("home.quotes.title is a key and its default is today's text", () => {
    expect(SITE_TEXT_DEFAULTS["home.quotes.title"]).toBe("What people say");
    expect(entry("home.quotes.title")).toMatchObject({ kind: "TEXT", page: "home" });
  });
  it("kinds match how the pages show the text", () => {
    expect(kindOf("home.hero.title")).toBe("INLINE");
    expect(kindOf("faq.page.lead")).toBe("INLINE");
    expect(kindOf("faq.booking.cancel.a")).toBe("MARKDOWN");
    expect(kindOf("faq.booking.cancel.q")).toBe("TEXT");
    expect(kindOf("home.meta.title")).toBe("META");
    expect(kindOf("home.hero.imageAlt")).toBe("ALT");
    expect(kindOf("shared.teacher.instagramUrl")).toBe("URL");
    expect(kindOf("home.hero.lead")).toBe("TEXT");
  });
  it("friendly names", () => {
    expect(labelOf("home.hero.title")).toBe("Home – hero title");
    expect(labelOf("faq.booking.cancel.q")).toBe("FAQ – booking cancel question");
    expect(labelOf("home.offers.oneToOne.title")).toBe("Home – offers 1:1 title");
    expect(labelOf("shared.teacher.bio")).toBe("Shared – teacher bio");
  });
  it("an unknown key is not found; cleanKey refuses odd characters", () => {
    expect(getTextEntry("home.nothing.here")).toBeNull();
    expect(getTextEntry("__proto__")).toBeNull();
    expect(cleanKey("home.hero.title")).toBe("home.hero.title");
    for (const bad of ["../etc", "a b", "", "x".repeat(200), 5, null]) expect(cleanKey(bad)).toBeNull();
  });
});

describe("checkText: every current default passes (the pack FAQ answer is the one known exception)", () => {
  it("all defaults are valid", () => {
    const failing = TEXT_ENTRIES.filter((e) => !checkText(e, e.defaultText).ok).map((e) => e.key);
    // faq.credits.howLong.a (hidden packs, owner Q6: kept as it is) writes "valid for 10 weeks" by hand.
    expect(failing).toEqual(["faq.credits.howLong.a"]);
  });
});

describe("checkText: blocks what the plan says", () => {
  const title = entry("home.hero.title");
  const faq = entry("faq.booking.cancel.a");
  const msgs = (e: Parameters<typeof checkText>[0], v: unknown) => {
    const r = checkText(e, v);
    return r.ok ? [] : r.problems.join(" | ");
  };
  it("empty and non-string", () => {
    expect(checkText(title, "   \n ")).toMatchObject({ ok: false });
    expect(checkText(title, null)).toMatchObject({ ok: false });
    expect(checkText(title, 5)).toMatchObject({ ok: false });
  });
  it("too long", () => {
    expect(msgs(title, "x".repeat(2001))).toMatch(/too long: 2001 of 2000/);
    expect(checkText(title, "x".repeat(2000)).ok).toBe(true);
  });
  it("line breaks only where paragraphs are shown", () => {
    expect(msgs(title, "a\nb")).toMatch(/one paragraph/);
    expect(checkText(faq, "a\n\nb").ok).toBe(true);
  });
  it("unknown token, broken token, hard-coded rule number", () => {
    expect(msgs(faq, "Cancel {{CANCEL_HRS}}")).toMatch(/Unknown token \{\{CANCEL_HRS\}\}/);
    expect(msgs(faq, "Cancel {{CANCELLATION_HOURS")).toMatch(/Broken token/);
    expect(msgs(faq, "Cancel up to 24 hours before")).toMatch(/\{\{CANCELLATION_HOURS\}\}/);
    expect(checkText(faq, "Cancel up to {{CANCELLATION_HOURS}} hours before").ok).toBe(true);
  });
  it("plain numbers that are not rules stay allowed", () => {
    expect(checkText(faq, "Eat 2 hours after a meal. In an emergency call 112.").ok).toBe(true);
  });
  it("Zoom link and typed e-mail address", () => {
    expect(msgs(faq, "Join https://us02web.zoom.us/j/123")).toMatch(/Zoom link/);
    expect(msgs(faq, "Join at zoom.us now")).toMatch(/Zoom link/);
    expect(msgs(faq, "Write to anna@example.com")).toMatch(/\{\{CONTACT_EMAIL\}\}/);
    expect(msgs(faq, "[mail](mailto:anna@example.com)")).toMatch(/email address/);
    expect(checkText(faq, "Write to {{CONTACT_EMAIL}}").ok).toBe(true);
  });
  it("unsafe links are refused, safe ones pass", () => {
    expect(msgs(faq, "[x](javascript:alert(1))")).toMatch(/not allowed/);
    expect(msgs(faq, "[x](//evil.test)")).toMatch(/not allowed/);
    expect(msgs(faq, "[x](data:text/html;base64,AAAA)")).toMatch(/not allowed/);
    expect(checkText(faq, "[Contact](/contact) and [site](https://example.com/a)").ok).toBe(true);
    // plain text kinds do not make links, so a mark there is only characters
    expect(checkText(entry("home.hero.lead"), "[x](javascript:alert(1))").ok).toBe(true);
  });
  it("URL texts must be https", () => {
    const u = entry("shared.teacher.instagramUrl");
    expect(msgs(u, "http://instagram.com/x")).toMatch(/https/);
    expect(msgs(u, "javascript:alert(1)")).toMatch(/https/);
    expect(msgs(u, "https://instagram.com/a b")).toMatch(/https/);
    expect(checkText(u, "https://www.instagram.com/atiana/").ok).toBe(true);
  });
  it("HTML is not special: it stays plain characters (React escapes it)", () => {
    expect(checkText(faq, "<script>alert(1)</script>").ok).toBe(true);
  });
  it("normalizes line breaks and trims", () => {
    expect(normalizeText("  a\r\nb \r\n")).toBe("a\nb");
  });
});

describe("service pure helpers", () => {
  it("version: 0 without a row, updatedAt in ms with a row", () => {
    expect(versionOf(null)).toBe("0");
    expect(versionOf({ updatedAt: new Date(1234567) })).toBe("1234567");
  });
  it("effective value and the Edited rule", () => {
    const e = entry("home.hero.lead");
    expect(effectiveValue(null, e)).toBe(e.defaultText);
    expect(effectiveValue({ value: "" }, e)).toBe(e.defaultText);
    expect(effectiveValue({ value: "  " }, e)).toBe(e.defaultText);
    expect(effectiveValue({ value: "New" }, e)).toBe("New");
    expect(isEdited(null, e)).toBe(false);
    expect(isEdited({ value: "" }, e)).toBe(false);
    expect(isEdited({ value: e.defaultText }, e)).toBe(false);
    expect(isEdited({ value: "New" }, e)).toBe(true);
  });
  it("note: one short line", () => {
    expect(cleanNote("  a\n b  ")).toBe("a b");
    expect(cleanNote("x".repeat(300))).toHaveLength(200);
    expect(cleanNote(5)).toBe("");
  });
});
