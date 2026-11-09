/** Builds the demo session dates from the weekly pattern (pure, no database). */
import {
  DEMO_CLASS_CAPACITY,
  DEMO_SESSION_WEEKS,
  DEMO_SLOT_WEEKS,
  classTypes,
  oneToOneOfferings,
  oneToOneWeeklySlots,
  weeklyPattern,
} from "@/content/catalog";
import { BUSINESS_TZ, weekStart, zonedParts, zonedToUtc } from "./time";

export type PlannedSession = { offeringSlug: string; startsAt: Date; endsAt: Date; capacity: number };

function dateOfWeekday(monday: Date, weekday: number, tz: string) {
  // monday is Monday 00:00 in tz. Mon..Sat = +0..+5 days, Sunday (0) = +6 days.
  const offset = (weekday + 6) % 7;
  const p = zonedParts(new Date(monday.getTime() + 12 * 3600_000), tz); // noon avoids clock-change edges
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + offset, 12));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function planGroupSessions(now: Date, weeks = DEMO_SESSION_WEEKS, tz = BUSINESS_TZ): PlannedSession[] {
  const out: PlannedSession[] = [];
  for (let w = 0; w < weeks; w++) {
    const monday = weekStart(now, w, tz);
    for (const slot of weeklyPattern) {
      const type = classTypes.find((c) => c.slug === slot.classSlug);
      if (!type) continue;
      const startsAt = zonedToUtc({ ...dateOfWeekday(monday, slot.weekday, tz), hour: slot.hour, minute: slot.minute }, tz);
      if (startsAt.getTime() <= now.getTime()) continue;
      out.push({
        offeringSlug: type.slug,
        startsAt,
        endsAt: new Date(startsAt.getTime() + type.minutes * 60_000),
        capacity: DEMO_CLASS_CAPACITY,
      });
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function planOneToOneSlots(now: Date, weeks = DEMO_SLOT_WEEKS, tz = BUSINESS_TZ): PlannedSession[] {
  const out: PlannedSession[] = [];
  for (let w = 0; w < weeks; w++) {
    const monday = weekStart(now, w, tz);
    for (const slot of oneToOneWeeklySlots) {
      const o = oneToOneOfferings.find((x) => x.slug === slot.offering);
      if (!o) continue;
      const startsAt = zonedToUtc({ ...dateOfWeekday(monday, slot.weekday, tz), hour: slot.hour, minute: slot.minute }, tz);
      if (startsAt.getTime() <= now.getTime()) continue;
      out.push({ offeringSlug: o.slug, startsAt, endsAt: new Date(startsAt.getTime() + o.minutes * 60_000), capacity: 1 });
    }
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}
