import { describe, expect, it } from "vitest";
import { assertLocalDb, assertSeedTarget, dbHost, isLocalDbUrl } from "@/lib/assert-local-db";

const NEON = "postgresql://user:secret-pass@ep-example-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("local database guard", () => {
  it("accepts localhost and 127.0.0.1", () => {
    expect(isLocalDbUrl("postgresql://u:p@localhost:5433/atiana_test")).toBe(true);
    expect(isLocalDbUrl("postgresql://u:p@127.0.0.1:5432/x")).toBe(true);
    expect(() => assertLocalDb("postgresql://u:p@localhost:5433/atiana_test")).not.toThrow();
  });
  it("refuses a remote host, an empty value and a broken value", () => {
    for (const bad of [NEON, "", undefined, null, "not a url", "postgresql://u:p@localhost.evil.com/x", "postgresql://localhost@evil.com/x"]) {
      expect(() => assertLocalDb(bad as string)).toThrow(/STOP/);
    }
  });
  it("the error shows the host but never the password", () => {
    try {
      assertLocalDb(NEON);
    } catch (e) {
      const m = (e as Error).message;
      expect(m).toContain("neon.tech");
      expect(m).not.toContain("secret-pass");
    }
    expect(dbHost(NEON)).toBe("ep-example-pooler.eu-central-1.aws.neon.tech");
  });
  it("seed scripts: local only, remote only with the explicit override", () => {
    expect(() => assertSeedTarget(NEON, {})).toThrow(/STOP/);
    expect(() => assertSeedTarget(NEON, { ALLOW_REMOTE_DB_SEED: "yes" })).toThrow(/STOP/);
    expect(() => assertSeedTarget(NEON, { ALLOW_REMOTE_DB_SEED: "true" })).not.toThrow();
    expect(() => assertSeedTarget("postgresql://u:p@localhost:5433/atiana_dev", {})).not.toThrow();
  });
});
