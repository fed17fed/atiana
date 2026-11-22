"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ImageUploadForm, Thumb, type UploadedImage } from "@/components/admin/ImageUploadForm";
import { tabKeyHandler } from "@/components/admin/tab-keys";

export type LibraryImage = { id: string; url: string; alt: string };

/**
 * Wireframe A12: "Choose image" button -> dialog with two tabs (Library / Upload new).
 * Puts two hidden fields in the host form: `<name>` (image address) and `<name>Alt` (alt text), and shows a "Use no image" button.
 * Native <dialog>: focus is trapped, Escape closes, focus returns to the button.
 * The dialog is rendered in <body> (a portal), not inside the host form: it holds its own upload <form>, and a form inside a form is invalid HTML (task 12.8).
 */
const noSubscribe = () => () => {};

export function ImagePicker({
  name,
  library,
  initial,
  uploadActive,
  onChange,
}: {
  name: string;
  library: LibraryImage[];
  initial?: LibraryImage | null;
  uploadActive: boolean;
  /** Optional: called when the choice changes (new image chosen, uploaded, or removed). Lets a form copy the alt text. */
  onChange?: (image: LibraryImage | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const router = useRouter();
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false); // false while the server renders: no portal target yet
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [chosen, setChosen] = useState<LibraryImage | null>(initial ?? null);
  const [pick, setPick] = useState<string>(initial?.id ?? "");
  const [images, setImages] = useState(library);

  function onUploaded(img: UploadedImage) {
    const item = { id: img.id, url: img.url, alt: img.alt };
    setImages((list) => (list.some((x) => x.id === item.id) ? list : [item, ...list]));
    setChosen(item);
    setPick(item.id);
    onChange?.(item);
    ref.current?.close();
    router.refresh(); // the library list on the page is loaded by the server
  }

  const tabKeys = tabKeyHandler([{ value: "library" as const, id: `${id}-tab-l` }, { value: "upload" as const, id: `${id}-tab-u` }], tab, setTab);

  return (
    <div className="grid gap-3">
      <input type="hidden" name={name} value={chosen?.url ?? ""} />
      <input type="hidden" name={`${name}Alt`} value={chosen?.alt ?? ""} />
      {chosen ? (
        <div className="grid gap-2" style={{ maxWidth: 220 }}>
          <div className="adm-thumb"><Thumb image={chosen} /></div>
          <span className="hint">Alt text: {chosen.alt}</span>
        </div>
      ) : (
        <p className="hint">No image chosen.</p>
      )}
      <div className="adm-actions">
        <button ref={triggerRef} type="button" className="btn btn-outline" onClick={() => ref.current?.showModal()}>
          Choose image
        </button>
        {chosen && (
          <button type="button" className="btn btn-outline" onClick={() => { setChosen(null); setPick(""); onChange?.(null); }}>
            Use no image
          </button>
        )}
      </div>
      {inBrowser && createPortal(
      <dialog ref={ref} className="adm-dialog adm-picker" aria-labelledby={`${id}-t`}>
        <h2 id={`${id}-t`}>Choose image</h2>
        <div role="tablist" aria-label="Image source" className="adm-tabs" onKeyDown={tabKeys}>
          <button type="button" role="tab" id={`${id}-tab-l`} aria-selected={tab === "library"} aria-controls={`${id}-panel-l`} tabIndex={tab === "library" ? 0 : -1} className="adm-tab" onClick={() => setTab("library")}>
            Library
          </button>
          <button type="button" role="tab" id={`${id}-tab-u`} aria-selected={tab === "upload"} aria-controls={`${id}-panel-u`} tabIndex={tab === "upload" ? 0 : -1} className="adm-tab" onClick={() => setTab("upload")}>
            Upload new
          </button>
        </div>
        <div role="tabpanel" id={`${id}-panel-l`} aria-labelledby={`${id}-tab-l`} hidden={tab !== "library"}>
          {images.length === 0 ? (
            <p className="hint">No images yet. Use the Upload tab.</p>
          ) : (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="sr-only">Images in the library</legend>
              <ul className="adm-thumbs">
                {images.map((img) => (
                  <li key={img.id}>
                    <label className="adm-thumb">
                      <Thumb image={img} />
                      <span>
                        <input type="radio" name={`${id}-pick`} value={img.id} checked={pick === img.id} onChange={() => setPick(img.id)} /> {img.alt}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
        </div>
        <div role="tabpanel" id={`${id}-panel-u`} aria-labelledby={`${id}-tab-u`} hidden={tab !== "upload"}>
          {uploadActive ? (
            <ImageUploadForm idPrefix={`${id.replaceAll(":", "")}-pk`} onUploaded={onUploaded} active={tab === "upload"} />
          ) : (
            <p className="hint">Image upload is not active yet.</p>
          )}
        </div>
        <div className="adm-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={() => ref.current?.close()}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!pick}
            onClick={() => {
              const found = images.find((x) => x.id === pick);
              if (found) {
                setChosen(found);
                onChange?.(found);
              }
              ref.current?.close();
            }}
          >
            Use selected image
          </button>
        </div>
      </dialog>,
      document.body,
      )}
    </div>
  );
}
