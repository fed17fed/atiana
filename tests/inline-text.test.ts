import { describe, expect, it } from "vitest";
import { inlineToPlain, isSafeHref, parseInline, splitParagraphs } from "@/lib/inline-text";
import { safeHttpsUrl } from "@/lib/safe-url";
import { FAQ_STRUCTURE, FAQ_TEXT_KEYS, faqGroups, plainText } from "@/content/faq";
import { ABOUT_TEXTS, FAQ_TEXTS, HOME_TEXTS, SHARED_TEXTS, SITE_TEXT_DEFAULTS } from "@/content/site-texts";
import { validateTokens } from "@/lib/text-tokens";

describe("inline text marks (task 12.6)", () => {
  it("*italic* and [label](/link)", () => {
    expect(parseInline("Come home to your *own light.*")).toEqual([
      { type: "text", value: "Come home to your " },
      { type: "em", value: "own light." },
    ]);
    expect(parseInline("See [Health notice](/legal/health-disclaimer).")).toEqual([
      { type: "text", value: "See " },
      { type: "link", label: "Health notice", href: "/legal/health-disclaimer" },
      { type: "text", value: "." },
    ]);
  });
  it("brackets without an address stay as text (the [OWNER: ...] and [CONTACT EMAIL] notes)", () => {
    expect(parseInline("write to [CONTACT EMAIL]. [OWNER: x]")).toEqual([{ type: "text", value: "write to [CONTACT EMAIL]. [OWNER: x]" }]);
  });
  it("only site paths, http(s) and mailto are links", () => {
    for (const ok of ["/faq", "/legal/privacy#a", "https://a.example/x", "http://a.example", "mailto:a@b.example"]) expect(isSafeHref(ok), ok).toBe(true);
    for (const bad of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "data:text/html,x", "ftp://x", "JaVaScRiPt:1", ""]) expect(isSafeHref(bad), bad).toBe(false);
  });
  it("an unsafe link (also with brackets inside) becomes plain label text, no stray characters", () => {
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ type: "text", value: "x" }]);
    expect(inlineToPlain("a [x](//evil.example) b")).toBe("a x b");
  });
  it("HTML in a text is never parsed (React escapes it)", () => {
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ type: "text", value: "<img src=x onerror=alert(1)>" }]);
  });
  it("inlineToPlain and plainText drop the marks, OWNER notes and demo tags", () => {
    expect(inlineToPlain("Please [write to us](/contact) *now*")).toBe("Please write to us now");
    expect(plainText("Costs [here](/x). (demo price) [OWNER: confirm]")).toBe("Costs here.");
  });
  it("splitParagraphs splits at blank lines", () => {
    expect(splitParagraphs("A\n\nB \n \n\nC")).toEqual(["A", "B", "C"]);
    expect(splitParagraphs("  ")).toEqual([]);
  });
  it("safeHttpsUrl accepts only https", () => {
    const d = "https://www.instagram.com/x/";
    expect(safeHttpsUrl("https://www.instagram.com/kundalini_by_atiana/", d)).toBe("https://www.instagram.com/kundalini_by_atiana/");
    for (const bad of ["http://a.example", "javascript:alert(1)", "//a.example", "not a url", "", "https://user:pw@a.example/"]) expect(safeHttpsUrl(bad, d), bad).toBe(d);
  });
});

describe("text keys of Home, About and FAQ (task 12.6)", () => {
  const all = Object.keys(SITE_TEXT_DEFAULTS);
  it("counts: 6 shared + 55 home + 26 about + 41 faq = 128 keys", () => {
    expect([Object.keys(SHARED_TEXTS).length, Object.keys(HOME_TEXTS).length, Object.keys(ABOUT_TEXTS).length, Object.keys(FAQ_TEXTS).length]).toEqual([6, 55, 26, 41]);
    expect(all).toHaveLength(128);
  });
  it("key names follow <page>.<section>.<item> in lower camelCase, no duplicates", () => {
    for (const k of all) expect(k, k).toMatch(/^(home|about|faq|shared)(\.[a-z][A-Za-z0-9]*){2,}$/);
    expect(new Set(all).size).toBe(all.length);
  });
  it("every default is a non-empty text with only known tokens", () => {
    for (const [k, v] of Object.entries(SITE_TEXT_DEFAULTS)) {
      expect(v.trim(), k).not.toBe("");
      expect(validateTokens(v), k).toEqual([]);
    }
  });
  it("every key of the FAQ structure has a default; 14 questions in 5 groups", () => {
    for (const k of FAQ_TEXT_KEYS) expect(SITE_TEXT_DEFAULTS, k).toHaveProperty([k]);
    expect(FAQ_STRUCTURE).toHaveLength(5);
    expect(faqGroups.flatMap((g) => g.items)).toHaveLength(14);
  });
  it("the code default FAQ has the rule numbers filled in from lib/booking-rules.ts", () => {
    const text = JSON.stringify(faqGroups);
    expect(text).not.toContain("{{");
    expect(text).toContain("24-hour limit");
  });
});
