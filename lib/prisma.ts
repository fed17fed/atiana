import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL; // pooled connection
  if (!connectionString) throw new Error("DATABASE_URL is not set. Add it to .env");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Creates the client on first use. Importing this file never throws (builds work without a database).
 * ONE client per process, in every mode (dev, test, production): it is kept in globalThis. Before 2026-11-21 it was
 * kept only outside production, so every query made a new client + connection pool (30 parallel requests opened ~97 connections).
 */
export function getPrisma(): PrismaClient {
  const client = globalForPrisma.prisma ?? createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

/** Same client, created lazily: a missing DATABASE_URL only fails when a query runs. */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
