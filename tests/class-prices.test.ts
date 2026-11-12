import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classTypes, DEMO_CLASS_CAPACITY } from "@/content/catalog";
import { DEFAULT_CAPACITY } from "@/lib/booking-rules";
import { faqGroups, visibleFaqGroups } from "@/content/faq";
import { packsEnabled } from "@/lib/features";

describe("per-class prices (task 11.5)", () => {
  it("every class has its own price in cents (0 = free)", () => {
    for (const c of classTypes) {
      expect(Number.isInteger(c.priceCents)).toBe(true);
      expect(c.priceCents).toBeGreaterThanOrEqual(0);
    }
  });
  it("the real classes: Blitz EUR 20, Dive Deep EUR 30, Gratitude free, KEA EUR 30", () => {
    const price = Object.fromEntries(classTypes.map((c) => [c.slug, c.priceCents]));
    expect(price).toEqual({ "blitz-for-bliss": 2000, "dive-deep": 3000, gratitude: 0, "kundalini-energy-activation": 3000 });
  });
  it("the demo capacity is the one default from booking-rules", () => {
    expect(DEMO_CLASS_CAPACITY).toBe(DEFAULT_CAPACITY);
  });
});

describe("packs are hidden by a flag (task 11.6 / Q6)", () => {
  it("off by default, on only with SHOW_PACKS=true", () => {
    expect(packsEnabled({})).toBe(false);
    expect(packsEnabled({ SHOW_PACKS: "false" })).toBe(false);
    expect(packsEnabled({ SHOW_PACKS: "true" })).toBe(true);
  });
  it("FAQ: the pack question is hidden while packs are off, still in the data", () => {
    const all = faqGroups.flatMap((g) => g.items.map((i) => i.q));
    const hidden = visibleFaqGroups(false).flatMap((g) => g.items.map((i) => i.q));
    const shown = visibleFaqGroups(true).flatMap((g) => g.items.map((i) => i.q));
    expect(all).toContain("What is a class pack?");
    expect(hidden).not.toContain("What is a class pack?");
    expect(shown).toEqual(all);
  });
});

describe("rule numbers live only in lib/booking-rules.ts (task 11.11)", () => {
  const root = join(__dirname, "..");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (n === "generated" || n === "node_modules") return [];
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  const files = ["app", "components", "lib", "content"].flatMap((d) => walk(join(root, d))).filter((f) => !f.endsWith("lib/booking-rules.ts"));
  it("no hard-coded '24 hours', '7 days' or 'capacity: 12' in code or texts", () => {
    const bad: string[] = [];
    for (const f of files) {
      // comments may explain the rule; only code and texts are checked
      const t = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (/\b24[- ]hours?\b|\b7[- ]days?\b|capacity:\s*12\b/i.test(t)) bad.push(f.replace(root, ""));
    }
    expect(bad).toEqual([]);
  });
});

const root = join(__dirname, "..");

describe("Q11 fixes: FAQ and cancel wording", () => {
  it("packs and referral off: group is called Credits, no referral promise; both on: they come back", () => {
    expect(visibleFaqGroups(false).some((g) => g.title === "Credits")).toBe(true);
    expect(JSON.stringify(visibleFaqGroups(false))).not.toMatch(/invite a friend|pack/i);
    expect(visibleFaqGroups(true).some((g) => g.title === "Packs & credits")).toBe(true);
    expect(JSON.stringify(visibleFaqGroups(true, true))).toMatch(/invite a friend/);
    expect(JSON.stringify(visibleFaqGroups(true, false))).not.toMatch(/invite a friend/);
  });
  it("cancel rule sentence says 24 hours for paid and any time for free classes", async () => {
    const { cancelRuleSentence, CANCELLATION_HOURS } = await import("@/lib/booking-rules");
    expect(cancelRuleSentence()).toContain(`${CANCELLATION_HOURS} hours`);
    expect(cancelRuleSentence()).toMatch(/Free classes: cancel any time/);
  });
  it("referral flag is off by default", async () => {
    const { referralEnabled } = await import("@/lib/features");
    expect(referralEnabled({})).toBe(false);
    expect(referralEnabled({ SHOW_REFERRAL: "true" })).toBe(true);
  });
  it("legal text has no 'ticket' and explains booking close and Zoom doors", async () => {
    const { readFileSync } = await import("node:fs");
    const t = readFileSync(join(root, "content/legal/booking-cancellation.mdx"), "utf8");
    expect(t).not.toMatch(/ticket/i);
    expect(t).toMatch(/Booking closes at the start time/);
    expect(t).toMatch(/Zoom doors close when the main activation begins/);
  });
});
