import { describe, expect, it } from "vitest";
import {
  BUSINESS_TZ,
  dayKey,
  formatDayLong,
  formatTime,
  isValidTimeZone,
  weekRange,
  weekStart,
  zonedParts,
  zonedToUtc,
} from "@/lib/time";

describe("zonedToUtc (Europe/Dublin)", () => {
  it("winter: Dublin = UTC", () => {
    expect(zonedToUtc({ year: 2026, month: 11, day: 17, hour: 18, minute: 0 }).toISOString()).toBe("2026-11-17T18:00:00.000Z");
  });
  it("summer: Dublin = UTC+1", () => {
    expect(zonedToUtc({ year: 2026, month: 7, day: 14, hour: 18, minute: 0 }).toISOString()).toBe("2026-07-14T17:00:00.000Z");
  });
  it("same wall clock time stays the same across the clock change (28 Mar 2027)", () => {
    const before = zonedToUtc({ year: 2027, month: 3, day: 26, hour: 7, minute: 30 });
    const after = zonedToUtc({ year: 2027, month: 3, day: 30, hour: 7, minute: 30 });
    expect(formatTime(before)).toBe("07:30");
    expect(formatTime(after)).toBe("07:30");
    expect(before.toISOString()).toBe("2027-03-26T07:30:00.000Z");
    expect(after.toISOString()).toBe("2027-03-30T06:30:00.000Z");
  });
  it("works for another zone (New York)", () => {
    expect(zonedToUtc({ year: 2026, month: 11, day: 17, hour: 12 }, "America/New_York").toISOString()).toBe("2026-11-17T17:00:00.000Z");
  });
});

describe("display in a zone", () => {
  const at = new Date("2026-11-17T18:00:00Z");
  it("same instant, different local time", () => {
    expect(formatTime(at, "Europe/Dublin")).toBe("18:00");
    expect(formatTime(at, "Europe/Kyiv")).toBe("20:00");
    expect(formatTime(at, "America/New_York")).toBe("13:00");
  });
  it("the day can change with the zone", () => {
    const late = new Date("2026-11-17T23:30:00Z");
    expect(dayKey(late, "Europe/Dublin")).toBe("2026-11-17");
    expect(dayKey(late, "Asia/Tokyo")).toBe("2026-11-18");
  });
  it("long day name", () => {
    expect(formatDayLong(at)).toBe("Tuesday 17 November");
  });
  it("zonedParts gives the weekday", () => {
    expect(zonedParts(at).weekday).toBe(2); // Tuesday
  });
  it("time zone check", () => {
    expect(isValidTimeZone("Europe/Dublin")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
});

describe("weeks (Monday to Monday in Dublin)", () => {
  const wed = new Date("2026-11-11T09:00:00Z");
  it("week starts on Monday 00:00", () => {
    expect(weekStart(wed).toISOString()).toBe("2026-11-09T00:00:00.000Z");
    expect(weekStart(wed, 1).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    expect(weekStart(wed, -1).toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });
  it("Sunday belongs to the week that started on the Monday before", () => {
    expect(weekStart(new Date("2026-11-15T22:00:00Z")).toISOString()).toBe("2026-11-09T00:00:00.000Z");
  });
  it("a normal week is exactly 7 days", () => {
    const r = weekRange(wed);
    expect(r.end.getTime() - r.start.getTime()).toBe(7 * 24 * 3600_000);
  });
  it("the week with the clock change is 1 hour shorter/longer", () => {
    const r = weekRange(new Date("2027-03-25T12:00:00Z"));
    expect(Math.abs(r.end.getTime() - r.start.getTime() - 7 * 24 * 3600_000)).toBe(3600_000);
  });
  it("business zone constant", () => {
    expect(BUSINESS_TZ).toBe("Europe/Dublin");
  });
});
