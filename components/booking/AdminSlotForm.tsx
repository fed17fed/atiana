"use client";

import { useActionState, useState } from "react";
import { addSlots, type SlotState } from "@/app/admin/slots/actions";
import { Icon } from "@/components/ui/Icon";

const initial: SlotState = { status: "idle" };

export function AdminSlotForm({ offerings }: { offerings: { id: string; title: string }[] }) {
  const [state, action, pending] = useActionState(addSlots, initial);
  // Controlled fields: React clears plain form fields after a server action, even after an error.
  const [offeringId, setOfferingId] = useState(offerings[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("14:00");
  const [minutes, setMinutes] = useState("60");
  const [repeat, setRepeat] = useState("1");
  const err = (k: string) => (state.status === "error" ? state.fieldErrors?.[k]?.[0] : undefined);
  return (
    <form action={action} noValidate className="form-grid">
      {state.status === "ok" && (
        <div className="alert a-success" role="status">
          <Icon name="check" />
          <div><p>{state.message}</p></div>
        </div>
      )}
      {state.status === "error" && (
        <div className="alert a-error" role="alert">
          <Icon name="error" />
          <div><p>{state.message}</p></div>
        </div>
      )}
      <div className={`field ${err("offeringId") ? "has-error" : ""}`}>
        <label htmlFor="s-off">1:1 offering</label>
        <select id="s-off" name="offeringId" className="input select" required value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
          {offerings.map((o) => (
            <option key={o.id} value={o.id}>{o.title}</option>
          ))}
        </select>
        {err("offeringId") && <p className="err">{err("offeringId")}</p>}
      </div>
      <div className={`field ${err("date") ? "has-error" : ""}`}>
        <label htmlFor="s-date">Date (Europe/Dublin)</label>
        <input id="s-date" name="date" type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} />
        {err("date") && <p className="err">{err("date")}</p>}
      </div>
      <div className={`field ${err("time") ? "has-error" : ""}`}>
        <label htmlFor="s-time">Start time (Europe/Dublin)</label>
        <input id="s-time" name="time" type="time" className="input" required value={time} onChange={(e) => setTime(e.target.value)} />
        {err("time") && <p className="err">{err("time")}</p>}
      </div>
      <div className={`field ${err("minutes") ? "has-error" : ""}`}>
        <label htmlFor="s-min">Length in minutes</label>
        <input id="s-min" name="minutes" type="number" min={15} max={240} className="input" required value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        {err("minutes") && <p className="err">{err("minutes")}</p>}
      </div>
      <div className={`field ${err("repeatWeeks") ? "has-error" : ""}`}>
        <label htmlFor="s-rep">Repeat every week for (weeks)</label>
        <input id="s-rep" name="repeatWeeks" type="number" min={1} max={12} className="input" required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        <span className="hint">1 = only this day.</span>
        {err("repeatWeeks") && <p className="err">{err("repeatWeeks")}</p>}
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving..." : "Add slots"}
      </button>
    </form>
  );
}
