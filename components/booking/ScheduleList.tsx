"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { spotsLabel } from "@/lib/booking-rules";
import type { ScheduleItem } from "@/lib/catalog-queries";
import { dayKey, formatDayLong, formatDayShort, formatTime } from "@/lib/time";
import { useVisitorTimeZone } from "./LocalTime";

/** Classes grouped by day, in the visitor's time zone. */
export function ScheduleList({ items, bookedIds }: { items: ScheduleItem[]; bookedIds: string[] }) {
  const tz = useVisitorTimeZone();
  const booked = new Set(bookedIds);

  const groups = new Map<string, ScheduleItem[]>();
  for (const it of items) {
    const key = dayKey(new Date(it.startsAt), tz);
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }

  return (
    <div>
      {[...groups.entries()].map(([key, list]) => {
        const first = new Date(list[0].startsAt);
        return (
          <section className="day-group" aria-labelledby={`g-${key}`} key={key}>
            <h2 id={`g-${key}`}>{formatDayLong(first, tz)}</h2>
            <ul className="rows">
              {list.map((c) => {
                const start = new Date(c.startsAt);
                const full = c.spotsLeft <= 0;
                const mine = booked.has(c.id);
                const label = `${c.title}, ${formatDayShort(start, tz)} ${formatTime(start, tz)}`;
                return (
                  <li className={`crow ${full && !mine ? "is-full" : ""} ${mine ? "is-booked" : ""}`} key={c.id}>
                    <div className="time-box" aria-hidden="true">
                      <b>{formatTime(start, tz)}</b>
                      <span>{formatDayShort(start, tz).split(" ")[0]}</span>
                    </div>
                    <div>
                      <h3>{c.title}</h3>
                      <div className="meta">
                        <Icon name={c.mode === "ONLINE" ? "video" : "pin"} className="size-[18px]! text-ember-deep" />
                        <span>{c.mode === "ONLINE" ? "Online · Zoom" : `In person · ${c.location ?? ""}`}</span>
                        <span className="dot" aria-hidden="true" />
                        <span>{c.minutes} min</span>
                      </div>
                    </div>
                    <div className="act">
                      {mine ? (
                        <span className="badge b-ok">
                          <Icon name="check" className="size-3.5!" /> You are booked
                        </span>
                      ) : (
                        <span className={`badge ${full ? "b-sold" : c.spotsLeft <= 3 ? "b-low" : "b-spots"}`}>
                          {!full && c.spotsLeft <= 3 && <Icon name="warn" className="size-3.5!" />}
                          {spotsLabel(c.spotsLeft)}
                        </span>
                      )}
                      {mine ? (
                        <Link className="btn btn-outline btn-sm" href="/account/bookings">
                          My bookings
                        </Link>
                      ) : full ? (
                        <button className="btn btn-sm" type="button" disabled>
                          Full
                        </button>
                      ) : (
                        <Link className="btn btn-primary btn-sm" href={`/book/class?session=${c.id}`} aria-label={`Book ${label}`}>
                          Book
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
