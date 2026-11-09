import { describe, expect, it, vi } from "vitest";
import { mailConfig, sendMail } from "@/lib/mail";
import { buildBookingMail } from "@/lib/notifications";
import { CANCELLATION_HOURS } from "@/lib/booking-rules";

describe("mail is OFF without keys", () => {
  it("no config without key or sender", () => {
    expect(mailConfig({})).toBeNull();
    expect(mailConfig({ RESEND_API_KEY: "re_x" })).toBeNull();
    expect(mailConfig({ EMAIL_FROM: "a@b.test" })).toBeNull();
  });
  it("accepts AUTH_RESEND_KEY as an alternative name", () => {
    expect(mailConfig({ AUTH_RESEND_KEY: "re_x", EMAIL_FROM: "a@b.test" })).toEqual({ apiKey: "re_x", from: "a@b.test" });
  });
  it("only logs (no network call, no body in the log) when off", async () => {
    const fetchImpl = vi.fn();
    const log = vi.fn();
    const r = await sendMail({ to: "a@b.test", subject: "Hi", text: "SECRET-ZOOM-LINK" }, { env: {}, fetchImpl: fetchImpl as never, log });
    expect(r.sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(log.mock.calls[0][0]).toContain("a@b.test");
    expect(log.mock.calls[0][0]).not.toContain("SECRET-ZOOM-LINK");
  });
  it("sends through Resend when configured, header injection removed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true });
    await sendMail(
      { to: "a@b.test", subject: "Hi\r\nBcc: evil@x.test", text: "body" },
      { env: { RESEND_API_KEY: "re_x", EMAIL_FROM: "KEA <kea@x.test>" }, fetchImpl: fetchImpl as never },
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.subject).toBe("Hi Bcc: evil@x.test");
    expect(body.to).toEqual(["a@b.test"]);
  });
  it("throws when Resend answers with an error", async () => {
    await expect(
      sendMail({ to: "a@b.test", subject: "x", text: "y" }, { env: { RESEND_API_KEY: "k", EMAIL_FROM: "f@x.test" }, fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 500 }) as never }),
    ).rejects.toThrow(/500/);
  });
});

describe("booking mails", () => {
  const session = {
    startsAt: new Date("2026-11-17T18:00:00Z"),
    zoomUrl: "https://zoom.us/j/0000000000",
    location: null,
    offering: { title: "Beginners' Introduction", mode: "ONLINE" as const, location: null },
  };
  it("confirmation has the Zoom link, the time and the cancellation hours from the constant", () => {
    const m = buildBookingMail("confirmation", "a@b.test", session);
    expect(m.text).toContain("https://zoom.us/j/0000000000");
    expect(m.text).toContain("Tue 17 Nov, 18:00");
    expect(m.text).toContain(`${CANCELLATION_HOURS} hours`);
    expect(m.subject).toContain("You are booked");
  });
  it("in-person session shows the place, not a Zoom link", () => {
    const m = buildBookingMail("reminder", "a@b.test", {
      ...session,
      zoomUrl: null,
      location: "Dublin (demo)",
      offering: { title: "1:1", mode: "IN_PERSON", location: null },
    });
    expect(m.text).toContain("Place: Dublin (demo)");
    expect(m.text).not.toContain("zoom");
  });
});
