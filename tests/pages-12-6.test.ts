/**
 * Task 12.6: Home, About and FAQ read their texts from keys (getText) with code defaults.
 * 1. With an EMPTY text table the three pages show exactly the same texts, alt texts, links and JSON-LD as BEFORE the change
 *    (fixture captured from the production build before 12.6) - and the same <title> / description / Open Graph texts.
 * 2. A text edited in the database shows on the page; a broken text (unknown token) falls back to the default.
 * 3. The default texts contain no hard-coded booking-rule number.
 */
import { createElement as h, type ReactElement } from "react";
import { prerender } from "react-dom/static";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadTextBlocks = vi.fn<() => Promise<Record<string, string> | null>>();
vi.mock("@/lib/site-text-cache", () => ({ loadTextBlocks: () => loadTextBlocks(), TEXTS_TAG: "site-texts" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) => h("a", { href, ...rest }, children as never),
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => h("img", { src, alt }),
}));
vi.mock("@/components/pages/HomeNewsletterBand", () => ({ HomeNewsletterBand: () => h("div") }));
vi.mock("@/components/pages/HomeTestimonials", () => ({ HomeTestimonials: () => null }));

import Home, { generateMetadata as homeMeta } from "@/app/page";
import AboutPage, { generateMetadata as aboutMeta } from "@/app/about/page";
import FaqPage, { generateMetadata as faqMeta } from "@/app/faq/page";
import { SITE_TEXT_DEFAULTS } from "@/content/site-texts";
import { findHardCodedRules } from "@/lib/text-tokens";
import { htmlTokens } from "./support/html-tokens";
import fixture from "./fixtures/pages-before-12-6.json";

async function render(el: ReactElement): Promise<string> {
  const { prelude } = await prerender(el);
  return new Response(prelude).text();
}
const pages = {
  home: { Page: Home, meta: homeMeta },
  about: { Page: AboutPage, meta: aboutMeta },
  faq: { Page: FaqPage, meta: faqMeta },
} as const;
type Name = keyof typeof pages;

async function tokensOf(name: Name) {
  const html = await render(h("main", null, await pages[name].Page()));
  return htmlTokens(html);
}

