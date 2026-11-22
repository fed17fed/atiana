import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/PageHeader";
import { TestimonialForm } from "@/components/admin/TestimonialForm";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Add testimonial" };

export default async function NewTestimonialPage() {
  await requireAdmin("/admin/testimonials/new");
  return (
    <div className="grid gap-6">
      <PageHeader title="Add testimonial" crumbs={[{ label: "Testimonials", href: "/admin/testimonials" }, { label: "Add" }]} />
      <TestimonialForm initialValues={{ id: null, version: "", name: "", place: "", text: "", sortOrder: 0, published: true, isDemo: true }} />
    </div>
  );
}
