import { describe, expect, it } from "vitest";
import { parseContact } from "@/lib/contact-schema";

const good = { name: "Anna Murphy", email: "anna@example.com", message: "Hello, I have a question." };

describe("contact schema", () => {
  it("accepts valid input and trims it", () => {
    const r = parseContact({ ...good, name: "  Anna  ", email: " anna@example.com " });
    expect(r).toEqual({ ok: true, data: { ...good, name: "Anna" } });
  });

  it("gives a clear error for each empty field", () => {
    const r = parseContact({ name: "", email: "", message: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toBe("Please enter your name.");
      expect(r.errors.email).toBe("Please enter your email.");
      expect(r.errors.message).toBe("Please write at least 10 characters.");
    }
  });

  it("rejects a bad email", () => {
    const r = parseContact({ ...good, email: "not-an-email" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toMatch(/valid email/);
  });

  it("rejects too long values", () => {
    expect(parseContact({ ...good, name: "a".repeat(101) }).ok).toBe(false);
    expect(parseContact({ ...good, message: "a".repeat(5001) }).ok).toBe(false);
  });

  it("treats missing, null and File-like values as empty (no crash)", () => {
    const r = parseContact({ name: null, email: undefined, message: { size: 3 } });
    expect(r.ok).toBe(false);
  });
});
