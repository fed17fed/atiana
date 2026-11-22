import type { MetadataRoute } from "next";
import { loadPublicOfferings } from "@/lib/offerings-cache";
import { buildSitemapPaths, getSiteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  // Event pages: published events from the database (admin), or the code events when the database cannot be read or is empty.
  const { events } = await loadPublicOfferings();
  return buildSitemapPaths(events.map((e) => e.slug)).map((path) => ({
    url: path === "/" ? siteUrl : `${siteUrl}${path}`,
    changeFrequency: path.startsWith("/legal") ? "yearly" : "monthly",
    priority: path === "/" ? 1 : path.startsWith("/legal") ? 0.3 : 0.7,
  }));
}
