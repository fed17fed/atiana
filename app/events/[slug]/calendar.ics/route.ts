import { notFound } from "next/navigation";
import { findEvent } from "@/content/events";
import { getSiteUrl } from "@/lib/site";
import { zonedToUtc } from "@/lib/time";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** "Add to calendar": a plain .ics file for one event (public event data only, no personal data). */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const e = findEvent(slug);
  if (!e) notFound();
  const start = zonedToUtc(e.start);
  const end = new Date(start.getTime() + e.minutes * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KEA by Atiana//Events//EN",
    "BEGIN:VEVENT",
    `UID:${e.slug}@kea-atiana`,
    `DTSTAMP:${stamp(start)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(`${e.summary} ${getSiteUrl()}/events/${e.slug}`)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${e.slug}.ics"` },
  });
}
