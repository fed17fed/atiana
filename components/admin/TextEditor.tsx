"use client";

import Link from "next/link";
import { useActionState, useDeferredValue, useEffect, useRef, useState } from "react";
import { restoreLawyerApprovedAction, saveLegalDraftAction } from "@/app/admin/legal/actions";
import { backToDefaultAction, saveTextAction, type TextSaveState } from "@/app/admin/texts/actions";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { ErrorSummary, type FormProblem } from "@/components/admin/ErrorSummary";
import { StatusMessage } from "@/components/admin/states";
import { LegalBody } from "@/components/pages/LegalBody";
import { Icon } from "@/components/ui/Icon";
import { RichText } from "@/components/ui/RichText";
import { splitParagraphs } from "@/lib/inline-text";
import { tabKeyHandler } from "@/components/admin/tab-keys";
import { RULE_TOKENS, fillTokens } from "@/lib/text-tokens";
import "./text-editor.css";

export type TextEditorEntry = { key: string; label: string; kind: "TEXT" | "INLINE" | "MARKDOWN" | "META" | "ALT" | "URL"; pageLabel: string; pagePath: string; multiline: boolean; maxLength: number; defaultText: string };
export type TokenInfo = { name: string; value: string; rule: boolean };
/** Legal mode (task 12.13, wireframe A7): the same editor, but it saves a DRAFT, previews the whole Markdown page and has no "Back to default". */
export type LegalMode = { slug: string; draftWaiting: boolean };

const initial: TextSaveState = { status: "idle" };
const MARKS = (kind: TextEditorEntry["kind"]) => kind === "INLINE" || kind === "MARKDOWN";

/** The preview shows what the site shows: same RichText, same paragraph split, tokens filled with the real numbers. */
function Preview({ kind, text, legal }: { kind: TextEditorEntry["kind"]; text: string; legal: boolean }) {
  const filled = fillTokens(text);
  if (legal) return <div className="legal"><LegalBody body={filled} /></div>;
  if (kind === "MARKDOWN") return <>{splitParagraphs(filled).map((p, i) => <p key={i}><RichText text={p} /></p>)}</>;
  if (kind === "INLINE") return <p><RichText text={filled} /></p>;
  return <p style={{ whiteSpace: "pre-wrap" }}>{filled}</p>;
}

