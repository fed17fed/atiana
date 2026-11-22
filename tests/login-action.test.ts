/** A12-3: login when the email cannot be sent. Neutral for everybody, correct URL, no admin hint. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
vi.mock("@/lib/auth", () => ({ signIn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));

const fd = (email: string) => {
  const f = new FormData();
  f.set("email", email);
  return f;
};
/** Runs the action and returns where it redirected (Next.js redirect = a thrown error with a digest). */
async function run(email: string): Promise<string> {
  const { requestLoginLink } = await import("@/app/login/actions");
  try {
    await requestLoginLink({ status: "idle" }, fd(email));
  } catch (e) {
    return String((e as { digest?: string }).digest ?? e);
  }
  return "no redirect";
}

describe("requestLoginLink", () => {
  beforeEach(() => {
    signIn.mockReset();
    vi.stubEnv("AUTH_SECRET", "test-secret");
    vi.stubEnv("AUTH_RESEND_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "login@atiana.test");
    vi.stubEnv("LOGIN_ADMIN_ONLY", "true");
    vi.stubEnv("ADMIN_EMAILS", "boss@atiana.test");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("allowed email, mail works: Auth.js redirect goes through", async () => {
    signIn.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/api/auth/verify-request?provider=resend&type=email;307;" }));
    expect(await run("Boss@atiana.test")).toContain("/api/auth/verify-request?provider=resend&type=email");
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("allowed email, mail fails with an Auth.js error redirect: same neutral screen, URL has one '?' only", async () => {
    signIn.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login?error=Configuration;307;" }));
    const d = await run("boss@atiana.test");
    expect(d).toContain("/api/auth/verify-request?provider=resend&type=email");
    expect(d).not.toMatch(/error=/);
    expect(d.match(/\?/g)).toHaveLength(1);
  });

  it("allowed email, mail fails with a thrown error: same neutral screen", async () => {
    signIn.mockRejectedValue(new Error("Resend 403"));
    expect(await run("boss@atiana.test")).toContain("/api/auth/verify-request?provider=resend&type=email");
  });

  it("refused email: same screen, signIn is never called (no email, no user)", async () => {
    expect(await run("client@atiana.test")).toContain("/api/auth/verify-request?provider=resend&type=email");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("the result for an admin email whose mail fails equals the result for a refused email (no way to tell them apart)", async () => {
    signIn.mockRejectedValue(new Error("Resend 403"));
    expect(await run("boss@atiana.test")).toBe(await run("client@atiana.test"));
  });

  it("the server log never holds the email address", async () => {
    signIn.mockRejectedValue(new Error("Resend 403"));
    await run("boss@atiana.test");
    expect(JSON.stringify((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("boss@");
  });
});
