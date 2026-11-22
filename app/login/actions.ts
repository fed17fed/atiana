"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { devLoginAllowed, isDevLoginEmail, isLoginAllowed, LOGIN_OFF_MESSAGE, LOGIN_SENT_PATH, magicLinkConfig, safeNextPath } from "@/lib/auth-config";

export type LoginState =
  | { status: "idle" }
  | { status: "error"; message: string; email?: string }
  | { status: "demo-off"; message: string; email?: string };

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email("Please enter a valid email, for example anna@example.com.").max(200) });

/** Sends the magic link. OFF (demo message) unless the login keys are set. */
export async function requestLoginLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  // The typed text is returned with an error, so the form can show it again (React clears plain fields after an action).
  const typed = typeof formData.get("email") === "string" ? String(formData.get("email")).slice(0, 200) : "";
  if (!magicLinkConfig()) return { status: "demo-off", message: LOGIN_OFF_MESSAGE, email: typed };
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0].message, email: typed };
  const next = safeNextPath(formData.get("next"));
  // Admin-only login: an email that is not allowed gets the SAME screen as an allowed one, but nothing is sent and no user is created.
  if (!isLoginAllowed(parsed.data.email)) redirect(LOGIN_SENT_PATH);
  try {
    const { signIn } = await import("@/lib/auth");
    await signIn("resend", { email: parsed.data.email, redirectTo: next });
  } catch (error) {
    // Auth.js ends signIn with a redirect. A redirect to the "check your email" screen must go through.
    const digest = error instanceof Error && "digest" in error ? String((error as { digest?: unknown }).digest) : "";
    if (digest.startsWith("NEXT_REDIRECT") && !digest.includes("error=")) throw error;
    // The email could not be sent (wrong key, sender refused, network). The visitor gets the SAME neutral screen as everybody else:
    // a different message would show that this email is an admin email. The reason is only in the server log (no address, no key).
    console.error("[login] could not send the link", digest.includes("error=") ? `Auth.js error ${(/error=([A-Za-z]+)/.exec(digest) ?? [])[1] ?? "unknown"}` : error instanceof Error ? error.message : error);
  }
  redirect(LOGIN_SENT_PATH);
}

/**
 * DEV ONLY. Logs in one of the invented test users (@atiana.test) without an email.
 * Refuses unless devLoginAllowed(): NODE_ENV is not production, ALLOW_DEV_LOGIN=true, and not on Vercel.
 */
export async function devLogin(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (!devLoginAllowed() || !process.env.AUTH_SECRET) {
    return { status: "error", message: "Dev login is switched off." };
  }
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success || !isDevLoginEmail(parsed.data.email)) {
    return { status: "error", message: "Dev login works only for @atiana.test test users." };
  }
  const next = safeNextPath(formData.get("next"));
  try {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (!user) return { status: "error", message: "This test user does not exist. Run the seed first." };
    const sessionToken = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 24 * 3600_000);
    await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });
    (await cookies()).set("authjs.session-token", sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires,
      secure: false, // dev only (http://localhost)
    });
  } catch (error) {
    console.error("[dev-login] failed", error instanceof Error ? error.message : error);
    return { status: "error", message: "Dev login failed (database not ready?)." };
  }
  redirect(next);
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get("authjs.session-token")?.value ?? jar.get("__Secure-authjs.session-token")?.value;
  if (token) {
    try {
      const { prisma } = await import("@/lib/prisma");
      // End the session by expiring it (nothing is deleted).
      await prisma.session.updateMany({ where: { sessionToken: token }, data: { expires: new Date() } });
    } catch {
      // database not ready: only the cookie is removed
    }
  }
  jar.delete("authjs.session-token");
  jar.delete("__Secure-authjs.session-token");
  redirect("/");
}
