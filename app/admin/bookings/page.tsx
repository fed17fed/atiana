import type { Metadata } from "next";
import { DataList } from "@/components/admin/DataList";
import { ReadViewFrame } from "@/components/admin/ReadView";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin/format";
import { cleanPage, cleanQuery, listBookings } from "@/lib/admin/read-queries";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Bookings" };

const STATUS: Record<string, string> = { PENDING: "Not paid yet", CONFIRMED: "Confirmed", CANCELLED: "Cancelled", ATTENDED: "Attended", NO_SHOW: "No show" };
const PAID: Record<string, string> = { STRIPE: "Card", CREDIT: "Credit", FREE: "Free" };

export default async function AdminBookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  await requireAdmin("/admin/bookings");
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const page = cleanPage(sp.page);
  const data = await safeDb("admin bookings", async () => {
    const { prisma } = await import("@/lib/prisma");
    return listBookings(prisma, { q, page });
  });
  if (!data) return <DbNotice what="the booking list" />;
  const exportHref = `/admin/bookings/export${q ? `?${new URLSearchParams({ q }).toString()}` : ""}`;
  return (
    <ReadViewFrame title="Bookings" lead="All bookings, newest first. This list is read only." basePath="/admin/bookings" q={q} page={page} total={data.total} rowCount={data.rows.length} emptyTitle="No bookings yet." emptyText="When someone books a class, it appears here."
      extra={
        // A plain link: the browser downloads the file. The route checks the admin again and writes an audit row.
        <a className="btn btn-outline" href={exportHref} download>
          Export CSV{q ? " (this search)" : ""}
        </a>
      }
    >
      <DataList
        caption="Bookings"
        rows={data.rows}
        rowKey={(r) => r.id}
        columns={[
          { header: "Client", primary: true, render: (r) => r.user.name ?? "(no name)" },
          { header: "Email", render: (r) => r.user.email },
          { header: "Session", render: (r) => `${r.session.offering.title}, ${formatAdminDateTime(r.session.startsAt)}` },
          { header: "Status", render: (r) => <span className="adm-badge">{STATUS[r.status] ?? r.status}</span> },
          { header: "Paid with", render: (r) => (r.paidWith ? PAID[r.paidWith] : "-") },
          { header: "Booked", render: (r) => formatAdminDate(r.createdAt) },
        ]}
      />
    </ReadViewFrame>
  );
}
