/** Time helpers. All times are stored in UTC; the business time zone is Europe/Dublin. */

export const BUSINESS_TZ = "Europe/Dublin";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Offset (ms) of `tz` at the UTC instant `at`: local wall clock minus UTC. */
export function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Wall-clock time in `tz` -> UTC Date. Handles summer/winter time. */
export function zonedToUtc(
  p: { year: number; month: number; day: number; hour?: number; minute?: number },
  tz = BUSINESS_TZ,
): Date {
  const guess = Date.UTC(p.year, p.month - 1, p.day, p.hour ?? 0, p.minute ?? 0);
  let utc = guess - tzOffsetMs(new Date(guess), tz);
  // The offset can differ at the corrected instant (around the clock change): check once more.
  utc = guess - tzOffsetMs(new Date(utc), tz);
  return new Date(utc);
}

/** Calendar date (year, month, day, weekday 0=Sun) of an instant in `tz`. */
export function zonedParts(at: Date, tz = BUSINESS_TZ) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

/** Start of the week (Monday 00:00 in `tz`) that is `weekOffset` weeks from the week of `now`. */
export function weekStart(now: Date, weekOffset = 0, tz = BUSINESS_TZ): Date {
  const { year, month, day, weekday } = zonedParts(now, tz);
  const sinceMonday = (weekday + 6) % 7;
  // Use noon UTC arithmetic on the calendar date, then convert midnight of that day in tz.
  const monday = new Date(Date.UTC(year, month - 1, day - sinceMonday + weekOffset * 7, 12));
  return zonedToUtc(
    { year: monday.getUTCFullYear(), month: monday.getUTCMonth() + 1, day: monday.getUTCDate() },
    tz,
  );
}

export function weekRange(now: Date, weekOffset = 0, tz = BUSINESS_TZ) {
  const start = weekStart(now, weekOffset, tz);
  const next = weekStart(now, weekOffset + 1, tz);
  return { start, end: next };
}

export function formatDate(at: Date, tz = BUSINESS_TZ, opts: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-IE", { timeZone: tz, ...opts }).format(at);
}

function dayText(at: Date, tz: string, weekday: "short" | "long", month: "short" | "long") {
  const parts = new Intl.DateTimeFormat("en-IE", { timeZone: tz, weekday, day: "numeric", month }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** "Tue 17 Nov" */
export function formatDayShort(at: Date, tz = BUSINESS_TZ) {
  return dayText(at, tz, "short", "short");
}

/** "Tuesday 17 November" */
export function formatDayLong(at: Date, tz = BUSINESS_TZ) {
  return dayText(at, tz, "long", "long");
}

/** "18:00" */
export function formatTime(at: Date, tz = BUSINESS_TZ) {
  return formatDate(at, tz, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** "Tue 17 Nov, 18:00" */
export function formatDateTime(at: Date, tz = BUSINESS_TZ) {
  return `${formatDayShort(at, tz)}, ${formatTime(at, tz)}`;
}

/** Day key "YYYY-MM-DD" in `tz`. */
export function dayKey(at: Date, tz = BUSINESS_TZ) {
  const p = zonedParts(at, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function addDays(at: Date, days: number) {
  return new Date(at.getTime() + days * DAY_MS);
}
