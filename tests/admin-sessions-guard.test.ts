/**
 * Tasks 12.9 / 12.10: the sessions, slot and package actions refuse logged-out visitors and USERs, and do nothing.
 * Real requireAdmin; only framework parts and the services are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  hasCookie: true,
  session: null as null | { user: { id: string; email: string; name: string | null; role: "USER" | "ADMIN" } },
  create: vi.fn(),
  update: vi.fn(),
  cancel: vi.fn(),
  restore: vi.fn(),
  updatePackage: vi.fn(),
  addSlots: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ has: () => s.hasCookie }) }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({ updateTag: s.updateTag, cacheTag: () => {}, cacheLife: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  forbidden: () => {
    throw new Error("FORBIDDEN");
  },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => s.session }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/admin/sessions-service", () => ({ createSessions: s.create, updateSession: s.update, cancelSession: s.cancel, restoreSession: s.restore }));
vi.mock("@/lib/admin/packages-service", () => ({ updatePackage: s.updatePackage }));
vi.mock("@/lib/slots-service", () => ({ addOneToOneSlots: s.addSlots }));

import { savePackage } from "@/app/admin/packages/actions";
import { saveSession, setSessionCancelled } from "@/app/admin/sessions/actions";
import { addSlots, setSlotHidden } from "@/app/admin/slots/actions";

const admin = { user: { id: "u-admin", email: "admin@atiana.test", name: null, role: "ADMIN" as const } };
const user = { user: { id: "u-user", email: "user@atiana.test", name: null, role: "USER" as const } };
const idle = { status: "idle" } as const;

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-not-real";
  s.hasCookie = true;
  s.session = null;
  for (const f of Object.values(s)) if (typeof f === "function") (f as ReturnType<typeof vi.fn>).mockReset();
});
const calls = () => [s.create, s.update, s.cancel, s.restore, s.updatePackage, s.addSlots, s.updateTag].map((f) => f.mock.calls.length);

describe("logged out / USER: refused, nothing happens", () => {
  const actions: [string, () => Promise<unknown>][] = [
    ["saveSession (new)", () => saveSession(idle, new FormData())],
    ["saveSession (edit)", () => { const fd = new FormData(); fd.set("id", "x1"); return saveSession(idle, fd); }],
    ["setSessionCancelled", () => setSessionCancelled("x1", true, new FormData())],
    ["setSessionCancelled restore", () => setSessionCancelled("x1", false, new FormData())],
    ["setSlotHidden", () => setSlotHidden("x1", true, "", new FormData())],
    ["addSlots", () => addSlots(idle as never, new FormData())],
    ["savePackage", () => savePackage(idle, new FormData())],
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
  it("create sends the unticked dates, calls the service with the admin id, expires the offerings tag, redirects with the count", async () => {
    s.create.mockResolvedValue({ ok: true, created: 3, skipped: 0, message: "x" });
    const fd = new FormData();
    fd.set("offeringId", "o1");
    fd.append("skip", "2026-12-08");
    fd.append("skip", "2026-12-15");
    await expect(saveSession(idle, fd)).rejects.toThrow("REDIRECT /admin/sessions?saved=created-3");
    expect(s.create.mock.calls[0][1]).toMatchObject({ offeringId: "o1", skip: ["2026-12-08", "2026-12-15"] });
    expect(s.create.mock.calls[0][2]).toBe("u-admin");
    expect(s.updateTag).toHaveBeenCalledWith("offerings");
  });
  it("edit returns ok with the new version; a refused save returns field errors and does not expire the cache", async () => {
    const fd = new FormData();
    fd.set("id", "x1");
    s.update.mockResolvedValue({ ok: true, id: "x1", message: "Saved.", version: "9" });
    expect(await saveSession(idle, fd)).toEqual({ status: "ok", message: "Saved.", version: "9" });
    expect(s.updateTag).toHaveBeenCalledTimes(1);
    s.updateTag.mockReset();
    s.update.mockResolvedValue({ ok: false, message: "Please fix", fieldErrors: { date: ["x"] } });
    expect(await saveSession(idle, fd)).toMatchObject({ status: "error", fieldErrors: { date: ["x"] } });
    expect(s.updateTag).not.toHaveBeenCalled();
  });
  it("a database error gives a friendly message and logs no form values (the Zoom link is in them)", async () => {
    s.create.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const fd = new FormData();
    fd.set("zoomUrl", "https://zoom.us/j/SECRETLINK");
    expect(await saveSession(idle, fd)).toMatchObject({ status: "error" });
    expect(JSON.stringify(err.mock.calls)).not.toContain("SECRETLINK");
    err.mockRestore();
  });
  it("cancel / restore: service gets the admin id; blocked cancel redirects with 'blocked' and keeps the cache", async () => {
    s.cancel.mockResolvedValue({ ok: true, changed: true, message: "x" });
    await expect(setSessionCancelled("x1", true, new FormData())).rejects.toThrow("REDIRECT /admin/sessions?saved=cancelled");
    expect(s.cancel).toHaveBeenCalledWith(expect.anything(), "x1", "u-admin", "session");
    expect(s.updateTag).toHaveBeenCalledTimes(1);
    s.updateTag.mockReset();
    s.cancel.mockResolvedValue({ ok: false, code: "HAS_BOOKINGS", bookings: 2, message: "x" });
    await expect(setSessionCancelled("x1", true, new FormData())).rejects.toThrow("REDIRECT /admin/sessions?saved=blocked");
    expect(s.updateTag).not.toHaveBeenCalled();
    s.restore.mockResolvedValue({ ok: true, changed: true, message: "x" });
    await expect(setSessionCancelled("x1", false, new FormData())).rejects.toThrow("REDIRECT /admin/sessions?saved=restored");
  });
  it("slot hide / restore use the slot label", async () => {
    s.cancel.mockResolvedValue({ ok: true, changed: true, message: "x" });
    await expect(setSlotHidden("x1", true, "", new FormData())).rejects.toThrow("REDIRECT /admin/slots?saved=hidden");
    expect(s.cancel).toHaveBeenCalledWith(expect.anything(), "x1", "u-admin", "slot");
    s.restore.mockResolvedValue({ ok: true, changed: true, message: "x" });
    await expect(setSlotHidden("x1", false, "", new FormData())).rejects.toThrow("REDIRECT /admin/slots?saved=restored");
    s.cancel.mockResolvedValue({ ok: false, code: "HAS_BOOKINGS", bookings: 1, message: "x" });
    await expect(setSlotHidden("x1", true, "", new FormData())).rejects.toThrow("REDIRECT /admin/slots?saved=blocked");
    await expect(setSlotHidden("x1", true, "2026-12-15", new FormData())).rejects.toThrow("REDIRECT /admin/slots?saved=blocked&from=2026-12-15");
    await expect(setSlotHidden("x1", true, "x&y=1", new FormData())).rejects.toThrow("REDIRECT /admin/slots?saved=blocked");
  });
  it("package save: service gets the id from the form and the admin id", async () => {
    s.updatePackage.mockResolvedValue({ ok: true, id: "p1", message: "Saved.", version: "3" });
    const fd = new FormData();
    fd.set("id", "p1");
    expect(await savePackage(idle, fd)).toEqual({ status: "ok", message: "Saved.", version: "3" });
    expect(s.updatePackage.mock.calls[0][1]).toBe("p1");
    expect(s.updatePackage.mock.calls[0][3]).toBe("u-admin");
  });
});
