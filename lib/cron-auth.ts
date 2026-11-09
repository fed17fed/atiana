import { timingSafeEqual } from "node:crypto";

export type CronAuth = "ok" | "not-configured" | "denied";

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". No secret set = the route stays closed. */
export function checkCronAuth(authorization: string | null, env: Record<string, string | undefined> = process.env): CronAuth {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return "not-configured";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization ?? "");
  if (given.length !== expected.length) return "denied";
  return timingSafeEqual(given, expected) ? "ok" : "denied";
}
