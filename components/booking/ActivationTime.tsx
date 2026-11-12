"use client";

import { formatTime } from "@/lib/time";
import { useVisitorTimeZone } from "./LocalTime";

/**
 * For sessions with a greeting first (Dive Deep, Winter Solstice): shows BOTH the start (greeting) and the
 * activation time in the visitor's time zone. The door closes when the activation starts.
 */
export function ActivationTime({ startIso, afterMinutes }: { startIso: string; afterMinutes: number }) {
  const tz = useVisitorTimeZone();
  const start = new Date(startIso);
  const activation = new Date(start.getTime() + afterMinutes * 60_000);
  return (
    <>
      Greeting starts at <time dateTime={start.toISOString()}>{formatTime(start, tz)}</time>. The main activation starts at{" "}
      <time dateTime={activation.toISOString()}>{formatTime(activation, tz)}</time>.
    </>
  );
}
