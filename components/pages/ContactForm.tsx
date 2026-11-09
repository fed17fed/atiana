"use client";

import Script from "next/script";
import Link from "next/link";
import { useActionState } from "react";
import { sendContactMessage } from "@/app/contact/actions";
import type { ContactState } from "@/lib/contact-service";
import { Icon } from "@/components/ui/Icon";

const initial: ContactState = { status: "idle" };

/** Contact form. Works without JavaScript too (server action). `turnstileSiteKey` is empty when Turnstile is off. */
export function ContactForm({ turnstileSiteKey }: { turnstileSiteKey?: string }) {
  const [state, formAction, pending] = useActionState(sendContactMessage, initial);

  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const values =
    state.status === "error" || state.status === "demo-unavailable" ? state.values : undefined;

  if (state.status === "success") {
    return (
      <div className="alert a-success" role="status">
        <Icon name="check" />
        <div>
          <b>Message sent</b>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate aria-describedby="contact-consent" className="grid gap-4.5">
      {state.status === "demo-unavailable" && (
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

      <div className={`field ${errors.name ? "has-error" : ""}`}>
        <label htmlFor="c-name">
          Name <span className="req" aria-hidden="true">*</span>
        </label>
        <input
          id="c-name"
          name="name"
          className="input"
          type="text"
          autoComplete="name"
          required
          maxLength={100}
          defaultValue={values?.name}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? "c-name-err" : undefined}
        />
        {errors.name && (
          <p id="c-name-err" className="err">
            {errors.name}
          </p>
        )}
      </div>

      <div className={`field ${errors.email ? "has-error" : ""}`}>
        <label htmlFor="c-email">
          Email <span className="req" aria-hidden="true">*</span>
        </label>
        <input
          id="c-email"
          name="email"
          className="input"
          type="email"
          autoComplete="email"
          required
          maxLength={200}
          defaultValue={values?.email}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "c-email-err" : undefined}
        />
        {errors.email && (
          <p id="c-email-err" className="err">
            {errors.email}
          </p>
        )}
      </div>

      <div className={`field ${errors.message ? "has-error" : ""}`}>
        <label htmlFor="c-message">
          Message <span className="req" aria-hidden="true">*</span>
        </label>
        <textarea
          id="c-message"
          name="message"
          className="textarea"
          required
          maxLength={5000}
          defaultValue={values?.message}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? "c-message-err" : undefined}
        />
        {errors.message && (
          <p id="c-message-err" className="err">
            {errors.message}
          </p>
        )}
      </div>

      {/* Honeypot: hidden from people and screen readers; bots fill it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="c-website">Website (leave empty)</label>
        <input id="c-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {turnstileSiteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        </>
      )}

      <p id="contact-consent" className="hint">
        We use your details only to answer you. See our{" "}
        <Link href="/legal/privacy">Privacy policy</Link>.
      </p>

      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send message"}
        </button>
      </div>
    </form>
  );
}
