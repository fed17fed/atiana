"use client";

import { useActionState } from "react";
import { buyPack, type PackState } from "@/app/book/actions";
import { Icon } from "@/components/ui/Icon";

const initial: PackState = { status: "idle" };

export function PackBuyForm({ packageId, name, disabled }: { packageId: string | null; name: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState(buyPack, initial);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="packageId" value={packageId ?? ""} />
      {state.status !== "idle" && (
        <div className={`alert ${state.status === "error" ? "a-error" : "a-warn"}`} role="alert">
          <Icon name={state.status === "error" ? "error" : "info"} />
          <div>
            <p>{state.message}</p>
          </div>
        </div>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending || disabled || !packageId}>
        {pending ? "Please wait..." : `Buy ${name}`}
      </button>
    </form>
  );
}
