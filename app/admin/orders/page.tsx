import type { Metadata } from "next";
import { DataList } from "@/components/admin/DataList";
import { ReadViewFrame } from "@/components/admin/ReadView";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDate } from "@/lib/admin/format";
import { cleanPage, cleanQuery, listOrders } from "@/lib/admin/read-queries";
import { formatEuro } from "@/lib/orders-service";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Orders" };

const STATUS: Record<string, string> = { PENDING: "Not paid yet", PAID: "Paid", REFUNDED: "Refunded", CANCELLED: "Cancelled" };

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  await requireAdmin("/admin/orders");
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const page = cleanPage(sp.page);
  const data = await safeDb("admin orders", async () => {
    const { prisma } = await import("@/lib/prisma");
    return listOrders(prisma, { q, page });
  });
  if (!data) return <DbNotice what="the order list" />;
  return (
    <ReadViewFrame title="Orders" lead="Card payments and donations, newest first. This list is read only." basePath="/admin/orders" q={q} page={page} total={data.total} rowCount={data.rows.length} emptyTitle="No orders yet." emptyText="When someone pays by card, the order appears here.">
      <DataList
        caption="Orders"
        rows={data.rows}
        rowKey={(r) => r.id}
        columns={[
          { header: "Email", primary: true, render: (r) => r.email },
          { header: "Items", render: (r) => r.items.map((i) => (i.quantity > 1 ? `${i.quantity} x ${i.description}` : i.description)).join(", ") || "-" },
          { header: "Total", render: (r) => formatEuro(r.totalCents, r.currency) },
          { header: "Status", render: (r) => <span className="adm-badge">{STATUS[r.status] ?? r.status}</span> },
          { header: "Created", render: (r) => formatAdminDate(r.createdAt) },
          { header: "Paid", render: (r) => (r.paidAt ? formatAdminDate(r.paidAt) : "-") },
        ]}
      />
    </ReadViewFrame>
  );
}
