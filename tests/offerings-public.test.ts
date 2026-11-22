/** Task 12.8: public offerings (DB rows vs code fallback), seed texts, seed decisions, event slug guard, sitemap. No database. */
import { describe, expect, it } from "vitest";
import { classTypes, oneToOneOfferings } from "@/content/catalog";
import { events } from "@/content/events";
import { longTextToMarkdown } from "@/content/session-texts";
import { JOIN_EARLY_MINUTES } from "@/lib/booking-rules";
import { eventSlugExists } from "@/lib/offerings-lookup";
import {
  chooseList,
  classFromRow,
  codeClassList,
  codeEventList,
  codeOfferings,
  codeOneToOneList,
  eventFromRow,
  oneToOneFromRow,
  pickEventSession,
  upcomingEvents,
  type OfferingRow,
} from "@/lib/offerings-public";
import { guardEventSlug, guardEventSlugLookup } from "@/lib/route-guard";
import { seedAction } from "@/lib/seed-offerings";
import { buildSitemapPaths, sitemapPaths } from "@/lib/site";
import { textProblems } from "@/lib/offerings-schema";
import { findTokens } from "@/lib/text-tokens";

const row = (o: Partial<OfferingRow> = {}): OfferingRow => ({
  slug: "x",
  type: "EVENT",
  title: "T",
  summary: "S",
  body: "B",
  image: null,
  imageAlt: null,
  mode: "ONLINE",
  location: null,
  eventPricing: "PAID",
  level: null,
  minutes: null,
  lengthLabel: null,
  activationAfterMinutes: null,
  adminEditedAt: null,
  priceOptions: [{ amountCents: 3000 }],
  sessions: [],
  ...o,
});
const NOW = new Date("2026-11-21T12:00:00Z");

describe("seed texts keep rule TOKENS (F-2), not the filled number", () => {
  const all = [...classTypes.map((c) => ({ n: c.slug, long: c.long })), ...events.map((e) => ({ n: e.slug, long: e.long }))];
  it("every long text, as the seed saves it, has {{JOIN_EARLY_MINUTES}} and no filled join number", () => {
    for (const { n, long } of all) {
      const md = longTextToMarkdown(long);
      expect(findTokens(md), n).toContain("JOIN_EARLY_MINUTES");
      expect(md, n).not.toMatch(new RegExp(String.raw`join[^.]{0,60}\b${JOIN_EARLY_MINUTES} minutes before`, "i"));
    }
  });
  it("the seeded texts pass the admin save check (so an admin can save them unchanged)", () => {
    for (const { n, long } of all) expect(textProblems(longTextToMarkdown(long)), n).toEqual([]);
    for (const c of classTypes) expect(textProblems(c.text), c.slug).toEqual([]);
    for (const e of events) expect(textProblems(e.summary), e.slug).toEqual([]);
    for (const o of oneToOneOfferings) expect(textProblems(o.summary), o.slug).toEqual([]);
  });
  it("the public code fallback shows the number (no token left on the page)", () => {
    for (const x of [...codeClassList().map((c) => c.body), ...codeEventList().map((e) => e.body)]) {
      expect(x).not.toContain("{{");
      expect(x).toMatch(new RegExp(`${JOIN_EARLY_MINUTES} minutes before`));
    }
  });
  it("in-person 1:1 says 'arrive on time' (owner Q3), no '5 minutes early'", () => {
    const person = oneToOneOfferings.find((o) => o.mode === "IN_PERSON")!;
    expect(person.summary).toMatch(/arrive on time/);
    expect(person.summary).not.toMatch(/minutes early/);
  });
  it("1:1 default text = the longer text of the page (F-8)", () => {
    const online = oneToOneOfferings.find((o) => o.mode === "ONLINE")!;
    expect(online.summary).toContain("You get a short summary by email if you wish.");
  });
});

describe("DB or code (the live site must never break)", () => {
  it("database empty for a kind -> code content; database has rows -> database only", () => {
    expect(chooseList([], 0, codeClassList).source).toBe("code");
    expect(chooseList([], 0, codeClassList).list).toHaveLength(classTypes.length);
    const hiddenAll = chooseList([], 4, codeClassList);
    expect(hiddenAll).toEqual({ list: [], source: "db" }); // the admin hid every class: none shown
    expect(chooseList([classFromRow(row({ type: "GROUP_CLASS", slug: "new" }))], 1, codeClassList).list).toHaveLength(1);
  });
  it("code fallback has the same slugs as the code files", () => {
    const c = codeOfferings();
    expect(c.classes.map((x) => x.slug)).toEqual(classTypes.map((x) => x.slug));
    expect(c.oneToOne.map((x) => x.slug)).toEqual(oneToOneOfferings.map((x) => x.slug));
    expect(c.events.map((x) => x.slug)).toEqual(events.map((x) => x.slug));
    expect(c.source).toEqual({ classes: "code", oneToOne: "code", events: "code" });
    expect(codeOneToOneList()[0].summary).toBe(oneToOneOfferings[0].summary);
  });
});

