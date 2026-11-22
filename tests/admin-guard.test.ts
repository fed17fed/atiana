/**
 * Task 12.3: every admin page and Server Action refuses people who are not admins.
 * These tests run the REAL requireAdmin (lib/session.ts). Only the framework parts are faked:
 * cookies, redirect(), forbidden() and the Auth.js session lookup.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  hasCookie: true as boolean,
  session: null as null | { user: { id: string; email: string; name: string | null; role: "USER" | "ADMIN" } },
  addSlots: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ has: () => state.hasCookie }) }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  forbidden: () => {
    throw new Error("FORBIDDEN");
  },
}));
vi.mock("@/lib/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/slots-service", () => ({ addOneToOneSlots: state.addSlots }));
vi.mock("@/lib/prisma", () => ({ prisma: { adminAuditLog: { create: state.auditCreate } } }));

import { addSlots } from "@/app/admin/slots/actions";
import { requireAdmin } from "@/lib/session";

const admin = { user: { id: "u-admin", email: "admin@atiana.test", name: null, role: "ADMIN" as const } };
const user = { user: { id: "u-user", email: "user@atiana.test", name: null, role: "USER" as const } };
const form = () => new FormData();

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-not-real";
  state.hasCookie = true;
  state.session = null;
  state.addSlots.mockReset().mockResolvedValue({ ok: true, created: 2, skipped: 1 });
  state.auditCreate.mockReset().mockResolvedValue({});
});

describe("requireAdmin", () => {
  it("logged out (no cookie) -> redirect to /login with next", async () => {
    state.hasCookie = false;
    await expect(requireAdmin("/admin")).rejects.toThrow("REDIRECT /login?next=%2Fadmin");
  });
  it("cookie but no valid session -> redirect to /login", async () => {
    await expect(requireAdmin("/admin/slots")).rejects.toThrow("REDIRECT /login?next=%2Fadmin%2Fslots");
  });
  it("USER -> 403 (forbidden)", async () => {
    state.session = user;
    await expect(requireAdmin("/admin")).rejects.toThrow("FORBIDDEN");
  });
  it("ADMIN -> allowed", async () => {
    state.session = admin;
    await expect(requireAdmin("/admin")).resolves.toMatchObject({ id: "u-admin", role: "ADMIN" });
  });
});

describe("admin Server Action addSlots", () => {
  it("is refused for a logged-out visitor and does nothing", async () => {
    state.hasCookie = false;
    await expect(addSlots({ status: "idle" }, form())).rejects.toThrow("REDIRECT /login");
    expect(state.addSlots).not.toHaveBeenCalled();
    expect(state.auditCreate).not.toHaveBeenCalled();
  });
  it("is refused for a USER and does nothing", async () => {
    state.session = user;
    await expect(addSlots({ status: "idle" }, form())).rejects.toThrow("FORBIDDEN");
    expect(state.addSlots).not.toHaveBeenCalled();
    expect(state.auditCreate).not.toHaveBeenCalled();
  });
  it("works for an ADMIN and writes one audit row (who + what)", async () => {
    state.session = admin;
    const r = await addSlots({ status: "idle" }, form());
    expect(r.status).toBe("ok");
    expect(state.auditCreate).toHaveBeenCalledTimes(1);
    expect(state.auditCreate.mock.calls[0][0].data).toMatchObject({ userId: "u-admin", action: "slots.add", entity: "ClassSession" });
  });
  it("a failed audit write does not undo or fail the action", async () => {
    state.session = admin;
    state.auditCreate.mockRejectedValue(new Error("relation AdminAuditLog does not exist"));
    const r = await addSlots({ status: "idle" }, form());
    expect(r.status).toBe("ok");
  });
  it("no audit row when nothing was created", async () => {
    state.session = admin;
    state.addSlots.mockResolvedValue({ ok: true, created: 0, skipped: 3 });
    await addSlots({ status: "idle" }, form());
    expect(state.auditCreate).not.toHaveBeenCalled();
  });
});
