import { describe, expect, it } from "vitest";
import { faqCount, faqGroups, plainText } from "@/content/faq";
import { faqJsonLd, organizationJsonLd } from "@/lib/jsonld";
import { getSiteUrl, isIndexingAllowed, sitemapPaths } from "@/lib/site";
import { spotsLabel } from "@/content/home";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe("FAQ", () => {
  it("has 14 questions in 5 groups (shop removed 2026-11-11)", () => {
    expect(faqCount).toBe(14);
    expect(faqGroups).toHaveLength(5);
  });

  it("JSON-LD is a FAQPage with all questions and no placeholders", () => {
    const ld = faqJsonLd(faqGroups) as { "@type": string; mainEntity: { acceptedAnswer: { text: string } }[] };
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(14);
    for (const e of ld.mainEntity) {
      expect(e.acceptedAnswer.text).not.toMatch(/\[OWNER|\(demo/);
    }
  });

  it("plainText removes OWNER notes and demo tags", () => {
    expect(plainText("Costs €5. (demo value) [OWNER: confirm]")).toBe("Costs €5.");
  });
});

describe("site helpers", () => {
  it("indexing is off unless ALLOW_INDEXING=true", () => {
    expect(isIndexingAllowed(env({}))).toBe(false);
    expect(isIndexingAllowed(env({ ALLOW_INDEXING: "yes" }))).toBe(false);
    expect(isIndexingAllowed(env({ ALLOW_INDEXING: "true" }))).toBe(true);
  });

  it("site URL order: explicit, Vercel domain, localhost", () => {
    expect(getSiteUrl(env({ NEXT_PUBLIC_SITE_URL: "https://a.com/" }))).toBe("https://a.com");
    expect(getSiteUrl(env({ VERCEL_PROJECT_PRODUCTION_URL: "atiana.vercel.app" }))).toBe("https://atiana.vercel.app");
    expect(getSiteUrl(env({}))).toBe("http://localhost:3000");
  });

  it("sitemap has home, about, classes, schedule, 1:1, events (list + 7 details), contact, faq and 5 legal pages", () => {
    expect(sitemapPaths).toHaveLength(21);
    expect(sitemapPaths.filter((p) => p.startsWith("/legal/"))).toHaveLength(5);
  });

  it("Organization JSON-LD", () => {
    const ld = organizationJsonLd("https://x.com");
    expect(ld["@type"]).toBe("Organization");
    expect(ld.url).toBe("https://x.com");
  });

  it("spotsLabel follows the design rule (3 or fewer = Only N)", () => {
    expect(spotsLabel(12)).toBe("12 spots left");
    expect(spotsLabel(3)).toBe("Only 3 spots left");
    expect(spotsLabel(1)).toBe("Only 1 spot left");
    expect(spotsLabel(0)).toBe("Full");
  });
});
