/**
 * Task 12.13 (pure part): import of the lawyer-approved files with rule tokens, save check, "Last updated" line, version dates, diff, which version is what.
 * No database. The files are the real content/legal/*.mdx.
 */
import { describe, expect, it } from "vitest";
import { legalSlugs, loadLegalDoc } from "@/lib/legal";
import {
  LEGAL_MAX_LENGTH,
  LEGAL_TOKEN_IMPORT,
  checkLegalBody,
  deriveLegalState,
  diffWithContext,
  isoDateToUtcNoon,
  legalDateLabel,
  legalIsoDate,
  lineDiff,
  renderLegalBody,
  sameIgnoringDate,
  setLastUpdatedLine,
  tokenizeLegalBody,
} from "@/lib/legal-versions";
import { fileVersionOne } from "@/lib/admin/legal-service";

describe("import: rule numbers become tokens, the rendered text stays identical", () => {
  it("replaces exactly the expected number of places (booking-cancellation 5+2+1+1+1, terms 1, the other pages 0)", async () => {
    for (const slug of legalSlugs) {
      const doc = (await loadLegalDoc(slug))!;
      const { counts } = tokenizeLegalBody(slug, doc.body);
      const expected = Object.fromEntries((LEGAL_TOKEN_IMPORT[slug] ?? []).map((r) => [r.token, r.expected]));
      expect(counts, slug).toEqual(expected);
    }
    const bc = tokenizeLegalBody("booking-cancellation", (await loadLegalDoc("booking-cancellation"))!.body).counts;
    expect(bc).toEqual({ CANCELLATION_HOURS: 5, CANCEL_CREDIT_VALID_WEEKS: 2, HOLD_MINUTES: 1, JOIN_EARLY_MINUTES: 1, EVENT_REFUND_DAYS: 1 });
  });

  it("filling the tokens gives back EXACTLY the approved text (all 5 pages, same characters)", async () => {
    for (const slug of legalSlugs) {
      const doc = (await loadLegalDoc(slug))!;
      const v1 = (await fileVersionOne(slug))!;
      expect(renderLegalBody(v1.body), slug).toBe(doc.body.trim());
      expect(v1.title).toBe(doc.title);
      expect(v1.versionDate).toBe(doc.updated);
    }
    const v1 = (await fileVersionOne("booking-cancellation"))!;
    expect(v1.body).toContain("{{CANCELLATION_HOURS}} hours or more before the class starts");
    expect(v1.body).toContain("hold your seat for {{HOLD_MINUTES}} minutes");
    expect(v1.body).toContain("valid for {{CANCEL_CREDIT_VALID_WEEKS}} weeks");
    expect(v1.body).toContain("{{EVENT_REFUND_DAYS}} days or more before the event starts");
    expect(v1.body).toContain("join {{JOIN_EARLY_MINUTES}} minutes before the start");
    expect(v1.body).toContain("16 weeks"); // hidden package: stays plain (owner Q6)
    expect(v1.body).toContain("14-day withdrawal right"); // EU law: stays plain
  });

  it("every imported version passes the save check (so the admin can edit and save it)", async () => {
    for (const slug of legalSlugs) {
      const v1 = (await fileVersionOne(slug))!;
      const c = checkLegalBody(v1.body);
      expect(c.ok, `${slug}: ${c.ok ? "" : c.problems.join(" | ")}`).toBe(true);
    }
  });

  it("the plain approved booking-cancellation text would NOT pass the check (that is why the numbers become tokens)", async () => {
    const doc = (await loadLegalDoc("booking-cancellation"))!;
    const c = checkLegalBody(doc.body);
    expect(c.ok).toBe(false);
  });

  it("the 'Last updated' line of each page is the owner's version date (Q5)", async () => {
    const dates: Record<string, string> = { "booking-cancellation": "10 November 2026", terms: "11 November 2026", privacy: "11 November 2026", cookies: "11 November 2026", "health-disclaimer": "12 November 2026" };
    for (const slug of legalSlugs) {
      const doc = (await loadLegalDoc(slug))!;
      expect(doc.body, slug).toContain(`Last updated: ${dates[slug]}.`);
      expect(legalDateLabel(isoDateToUtcNoon(doc.updated)), slug).toBe(dates[slug]);
    }
  });
});

describe("save check for a legal text", () => {
  const ok = "# Title\n\nLast updated: 1 January 2026.\n\nCancel {{CANCELLATION_HOURS}} hours before.";
  it("accepts tokens and normal Markdown", () => {
    expect(checkLegalBody(ok)).toEqual({ ok: true, value: ok });
    expect(checkLegalBody("# A\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[Terms](/legal/terms) and [site](https://example.com).").ok).toBe(true);
  });
  it("refuses a rule number written by hand, an unknown token, a Zoom link, an e-mail, HTML, unsafe links, empty and too long", () => {
    const bad = (t: string) => {
      const c = checkLegalBody(t);
      return c.ok ? [] : c.problems.join(" | ");
    };
    expect(bad("Cancel up to 24 hours before.")).toMatch(/CANCELLATION_HOURS/);
    expect(bad("Hello {{NOPE}}")).toMatch(/Unknown token/);
    expect(bad("Join at https://zoom.us/j/123")).toMatch(/Zoom/);
    expect(bad("Write to me@example.com")).toMatch(/email/i);
    expect(bad("Hi <script>alert(1)</script>")).toMatch(/HTML/);
    expect(bad("Hi <b>bold</b>")).toMatch(/HTML/);
    expect(bad("[x](javascript:alert(1))")).toMatch(/not allowed/);
    expect(bad("   ")).toMatch(/empty/);
    expect(bad("a".repeat(LEGAL_MAX_LENGTH + 1))).toMatch(/too long/);
    expect(bad(123 as unknown as string)).toMatch(/missing/);
  });
  it("allows the hidden package phrase '16 weeks' and the plain legal numbers (14 days, 112)", () => {
    expect(checkLegalBody("5 sessions for €300 (credits valid 16 weeks).").ok).toBe(true);
    expect(checkLegalBody("You may cancel within 14 days. Call 112 or 999.").ok).toBe(true);
  });
  it("normalizes line breaks and trims", () => {
    expect(checkLegalBody("  a\r\nb  \r\n")).toEqual({ ok: true, value: "a\nb" });
  });
});

