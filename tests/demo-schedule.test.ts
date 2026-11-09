import { describe, expect, it } from "vitest";
import { planGroupSessions, planOneToOneSlots } from "@/lib/demo-schedule";
import { dayKey, formatTime, zonedParts } from "@/lib/time";

const now = new Date("2026-11-09T12:00:00Z"); // Monday

describe("demo group sessions", () => {
  const plan = planGroupSessions(now);
  it("3 sessions per week for 8 weeks", () => expect(plan).toHaveLength(24));
  it("only Tuesday 18:00, Friday 07:30 and Sunday 19:30 (Dublin time)", () => {
    const seen = new Set(plan.map((s) => `${zonedParts(s.startsAt).weekday} ${formatTime(s.startsAt)} ${s.offeringSlug}`));
    expect([...seen].sort()).toEqual(
      ["0 19:30 evening-transmission", "2 18:00 beginners-introduction", "5 07:30 morning-energy-class"].sort(),
    );
  });
  it("keeps the local time through the clock change in March", () => {
    const spring = planGroupSessions(new Date("2027-03-20T12:00:00Z"), 3);
    expect(spring.filter((s) => s.offeringSlug === "morning-energy-class").every((s) => formatTime(s.startsAt) === "07:30")).toBe(true);
  });
  it("sorted, all in the future, no duplicates", () => {
    expect(plan.every((s, i) => i === 0 || plan[i - 1].startsAt <= s.startsAt)).toBe(true);
    expect(plan.every((s) => s.startsAt > now)).toBe(true);
    expect(new Set(plan.map((s) => `${s.offeringSlug}${s.startsAt.toISOString()}`)).size).toBe(plan.length);
  });
  it("the first session is Tuesday 10 November 18:00", () => {
    expect(dayKey(plan[0].startsAt)).toBe("2026-11-10");
    expect(plan[0].startsAt.toISOString()).toBe("2026-11-10T18:00:00.000Z");
  });
  it("past sessions of the current week are skipped", () => {
    const sat = planGroupSessions(new Date("2026-11-14T12:00:00Z"), 1);
    expect(sat).toHaveLength(1); // only Sunday
  });
});

describe("demo 1:1 slots", () => {
  const plan = planOneToOneSlots(new Date("2026-11-09T07:00:00Z"));
  it("20 slots in 4 weeks, capacity 1", () => {
    expect(plan).toHaveLength(20);
    expect(plan.every((s) => s.capacity === 1)).toBe(true);
  });
  it("online and in-person offerings both have slots", () => {
    expect(plan.some((s) => s.offeringSlug === "online-1-1")).toBe(true);
    expect(plan.some((s) => s.offeringSlug === "in-person-1-1")).toBe(true);
  });
  it("each slot is 60 minutes", () => {
    expect(plan.every((s) => s.endsAt.getTime() - s.startsAt.getTime() === 3600_000)).toBe(true);
  });
});
