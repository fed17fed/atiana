import type { NextRequest } from "next/server";

// Loaded lazily: without AUTH_SECRET and a database nothing is created and nothing crashes.
async function handle(req: NextRequest, method: "GET" | "POST") {
  if (!process.env.AUTH_SECRET) {
    return Response.json({ error: "Demo: login is not active yet." }, { status: 503 });
  }
  const { handlers } = await import("@/lib/auth");
  return handlers[method](req);
}

export const GET = (req: NextRequest) => handle(req, "GET");
export const POST = (req: NextRequest) => handle(req, "POST");
