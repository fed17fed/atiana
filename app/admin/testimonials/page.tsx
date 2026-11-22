import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DataList } from "@/components/admin/DataList";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, StatusMessage } from "@/components/admin/states";
import { DbNotice } from "@/components/ui/DbNotice";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import { whoLabel } from "@/lib/testimonials";
import { setTestimonialVisible } from "./actions";

export const metadata: Metadata = { title: "Testimonials" };

const FLASH: Record<string, string> = {
  added: "Testimonial added.",
  shown: "Shown on the site.",
  hidden: "Hidden from the site. You can show it again at any time.",
  failed: "Sorry, that did not work. Try again.",
};

export default async function AdminTestimonialsPage({ searchParams }: PageProps<"/admin/testimonials">) {
  await requireAdmin("/admin/testimonials");
  const sp = await searchParams;
  const flash = typeof sp.saved === "string" ? FLASH[sp.saved] : undefined;
  const rows = await safeDb("admin testimonials", async () => {
    const { prisma } = await import("@/lib/prisma");
    return prisma.testimonial.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 200 });
  });
  if (!rows) return <DbNotice what="the testimonial list" />;
  return (
    <div className="grid gap-6">
      <PageHeader title="Testimonials" crumbs={[{ label: "Testimonials" }]} lead="Reviews shown on the Home page. Nothing is removed: use Hide." />
      {flash && (sp.saved === "failed" ? <div className="alert a-error" role="alert"><p>{flash}</p></div> : <StatusMessage>{flash}</StatusMessage>)}
      <div>
        <Link className="btn btn-primary" href="/admin/testimonials/new" prefetch={false}>
          Add testimonial
        </Link>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No testimonials yet." action={{ href: "/admin/testimonials/new", label: "Add the first one" }}>
          The Home page shows the 3 default demo reviews until you add one here.
        </EmptyState>
      ) : (
        <DataList
          caption="Testimonials"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Name", primary: true, render: (r) => whoLabel(r.name, r.place) },
            { header: "Order", render: (r) => r.sortOrder },
            { header: "Quote", render: (r) => <span className="adm-quote">{r.text.length > 90 ? `${r.text.slice(0, 89)}…` : r.text}</span> },
            {
              header: "Status",
              render: (r) => (
                <>
                  {r.isDemo ? <span className="adm-badge adm-badge-demo">Demo review</span> : <span className="adm-badge">Real</span>}
                  {r.published ? <span className="adm-badge adm-badge-ok">Shown</span> : <span className="adm-badge">Hidden</span>}
                </>
              ),
            },
            {
              header: "Actions",
              render: (r) => (
                <span className="adm-actions">
                  <Link className="btn btn-outline" href={`/admin/testimonials/${r.id}`} prefetch={false}>
                    Edit
                  </Link>
                  {r.published ? (
                    <ConfirmDialog triggerLabel="Hide" title="Hide this testimonial?" message="It will disappear from the Home page. You can show it again later." confirmLabel="Hide" action={setTestimonialVisible.bind(null, r.id, false)} />
                  ) : (
                    <form action={setTestimonialVisible.bind(null, r.id, true)}>
                      <button type="submit" className="btn btn-outline">Show</button>
                    </form>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}
