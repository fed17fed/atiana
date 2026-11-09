"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { registerEvent, type EventState } from "@/app/events/actions";
import { Icon } from "@/components/ui/Icon";
import { parseEuroToCents } from "@/lib/booking-rules";
import type { EventPricing } from "@/lib/generated/prisma/enums";

const initial: EventState = { status: "idle" };
const PRESETS = [5, 10, 20];

type Props = { sessionId: string; pricing: EventPricing; priceLabel: string; paymentsOn: boolean };

/** Consent box + (donation) amount + button. The server checks everything again. Works without JavaScript. */
export function EventRegisterForm({ sessionId, pricing, priceLabel, paymentsOn }: Props) {
  const [state, action, pending] = useActionState(registerEvent, initial);
  // Controlled, because React clears plain form fields after a server action (even after an error).
  const [agreed, setAgreed] = useState(false);
  const [amount, setAmount] = useState("");
  const cents = parseEuroToCents(amount);
  const consentError = state.status === "error" && state.field === "disclaimer" ? state.message : null;
  const amountError = state.status === "error" && state.field === "amount" ? state.message : null;

  const label =
    pending
      ? "Please wait..."
      : pricing === "FREE"
        ? "Register (free)"
        : pricing === "PAID"
          ? `Buy a ticket – ${priceLabel}`
          : cents === 0
            ? "Register (donation €0)"
            : cents !== null
              ? "Continue to donation"
              : "Register";

  return (
    <form action={action} noValidate className="grid gap-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      {state.status === "demo-off" && (
        <div className="alert a-warn" role="alert">
          <Icon name="info" />
          <div>
            <b>Demo mode</b>
            <p>{state.message}</p>
          </div>
        </div>
      )}
      {state.status === "error" && !consentError && !amountError && (
        <div className="alert a-error" role="alert">
          <Icon name="error" />
          <div>
            <p>{state.message}</p>
          </div>
        </div>
      )}

      {pricing === "DONATION" && (
        <div className={`field ${amountError ? "has-error" : ""}`}>
          <label htmlFor="ev-amount">Your amount (€)</label>
          <div className="amount-row" role="group" aria-label="Suggested amounts">
            {PRESETS.map((p) => (
              <button key={p} type="button" aria-pressed={cents === p * 100} onClick={() => setAmount(String(p))}>
                €{p}
              </button>
            ))}
            <button type="button" aria-pressed={cents !== null && !PRESETS.includes(cents / 100)} onClick={() => document.getElementById("ev-amount")?.focus()}>
              Other
            </button>
          </div>
          <input
            id="ev-amount"
            name="amount"
            className="input"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? "ev-amount-err ev-amount-help" : "ev-amount-help"}
          />
          <span className="hint" id="ev-amount-help">
            You can choose €0. €0 means free registration, no payment.
          </span>
          {amountError && (
            <p className="err" id="ev-amount-err" role="alert">
              {amountError}
            </p>
          )}
        </div>
      )}

      <div>
        <label className={`check ${consentError ? "has-error" : ""}`}>
          <input
            type="checkbox"
            name="disclaimer"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            aria-invalid={consentError ? true : undefined}
            aria-describedby={consentError ? "ev-consent-err" : undefined}
          />
          <span className="box">
            <Icon name="check" className="size-4!" />
          </span>
          <span className="txt">
            I have read the <Link href="/legal/health-disclaimer">Health notice</Link>. I understand that this event is not medical care and I take part at my own risk.
          </span>
        </label>
        {consentError && (
          <p className="check-err" id="ev-consent-err" role="alert">
            {consentError}
          </p>
        )}
      </div>

      {pricing !== "FREE" && (
        <p className="hint" style={{ margin: 0 }}>
          {pricing === "DONATION" && (cents === null || cents === 0)
            ? "€0 is fine. You will be registered for free, with no payment."
            : "You pay securely by card on Stripe. Demo site: Stripe test mode. No real money is taken."}
        </p>
      )}
      {!paymentsOn && pricing !== "FREE" && (pricing === "PAID" || (cents !== null && cents > 0)) && (
        <p className="hint" style={{ margin: 0 }}>
          Demo: card payments are not active yet.
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {label}
      </button>
    </form>
  );
}