describe("Last updated line and dates (studio time zone Europe/Dublin)", () => {
  it("sets the first 'Last updated:' line, leaves the rest alone, reports a missing line", () => {
    const r = setLastUpdatedLine("# T\n\nLast updated: 10 November 2026.\n\nText. Last updated: not a line start", new Date("2026-11-25T10:00:00Z"));
    expect(r).toEqual({ found: true, body: "# T\n\nLast updated: 25 November 2026.\n\nText. Last updated: not a line start" });
    expect(setLastUpdatedLine("# T\n\nno date", new Date())).toEqual({ found: false, body: "# T\n\nno date" });
  });
  it("uses the Dublin day, also in summer time (late evening UTC is already the next day in Dublin)", () => {
    expect(legalIsoDate(new Date("2026-11-21T23:30:00Z"))).toBe("2026-11-21");
    expect(legalIsoDate(new Date("2026-07-01T23:30:00Z"))).toBe("2026-07-02");
    expect(legalDateLabel(new Date("2026-07-01T23:30:00Z"))).toBe("2 July 2026");
    expect(legalIsoDate(isoDateToUtcNoon("2026-11-10"))).toBe("2026-11-10");
    expect(legalIsoDate(isoDateToUtcNoon("2026-07-10"))).toBe("2026-07-10");
  });
  it("sameIgnoringDate ignores only the date line", () => {
    expect(sameIgnoringDate("# A\n\nLast updated: 1 May 2026.\n\nx", "# A\n\nLast updated: 9 June 2026.\n\nx\n")).toBe(true);
    expect(sameIgnoringDate("# A\n\nLast updated: 1 May 2026.\n\nx", "# A\n\nLast updated: 1 May 2026.\n\ny")).toBe(false);
  });
});

describe("line diff", () => {
  it("marks added and removed lines and counts them", () => {
    const d = lineDiff("a\nb\nc\nd", "a\nB\nc\nd\ne");
    expect(d.lines).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "same", text: "c" },
      { type: "same", text: "d" },
      { type: "add", text: "e" },
    ]);
    expect([d.added, d.removed]).toEqual([2, 1]);
  });
  it("identical texts have no changes; line-ending and edge spaces do not matter", () => {
    const d = lineDiff("a\r\nb\r\n", "a\nb");
    expect([d.added, d.removed]).toEqual([0, 0]);
  });
  it("handles a big text fast and falls back for huge ones", () => {
    const big = Array.from({ length: 1500 }, (_, i) => `line ${i}`).join("\n");
    const t = Date.now();
    const d = lineDiff(big, big.replace("line 700", "changed"));
    expect([d.added, d.removed]).toEqual([1, 1]);
    expect(Date.now() - t).toBeLessThan(2000);
    const huge = Array.from({ length: 2500 }, (_, i) => `x${i}`).join("\n");
    const f = lineDiff(huge, huge + "\nmore");
    expect(f.removed + f.added).toBeGreaterThan(0);
  });
  it("shows changes with 2 lines of context and a gap marker", () => {
    const lines = lineDiff(Array.from({ length: 20 }, (_, i) => `l${i}`).join("\n"), Array.from({ length: 20 }, (_, i) => (i === 10 ? "CHANGED" : `l${i}`)).join("\n")).lines;
    const out = diffWithContext(lines, 2);
    expect(out[0]).toEqual({ gap: 8 });
    expect(out.filter((x) => "type" in x && x.type !== "same")).toHaveLength(2);
    expect(out[out.length - 1]).toEqual({ gap: 7 });
  });
});

describe("which version is what", () => {
  const v = (version: number, status: "DRAFT" | "PUBLISHED", lawyerApproved = false) => ({ version, status, lawyerApproved });
  it("fresh page: only version 1", () => {
    const s = deriveLegalState([v(1, "PUBLISHED", true)]);
    expect([s.published?.version, s.approved?.version, s.draft, s.maxVersion]).toEqual([1, 1, null, 1]);
  });
  it("draft waiting on top of the approved text", () => {
    const s = deriveLegalState([v(2, "DRAFT"), v(1, "PUBLISHED", true)]);
    expect([s.published?.version, s.approved?.version, s.draft?.version]).toEqual([1, 1, 2]);
  });
  it("published change: the badge would be 'changed' (published is not the approved one); an older draft is history, not waiting", () => {
    const s = deriveLegalState([v(4, "PUBLISHED"), v(3, "DRAFT"), v(2, "DRAFT"), v(1, "PUBLISHED", true)]);
    expect([s.published?.version, s.approved?.version, s.draft, s.maxVersion]).toEqual([4, 1, null, 4]);
  });
  it("after a restore the newest published row is approved again", () => {
    const s = deriveLegalState([v(5, "PUBLISHED", true), v(4, "PUBLISHED"), v(1, "PUBLISHED", true)]);
    expect([s.published?.version, s.approved?.version]).toEqual([5, 5]);
  });
});
