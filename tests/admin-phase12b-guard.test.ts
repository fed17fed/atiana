/**
 * Tasks 12.11, 12.12, 12.14: the new admin actions and the CSV route refuse logged-out visitors and USERs, and do nothing.
 * Real requireAdmin; only framework parts and the services are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  hasCookie: true,
  session: null as null | { user: { id: string; email: string; name: string | null; role: "USER" | "ADMIN" } },
  create: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
  upload: vi.fn(),
  exportRows: vi.fn(),
  audit: vi.fn(),
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
vi.mock("@/lib/prisma", () => ({ prisma: { adminAuditLog: { create: s.audit } } }));
vi.mock("@/lib/admin/testimonials-service", () => ({ createTestimonial: s.create, updateTestimonial: s.update, setTestimonialPublished: s.publish }));
vi.mock("@/lib/images/service", () => ({ uploadImage: s.upload }));
vi.mock("@/lib/admin/read-queries", async (orig) => ({ ...(await orig<typeof import("@/lib/admin/read-queries")>()), exportSubscribers: s.exportRows }));

import { GET as exportCsv } from "@/app/admin/subscribers/export/route";
import { uploadImageAction } from "@/app/admin/images/actions";
import { saveTestimonial, setTestimonialVisible } from "@/app/admin/testimonials/actions";

const admin = { user: { id: "u-admin", email: "admin@atiana.test", name: null, role: "ADMIN" as const } };
const user = { user: { id: "u-user", email: "user@atiana.test", name: null, role: "USER" as const } };
const idle = { status: "idle" } as const;

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-not-real";
  s.hasCookie = true;
  s.session = null;
  for (const f of [s.create, s.update, s.publish, s.upload, s.exportRows, s.audit, s.updateTag]) f.mockReset();
  s.audit.mockResolvedValue({});
});

const calls = () => [s.create, s.update, s.publish, s.upload, s.exportRows, s.audit, s.updateTag].map((f) => f.mock.calls.length);

describe("logged out / USER: refused, nothing happens", () => {
  const actions: [string, () => Promise<unknown>][] = [
    ["saveTestimonial", () => saveTestimonial(idle, new FormData())],
    ["setTestimonialVisible", () => setTestimonialVisible("t1", false, new FormData())],
    ["uploadImageAction", () => uploadImageAction(idle, new FormData())],
    ["CSV export", () => exportCsv(new Request("http://x/admin/subscribers/export"))],
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
  it("saveTestimonial without id creates, with id updates; the cache tag is expired", async () => {
    s.create.mockResolvedValue({ ok: true, id: "n1", message: "Testimonial added." });
    await expect(saveTestimonial(idle, new FormData())).rejects.toThrow("REDIRECT /admin/testimonials?saved=added");
    expect(s.create).toHaveBeenCalledTimes(1);
    expect(s.create.mock.calls[0][2]).toBe("u-admin");
    expect(s.updateTag).toHaveBeenCalledWith("testimonials");
    s.update.mockResolvedValue({ ok: true, id: "t1", message: "Saved.", version: "5" });
    const fd = new FormData();
    fd.set("id", "t1");
    expect(await saveTestimonial(idle, fd)).toEqual({ status: "ok", message: "Saved.", version: "5" });
    expect(s.update.mock.calls[0][1]).toBe("t1");
  });
  it("a refused save (consent) returns the field errors and does not expire the cache", async () => {
    s.update.mockResolvedValue({ ok: false, message: "Please fix", fieldErrors: { clientAgreed: ["x"] } });
    const fd = new FormData();
    fd.set("id", "t1");
    expect(await saveTestimonial(idle, fd)).toMatchObject({ status: "error", fieldErrors: { clientAgreed: ["x"] } });
    expect(s.updateTag).not.toHaveBeenCalled();
  });
  it("a database error gives a friendly message, not a crash", async () => {
    s.create.mockRejectedValue(new Error("db down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await saveTestimonial(idle, new FormData())).toMatchObject({ status: "error" });
    err.mockRestore();
  });
  it("hide / show goes to the service with the admin id", async () => {
    s.publish.mockResolvedValue({ ok: true, id: "t1", message: "Hidden" });
    await expect(setTestimonialVisible("t1", false, new FormData())).rejects.toThrow("REDIRECT /admin/testimonials?saved=hidden");
    expect(s.publish).toHaveBeenCalledWith(expect.anything(), "t1", false, "u-admin");
  });
  it("uploadImageAction passes file bytes, alt and the admin id", async () => {
    s.upload.mockResolvedValue({ ok: true, image: { id: "m", url: "/uploads/a.webp", alt: "A", width: 1, height: 1 } });
    const fd = new FormData();
    fd.set("file", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }));
    fd.set("alt", "A");
    const r = await uploadImageAction(idle, fd);
    expect(r.status).toBe("ok");
    const [, file, alt, who] = s.upload.mock.calls[0];
    expect([file.size, alt, who]).toEqual([3, "A", "u-admin"]);
  });
  it("CSV export: neutralizes formulas, writes one audit row, sends a download", async () => {
    s.exportRows.mockResolvedValue([{ email: "=cmd@x.com", status: "ACTIVE", source: null, consentAt: null, createdAt: new Date("2026-11-21T10:00:00Z") }]);
    const res = await exportCsv(new Request("http://x/admin/subscribers/export?q=cmd"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="subscribers-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(text).toContain("'=cmd@x.com,ACTIVE");
    expect(text).not.toMatch(/\n=cmd/);
    expect(s.audit.mock.calls[0][0].data).toMatchObject({ userId: "u-admin", action: "subscribers.export", entity: "NewsletterSubscriber" });
    expect(s.audit.mock.calls[0][0].data.summary).not.toMatch(/cmd/);
  });
});
