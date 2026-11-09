/**
 * Switches for login. Pure functions (testable). Nothing here needs a database.
 *  - Magic link login is ON only when AUTH_SECRET, an email key (AUTH_RESEND_KEY or RESEND_API_KEY)
 *    and EMAIL_FROM are all set.
 *  - Dev-only login (for local testing of logged-in pages) is ON only when ALL of these are true:
 *      NODE_ENV is not "production", ALLOW_DEV_LOGIN is "true", and VERCEL is not set.
 *    Vercel always runs with NODE_ENV=production and VERCEL=1, so it can never be on there.
 */
import type { EnvLike } from "./mail";

export const LOGIN_OFF_MESSAGE =
  "Demo: login is not active yet. Email login will be switched on when the email keys are added.";

export function magicLinkConfig(env: EnvLike = process.env) {
  const secret = env.AUTH_SECRET?.trim();
  const apiKey = (env.AUTH_RESEND_KEY ?? env.RESEND_API_KEY)?.trim();
  const from = env.EMAIL_FROM?.trim();
  return secret && apiKey && from ? { secret, apiKey, from } : null;
}

export function devLoginAllowed(env: EnvLike = process.env): boolean {
  return env.NODE_ENV !== "production" && env.ALLOW_DEV_LOGIN === "true" && !env.VERCEL && !env.VERCEL_ENV;
}

/** Dev login works only for the invented test accounts of the seed. */
export const DEV_LOGIN_DOMAIN = "@atiana.test";

export function isDevLoginEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(DEV_LOGIN_DOMAIN);
}

/** Only same-site paths are allowed as "go back to" targets (blocks open redirects). */
export function safeNextPath(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  if (value.startsWith("/api/")) return fallback;
  return value;
}
