/** N18-2: a failed login mail must not change the answer (no admin hint), must not throw, must not log the address. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { safeReason, swallowSendErrors } from "@/lib/auth-mail";

const params = { identifier: "boss@atiana.test", url: "https://site.test/api/auth/callback/resend?token=SECRETTOKEN" };

describe("swallowSendErrors", () => {
  it("success: calls the sender once, logs nothing", async () => {
    const send = vi.fn(async () => undefined);
    const log = vi.fn();
    await swallowSendErrors(send, log)(params);
    expect(send).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });
  it("failure: does not throw (same result as success for the caller), logs the reason only", async () => {
    const log = vi.fn();
    await expect(swallowSendErrors(async () => { throw new Error(`Resend error: {"message":"The to address boss@atiana.test is not allowed","url":"${params.url}"}`); }, log)(params)).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line).not.toMatch(/boss@|atiana\.test|SECRETTOKEN|https?:/);
    expect(line).toContain("could not send");
  });
  it("a non-Error rejection also works; the reason is cut to 120 characters", async () => {
    const log = vi.fn();
    await swallowSendErrors(async () => Promise.reject("x".repeat(500)), log)(params);
    expect(safeReason("x".repeat(500))).toHaveLength(120);
    expect(log).toHaveBeenCalled();
  });
});

describe("wiring", () => {
  it("lib/auth.ts builds the Resend provider with the wrapped sender", () => {
    const t = readFileSync(join(__dirname, "..", "lib", "auth.ts"), "utf8");
    expect(t).toMatch(/sendVerificationRequest: swallowSendErrors\(/);
    expect(t).toMatch(/providers: cfg \? \[resendProvider\(cfg\)\]/);
  });
});

describe("identical redirect (N18-2)", () => {
  it("refused emails get the same redirect address Auth.js uses after a handed-over mail; the login page shows 'sent' for it", () => {
    const a = readFileSync(join(__dirname, "..", "lib", "auth.ts"), "utf8");
    expect(a).toContain("LOGIN_SENT_PATH");
    expect(readFileSync(join(__dirname, "..", "lib", "auth-config.ts"), "utf8")).toContain('"/api/auth/verify-request?provider=resend&type=email"');
    expect(readFileSync(join(__dirname, "..", "app", "login", "actions.ts"), "utf8")).not.toContain("/login?sent=1");
    expect(a).toMatch(/verifyRequest: "\/login"/);
    expect(readFileSync(join(__dirname, "..", "app", "login", "page.tsx"), "utf8")).toMatch(/sp\.sent === "1" \|\| sp\.type === "email"/);
  });
});
