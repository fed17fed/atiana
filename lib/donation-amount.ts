/** Donation amount rules. Pure code (no server imports), so the form and the server use the same function. */
import { MAX_DONATION_CENTS, MIN_DONATION_CENTS } from "./booking-rules";

export const DONATION_MESSAGES = {
  tooSmall: "Please enter an amount of €1 or more.",
  // NEW text (not in demo-content.md): needs the owner's OK.
  tooBig: "The maximum is €1,000. For a larger gift, please contact us.",
  // NEW text
  notNumber: "Please enter an amount in euros, for example 25 or 12.50.",
  fieldsInvalid: "Please check the fields marked below.",
  // NEW text
  tooMany: "Too many tries. Please wait a little and try again.",
  generic: "Sorry, we could not start your donation. Please try again.",
  spam: "We could not check that you are a person. Please reload the page and try again.",
} as const;

export type DonationAmountResult =
  | { ok: true; cents: number }
  | { ok: false; code: "TOO_SMALL" | "TOO_BIG" | "NOT_A_NUMBER"; message: string };

const fail = (code: "TOO_SMALL" | "TOO_BIG" | "NOT_A_NUMBER"): DonationAmountResult => ({
  ok: false,
  code,
  message: code === "TOO_SMALL" ? DONATION_MESSAGES.tooSmall : code === "TOO_BIG" ? DONATION_MESSAGES.tooBig : DONATION_MESSAGES.notNumber,
});

/**
 * Euros typed by the visitor ("25", "12.5", "12,50", "€10") -> whole cents.
 * Integer maths only (no float rounding). More than 2 decimals, text, NaN or exponents are refused.
 */
export function parseDonationAmount(input: unknown): DonationAmountResult {
  if (typeof input !== "string") return fail("TOO_SMALL");
  const t = input.trim().replace(/^€\s*/, "").replace(",", ".");
  if (t === "") return fail("TOO_SMALL");
  if (/^-\s*\d/.test(t)) return fail("TOO_SMALL");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return fail("NOT_A_NUMBER");
  if (m[1].replace(/^0+/, "").length > 7) return fail("TOO_BIG"); // avoids unsafe numbers
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  if (cents < MIN_DONATION_CENTS) return fail("TOO_SMALL");
  if (cents > MAX_DONATION_CENTS) return fail("TOO_BIG");
  return { ok: true, cents };
}

export type DonationFieldErrors = Partial<Record<"amount" | "email", string>>;

export type DonationState =
  | { status: "idle" }
  | { status: "error"; message: string; fieldErrors?: DonationFieldErrors }
  | { status: "demo-off"; message: string };
