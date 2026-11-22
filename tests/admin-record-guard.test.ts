/** A12-8: an unknown admin id / key / slug gets a real 404 from the proxy (only after the admin check). Plus A12-4..A12-10 source checks. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextTabIndex } from "@/components/admin/tab-keys";
import { adminRecordRef, guardAdminRecord } from "@/lib/route-guard";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

describe("adminRecordRef", () => {
  it("finds the record in the six one-record routes and their sub pages", () => {
    expect(adminRecordRef("/admin/offerings/abc123")).toEqual({ kind: "offering", id: "abc123" });
    expect(adminRecordRef("/admin/sessions/abc/")).toEqual({ kind: "session", id: "abc" });
    expect(adminRecordRef("/admin/packages/p1")).toEqual({ kind: "package", id: "p1" });
    expect(adminRecordRef("/admin/testimonials/t1")).toEqual({ kind: "testimonial", id: "t1" });
    expect(adminRecordRef("/admin/texts/home.hero.title/history")).toEqual({ kind: "text", id: "home.hero.title" });
    expect(adminRecordRef("/admin/legal/terms/publish")).toEqual({ kind: "legal", id: "terms" });
    expect(adminRecordRef("/admin/legal/terms/versions")).toEqual({ kind: "legal", id: "terms" });
  });
  it("lists, add forms, exports and other paths are not records", () => {
    for (const p of ["/admin", "/admin/offerings", "/admin/offerings/new", "/admin/sessions/new", "/admin/testimonials/new", "/admin/bookings/export", "/admin/slots", "/about", "/admin/offerings/a/b/c"]) expect(adminRecordRef(p), p).toBeNull();
  });
  it("N18-3: NUL, spaces, slashes, dots-only tricks and other odd bytes are not real ids", () => {
    for (const odd of ["%00", "a%00b", "%20", "a%20b", "a%2Fb", "%3Cscript%3E", "%C3%A9", "a%0Ab", "%EF%BF%BD"]) {
      expect(adminRecordRef(`/admin/offerings/${odd}`), odd).toEqual({ kind: "offering", id: "" });
    }
    expect(adminRecordRef("/admin/texts/home.hero.title")).toEqual({ kind: "text", id: "home.hero.title" });
    expect(adminRecordRef("/admin/offerings/cmwdisykv00008zvx5egg5n32")).toEqual({ kind: "offering", id: "cmwdisykv00008zvx5egg5n32" });
  });
  it("odd ids are a 404 without a database call", async () => {
    const boom = async () => {
      throw new Error("must not be called");
    };
    expect(await guardAdminRecord("/admin/offerings/%00", boom)).toEqual({ action: "not-found" });
  });
  it("a broken %-escape is not a real record", () => {
    expect(adminRecordRef("/admin/offerings/%E0%A4%A")).toEqual({ kind: "offering", id: "" });
  });
});

describe("guardAdminRecord", () => {
  it("not found -> 404 action; found -> next; other path -> next without asking the database", async () => {
    let asked = 0;
    const exists = (v: boolean) => async () => {
      asked++;
      return v;
    };
    expect(await guardAdminRecord("/admin/offerings/nope", exists(false))).toEqual({ action: "not-found" });
    expect(await guardAdminRecord("/admin/offerings/real", exists(true))).toEqual({ action: "next" });
    expect(asked).toBe(2);
    expect(await guardAdminRecord("/admin/offerings", exists(false))).toEqual({ action: "next" });
    expect(asked).toBe(2);
  });
  it("empty or very long id -> 404 without a database call; database error -> the page decides (next)", async () => {
    const boom = async () => {
      throw new Error("db down");
    };
    expect(await guardAdminRecord("/admin/offerings/%E0%A4%A", boom)).toEqual({ action: "not-found" });
    expect(await guardAdminRecord(`/admin/offerings/${"a".repeat(200)}`, boom)).toEqual({ action: "not-found" });
    expect(await guardAdminRecord("/admin/offerings/abc", boom)).toEqual({ action: "next" });
  });
  it("the proxy runs it only after the admin check (result.action next) and for /admin/ paths", () => {
    const p = read("proxy.ts");
    expect(p).toMatch(/result\.action === "next" && pathname\.startsWith\("\/admin\/"\)/);
    expect(p.indexOf("guardAdminRecord(pathname")).toBeGreaterThan(p.indexOf('result.action === "forbidden"'));
  });
});

describe("tab keys (A12-4)", () => {
  it("arrows wrap, Home and End jump, other keys do nothing", () => {
    expect(nextTabIndex("ArrowRight", 0, 2)).toBe(1);
    expect(nextTabIndex("ArrowRight", 1, 2)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 2)).toBe(1);
    expect(nextTabIndex("Home", 1, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
    expect(nextTabIndex("a", 0, 2)).toBeNull();
    expect(nextTabIndex("ArrowRight", 0, 0)).toBeNull();
  });
  it("text editor, legal publish panel and image picker all use the handler with a roving tabindex", () => {
    for (const f of ["components/admin/TextEditor.tsx", "components/admin/LegalPublishPanel.tsx", "components/admin/ImagePicker.tsx"]) {
      const t = read(f);
      expect(t, f).toContain("tabKeyHandler(");
      expect(t, f).toMatch(/tabIndex=\{tab === /);
    }
  });
});

describe("a11y and wording fixes (A12-5, A12-6, A12-7, A12-9)", () => {
  it("A12-5: accessible names start with the visible words", () => {
    expect(read("app/admin/messages/page.tsx")).toContain("Mark as read: message from");
    expect(read("app/admin/messages/page.tsx")).toContain("Mark as unread: message from");
    expect(read("app/admin/legal/page.tsx")).toContain("View page: ");
  });
  it("A12-6: no tabpanel role on the form element", () => {
    const t = read("components/admin/TextEditor.tsx");
    expect(t).not.toMatch(/<form[^>]*role="tabpanel"/);
    expect(t).toMatch(/<div id="te-edit-panel"[^>]*role="tabpanel"/);
  });
  it("A12-7: the offering preview starts at h2 (the page has an h1)", () => {
    expect(read("components/admin/OfferingForm.tsx")).toContain("headingLevel={2}");
  });
  it("A12-9: no 'Remove image' (admin never says remove/delete for a picture)", () => {
    expect(read("components/admin/ImagePicker.tsx")).not.toMatch(/>\s*Remove image\s*</);
    expect(read("components/admin/ImagePicker.tsx")).toContain("Use no image");
  });
  it("A12-10: the login box keeps the typed text after an error (typing before the page has loaded is not covered)", () => {
    expect(read("app/login/actions.ts")).toMatch(/email: typed/);
    expect(read("components/pages/LoginForms.tsx")).toMatch(/value=\{email\} onChange/);
  });
});

describe("N18-4 and login wording", () => {
  it("the 403 page made in the proxy has a main landmark around all content", () => {
    const p = read("proxy.ts");
    const html = p.slice(p.indexOf("403 – No access"), p.indexOf('{ status: 403'));
    expect(html).toContain("<main>");
    expect(html).toContain("</main></body>");
    expect(html.indexOf("<main>")).toBeLessThan(html.indexOf("<h1>"));
  });
  it("login page text (owner choice): no 'creates your account'", () => {
    const t = read("app/login/page.tsx");
    expect(t).toContain("Log in with your email. We send you a sign-in link.");
    expect(t).not.toMatch(/New here|creates your account/);
  });
  it('the "Check your email" screen has a "Back to the login form" link to /login', () => {
    const t = read("app/login/page.tsx");
    expect(t).toMatch(/href="\/login"[^>]*>\s*Back to the login form/);
  });
});
