/** Site-wide constants and environment switches (no secrets here). */

import { events } from "@/content/events";

export const SITE_NAME = "KEA by Atiana";
export const SITE_DESCRIPTION =
  "Live classes, 1:1 sessions and events for breath, energy and stillness.";

/**
 * Public base URL. Order: NEXT_PUBLIC_SITE_URL, then the Vercel production domain, then localhost.
 * Used for canonical links, sitemap, Open Graph and JSON-LD.
 */
export function getSiteUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

/**
 * Search engines are blocked by default (demo site).
 * Set ALLOW_INDEXING=true only when the real site goes live.
 */
export function isIndexingAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ALLOW_INDEXING?.trim().toLowerCase() === "true";
}

/** Pages that go into sitemap.xml (only pages that exist now; later phases add theirs). */
export const sitemapPaths = [
  "/",
  "/about",
  "/classes",
  "/schedule",
  "/one-to-one",
  "/events",
  ...events.map((e) => `/events/${e.slug}`),
  "/donate",
  "/contact",
  "/faq",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/terms",
  "/legal/booking-cancellation",
  "/legal/health-disclaimer",
] as const;
