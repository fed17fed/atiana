/**
 * Task 12.3: a safety net for FUTURE admin screens. Every file under app/admin must check requireAdmin:
 * each page.tsx, the layout, and every exported function of every "use server" file.
 * A new admin page or action without the check fails this test.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const adminDir = join(root, "app", "admin");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk(adminDir);
const rel = (f: string) => relative(root, f);
const read = (f: string) => readFileSync(f, "utf8");

describe("admin files always check requireAdmin", () => {
  const pages = files.filter((f) => /\/(page|route)\.tsx?$/.test(f));
  it("finds the pages", () => expect(pages.length).toBeGreaterThanOrEqual(2));
  for (const f of pages) {
    it(`${rel(f)} calls requireAdmin`, () => expect(read(f)).toMatch(/await requireAdmin\(/));
  }
  it("the layout calls requireAdmin", () => expect(read(join(adminDir, "layout.tsx"))).toMatch(/await requireAdmin\(/));

  const actionFiles = files.filter((f) => /\.tsx?$/.test(f) && /^\s*["']use server["']/m.test(read(f)));
  it("finds the action files", () => expect(actionFiles.length).toBeGreaterThanOrEqual(1));
  for (const f of actionFiles) {
    it(`${rel(f)}: every exported action calls requireAdmin first`, () => {
      const src = read(f);
      const exported = src.match(/export\s+(async\s+)?function\s+\w+/g) ?? [];
      const checks = src.match(/await requireAdmin\(/g) ?? [];
      expect(exported.length).toBeGreaterThan(0);
      expect(exported.every((e) => e.includes("async"))).toBe(true);
      expect(checks.length).toBeGreaterThanOrEqual(exported.length);
      // the check must come before any other await in the function body
      for (const m of src.matchAll(/export\s+async\s+function\s+\w+[^{]*\{([\s\S]*?)\n\}/g)) {
        const firstAwait = m[1].indexOf("await ");
        expect(m[1].slice(firstAwait, firstAwait + 20)).toContain("requireAdmin");
      }
    });
  }
});

describe("admin shell rules", () => {
  const ui = [...walk(join(root, "components", "admin")), ...files].filter((f) => /\.tsx?$/.test(f));
  it("no 'Delete' wording in admin screens (owner rule: nothing is deleted)", () => {
    for (const f of ui) expect(read(f), rel(f)).not.toMatch(/>\s*Delete\b|"Delete\b|'Delete\b|\bDelete\s+(this|the)\b/);
  });
  it("noindex is in the layout metadata and in the headers config", () => {
    expect(read(join(adminDir, "layout.tsx"))).toMatch(/index:\s*false/);
    const cfg = read(join(root, "next.config.ts"));
    expect(cfg).toMatch(/\/admin\/:path\*/);
    expect(cfg).toMatch(/X-Robots-Tag/);
    expect(cfg).toMatch(/no-store/);
  });
});
