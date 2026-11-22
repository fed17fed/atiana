import type { Metadata } from "next";
import { DataList } from "@/components/admin/DataList";
import { ReadViewFrame } from "@/components/admin/ReadView";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDate } from "@/lib/admin/format";
import { cleanPage, cleanQuery, listReferrals } from "@/lib/admin/read-queries";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Referrals" };

const STATUS: Record<string, string> = { PENDING: "Waiting", QUALIFIED: "Qualified", REWARDED: "Reward given" };

export default async function AdminReferralsPage({ searchParams }: PageProps<"/admin/referrals">) {
  await requireAdmin("/admin/referrals");
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const page = cleanPage(sp.page);
  const data = await safeDb("admin referrals", async () => {
    const { prisma } = await import("@/lib/prisma");
    return listReferrals(prisma, { q, page });
  });
  if (!data) return <DbNotice what="the referral list" />;
  return (
    <ReadViewFrame title="Referrals" lead="Who invited whom, newest first. This list is read only. You can search for either email." basePath="/admin/referrals" q={q} page={page} total={data.total} rowCount={data.rows.length} emptyTitle="No referrals yet." emptyText="Referrals are hidden on the site for now, so this list is empty until they are turned on.">
      <DataList
        caption="Referrals"
        rows={data.rows}
        rowKey={(r) => r.id}
        columns={[
          { header: "Invited by", primary: true, render: (r) => r.referrer.email },
          { header: "New client", render: (r) => r.referredUser.email },
          { header: "Status", render: (r) => <span className="adm-badge">{STATUS[r.status] ?? r.status}</span> },
          { header: "Reward", render: (r) => (r.rewardCreditGrantId ? "Credit given" : "-") },
          { header: "Date", render: (r) => formatAdminDate(r.createdAt) },
        ]}
      />
    </ReadViewFrame>
  );
}
