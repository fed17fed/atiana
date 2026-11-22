import { describe, expect, it } from "vitest";
import { checkSetAdminTarget, parseSetAdminArgs } from "../lib/set-admin-args";

describe("set-admin arguments", () => {
  it("parses email and flags", () => {
    expect(parseSetAdminArgs(["A@B.com", "--create"])).toEqual({ email: "a@b.com", allowRemote: false, create: true, dryRun: false });
  });
  it("rejects missing email, bad email, unknown flag", () => {
    expect(() => parseSetAdminArgs([])).toThrow();
    expect(() => parseSetAdminArgs(["nope"])).toThrow();
    expect(() => parseSetAdminArgs(["a@b.com", "--force"])).toThrow();
  });
});

describe("set-admin target", () => {
  it("allows localhost without a flag", () => {
    expect(() => checkSetAdminTarget("postgresql://u:p@localhost:5433/atiana_dev", false)).not.toThrow();
  });
  it("refuses a remote host without the flag, allows it with the flag", () => {
    const remote = "postgresql://u:p@ep-example.neon.tech/db";
    expect(() => checkSetAdminTarget(remote, false)).toThrow(/STOP/);
    expect(() => checkSetAdminTarget(remote, true)).not.toThrow();
  });
  it("does not leak the password in the error", () => {
    try { checkSetAdminTarget("postgresql://u:secretpw@ep-x.neon.tech/db", false); } catch (e) { expect(String(e)).not.toContain("secretpw"); }
  });
  it("refuses when no URL", () => {
    expect(() => checkSetAdminTarget(undefined, true)).toThrow();
  });
});
