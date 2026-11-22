import type { Metadata } from "next";
import { OfferingForm } from "@/components/admin/OfferingForm";
import { PageHeader } from "@/components/admin/PageHeader";
import { DbNotice } from "@/components/ui/DbNotice";
import { imageStorageMode } from "@/lib/images/storage";
import { NEW_CLASS_ORDER_DEFAULT } from "@/lib/offerings-schema";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Add class or event" };

export default async function NewOfferingPage() {
  await requireAdmin("/admin/offerings/new");
  const library = await safeDb("admin offering images", async () => {
    const { prisma } = await import("@/lib/prisma");
    return prisma.mediaImage.findMany({ orderBy: { createdAt: "desc" }, take: 60, select: { id: true, url: true, alt: true } });
  });
  if (!library) return <DbNotice what="the image library" />;
  return (
    <div className="grid gap-6">
      <PageHeader title="Add class or event" crumbs={[{ label: "Classes and events", href: "/admin/offerings" }, { label: "Add" }]} />
      <OfferingForm
        library={library}
        uploadActive={imageStorageMode() !== "off"}
        initialValues={{
          id: null,
          version: "",
          type: "EVENT",
          slug: "",
          title: "",
          summary: "",
          body: "",
          level: "",
          minutes: "",
          lengthLabel: "",
          activationAfterMinutes: "",
          price: "",
          eventPricing: "PAID",
          mode: "ONLINE",
          location: "",
          image: "",
          imageAlt: "",
          sortOrder: String(NEW_CLASS_ORDER_DEFAULT),
          published: true,
        }}
      />
    </div>
  );
}
