import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CANCEL_CREDIT_VALID_DAYS, CANCEL_CREDIT_VALID_WEEKS } from "@/lib/booking-rules";
import { ALL_TOKENS, RULE_TOKENS, SITE_TOKENS, fillTokens, findHardCodedRules, findTokens, validateText, validateTokens } from "@/lib/text-tokens";

const root = process.cwd();

describe("rule tokens (task 12.5)", () => {
  it("has exactly the 6 rule tokens of the inventory, with the values of booking-rules.ts", () => {
    expect(RULE_TOKENS).toEqual({
      CANCELLATION_HOURS: "24",
      EVENT_REFUND_DAYS: "7",
      JOIN_EARLY_MINUTES: "5",
      REMINDER_HOURS: "24",
      HOLD_MINUTES: "30",
      CANCEL_CREDIT_VALID_WEEKS: "10",
    });
    expect(CANCEL_CREDIT_VALID_WEEKS * 7).toBe(CANCEL_CREDIT_VALID_DAYS);
  });
  it("site tokens come from lib/company.ts (owner answer Q4): the placeholders the site shows today", () => {
    expect(SITE_TOKENS).toEqual({
      CONTACT_EMAIL: "[CONTACT EMAIL]",
      COMPANY_NAME: "[COMPANY NAME]",
      COMPANY_ADDRESS: "[ADDRESS]",
      CRO_NUMBER: "[CRO NUMBER]",
    });
    expect(Object.keys(ALL_TOKENS)).toContain("CONTACT_EMAIL");
    expect(validateText("Write to {{CONTACT_EMAIL}}")).toEqual([]);
    expect(fillTokens("Write to {{CONTACT_EMAIL}}.")).toBe("Write to [CONTACT EMAIL].");
    expect(validateText("Write to {{CONTACT_MAIL}}").map((p) => p.code)).toEqual(["UNKNOWN_TOKEN"]);
  });
  it("fills known tokens, also with spaces and repeats", () => {
    expect(fillTokens("Cancel up to {{CANCELLATION_HOURS}} hours. Join {{ JOIN_EARLY_MINUTES }} min early. {{CANCELLATION_HOURS}}!")).toBe(
      "Cancel up to 24 hours. Join 5 min early. 24!",
    );
  });
  it("leaves unknown tokens unchanged when filling (the save check blocks them earlier)", () => {
    expect(fillTokens("a {{NOPE}} b")).toBe("a {{NOPE}} b");
  });
  it("does not treat object prototype names as tokens", () => {
    expect(validateTokens("{{constructor}} {{toString}} {{__proto__}}")).toHaveLength(3);
    expect(fillTokens("{{constructor}}")).toBe("{{constructor}}");
  });
  it("findTokens lists names", () => {
    expect(findTokens("{{A}} x {{ B_1 }} {{}}")).toEqual(["A", "B_1", ""]);
  });
});

describe("save validator: tokens", () => {
  it("accepts known tokens", () => {
    expect(validateText("You can cancel up to {{CANCELLATION_HOURS}} hours before.")).toEqual([]);
  });
  it("blocks an unknown token and names it", () => {
    const p = validateText("Join {{JOIN_LATE_MINUTES}} minutes after");
    expect(p[0]).toMatchObject({ code: "UNKNOWN_TOKEN", match: "{{JOIN_LATE_MINUTES}}" });
  });
  it("blocks an empty token and broken braces", () => {
    expect(validateText("a {{}} b").map((p) => p.code)).toContain("UNKNOWN_TOKEN");
    expect(validateText("a {{CANCELLATION_HOURS b").map((p) => p.code)).toContain("BROKEN_TOKEN");
    expect(validateText("a CANCELLATION_HOURS}} b").map((p) => p.code)).toContain("BROKEN_TOKEN");
  });
});

