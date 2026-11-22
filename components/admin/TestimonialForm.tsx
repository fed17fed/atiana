"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveTestimonial, type TestimonialState } from "@/app/admin/testimonials/actions";
import { ErrorSummary, type FormProblem } from "@/components/admin/ErrorSummary";
import { StatusMessage } from "@/components/admin/states";
import { Icon } from "@/components/ui/Icon";
import { TESTIMONIAL_NAME_MAX, TESTIMONIAL_PLACE_MAX, TESTIMONIAL_TEXT_MAX, needsClientConsent } from "@/lib/testimonials-schema";

export type TestimonialFormValues = { id: string | null; version: string; name: string; place: string; text: string; sortOrder: number; published: boolean; isDemo: boolean };

const initial: TestimonialState = { status: "idle" };
const FIELD_IDS: Record<string, string> = { name: "t-name", place: "t-place", text: "t-text", sortOrder: "t-order", clientAgreed: "t-agreed", isDemo: "t-demo", published: "t-pub" };

/** Wireframe A11. Controlled fields: React would clear plain fields after a server action, even after an error. */
export function TestimonialForm({ initialValues }: { initialValues: TestimonialFormValues }) {
  const [state, action, pending] = useActionState(saveTestimonial, initial);
  const [name, setName] = useState(initialValues.name);
  const [place, setPlace] = useState(initialValues.place);
  const [text, setText] = useState(initialValues.text);
  const [order, setOrder] = useState(String(initialValues.sortOrder));
  const [published, setPublished] = useState(initialValues.published);
  const [isDemo, setIsDemo] = useState(initialValues.isDemo);
  const [agreed, setAgreed] = useState(false);

  const wasDemo = initialValues.id === null ? null : initialValues.isDemo;
  const askConsent = needsClientConsent(wasDemo, isDemo);
  const errs = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const err = (k: string) => errs[k]?.[0];
  const problems: FormProblem[] = Object.entries(errs).map(([k, v]) => ({ fieldId: FIELD_IDS[k] ?? "t-name", message: v[0] }));
  const formError = state.status === "error" && problems.length === 0 ? state.message : null;

  return (
    <form action={action} noValidate className="form-grid" style={{ maxWidth: 640 }}>
      {state.status === "ok" && (
        <StatusMessage href="/" linkLabel="View the Home page">
          {state.message}
        </StatusMessage>
      )}
      <ErrorSummary problems={problems} title={problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"}` : undefined} />
      {formError && (
        <div className="alert a-error" role="alert">
          <Icon name="error" />
          <div><p>{formError}</p></div>
        </div>
      )}
      {initialValues.id && <input type="hidden" name="id" value={initialValues.id} />}
      <input type="hidden" name="version" value={state.status === "ok" && state.version ? state.version : initialValues.version} />

      <div className={`field ${err("name") ? "has-error" : ""}`}>
        <label htmlFor="t-name">Name <span className="req">(required)</span></label>
        <input id="t-name" name="name" className="input" maxLength={TESTIMONIAL_NAME_MAX} autoComplete="off" aria-describedby="t-name-h" aria-invalid={!!err("name")} value={name} onChange={(e) => setName(e.target.value)} />
        <span id="t-name-h" className="hint">A first name is enough.</span>
        {err("name") && <p className="err">{err("name")}</p>}
      </div>
      <div className={`field ${err("place") ? "has-error" : ""}`}>
        <label htmlFor="t-place">Place</label>
        <input id="t-place" name="place" className="input" maxLength={TESTIMONIAL_PLACE_MAX} autoComplete="off" aria-invalid={!!err("place")} value={place} onChange={(e) => setPlace(e.target.value)} />
        <span className="hint">For example Dublin. Optional.</span>
        {err("place") && <p className="err">{err("place")}</p>}
      </div>
      <div className={`field ${err("text") ? "has-error" : ""}`}>
        <label htmlFor="t-text">Quote <span className="req">(required)</span></label>
        <textarea id="t-text" name="text" className="textarea" maxLength={TESTIMONIAL_TEXT_MAX} aria-describedby="t-text-h" aria-invalid={!!err("text")} value={text} onChange={(e) => setText(e.target.value)} />
        <span id="t-text-h" className="hint">Plain text, no formatting. {text.length} of {TESTIMONIAL_TEXT_MAX} characters.</span>
        {err("text") && <p className="err">{err("text")}</p>}
      </div>
      <div className={`field ${err("sortOrder") ? "has-error" : ""}`}>
        <label htmlFor="t-order">Order number</label>
        <input id="t-order" name="sortOrder" type="number" min={0} max={999} inputMode="numeric" className="input" aria-describedby="t-order-h" aria-invalid={!!err("sortOrder")} value={order} onChange={(e) => setOrder(e.target.value)} />
        <span id="t-order-h" className="hint">The smallest number is shown first.</span>
        {err("sortOrder") && <p className="err">{err("sortOrder")}</p>}
      </div>

      <label className="check">
        <input id="t-pub" type="checkbox" name="published" checked={published} onChange={(e) => setPublished(e.target.checked)} />
        <span className="box" aria-hidden="true"><Icon name="check" className="size-4!" /></span>
        <span className="txt">Show on site</span>
      </label>
      <label className="check">
        <input id="t-demo" type="checkbox" name="isDemo" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} />
        <span className="box" aria-hidden="true"><Icon name="check" className="size-4!" /></span>
        <span className="txt">Demo review <span className="hint">(the site shows the label &quot;Demo review&quot;)</span></span>
      </label>

      {askConsent && (
        <div className="alert a-warn" role="note">
          <Icon name="info" />
          <div>
            <b>Only a real client can lose the Demo label</b>
            <p>Untick &quot;Demo review&quot; only if this is a real client who agreed to be shown.</p>
            <label className={`check ${err("clientAgreed") ? "has-error" : ""}`}>
              <input id="t-agreed" type="checkbox" name="clientAgreed" checked={agreed} aria-invalid={!!err("clientAgreed")} aria-describedby={err("clientAgreed") ? "t-agreed-e" : undefined} onChange={(e) => setAgreed(e.target.checked)} />
              <span className="box" aria-hidden="true"><Icon name="check" className="size-4!" /></span>
              <span className="txt">This client agreed to be shown on the site</span>
            </label>
            {err("clientAgreed") && <p id="t-agreed-e" className="err" style={{ color: "var(--color-danger)", fontWeight: 500 }}>{err("clientAgreed")}</p>}
          </div>
        </div>
      )}

      <div className="adm-quick">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving..." : initialValues.id ? "Save" : "Add testimonial"}
        </button>
        <Link className="btn btn-outline" href="/admin/testimonials" prefetch={false}>
          Back to the list
        </Link>
      </div>
    </form>
  );
}
