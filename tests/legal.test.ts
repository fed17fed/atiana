import { describe, expect, it } from "vitest";
import { isLegalSlug, legalSlugs, loadLegalDoc, parseFrontmatter, splitDraftNotice } from "@/lib/legal";
import { footerColumns } from "@/lib/nav";

describe("legal loader", () => {
  it("loads all 5 pages with title, date, notice and a body that starts with the H1", async () => {
    expect(legalSlugs).toHaveLength(5);
    for (const slug of legalSlugs) {
      const doc = await loadLegalDoc(slug);
      expect(doc, slug).not.toBeNull();
      expect(doc!.title.length).toBeGreaterThan(3);
      expect(doc!.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc!.draftNotice).toMatch(/^DRAFT/);
      expect(doc!.body.startsWith("# ")).toBe(true);
      expect(doc!.body).not.toContain("---\ntitle");
    }
  });

  it("keeps [OWNER]/[LAWYER] placeholders visible", async () => {
    const privacy = await loadLegalDoc("privacy");
    expect(privacy!.body).toMatch(/\[(OWNER|LAWYER)/);
  });

  it("every footer legal link has a page", () => {
    const legal = footerColumns.find((c) => c.title === "Legal")!;
    expect(legal.links).toHaveLength(5);
    for (const l of legal.links) expect(isLegalSlug(l.href.replace("/legal/", "")), l.href).toBe(true);
  });

  it("rejects unknown slugs and path tricks", async () => {
    expect(isLegalSlug("../../.env")).toBe(false);
    expect(await loadLegalDoc("../../.env")).toBeNull();
    expect(await loadLegalDoc("nope")).toBeNull();
  });

  it("parses front matter and splits the draft notice", () => {
    const { data, content } = parseFrontmatter('---\ntitle: "A"\nupdated: "2026-11-09"\n---\n\n**DRAFT – check.**\n\n# A\n');
    expect(data).toEqual({ title: "A", updated: "2026-11-09" });
    const { notice, body } = splitDraftNotice(content);
    expect(notice).toBe("DRAFT – check.");
    expect(body).toBe("# A\n");
  });
});
