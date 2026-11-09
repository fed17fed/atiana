"use client";

import { useState } from "react";

/** UI only. The real double opt-in sign-up is built in Phase 7. */
export function HomeNewsletterBand() {
  const [sent, setSent] = useState(false);

  return (
    <div>
      <form
        className="nl-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSent(true);
        }}
      >
        <label className="sr-only" htmlFor="nl-email">
          Your email
        </label>
        <input
          id="nl-email"
          name="email"
          className="input"
          type="email"
          required
          placeholder="Your email"
          autoComplete="email"
        />
        <button className="btn btn-accent" type="submit">
          Subscribe
        </button>
      </form>
      <p className="hint">Double opt-in. Unsubscribe any time.</p>
      <p role="status" className="hint">
        {sent ? "Thank you. Newsletter sign-up is not active yet (demo)." : ""}
      </p>
    </div>
  );
}
