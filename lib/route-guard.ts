/**
 * First line of defence for /account and /admin (runs in proxy.ts, before the page).
 * It gives real HTTP answers (redirect to login, 403). The pages check again on the server,
 * so if this guard cannot decide (for example the database is down) it lets the page decide: pages fail closed.
 */
export type GuardResult = { action: "next" } | { action: "login" } | { action: "forbidden" };

export const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"] as const;

export type RoleLookup = (sessionToken: string) => Promise<"USER" | "ADMIN" | null>;

export async function guardRoute(
  pathname: string,
  sessionToken: string | undefined,
  lookupRole: RoleLookup,
): Promise<GuardResult> {
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAccount = pathname === "/account" || pathname.startsWith("/account/");
  if (!isAdmin && !isAccount) return { action: "next" };
  if (!sessionToken) return { action: "login" };
  if (!isAdmin) return { action: "next" }; // /account: the page checks the session itself

  try {
    const role = await lookupRole(sessionToken);
    if (role === null) return { action: "login" };
    return role === "ADMIN" ? { action: "next" } : { action: "forbidden" };
  } catch {
    return { action: "next" };
  }
}

/**
 * /book/class needs a real, bookable group class. Without one the answer must be a real HTTP 404
 * (the page itself streams, so it could only answer 200). `exists` returns null when the database
 * cannot answer: then the page decides.
 */
export type SessionLookup = (sessionId: string) => Promise<boolean>;

export async function guardBookClass(
  pathname: string,
  sessionParam: string | null,
  exists: SessionLookup,
): Promise<{ action: "next" } | { action: "not-found" }> {
  if (pathname !== "/book/class") return { action: "next" };
  const id = (sessionParam ?? "").trim();
  if (!id || id.length > 60) return { action: "not-found" };
  try {
    return (await exists(id)) ? { action: "next" } : { action: "not-found" };
  } catch {
    return { action: "next" };
  }
}

/** /events/<slug>: only known events exist. Anything else must be a real HTTP 404 (not a 200 page). */
export function guardEventSlug(pathname: string, knownSlugs: readonly string[]): { action: "next" } | { action: "not-found" } {
  const m = /^\/events\/([^/]+)\/?$/.exec(pathname);
  if (!m) return { action: "next" };
  let slug = m[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    return { action: "not-found" };
  }
  return knownSlugs.includes(slug) ? { action: "next" } : { action: "not-found" };
}

/**
 * Same as guardEventSlug, but the list of events comes from a lookup (the database, task 12.8), so an event made in the admin
 * is reachable. If the lookup throws (database down, tables missing), only the known code slugs exist, as before.
 */
export async function guardEventSlugLookup(
  pathname: string,
  exists: (slug: string) => Promise<boolean>,
  codeSlugs: readonly string[],
): Promise<{ action: "next" } | { action: "not-found" }> {
  const m = /^\/events\/([^/]+)\/?$/.exec(pathname);
  if (!m) return { action: "next" };
  let slug: string;
  try {
    slug = decodeURIComponent(m[1]);
  } catch {
    return { action: "not-found" };
  }
  try {
    return (await exists(slug)) ? { action: "next" } : { action: "not-found" };
  } catch {
    return guardEventSlug(pathname, codeSlugs);
  }
}

/**
 * A12-8: admin pages for ONE record (/admin/offerings/<id>, /admin/sessions/<id>, /admin/packages/<id>, /admin/testimonials/<id>,
 * /admin/texts/<key>, /admin/legal/<slug>). The page streams, so its own notFound() could only answer HTTP 200.
 * The proxy runs this check AFTER the login and role check, so only a real admin can ever get here, and answers a real 404.
 * "new" is the add form, not an id. Returns null for every other path.
 */
export type AdminRecordRef = { kind: "offering" | "session" | "package" | "testimonial" | "text" | "legal"; id: string };

export function adminRecordRef(pathname: string): AdminRecordRef | null {
  const m = /^\/admin\/(offerings|sessions|packages|testimonials|texts|legal)\/([^/]+)(?:\/(?:history|versions|publish))?\/?$/.exec(pathname);
  if (!m || m[2] === "new") return null;
  const kinds = { offerings: "offering", sessions: "session", packages: "package", testimonials: "testimonial", texts: "text", legal: "legal" } as const;
  let id = m[2];
  try {
    id = decodeURIComponent(id);
  } catch {
    return { kind: kinds[m[1] as keyof typeof kinds], id: "" }; // broken %-escape: not a real record
  }
  // Real ids, text keys (dots) and legal slugs only use these characters. Anything else (NUL, spaces, slashes...) is not a record:
  // answering 404 here also keeps odd bytes away from the database (N18-3).
  if (!/^[A-Za-z0-9._-]+$/.test(id)) id = "";
  return { kind: kinds[m[1] as keyof typeof kinds], id };
}

/** `exists` answers true / false, or throws when the database cannot answer: then the page decides (it fails closed). */
export async function guardAdminRecord(pathname: string, exists: (ref: AdminRecordRef) => Promise<boolean>): Promise<{ action: "next" } | { action: "not-found" }> {
  const ref = adminRecordRef(pathname);
  if (!ref) return { action: "next" };
  if (!ref.id || ref.id.length > 120) return { action: "not-found" };
  try {
    return (await exists(ref)) ? { action: "next" } : { action: "not-found" };
  } catch {
    return { action: "next" };
  }
}
