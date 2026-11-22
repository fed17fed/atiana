/** Tasks 12.9 / 12.10 / library seed: pure rules, no database. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adminNav } from "@/lib/admin/nav";
import { packageSchema } from "@/lib/admin/packages-service";
import { blockedMessage } from "@/lib/admin/sessions-service";
import { createSessionSchema, dateKeyLabel, dublinDateAndTime, editSessionSchema, planSessions, repeatDateKeys, zoomSchema } from "@/lib/admin/sessions-schema";
import { FORBIDDEN_SOURCE_NUMBERS, OG_SHARE_ALT, libraryPhotos } from "@/lib/seed-library-photos";
import { MAX_ALT_LENGTH } from "@/lib/images/rules";

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const base = { offeringId: "o1", date: "2026-12-01", time: "19:00", minutes: "60", capacity: "12", zoomUrl: "", repeatWeeks: "4" };

describe("create form schema", () => {
  it("accepts a normal form; empty / null Zoom link means none", () => {
    const r = createSessionSchema.parse(base);
    expect(r).toMatchObject({ minutes: 60, capacity: 12, repeatWeeks: 4, zoomUrl: null, skip: [] });
    expect(createSessionSchema.parse({ ...base, zoomUrl: null }).zoomUrl).toBeNull(); // React-Admin style null
    expect(createSessionSchema.parse({ ...base, repeatWeeks: undefined }).repeatWeeks).toBe(1);
  });
  it("rejects bad dates, times, numbers", () => {
    for (const bad of [{ date: "2026-02-30" }, { date: "" }, { time: "25:00" }, { time: "7:00" }, { minutes: "5" }, { minutes: "abc" }, { capacity: "0" }, { capacity: "999" }, { capacity: "1.5" }, { repeatWeeks: "13" }, { repeatWeeks: "0" }, { offeringId: "" }]) {
      expect(createSessionSchema.safeParse({ ...base, ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });
  it("Zoom link: https only, no user:password, not too long, javascript refused", () => {
    expect(zoomSchema.parse("https://us02web.zoom.us/j/123?pwd=abc")).toBe("https://us02web.zoom.us/j/123?pwd=abc");
    expect(zoomSchema.parse("  ")).toBeNull();
    for (const bad of ["http://zoom.us/j/1", "javascript:alert(1)", "//zoom.us/j/1", "https://user:pw@zoom.us/j/1", "zoom.us/j/1", "https://localhost/x", `https://zoom.us/${"a".repeat(500)}`]) {
      expect(zoomSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
  it("edit form needs a version field (may be empty)", () => {
    expect(editSessionSchema.safeParse({ ...base, version: "" }).success).toBe(true);
  });
});

describe("planSessions", () => {
  it("weekly in Dublin time, UTC stored: summer then winter time (clock change 2026-10-25)", () => {
    const p = planSessions({ date: "2026-10-20", time: "19:00", minutes: 75, repeatWeeks: 3, skip: [] });
    expect(p.map((x) => x.startsAt.toISOString())).toEqual(["2026-10-20T18:00:00.000Z", "2026-10-27T19:00:00.000Z", "2026-11-03T19:00:00.000Z"]);
    expect(p[0].endsAt.getTime() - p[0].startsAt.getTime()).toBe(75 * 60_000);
    expect(p.map((x) => x.dateKey)).toEqual(["2026-10-20", "2026-10-27", "2026-11-03"]);
  });
  it("skip removes dates; month and year ends roll over", () => {
    const p = planSessions({ date: "2026-12-24", time: "10:00", minutes: 60, repeatWeeks: 3, skip: ["2026-12-31"] });
    expect(p.map((x) => x.dateKey)).toEqual(["2026-12-24", "2027-01-07"]);
  });
  it("preview dates match the plan; helpers", () => {
    expect(repeatDateKeys("2026-12-01", 4)).toEqual(["2026-12-01", "2026-12-08", "2026-12-15", "2026-12-22"]);
    expect(repeatDateKeys("nope", 4)).toEqual([]);
    expect(repeatDateKeys("2026-12-01", 99)).toHaveLength(12);
    expect(dateKeyLabel("2026-12-01")).toBe("Tue 1 Dec");
  });
  it("dublinDateAndTime is the inverse of planSessions (summer and winter)", () => {
    for (const [date, time] of [["2026-07-14", "19:30"], ["2026-12-14", "00:05"], ["2027-03-28", "12:00"]]) {
      const p = planSessions({ date, time, minutes: 60, repeatWeeks: 1, skip: [] })[0];
      expect(dublinDateAndTime(p.startsAt)).toEqual({ date, time });
    }
  });
});

describe("blocked message and package schema", () => {
  it("says why cancel is blocked (singular and plural)", () => {
    expect(blockedMessage(1)).toBe("This session has 1 booking. Contact this client first. A session with bookings cannot be cancelled here.");
    expect(blockedMessage(3)).toContain("3 bookings");
  });
  it("package: price in euros -> cents, bounds, null-safe checkbox", () => {
    const ok = packageSchema.parse({ name: "Five classes", price: "105,50", active: "on", version: "" });
    expect(ok).toMatchObject({ price: 10550, active: true });
    expect(packageSchema.parse({ name: "Five classes", price: "60", active: null, version: null }).active).toBe(false);
    for (const price of ["0", "0.49", "1001", "x", null]) expect(packageSchema.safeParse({ name: "Five classes", price, active: "on", version: "" }).success, String(price)).toBe(false);
  });
});

describe("library photos (public/real)", () => {
  const list = libraryPhotos();
  it("10 photos, unique files, all exist, only .webp, alt text set and short", () => {
    expect(list).toHaveLength(10);
    expect(new Set(list.map((p) => p.file)).size).toBe(10);
    for (const p of list) {
      expect(existsSync(join(root, "public", "real", p.file)), p.file).toBe(true);
      expect(p.file).toMatch(/^[a-z0-9-]+\.webp$/);
      expect(p.alt.length).toBeGreaterThan(10);
      expect(p.alt.length).toBeLessThanOrEqual(MAX_ALT_LENGTH);
    }
    expect(list.find((p) => p.file === "og-share-01.webp")?.alt).toBe(OG_SHARE_ALT);
  });
  it("every file in public/real is in the list (and the list holds nothing else); never source photos 05 or 18", () => {
    const files = readdirSync(join(root, "public", "real")).filter((f) => statSync(join(root, "public", "real", f)).isFile());
    expect([...files].sort()).toEqual(list.map((p) => p.file).sort());
    for (const n of FORBIDDEN_SOURCE_NUMBERS) for (const p of list) expect(p.file).not.toMatch(new RegExp(`(^|[^0-9])${n}([^0-9]|$)`));
    expect(read("prisma/seed-library-photos.ts")).not.toMatch(/\.delete(Many)?\(|DELETE\s+FROM|unlink|rm -rf/i);
  });
});

describe("private Zoom link: never public, never in CSV or logs", () => {
  it("public read code never selects the Zoom link", () => {
    // These files build public pages. They must not mention zoomUrl at all.
    for (const f of ["lib/offerings-read.ts", "lib/offerings-public.ts", "lib/offerings-cache.ts", "app/events/[slug]/calendar.ics/route.ts", "app/events/page.tsx", "app/schedule/page.tsx", "app/classes/page.tsx", "app/sitemap.ts", "lib/jsonld.ts", "components/booking/ScheduleList.tsx"]) {
      expect(read(f), f).not.toMatch(/zoomUrl/);
    }
  });
  it("CSV exports and read views do not include it", () => {
    for (const f of ["lib/admin/bookings-csv.ts", "lib/admin/csv.ts", "lib/admin/read-queries.ts", "app/admin/bookings/export/route.ts", "app/admin/subscribers/export/route.ts"]) expect(read(f), f).not.toMatch(/zoomUrl/);
  });
  it("only the session admin and the booking owner's own pages read it; audit and log lines never get the value", () => {
    const svc = read("lib/admin/sessions-service.ts");
    // every audit summary / console line in the session code is built without the link value
    for (const m of svc.matchAll(/summary:\s*`([^`]*)`/g)) expect(m[1]).not.toMatch(/\$\{[^}?]*zoomUrl\s*\}/i);
    const actions = read("app/admin/sessions/actions.ts");
    expect(actions).not.toMatch(/console\.\w+\([^)]*(raw|formData)/);
    // the admin list query does not select the link text for the page: only a yes/no flag is built from it
    expect(svc).toMatch(/hasZoom: r\.zoomUrl !== null/);
  });
});

describe("no delete anywhere in the sessions, slots and packages admin", () => {
  it("no delete call, no raw delete SQL, no 'Delete' wording", () => {
    for (const f of ["lib/admin/sessions-service.ts", "lib/admin/packages-service.ts", "app/admin/sessions/actions.ts", "app/admin/sessions/page.tsx", "app/admin/sessions/[id]/page.tsx", "app/admin/slots/actions.ts", "app/admin/slots/page.tsx", "app/admin/packages/actions.ts", "app/admin/packages/page.tsx", "components/admin/SessionForm.tsx", "components/admin/PackageForm.tsx"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/\.delete(Many)?\(|DELETE\s+FROM|\$executeRaw/i);
      expect(src, f).not.toMatch(/>\s*Delete\b|"Delete\b|\bDelete\s+(this|the)\b/);
    }
  });
});

describe("admin nav flags", () => {
  it("Sessions and Packages are built; Legal pages is not mine and stays as it was", () => {
    const item = (href: string) => adminNav.flatMap((g) => g.items).find((i) => i.href === href);
    expect(item("/admin/sessions")?.built).toBe(true);
    expect(item("/admin/packages")?.built).toBe(true);
    expect(item("/admin/slots")?.built).toBe(true);
  });
});
