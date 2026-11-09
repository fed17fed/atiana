import { describe, expect, it } from "vitest";
import { devLoginAllowed, isDevLoginEmail, magicLinkConfig, safeNextPath } from "@/lib/auth-config";
import { checkCronAuth } from "@/lib/cron-auth";

describe("magic link login is OFF without keys", () => {
  it("off when nothing is set", () => expect(magicLinkConfig({})).toBeNull());
  it("off when one part is missing", () => {
    expect(magicLinkConfig({ AUTH_SECRET: "s", EMAIL_FROM: "a@b.test" })).toBeNull();
    expect(magicLinkConfig({ AUTH_SECRET: "s", AUTH_RESEND_KEY: "k" })).toBeNull();
    expect(magicLinkConfig({ AUTH_RESEND_KEY: "k", EMAIL_FROM: "a@b.test" })).toBeNull();
  });
  it("on with secret, key and sender (RESEND_API_KEY also works)", () => {
    expect(magicLinkConfig({ AUTH_SECRET: "s", AUTH_RESEND_KEY: "k", EMAIL_FROM: "a@b.test" })).not.toBeNull();
    expect(magicLinkConfig({ AUTH_SECRET: "s", RESEND_API_KEY: "k", EMAIL_FROM: "a@b.test" })).not.toBeNull();
  });
});

describe("dev login can never be on in production or on Vercel", () => {
  it("needs the explicit flag", () => {
    expect(devLoginAllowed({ NODE_ENV: "development" })).toBe(false);
    expect(devLoginAllowed({ NODE_ENV: "development", ALLOW_DEV_LOGIN: "yes" })).toBe(false);
    expect(devLoginAllowed({ NODE_ENV: "development", ALLOW_DEV_LOGIN: "true" })).toBe(true);
  });
  it("never when NODE_ENV is production, even with the flag", () => {
    expect(devLoginAllowed({ NODE_ENV: "production", ALLOW_DEV_LOGIN: "true" })).toBe(false);
  });
  it("never on Vercel, even if NODE_ENV were wrong", () => {
    expect(devLoginAllowed({ NODE_ENV: "development", ALLOW_DEV_LOGIN: "true", VERCEL: "1" })).toBe(false);
    expect(devLoginAllowed({ NODE_ENV: "development", ALLOW_DEV_LOGIN: "true", VERCEL_ENV: "preview" })).toBe(false);
  });
  it("only invented test addresses", () => {
    expect(isDevLoginEmail("client1@atiana.test")).toBe(true);
    expect(isDevLoginEmail("Admin@ATIANA.test")).toBe(true);
    expect(isDevLoginEmail("real@gmail.com")).toBe(false);
    expect(isDevLoginEmail("x@atiana.test.evil.com")).toBe(false);
  });
});

describe("safeNextPath (no open redirects)", () => {
  it("keeps same-site paths", () => expect(safeNextPath("/book/class?session=abc")).toBe("/book/class?session=abc"));
  it("blocks other sites and tricks", () => {
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "/a\r\nSet-Cookie: x", "/api/auth/signout", 5, undefined]) {
      expect(safeNextPath(bad)).toBe("/account");
    }
  });
});

describe("cron auth", () => {
  it("closed when CRON_SECRET is not set", () => expect(checkCronAuth("Bearer x", {})).toBe("not-configured"));
  it("denied without or with a wrong header", () => {
    const env = { CRON_SECRET: "topsecret" };
    expect(checkCronAuth(null, env)).toBe("denied");
    expect(checkCronAuth("Bearer wrong", env)).toBe("denied");
    expect(checkCronAuth("topsecret", env)).toBe("denied");
    expect(checkCronAuth("Bearer topsecret-and-more", env)).toBe("denied");
  });
  it("ok with the right bearer token", () => expect(checkCronAuth("Bearer topsecret", { CRON_SECRET: "topsecret" })).toBe("ok"));
});
