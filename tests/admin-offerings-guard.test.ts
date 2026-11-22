/**
 * Task 12.8: the offerings admin actions refuse logged-out visitors and USERs, and do nothing.
 * Real requireAdmin; only framework parts and the service are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  hasCookie: true,
  session: null as null | { user: { id: string; email: string; name: string | null; role: "USER" | "ADMIN" } },
  create: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
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
vi.mock("@/lib/admin/offerings-service", () => ({ createOffering: s.create, updateOffering: s.update, setOfferingPublished: s.publish }));

import { saveOffering, setOfferingVisible } from "@/app/admin/offerings/actions";

const admin = { user: { id: "u-admin", email: "admin@atiana.test", name: null, role: "ADMIN" as const } };
const user = { user: { id: "u-user", email: "user@atiana.test", name: null, role: "USER" as const } };
const idle = { status: "idle" } as const;

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-not-real";
  s.hasCookie = true;
  s.session = null;
  for (const f of [s.create, s.update, s.publish, s.updateTag]) f.mockReset();
});
const calls = () => [s.create, s.update, s.publish, s.updateTag].map((f) => f.mock.calls.length);

describe("logged out / USER: refused, nothing happens", () => {
  const actions: [string, () => Promise<unknown>][] = [
    ["saveOffering", () => saveOffering(idle, new FormData())],
    ["setOfferingVisible", () => setOfferingVisible("o1", false, new FormData())],
  ];
  for (const [name, run] of actions) {
    it(`${name}: logged out -> redirect to /login`, async () => {
      s.hasCookie = false;
      await expect(run()).rejects.toThrow("REDIRECT /login");
      expect(calls()).toEqual([0, 0, 0, 0]);
    });
    it(`${name}: USER -> 403`, async () => {
      s.session = user;
      await expect(run()).rejects.toThrow("FORBIDDEN");
      expect(calls()).toEqual([0, 0, 0, 0]);
    });
  }
});

describe("ADMIN", () => {
  beforeEach(() => {
    s.session = admin;
  });
  it("without id creates and goes to the edit page; with id updates; the cache tag is expired", async () => {
    s.create.mockResolvedValue({ ok: true, id: "n1", message: "Saved." });
    await expect(saveOffering(idle, new FormData())).rejects.toThrow("REDIRECT /admin/offerings/n1?saved=created");
    expect(s.create.mock.calls[0][2]).toBe("u-admin");
    expect(s.updateTag).toHaveBeenCalledWith("offerings");
    s.update.mockResolvedValue({ ok: true, id: "o1", message: "Saved.", version: "7" });
    const fd = new FormData();
    fd.set("id", "o1");
    expect(await saveOffering(idle, fd)).toEqual({ status: "ok", message: "Saved.", version: "7" });
    expect(s.update.mock.calls[0][1]).toBe("o1");
  });
  it("a refused save returns the field errors and does not expire the cache", async () => {
    s.update.mockResolvedValue({ ok: false, message: "Please fix", fieldErrors: { body: ["x"] } });
    const fd = new FormData();
    fd.set("id", "o1");
    expect(await saveOffering(idle, fd)).toMatchObject({ status: "error", fieldErrors: { body: ["x"] } });
    expect(s.updateTag).not.toHaveBeenCalled();
  });
  it("a database error gives a friendly message, not a crash", async () => {
    s.create.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await saveOffering(idle, new FormData())).toMatchObject({ status: "error" });
    err.mockRestore();
  });
  it("hide / restore go to the service with the admin id and expire the cache", async () => {
    s.publish.mockResolvedValue({ ok: true, id: "o1", message: "Hidden" });
    await expect(setOfferingVisible("o1", false, new FormData())).rejects.toThrow("REDIRECT /admin/offerings?saved=hidden");
    expect(s.publish).toHaveBeenCalledWith(expect.anything(), "o1", false, "u-admin");
    await expect(setOfferingVisible("o1", true, new FormData())).rejects.toThrow("REDIRECT /admin/offerings?saved=restored");
    expect(s.updateTag).toHaveBeenCalledTimes(2);
  });
});

describe("no delete anywhere in the offerings admin", () => {
  it("service and actions have no delete call", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const f of ["lib/admin/offerings-service.ts", "app/admin/offerings/actions.ts", "app/admin/offerings/page.tsx", "components/admin/OfferingForm.tsx"]) {
      expect(readFileSync(join(__dirname, "..", f), "utf8"), f).not.toMatch(/\.delete(Many)?\(|\$executeRaw|\$queryRaw|DELETE\s+FROM/i);
    }
  });
});
