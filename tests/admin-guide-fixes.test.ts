/** Admin guide review fixes (2026-11-21): links, messages, log out, texts. Source checks, no database. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("no 'coming soon' left on built admin screens", () => {
  it("overview and offering form link to the sessions screens", () => {
    const o = read("app/admin/page.tsx");
    expect(o).not.toMatch(/coming soon/i);
    expect(o).toContain('href="/admin/sessions/new"');
    const f = read("components/admin/OfferingForm.tsx");
    expect(f).not.toMatch(/coming soon/i);
    expect(f).toContain("/admin/sessions/new?offering=");
  });
  it("images page says only the event form has an image field", () => {
    expect(read("app/admin/images/page.tsx")).toMatch(/Only the event form has an image field/);
  });
  it("saving a hidden offering says it is hidden", () => {
    expect(read("components/admin/OfferingForm.tsx")).toContain("Saved. It is hidden – not on the site.");
  });
});

describe("admin menu and lists", () => {
  it("menu has a Log out button using the same logout action as /account", () => {
    const s = read("components/admin/AdminShell.tsx");
    expect(s).toContain('import { logout } from "@/app/login/actions"');
    expect(s).toMatch(/<form action=\{logout\}>[\s\S]*Log out/);
  });
  it("slot list shows Dublin time and says so", () => {
    const p = read("app/admin/slots/page.tsx");
    expect(p).toContain("formatAdminDateTime(s.startsAt)");
    expect(p).toContain("When (Europe/Dublin)");
    expect(p).not.toContain("LocalTime");
  });
  it("overview messages card counts unread (readAt null), not by date", () => {
    const o = read("lib/admin/overview.ts");
    const fn = o.slice(o.indexOf("export async function getNewMessages"));
    expect(fn).toMatch(/readAt: null/);
    expect(fn.slice(0, fn.indexOf("Promise.all"))).not.toMatch(/createdAt/);
  });
});

describe("text editor placeholder buttons", () => {
  it("heading 'Insert a placeholder' with two groups: rule numbers and company data", () => {
    const t = read("components/admin/TextEditor.tsx");
    expect(t).toContain("Insert a placeholder");
    expect(t).not.toContain("Insert a rule number");
    expect(t).toContain("Rule numbers");
    expect(t).toContain("Company data");
  });
});
