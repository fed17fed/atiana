import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOOKINGS_CSV_HEADER, bookingsToCsv, dublinStamp } from "@/lib/admin/bookings-csv";

const row = (over: Record<string, unknown> = {}) => ({
  createdAt: new Date("2026-11-21T10:00:00Z"),
  status: "CONFIRMED",
  paidWith: "FREE",
  user: { name: "Anna", email: "anna@example.com" },
  session: { startsAt: new Date("2026-12-01T19:00:00Z"), offering: { title: "Moon Flow" } },
  ...over,
});

describe("bookings CSV (task 12.7)", () => {
  it("fixed columns, no secrets", () => {
    expect([...BOOKINGS_CSV_HEADER]).toEqual(["booked_at_utc", "booked_at_dublin", "client_name", "client_email", "class", "session_starts_at_utc", "session_starts_at_dublin", "status", "paid_with"]);
    const text = bookingsToCsv([row()]);
    expect(text.startsWith("﻿booked_at_utc,")).toBe(true);
    expect(text).toContain("2026-11-21T10:00:00.000Z,2026-11-21 10:00,Anna,anna@example.com,Moon Flow,2026-12-01T19:00:00.000Z,2026-12-01 19:00,CONFIRMED,FREE");
    expect(text).not.toMatch(/zoom|token|secret|stripe|http/i);
  });
  it("Dublin columns follow summer time and winter time; UTC stays", () => {
    expect(dublinStamp(new Date("2026-07-01T18:30:00Z"))).toBe("2026-07-01 19:30"); // IST = UTC+1
    expect(dublinStamp(new Date("2026-12-01T19:00:00Z"))).toBe("2026-12-01 19:00"); // GMT
    expect(dublinStamp(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31 23:30");
    expect(dublinStamp(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01 00:30"); // day changes
    expect(bookingsToCsv([row({ session: { startsAt: new Date("2026-07-01T18:30:00Z"), offering: { title: "X" } } })])).toContain("2026-07-01T18:30:00.000Z,2026-07-01 19:30,");
  });
  it("a name or class that starts with = + - @ is made safe", () => {
    const text = bookingsToCsv([row({ user: { name: "=HYPERLINK(\"http://x\")", email: "+a@b.com" }, session: { startsAt: new Date(0), offering: { title: "@SUM(A1)" } } })]);
    expect(text).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(text).toContain(",'+a@b.com,");
    expect(text).toContain(",'@SUM(A1),");
    expect(text).not.toMatch(/\r\n[=+\-@]/);
  });
  it("no name and no payment method give empty cells", () => {
    expect(bookingsToCsv([row({ user: { name: null, email: "a@b.com" }, paidWith: null })])).toContain(",,a@b.com,");
  });
  it("the export query selects no Zoom link, no payment id and no token (source scan)", () => {
    const src = readFileSync(join(__dirname, "..", "lib", "admin", "read-queries.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function exportBookings"));
    expect(fn).not.toMatch(/zoom|token|stripe|orderId|creditGrantId|userKey|slotKey|payment/i);
  });
});
