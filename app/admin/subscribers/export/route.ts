import { recordAdminAction } from "@/lib/admin/audit";
import { toCsv } from "@/lib/admin/csv";
import { cleanQuery, exportSubscribers } from "@/lib/admin/read-queries";
import { requireAdmin } from "@/lib/session";

/** CSV of subscribers (task 12.14). Admin only (checked here again). Every export writes an audit row. Cells are CSV-injection safe. */
export async function GET(req: Request) {
  const admin = await requireAdmin("/admin/subscribers");
  const q = cleanQuery(new URL(req.url).searchParams.get("q"));
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await exportSubscribers(prisma, q);
    await recordAdminAction(prisma, { userId: admin.id, action: "subscribers.export", entity: "NewsletterSubscriber", summary: `Exported ${rows.length} subscribers to CSV${q ? " (filtered by email)" : ""}` });
    const csv = toCsv(
      ["email", "status", "source", "consent_given_at", "signed_up_at"],
      rows.map((r) => [r.email, r.status, r.source, r.consentAt, r.createdAt]),
    );
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[admin subscribers export] failed", error instanceof Error ? error.message : error);
    return new Response("The export is not available now. Try again later.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
}
