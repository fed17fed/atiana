import type { NextRequest } from "next/server";
import { checkCronAuth } from "@/lib/cron-auth";
import { runDailyJob } from "@/lib/cron-service";

/** Daily job (see vercel.json). Closed unless CRON_SECRET is set and the request carries it. */
export async function GET(req: NextRequest) {
  const auth = checkCronAuth(req.headers.get("authorization"));
  if (auth === "not-configured") return Response.json({ error: "Cron is not configured." }, { status: 503 });
  if (auth === "denied") return Response.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const { prisma } = await import("@/lib/prisma");
    const summary = await runDailyJob(prisma);
    console.log("[cron] daily job done", JSON.stringify(summary));
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron] daily job failed", error instanceof Error ? error.message : error);
    return Response.json({ ok: false, error: "Job failed." }, { status: 500 });
  }
}
