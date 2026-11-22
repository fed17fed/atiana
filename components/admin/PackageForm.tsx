"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { savePackage, type PackageState } from "@/app/admin/packages/actions";
import { ErrorSummary, type FormProblem } from "@/components/admin/ErrorSummary";
import { StatusMessage } from "@/components/admin/states";
import { Icon } from "@/components/ui/Icon";

export type PackageFormValues = { id: string; version: string; name: string; price: string; active: boolean };

const initialState: PackageState = { status: "idle" };
const FIELD_IDS: Record<string, string> = { name: "p-name", price: "p-price", active: "p-active" };

/** Wireframe A10 (packages part). Controlled fields: React would clear plain fields after a server action, even after an error. */
export function PackageForm({ initialValues, packsShown }: { initialValues: PackageFormValues; packsShown: boolean }) {
  const [state, action, pending] = useActionState(savePackage, initialState);
  const [v, setV] = useState(initialValues);
  const [edited, setEdited] = useState<{ state: PackageState } | null>(null);
  const dirty = edited !== null && !(state.status === "ok" && edited.state !== state);
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);
  const set = <K extends keyof PackageFormValues>(k: K, value: PackageFormValues[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    setEdited({ state });
  };
  const errs = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const err = (k: string) => errs[k]?.[0];
  const problems: FormProblem[] = Object.entries(errs).map(([k, list]) => ({ fieldId: FIELD_IDS[k] ?? "p-name", message: list[0] }));
  const formError = state.status === "error" && problems.length === 0 ? state.message : null;

  return (
    <form action={action} noValidate className="form-grid" style={{ maxWidth: 560 }}>
      {state.status === "ok" && <StatusMessage>{state.message}{packsShown ? "" : " Packages are still hidden on the site."}</StatusMessage>}
      <ErrorSummary problems={problems} title={problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"}` : undefined} />
      {formError && (
        <div className="alert a-error" role="alert">
          <Icon name="error" />
          <div><p>{formError}</p></div>
        </div>
      )}
      <input type="hidden" name="id" value={initialValues.id} />
      <input type="hidden" name="version" value={state.status === "ok" && state.version ? state.version : initialValues.version} />
      <div className={`field ${err("name") ? "has-error" : ""}`}>
        <label htmlFor="p-name">Name <span className="req">(required)</span></label>
        <input id="p-name" name="name" className="input" maxLength={80} autoComplete="off" aria-invalid={!!err("name")} value={v.name} onChange={(e) => set("name", e.target.value)} />
        {err("name") && <p className="err">{err("name")}</p>}
      </div>
      <div className={`field ${err("price") ? "has-error" : ""}`}>
        <label htmlFor="p-price">Price in euro <span className="req">(required)</span></label>
        <input id="p-price" name="price" inputMode="decimal" className="input" aria-describedby="p-price-h" aria-invalid={!!err("price")} value={v.price} onChange={(e) => set("price", e.target.value)} />
        <span id="p-price-h" className="hint">For example 60 or 105.50. Existing orders keep the price they were bought at.</span>
        {err("price") && <p className="err">{err("price")}</p>}
      </div>
      <label className="check">
        <input id="p-active" type="checkbox" name="active" checked={v.active} onChange={(e) => set("active", e.target.checked)} />
        <span className="box" aria-hidden="true"><Icon name="check" className="size-4!" /></span>
        <span className="txt">Active <span className="hint">(can be bought, when packages are shown on the site)</span></span>
      </label>
      <div className="adm-quick">
        <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? "Saving..." : "Save"}</button>
        <Link className="btn btn-outline" href="/admin/packages" prefetch={false}>Back to the list</Link>
      </div>
    </form>
  );
}