describe("save validator: rule PHRASES, not bare numbers (finding F-3)", () => {
  const blocked = [
    "Cancel up to 24 hours before the class.",
    "24 hours or more before the class starts, your credit goes back.",
    "Less than 24 hours before the class starts we do not return the credit.",
    "You can move your session up to 48 hours before.",
    "We send a reminder 24 hours before the class.",
    "Paid events are refunded 7 days before the start.",
    "Please join 5 minutes before the start.",
    "Please arrive 10 minutes early.",
    "We hold your seat for 30 minutes while you pay.",
    "Your credit is valid for 10 weeks.",
    "Credits valid 16 weeks.",
    "Cancel up to 12 hours before.", // another number is also a hard-coded rule
    "The cancellation deadline is 24 hours.",
  ];
  it.each(blocked)("blocks: %s", (text) => {
    const p = validateText(text);
    expect(p.length, text).toBeGreaterThan(0);
    expect(p.every((x) => x.code === "HARD_CODED_RULE")).toBe(true);
  });
  it("tells which token to use", () => {
    expect(findHardCodedRules("Please join 5 minutes before the start.")[0].message).toContain("{{JOIN_EARLY_MINUTES}}");
    expect(findHardCodedRules("Cancel up to 24 hours before.")[0].message).toContain("{{CANCELLATION_HOURS}}");
    expect(findHardCodedRules("valid for 10 weeks")[0].message).toContain("{{CANCEL_CREDIT_VALID_WEEKS}}");
  });

  const allowed = [
    "Please wait 2 hours after lunch or 30 minutes after a snack.", // 30 = HOLD_MINUTES value, still fine
    "Eat 30 minutes after a snack at the earliest.",
    "You have a 14-day withdrawal right.",
    "Within 14 days you may withdraw.",
    "In an emergency call 112 or 999.",
    "You must be 18 or older. Under 16 needs a parent.",
    "We keep records for 6 years.",
    "Allow 30 minutes for this session.",
    "A 60 minute session with a mat. Allow 60 minutes.",
    "Dive Deep takes 1.5 hours. The first 30 minutes are a greeting.",
    "The main activation starts 15 minutes after the start.",
    "The next three months bring change.",
    "1 class credit, 5 sessions, €0.",
    "Cancel up to {{CANCELLATION_HOURS}} hours before. Join {{JOIN_EARLY_MINUTES}} minutes early.",
    "We hold your seat for {{HOLD_MINUTES}} minutes. Valid for {{CANCEL_CREDIT_VALID_WEEKS}} weeks.",
    "Refund {{EVENT_REFUND_DAYS}} days before. Reminder {{REMINDER_HOURS}} hours before.",
    "Cancel. It lasts 90 minutes.", // sentence break: "Cancel" and the number are not one phrase
  ];
  it.each(allowed)("allows: %s", (text) => {
    expect(validateText(text), text).toEqual([]);
  });
});

describe("save validator on the real lawyer-approved legal files", () => {
  const read = (f: string) => readFileSync(join(root, `content/legal/${f}.mdx`), "utf8");
  it("finds the plain rule numbers of booking-cancellation (finding F-1: 24 h x5, 10 weeks x2, 30 min hold, 5 min, 7 days)", () => {
    const text = read("booking-cancellation");
    const found = findHardCodedRules(text).map((p) => p.match);
    expect(found.join(" | ")).toMatch(/24 hours/);
    expect(found.join(" | ")).toMatch(/hold your seat for 30 minutes/);
    expect(found.join(" | ")).toMatch(/join 5 minutes/);
    expect(found.join(" | ")).toMatch(/10 weeks/);
    expect(found.join(" | ")).toMatch(/7 days/);
    expect(found.length).toBeGreaterThanOrEqual(8);
  });
  it("does NOT flag the plain numbers that are correct (14-day, 2 hours, 112/999, 18, 16, 6 years)", () => {
    for (const f of ["privacy", "cookies", "health-disclaimer"]) expect(findHardCodedRules(read(f)), f).toEqual([]);
    const terms = findHardCodedRules(read("terms")).map((p) => p.match);
    expect(terms.join(" | ")).toMatch(/join 5 minutes|5 minutes/); // the one real rule number in terms (l.34)
    expect(terms.join(" | ")).not.toMatch(/14|18|16/);
  });
  it("after replacing the numbers by tokens the same files pass the check (this is what 12.13 will import)", () => {
    const tokenise = (t: string) =>
      t
        .replace(/\b24 hours\b/g, "{{CANCELLATION_HOURS}} hours")
        .replace(/\b10 weeks\b/g, "{{CANCEL_CREDIT_VALID_WEEKS}} weeks")
        .replace(/\b30 minutes\b/g, "{{HOLD_MINUTES}} minutes")
        .replace(/\b5 minutes\b/g, "{{JOIN_EARLY_MINUTES}} minutes")
        .replace(/\b7 days\b/g, "{{EVENT_REFUND_DAYS}} days");
    for (const f of ["booking-cancellation", "terms"]) {
      const t = tokenise(read(f));
      const problems = validateText(t).filter((p) => !/16 weeks|CONTACT|LAST_UPDATED/.test(p.match));
      expect(problems, f).toEqual([]);
    }
  });
});
