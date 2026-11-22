import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PackageForm } from "@/components/admin/PackageForm";
import { PageHeader } from "@/components/admin/PageHeader";
import { DbNotice } from "@/components/ui/DbNotice";
import { centsToPriceInput } from "@/lib/offerings-schema";
import { packsEnabled } from "@/lib/features";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Edit package" };

// The id is only known at request time. This page is always rendered per request (login needed), so a blocking route is fine here.
export const instant = false;

export default async function EditPackagePage({ params }: PageProps<"/admin/packages/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/packages/${id}`);
  const found = await safeDb("admin package", async () => {
    const { prisma } = await import("@/lib/prisma");
    return { row: await prisma.package.findUnique({ where: { id } }) };
  });
  if (!found) return <DbNotice what="this package" />;
  if (!found.row) notFound();
  const p = found.row;
  return (
    <div className="grid gap-6">
      <PageHeader title={`Edit: ${p.name}`} crumbs={[{ label: "Packages", href: "/admin/packages" }, { label: "Edit" }]} lead={`${p.credits} credits, valid ${p.validDays} days. Credits and validity are fixed rules and cannot be changed here.`} />
      <PackageForm initialValues={{ id: p.id, version: String(p.updatedAt.getTime()), name: p.name, price: centsToPriceInput(p.priceCents), active: p.active }} packsShown={packsEnabled()} />
    </div>
  );
}
