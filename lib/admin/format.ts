import { BUSINESS_TZ } from "@/lib/time";

/** Admin screens show times in the studio zone (Europe/Dublin), as the owner decided (plan 14.10). */
export function formatAdminDateTime(at: Date): string {
  return new Intl.DateTimeFormat("en-IE", {
    timeZone: BUSINESS_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

export function formatAdminDate(at: Date): string {
  return new Intl.DateTimeFormat("en-IE", { timeZone: BUSINESS_TZ, day: "numeric", month: "short", year: "numeric" }).format(at);
}
