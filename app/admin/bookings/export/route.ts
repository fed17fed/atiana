import { recordAdminAction } from "@/lib/admin/audit";
import { bookingsToCsv } from "@/lib/admin/bookings-csv";
import { cleanQuery, exportBookings } from "@/lib/admin/read-queries";
import { requireAdmin } from "@/lib/session";

/** CSV of bookings (task 12.7). Admin only (checked here again). Every export writes an audit row. Cells are CSV-injection safe. */
export async function GET(req: Request) {
  const admin = await requireAdmin("/admin/bookings");
  const q = cleanQuery(new URL(req.url).searchParams.get("q"));
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await exportBookings(prisma, q);
    await recordAdminAction(prisma, { userId: admin.id, action: "bookings.export", entity: "Booking", summary: `Exported ${rows.length} bookings to CSV${q ? " (filtered by email)" : ""}` });
    return new Response(bookingsToCsv(rows), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[admin bookings export] failed", error instanceof Error ? error.message : error);
    return new Response("The export is not available now. Try again later.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
}
