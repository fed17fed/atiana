/**
 * The visitor IP for abuse limits. Never trust the FIRST x-forwarded-for entry: the visitor can write it.
 *  - On Vercel (VERCEL is set) Vercel overwrites x-vercel-forwarded-for / x-real-ip / x-forwarded-for with the real
 *    client IP, so we use x-vercel-forwarded-for first, then x-real-ip.
 *  - Elsewhere we use the RIGHT-MOST x-forwarded-for entry: that is the one added by our own proxy, not by the visitor.
 * Returns null when nothing usable is found (then only the email limit applies).
 */
export type HeaderGetter = { get(name: string): string | null };

function lastToken(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  const t = parts[parts.length - 1];
  // Only characters that can be in an IPv4 / IPv6 address.
  return t && t.length <= 45 && /^[0-9a-fA-F:.]+$/.test(t) ? t : null;
}

export function clientIp(h: HeaderGetter, env: Record<string, string | undefined> = process.env): string | null {
  if (env.VERCEL) {
    return lastToken(h.get("x-vercel-forwarded-for")) ?? lastToken(h.get("x-real-ip")) ?? lastToken(h.get("x-forwarded-for"));
  }
  return lastToken(h.get("x-forwarded-for")) ?? lastToken(h.get("x-real-ip"));
}
