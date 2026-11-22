import type { Metadata } from "next";
import Link from "next/link";
import { DataList } from "@/components/admin/DataList";
import { PageHeader } from "@/components/admin/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDate } from "@/lib/admin/format";
import { listLegalOverview } from "@/lib/admin/legal-service";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import "@/components/admin/text-editor.css";

export const metadata: Metadata = { title: "Legal pages" };

/** Wireframe A6: the 5 legal pages, the published version, a text badge (lawyer approved / changed after approval), "Draft waiting". */
export default async function AdminLegalListPage() {
  await requireAdmin("/admin/legal");
  const rows = await safeDb("admin legal list", async () => {
    const { prisma } = await import("@/lib/prisma");
    return listLegalOverview(prisma);
  });
  if (!rows) return <DbNotice what="the legal pages list" />;
  return (
    <div className="grid gap-4">
      <PageHeader title="Legal pages" crumbs={[{ label: "Legal pages" }]} />
      <div className="alert a-warn" role="note">
        <Icon name="warn" />
        <div>
          <p className="lg-note">Legal pages are legal documents. Changes are not checked by a lawyer.</p>
        </div>
      </div>
      <DataList
        caption="Legal pages"
        rows={rows}
        rowKey={(r) => r.slug}
        columns={[
          { header: "Page", primary: true, render: (r) => r.title },
          {
            header: "Status",
            render: (r) => (
              <>
                {r.approved ? (
                  <span className="adm-badge adm-badge-ok">Lawyer approved{r.approvedAt ? ` ${formatAdminDate(r.approvedAt)}` : ""}</span>
                ) : (
                  <span className="adm-badge lg-badge-warn">Changed after lawyer approval</span>
                )}
                {r.draftWaiting && <span className="adm-badge">Draft waiting</span>}
              </>
            ),
          },
          { header: "Version", render: (r) => String(r.version) },
          { header: "Version date", render: (r) => (r.versionDate ? formatAdminDate(r.versionDate) : "-") },
          {
            header: "Actions",
            render: (r) => (
              <span className="adm-actions">
                <Link className="btn btn-outline" href={`/admin/legal/${r.slug}`} prefetch={false} aria-label={`Edit ${r.title}`}>
                  Edit
                </Link>
                <Link className="btn btn-outline" href={`/admin/legal/${r.slug}/versions`} prefetch={false} aria-label={`Versions of ${r.title}`}>
                  Versions
                </Link>
                <Link className="btn btn-outline" href={`/legal/${r.slug}`} prefetch={false} aria-label={`View page: ${r.title} on the site`}>
                  View page
                </Link>
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
