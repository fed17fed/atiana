/**
 * Task 12.9 prep: the photos that ship with the site (public/real/*.webp) go into the image library (MediaImage),
 * so the admin can pick them in the forms. Pure data + one function; the script is prisma/seed-library-photos.ts.
 * Alt texts are the ones the site uses today (read from the same code files, never copied by hand).
 * Never photos 05 and 18 of the source set (no consent / not confirmed): they are not in public/real/ and not listed here.
 * Rows that exist are never changed (the admin may have edited the alt text). Nothing is deleted.
 */
import { events } from "@/content/events";
import { SITE_TEXT_DEFAULTS } from "@/content/site-texts";
import type { PrismaClient } from "@/lib/generated/prisma/client";

export type LibraryPhoto = { file: string; alt: string };

/** og-share has no editable text key: its alt text is the one in app/layout.tsx (Open Graph image). */
export const OG_SHARE_ALT = "Atiana in white in a forest scene with open hands";

function eventAlt(file: string): string {
  const hit = events.find((e) => e.image === `/real/${file}`);
  if (!hit) throw new Error(`No event uses /real/${file}`);
  return hit.imageAlt;
}

function textAlt(key: string): string {
  const v = SITE_TEXT_DEFAULTS[key];
  if (!v) throw new Error(`Missing site text ${key}`);
  return v;
}

export function libraryPhotos(): LibraryPhoto[] {
  return [
    { file: "hero-home-01.webp", alt: textAlt("home.hero.imageAlt") },
    { file: "teacher-home-01.webp", alt: textAlt("shared.teacher.imageAlt") },
    { file: "about-hero-01.webp", alt: textAlt("about.hero.imageAlt") },
    { file: "card-one-to-one-01.webp", alt: textAlt("home.offers.oneToOne.imageAlt") },
    { file: "card-events-01.webp", alt: textAlt("home.offers.events.imageAlt") },
    { file: "og-share-01.webp", alt: OG_SHARE_ALT },
    { file: "event-full-moon-01.webp", alt: eventAlt("event-full-moon-01.webp") },
    { file: "event-new-moon-01.webp", alt: eventAlt("event-new-moon-01.webp") },
    { file: "event-lunar-eclipse-01.webp", alt: eventAlt("event-lunar-eclipse-01.webp") },
    { file: "event-winter-solstice-01.webp", alt: eventAlt("event-winter-solstice-01.webp") },
  ];
}

/** Files that must never be in the library (source photos 05 and 18). */
export const FORBIDDEN_SOURCE_NUMBERS = ["05", "18"] as const;

export type Measure = (file: string) => Promise<{ width: number; height: number; bytes: number }>;

/** Creates the missing rows only. Returns counts, so a second run can be checked (created 0). */
export async function seedLibraryPhotos(db: Pick<PrismaClient, "mediaImage">, measure: Measure): Promise<{ created: number; unchanged: number }> {
  let created = 0;
  let unchanged = 0;
  for (const p of libraryPhotos()) {
    const url = `/real/${p.file}`;
    const found = await db.mediaImage.findUnique({ where: { url }, select: { id: true } });
    if (found) {
      unchanged++;
      continue;
    }
    const m = await measure(p.file);
    await db.mediaImage.create({ data: { url, alt: p.alt, storage: "local", width: m.width, height: m.height, bytes: m.bytes } });
    created++;
  }
  return { created, unchanged };
}
