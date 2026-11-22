import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OfferingForm } from "@/components/admin/OfferingForm";
import { PageHeader } from "@/components/admin/PageHeader";
import { DbNotice } from "@/components/ui/DbNotice";
import { imageStorageMode } from "@/lib/images/storage";
import { centsToPriceInput } from "@/lib/offerings-schema";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Edit class or event" };

// The id is only known at request time. This page is always rendered per request (login needed), so a blocking route is fine here.
export const instant = false;

export default async function EditOfferingPage({ params, searchParams }: PageProps<"/admin/offerings/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/offerings/${id}`);
  const sp = await searchParams;
  const data = await safeDb("admin offering", async () => {
    const { prisma } = await import("@/lib/prisma");
    const [found, library] = await Promise.all([
      prisma.offering.findUnique({ where: { id }, include: { priceOptions: { orderBy: { amountCents: "asc" }, take: 1 } } }),
      prisma.mediaImage.findMany({ orderBy: { createdAt: "desc" }, take: 60, select: { id: true, url: true, alt: true } }),
    ]);
    return { found, library };
  });
  if (!data) return <DbNotice what="this class or event" />;
  if (!data.found) notFound();
  const o = data.found;
  return (
    <div className="grid gap-6">
      <PageHeader title={`Edit: ${o.title}`} crumbs={[{ label: "Classes and events", href: "/admin/offerings" }, { label: "Edit" }]} />
      <OfferingForm
        library={data.library}
        uploadActive={imageStorageMode() !== "off"}
        created={sp.saved === "created"}
        initialValues={{
          id: o.id,
          version: String(o.updatedAt.getTime()),
          type: o.type,
          slug: o.slug,
          title: o.title,
          summary: o.summary,
          body: o.body,
          level: o.level ?? "",
          minutes: o.minutes === null ? "" : String(o.minutes),
          lengthLabel: o.lengthLabel ?? "",
          activationAfterMinutes: o.activationAfterMinutes === null ? "" : String(o.activationAfterMinutes),
          price: centsToPriceInput(o.priceOptions[0]?.amountCents),
          eventPricing: o.eventPricing ?? "FREE",
          mode: o.mode,
          location: o.location ?? "",
          image: o.image ?? "",
          imageAlt: o.imageAlt ?? "",
          sortOrder: String(o.sortOrder),
          published: o.published,
        }}
      />
    </div>
  );
}
