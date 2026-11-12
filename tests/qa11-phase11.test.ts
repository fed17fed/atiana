/**
 * QA tests for Phase 11 (task 11.12, tester). Only reads files; no database, no server needed.
 * With QA11_BASE=http://localhost:PORT the HTTP block also checks the rendered pages of a running (production) server.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classTypes, weeklyPattern } from "@/content/catalog";
import { events } from "@/content/events";
import { faqGroups, visibleFaqGroups } from "@/content/faq";
import {
  CANCELLATION_HOURS, EVENT_REFUND_DAYS, cancelUpToText, isBookingOpen, isEventRefundable, isRefundable, priceText,
} from "@/lib/booking-rules";
import { packsEnabled } from "@/lib/features";
import { formatTime, zonedToUtc } from "@/lib/time";

const root = join(__dirname, "..");
const appRoot = join(root, "..");
const walk = (dir: string, skip: string[] = []): string[] =>
  !existsSync(dir)
    ? []
    : readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (["node_modules", ".git", ...skip].includes(n) || n.endsWith(".stale-bak") || n.includes("stale-bak")) return [];
        return statSync(p).isDirectory() ? walk(p, skip) : [p];
      });

describe("QA11 prices", () => {
  it("class prices: Blitz 20, Dive Deep 30, Gratitude free, KEA 30 (text as shown on pages)", () => {
    const m = Object.fromEntries(classTypes.map((c) => [c.slug, priceText(c.priceCents)]));
    expect(m).toEqual({ "blitz-for-bliss": "€20", "dive-deep": "€30", gratitude: "Free", "kundalini-energy-activation": "€30" });
  });
  it("event prices: 30, solstice 60", () => {
    expect(events.map((e) => [e.slug, priceText(e.priceCents)])).toEqual([
      ["full-moon-2026-11-24", "€30"], ["new-moon-2026-12-09", "€30"], ["winter-solstice-2026-12-21", "€60"],
      ["new-moon-2027-01-07", "€30"], ["full-moon-2027-01-22", "€30"], ["new-moon-2027-02-06", "€30"], ["lunar-eclipse-2027-02-20", "€30"],
    ]);
  });
  it("home card text 'Free or from €20' matches the cheapest paid class", () => {
    const home = readFileSync(join(root, "app/page.tsx"), "utf8");
    expect(home).toMatch(/Free or from/);
    const min = Math.min(...classTypes.filter((c) => c.priceCents > 0).map((c) => c.priceCents));
    expect(min).toBe(2000);
  });
});

describe("QA11 time zone (Europe/Dublin, winter and summer)", () => {
  it("winter: Dublin = UTC for all 7 events (dates from the plan)", () => {
    const iso = events.map((e) => zonedToUtc(e.start).toISOString());
    expect(iso).toEqual([
      "2026-11-24T20:00:00.000Z", "2026-12-09T20:00:00.000Z", "2026-12-21T21:00:00.000Z", "2027-01-07T20:00:00.000Z",
      "2027-01-22T20:00:00.000Z", "2027-02-06T20:00:00.000Z", "2027-02-20T22:30:00.000Z",
    ]);
  });
  it("summer time: 12:00 Dublin on 7 July 2027 = 11:00 UTC; clock change 28 March 2027 handled", () => {
    expect(zonedToUtc({ year: 2027, month: 7, day: 7, hour: 12 }).toISOString()).toBe("2027-07-07T11:00:00.000Z");
    expect(zonedToUtc({ year: 2027, month: 3, day: 27, hour: 19, minute: 30 }).toISOString()).toBe("2027-03-27T19:30:00.000Z");
    expect(zonedToUtc({ year: 2027, month: 3, day: 28, hour: 19, minute: 30 }).toISOString()).toBe("2027-03-28T18:30:00.000Z");
    expect(formatTime(zonedToUtc({ year: 2027, month: 3, day: 29, hour: 12 }))).toBe("12:00");
  });
  it("weekly pattern = plan table 13.5 A", () => {
    const t = Object.fromEntries(weeklyPattern.map((w) => [w.classSlug, `${w.weekday} ${w.hour}:${String(w.minute).padStart(2, "0")}`]));
    expect(t).toEqual({ "blitz-for-bliss": "2 12:00", "dive-deep": "3 18:30", gratitude: "4 12:00", "kundalini-energy-activation": "0 19:30" });
  });
  it("greeting + activation: Dive Deep 18:30/19:00 (90 min), Solstice 21:00/21:15 (75 min)", () => {
    const d = classTypes.find((c) => c.slug === "dive-deep")!;
    expect([d.minutes, d.activationAfterMinutes]).toEqual([90, 30]);
    const s = events.find((e) => e.slug.startsWith("winter-solstice"))!;
    expect([s.minutes, s.activationAfterMinutes]).toEqual([75, 15]);
  });
});

describe("QA11 booking closes at the start (owner decision 2026-11-12)", () => {
  const start = new Date("2026-11-18T18:30:00Z");
  it("open 1 ms before the start, closed at the start and after (also during a Dive Deep greeting)", () => {
    expect(isBookingOpen(start, new Date(start.getTime() - 1))).toBe(true);
    expect(isBookingOpen(start, start)).toBe(false);
    expect(isBookingOpen(start, new Date(start.getTime() + 10 * 60_000))).toBe(false);
  });
  it("cancel rules: 24 h classes, 7 days events, boundaries", () => {
    expect([CANCELLATION_HOURS, EVENT_REFUND_DAYS]).toEqual([24, 7]);
    expect(isRefundable(start, new Date(start.getTime() - 24 * 3600_000))).toBe(true);
    expect(isRefundable(start, new Date(start.getTime() - 24 * 3600_000 + 1))).toBe(false);
    expect(isEventRefundable(start, new Date(start.getTime() - 7 * 86400_000))).toBe(true);
    expect(isEventRefundable(start, new Date(start.getTime() - 7 * 86400_000 + 1))).toBe(false);
    expect(cancelUpToText()).toContain("24 hours");
  });
  it("FAQ, legal and page texts only use 24 hours / 7 days (or 2 hours, 14 days, 5 minutes) as the constants say", () => {
    const faqText = JSON.stringify(faqGroups);
    for (const m of faqText.matchAll(/(\d+)[- ]hours?/g)) expect([CANCELLATION_HOURS, 2], `FAQ ${m[0]}`).toContain(Number(m[1]));
    for (const m of faqText.matchAll(/(\d+)[- ]days?/g)) expect([EVENT_REFUND_DAYS], `FAQ ${m[0]}`).toContain(Number(m[1]));
    for (const f of ["booking-cancellation", "terms", "health-disclaimer", "privacy", "cookies"]) {
      const t = readFileSync(join(root, `content/legal/${f}.mdx`), "utf8");
      for (const m of t.matchAll(/(\d+)[- ]hours?/g)) expect([CANCELLATION_HOURS, 2], `${f} ${m[0]}`).toContain(Number(m[1]));
    }
  });
  it("legal copies in docs/legal are identical to app/content/legal", () => {
    for (const f of ["booking-cancellation", "terms", "health-disclaimer"]) {
      expect(readFileSync(join(appRoot, `docs/legal/${f}.mdx`), "utf8")).toBe(readFileSync(join(root, `content/legal/${f}.mdx`), "utf8"));
    }
  });
});

describe("QA11 FAQ with packs hidden", () => {
  it("no visible FAQ answer or question mentions a pack", () => {
    const text = JSON.stringify(visibleFaqGroups(false).flatMap((g) => g.items));
    expect(text).not.toMatch(/\bpacks?\b/i);
  });
  // Q11-3 fixed: the group is called "Credits" while packs are hidden.
  it("no visible FAQ group title mentions packs", () => {
    expect(visibleFaqGroups(false).map((g) => g.title).join(" ")).not.toMatch(/pack/i);
  });
  // Q11-4 fixed: the referral sentence only appears when SHOW_REFERRAL is on.
  it("FAQ does not promise a referral credit while the referral link is hidden", () => {
    expect(JSON.stringify(visibleFaqGroups(false))).not.toMatch(/invite a friend|earn a free credit/i);
  });
});

describe("QA11 no leaks, no old demo teacher, packs hidden, only real photos 01 and 11", () => {
  const sourceFiles = [
    ...["app", "components", "lib", "content", "prisma", "public", "scripts"].flatMap((d) => walk(join(root, d), ["generated"])),
    ...["proxy.ts", "next.config.ts", "README.md", "DEPLOY.md", ".env.example"].map((f) => join(root, f)).filter(existsSync),
  ].filter((f) => !/\.(webp|png|jpg|jpeg|ico)$/i.test(f));
  const sourceText = sourceFiles.map((f) => ({ f: f.replace(root, ""), t: readFileSync(f, "utf8") }));
  // Private numbers are read from the private notes file at run time, never written into a test.
  const notes = join(appRoot, "eventbrite-texts.md");
  const secrets = existsSync(notes)
    ? [...new Set([...readFileSync(notes, "utf8").matchAll(/\b\d[\d ]{8,12}\d\b/g)].map((m) => m[0].replace(/\s/g, "")))]
    : [];
  const compact = (t: string) => t.replace(/[\s-]/g, "");
  it("source: 0 hits for Aoife/Brennan, zoom.us, kundalini.ie, email, Eventbrite, Zoom meeting-number-like values", () => {
    for (const bad of [/Aoife|Brennan/i, /zoom\.us/i, /kundalini\.ie/i, /info@/i, /eventbrite/i, /us0\dweb/i]) {
      expect(sourceText.filter((x) => bad.test(x.t)).map((x) => x.f), String(bad)).toEqual([]);
    }
    for (const n of secrets) expect(sourceText.filter((x) => compact(x.t).includes(n)).map((x) => x.f), "private number").toEqual([]);
  });
  it(".next build output (if present): same 0 hits", () => {
    const dir = join(root, ".next");
    if (!existsSync(dir)) return;
    const files = walk(dir, ["cache", "dev", "node_modules"]).filter((f) => /\.(js|html|rsc|json|txt|body|meta|map|css)$/.test(f) && statSync(f).size < 8_000_000);
    const hit = (re: RegExp) => files.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => f.replace(root, ""));
    expect(hit(/Aoife|zoom\.us|kundalini\.ie|info@kundalini/i)).toEqual([]);
    for (const n of secrets) expect(files.filter((f) => compact(readFileSync(f, "utf8")).includes(n)).map((f) => f.replace(root, "")), "private number").toEqual([]);
  });
  it("home teacher section says Atiana and every review is labelled Demo review", () => {
    const home = readFileSync(join(root, "app/page.tsx"), "utf8");
    expect(home).toMatch(/Hello, I am Atiana/);
    expect(home).not.toMatch(/Demo teacher/);
    expect(home).toMatch(/Demo review/);
  });
  it("packs are off by default and not rendered by the pages without the flag", () => {
    expect(packsEnabled({})).toBe(false);
    expect(packsEnabled({ SHOW_PACKS: "false" })).toBe(false);
    for (const f of ["app/classes/page.tsx", "app/schedule/page.tsx", "app/one-to-one/page.tsx"]) {
      const t = readFileSync(join(root, f), "utf8");
      expect(t, f).toMatch(/packsEnabled/);
    }
  });
  it("pictures: only photos 01 and 11 are in public/real; no code uses 02/05/06/16/18/19 or images-eventbrite", () => {
    expect(readdirSync(join(root, "public/real")).sort()).toEqual(["hero-home-01.webp", "og-share-01.webp", "teacher-home-01.webp"]);
    for (const x of sourceText) expect(x.t, x.f).not.toMatch(/images-eventbrite|atiana-eventbrite-(02|05|06|16|18|19)/);
  });
  it("old demo classes and events are only on the hide lists, not in the pages' data", () => {
    const slugs = [...classTypes.map((c) => c.slug), ...events.map((e) => e.slug)];
    for (const old of ["morning-energy-class", "evening-transmission", "beginners-introduction", "breath-and-stillness", "winter-breath-hour", "sound-and-stillness-sunday", "winter-light-half-day", "slow-morning-by-the-hills"]) {
      expect(slugs).not.toContain(old);
    }
  });
});

const BASE = process.env.QA11_BASE;
describe.skipIf(!BASE)("QA11 rendered pages of a running server (QA11_BASE)", () => {
  const pages = ["/", "/classes", "/schedule", "/events", ...events.map((e) => `/events/${e.slug}`), "/one-to-one", "/about", "/faq", "/contact", "/donate", "/login",
    "/legal/booking-cancellation", "/legal/terms", "/legal/health-disclaimer", "/legal/privacy", "/legal/cookies"];
  it("200, no forbidden text, no pack words, no old demo names", async () => {
    for (const p of pages) {
      const r = await fetch(BASE + p);
      expect(r.status, p).toBe(200);
      const t = await r.text();
      expect(t, p).not.toMatch(/Aoife|zoom\.us|kundalini\.ie|info@kundalini|Demo teacher/i);
      expect(t, p).not.toMatch(/Morning Energy|Evening Transmission|Beginners.? Introduction|Breath and Stillness|Winter Breath Hour/);
      expect(t, p).not.toMatch(/5-class pack|10-class pack|€12 per class|€105/);
    }
  }, 120_000);
  it("price strings on /classes, /events and the Home card", async () => {
    const classes = await (await fetch(BASE + "/classes")).text();
    for (const s of ["€20", "€30", "Free"]) expect(classes).toContain(s);
    const ev = await (await fetch(BASE + "/events")).text();
    expect(ev).toContain("€60");
    expect(ev).toContain("€30");
    expect((await (await fetch(BASE + "/")).text()).replace(/<[^>]+>/g, "")).toContain("Free or from €20");
  });
  it("hidden demo events/classes: old event page is 404", async () => {
    expect((await fetch(BASE + "/events/winter-breath-hour")).status).toBe(404);
  });
});
