/**
 * Bookings CSV (task 12.7). Pure: builds the file text from rows. Cells are CSV-injection safe (lib/admin/csv.ts).
 * The columns are a fixed list: no Zoom link, no payment or credit ids, no tokens.
 */
import { BUSINESS_TZ } from "@/lib/time";
import { toCsv } from "./csv";

/** UTC columns stay as before (exact, sortable). The Dublin columns are the studio time, "2026-12-01 19:00" (summer / winter time handled). */
export const BOOKINGS_CSV_HEADER = [
  "booked_at_utc",
  "booked_at_dublin",
  "client_name",
  "client_email",
  "class",
  "session_starts_at_utc",
  "session_starts_at_dublin",
  "status",
  "paid_with",
] as const;

export function dublinStamp(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export type BookingCsvRow = {
  createdAt: Date;
  status: string;
  paidWith: string | null;
  user: { name: string | null; email: string };
  session: { startsAt: Date; offering: { title: string } };
};

export function bookingsToCsv(rows: BookingCsvRow[]): string {
  return toCsv(
    [...BOOKINGS_CSV_HEADER],
    rows.map((r) => [r.createdAt, dublinStamp(r.createdAt), r.user.name ?? "", r.user.email, r.session.offering.title, r.session.startsAt, dublinStamp(r.session.startsAt), r.status, r.paidWith ?? ""]),
  );
}
