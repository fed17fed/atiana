import { describe, expect, it } from "vitest";
import { csvCell, neutralizeCell, toCsv } from "@/lib/admin/csv";
import { cleanPage, cleanQuery, escapeLike, MAX_QUERY_LENGTH } from "@/lib/admin/read-queries";

describe("CSV injection guard", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\t=1", "\r=1", " =1+1", '=HYPERLINK("http://x","y")'])("neutralizes %j", (v) => {
    expect(neutralizeCell(v).startsWith("'")).toBe(true);
  });
  it.each(["anna@example.com", "plain", "2026-11-21T10:00:00.000Z", "a=b", "x-y", ""])("leaves %j alone", (v) => expect(neutralizeCell(v)).toBe(v));
  it("quotes cells with commas, quotes and line breaks", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("l1\nl2")).toBe('"l1\nl2"');
  });
  it("a formula that also needs quotes is both neutralized and quoted", () => {
    expect(csvCell('=A1,"x"')).toBe(`"'=A1,""x"""`);
  });
  it("null, undefined and dates", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(new Date("2026-11-21T10:00:00Z"))).toBe("2026-11-21T10:00:00.000Z");
  });
  it("toCsv: BOM, header, CRLF, one line per row", () => {
    const out = toCsv(["email", "status"], [["=cmd|' /C calc'!A0", "ACTIVE"], ["b@x.com", null]]);
    expect(out.startsWith("﻿email,status\r\n")).toBe(true);
    expect(out.split("\r\n")).toEqual(["﻿email,status", "'=cmd|' /C calc'!A0,ACTIVE", "b@x.com,", ""]);
  });
});

describe("admin search and paging inputs", () => {
  it("cleanQuery trims, shortens, ignores junk", () => {
    expect(cleanQuery("  a@b.com ")).toBe("a@b.com");
    expect(cleanQuery("")).toBeNull();
    expect(cleanQuery(undefined)).toBeNull();
    expect(cleanQuery(["x@y.com", "z"])).toBe("x@y.com");
    expect(cleanQuery("a".repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
    expect(cleanQuery(5)).toBeNull();
  });
  it("cleanPage: whole number >= 1", () => {
    expect(cleanPage("3")).toBe(3);
    for (const bad of [undefined, "0", "-2", "abc", "1.5", "99999999999", ["2"].length ? 7 : 0]) expect(cleanPage(bad as never), String(bad)).toBe(1);
    expect(cleanPage(["4", "5"])).toBe(4);
  });
  it("escapeLike protects % _ and backslash", () => expect(escapeLike("a_b%c\\d")).toBe("a\\_b\\%c\\\\d"));
});
