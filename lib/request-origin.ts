import { headers } from "next/headers";
import { getSiteUrl } from "./site";

/** Base URL of the current request (so Stripe returns the visitor to the same site, e.g. a preview). */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return getSiteUrl();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto === "http" ? "http" : "https"}://${host}`;
}
