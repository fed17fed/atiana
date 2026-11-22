"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { saveOffering, type OfferingState } from "@/app/admin/offerings/actions";
import { ErrorSummary, type FormProblem } from "@/components/admin/ErrorSummary";
import { ImagePicker, type LibraryImage } from "@/components/admin/ImagePicker";
import { StatusMessage } from "@/components/admin/states";
import { OfferingBody } from "@/components/pages/OfferingBody";
import { Icon } from "@/components/ui/Icon";
import {
  BODY_MAX,
  KIND_LABEL,
  LENGTH_LABEL_MAX,
  LEVEL_MAX,
  LOCATION_MAX,
  SLUG_MAX,
  SUMMARY_MAX,
  TITLE_MAX,
  textProblems,
  type OfferingKind,
  type OfferingMode,
  type OfferingPricing,
} from "@/lib/offerings-schema";
import { MAX_ALT_LENGTH } from "@/lib/images/rules";
import { TOKEN_NAMES, fillTokens } from "@/lib/text-tokens";

export type OfferingFormValues = {
  id: string | null;
  version: string;
  type: OfferingKind;
  slug: string;
  title: string;
  summary: string;
  body: string;
  level: string;
  minutes: string;
  lengthLabel: string;
  activationAfterMinutes: string;
  price: string;
  eventPricing: OfferingPricing;
  mode: OfferingMode;
  location: string;
  image: string;
  imageAlt: string;
  sortOrder: string;
  published: boolean;
};

const initialState: OfferingState = { status: "idle" };
const FIELD_IDS: Record<string, string> = {
  type: "o-type",
  title: "o-title",
  slug: "o-slug",
  summary: "o-summary",
  body: "o-body",
  level: "o-level",
  minutes: "o-minutes",
  lengthLabel: "o-length",
  activationAfterMinutes: "o-greeting",
  price: "o-price",
  eventPricing: "o-pricing",
  mode: "o-mode",
  location: "o-location",
  image: "o-image-btn",
  imageAlt: "o-alt",
  sortOrder: "o-order",
};

function publicLink(type: OfferingKind, slug: string): { href: string; label: string } {
  if (type === "EVENT") return { href: `/events/${slug}`, label: "View the event page" };
  if (type === "ONE_TO_ONE") return { href: "/one-to-one", label: "View the 1:1 page" };
  return { href: "/classes", label: "View the classes page" };
}

