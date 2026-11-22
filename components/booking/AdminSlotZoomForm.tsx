"use client";

import { useActionState, useState } from "react";
import { saveSlotZoom, type SlotState } from "@/app/admin/slots/actions";
import { ZOOM_URL_MAX } from "@/lib/admin/sessions-schema";

const initial: SlotState = { status: "idle" };

/** Edit the private Zoom link of one 1:1 slot. Empty = placeholder again. The link is only in this admin form. */
export function AdminSlotZoomForm({ id, initialUrl }: { id: string; initialUrl: string }) {
  const [state, action, pending] = useActionState(saveSlotZoom.bind(null, id), initial);
  const [url, setUrl] = useState(initialUrl);
  const err = state.status === "error" ? (state.fieldErrors?.zoomUrl?.[0] ?? state.message) : undefined;
  return (
    <details className="adm-zoom">
      <summary>Zoom link</summary>
      <form action={action} noValidate className="form-grid">
        <div className={`field ${err ? "has-error" : ""}`}>
          <label htmlFor={`z-${id}`}>Zoom link (private)</label>
          <input id={`z-${id}`} name="zoomUrl" type="url" inputMode="url" autoComplete="off" maxLength={ZOOM_URL_MAX} className="input" placeholder="https://" aria-invalid={!!err} value={url} onChange={(e) => setUrl(e.target.value)} />
          <span className="hint">Empty = placeholder.</span>
          {err && <p className="err">{err}</p>}
        </div>
        {state.status === "ok" && <p role="status" className="hint">{state.message}</p>}
        <button className="btn btn-outline" type="submit" disabled={pending}>{pending ? "Saving..." : "Save link"}</button>
      </form>
    </details>
  );
}
