/**
 * Task 12.13: the legal actions refuse logged-out visitors and USERs (nothing happens), and an ADMIN's call reaches the service with
 * the admin id. The public cache tag is expired only after a successful publish / restore. Real requireAdmin; framework parts and the service are faked.
 * Also: no delete call and no "Delete" wording in the legal files.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  hasCookie: true,
  session: null as null | { user: { id: string; email: string; name: string | null; role: "USER" | "ADMIN" } },
  save: vi.fn(),
  publish: vi.fn(),
  restore: vi.fn(),
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
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/admin/legal-service", () => ({ saveLegalDraft: s.save, publishLegalDraft: s.publish, restoreLawyerApproved: s.restore }));

import { publishLegalAction, restoreLawyerApprovedAction, saveLegalDraftAction } from "@/app/admin/legal/actions";

const admin = { user: { id: "u-admin", email: "admin@atiana.test", name: null, role: "ADMIN" as const } };
const user = { user: { id: "u-user", email: "user@atiana.test", name: null, role: "USER" as const } };
const idle = { status: "idle" } as const;
const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};
const all = () => [s.save, s.publish, s.restore, s.updateTag];

beforeEach(() => {
  process.env.AUTH_SECRET = "test-secret-not-real";
  s.hasCookie = true;
  s.session = null;
  for (const f of all()) f.mockReset();
});

describe("logged out / USER: refused, nothing happens", () => {
  const actions: [string, () => Promise<unknown>][] = [
    ["saveLegalDraftAction", () => saveLegalDraftAction(idle, form({ key: "terms", value: "x", version: "1" }))],
    ["publishLegalAction", () => publishLegalAction("terms", form({ version: "2", confirm: "yes" }))],
    ["restoreLawyerApprovedAction", () => restoreLawyerApprovedAction("terms", new FormData())],
  ];
  for (const [name, run] of actions) {
    it(`${name}: logged out -> redirect to /login`, async () => {
      s.hasCookie = false;
      await expect(run()).rejects.toThrow("REDIRECT /login");
      expect(all().map((f) => f.mock.calls.length)).toEqual([0, 0, 0, 0]);
    });
    it(`${name}: USER -> 403`, async () => {
      s.session = user;
      await expect(run()).rejects.toThrow("FORBIDDEN");
      expect(all().map((f) => f.mock.calls.length)).toEqual([0, 0, 0, 0]);
    });
  }
});

describe("ADMIN", () => {
  beforeEach(() => {
    s.session = admin;
  });
  it("save draft goes to the service with the admin id; a draft does NOT touch the public cache", async () => {
    s.save.mockResolvedValue({ ok: true, message: "Draft saved. It is not public.", version: "2", value: "v" });
    const r = await saveLegalDraftAction(idle, form({ key: "terms", value: "text", note: "n", version: "1" }));
    expect(r).toMatchObject({ status: "ok", version: "2" });
    expect(s.save).toHaveBeenCalledWith(expect.anything(), { key: "terms", value: "text", note: "n", version: "1" }, "u-admin");
    expect(s.updateTag).not.toHaveBeenCalled();
  });
  it("save draft: a refused save shows the problems; STALE sets the stale flag", async () => {
    s.save.mockResolvedValue({ ok: false, code: "INVALID", message: "Cannot save.", problems: ["p1"] });
    expect(await saveLegalDraftAction(idle, form({ key: "terms", value: "x", version: "1" }))).toEqual({ status: "error", message: "Cannot save.", problems: ["p1"], stale: false });
    s.save.mockResolvedValue({ ok: false, code: "STALE", message: "Reload." });
    expect(await saveLegalDraftAction(idle, form({ key: "terms", value: "x", version: "1" }))).toMatchObject({ status: "error", stale: true });
  });
  it("save draft: an unexpected error gives a friendly message, no crash", async () => {
    s.save.mockRejectedValue(new Error("boom"));
    expect(await saveLegalDraftAction(idle, form({ key: "terms" }))).toMatchObject({ status: "error" });
  });
  it("publish: passes slug, version and the tick box value; success expires the cache tag and redirects to 'published'", async () => {
    s.publish.mockResolvedValue({ ok: true, message: "", version: "2", value: "" });
    await expect(publishLegalAction("terms", form({ version: "2", confirm: "yes" }))).rejects.toThrow("REDIRECT /admin/legal/terms/publish?done=published");
    expect(s.publish).toHaveBeenCalledWith(expect.anything(), { slug: "terms", version: "2", confirm: "yes" }, "u-admin");
    expect(s.updateTag).toHaveBeenCalledWith("legal-pages");
  });
  it("publish: a missing tick box is passed on as-is (the SERVICE refuses) and the cache is not touched", async () => {
    s.publish.mockResolvedValue({ ok: false, code: "NEEDS_CONFIRM", message: "tick" });
    await expect(publishLegalAction("terms", form({ version: "2" }))).rejects.toThrow("done=confirm");
    expect(s.publish).toHaveBeenCalledWith(expect.anything(), { slug: "terms", version: "2", confirm: null }, "u-admin");
    expect(s.updateTag).not.toHaveBeenCalled();
  });
  it("publish: every refusal maps to its own flag, a crash to 'failed'", async () => {
    for (const [code, flag] of [["NO_CHANGE", "same"], ["STALE", "stale"], ["INVALID", "invalid"], ["NOT_FOUND", "failed"]] as const) {
      s.publish.mockResolvedValue({ ok: false, code, message: "m" });
      await expect(publishLegalAction("terms", form({ version: "2", confirm: "yes" }))).rejects.toThrow(`done=${flag}`);
    }
    s.publish.mockRejectedValue(new Error("boom"));
    await expect(publishLegalAction("terms", form({ version: "2", confirm: "yes" }))).rejects.toThrow("done=failed");
    expect(s.updateTag).not.toHaveBeenCalled();
  });
  it("a bad slug never becomes part of the redirect address", async () => {
    s.publish.mockResolvedValue({ ok: false, code: "NOT_FOUND", message: "m" });
    await expect(publishLegalAction("../../evil", form({}))).rejects.toThrow("REDIRECT /admin/legal//publish?done=failed");
    expect(s.publish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ slug: "" }), "u-admin");
  });
  it("restore: success expires the cache tag; 'already' does not; redirects to the editor", async () => {
    s.restore.mockResolvedValue({ ok: true, message: "", version: "3", value: "" });
    await expect(restoreLawyerApprovedAction("terms", new FormData())).rejects.toThrow(/REDIRECT \/admin\/legal\/terms\?done=restored&n=\d+/);
    expect(s.restore).toHaveBeenCalledWith(expect.anything(), "terms", "u-admin");
    expect(s.updateTag).toHaveBeenCalledWith("legal-pages");
    s.updateTag.mockReset();
    s.restore.mockResolvedValue({ ok: false, code: "NO_CHANGE", message: "same" });
    await expect(restoreLawyerApprovedAction("terms", new FormData())).rejects.toThrow("done=nochange");
    expect(s.updateTag).not.toHaveBeenCalled();
  });
});

describe("no delete in the legal editor", () => {
  const files = ["lib/admin/legal-service.ts", "lib/legal-published.ts", "lib/legal-versions.ts", "lib/legal-cached.ts", "app/admin/legal/actions.ts", "app/admin/legal/page.tsx", "app/admin/legal/[slug]/page.tsx", "app/admin/legal/[slug]/publish/page.tsx", "app/admin/legal/[slug]/versions/page.tsx", "components/admin/LegalPublishPanel.tsx", "components/admin/LegalOverviewCard.tsx", "prisma/seed-legal.ts"];
  it("no delete call, no raw delete SQL, no 'Delete' wording", () => {
    for (const f of files) {
      const src = readFileSync(join(__dirname, "..", f), "utf8");
      expect(src, f).not.toMatch(/\.delete(Many)?\(|DELETE\s+FROM|TRUNCATE|DROP\s+TABLE/i);
      expect(src, f).not.toMatch(/>\s*Delete\b|"Delete\b|\bDelete\s+(this|the)\b/);
    }
  });
});
