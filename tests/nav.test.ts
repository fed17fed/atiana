import { describe, expect, it } from "vitest";
import { footerColumns, isActivePath, mainNav, mobileSubNav } from "@/lib/nav";

describe("nav config", () => {
  it("has the 4 main links in the approved order", () => {
    expect(mainNav.map((l) => l.label)).toEqual([
      "Classes",
      "1:1 Sessions",
      "Events",
      "About",
    ]);
  });

  it("has no retreat, blog, shop or cart links anywhere", () => {
    const all = [...mainNav, ...mobileSubNav, ...footerColumns.flatMap((c) => c.links)];
    for (const l of all) expect(l.href).not.toMatch(/retreat|blog|shop|cart/i);
  });

  it("footer has Practice, Explore and Legal with 5 legal links", () => {
    expect(footerColumns.map((c) => c.title)).toEqual(["Practice", "Explore", "Legal"]);
    expect(footerColumns[2].links).toHaveLength(5);
    expect(footerColumns[1].links.map((l) => l.label)).toEqual([
      "About",
      "Donate",
      "FAQ",
      "Contact",
    ]);
  });

  it("Refer a friend is hidden everywhere until Phase 7 (owner 2026-11-11)", () => {
    const all = [...mainNav, ...mobileSubNav, ...footerColumns.flatMap((c) => c.links)];
    expect(all.some((l) => l.href === "/refer" || /refer/i.test(l.label))).toBe(false);
  });

  it("all hrefs are absolute paths", () => {
    for (const l of [...mainNav, ...footerColumns.flatMap((c) => c.links)])
      expect(l.href.startsWith("/")).toBe(true);
  });
});

describe("isActivePath", () => {
  it("matches the page and pages below it", () => {
    expect(isActivePath("/classes", "/classes")).toBe(true);
    expect(isActivePath("/classes/morning-energy", "/classes")).toBe(true);
    expect(isActivePath("/classes/", "/classes")).toBe(true);
  });
  it("does not match similar names or other pages", () => {
    expect(isActivePath("/classes-extra", "/classes")).toBe(false);
    expect(isActivePath("/", "/classes")).toBe(false);
    expect(isActivePath(null, "/classes")).toBe(false);
  });
});
