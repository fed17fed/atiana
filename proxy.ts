import { NextResponse, type NextRequest } from "next/server";
import { events } from "@/content/events";
import { guardAdminRecord, guardBookClass, guardEventSlugLookup, guardRoute, SESSION_COOKIES } from "@/lib/route-guard";

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/events/")) {
    // Events made in the admin live in the database. If it cannot be read, the code events decide (same as before).
    const g = await guardEventSlugLookup(
      pathname,
      async (slug) => {
        const [{ prisma }, { eventSlugExists }] = await Promise.all([import("@/lib/prisma"), import("@/lib/offerings-lookup")]);
        return eventSlugExists(prisma, slug, events.map((e) => e.slug));
      },
      events.map((e) => e.slug),
    );
    if (g.action === "not-found") {
      return NextResponse.rewrite(new URL("/booking-not-found", req.url));
    }
    return NextResponse.next();
  }
  if (pathname === "/book/class") {
    const g = await guardBookClass(pathname, req.nextUrl.searchParams.get("session"), async (id) => {
      const { prisma } = await import("@/lib/prisma");
      const row = await prisma.classSession.findFirst({
        where: { id, status: "SCHEDULED", startsAt: { gt: new Date() }, offering: { type: "GROUP_CLASS", published: true } },
        select: { id: true },
      });
      return row !== null;
    });
    // Rewrite to a path that does not exist: Next answers with the site's 404 page and status 404.
    if (g.action === "not-found") return NextResponse.rewrite(new URL("/booking-not-found", req.url));
    return NextResponse.next();
  }
  const token = SESSION_COOKIES.map((n) => req.cookies.get(n)?.value).find(Boolean);

  const result = await guardRoute(pathname, token, async (sessionToken) => {
    const { prisma } = await import("@/lib/prisma");
    const s = await prisma.session.findUnique({
      where: { sessionToken },
      select: { expires: true, user: { select: { role: true } } },
    });
    if (!s || s.expires.getTime() <= Date.now()) return null;
    return s.user.role;
  });

  if (result.action === "login") {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(url);
    redirect.headers.set("cache-control", "no-store");
    return redirect;
  }
  if (result.action === "forbidden") {
    return new NextResponse(
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><title>403 – No access</title></head>" +
        "<body style=\"font-family:system-ui;padding:3rem;max-width:40rem;margin:auto\"><main><h1>403 – You do not have access</h1>" +
        "<p>This area is only for the KEA team.</p><p><a href=\"/\">Back to home</a></p></main></body></html>",
      { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } },
    );
  }
  if (result.action === "next" && pathname.startsWith("/admin/")) {
    // Only a checked admin reaches this point. An unknown id / key / slug gets a real 404 (the page would stream a 404 inside a 200).
    const g = await guardAdminRecord(pathname, async (ref) => {
      if (ref.kind === "text") {
        const { getTextEntry } = await import("@/lib/admin/text-registry");
        return getTextEntry(ref.id) !== null;
      }
      if (ref.kind === "legal") {
        const { isLegalSlug } = await import("@/lib/legal");
        return isLegalSlug(ref.id);
      }
      const { prisma } = await import("@/lib/prisma");
      const where = { id: ref.id };
      const select = { id: true };
      if (ref.kind === "offering") return (await prisma.offering.findUnique({ where, select })) !== null;
      if (ref.kind === "session") return (await prisma.classSession.findFirst({ where: { id: ref.id, offering: { type: { in: ["GROUP_CLASS", "EVENT"] } } }, select })) !== null;
      if (ref.kind === "package") return (await prisma.package.findUnique({ where, select })) !== null;
      return (await prisma.testimonial.findUnique({ where, select })) !== null;
    });
    if (g.action === "not-found") return NextResponse.rewrite(new URL("/booking-not-found", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/account/:path*", "/admin/:path*", "/book/class", "/events/:slug"] };
