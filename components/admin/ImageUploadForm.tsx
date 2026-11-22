"use client";

import Image from "next/image";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { uploadImageAction, type UploadState } from "@/app/admin/images/actions";
import { ErrorSummary, type FormProblem } from "@/components/admin/ErrorSummary";
import { Icon } from "@/components/ui/Icon";
import { prepareForUpload } from "@/lib/images/client-prepare";
import { MAX_ALT_LENGTH, MAX_UPLOAD_MB_LABEL } from "@/lib/images/rules";

export type UploadedImage = { id: string; url: string; alt: string; width: number; height: number };
const initial: UploadState = { status: "idle" };

/** Wireframe A12, "Upload new". File input (jpg, png, webp, max 5 MB), required alt text, preview, "Upload and use". */
export function ImageUploadForm({ idPrefix = "up", onUploaded, active }: { idPrefix?: string; onUploaded?: (image: UploadedImage) => void; active: boolean }) {
  const [state, dispatch, pending] = useActionState(uploadImageAction, initial);
  const [alt, setAlt] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const handled = useRef<UploadState | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Tell the parent once per successful upload.
  useEffect(() => {
    if (state.status === "ok" && handled.current !== state) {
      handled.current = state;
      onUploaded?.(state.image);
    }
  }, [state, onUploaded]);

  // A new browser-side problem hides the older server answer (it would be stale).
  const errs = state.status === "error" && !clientError ? (state.fieldErrors ?? {}) : {};
  const fileErr = clientError ?? errs.file?.[0];
  const altErr = errs.alt?.[0];
  const problems: FormProblem[] = [];
  if (fileErr) problems.push({ fieldId: `${idPrefix}-file`, message: fileErr });
  if (altErr) problems.push({ fieldId: `${idPrefix}-alt`, message: altErr });
  const topError = state.status === "error" && !clientError && problems.length === 0 ? state.message : null;

  async function submit(fd: FormData) {
    setClientError(null);
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) {
      if (alt.trim() === "") startTransition(() => dispatch(fd)); // the server lists both problems (file and alt) together
      else setClientError("Choose a file.");
      return;
    }
    const prepared = await prepareForUpload(f);
    if (!prepared.ok) {
      setClientError(prepared.message);
      return;
    }
    fd.set("file", prepared.file);
    startTransition(() => dispatch(fd)); // after an await the form transition is gone, so start a new one

  }

  // No `action` prop on purpose: React would empty the file field after every answer (even an error), and the person would have to pick the file again.
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(new FormData(e.currentTarget));
      }}
      noValidate className="form-grid" style={{ maxWidth: 560 }} hidden={!active}>
      {state.status === "ok" && !clientError && (
        <div className="alert a-success" role="status">
          <Icon name="check" />
          <div><p>{state.message}</p></div>
        </div>
      )}
      <ErrorSummary problems={problems} />
      {topError && (
        <div className="alert a-warn" role="alert">
          <Icon name="info" />
          <div><p>{topError}</p></div>
        </div>
      )}
      {pending && <p role="status" className="hint">Uploading…</p>}
      <div className={`field ${fileErr ? "has-error" : ""}`}>
        <label htmlFor={`${idPrefix}-file`}>Picture file <span className="req">(required)</span></label>
        <input
          ref={fileRef}
          id={`${idPrefix}-file`}
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="input"
          aria-describedby={`${idPrefix}-file-h`}
          aria-invalid={!!fileErr}
          onChange={(e) => {
            setClientError(null);
            const f = e.target.files?.[0];
            setPreview(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
          }}
        />
        <span id={`${idPrefix}-file-h`} className="hint">jpg, png or webp. Max {MAX_UPLOAD_MB_LABEL}. It is saved as WebP.</span>
        {fileErr && <p className="err">{fileErr}</p>}
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- local blob: preview of the chosen file
        <img src={preview} alt="" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 12, border: "1px solid var(--color-line)" }} />
      )}
      <div className={`field ${altErr ? "has-error" : ""}`}>
        <label htmlFor={`${idPrefix}-alt`}>Alt text <span className="req">(required)</span></label>
        <input id={`${idPrefix}-alt`} name="alt" className="input" maxLength={MAX_ALT_LENGTH} autoComplete="off" aria-describedby={`${idPrefix}-alt-h`} aria-invalid={!!altErr} value={alt} onChange={(e) => setAlt(e.target.value)} />
        <span id={`${idPrefix}-alt-h`} className="hint">Describe the photo for people who cannot see it. Example: &quot;Atiana teaching a class on Zoom&quot;.</span>
        {altErr && <p className="err">{altErr}</p>}
      </div>
      <div className="adm-quick">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {onUploaded ? "Upload and use" : "Upload"}
        </button>
      </div>
    </form>
  );
}

export function Thumb({ image }: { image: { url: string; alt: string } }) {
  // Already WebP: no need for the image optimizer. `unoptimized` also lets any Blob address through.
  return <Image src={image.url} alt={image.alt} width={200} height={200} unoptimized />;
}
