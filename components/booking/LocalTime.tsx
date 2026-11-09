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
