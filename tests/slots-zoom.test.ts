/** Phase 12 small fixes: private Zoom link on 1:1 slots, legal diff colours, hidden-offering warning. No database. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { slotFormSchema, slotZoomSchema } from "@/lib/slots-schema";

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const form = { offeringId: "o1", date: "2040-03-06", time: "14:00", minutes: "60", repeatWeeks: "1" };

describe("1:1 slot form: optional private Zoom link", () => {
  it("no field, empty text or null = no link (the placeholder is used later)", () => {
    expect(slotFormSchema.parse(form).zoomUrl).toBeNull();
    expect(slotFormSchema.parse({ ...form, zoomUrl: "" }).zoomUrl).toBeNull();
    expect(slotFormSchema.parse({ ...form, zoomUrl: null }).zoomUrl).toBeNull();
    expect(slotFormSchema.parse({ ...form, zoomUrl: "   " }).zoomUrl).toBeNull();
  });
  it("same rules as the class session field: https only", () => {
    expect(slotFormSchema.parse({ ...form, zoomUrl: "https://us02web.zoom.us/j/123?pwd=abc" }).zoomUrl).toBe("https://us02web.zoom.us/j/123?pwd=abc");
    for (const bad of ["http://zoom.us/j/1", "javascript:alert(1)", "//zoom.us/j/1", "https://user:pw@zoom.us/j/1", "zoom.us/j/1", `https://zoom.us/${"a".repeat(500)}`]) {
      expect(slotFormSchema.safeParse({ ...form, zoomUrl: bad }).success, bad).toBe(false);
      expect(slotZoomSchema.safeParse({ zoomUrl: bad }).success, bad).toBe(false);
    }
    expect(slotZoomSchema.parse({ zoomUrl: "" }).zoomUrl).toBeNull();
  });
  it("source: the link is not written to the audit text or selected by the list query", () => {
    const svc = read("lib/admin/sessions-service.ts");
    const fn = svc.slice(svc.indexOf("export async function updateSlotZoom"), svc.indexOf("// ---------- cancel / restore"));
    const summary = fn.slice(fn.indexOf("summary:"), fn.indexOf("});", fn.indexOf("summary:")));
    expect(summary).not.toMatch(/zoomUrl|link\}|\$\{next\}/);
    expect(read("app/admin/slots/actions.ts")).not.toMatch(/console\.\w+\([^)]*zoomUrl/);
  });
});

describe("legal diff colours (owner 2026-11-21)", () => {
  const css = read("components/admin/text-editor.css");
  it("added = green + underline, removed = red + strike-through", () => {
    expect(css).toMatch(/\.lg-add \{[^}]*color-success-soft[^}]*underline/);
    expect(css).toMatch(/\.lg-del \{[^}]*color-danger-soft[^}]*line-through/);
  });
  it("not colour only: the panel prints + and − and a screen-reader word", () => {
    const tsx = read("components/admin/LegalPublishPanel.tsx");
    expect(tsx).toContain('"+"');
    expect(tsx).toContain('"−"');
    expect(tsx).toMatch(/Added: /);
    expect(tsx).toMatch(/Removed: /);
  });
});

describe("hidden class / event: warning in the session form (not a block)", () => {
  it("form shows a warning note for new and edit; the schema/service do not refuse hidden offerings", () => {
    const f = read("components/admin/SessionForm.tsx");
    expect(f).toMatch(/hidden-offering-warning/);
    expect(f).toMatch(/Warning: this/);
    const svc = read("lib/admin/sessions-service.ts");
    const create = svc.slice(svc.indexOf("export async function createSessions"), svc.indexOf("// ---------- edit"));
    expect(create).not.toMatch(/published/); // creating is never blocked by a hidden offering
  });
});
