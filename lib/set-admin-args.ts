/** Argument parsing and host check for scripts/set-admin.ts (no database access here, so it is easy to test). */
import { isLocalDbUrl, dbHost } from "./assert-local-db";

export type SetAdminArgs = { email: string; allowRemote: boolean; create: boolean; dryRun: boolean };

export function parseSetAdminArgs(argv: string[]): SetAdminArgs {
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const known = new Set(["--allow-remote", "--create", "--dry-run"]);
  for (const f of flags) if (!known.has(f)) throw new Error(`Unknown flag ${f}. Known: --allow-remote, --create, --dry-run`);
  const emails = argv.filter((a) => !a.startsWith("--"));
  if (emails.length !== 1) throw new Error("Usage: set-admin <email> [--create] [--dry-run] [--allow-remote]");
  const email = emails[0].trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("The email address does not look valid.");
  return { email, allowRemote: flags.has("--allow-remote"), create: flags.has("--create"), dryRun: flags.has("--dry-run") };
}

/** Local host: always allowed. Any other host: only with the explicit --allow-remote flag. Never prints the URL. */
export function checkSetAdminTarget(url: string | undefined | null, allowRemote: boolean): void {
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL is not set");
  if (isLocalDbUrl(url)) return;
  if (!allowRemote) {
    throw new Error(
      `STOP: the database host is "${dbHost(url) ?? "unknown"}", not localhost. ` +
        `set-admin on a live database needs the flag --allow-remote and the owner's OK (task 12.19).`,
    );
  }
}
