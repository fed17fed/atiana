import { describe, expect, it } from "vitest";
import { assertSeedUsersSafe, seedUsers, type SeedUser } from "@/prisma/seed-data";

describe("seed data", () => {
  it("has one admin and one test client, all on @atiana.test", () => {
    expect(seedUsers.filter((u) => u.role === "ADMIN").map((u) => u.email)).toEqual(["admin@atiana.test"]);
    expect(seedUsers.some((u) => u.email === "client1@atiana.test" && u.role === "USER")).toBe(true);
    expect(() => assertSeedUsersSafe(seedUsers)).not.toThrow();
  });

  it("rejects real e-mail domains", () => {
    const bad: SeedUser[] = [{ email: "someone@gmail.com", name: "X", role: "USER", referralCode: "X1" }];
    expect(() => assertSeedUsersSafe(bad)).toThrow(/atiana\.test/);
  });

  it("rejects duplicates", () => {
    const u = seedUsers[0];
    expect(() => assertSeedUsersSafe([u, u])).toThrow(/Duplicate/);
  });
});
