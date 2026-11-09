import { describe, expect, it, vi } from "vitest";
import {
  emailConfig,
  makeNotify,
  makeVerifyHuman,
  MESSAGES,
  oneLine,
  processContact,
  turnstileConfig,
} from "@/lib/contact-service";

const good = { name: "Anna", email: "anna@example.com", message: "Hello, I have a question." };

describe("processContact", () => {
  it("saves a valid message and says thank you", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const r = await processContact(good, { save });
    expect(r).toEqual({ status: "success", message: MESSAGES.success });
    expect(save).toHaveBeenCalledWith(good);
  });

  it("returns field errors and keeps the typed values; saves nothing", async () => {
    const save = vi.fn();
    const r = await processContact({ ...good, email: "bad" }, { save });
    expect(r.status).toBe("error");
    if (r.status === "error") {
      expect(r.fieldErrors?.email).toBeTruthy();
      expect(r.values?.name).toBe("Anna");
    }
    expect(save).not.toHaveBeenCalled();
  });

  it("shows the friendly demo message when the database is not ready (never throws)", async () => {
    const log = vi.fn();
    const save = vi.fn().mockRejectedValue(new Error('relation "ContactMessage" does not exist'));
    const r = await processContact(good, { save, log });
    expect(r.status).toBe("demo-unavailable");
    if (r.status === "demo-unavailable") expect(r.message).toMatch(/messages are not saved yet/);
    if (r.status === "demo-unavailable") expect(r.values?.message).toBe(good.message);
    expect(log).toHaveBeenCalled();
  });

  it("does not send the admin email when saving failed", async () => {
    const notify = vi.fn();
    await processContact(good, { save: () => Promise.reject(new Error("db")), notify });
    expect(notify).not.toHaveBeenCalled();
  });

  it("still succeeds when the admin email fails", async () => {
    const r = await processContact(good, {
      save: async () => {},
      notify: () => Promise.reject(new Error("resend down")),
    });
    expect(r.status).toBe("success");
  });

  it("honeypot: fake success, nothing saved", async () => {
    const save = vi.fn();
    const r = await processContact({ ...good, website: "http://spam.example" }, { save });
    expect(r.status).toBe("success");
    expect(save).not.toHaveBeenCalled();
  });

  it("Turnstile on: missing or failed token blocks saving", async () => {
    const save = vi.fn();
    const verifyHuman = vi.fn().mockResolvedValue(false);
    expect((await processContact(good, { save, verifyHuman })).status).toBe("error");
    expect(
      (await processContact({ ...good, "cf-turnstile-response": "tok" }, { save, verifyHuman })).status,
    ).toBe("error");
    expect(save).not.toHaveBeenCalled();
  });

  it("Turnstile on: valid token lets the message through", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const verifyHuman = vi.fn().mockResolvedValue(true);
    const r = await processContact({ ...good, "cf-turnstile-response": "tok" }, { save, verifyHuman });
    expect(r.status).toBe("success");
    expect(verifyHuman).toHaveBeenCalledWith("tok");
  });
});

describe("optional services are off without env vars", () => {
  it("turnstileConfig and emailConfig return null", () => {
    expect(turnstileConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(emailConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("need all values to switch on", () => {
    expect(turnstileConfig({ TURNSTILE_SECRET_KEY: "s" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(emailConfig({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(
      emailConfig({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c", CONTACT_TO_EMAIL: "x@y.z" } as unknown as NodeJS.ProcessEnv),
    ).toEqual({ apiKey: "k", from: "a@b.c", to: "x@y.z" });
  });
});

describe("email and Turnstile helpers", () => {
  it("oneLine removes line breaks (no header injection)", () => {
    expect(oneLine("Anna\r\nBcc: evil@x.com")).toBe("Anna Bcc: evil@x.com");
  });

  it("makeNotify sends plain text with reply_to", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await makeNotify({ apiKey: "k", from: "a@b.c", to: "x@y.z" }, fetchImpl as unknown as typeof fetch)(good);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body);
    expect(body.reply_to).toBe("anna@example.com");
    expect(body.html).toBeUndefined();
    expect(body.text).toContain("Hello, I have a question.");
  });

  it("makeNotify throws when Resend answers an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 422 });
    await expect(
      makeNotify({ apiKey: "k", from: "a", to: "b" }, fetchImpl as unknown as typeof fetch)(good),
    ).rejects.toThrow(/422/);
  });

  it("makeVerifyHuman reads success from Cloudflare", async () => {
    const ok = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const bad = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) });
    expect(await makeVerifyHuman("s", ok as unknown as typeof fetch)("t")).toBe(true);
    expect(await makeVerifyHuman("s", bad as unknown as typeof fetch)("t")).toBe(false);
  });
});