beforeEach(() => {
  loadTextBlocks.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

/**
 * Step 2 of 12.6 changed exactly two FAQ answers on purpose (owner decisions Q1 and Q2). The "before" fixture is NOT edited;
 * these are the only differences the test accepts: old text -> new text (numbers as filled from lib/booking-rules.ts).
 */
const NEW_CANCEL =
  'Yes. In "My bookings" you can cancel up to 24 hours before the class starts. If you used a credit, it goes back to your account (an expired credit is not returned). If you paid for a single class by card, you choose: 1 class credit, valid for 10 weeks, or your money back to your card. A free class can be cancelled any time before it starts.';
const NEW_MOVE =
  'No, there is no "move" button. To change the time, cancel your 1:1 session in "My bookings" and book a new time. The cancel rules are the same as for group classes: up to 24 hours before the start you get your credit back or, if you paid by card, you choose 1 credit or your money back. Later than that, there is no credit and no refund.';
const OLD_CANCEL =
  'Yes. Cancel up to 24 hours before the class and you get your credit back. If you paid by card, you also get a credit. A free class can be cancelled any time before it starts.';
const OLD_NOTE = ' [OWNER: confirm "credit back" also for single paid classes]';
const OLD_MOVE = 'Yes, up to 24 hours before. Use "My bookings" or write to us.';
const OLD_KEA = 'We will email you. You get your credit back, or you can move to another class.';
const NEW_KEA = 'We will email you. If you used a credit, you get your credit back. If you paid by card, you get your money back.';
const json = (x: string) => JSON.stringify(x).slice(1, -1);
function expectedAfterStep2(tokens: string[]): string[] {
  return tokens.map((t) => {
    if (t.startsWith("ld:")) {
      return t.split(json(OLD_CANCEL)).join(json(NEW_CANCEL)).split(json(OLD_MOVE)).join(json(NEW_MOVE)).split(OLD_KEA).join(NEW_KEA);
    }
    return t.split(OLD_CANCEL + OLD_NOTE).join(NEW_CANCEL).split(OLD_MOVE).join(NEW_MOVE).split(OLD_KEA).join(NEW_KEA);
  });
}

describe("empty text table = same pages as before (task 12.6)", () => {
  for (const name of ["home", "about", "faq"] as const) {
    it(`/${name === "home" ? "" : name}: texts, alt texts, links and JSON-LD are the same as before`, async () => {
      loadTextBlocks.mockResolvedValue({});
      const now = await tokensOf(name);
      expect(now).toEqual(expectedAfterStep2(fixture[name].tokens));
    });
    it(`/${name === "home" ? "" : name}: title and description are the same as before`, async () => {
      loadTextBlocks.mockResolvedValue({});
      const m = await pages[name].meta();
      const title = typeof m.title === "string" ? m.title : (m.title as { absolute: string }).absolute;
      expect({
        title: name === "home" ? title : `${title} | KEA by Atiana`,
        description: m.description,
        ogTitle: m.openGraph?.title,
        // Next.js fills og:description from the description when a page gives none.
        ogDescription: (m.openGraph as { description?: string } | undefined)?.description ?? m.description,
      }).toEqual(fixture[name].head);
    });
    it(`/${name === "home" ? "" : name}: database error or missing table = same page, no crash`, async () => {
      loadTextBlocks.mockRejectedValue(new Error('relation "ContentBlock" does not exist'));
      expect(await tokensOf(name)).toEqual(expectedAfterStep2(fixture[name].tokens));
    });
  }
});

describe("edited texts (task 12.6)", () => {
  it("a database text replaces the default, with *italic* and rule tokens", async () => {
    loadTextBlocks.mockResolvedValue({
      "home.hero.title": "A new *title*",
      "home.hero.trust.cancel": "Cancel up to {{CANCELLATION_HOURS}} hours before",
    });
    const html = await render(h("main", null, await Home()));
    expect(html).toContain("A new <em>title</em>");
    expect(html).toContain("Cancel up to 24 hours before");
    expect(html).not.toContain("Come home to your");
  });
  it("a broken database text (unknown token) shows the default, never raw braces", async () => {
    loadTextBlocks.mockResolvedValue({ "about.hero.lead": "Hello {{NOT_A_TOKEN}}" });
    const html = await render(h("main", null, await AboutPage()));
    expect(html).not.toContain("{{");
    expect(html).toContain("A small, friendly space for breath, energy and stillness.");
  });
  it("an edited FAQ answer shows on the page and in the JSON-LD (without marks)", async () => {
    loadTextBlocks.mockResolvedValue({ "faq.classesZoom.experience.a": "Beginners are welcome. See the [schedule](/schedule)." });
    const html = await render(h("main", null, await FaqPage()));
    expect(html).toContain('<a href="/schedule">schedule</a>');
    expect(html).toContain("Beginners are welcome. See the schedule.");
  });
  it("an unsafe link in a text is shown as plain words, not as a link", async () => {
    loadTextBlocks.mockResolvedValue({ "faq.page.lead": "Please [click](javascript:alert(1)) or [x](//evil.example)" });
    const html = (await render(h("main", null, await FaqPage()))).replace(/<!-- -->/g, "");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("evil.example");
    expect(html).toContain("Please click or x");
  });
  it("an Instagram address that is not https falls back to the default address", async () => {
    loadTextBlocks.mockResolvedValue({ "shared.teacher.instagramUrl": "javascript:alert(1)" });
    const html = await render(h("main", null, await AboutPage()));
    expect(html).not.toContain("javascript:");
    expect(html).toContain("https://www.instagram.com/kundalini_by_atiana/");
  });
});

describe("no hard-coded rule numbers in the Home / About / FAQ defaults (task 12.6)", () => {
  // Pack data of the hidden packs (finding F-6, owner Q6: "keep as it is"): validity is a pack field, not a booking rule.
  const hiddenPackKeys = ["faq.credits.howLong.a", "faq.credits.whatIsPack.a"];
  it("rule phrases in the defaults use tokens", () => {
    const bad = Object.entries(SITE_TEXT_DEFAULTS)
      .filter(([k]) => !hiddenPackKeys.includes(k))
      .flatMap(([k, v]) => findHardCodedRules(v).map((p) => `${k}: ${p.match}`));
    expect(bad).toEqual([]);
  });
  it("the same plain numbers appear only in the two hidden-pack answers", () => {
    const hits = Object.entries(SITE_TEXT_DEFAULTS).filter(([, v]) => /\b(24|7|5|30)\b[ -]?(hours?|days?|minutes?|mins?)\b/i.test(v));
    expect(hits).toEqual([]);
  });
});

// Step 2 of task 12.6: the owner's text decisions (plan 14.10, answers 2026-11-21).
describe("owner text decisions in the FAQ defaults (task 12.6, step 2)", () => {
  const d = (k: string) => SITE_TEXT_DEFAULTS[k];
  it("Q1: card-paid early cancel = the client chooses credit or money back (as the legal page); no [OWNER] note", () => {
    const a = d("faq.booking.cancel.a");
    expect(a).toMatch(/you choose: 1 class credit, valid for \{\{CANCEL_CREDIT_VALID_WEEKS\}\} weeks, or your money back/);
    expect(a).not.toMatch(/you also get a credit/);
    expect(a).not.toMatch(/\[OWNER/);
  });
  it("Q2: no move button for 1:1 (as the legal page)", () => {
    expect(d("faq.oneToOne.move.a")).toMatch(/^No, there is no "move" button\. To change the time, cancel/);
    expect(d("faq.oneToOne.move.a")).not.toMatch(/^Yes/);
  });
  it("Q4: the contact answer uses the site token, no typed address", () => {
    expect(d("faq.other.contact.a")).toContain("{{CONTACT_EMAIL}}");
    expect(d("faq.other.contact.a")).not.toMatch(/\[CONTACT EMAIL\]|@/);
  });
  it("F-4: the reminder answer uses REMINDER_HOURS", () => {
    expect(d("faq.classesZoom.zoomLink.a")).toContain("{{REMINDER_HOURS}}");
    expect(d("faq.classesZoom.zoomLink.a")).not.toContain("{{CANCELLATION_HOURS}}");
  });
  it("F-7: no visible [OWNER: ...] note is left in Home, About or FAQ texts", () => {
    expect(Object.entries(SITE_TEXT_DEFAULTS).filter(([, v]) => /\[OWNER/.test(v))).toEqual([]);
  });
  it("Q3: no in-person '5 minutes early' text on Home, About or FAQ (only the online 'join {{JOIN_EARLY_MINUTES}} minutes before the start')", () => {
    const hits = Object.entries(SITE_TEXT_DEFAULTS).filter(([, v]) => /arrive|minutes early/i.test(v));
    expect(hits).toEqual([]);
    expect(d("about.expect.start.text")).toContain("join {{JOIN_EARLY_MINUTES}} minutes before the start");
  });
  it("the 'before' fixture still holds the OLD texts (so the test can see the change)", () => {
    const faq = JSON.stringify(fixture.faq.tokens);
    expect(faq).toContain("you also get a credit");
    expect(faq).toContain("[OWNER: confirm");
  });
  it("the rendered FAQ shows the new texts with the numbers from lib/booking-rules.ts", async () => {
    loadTextBlocks.mockResolvedValue({});
    const html = (await render(h("main", null, await FaqPage()))).replace(/<!-- -->/g, "");
    expect(html).toContain("you choose: 1 class credit, valid for 10 weeks, or your money back to your card");
    expect(html).toContain("We also send a reminder 24 hours before the class.");
    expect(html).toContain("write to [CONTACT EMAIL].");
    expect(html).not.toContain("[OWNER");
  });
});

describe("follow-up decisions (task 12.6)", () => {
  it("FAQ 'cancelled by KEA' matches legal section 8 (credit back, or money back if paid by card); no 'move' promise", () => {
    const a = SITE_TEXT_DEFAULTS["faq.booking.cancelledByKea.a"];
    expect(a).toMatch(/If you used a credit, you get your credit back\. If you paid by card, you get your money back\./);
    expect(a).not.toMatch(/move to another class/);
  });
});
