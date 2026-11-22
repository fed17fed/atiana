"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { saveSession, type SessionState } from "@/app/admin/sessions/actions";
import { ErrorSummary, type FormProblem } from "@/components/admin/ErrorSummary";
import { StatusMessage } from "@/components/admin/states";
import { Icon } from "@/components/ui/Icon";
import { MAX_CAPACITY, MAX_REPEAT, ZOOM_URL_MAX, dateKeyLabel, repeatDateKeys } from "@/lib/admin/sessions-schema";

export type SessionOfferingOption = { id: string; title: string; kind: "GROUP_CLASS" | "EVENT"; online: boolean; minutes: number | null; hasDate: boolean; published: boolean };

export type SessionFormValues = {
  id: string | null;
  version: string;
  offeringId: string;
  date: string;
  time: string;
  minutes: string;
  capacity: string;
  zoomUrl: string;
};

const initialState: SessionState = { status: "idle" };
const FIELD_IDS: Record<string, string> = { offeringId: "s-offering", date: "s-date", time: "s-time", minutes: "s-minutes", capacity: "s-capacity", zoomUrl: "s-zoom", repeatWeeks: "s-repeat" };

/**
 * Wireframe A10. Create (with "repeat weekly" and a date preview) and edit (one session).
 * Controlled fields: React would clear plain fields after a server action, even after an error.
 * The Zoom link is private: it is only in this admin form, never printed anywhere else.
 */
