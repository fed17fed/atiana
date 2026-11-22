/**
 * "Mark as unread" (2026-11-21): the action refuses logged-out visitors and USERs; the service is one conditional update
 * (idempotent, one audit row, no personal data in the audit text). Real requireAdmin; only framework parts are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  hasCookie: true,
  session: null as null | { user: { id: string; email: string; name: string | null; role: "USER" | "ADMIN" } },
  unread: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ has: () => s.hasCookie }) }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/cache", () => ({ updateTag: () => {}, revalidatePath: () => {}, cacheTag: () => {}, cacheLife: () => {} }));
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
vi.mock("@/lib/admin/messages-service", () => ({ markMessageRead: vi.fn(), markMessageUnread: s.unread }));

import { markMessageUnreadAction } from "@/app/admin/messages/actions";
import { markMessageUnread } from "@/lib/admin/messages-service";

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-not-real";
  s.hasCookie = true;
  s.session = null;
  for (const f of [s.unread, s.updateMany, s.findUnique, s.audit]) f.mockReset();
  s.audit.mockResolvedValue({});
});

describe("markMessageUnreadAction guard", () => {
  it("logged out -> redirect to /login, service not called", async () => {
    s.hasCookie = false;
    await expect(markMessageUnreadAction("m1", new FormData())).rejects.toThrow("REDIRECT /login");
    expect(s.unread).not.toHaveBeenCalled();
  });
  it("USER -> 403, service not called", async () => {
    s.session = { user: { id: "u", email: "u@atiana.test", name: null, role: "USER" } };
    await expect(markMessageUnreadAction("m1", new FormData())).rejects.toThrow("FORBIDDEN");
    expect(s.unread).not.toHaveBeenCalled();
  });
  it("ADMIN -> service called with the admin id", async () => {
    s.session = { user: { id: "u-admin", email: "a@atiana.test", name: null, role: "ADMIN" } };
    s.unread.mockResolvedValue({ ok: true, changed: true });
    await markMessageUnreadAction("m1", new FormData());
    expect(s.unread).toHaveBeenCalledWith(expect.anything(), "m1", "u-admin");
  });
});

describe("markMessageUnread service", async () => {
  const real = await vi.importActual<typeof import("@/lib/admin/messages-service")>("@/lib/admin/messages-service");
  const db = () => ({ contactMessage: { updateMany: s.updateMany, findUnique: s.findUnique }, adminAuditLog: { create: s.audit } }) as never;

  it("a read message changes: conditional update (readAt not null -> null) + one audit row without personal data", async () => {
    s.updateMany.mockResolvedValue({ count: 1 });
    expect(await real.markMessageUnread(db(), "m1", "admin1")).toEqual({ ok: true, changed: true });
    expect(s.updateMany).toHaveBeenCalledWith({ where: { id: "m1", readAt: { not: null } }, data: { readAt: null } });
    expect(s.audit).toHaveBeenCalledTimes(1);
    const data = s.audit.mock.calls[0][0].data;
    expect(data).toMatchObject({ action: "message.markUnread", entity: "ContactMessage", entityId: "m1", userId: "admin1" });
    expect(data.summary).not.toMatch(/@/);
  });
  it("already unread: no change, no audit row (idempotent)", async () => {
    s.updateMany.mockResolvedValue({ count: 0 });
    s.findUnique.mockResolvedValue({ id: "m1" });
    expect(await real.markMessageUnread(db(), "m1", "admin1")).toEqual({ ok: true, changed: false });
    expect(s.audit).not.toHaveBeenCalled();
  });
  it("unknown id or a bad id type: not found, no audit row", async () => {
    s.updateMany.mockResolvedValue({ count: 0 });
    s.findUnique.mockResolvedValue(null);
    expect(await real.markMessageUnread(db(), "nope", "admin1")).toMatchObject({ ok: false });
    expect(await real.markMessageUnread(db(), { $ne: 1 }, "admin1")).toMatchObject({ ok: false });
    expect(await real.markMessageUnread(db(), "x".repeat(65), "admin1")).toMatchObject({ ok: false });
    expect(s.audit).not.toHaveBeenCalled();
    void markMessageUnread;
  });
});