/** Wireframe A4. Controlled fields (React would clear plain fields after a server action, even after an error). */
export function TextEditor({ entry, flash, initialValue, initialVersion, edited, lastSaved, tokens, legal }: { entry: TextEditorEntry; flash: { ok: boolean; text: string } | null; initialValue: string; initialVersion: string; edited: boolean; lastSaved: string | null; tokens: TokenInfo[]; legal?: LegalMode }) {
  const [state, action, pending] = useActionState(legal ? saveLegalDraftAction : saveTextAction, initial);
  const [value, setValue] = useState(initialValue);
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const boxRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const preview = useDeferredValue(value);

  const saved = state.status === "ok" ? state : null;
  const baseline = saved ? saved.value : initialValue;
  const version = saved ? saved.version : initialVersion;
  const dirty = value !== baseline;
  const canPreviewChanges = !!legal && (legal.draftWaiting || saved !== null) && !dirty;
  const here = legal ? `/admin/legal/${legal.slug}` : `/admin/texts/${entry.key}`;

  // Browser prompt "Leave page?" while there are unsaved changes (the links of this editor are normal links, so it also fires for them).
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const problems: FormProblem[] = state.status === "error" && state.problems ? state.problems.map((m) => ({ fieldId: "te-value", message: m })) : [];
  const formError = state.status === "error" && !state.problems ? state.message : null;

  function insertToken(name: string) {
    const el = boxRef.current;
    const text = `{{${name}}}`;
    if (!el) return setValue((v) => v + text);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const next = value.slice(0, start) + text + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  const boxProps = {
    id: "te-value",
    name: "value",
    className: entry.multiline ? "textarea te-box" : "input te-box",
    value,
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setValue(e.target.value),
    "aria-describedby": "te-value-h" + (problems.length ? " te-value-e" : ""),
    "aria-invalid": problems.length > 0,
    autoComplete: "off",
  } as const;

  return (
    <div className="te" data-tab={tab}>
      <p className="hint">
        {legal ? (
          <>
            Legal page · key <code>legal.{legal.slug}.body</code> · {legal.draftWaiting || saved !== null ? "Draft waiting (not public)" : "Published text"}.
          </>
        ) : (
          <>
            {entry.pageLabel} page · key <code>{entry.key}</code> · {edited || saved !== null ? "Edited" : "Default"} text.
          </>
        )}
      </p>
      {state.status === "idle" && flash && (flash.ok ? (
        <StatusMessage href={entry.pagePath} linkLabel="View page">
          {flash.text}
        </StatusMessage>
      ) : (
        <div className="alert a-error" role="alert">
          <Icon name="error" />
          <div>
            <p>{flash.text}</p>
          </div>
        </div>
      ))}
      {state.status === "ok" && (
        <StatusMessage href={legal ? undefined : entry.pagePath} linkLabel={legal ? undefined : "View page"}>
          {state.message}
        </StatusMessage>
      )}
      <ErrorSummary problems={problems} title={problems.length ? `Cannot save: ${problems.length} problem${problems.length === 1 ? "" : "s"}` : undefined} />
      {formError && (
        <div className="alert a-error" role="alert">
          <Icon name="error" />
          <div>
            <p>{formError}</p>
            {state.status === "error" && state.stale && (
              <p>
                <a href={here}>Reload this text</a>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="te-tabs" role="tablist" aria-label="Editor views" onKeyDown={tabKeyHandler([{ value: "edit", id: "te-tab-edit" }, { value: "preview", id: "te-tab-preview" }], tab, setTab)}>
        <button type="button" role="tab" id="te-tab-edit" className="te-tab" aria-selected={tab === "edit"} tabIndex={tab === "edit" ? 0 : -1} aria-controls="te-edit-panel" onClick={() => setTab("edit")}>
          Edit
        </button>
        <button type="button" role="tab" id="te-tab-preview" className="te-tab" aria-selected={tab === "preview"} tabIndex={tab === "preview" ? 0 : -1} aria-controls="te-preview" onClick={() => setTab("preview")}>
          Preview
        </button>
      </div>

      <div className="te-panels">
        <div id="te-edit-panel" className="te-edit-panel" role="tabpanel" aria-labelledby="te-tab-edit">
        <form id="te-form" action={action} noValidate className="form-grid">
          <input type="hidden" name="key" value={entry.key} />
          <input type="hidden" name="version" value={version} />
          <div className={`field ${problems.length ? "has-error" : ""}`}>
            <label htmlFor="te-value">Text</label>
            {entry.multiline ? <textarea ref={boxRef} rows={legal ? 22 : entry.kind === "MARKDOWN" ? 9 : 5} {...boxProps} /> : <input ref={boxRef} type="text" {...boxProps} />}
            <span id="te-value-h" className="hint">
              {legal ? "Markdown text of the whole page. " : entry.kind === "MARKDOWN" ? "Paragraphs. A blank line starts a new paragraph. " : entry.kind === "INLINE" ? "One line. " : "Plain text. "}
              {value.length} / {entry.maxLength} characters.
            </span>
            {problems.length > 0 && (
              <ul id="te-value-e" className="err" style={{ color: "var(--color-danger)", fontWeight: 500 }}>
                {problems.map((p) => (
                  <li key={p.message}>{p.message}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p id="te-tokens-h" style={{ fontWeight: 700, margin: 0 }}>Insert a placeholder</p>
            {(
              [
                { id: "rules", title: "Rule numbers", list: tokens.filter((t) => Object.hasOwn(RULE_TOKENS, t.name)) },
                { id: "company", title: "Company data (placeholders until the real data is added)", list: tokens.filter((t) => !Object.hasOwn(RULE_TOKENS, t.name)) },
              ] as const
            )
              .filter((g) => g.list.length > 0)
              .map((g) => (
                <div key={g.id} role="group" aria-labelledby={`te-tokens-${g.id}`} style={{ marginTop: 6 }}>
                  <p id={`te-tokens-${g.id}`} className="hint" style={{ margin: "0 0 4px", fontWeight: 600 }}>{g.title}</p>
                  <ul className="te-tokens">
                    {g.list.map((t) => (
                      <li key={t.name}>
                        <button type="button" className="te-token" onClick={() => insertToken(t.name)} title={`Now: ${t.value}`}>
                          Insert {`{{${t.name}}}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            <p className="hint">The site fills the placeholder with the real value (rule numbers come from the booking rules). Never type a rule number or the company data by hand.</p>
          </div>

          <div className="field">
            <label htmlFor="te-note">Change note (optional)</label>
            <input id="te-note" name="note" type="text" className="input" maxLength={200} autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why did you change it?" />
          </div>

          <details className="te-help">
            <summary>How to format</summary>
            {legal ? (
              <ul>
                <li><code>## 3. Title</code> makes a heading. <code>- text</code> makes a list item. A blank line starts a new paragraph.</li>
                <li><code>**bold**</code> and <code>*italic*</code> work. <code>[label](/contact)</code> makes a link (a site path or https://).</li>
                <li>HTML is not used. It would show as plain characters.</li>
                <li>The line <code>Last updated: ...</code> is set to the publish date by the site when you publish.</li>
              </ul>
            ) : MARKS(entry.kind) ? (
              <ul>
                <li><code>*italic*</code> makes the words italic.</li>
                <li><code>[label](/contact)</code> makes a link. Use a site path or an https:// address.</li>
                {entry.kind === "MARKDOWN" && <li>A blank line starts a new paragraph.</li>}
                <li>Bold, lists and HTML are not used on this site. They would show as plain characters.</li>
              </ul>
            ) : (
              <p>This text is plain. No formatting marks are used.</p>
            )}
          </details>
        </form>
        </div>

        <section id="te-preview" className="te-preview te-preview-panel" role="tabpanel" aria-labelledby="te-tab-preview" aria-live="off">
          <h2>Preview (as on the site)</h2>
          <div className="te-preview-body">
            <Preview kind={entry.kind} text={preview} legal={!!legal} />
          </div>
          {lastSaved && <p className="hint">Last saved {lastSaved}.</p>}
        </section>
      </div>

      <div className="te-bar">
        <button type="submit" form="te-form" className="btn btn-primary" disabled={pending || !dirty} aria-disabled={pending || !dirty}>
          {pending ? "Saving..." : legal ? "Save draft" : "Save"}
        </button>
        <span className="hint grow" role="status">
          {pending ? "" : dirty ? "Unsaved changes" : "No changes"}
        </span>
        {legal && (canPreviewChanges ? (
          <Link className="btn btn-primary" href={`/admin/legal/${legal.slug}/publish`} prefetch={false}>
            Preview changes
          </Link>
        ) : (
          <button type="button" className="btn btn-primary" disabled aria-disabled="true" title="Save the draft first">
            Preview changes
          </button>
        ))}
        <Link className="btn btn-outline" href={legal ? `/admin/legal/${legal.slug}/versions` : `/admin/texts/${entry.key}/history`} prefetch={false}>
          {legal ? "Versions" : "History"}
        </Link>
        {legal && (
          <ConfirmDialog triggerLabel="Restore lawyer-approved version" title="Restore the lawyer-approved version?" message="The text the lawyer approved becomes public again. It is saved as a new version; nothing is removed. Unsaved changes in the box are lost." confirmLabel="Restore" action={restoreLawyerApprovedAction.bind(null, legal.slug)} />
        )}
        {!legal && (edited || saved !== null) && (
          <ConfirmDialog triggerLabel="Back to default" title="Go back to the default text?" message="The site will show the original text again. Your edit stays in the history, so you can restore it. Unsaved changes in the box are lost." confirmLabel="Back to default" action={backToDefaultAction.bind(null, entry.key)} />
        )}
      </div>
    </div>
  );
}
