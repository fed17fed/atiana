/** N19-1: control characters (NUL...) never reach the database from an admin search / filter. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanParam, cleanQuery } from "@/lib/admin/read-queries";

describe("cleanQuery / cleanParam", () => {
  it("NUL and other control characters are removed; the rest is kept", () => {
    expect(cleanQuery("\u0000")).toBeNull();
    expect(cleanQuery("a\u0000b@x.com")).toBe("a b@x.com");
    expect(cleanQuery("%00")).toBe("%00"); // the text "%00" is plain text (already decoded by the server), a LIKE-safe string
    expect(cleanQuery("\u0001\u0007\u001f\u007f\u0085")).toBeNull();
    expect(cleanQuery("  anna@x.com\u0000  ")).toBe("anna@x.com");
    expect(cleanQuery("a\tb\nc")).toBe("a b c");
  });
  it("arrays, non-strings, empty and long values", () => {
    expect(cleanQuery(["\u0000", "second"])).toBeNull();
    expect(cleanQuery(undefined)).toBeNull();
    expect(cleanQuery(5)).toBeNull();
    expect(cleanQuery("x".repeat(500))).toHaveLength(120);
    expect(cleanParam("\u0000id", 60)).toBe("id");
    expect(cleanParam("y".repeat(500), 60)).toHaveLength(60);
  });
  it("no result can still hold a NUL", () => {
    for (let c = 0; c < 32; c++) expect(cleanQuery(`a${String.fromCharCode(c)}b`) ?? "").not.toMatch(/[\u0000-\u001f]/);
  });
});

describe("every admin address parameter goes through the helper (source scan)", () => {
  const read = (f: string) => readFileSync(`${__dirname}/../${f}`, "utf8");
  it("list pages use cleanQuery", () => {
    for (const f of ["bookings", "orders", "messages", "referrals", "subscribers", "texts"]) expect(read(`app/admin/${f}/page.tsx`), f).toContain("cleanQuery(sp.q)");
  });
  it("both CSV routes use cleanQuery", () => {
    for (const f of ["bookings", "subscribers"]) expect(read(`app/admin/${f}/export/route.ts`), f).toContain('cleanQuery(new URL(req.url).searchParams.get("q"))');
  });
  it("sessions page cleans the offering filter", () => {
    expect(read("app/admin/sessions/page.tsx")).toContain("cleanParam(sp.offering, 60)");
  });
});
