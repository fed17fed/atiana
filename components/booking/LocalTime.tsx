"use client";

import { useSyncExternalStore } from "react";
import { BUSINESS_TZ, formatDayLong, formatDayShort, formatTime } from "@/lib/time";

const subscribe = () => () => {};

/** The visitor's time zone. The server (and the first paint) uses Europe/Dublin, then the browser zone takes over. */
export function useVisitorTimeZone(): string {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || BUSINESS_TZ,
    () => BUSINESS_TZ,
  );
}

export function TimeZoneName() {
  const tz = useVisitorTimeZone();
  return <>{tz}</>;
}

type Format = "time" | "dayShort" | "dayLong" | "dayTime";

export function formatFor(iso: string, tz: string, format: Format) {
  const d = new Date(iso);
  if (format === "time") return formatTime(d, tz);
  if (format === "dayShort") return formatDayShort(d, tz);
  if (format === "dayLong") return formatDayLong(d, tz);
  return `${formatDayShort(d, tz)}, ${formatTime(d, tz)}`;
}

/** Shows a UTC instant in the visitor's own time zone. */
export function LocalTime({ iso, format = "dayTime" }: { iso: string; format?: Format }) {
  const tz = useVisitorTimeZone();
  return <time dateTime={iso}>{formatFor(iso, tz, format)}</time>;
}

/** "Wed 9 Dec 2026 · 19:00–20:00" in the visitor's time zone. */
export function LocalRange({ startIso, endIso }: { startIso: string; endIso: string }) {
  const tz = useVisitorTimeZone();
  const s = new Date(startIso);
  const day = new Intl.DateTimeFormat("en-IE", { timeZone: tz, weekday: "short", day: "numeric", month: "short", year: "numeric" }).formatToParts(s);
  const g = (t: string) => day.find((p) => p.type === t)?.value ?? "";
  return (
    <time dateTime={startIso}>
      {g("weekday")} {g("day")} {g("month")} {g("year")} · {formatTime(s, tz)}–{formatTime(new Date(endIso), tz)}
    </time>
  );
}
