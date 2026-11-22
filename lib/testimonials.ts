/**
 * Testimonials on the Home page (task 12.11): rows from the database, or the code list when the table is empty
 * or cannot be read (the live site must never break). Pure helpers here; the cached read is in testimonials-cache.ts.
 */
import { testimonials as codeTestimonials } from "@/content/home";

export type PublicTestimonial = { key: string; quote: string; who: string; isDemo: boolean };

type Row = { id: string; name: string; place: string | null; text: string; isDemo: boolean };

export function whoLabel(name: string, place: string | null): string {
  return place ? `${name}, ${place}` : name;
}

/** "Maeve, Dublin" -> { name: "Maeve", place: "Dublin" } (used by the seed). */
export function splitWho(who: string): { name: string; place: string | null } {
  const i = who.indexOf(",");
  if (i < 0) return { name: who.trim(), place: null };
  return { name: who.slice(0, i).trim(), place: who.slice(i + 1).trim() || null };
}

/** The 3 code reviews: always labelled "Demo review". */
export function defaultTestimonials(): PublicTestimonial[] {
  return codeTestimonials.map((t) => ({ key: `default-${t.who}`, quote: t.quote, who: t.who, isDemo: true }));
}

/**
 * rows === null: database could not be read -> code list.
 * rows empty: nothing saved yet -> code list.
 * rows given (already filtered to "Show on site", sorted): show exactly these. If the admin hid all of them, the section shows none.
 */
export function pickTestimonials(rows: Row[] | null, anySaved: boolean): PublicTestimonial[] {
  if (rows === null || !anySaved) return defaultTestimonials();
  return rows.map((r) => ({ key: r.id, quote: r.text, who: whoLabel(r.name, r.place), isDemo: r.isDemo }));
}