/** Wireframe A9. Controlled fields: React would clear plain fields after a server action, even after an error. */
export function OfferingForm({ initialValues, library, uploadActive, created = false }: { initialValues: OfferingFormValues; library: LibraryImage[]; uploadActive: boolean; created?: boolean }) {
  const [state, action, pending] = useActionState(saveOffering, initialState);
  const [v, setV] = useState(initialValues);
  const set = <K extends keyof OfferingFormValues>(k: K, value: OfferingFormValues[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    setEdit({ state });
  };
  const isNew = initialValues.id === null;
  const type = v.type;
  const isClass = type === "GROUP_CLASS";
  const isOneToOne = type === "ONE_TO_ONE";
  const isEvent = type === "EVENT";
  const needsPrice = isClass || isOneToOne || (isEvent && v.eventPricing === "PAID");
  const showGreeting = isClass || isEvent;

  // "Leave page?" prompt while there are unsaved changes. A successful save newer than the last edit clears it.
  const [edit, setEdit] = useState<{ state: OfferingState } | null>(null);
  const dirty = edit !== null && !(state.status === "ok" && edit.state !== state);
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const errs = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const err = (k: string) => errs[k]?.[0];
  const problems: FormProblem[] = Object.entries(errs).map(([k, list]) => ({ fieldId: FIELD_IDS[k] ?? "o-title", message: list[0] }));
  const formError = state.status === "error" && problems.length === 0 ? state.message : null;

  // Live hints (the server checks again): rule numbers typed by hand, unknown tokens, private data.
  const summaryHints = textProblems(v.summary);
  const bodyHints = textProblems(v.body);
  const link = publicLink(type, v.slug);
  const currentImage: LibraryImage | null = v.image ? { id: "current", url: v.image, alt: v.imageAlt } : null;

  return (
    <form action={action} noValidate className="form-grid" style={{ maxWidth: 820 }}>
      {(state.status === "ok" || created) && (
        <StatusMessage href={link.href} linkLabel={link.label}>
          {v.published ? (state.status === "ok" ? `${state.message} It is on the site now.` : "Saved. It is on the site now.") : "Saved. It is hidden – not on the site."}
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
      {initialValues.id && <input type="hidden" name="id" value={initialValues.id} />}
      <input type="hidden" name="version" value={state.status === "ok" && state.version ? state.version : initialValues.version} />
      {!isNew && <input type="hidden" name="type" value={type} />}
      <input type="hidden" name="image" value={v.image} />

      <fieldset className="adm-fieldset">
        <legend>Basics</legend>
        {isNew ? (
          <div className={`field ${err("type") ? "has-error" : ""}`}>
            <label htmlFor="o-type">Type <span className="req">(required)</span></label>
            <select id="o-type" name="type" className="input select" value={v.type} aria-invalid={!!err("type")} aria-describedby="o-type-h" onChange={(e) => set("type", e.target.value as OfferingKind)}>
              <option value="GROUP_CLASS">Class</option>
              <option value="EVENT">Event</option>
            </select>
            <span id="o-type-h" className="hint">The two 1:1 formats (online and in person) already exist. Edit them from the list.</span>
            {err("type") && <p className="err">{err("type")}</p>}
          </div>
        ) : (
          <p className="hint">Type: {KIND_LABEL[type]}. The type never changes.</p>
        )}
        <div className={`field ${err("title") ? "has-error" : ""}`}>
          <label htmlFor="o-title">Title <span className="req">(required)</span></label>
          <input id="o-title" name="title" className="input" maxLength={TITLE_MAX} autoComplete="off" aria-invalid={!!err("title")} value={v.title} onChange={(e) => set("title", e.target.value)} />
          {err("title") && <p className="err">{err("title")}</p>}
        </div>
        <div className={`field ${err("slug") ? "has-error" : ""}`}>
          <label htmlFor="o-slug">URL name {isNew && <span className="req">(required)</span>}</label>
          <input
            id="o-slug"
            name="slug"
            className="input"
            maxLength={SLUG_MAX}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            readOnly={!isNew}
            aria-readonly={!isNew}
            aria-invalid={!!err("slug")}
            aria-describedby="o-slug-h"
            value={v.slug}
            onChange={(e) => set("slug", e.target.value)}
          />
          <span id="o-slug-h" className="hint">
            {isNew ? "Small letters, numbers and dashes. " : "Locked: public links must not break. "}
            {isEvent && <>Public address: <code>/events/{v.slug || "..."}</code></>}
          </span>
          {err("slug") && <p className="err">{err("slug")}</p>}
        </div>
        <div className={`field ${err("summary") || summaryHints.length ? "has-error" : ""}`}>
          <label htmlFor="o-summary">Short summary <span className="req">(required)</span></label>
          <textarea id="o-summary" name="summary" className="textarea" rows={3} maxLength={SUMMARY_MAX} aria-invalid={!!err("summary")} aria-describedby="o-summary-h" value={v.summary} onChange={(e) => set("summary", e.target.value)} />
          <span id="o-summary-h" className="hint">Shown on cards and in search results. {v.summary.length} of {SUMMARY_MAX} characters.</span>
          {errs.summary?.length ? errs.summary.map((m) => <p key={m} className="err">{m}</p>) : summaryHints.map((m) => <p key={m} className="err" role="status">{m}</p>)}
        </div>
      </fieldset>

      <fieldset className="adm-fieldset">
        <legend>Text</legend>
        <div className={`field ${err("body") || bodyHints.length ? "has-error" : ""}`}>
          <label htmlFor="o-body">Full description</label>
          <textarea id="o-body" name="body" className="textarea" rows={14} maxLength={BODY_MAX} aria-invalid={!!err("body")} aria-describedby="o-body-h" value={v.body} onChange={(e) => set("body", e.target.value)} />
          <span id="o-body-h" className="hint">
            Markdown: <code>## Heading</code>, <code>- list item</code>, <code>**bold**</code>, <code>[link](https://...)</code>. Rule numbers only as tokens:{" "}
            {TOKEN_NAMES.map((n) => (
              <code key={n} style={{ marginRight: 6 }}>{`{{${n}}}`}</code>
            ))}
            . Session lengths like &quot;30 minutes&quot; are plain text.
          </span>
          {errs.body?.length ? errs.body.map((m) => <p key={m} className="err">{m}</p>) : bodyHints.map((m) => <p key={m} className="err" role="status">{m}</p>)}
        </div>
        <div>
          <p className="legend" id="o-prev-h" style={{ margin: "0 0 6px" }}>Preview</p>
          <div className="adm-preview" aria-labelledby="o-prev-h" tabIndex={0}>
            {v.body.trim() ? <OfferingBody markdown={fillTokens(v.body)} headingLevel={2} /> : <p className="hint">Nothing to preview yet.</p>}
          </div>
        </div>
      </fieldset>

      <fieldset className="adm-fieldset">
        <legend>Details</legend>
        {isEvent && (
          <div className={`field ${err("eventPricing") ? "has-error" : ""}`}>
            <label htmlFor="o-pricing">Event type <span className="req">(required)</span></label>
            <select id="o-pricing" name="eventPricing" className="input select" value={v.eventPricing} aria-invalid={!!err("eventPricing")} onChange={(e) => set("eventPricing", e.target.value as OfferingPricing)}>
              <option value="FREE">Free</option>
              <option value="DONATION">By donation</option>
              <option value="PAID">Paid</option>
            </select>
            {err("eventPricing") && <p className="err">{err("eventPricing")}</p>}
          </div>
        )}
        {isClass && (
          <div className={`field ${err("level") ? "has-error" : ""}`}>
            <label htmlFor="o-level">Level</label>
            <input id="o-level" name="level" className="input" maxLength={LEVEL_MAX} autoComplete="off" aria-invalid={!!err("level")} value={v.level} onChange={(e) => set("level", e.target.value)} />
            <span className="hint">For example: All levels.</span>
            {err("level") && <p className="err">{err("level")}</p>}
          </div>
        )}
        {(isClass || isOneToOne || isEvent) && (
          <div className={`field ${err("minutes") ? "has-error" : ""}`}>
            <label htmlFor="o-minutes">Minutes {!isEvent && <span className="req">(required)</span>}</label>
            <input id="o-minutes" name="minutes" type="number" min={1} max={600} inputMode="numeric" className="input" aria-invalid={!!err("minutes")} value={v.minutes} onChange={(e) => set("minutes", e.target.value)} />
            {err("minutes") && <p className="err">{err("minutes")}</p>}
          </div>
        )}
        {isEvent && (
          <div className={`field ${err("lengthLabel") ? "has-error" : ""}`}>
            <label htmlFor="o-length">Length label</label>
            <input id="o-length" name="lengthLabel" className="input" maxLength={LENGTH_LABEL_MAX} autoComplete="off" aria-invalid={!!err("lengthLabel")} aria-describedby="o-length-h" value={v.lengthLabel} onChange={(e) => set("lengthLabel", e.target.value)} />
            <span id="o-length-h" className="hint">Plain text shown on the event page. Example: 60 min.</span>
            {err("lengthLabel") && <p className="err">{err("lengthLabel")}</p>}
          </div>
        )}
        {showGreeting && (
          <div className={`field ${err("activationAfterMinutes") ? "has-error" : ""}`}>
            <label htmlFor="o-greeting">Greeting first: main part starts after N minutes</label>
            <input id="o-greeting" name="activationAfterMinutes" type="number" min={1} max={600} inputMode="numeric" className="input" aria-invalid={!!err("activationAfterMinutes")} aria-describedby="o-greeting-h" value={v.activationAfterMinutes} onChange={(e) => set("activationAfterMinutes", e.target.value)} />
            <span id="o-greeting-h" className="hint">Leave empty if there is no greeting. The door closes when the main part starts.</span>
            {err("activationAfterMinutes") && <p className="err">{err("activationAfterMinutes")}</p>}
          </div>
        )}
        {needsPrice && (
          <div className={`field ${err("price") ? "has-error" : ""}`}>
            <label htmlFor="o-price">Price in EUR <span className="req">(required)</span></label>
            <input id="o-price" name="price" inputMode="decimal" className="input" autoComplete="off" aria-invalid={!!err("price")} aria-describedby="o-price-h" value={v.price} onChange={(e) => set("price", e.target.value)} />
            <span id="o-price-h" className="hint">
              Example: 30 or 12.50.{isClass ? " Write 0 for a free class." : ""}
              {!isNew && " Existing bookings keep their price."}
            </span>
            {err("price") && <p className="err">{err("price")}</p>}
          </div>
        )}
        {isEvent && (
          <div className={`field ${err("mode") ? "has-error" : ""}`}>
            <label htmlFor="o-mode">Format</label>
            <select id="o-mode" name="mode" className="input select" value={v.mode} aria-invalid={!!err("mode")} onChange={(e) => set("mode", e.target.value as OfferingMode)}>
              <option value="ONLINE">Online (Zoom)</option>
              <option value="IN_PERSON">In person</option>
            </select>
            {err("mode") && <p className="err">{err("mode")}</p>}
          </div>
        )}
        {isOneToOne && <input type="hidden" name="mode" value={v.mode} />}
        {(isEvent || isOneToOne) && v.mode === "IN_PERSON" && (
          <div className={`field ${err("location") ? "has-error" : ""}`}>
            <label htmlFor="o-location">Place <span className="req">(required)</span></label>
            <input id="o-location" name="location" className="input" maxLength={LOCATION_MAX} autoComplete="off" aria-invalid={!!err("location")} value={v.location} onChange={(e) => set("location", e.target.value)} />
            {err("location") && <p className="err">{err("location")}</p>}
          </div>
        )}
        {isClass && (
          <div className={`field ${err("sortOrder") ? "has-error" : ""}`}>
            <label htmlFor="o-order">Order number</label>
            <input id="o-order" name="sortOrder" type="number" min={0} max={999} inputMode="numeric" className="input" aria-invalid={!!err("sortOrder")} aria-describedby="o-order-h" value={v.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} />
            <span id="o-order-h" className="hint">The smallest number is shown first on the Classes page.</span>
            {err("sortOrder") && <p className="err">{err("sortOrder")}</p>}
          </div>
        )}
        {isEvent && (
          <p className="hint">
            The date and time of an event are set in{" "}
            {initialValues.id ? <Link href={`/admin/sessions/new?offering=${initialValues.id}`} prefetch={false}>Sessions (add the date)</Link> : "Sessions (save this event first)"}. An event without a date is not listed on the Events page, but its own page opens.
          </p>
        )}
        {isClass && initialValues.id && (
          <p className="hint">
            Dates and times of this class are in <Link href={`/admin/sessions?offering=${initialValues.id}`} prefetch={false}>Sessions</Link>.
          </p>
        )}
      </fieldset>

      {isEvent && (
      <fieldset className="adm-fieldset">
        <legend>Image</legend>
        <p className="hint">Shown on the Events page and on the event page. A 4:3 picture fits best. Choose from the library or upload a new one.</p>
        <div className={`field ${err("image") ? "has-error" : ""}`}>
          <ImagePicker
            name="pickedImage"
            library={library}
            initial={currentImage}
            uploadActive={uploadActive}
            onChange={(img) => {
              setV((x) => ({ ...x, image: img?.url ?? "", imageAlt: img ? img.alt : "" }));
              setEdit({ state });
            }}
          />
          {err("image") && <p className="err">{err("image")}</p>}
        </div>
        {v.image && (
          <div className={`field ${err("imageAlt") ? "has-error" : ""}`}>
            <label htmlFor="o-alt">Alt text <span className="req">(required)</span></label>
            <input id="o-alt" name="imageAlt" className="input" maxLength={MAX_ALT_LENGTH} autoComplete="off" aria-invalid={!!err("imageAlt")} aria-describedby="o-alt-h" value={v.imageAlt} onChange={(e) => set("imageAlt", e.target.value)} />
            <span id="o-alt-h" className="hint">Describe the photo for people who cannot see it.</span>
            {err("imageAlt") && <p className="err">{err("imageAlt")}</p>}
          </div>
        )}
      </fieldset>
      )}

      <fieldset className="adm-fieldset">
        <legend>Visibility</legend>
        <label className="check">
          <input id="o-pub" type="checkbox" name="published" checked={v.published} onChange={(e) => set("published", e.target.checked)} />
          <span className="box" aria-hidden="true"><Icon name="check" className="size-4!" /></span>
          <span className="txt">Published <span className="hint">(untick to hide it from the site; nothing is removed)</span></span>
        </label>
      </fieldset>

      <div className="adm-quick">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving..." : isNew ? "Add" : "Save"}
        </button>
        <Link className="btn btn-outline" href="/admin/offerings" prefetch={false}>
          Back to the list
        </Link>
      </div>
    </form>
  );
}
