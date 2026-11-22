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

/**
 * Where EVERY login request ends when it has been handled: the address Auth.js itself uses after a mail was handed over
 * (it then shows the "check your email" screen). Allowed, refused and mail-failed requests all get exactly this redirect (N18-2).
 */
export const LOGIN_SENT_PATH = "/api/auth/verify-request?provider=resend&type=email";

/**
 * Admin-only login (owner answer Q3a). While ON, only emails in ADMIN_EMAILS (comma-separated, any case, spaces allowed)
 * can get a login link or sign in. Everybody else gets the same neutral "check your email" screen and NO email is sent.
 *  - LOGIN_ADMIN_ONLY "true"/"1"/"on" = ON, "false"/"0"/"off" = OFF (case and spaces ignored).
 *  - Unset: ON in production (safest: a live site opens to the public only when the owner says so), OFF in development/test.
 *  - Any other value counts as ON (a typo must not open the door).
 *  - ON with an empty ADMIN_EMAILS: nobody can log in by email.
 * Dev login (@atiana.test, local only) is a separate switch and is not affected.
 */
export function loginAdminOnly(env: EnvLike = process.env): boolean {
  const v = env.LOGIN_ADMIN_ONLY?.trim().toLowerCase();
  if (v === undefined || v === "") return env.NODE_ENV === "production";
  return !["false", "0", "off", "no"].includes(v);
}

export function adminEmailList(env: EnvLike = process.env): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e !== "");
}

/** May this email get a login link / sign in? Pure: no database. */
export function isLoginAllowed(email: unknown, env: EnvLike = process.env): boolean {
  if (typeof email !== "string") return false;
  if (!loginAdminOnly(env)) return true;
  const e = email.trim().toLowerCase();
  return e !== "" && adminEmailList(env).includes(e);
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
