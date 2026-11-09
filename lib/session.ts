/** Who is logged in? Always safe: no secret or no database means "nobody". */
import { cookies } from "next/headers";
import { connection } from "next/server";
import { forbidden, redirect } from "next/navigation";
import type { Role } from "./generated/prisma/enums";

export type CurrentUser = { id: string; email: string; name: string | null; role: Role };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Always a per-request read, even when login is off: pages that call this are never baked at build time.
  await connection();
  const jar = await cookies();
  if (!process.env.AUTH_SECRET) return null;
  // No session cookie = nobody is logged in. No need to load Auth.js or ask the database.
  if (!jar.has("authjs.session-token") && !jar.has("__Secure-authjs.session-token")) return null;
  try {
    const { auth } = await import("./auth");
    const session = await auth();
    const u = session?.user;
    if (!u?.id || !u.email) return null;
    return { id: u.id, email: u.email, name: u.name ?? null, role: u.role };
  } catch {
    return null;
  }
}

/** For pages that need a login. Sends visitors to /login and back. */
export async function requireUser(nextPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/** For admin pages. Not logged in -> /login. Logged in but not ADMIN -> 403 page. */
export async function requireAdmin(nextPath: string): Promise<CurrentUser> {
  const user = await requireUser(nextPath);
  if (user.role !== "ADMIN") forbidden();
  return user;
}
