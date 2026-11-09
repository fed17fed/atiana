import { describe, expect, it, vi } from "vitest";
import { guardRoute } from "@/lib/route-guard";

describe("route guard", () => {
  const admin = vi.fn().mockResolvedValue("ADMIN");
  const user = vi.fn().mockResolvedValue("USER");

  it("public pages pass without any lookup", async () => {
    const lookup = vi.fn();
    expect(await guardRoute("/schedule", undefined, lookup)).toEqual({ action: "next" });
    expect(await guardRoute("/administrator", undefined, lookup)).toEqual({ action: "next" }); // not /admin
    expect(lookup).not.toHaveBeenCalled();
  });
  it("/account and /admin without a session cookie go to login", async () => {
    expect(await guardRoute("/account", undefined, user)).toEqual({ action: "login" });
    expect(await guardRoute("/account/credits", undefined, user)).toEqual({ action: "login" });
    expect(await guardRoute("/admin", undefined, admin)).toEqual({ action: "login" });
    expect(await guardRoute("/admin/slots", undefined, admin)).toEqual({ action: "login" });
  });
  it("a normal user gets 403 on /admin and /admin/...", async () => {
    expect(await guardRoute("/admin", "tok", user)).toEqual({ action: "forbidden" });
    expect(await guardRoute("/admin/slots", "tok", user)).toEqual({ action: "forbidden" });
  });
  it("an admin may enter /admin", async () => {
    expect(await guardRoute("/admin/slots", "tok", admin)).toEqual({ action: "next" });
  });
  it("an unknown or expired session on /admin goes to login", async () => {
    expect(await guardRoute("/admin", "old", vi.fn().mockResolvedValue(null))).toEqual({ action: "login" });
  });
  it("a normal user may enter /account", async () => {
    expect(await guardRoute("/account/bookings", "tok", user)).toEqual({ action: "next" });
  });
  it("if the lookup fails the page decides (page checks fail closed)", async () => {
    expect(await guardRoute("/admin", "tok", vi.fn().mockRejectedValue(new Error("db down")))).toEqual({ action: "next" });
  });
});

import { guardBookClass } from "@/lib/route-guard";

describe("guardBookClass (real 404)", () => {
  it("other paths pass", async () => expect(await guardBookClass("/schedule", null, vi.fn())).toEqual({ action: "next" }));
  it("no session, empty or too long id: 404 without a lookup", async () => {
    const lookup = vi.fn();
    expect(await guardBookClass("/book/class", null, lookup)).toEqual({ action: "not-found" });
    expect(await guardBookClass("/book/class", "  ", lookup)).toEqual({ action: "not-found" });
    expect(await guardBookClass("/book/class", "x".repeat(61), lookup)).toEqual({ action: "not-found" });
    expect(lookup).not.toHaveBeenCalled();
  });
  it("unknown session: 404; known session: next; database error: the page decides", async () => {
    expect(await guardBookClass("/book/class", "bogus", async () => false)).toEqual({ action: "not-found" });
    expect(await guardBookClass("/book/class", "ok", async () => true)).toEqual({ action: "next" });
    expect(await guardBookClass("/book/class", "ok", () => Promise.reject(new Error("db")))).toEqual({ action: "next" });
  });
});
