import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Task: one Prisma client per process, also in production (2026-11-21). The real client is replaced by a counter, so no database is needed.
const created: unknown[] = [];

vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("@/lib/generated/prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      created.push(this);
    }
    $connect() {
      return Promise.resolve();
    }
  },
}));

const g = globalThis as unknown as { prisma?: unknown };

describe("lib/prisma.ts client cache", () => {
  beforeEach(() => {
    created.length = 0;
    delete g.prisma;
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5433/atiana_test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    delete g.prisma;
  });

  for (const mode of ["production", "development", "test"]) {
    it(`creates ONE client in ${mode} mode, however often it is asked`, async () => {
      vi.stubEnv("NODE_ENV", mode);
      const { getPrisma, prisma } = await import("@/lib/prisma");
      const a = getPrisma();
      const b = getPrisma();
      expect(a).toBe(b);
      void prisma.$connect; // the lazy proxy uses the same client
      void prisma.$connect;
      expect(created).toHaveLength(1);
    });
  }

  it("production: a second copy of the module (another bundle chunk) re-uses the client from globalThis", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const first = (await import("@/lib/prisma")).getPrisma();
    vi.resetModules();
    const second = (await import("@/lib/prisma")).getPrisma();
    expect(second).toBe(first);
    expect(created).toHaveLength(1);
  });

  it("importing never throws without DATABASE_URL; only a query fails", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    const { getPrisma } = await import("@/lib/prisma");
    expect(() => getPrisma()).toThrow(/DATABASE_URL/);
    expect(created).toHaveLength(0);
  });
});
