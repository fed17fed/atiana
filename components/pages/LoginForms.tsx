"use client";

import { useActionState } from "react";
import { Icon } from "@/components/ui/Icon";
import { devLogin, requestLoginLink, type LoginState } from "@/app/login/actions";

const initial: LoginState = { status: "idle" };

function Message({ state }: { state: LoginState }) {
  if (state.status === "idle") return null;
  return (
    <div className={`alert ${state.status === "error" ? "a-error" : "a-warn"}`} role="alert">
      <Icon name={state.status === "error" ? "error" : "info"} />
      <div>
        {state.status === "demo-off" && <b>Demo mode</b>}
        <p>{state.message}</p>
      </div>
    </div>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(requestLoginLink, initial);
  return (
    <form action={action} noValidate className="grid gap-4.5">
      <Message state={state} />
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="login-email">
          Email <span className="req" aria-hidden="true">*</span>
        </label>
        <input id="login-email" name="email" type="email" className="input" autoComplete="email" required maxLength={200} aria-describedby="login-hint" />
        <span className="hint" id="login-hint">We send you a sign-in link. No password.</span>
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Sending..." : "Email me a sign-in link"}
      </button>
    </form>
  );
}

/** Shown only on a local machine when dev login is switched on (see lib/auth-config.ts). */
export function DevLoginForm({ next, emails }: { next: string; emails: string[] }) {
  const [state, action, pending] = useActionState(devLogin, initial);
  return (
    <form action={action} className="grid gap-3.5" aria-labelledby="dev-login-h">
      <h2 id="dev-login-h" className="!text-xl">Dev login (local testing only)</h2>
      <p className="hint">This block exists only on a local machine with ALLOW_DEV_LOGIN=true. It is impossible on Vercel.</p>
      <Message state={state} />
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="dev-email">Test user</label>
        <select id="dev-email" name="email" className="input">
          {emails.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
      </div>
      <button className="btn btn-outline" type="submit" disabled={pending}>
        {pending ? "Logging in..." : "Log in as test user"}
      </button>
    </form>
  );
}
