"use client";

import { tabKeyHandler } from "@/components/admin/tab-keys";
import Link from "next/link";
import { useId, useState } from "react";
import { LegalBody } from "@/components/pages/LegalBody";
import type { DiffLine } from "@/lib/legal-versions";
import "./text-editor.css";

export type DiffItem = DiffLine | { gap: number };

/**
 * Wireframe A8 (step 2): changes against the lawyer-approved text, full preview, and the publish form.
 * Added lines: "+", underline, green. Removed lines: "−", strike-through, red. A sign and a style, never colour alone.
 * The Publish button stays off until the box is ticked. The server checks the box again (the button is only a help).
 */
export function LegalPublishPanel({ slug, version, diff, added, removed, preview, canPublish, dateNote, publishAction }: { slug: string; version: string; diff: DiffItem[]; added: number; removed: number; preview: string; canPublish: boolean; dateNote: string; publishAction: (formData: FormData) => void | Promise<void> }) {
  const [tab, setTab] = useState<"changes" | "preview">("changes");
  const [ticked, setTicked] = useState(false);
  const id = useId();
  return (
    <div className="lg-publish">
      <p role="status" id={`${id}-sum`}>
        <b>
          {added} line{added === 1 ? "" : "s"} added, {removed} removed
        </b>{" "}
        (compared with the lawyer-approved text).
      </p>
      <div className="lg-tabs" role="tablist" aria-label="Publish views" onKeyDown={tabKeyHandler([{ value: "changes", id: `${id}-t1` }, { value: "preview", id: `${id}-t2` }], tab, setTab)}>
        <button type="button" role="tab" id={`${id}-t1`} className="te-tab" aria-selected={tab === "changes"} tabIndex={tab === "changes" ? 0 : -1} aria-controls={`${id}-p1`} onClick={() => setTab("changes")}>
          Changes
        </button>
        <button type="button" role="tab" id={`${id}-t2`} className="te-tab" aria-selected={tab === "preview"} tabIndex={tab === "preview" ? 0 : -1} aria-controls={`${id}-p2`} onClick={() => setTab("preview")}>
          Full preview
        </button>
      </div>
      <section id={`${id}-p1`} role="tabpanel" aria-labelledby={`${id}-t1`} hidden={tab !== "changes"}>
        <ul className="lg-diff" aria-label="Changed lines">
          {diff.map((d, i) =>
            "gap" in d ? (
              <li key={i} className="lg-gap">
                <span className="lg-sign" aria-hidden="true">…</span>
                <span>{d.gap} unchanged line{d.gap === 1 ? "" : "s"}</span>
              </li>
            ) : (
              <li key={i} className={d.type === "add" ? "lg-add" : d.type === "del" ? "lg-del" : undefined}>
                <span className="lg-sign">
                  {d.type === "add" ? "+" : d.type === "del" ? "−" : ""}
                  {d.type !== "same" && <span className="sr-only">{d.type === "add" ? "Added: " : "Removed: "}</span>}
                </span>
                <span>{d.text === "" ? " " : d.text}</span>
              </li>
            ),
          )}
        </ul>
      </section>
      <section id={`${id}-p2`} role="tabpanel" aria-labelledby={`${id}-t2`} hidden={tab !== "preview"} className="lg-prev">
        <div className="legal">
          <LegalBody body={preview} />
        </div>
      </section>

      <p className="hint">{dateNote}</p>
      {canPublish ? (
        <form action={publishAction} className="lg-publish">
          <input type="hidden" name="version" value={version} />
          <label className="lg-check" htmlFor={`${id}-ok`}>
            <input id={`${id}-ok`} type="checkbox" name="confirm" value="yes" checked={ticked} onChange={(e) => setTicked(e.target.checked)} aria-describedby={`${id}-why`} />
            <span>I understand this text is not checked by a lawyer.</span>
          </label>
          <div className="adm-actions">
            <button type="submit" className="btn btn-primary" disabled={!ticked} aria-disabled={!ticked}>
              Publish
            </button>
            <Link className="btn btn-outline" href={`/admin/legal/${slug}`} prefetch={false}>
              Back to editing
            </Link>
          </div>
          <p id={`${id}-why`} className="hint">
            {ticked ? "Publish makes this text public at once." : "Publish is off until you tick the box."}
          </p>
        </form>
      ) : (
        <div className="adm-actions">
          <button type="button" className="btn btn-primary" disabled aria-disabled="true">
            Publish
          </button>
          <Link className="btn btn-outline" href={`/admin/legal/${slug}`} prefetch={false}>
            Back to editing
          </Link>
        </div>
      )}
    </div>
  );
}
