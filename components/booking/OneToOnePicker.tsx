"use client";

import { useState } from "react";
import { BookForm } from "@/components/booking/BookForm";
import { formatFor, TimeZoneName, useVisitorTimeZone } from "@/components/booking/LocalTime";
import { Icon } from "@/components/ui/Icon";
import type { ScheduleItem } from "@/lib/catalog-queries";
import { dayKey, formatDayShort, formatTime } from "@/lib/time";

type Props = {
  slots: ScheduleItem[];
  initialSlotId?: string;
  priceLabel: string;
  minutes: number;
  formatLabel: string;
  formatKey: "online" | "person";
  loggedIn: boolean;
  credits: number;
  paymentsOn: boolean;
  userEmail: string | null;
};

/** Day chips + time buttons (in the visitor's time zone), then the pay form for the chosen slot. */
export function OneToOnePicker({ slots, initialSlotId, priceLabel, minutes, formatLabel, formatKey, loggedIn, credits, paymentsOn, userEmail }: Props) {
  const tz = useVisitorTimeZone();
  const [slotId, setSlotId] = useState<string | undefined>(slots.some((s) => s.id === initialSlotId) ? initialSlotId : undefined);
  const [dayChoice, setDayChoice] = useState<string | undefined>();

  const days = [...new Set(slots.map((s) => dayKey(new Date(s.startsAt), tz)))];
  const selected = slots.find((s) => s.id === slotId);
  const activeDay = dayChoice && days.includes(dayChoice) ? dayChoice : selected ? dayKey(new Date(selected.startsAt), tz) : days[0];
  const daySlots = slots.filter((s) => dayKey(new Date(s.startsAt), tz) === activeDay);

  if (slots.length === 0) {
    return (
      <div className="empty">
        <Icon name="clock" className="ic" />
        <h3>No free times right now</h3>
        <p>New times are added each week. Please check again soon.</p>
      </div>
    );
  }

  return (
    <div className="bk">
      <div className="stack">
        <section className="panel" aria-labelledby="s1-h">
          <p className="step-k">Step 1 of 2</p>
          <h2 id="s1-h">Choose a day and time</h2>
          <div className="stack">
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="legend" style={{ marginBottom: 4 }}>Day</legend>
              <div className="days">
                {days.map((d) => {
                  const first = slots.find((s) => dayKey(new Date(s.startsAt), tz) === d)!;
                  const date = new Date(first.startsAt);
                  const [wd, num] = formatDayShort(date, tz).split(" ");
                  return (
                    <label className="day" key={d}>
                      <input type="radio" name="day" value={d} checked={activeDay === d} onChange={() => { setDayChoice(d); setSlotId(undefined); }} aria-label={formatDayShort(date, tz)} />
                      <span>
                        {wd}
                        <b>{num}</b>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="legend">Time</legend>
              <div className="slots">
                {daySlots.map((s) => (
                  <label className="slot" key={s.id}>
                    <input type="radio" name="slot" value={s.id} checked={slotId === s.id} onChange={() => setSlotId(s.id)} />
                    <span>{formatTime(new Date(s.startsAt), tz)}</span>
                  </label>
                ))}
              </div>
              <p className="hint" style={{ margin: "10px 0 0" }}>
                Your time zone: <TimeZoneName /> · {minutes} minutes
              </p>
            </fieldset>
          </div>
        </section>

        <section className="panel" aria-labelledby="s2-h">
          <p className="step-k">Step 2 of 2</p>
          <h2 id="s2-h">Pay</h2>
          {selected ? (
            <BookForm
              sessionId={selected.id}
              kind="one"
              priceLabel={priceLabel}
              loggedIn={loggedIn}
              credits={credits}
              paymentsOn={paymentsOn}
              loginHref={`/login?next=${encodeURIComponent(`/one-to-one/book?format=${formatKey}&slot=${selected.id}`)}`}
            />
          ) : (
            <p className="hint">Choose a day and a time first.</p>
          )}
        </section>
      </div>

      <aside className="summary" aria-label="Your session">
        <h2>Your session</h2>
        <dl>
          <div><dt>Format</dt><dd>{formatLabel}</dd></div>
          <div><dt>When</dt><dd>{selected ? formatFor(selected.startsAt, tz, "dayTime") : "Choose a time"}</dd></div>
          <div><dt>Length</dt><dd>{minutes} minutes</dd></div>
          <div><dt>Booking for</dt><dd>{userEmail ?? "Guest"}</dd></div>
          <div className="tot"><dt>Total</dt><dd className="s-total">{priceLabel}</dd></div>
        </dl>
        <p className="note">
          <Icon name="check" />
          <span>In-person sessions: the address is sent after your booking is confirmed.</span>
        </p>
      </aside>
    </div>
  );
}
