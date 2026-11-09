// Data and helpers for prisma/seed.ts. Kept separate (no database code) so it can be unit-tested.
// All people are invented. Only @atiana.test e-mail addresses are allowed in seed data.

export type SeedUser = {
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  referralCode: string;
};

export const SEED_EMAIL_DOMAIN = "@atiana.test";

export const seedUsers: SeedUser[] = [
  { email: "admin@atiana.test", name: "Demo Admin", role: "ADMIN", referralCode: "DEMOADMIN" },
  { email: "client1@atiana.test", name: "Demo Client One", role: "USER", referralCode: "DEMOCLIENT1" },
];

/** Throws if seed data could reach a real person (e.g. a real e-mail address). */
export function assertSeedUsersSafe(users: SeedUser[]): void {
  const emails = new Set<string>();
  const codes = new Set<string>();
  for (const u of users) {
    if (!u.email.endsWith(SEED_EMAIL_DOMAIN)) {
      throw new Error(`Seed user ${u.email} must use ${SEED_EMAIL_DOMAIN}`);
    }
    if (emails.has(u.email) || codes.has(u.referralCode)) {
      throw new Error(`Duplicate seed user data: ${u.email}`);
    }
    emails.add(u.email);
    codes.add(u.referralCode);
  }
}
