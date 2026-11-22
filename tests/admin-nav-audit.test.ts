import { describe, expect, it, vi } from "vitest";
import { cleanSummary, recordAdminAction } from "@/lib/admin/audit";
import { formatAdminDateTime } from "@/lib/admin/format";
import { adminNav, isAdminNavActive } from "@/lib/admin/nav";

describe("admin nav", () => {
  const items = adminNav.flatMap((g) => g.items);
  it("has the A1 groups", () => {
    expect(adminNav.map((g) => g.label)).toEqual(["Start", "Content", "Offerings", "People and orders"]);
  });
  it("hrefs are unique /admin paths", () => {
    expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
    expect(items.every((i) => i.href === "/admin" || i.href.startsWith("/admin/"))).toBe(true);
  });
  it("only built screens are links (Overview, Texts, Legal pages, Images, Classes and events, 1:1 slots, Testimonials and the 5 read views)", () => {
    expect(items.filter((i) => i.built).map((i) => i.href)).toEqual(["/admin", "/admin/texts", "/admin/legal", "/admin/images", "/admin/offerings", "/admin/sessions", "/admin/slots", "/admin/packages", "/admin/testimonials", "/admin/bookings", "/admin/orders", "/admin/subscribers", "/admin/referrals", "/admin/messages"]);
  });
  it("active matching: /admin only on exact path; others by prefix", () => {
    expect(isAdminNavActive("/admin", "/admin")).toBe(true);
    expect(isAdminNavActive("/admin/slots", "/admin")).toBe(false);
    expect(isAdminNavActive("/admin/slots", "/admin/slots")).toBe(true);
    expect(isAdminNavActive("/admin/texts/home.hero/history", "/admin/texts")).toBe(true);
    expect(isAdminNavActive("/admin/slotsx", "/admin/slots")).toBe(false);
  });
});

describe("audit log", () => {
  it("cleanSummary: one line, max 300 chars", () => {
    expect(cleanSummary("a\n b\t c")).toBe("a b c");
    expect(cleanSummary(undefined)).toBe("");
    expect(cleanSummary("x".repeat(500))).toHaveLength(300);
  });
  it("writes one row with the given fields", async () => {
    const create = vi.fn().mockResolvedValue({});
    const ok = await recordAdminAction({ adminAuditLog: { create } } as never, { userId: "u1", action: "slots.add", entity: "ClassSession", summary: "Added 2" });
    expect(ok).toBe(true);
    expect(create).toHaveBeenCalledWith({ data: { userId: "u1", action: "slots.add", entity: "ClassSession", entityId: null, summary: "Added 2" } });
  });
  it("returns false (no throw) when the table is missing", async () => {
    const create = vi.fn().mockRejectedValue(new Error("no table"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await recordAdminAction({ adminAuditLog: { create } } as never, { userId: "u1", action: "a", entity: "b" })).toBe(false);
    warn.mockRestore();
  });
});

describe("admin time format", () => {
  it("uses Europe/Dublin (summer time = UTC+1)", () => {
    expect(formatAdminDateTime(new Date("2026-07-14T18:00:00Z"))).toContain("19:00");
    expect(formatAdminDateTime(new Date("2026-12-01T18:00:00Z"))).toContain("18:00");
  });
});
