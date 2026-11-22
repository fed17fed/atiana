import { notFound } from "next/navigation";
import { findEventForPage } from "@/lib/offerings-cache";
import { getSiteUrl } from "@/lib/site";

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** "Add to calendar": a plain .ics file for one event (public event data only, no personal data). */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const e = await findEventForPage(slug); // the database, or the code content when the database cannot be read or is empty (task 12.8)
  if (!e || !e.session) notFound(); // unknown or hidden event, or an event with no date yet
  const start = new Date(e.session.startsAt);
  const end = new Date(e.session.endsAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KEA by Atiana//Events//EN",
    "BEGIN:VEVENT",
    `UID:${e.slug}@kea-atiana`,
    `DTSTAMP:${stamp(new Date())}`,
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
