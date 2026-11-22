import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { TestimonialForm } from "@/components/admin/TestimonialForm";
import { DbNotice } from "@/components/ui/DbNotice";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Edit testimonial" };

// The id is only known at request time. This page is always rendered per request (login needed), so a blocking route is fine here.
export const instant = false;

export default async function EditTestimonialPage({ params }: PageProps<"/admin/testimonials/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/testimonials/${id}`);
  const row = await safeDb("admin testimonial", async () => {
    const { prisma } = await import("@/lib/prisma");
    return { found: await prisma.testimonial.findUnique({ where: { id } }) };
  });
  if (!row) return <DbNotice what="this testimonial" />;
  if (!row.found) notFound();
  const t = row.found;
  return (
    <div className="grid gap-6">
      <PageHeader title="Edit testimonial" crumbs={[{ label: "Testimonials", href: "/admin/testimonials" }, { label: "Edit" }]} />
      <TestimonialForm
        initialValues={{ id: t.id, version: String(t.updatedAt.getTime()), name: t.name, place: t.place ?? "", text: t.text, sortOrder: t.sortOrder, published: t.published, isDemo: t.isDemo }}
      />
    </div>
  );
}
