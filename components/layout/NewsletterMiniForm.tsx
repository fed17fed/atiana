"use client";

import { useState } from "react";

/** UI only (task 2.1). The real newsletter sign-up (double opt-in) comes in Phase 7. */
export function NewsletterMiniForm() {
  const [sent, setSent] = useState(false);

  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
    >
      <label className="sr-only" htmlFor="ftr-email">
        Your email
      </label>
      <input
        id="ftr-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="Your email"
        className="input min-w-0 flex-[1_1_180px] border-[#8F7C85] bg-[#3A2832] text-cream placeholder:text-[#D9C6CF]"
      />
      <button type="submit" className="btn btn-accent">
        Subscribe
      </button>
      <p role="status" className="basis-full text-sm text-[#D9C6CF]">
        {sent ? "Thank you. Newsletter sign-up is not active yet (demo)." : ""}
      </p>
    </form>
  );
}
