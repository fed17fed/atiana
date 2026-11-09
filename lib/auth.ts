/**
 * Auth.js (NextAuth v5) with the Prisma adapter and a Resend magic link.
 * Sessions are stored in the database. Everything is created lazily, so a build or a page without
 * keys or database never crashes.
 */
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { type DefaultSession } from "next-auth";
import Resend from "next-auth/providers/resend";
import { magicLinkConfig } from "./auth-config";
import type { Role } from "./generated/prisma/enums";
import { getPrisma } from "./prisma";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const cfg = magicLinkConfig();
  return {
    adapter: PrismaAdapter(getPrisma() as never),
    providers: cfg ? [Resend({ apiKey: cfg.apiKey, from: cfg.from })] : [],
    session: { strategy: "database" },
    pages: { signIn: "/login", verifyRequest: "/login?sent=1", error: "/login?error=1" },
    trustHost: true,
    callbacks: {
      session({ session, user }) {
        session.user.id = user.id;
        session.user.role = (user as unknown as { role: Role }).role;
        return session;
      },
    },
  };
});
