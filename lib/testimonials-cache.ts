import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "./prisma";
import { pickTestimonials, type PublicTestimonial } from "./testimonials";

/** Cache tag. The admin actions call updateTag with it, so a change shows on the Home page at once. */
export const TESTIMONIALS_TAG = "testimonials";

/**
 * Reads the shown reviews for the Home page. Same pattern as site-text-cache.ts: the error is caught INSIDE the cache scope
 * (an error thrown out of a "use cache" function would fail `next build`), a failure is cached only 30 seconds.
 */
export async function loadHomeTestimonials(): Promise<PublicTestimonial[]> {
  "use cache";
  cacheTag(TESTIMONIALS_TAG);
  try {
    const total = await prisma.testimonial.count();
    const rows = await prisma.testimonial.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 12,
      select: { id: true, name: true, place: true, text: true, isDemo: true },
    });
    cacheLife("minutes");
    return pickTestimonials(rows, total > 0);
  } catch (error) {
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    console.warn("[testimonials] database read failed, using the code list:", error instanceof Error ? error.message.split("\n").pop() : error);
    return pickTestimonials(null, false);
  }
}
