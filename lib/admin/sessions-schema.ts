/**
 * Sessions admin form rules (task 12.9: dated sessions of classes and events). Pure: no database, no Next.js.
 * Times are typed in the studio zone (Europe/Dublin) and stored as UTC.
 * The Zoom link is PRIVATE: it has its own field here, is validated here and is never written to the audit log.
 * 1:1 slots have their own screen (/admin/slots, lib/slots-schema.ts).
 */
import { z } from "zod";
import { DEFAULT_CAPACITY } from "@/lib/booking-rules";
import { BUSINESS_TZ, zonedToUtc } from "@/lib/time";

export const MAX_CAPACITY = 200;
export const MAX_REPEAT = 12;
export const ZOOM_URL_MAX = 500;
export const MIN_MINUTES = 15;
export const MAX_SESSION_MINUTES = 600;
export { DEFAULT_CAPACITY };

export type SessionKind = "GROUP_CLASS" | "EVENT";

const oneLine = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

const isRealDate = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

/** Empty = no link (null). A link must be https, without a user name or password. Null from a form means "empty". */
export const zoomSchema = z.preprocess(
  oneLine,
  z
    .string()
    .max(ZOOM_URL_MAX, `Zoom link: at most ${ZOOM_URL_MAX} characters.`)
    .refine((v) => {
      if (v === "") return true;
      try {
        const u = new URL(v);
        return u.protocol === "https:" && !u.username && !u.password && u.hostname.includes(".");
      } catch {
        return false;
      }
    }, "Use a full https link that starts with https://")
    .transform((v) => (v === "" ? null : v)),
);

const intField = (label: string, min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.coerce.number({ message: `${label}: type a whole number.` }).int(`${label}: type a whole number.`).min(min, `${label}: at least ${min}.`).max(max, `${label}: at most ${max}.`),
  );

const baseFields = {
  date: z.preprocess(oneLine, z.string().refine(isRealDate, "Choose a date.")),
  time: z.preprocess(oneLine, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a start time, for example 19:00.")),
  minutes: intField("Length", MIN_MINUTES, MAX_SESSION_MINUTES),
  capacity: intField("Capacity", 1, MAX_CAPACITY),
  zoomUrl: zoomSchema,
};

export const createSessionSchema = z.object({
  offeringId: z.preprocess(oneLine, z.string().min(1, "Choose a class or an event.")),
  ...baseFields,
  repeatWeeks: z.preprocess((v) => (v === undefined || v === null || v === "" ? "1" : v), intField("Repeat", 1, MAX_REPEAT)),
  skip: z.preprocess((v) => (Array.isArray(v) ? v : typeof v === "string" && v !== "" ? [v] : []), z.array(z.string().refine(isRealDate)).max(MAX_REPEAT)),
});
export type CreateSessionForm = z.infer<typeof createSessionSchema>;

export const editSessionSchema = z.object({ ...baseFields, version: z.preprocess(oneLine, z.string()) });
export type EditSessionForm = z.infer<typeof editSessionSchema>;

export type PlannedSession = { dateKey: string; startsAt: Date; endsAt: Date };

/** Dublin wall-clock input -> one planned session per week (summer/winter time is handled by zonedToUtc). `skip` = unticked dates. */
export function planSessions(form: Pick<CreateSessionForm, "date" | "time" | "minutes" | "repeatWeeks" | "skip">): PlannedSession[] {
  const [y, m, d] = form.date.split("-").map(Number);
  const [hour, minute] = form.time.split(":").map(Number);
  const out: PlannedSession[] = [];
  for (let w = 0; w < form.repeatWeeks; w++) {
    const day = new Date(Date.UTC(y, m - 1, d + w * 7, 12));
    const dateKey = day.toISOString().slice(0, 10);
    if (form.skip.includes(dateKey)) continue;
    const startsAt = zonedToUtc({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour, minute }, BUSINESS_TZ);
    out.push({ dateKey, startsAt, endsAt: new Date(startsAt.getTime() + form.minutes * 60_000) });
  }
  return out;
}

/** The dates the repeat would create, for the preview in the form (no times needed). "2026-12-01", "2026-12-08", ... */
export function repeatDateKeys(date: string, repeatWeeks: number): string[] {
  if (!isRealDate(date)) return [];
  const [y, m, d] = date.split("-").map(Number);
  const n = Math.min(Math.max(Math.trunc(repeatWeeks) || 1, 1), MAX_REPEAT);
  return Array.from({ length: n }, (_, w) => new Date(Date.UTC(y, m - 1, d + w * 7, 12)).toISOString().slice(0, 10));
}

/** "Tue 1 Dec" for a date key (calendar arithmetic only; no time zone needed). */
export function dateKeyLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(Date.UTC(y, m - 1, d, 12))).replace(",", "");
}

/** "2026-12-01" and "19:00" of an instant, in the studio zone (for the edit form). */
export function dublinDateAndTime(at: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export const SESSION_KIND_LABEL: Record<SessionKind, string> = { GROUP_CLASS: "Class", EVENT: "Event" };
