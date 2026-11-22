"use client";

import { useId, useRef } from "react";

/**
 * Wireframe A14. Native <dialog>: the browser traps focus, Escape closes it and focus returns to the button.
 * The safe button (Cancel) has the first focus. Use words like Hide / Archive / Restore. No remove-style wording (owner rule: nothing is removed).
 */
export function ConfirmDialog({
  triggerLabel,
  title,
  message,
  confirmLabel,
  action,
}: {
  triggerLabel: string;
  title: string;
  message: string;
  confirmLabel: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <button type="button" className="btn btn-outline" onClick={() => ref.current?.showModal()}>
        {triggerLabel}
      </button>
      <dialog ref={ref} className="adm-dialog" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
        <form action={action} onSubmit={() => ref.current?.close()}>
          <h2 id={`${id}-t`}>{title}</h2>
          <p id={`${id}-d`}>{message}</p>
          <div className="adm-dialog-actions">
            <button type="button" className="btn btn-outline" autoFocus onClick={() => ref.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