describe("rows -> public items", () => {
  it("fills tokens from lib/booking-rules.ts in summary and body", () => {
    const c = classFromRow(row({ type: "GROUP_CLASS", summary: "Join {{JOIN_EARLY_MINUTES}} minutes before.", body: "Cancel {{CANCELLATION_HOURS}} hours before.", minutes: 30, level: "All levels" }));
    expect(c.summary).toBe(`Join ${JOIN_EARLY_MINUTES} minutes before.`);
    expect(c.body).toMatch(/Cancel \d+ hours before/);
    expect(c.body).not.toContain("{{");
  });
  it("a DB text with an unknown token falls back to the code text (or stays plain), never shows a broken page", () => {
    const c = classFromRow(row({ type: "GROUP_CLASS", slug: classTypes[0].slug, body: "Hi {{NOPE}}" }));
    expect(c.body).toContain("Hi {{NOPE}}"); // not filled; the admin save check prevents this state
  });
  it("an edited class keeps what the admin wrote: empty greeting = no greeting", () => {
    const def = classTypes.find((c) => c.activationAfterMinutes)!;
    expect(classFromRow(row({ type: "GROUP_CLASS", slug: def.slug, adminEditedAt: new Date(), activationAfterMinutes: null })).activationAfterMinutes).toBeNull();
    expect(classFromRow(row({ type: "GROUP_CLASS", slug: def.slug, adminEditedAt: null, activationAfterMinutes: null })).activationAfterMinutes).toBe(def.activationAfterMinutes);
  });
  it("price comes from the cheapest price option", () => {
    expect(classFromRow(row({ type: "GROUP_CLASS", priceOptions: [{ amountCents: 0 }] })).priceCents).toBe(0);
    expect(oneToOneFromRow(row({ type: "ONE_TO_ONE", priceOptions: [{ amountCents: 7000 }], minutes: 50 })).priceCents).toBe(7000);
  });
  it("an event made in the admin: image, alt, no session yet", () => {
    const e = eventFromRow(row({ slug: "my-new-event", adminEditedAt: new Date(), image: "/uploads/20261121-0123456789ab.webp", imageAlt: "A moon", minutes: 45 }), NOW);
    expect(e).toMatchObject({ slug: "my-new-event", image: "/uploads/20261121-0123456789ab.webp", imageAlt: "A moon", session: null, lengthLabel: "45 min", priceCents: 3000 });
  });
  it("an edited event without an image shows no image (the code image does not come back)", () => {
    const slug = events[0].slug;
    expect(eventFromRow(row({ slug, adminEditedAt: new Date(), image: null }), NOW).image).toBeNull();
    expect(eventFromRow(row({ slug, adminEditedAt: null, image: null }), NOW).image).toBe(events[0].image);
    expect(eventFromRow(row({ slug, image: events[0].image, imageAlt: null }), NOW).imageAlt).toBe(events[0].imageAlt);
  });
  it("event session: next upcoming scheduled, else the latest, else none", () => {
    const s = (iso: string, status = "SCHEDULED") => ({ startsAt: new Date(iso), endsAt: new Date(new Date(iso).getTime() + 3600_000), capacity: 8, status });
    expect(pickEventSession([], NOW)).toBeNull();
    expect(pickEventSession([s("2026-12-10T20:00:00Z"), s("2026-11-25T20:00:00Z"), s("2026-11-01T20:00:00Z")], NOW)?.startsAt).toBe("2026-11-25T20:00:00.000Z");
    expect(pickEventSession([s("2026-11-01T20:00:00Z"), s("2026-11-02T20:00:00Z")], NOW)?.startsAt).toBe("2026-11-02T20:00:00.000Z");
    expect(pickEventSession([s("2026-11-25T20:00:00Z", "CANCELLED")], NOW)?.cancelled).toBe(true);
  });
  it("Events page: upcoming only, no date = not listed, filter by pricing, earliest first", () => {
    const mk = (slug: string, start: string | null, pricing: "FREE" | "PAID" = "PAID") =>
      eventFromRow(row({ slug, eventPricing: pricing, sessions: start ? [{ startsAt: new Date(start), endsAt: new Date(start), capacity: 8, status: "SCHEDULED" }] : [] }), NOW);
    const list = [mk("b", "2026-12-20T20:00:00Z"), mk("a", "2026-11-30T20:00:00Z"), mk("none", null), mk("past", "2026-11-01T20:00:00Z"), mk("free", "2027-01-01T20:00:00Z", "FREE")];
    expect(upcomingEvents(list, undefined, NOW).map((e) => e.slug)).toEqual(["a", "b", "free"]);
    expect(upcomingEvents(list, "FREE", NOW).map((e) => e.slug)).toEqual(["free"]);
  });
});

