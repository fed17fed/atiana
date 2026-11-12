/**
 * Safety guard (owner decision 2026-11-12): tests and local seed scripts must never touch the live (Neon) database.
 * Call assertLocalDb() BEFORE any query. It throws unless the database host is localhost / 127.0.0.1 / ::1.
 * It never prints the connection string (only the host).
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function dbHost(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isLocalDbUrl(url: string | undefined | null): boolean {
  const h = dbHost(url);
  return h !== null && LOCAL_HOSTS.has(h.toLowerCase());
}

export function assertLocalDb(url: string | undefined | null, what = "this command"): void {
  if (!isLocalDbUrl(url)) {
    throw new Error(
      `STOP: ${what} may only run on a LOCAL database (localhost or 127.0.0.1). ` +
        `The database host is "${dbHost(url) ?? "unknown / not set"}". Use .env.atiana-test (see scripts/with-local-db.sh).`,
    );
  }
}

/**
 * For seed scripts: local databases only, unless the owner allowed a remote seed for this run
 * (ALLOW_REMOTE_DB_SEED=true, task 11.14 with a Neon backup branch). Tests never use this override.
 */
export function assertSeedTarget(url: string | undefined | null, env: Record<string, string | undefined> = process.env): void {
  if (env.ALLOW_REMOTE_DB_SEED === "true") return;
  assertLocalDb(url, "this seed script");
}
