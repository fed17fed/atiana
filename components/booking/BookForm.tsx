"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { startBooking, type BookState } from "@/app/book/actions";
import { Icon } from "@/components/ui/Icon";
import { CANCELLATION_HOURS } from "@/lib/booking-rules";

const initial: BookState = { status: "idle" };

type Props = {
  sessionId: string;
  kind: "class" | "one";
  priceLabel: string;
  loggedIn: boolean;
  /** Credits the user can use for this booking (0 when logged out). */
  credits: number;
  paymentsOn: boolean;
  loginHref: string;
};

/** Pay-method choice + health disclaimer checkbox. Works without JavaScript (server action). */
export function BookForm({ sessionId, kind, priceLabel, loggedIn, credits, paymentsOn, loginHref }: Props) {
  const [state, action, pending] = useActionState(startBooking, initial);
  // Controlled, because React clears plain form fields after a server action (even after an error).
  const [agreed, setAgreed] = useState(false);
  const [pay, setPay] = useState<"card" | "credit">(credits > 0 ? "credit" : "card");
  const disclaimerError = state.status === "error" && state.field === "disclaimer" ? state.message : null;
  const kindWord = kind === "one" ? "session" : "class";

  return (
    <form action={action} noValidate className="stack">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="kind" value={kind} />

      {state.status === "demo-off" && (
        <div className="alert a-warn" role="alert">
          <Icon name="info" />
          <div>
            <b>Demo mode</b>
            <p>{state.message}</p>
          </div>
        </div>
      )}
      {state.status === "error" && !disclaimerError && (
        <div className="alert a-error" role="alert">
          <Icon name="error" />
          <div>
            <p>{state.message}</p>
          </div>
        </div>
      )}
      {!paymentsOn && state.status === "idle" && (
        <div className="alert a-info" role="status">
          <Icon name="info" />
          <div>
            <p>Demo: card payments are not active yet. You can still look around. Booking with a credit works.</p>
          </div>
        </div>
      )}

      <fieldset className="stack" style={{ gap: 10, border: 0, padding: 0, margin: 0 }}>
        <legend className="legend" style={{ marginBottom: 8 }}>
          How do you want to pay?
        </legend>
        <label className="optcard">
          <span className="check radio">
            <input type="radio" name="pay" value="card" checked={pay === "card"} onChange={() => setPay("card")} />
            <span className="box" />
            <span className="txt">
              <b>Pay by card</b>
              <small>Card payments go to Stripe (test mode in the demo).</small>
            </span>
          </span>
          <span className="opt-price">{priceLabel}</span>
        </label>
        <label className="optcard">
          <span className="check radio">
            <input
              type="radio"
              name="pay"
              value="credit"
              disabled={credits <= 0}
              checked={pay === "credit"}
              onChange={() => setPay("credit")}
            />
            <span className="box" />
            <span className="txt">
              <b>Use 1 credit</b>
              <small>
                {!loggedIn
                  ? "Log in to use your credits."
                  : credits > 0
                    ? `You have ${credits} credit${credits === 1 ? "" : "s"}.`
                    : "You have no credits for this booking."}
              </small>
            </span>
          </span>
          <span className="opt-price">€0</span>
        </label>
      </fieldset>

      <div>
        <label className={`check ${disclaimerError ? "has-error" : ""}`}>
          <input
            type="checkbox"
            name="disclaimer"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            aria-invalid={disclaimerError ? true : undefined}
            aria-describedby={disclaimerError ? "disc-err" : undefined}
            required
          />
          <span className="box">
            <Icon name="check" className="size-4!" />
          </span>
          <span className="txt">
            I have read the <Link href="/legal/health-disclaimer">Health Disclaimer</Link> and I am well enough to join.
          </span>
        </label>
        {disclaimerError && (
          <p className="check-err" id="disc-err" role="alert">
            {disclaimerError}
          </p>
        )}
      </div>

      <p className="hint" style={{ margin: 0 }}>
        You can cancel up to {CANCELLATION_HOURS} hours before the {kindWord} starts.
        {!loggedIn && " You log in with an email link before you pay."}
      </p>

      <div className="actions-bar">
        <div className="total">
          <span>{pay === "credit" ? "1 credit" : priceLabel}</span>
        </div>
        {loggedIn ? (
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Please wait..." : pay === "credit" ? "Book with 1 credit" : "Continue to payment"}
          </button>
        ) : (
          <Link className="btn btn-primary" href={loginHref}>
            Log in to continue
          </Link>
        )}
      </div>
    </form>
  );
}
