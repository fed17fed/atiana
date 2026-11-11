"use client";

import Script from "next/script";
import { useActionState, useState } from "react";
import { donate } from "@/app/donate/actions";
import { Icon } from "@/components/ui/Icon";
import { parseDonationAmount, type DonationState } from "@/lib/donation-amount";

const initial: DonationState = { status: "idle" };
const PRESETS = [10, 25, 50];

type Props = {
  /** Logged-in user's email (prefilled). */
  defaultEmail?: string;
  paymentsOn: boolean;
  emailsOn: boolean;
  turnstileSiteKey?: string;
};

/** Donation form. The server checks everything again. Works without JavaScript (the preset buttons need it). */
export function DonateForm({ defaultEmail = "", paymentsOn, emailsOn, turnstileSiteKey }: Props) {
  const [state, action, pending] = useActionState(donate, initial);
  // Controlled, because React clears plain form fields after a server action (even after an error).
  const [amount, setAmount] = useState("");
  const [email, setEmail] = useState(defaultEmail);

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const parsed = parseDonationAmount(amount);
  const cents = parsed.ok ? parsed.cents : null;

  return (
    <form action={action} noValidate className="grid gap-5">
      {state.status === "demo-off" && (
        <div className="alert a-warn" role="alert">
          <Icon name="info" />
          <div>
            <b>Demo mode</b>
            <p>{state.message}</p>
          </div>
        </div>
      )}
      {state.status === "error" && (
        <div className="alert a-error" role="alert">
          <Icon name="error" />
          <div>
            <p>{state.message}</p>
          </div>
        </div>
      )}

      <div className={`field ${errors.amount ? "has-error" : ""}`}>
        <label htmlFor="d-amount">
          Amount (€) <span className="req" aria-hidden="true">*</span>
        </label>
        <div className="amount-row" role="group" aria-label="Suggested amounts">
          {PRESETS.map((p) => (
            <button key={p} type="button" aria-pressed={cents === p * 100} onClick={() => setAmount(String(p))}>
              €{p}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={cents !== null && !PRESETS.includes(cents / 100)}
            onClick={() => document.getElementById("d-amount")?.focus()}
          >
            Other amount
          </button>
        </div>
        <input
          id="d-amount"
          name="amount"
          className="input"
          inputMode="decimal"
          autoComplete="off"
          required
          maxLength={12}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={errors.amount ? true : undefined}
          aria-describedby={errors.amount ? "d-amount-err d-amount-help" : "d-amount-help"}
        />
        <span className="hint" id="d-amount-help">
          Minimum €1.
        </span>
        {errors.amount && (
          <p className="err" id="d-amount-err" role="alert">
            {errors.amount}
          </p>
        )}
      </div>

      <div className={`field ${errors.email ? "has-error" : ""}`}>
        <label htmlFor="d-email">
          Email <span className="req" aria-hidden="true">*</span>
        </label>
        <input
          id="d-email"
          name="email"
          className="input"
          type="email"
          autoComplete="email"
          required
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "d-email-err" : undefined}
        />
        {errors.email && (
          <p className="err" id="d-email-err" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      {/* Honeypot: hidden from people and screen readers; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="d-website">Website (leave empty)</label>
        <input id="d-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {turnstileSiteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        </>
      )}

      <p className="hint" style={{ margin: 0 }}>
        One-time payment by card through Stripe. You will get an email receipt.
        {!emailsOn && " Demo: receipt emails are not active yet."}
        {!paymentsOn && " Demo: card payments are not active yet."}
      </p>

      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Please wait..." : "Donate now"}
        </button>
      </div>
    </form>
  );
}
