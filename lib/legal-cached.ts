import { loadLegalDoc, type LegalDoc } from "./legal";

/** Cached wrapper for pages: the MDX files only change with a new deploy, so they are read once at build time. */
export async function getLegalDoc(slug: string): Promise<LegalDoc | null> {
  "use cache";
  return loadLegalDoc(slug);
}
