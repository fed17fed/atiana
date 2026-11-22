import type { Metadata } from "next";
import Link from "next/link";
import { DataList } from "@/components/admin/DataList";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/states";
import { DbNotice } from "@/components/ui/DbNotice";
import { listPackages } from "@/lib/admin/packages-service";
import { priceText } from "@/lib/booking-rules";
import { packsEnabled } from "@/lib/features";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Packages" };

const APPLIES: Record<string, string> = { GROUP_CLASS: "Classes", ONE_TO_ONE: "1:1", EVENT: "Events" };

export default async function AdminPackagesPage() {
  await requireAdmin("/admin/packages");
  const rows = await safeDb("admin packages", async () => {
    const { prisma } = await import("@/lib/prisma");
    return listPackages(prisma);
  });
  if (!rows) return <DbNotice what="the packages" />;
  const shown = packsEnabled();
  return (
    <div className="grid gap-6">
      <PageHeader title="Packages" crumbs={[{ label: "Packages" }]} lead="Credit packs for classes and 1:1. You can change the name, the price and the Active switch. Nothing is removed: switch a package to inactive instead." />
      <div className={`alert ${shown ? "a-success" : "a-warn"}`} role="note">
        <div>
          <b>{shown ? "Packages are shown on the site." : "Packages are hidden on the site."}</b>
          <p>{shown ? "Active packages can be bought." : "The site does not show or sell packages while the setting SHOW_PACKS is off. Changes here are saved for later."}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No packages yet.">Packages are created by the developer. Ask if you need a new one.</EmptyState>
      ) : (
        <DataList
          caption="Packages"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Name", primary: true, render: (r) => r.name },
            { header: "Applies to", render: (r) => r.appliesTo.map((a) => APPLIES[a] ?? a).join(", ") },
            { header: "Credits", render: (r) => `${r.credits} for ${r.validDays} days` },
            { header: "Price", render: (r) => priceText(r.priceCents) },
            { header: "Status", render: (r) => (r.active ? <span className="adm-badge adm-badge-ok">Active</span> : <span className="adm-badge">Inactive</span>) },
            {
              header: "Actions",
              render: (r) => (
                <Link className="btn btn-outline" href={`/admin/packages/${r.id}`} prefetch={false} aria-label={`Edit ${r.name}`}>
                  Edit
                </Link>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
