/**
 * Auth.js (NextAuth v5) with the Prisma adapter and a Resend magic link.
 * Sessions are stored in the database. Everything is created lazily, so a build or a page without
 * keys or database never crashes.
 */
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import Resend from "next-auth/providers/resend";
import { isLoginAllowed, LOGIN_SENT_PATH, magicLinkConfig } from "./auth-config";
import { swallowSendErrors } from "./auth-mail";
import type { Role } from "./generated/prisma/enums";
import { getPrisma } from "./prisma";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

/** Resend with the send error caught inside (see lib/auth-mail.ts): allowed and refused emails end on the same screen. */
function resendProvider(cfg: { apiKey: string; from: string }) {
  const original = Resend({ apiKey: cfg.apiKey, from: cfg.from }).sendVerificationRequest;
  return Resend({ apiKey: cfg.apiKey, from: cfg.from, sendVerificationRequest: swallowSendErrors(async (params) => original(params)) });
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const cfg = magicLinkConfig();
  return {
    adapter: PrismaAdapter(getPrisma() as never),
    providers: cfg ? [resendProvider(cfg)] : [],
    session: { strategy: "database" },
    pages: { signIn: "/login", verifyRequest: "/login", error: "/login" },
    trustHost: true,
    callbacks: {
      // Server-side guard for every way in (also a direct call to /api/auth). Returning a path redirects there:
      // the neutral "check your email" screen, so nobody can tell which emails exist. No email is sent when refused.
      signIn({ user, email }) {
        if (isLoginAllowed(user?.email)) return true;
        // Same address Auth.js itself uses after a mail was handed over: allowed and refused emails get the IDENTICAL redirect (N18-2).
        return email?.verificationRequest ? LOGIN_SENT_PATH : "/login?error=1";
      },
      session({ session, user }) {
        session.user.id = user.id;
        session.user.role = (user as unknown as { role: Role }).role;
        return session;
      },
    },
  };
});
