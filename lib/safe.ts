import { connection } from "next/server";

/**
 * Runs a database read at request time. Returns null instead of throwing when the database is not ready.
 * `connection()` marks the read as dynamic (never baked into the build, never part of a prefetch).
 */
export async function safeDb<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  await connection(); // outside try/catch on purpose: it may signal "wait for the request"
  try {
    return await fn();
  } catch (error) {
    console.warn(`[db] ${label} failed (database not ready?)`, error instanceof Error ? error.message.split("\n").pop() : error);
    return null;
  }
}