export function SessionForm({
  initialValues,
  offerings,
  fixedOffering,
  readOnlyReason,
}: {
  initialValues: SessionFormValues;
  offerings: SessionOfferingOption[];
  /** Edit: the offering is fixed (name shown, not a select). */
  fixedOffering?: { title: string; kind: "GROUP_CLASS" | "EVENT"; online: boolean; published?: boolean };
  /** Edit of a past / cancelled session: fields are locked and this text says why. */
  readOnlyReason?: string;
}) {
  const [state, action, pending] = useActionState(saveSession, initialState);
  const [v, setV] = useState(initialValues);
  const [repeat, setRepeat] = useState("1");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [touchedLength, setTouchedLength] = useState(false);
  const isNew = initialValues.id === null;
  const offering = offerings.find((o) => o.id === v.offeringId);
  const kind = fixedOffering?.kind ?? offering?.kind ?? "GROUP_CLASS";
  const online = fixedOffering?.online ?? offering?.online ?? true;
  const locked = readOnlyReason !== undefined;
  const hiddenOffering = isNew ? !!offering && !offering.published : fixedOffering?.published === false;

  const [edited, setEdited] = useState<{ state: SessionState } | null>(null);
  const dirty = edited !== null && !(state.status === "ok" && edited.state !== state);
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const set = <K extends keyof SessionFormValues>(k: K, value: SessionFormValues[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    setEdited({ state });
  };

  const repeatN = kind === "EVENT" ? 1 : Number.parseInt(repeat, 10);
  const keys = isNew ? repeatDateKeys(v.date, Number.isFinite(repeatN) ? repeatN : 1) : [];
  const included = keys.filter((k) => !skipped.includes(k));

  const errs = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const err = (k: string) => errs[k]?.[0];
  const problems: FormProblem[] = Object.entries(errs).map(([k, list]) => ({ fieldId: FIELD_IDS[k] ?? "s-date", message: list[0] }));
  const formError = state.status === "error" && problems.length === 0 ? state.message : null;

  return (
    <form action={action} noValidate className="form-grid" style={{ maxWidth: 640 }}>
      {state.status === "ok" && (
        <StatusMessage href={kind === "EVENT" ? "/events" : "/schedule"} linkLabel={kind === "EVENT" ? "View the events page" : "View the schedule"}>
          {state.message}
        </StatusMessage>
      )}
      <ErrorSummary problems={problems} title={problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"}` : undefined} />
      {formError && (
        <div className="alert a-error" role="alert">
          <Icon name="error" />
          <div>
            <p>{formError}</p>
          </div>
        </div>
      )}
      {locked && (
        <div className="alert a-warn" role="note">
          <Icon name="info" />
          <div>
            <p>{readOnlyReason}</p>
          </div>
        </div>
      )}
      {hiddenOffering && (
        <div className="alert a-warn" role="note" data-testid="hidden-offering-warning">
          <Icon name="info" />
          <div>
            <p>
              <b>Warning: this {kind === "EVENT" ? "event" : "class"} is hidden.</b> {isNew ? "You can still add the session," : "You can still save the session,"} but it will not show on the site until you restore the {kind === "EVENT" ? "event" : "class"} on the Classes and events page.
            </p>
          </div>
        </div>
      )}
      {initialValues.id && <input type="hidden" name="id" value={initialValues.id} />}
      {!isNew && <input type="hidden" name="version" value={state.status === "ok" && state.version ? state.version : initialValues.version} />}
      {isNew && skipped.map((k) => <input key={k} type="hidden" name="skip" value={k} />)}

      <fieldset className="adm-fieldset" disabled={locked}>
        <legend>{isNew ? "Add session" : "Session"}</legend>
        {isNew ? (
          <div className={`field ${err("offeringId") ? "has-error" : ""}`}>
            <label htmlFor="s-offering">Class or event <span className="req">(required)</span></label>
            <select
              id="s-offering"
              name="offeringId"
              className="input select"
              value={v.offeringId}
              aria-invalid={!!err("offeringId")}
              onChange={(e) => {
                const id = e.target.value;
                const o = offerings.find((x) => x.id === id);
                setV((x) => ({ ...x, offeringId: id, minutes: o?.minutes && !touchedLength ? String(o.minutes) : x.minutes }));
                setEdited({ state });
              }}
            >
              <option value="">Choose…</option>
              {(["GROUP_CLASS", "EVENT"] as const).map((k) => (
                <optgroup key={k} label={k === "EVENT" ? "Events (one date each)" : "Classes"}>
                  {offerings
                    .filter((o) => o.kind === k)
                    .map((o) => (
                      <option key={o.id} value={o.id} disabled={o.kind === "EVENT" && o.hasDate}>
                        {o.title}
                        {o.published ? "" : " (hidden)"}
                        {o.kind === "EVENT" && o.hasDate ? " (has a date already)" : ""}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            {err("offeringId") && <p className="err">{err("offeringId")}</p>}
          </div>
        ) : (
          <p style={{ margin: 0 }}>
            <b>{fixedOffering?.title}</b> <span className="adm-badge">{kind === "EVENT" ? "Event" : "Class"}</span>
          </p>
        )}

        <div className={`field ${err("date") ? "has-error" : ""}`}>
          <label htmlFor="s-date">Date <span className="req">(required)</span></label>
          <input id="s-date" name="date" type="date" className="input" aria-invalid={!!err("date")} value={v.date} onChange={(e) => set("date", e.target.value)} />
          {err("date") && <p className="err">{err("date")}</p>}
        </div>
        <div className={`field ${err("time") ? "has-error" : ""}`}>
          <label htmlFor="s-time">Start time <span className="req">(required)</span></label>
          <input id="s-time" name="time" type="time" className="input" aria-describedby="s-time-h" aria-invalid={!!err("time")} value={v.time} onChange={(e) => set("time", e.target.value)} />
          <span id="s-time-h" className="hint">Your time zone: Europe/Dublin. Clients see their own time zone.</span>
          {err("time") && <p className="err">{err("time")}</p>}
        </div>
        <div className={`field ${err("minutes") ? "has-error" : ""}`}>
          <label htmlFor="s-minutes">Length in minutes <span className="req">(required)</span></label>
          <input
            id="s-minutes"
            name="minutes"
            type="number"
            inputMode="numeric"
            min={15}
            max={600}
            className="input"
            aria-invalid={!!err("minutes")}
            value={v.minutes}
            onChange={(e) => {
              setTouchedLength(true);
              set("minutes", e.target.value);
            }}
          />
          {err("minutes") && <p className="err">{err("minutes")}</p>}
        </div>
        <div className={`field ${err("capacity") ? "has-error" : ""}`}>
          <label htmlFor="s-capacity">Capacity (seats) <span className="req">(required)</span></label>
          <input id="s-capacity" name="capacity" type="number" inputMode="numeric" min={1} max={MAX_CAPACITY} className="input" aria-invalid={!!err("capacity")} value={v.capacity} onChange={(e) => set("capacity", e.target.value)} />
          {err("capacity") && <p className="err">{err("capacity")}</p>}
        </div>
        {online ? (
          <div className={`field ${err("zoomUrl") ? "has-error" : ""}`}>
            <label htmlFor="s-zoom">Zoom link (private)</label>
            <input
              id="s-zoom"
              name="zoomUrl"
              type="url"
              className="input"
              maxLength={ZOOM_URL_MAX}
              autoComplete="off"
              spellCheck={false}
              placeholder="https://…"
              aria-describedby="s-zoom-h"
              aria-invalid={!!err("zoomUrl")}
              value={v.zoomUrl}
              onChange={(e) => set("zoomUrl", e.target.value)}
            />
            <span id="s-zoom-h" className="hint">Only shown to booked people, in their email and My bookings. Never on public pages. Leave empty if you do not have it yet.</span>
            {err("zoomUrl") && <p className="err">{err("zoomUrl")}</p>}
          </div>
        ) : (
          <p className="hint">This is an in-person offering. It has no Zoom link. The place is set on the class or event.</p>
        )}

        {isNew && kind === "GROUP_CLASS" && (
          <>
            <div className={`field ${err("repeatWeeks") ? "has-error" : ""}`}>
              <label htmlFor="s-repeat">Repeat weekly (times)</label>
              <input id="s-repeat" name="repeatWeeks" type="number" inputMode="numeric" min={1} max={MAX_REPEAT} className="input" aria-describedby="s-repeat-h" aria-invalid={!!err("repeatWeeks")} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
              <span id="s-repeat-h" className="hint">1 = only this day. At most {MAX_REPEAT}. The same weekday and time every week.</span>
              {err("repeatWeeks") && <p className="err">{err("repeatWeeks")}</p>}
            </div>
          </>
        )}
        {isNew && kind === "EVENT" && <input type="hidden" name="repeatWeeks" value="1" />}
        {isNew && keys.length > 0 && (
          <fieldset className="adm-fieldset" aria-describedby="s-dates-h">
            <legend>Dates to create</legend>
            <span id="s-dates-h" className="hint">Untick a date to skip it (for example a holiday).</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {keys.map((k) => (
                <label key={k} className="check">
                  <input
                    type="checkbox"
                    checked={!skipped.includes(k)}
                    onChange={(e) => {
                      setSkipped((s) => (e.target.checked ? s.filter((x) => x !== k) : [...s, k]));
                      setEdited({ state });
                    }}
                  />
                  <span className="box" aria-hidden="true"><Icon name="check" className="size-4!" /></span>
                  <span className="txt">{dateKeyLabel(k)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </fieldset>

      <div className="adm-quick">
        {!locked && (
          <button type="submit" className="btn btn-primary" disabled={pending || (isNew && keys.length > 0 && included.length === 0)}>
            {pending ? "Saving..." : isNew ? (included.length > 1 ? `Create ${included.length} sessions` : "Create session") : "Save"}
          </button>
        )}
        <Link className="btn btn-outline" href="/admin/sessions" prefetch={false}>
          Back to the list
        </Link>
      </div>
    </form>
  );
}
