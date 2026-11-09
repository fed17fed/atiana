import { NextResponse, type NextRequest } from "next/server";
import { guardRoute, SESSION_COOKIES } from "@/lib/route-guard";

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
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
    return NextResponse.redirect(url);
  }
  if (result.action === "forbidden") {
    return new NextResponse(
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><title>403 – No access</title></head>" +
        "<body style=\"font-family:system-ui;padding:3rem;max-width:40rem;margin:auto\"><h1>403 – You do not have access</h1>" +
        "<p>This area is only for the KEA team.</p><p><a href=\"/\">Back to home</a></p></body></html>",
      { status: 403, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }
  return NextResponse.next();
}

export const config = { matcher: ["/account/:path*", "/admin/:path*"] };
