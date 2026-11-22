import type { Metadata } from "next";
import { DataList } from "@/components/admin/DataList";
import { ReadViewFrame } from "@/components/admin/ReadView";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDate } from "@/lib/admin/format";
import { cleanPage, cleanQuery, listSubscribers } from "@/lib/admin/read-queries";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Subscribers" };

const STATUS: Record<string, string> = { PENDING: "Not confirmed", ACTIVE: "Active", UNSUBSCRIBED: "Unsubscribed" };

export default async function AdminSubscribersPage({ searchParams }: PageProps<"/admin/subscribers">) {
  await requireAdmin("/admin/subscribers");
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const page = cleanPage(sp.page);
  const data = await safeDb("admin subscribers", async () => {
    const { prisma } = await import("@/lib/prisma");
    return listSubscribers(prisma, { q, page });
  });
  if (!data) return <DbNotice what="the subscriber list" />;
  const exportHref = `/admin/subscribers/export${q ? `?${new URLSearchParams({ q }).toString()}` : ""}`;
  return (
    <ReadViewFrame
      title="Subscribers"
      lead="People who signed up for the newsletter, newest first. This list is read only."
      basePath="/admin/subscribers"
      q={q}
      page={page}
      total={data.total}
      rowCount={data.rows.length}
      emptyTitle="No subscribers yet."
      emptyText="When someone signs up for the newsletter, they appear here."
      extra={
        // A plain link: the browser downloads the file. The route checks the admin again and writes an audit row.
        <a className="btn btn-outline" href={exportHref} download>
          Export CSV{q ? " (this search)" : ""}
        </a>
      }
    >
      <DataList
        caption="Subscribers"
        rows={data.rows}
        rowKey={(r) => r.id}
        columns={[
          { header: "Email", primary: true, render: (r) => r.email },
          { header: "Status", render: (r) => <span className="adm-badge">{STATUS[r.status] ?? r.status}</span> },
          { header: "Source", render: (r) => r.source ?? "-" },
          { header: "Consent given", render: (r) => (r.consentAt ? formatAdminDate(r.consentAt) : "-") },
          { header: "Signed up", render: (r) => formatAdminDate(r.createdAt) },
        ]}
      />
    </ReadViewFrame>
  );
}
