import type { MetadataRoute } from "next";
import { getSiteUrl, sitemapPaths } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  return sitemapPaths.map((path) => ({
    url: path === "/" ? siteUrl : `${siteUrl}${path}`,
    changeFrequency: path.startsWith("/legal") ? "yearly" : "monthly",
    priority: path === "/" ? 1 : path.startsWith("/legal") ? 0.3 : 0.7,
  }));
}
