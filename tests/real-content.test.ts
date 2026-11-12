import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classTypes } from "@/content/catalog";
import { events, findEvent, HIDDEN_DEMO_EVENT_SLUGS } from "@/content/events";
import { CANCELLATION_HOURS, DEFAULT_CAPACITY, EVENT_REFUND_DAYS, HOLD_MINUTES, JOIN_EARLY_MINUTES } from "@/lib/booking-rules";
import { formatTime, zonedToUtc } from "@/lib/time";

const root = join(__dirname, "..");
const read = (f: string) => readFileSync(join(root, f), "utf8");

describe("real events (task 11.8)", () => {
  it("7 events, one per date, 24 Dec skipped, slugs with the date", () => {
    expect(events.map((e) => e.slug)).toEqual([
      "full-moon-2026-11-24",
      "new-moon-2026-12-09",
      "winter-solstice-2026-12-21",
      "new-moon-2027-01-07",
      "full-moon-2027-01-22",
      "new-moon-2027-02-06",
      "lunar-eclipse-2027-02-20",
    ]);
    expect(new Set(events.map((e) => e.slug)).size).toBe(events.length);
    expect(events.some((e) => e.start.month === 12 && e.start.day === 24)).toBe(false);
  });
  it("EUR 30, solstice EUR 60, all paid and online, capacity from booking-rules", () => {
    for (const e of events) {
      expect(e.pricing).toBe("PAID");
      expect(e.mode).toBe("ONLINE");
      expect(e.spots).toBe(DEFAULT_CAPACITY);
      expect(e.priceCents).toBe(e.slug.startsWith("winter-solstice") ? 6000 : 3000);
    }
  });
  it("start times are Dublin wall-clock times (winter = UTC)", () => {
    const sol = findEvent("winter-solstice-2026-12-21")!;
    expect(zonedToUtc(sol.start).toISOString()).toBe("2026-12-21T21:00:00.000Z");
    const ecl = findEvent("lunar-eclipse-2027-02-20")!;
    expect(formatTime(zonedToUtc(ecl.start))).toBe("22:30");
  });
  it("solstice shows greeting + activation: 75 minutes, activation after 15", () => {
    const sol = findEvent("winter-solstice-2026-12-21")!;
    expect(sol.minutes).toBe(75);
    expect(sol.activationAfterMinutes).toBe(15);
    expect(findEvent("full-moon-2026-11-24")!.activationAfterMinutes).toBeUndefined();
  });
  it("Dive Deep: 90 minutes, activation after 30", () => {
    const d = classTypes.find((c) => c.slug === "dive-deep")!;
    expect(d.minutes).toBe(90);
    expect(d.activationAfterMinutes).toBe(30);
  });
  it("the 4 old demo events are only on the hide list", () => {
    expect(HIDDEN_DEMO_EVENT_SLUGS).toHaveLength(4);
    for (const s of HIDDEN_DEMO_EVENT_SLUGS) expect(findEvent(s)).toBeUndefined();
  });
});

describe("texts: no secrets, no old demo teacher, no old camera texts", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (["generated", "node_modules", ".next", "stale"].includes(n) || n.endsWith(".stale-bak")) return [];
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mdx|css)$/.test(n) ? [p] : [];
    });
  const files = ["app", "components", "lib", "content"].flatMap((d) => walk(join(root, d)));
  const all = files.map((f) => ({ f, t: readFileSync(f, "utf8") }));
  it("0 hits for Zoom links, the teacher's private email or website, and the invented teacher", () => {
    for (const bad of [/zoom\.us/i, /kundalini\.ie/i, /info@kundalini/i, /Aoife/]) {
      expect(all.filter((x) => bad.test(x.t)).map((x) => x.f.replace(root, "")), String(bad)).toEqual([]);
    }
  });
  it("no camera-optional text and no Eventbrite words in the pages", () => {
    for (const bad of [/camera (on or off|off)/i, /eventbrite/i]) {
      expect(all.filter((x) => bad.test(x.t)).map((x) => x.f.replace(root, "")), String(bad)).toEqual([]);
    }
  });
});

describe("legal texts match lib/booking-rules.ts", () => {
  const text = read("content/legal/booking-cancellation.mdx");
  it("24 hours, 7 days, 30 minutes hold and 5 minutes early are the constants", () => {
    expect(CANCELLATION_HOURS).toBe(24);
    expect(text).toContain(`${CANCELLATION_HOURS} hours or more before the class starts`);
    expect(text).toContain(`${EVENT_REFUND_DAYS} days or more before the event starts`);
    expect(text).toContain(`hold your seat for ${HOLD_MINUTES} minutes`);
    expect(text).toContain(`join ${JOIN_EARLY_MINUTES} minutes before the start`);
  });
  it("every number of hours or days in the legal texts is one of the constants", () => {
    for (const f of ["booking-cancellation", "terms", "health-disclaimer"]) {
      const t = read(`content/legal/${f}.mdx`);
      const hours = [...t.matchAll(/(\d+)[- ]hours?/g)].map((m) => Number(m[1]));
      const days = [...t.matchAll(/(\d+)[- ]days?/g)].map((m) => Number(m[1]));
      for (const h of hours) expect([CANCELLATION_HOURS, 2], `${f}: ${h} hours`).toContain(h);
      for (const d of days) expect([EVENT_REFUND_DAYS, 14], `${f}: ${d} days`).toContain(d);
    }
  });
  it("the published legal pages carry no editor marks", () => {
    for (const f of ["booking-cancellation", "terms", "health-disclaimer"]) {
      const t = read(`content/legal/${f}.mdx`);
      expect(t).not.toMatch(/\[(NEW|CHANGED|KEPT)\b/);
      expect(t).not.toMatch(/The developer removes/);
    }
  });
});
