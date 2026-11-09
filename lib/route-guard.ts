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
