/**
 * Task 12.7: the text actions, "Mark as read" and the bookings CSV refuse logged-out visitors and USERs, and do nothing.
 * Real requireAdmin; only framework parts and the services are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  hasCookie: true,
  session: null as null | { user: { id: string; email: string; name: string | null; role: "USER" | "ADMIN" } },
  save: vi.fn(),
  reset: vi.fn(),
  restore: vi.fn(),
  mark: vi.fn(),
  exportRows: vi.fn(),
  audit: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ has: () => s.hasCookie }) }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({ updateTag: s.updateTag, revalidatePath: () => {}, cacheTag: () => {}, cacheLife: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  forbidden: () => {
    throw new Error("FORBIDDEN");
  },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => s.session }));
vi.mock("@/lib/prisma", () => ({ prisma: { adminAuditLog: { create: s.audit } } }));
vi.mock("@/lib/admin/text-service", async (orig) => ({ ...(await orig<typeof import("@/lib/admin/text-service")>()), saveText: s.save, resetText: s.reset, restoreText: s.restore }));
vi.mock("@/lib/admin/messages-service", () => ({ markMessageRead: s.mark }));
vi.mock("@/lib/admin/read-queries", async (orig) => ({ ...(await orig<typeof import("@/lib/admin/read-queries")>()), exportBookings: s.exportRows }));

import { GET as exportBookingsCsv } from "@/app/admin/bookings/export/route";
import { markMessageReadAction } from "@/app/admin/messages/actions";
import { backToDefaultAction, restoreTextAction, saveTextAction } from "@/app/admin/texts/actions";

const admin = { user: { id: "u-admin", email: "admin@atiana.test", name: null, role: "ADMIN" as const } };
const user = { user: { id: "u-user", email: "user@atiana.test", name: null, role: "USER" as const } };
const idle = { status: "idle" } as const;
const all = () => [s.save, s.reset, s.restore, s.mark, s.exportRows, s.audit, s.updateTag];
const calls = () => all().map((f) => f.mock.calls.length);

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-not-real";
  s.hasCookie = true;
  s.session = null;
  for (const f of all()) f.mockReset();
  s.audit.mockResolvedValue({});
});

describe("logged out / USER: refused, nothing happens", () => {
  const actions: [string, () => Promise<unknown>][] = [
    ["saveTextAction", () => saveTextAction(idle, new FormData())],
    ["backToDefaultAction", () => backToDefaultAction("home.hero.title", new FormData())],
    ["restoreTextAction", () => restoreTextAction("home.hero.title", "r1", new FormData())],
    ["markMessageReadAction", () => markMessageReadAction("m1", new FormData())],
    ["bookings CSV export", () => exportBookingsCsv(new Request("http://x/admin/bookings/export"))],
  ];
  for (const [name, run] of actions) {
    it(`${name}: logged out -> redirect to /login`, async () => {
      s.hasCookie = false;
      await expect(run()).rejects.toThrow("REDIRECT /login");
      expect(calls()).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });
    it(`${name}: USER -> 403`, async () => {
      s.session = user;
      await expect(run()).rejects.toThrow("FORBIDDEN");
      expect(calls()).toEqual([0, 0, 0, 0, 0, 0, 0]);
    });
  }
});

describe("ADMIN", () => {
  beforeEach(() => {
    s.session = admin;
  });
  const form = (o: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(o)) fd.set(k, v);
    return fd;
  };
  it("save: passes the form to the service with the admin id and expires the text cache tag", async () => {
    s.save.mockResolvedValue({ ok: true, message: "Saved.", version: "9", value: "New", edited: true });
    const r = await saveTextAction(idle, form({ key: "home.hero.title", value: "New", note: "n", version: "0" }));
    expect(r).toEqual({ status: "ok", message: "Saved.", version: "9", value: "New" });
    expect(s.save.mock.calls[0][1]).toEqual({ key: "home.hero.title", value: "New", note: "n", version: "0" });
    expect(s.save.mock.calls[0][2]).toBe("u-admin");
    expect(s.updateTag).toHaveBeenCalledWith("site-texts");
  });
  it("a refused save (check or stale) returns the problems and does NOT expire the cache", async () => {
    s.save.mockResolvedValue({ ok: false, code: "INVALID", message: "Cannot save.", problems: ["Unknown token"] });
    expect(await saveTextAction(idle, form({ key: "k" }))).toMatchObject({ status: "error", problems: ["Unknown token"], stale: false });
    s.save.mockResolvedValue({ ok: false, code: "STALE", message: "Someone changed this text" });
    expect(await saveTextAction(idle, form({ key: "k" }))).toMatchObject({ status: "error", stale: true });
    expect(s.updateTag).not.toHaveBeenCalled();
  });
  it("a database error gives a friendly message, not a crash", async () => {
    s.save.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await saveTextAction(idle, form({ key: "k" }))).toMatchObject({ status: "error" });
    err.mockRestore();
  });
  it("back to default and restore redirect with a result flag and expire the cache", async () => {
    s.reset.mockResolvedValue({ ok: true, message: "", version: "1", value: "x", edited: false });
    await expect(backToDefaultAction("home.hero.title")).rejects.toThrow("REDIRECT /admin/texts/home.hero.title?done=default");
    expect(s.reset.mock.calls[0][1]).toBe("home.hero.title");
    expect(s.reset.mock.calls[0][2]).toBe("u-admin");
    s.restore.mockResolvedValue({ ok: true, message: "", version: "1", value: "x", edited: true });
    await expect(restoreTextAction("home.hero.title", "r1")).rejects.toThrow("REDIRECT /admin/texts/home.hero.title/history?done=restored");
    expect(s.restore.mock.calls[0].slice(1)).toEqual(["home.hero.title", "r1", "u-admin"]);
    expect(s.updateTag).toHaveBeenCalledTimes(2);
  });
  it("restore of an old text that fails today's checks is reported, cache untouched", async () => {
    s.restore.mockResolvedValue({ ok: false, code: "INVALID", message: "x" });
    await expect(restoreTextAction("home.hero.title", "r1")).rejects.toThrow("done=invalid");
    expect(s.updateTag).not.toHaveBeenCalled();
  });
  it("a junk key never reaches the service as a key", async () => {
    s.reset.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "x" });
    await expect(backToDefaultAction("../../x")).rejects.toThrow("REDIRECT /admin/texts/?done=failed");
    expect(s.reset.mock.calls[0][1]).toBeNull();
  });
  it("Mark as read goes to the service with the admin id", async () => {
    s.mark.mockResolvedValue({ ok: true, changed: true });
    await markMessageReadAction("m1", new FormData());
    expect(s.mark).toHaveBeenCalledWith(expect.anything(), "m1", "u-admin");
  });
  it("bookings CSV: neutralizes formulas, one audit row, download headers, no secrets", async () => {
    s.exportRows.mockResolvedValue([{ createdAt: new Date("2026-11-21T10:00:00Z"), status: "CONFIRMED", paidWith: "FREE", user: { name: "=cmd", email: "a@b.com" }, session: { startsAt: new Date("2026-12-01T19:00:00Z"), offering: { title: "Moon" } } }]);
    const res = await exportBookingsCsv(new Request("http://x/admin/bookings/export?q=cmd"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="bookings-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(text).toContain(",'=cmd,");
    expect(s.audit.mock.calls[0][0].data).toMatchObject({ userId: "u-admin", action: "bookings.export", entity: "Booking" });
    expect(s.audit.mock.calls[0][0].data.summary).not.toMatch(/cmd|a@b/);
  });
});