describe("seed decisions (owner Q6): never overwrite an admin edit", () => {
  const wanted = { title: "T", summary: "S", published: true, minutes: 30, location: null };
  it("create / skip / unchanged / update", () => {
    expect(seedAction(null, wanted)).toBe("create");
    expect(seedAction({ ...wanted, adminEditedAt: new Date() }, wanted)).toBe("skip-edited");
    expect(seedAction({ ...wanted, title: "Other", adminEditedAt: new Date() }, wanted)).toBe("skip-edited");
    expect(seedAction({ ...wanted, adminEditedAt: null }, wanted)).toBe("unchanged");
    expect(seedAction({ ...wanted, summary: "Old text with 5 minutes early", adminEditedAt: null }, wanted)).toBe("update");
    expect(seedAction({ ...wanted, location: undefined, adminEditedAt: null }, wanted)).toBe("unchanged"); // null equals missing
  });
});

describe("event page exists? (proxy.ts, real 404)", () => {
  const codeSlugs = events.map((e) => e.slug);
  const fakeDb = (rows: { slug: string; published: boolean }[]) =>
    ({
      offering: {
        findFirst: async ({ where }: { where: { slug: string; published: boolean } }) => (rows.find((r) => r.slug === where.slug && r.published) ? { id: "1", adminEditedAt: null } : null),
        count: async () => rows.length,
      },
    }) as never;
  it("an event made in the admin is reachable; a hidden or unknown one is a 404", async () => {
    const db = fakeDb([{ slug: "new-one", published: true }, { slug: "hidden-one", published: false }]);
    expect(await eventSlugExists(db, "new-one", codeSlugs)).toBe(true);
    expect(await eventSlugExists(db, "hidden-one", codeSlugs)).toBe(false);
    expect(await eventSlugExists(db, codeSlugs[0], codeSlugs)).toBe(false); // the database is the master once it has events
  });
  it("empty database -> the code events", async () => {
    expect(await eventSlugExists(fakeDb([]), codeSlugs[0], codeSlugs)).toBe(true);
    expect(await eventSlugExists(fakeDb([]), "nope", codeSlugs)).toBe(false);
  });
  it("guardEventSlugLookup: DB answer wins; DB error -> code slugs (same as before)", async () => {
    expect(await guardEventSlugLookup("/events/new-one", async () => true, codeSlugs)).toEqual({ action: "next" });
    expect(await guardEventSlugLookup("/events/new-one", async () => false, codeSlugs)).toEqual({ action: "not-found" });
    const boom = async () => {
      throw new Error("db down");
    };
    expect(await guardEventSlugLookup(`/events/${codeSlugs[0]}`, boom, codeSlugs)).toEqual({ action: "next" });
    expect(await guardEventSlugLookup("/events/new-one", boom, codeSlugs)).toEqual({ action: "not-found" });
    expect(await guardEventSlugLookup("/events/%E0%A4%A", async () => true, codeSlugs)).toEqual({ action: "not-found" });
    expect(await guardEventSlugLookup("/events", boom, codeSlugs)).toEqual({ action: "next" });
    expect(await guardEventSlugLookup(`/events/${codeSlugs[0]}/calendar.ics`, boom, codeSlugs)).toEqual(guardEventSlug(`/events/${codeSlugs[0]}/calendar.ics`, codeSlugs));
  });
});

describe("sitemap", () => {
  it("event pages come from the given slugs; the code list stays the fallback", () => {
    const p = buildSitemapPaths(["a-new-event"]);
    expect(p).toContain("/events/a-new-event");
    expect(p).not.toContain(`/events/${events[0].slug}`);
    expect(p.filter((x) => x.startsWith("/legal/"))).toHaveLength(5);
    expect(sitemapPaths).toEqual(buildSitemapPaths(events.map((e) => e.slug)));
  });
});

describe("rule check (lib/text-tokens.ts): 'hold the space' is a session length, a seat hold is still caught", () => {
  it("allows the Lunar Eclipse sentence and still blocks a real hold rule", () => {
    expect(textProblems("I will hold the space for you for the duration of 60 minutes.")).toEqual([]);
    expect(textProblems("We hold your seat for 30 minutes.")).not.toEqual([]);
  });
});
