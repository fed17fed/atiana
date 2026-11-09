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
