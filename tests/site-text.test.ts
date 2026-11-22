import { beforeEach, describe, expect, it, vi } from "vitest";

const loadTextBlocks = vi.fn<() => Promise<Record<string, string> | null>>();
vi.mock("@/lib/site-text-cache", () => ({ loadTextBlocks: () => loadTextBlocks(), TEXTS_TAG: "site-texts" }));

import { TEXTS_TAG, getText, getTexts, resolveText } from "@/lib/site-text";

beforeEach(() => {
  loadTextBlocks.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getText (task 12.5)", () => {
  it("empty table -> code default", async () => {
    loadTextBlocks.mockResolvedValue({});
    expect(await getText("home.hero.title", "Come home to your *own light.*")).toBe("Come home to your *own light.*");
  });
  it("DB row -> DB text (admin edit)", async () => {
    loadTextBlocks.mockResolvedValue({ "home.hero.title": "New title" });
    expect(await getText("home.hero.title", "Old")).toBe("New title");
  });
  it("loader returns null (it caught a DB error inside the cache) -> default", async () => {
    loadTextBlocks.mockResolvedValue(null);
    await expect(getText("home.hero.title", "Default {{CANCELLATION_HOURS}}")).resolves.toBe("Default 24");
  });
  it("DB error (table missing on live) -> default, no crash, one warning", async () => {
    loadTextBlocks.mockRejectedValue(new Error('relation "ContentBlock" does not exist'));
    await expect(getText("home.hero.title", "Default")).resolves.toBe("Default");
    expect(console.warn).toHaveBeenCalledTimes(1); // the safety net in getText; the loader logs its own error
  });
  it("no DATABASE_URL (throws synchronously inside the loader) -> default", async () => {
    loadTextBlocks.mockImplementation(() => {
      throw new Error("DATABASE_URL is not set");
    });
    await expect(getText("k", "Default")).resolves.toBe("Default");
  });
  it("fills rule tokens in the DB text and in the default", async () => {
    loadTextBlocks.mockResolvedValue({ a: "Cancel up to {{CANCELLATION_HOURS}} hours before." });
    expect(await getText("a", "x")).toBe("Cancel up to 24 hours before.");
    expect(await getText("b", "Join {{JOIN_EARLY_MINUTES}} minutes early. Reminder {{REMINDER_HOURS}}h. Hold {{HOLD_MINUTES}}. Credit {{CANCEL_CREDIT_VALID_WEEKS}} weeks. Refund {{EVENT_REFUND_DAYS}} days.")).toBe(
      "Join 5 minutes early. Reminder 24h. Hold 30. Credit 10 weeks. Refund 7 days.",
    );
  });
  it("a DB text with an unknown token is ignored: the default is shown, never raw braces", async () => {
    loadTextBlocks.mockResolvedValue({ a: "Hello {{NOT_A_TOKEN}}" });
    expect(await getText("a", "Default")).toBe("Default");
  });
  it("an empty or spaces-only DB value -> default", async () => {
    loadTextBlocks.mockResolvedValue({ a: "   ", b: "" });
    expect(await getText("a", "A")).toBe("A");
    expect(await getText("b", "B")).toBe("B");
  });
  it("unknown key without any default -> empty string, no crash", async () => {
    loadTextBlocks.mockResolvedValue({});
    expect(await getText("no.such.key")).toBe("");
  });
  it("a key named like an object property is not read from the prototype", async () => {
    loadTextBlocks.mockResolvedValue({});
    expect(await getText("constructor", "D")).toBe("D");
    expect(await getText("__proto__", "D")).toBe("D");
  });
  it("getTexts reads the cache once for many keys", async () => {
    loadTextBlocks.mockResolvedValue({ one: "ONE" });
    expect(await getTexts({ one: "1", two: "2 {{CANCELLATION_HOURS}}" })).toEqual({ one: "ONE", two: "2 24" });
    expect(loadTextBlocks).toHaveBeenCalledTimes(1);
  });
  it("resolveText is pure and the cache tag name is fixed", () => {
    expect(resolveText(undefined, "d")).toBe("d");
    expect(resolveText(null, "d")).toBe("d");
    expect(TEXTS_TAG).toBe("site-texts");
  });
});
