import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DataList } from "@/components/admin/DataList";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, StatusMessage } from "@/components/admin/states";
import { DbNotice } from "@/components/ui/DbNotice";
import { countOfferings, listOfferings, OFFERINGS_PAGE_SIZE } from "@/lib/admin/offerings-service";
import { cleanPage } from "@/lib/admin/read-queries";
import { formatAdminDate } from "@/lib/admin/format";
import { priceText } from "@/lib/booking-rules";
import { KIND_LABEL, type OfferingKind } from "@/lib/offerings-schema";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import { setOfferingVisible } from "./actions";

export const metadata: Metadata = { title: "Classes and events" };

const FLASH: Record<string, string> = {
  hidden: "Hidden from the site. Existing bookings stay. You can restore it at any time.",
  restored: "Restored. It is on the site again.",
  failed: "Sorry, that did not work. Try again.",
};
const TYPES: { value: string; label: string; kind?: OfferingKind }[] = [
  { value: "", label: "All" },
  { value: "class", label: "Class", kind: "GROUP_CLASS" },
  { value: "one-to-one", label: "1:1", kind: "ONE_TO_ONE" },
  { value: "event", label: "Event", kind: "EVENT" },
];
const STATUSES = [
  { value: "", label: "All" },
  { value: "published", label: "Published" },
  { value: "hidden", label: "Hidden" },
];

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminOfferingsPage({ searchParams }: PageProps<"/admin/offerings">) {
  await requireAdmin("/admin/offerings");
  const sp = await searchParams;
  const flashKey = first(sp.saved);
  const flash = flashKey ? FLASH[flashKey] : undefined;
  const typeRaw = first(sp.type) ?? "";
  const statusRaw = first(sp.status) ?? "";
  const type = TYPES.find((t) => t.value === typeRaw)?.kind;
  const published = statusRaw === "published" ? true : statusRaw === "hidden" ? false : undefined;

  const pageRaw = cleanPage(sp.page);
  const data = await safeDb("admin offerings", async () => {
    const { prisma } = await import("@/lib/prisma");
    const [total, rows] = await Promise.all([countOfferings(prisma, { type, published }), listOfferings(prisma, { type, published, page: pageRaw })]);
    return { total, rows };
  });
  if (!data) return <DbNotice what="the list of classes and events" />;

  const { rows, total } = data;
  const pages = Math.max(1, Math.ceil(total / OFFERINGS_PAGE_SIZE));
  const page = Math.min(pageRaw, pages);
  const pageHref = (p: number) => `/admin/offerings?${new URLSearchParams({ ...(typeRaw ? { type: typeRaw } : {}), ...(statusRaw ? { status: statusRaw } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`.replace(/\?$/, "");
  return (
    <div className="grid gap-6">
      <PageHeader title="Classes and events" crumbs={[{ label: "Classes and events" }]} lead="Classes, 1:1 sessions and events shown on the site. Nothing is removed: use Hide, then Restore if you need it again." />
      {flash && (flashKey === "failed" ? <div className="alert a-error" role="alert"><p>{flash}</p></div> : <StatusMessage>{flash}</StatusMessage>)}
      <div>
        <Link className="btn btn-primary" href="/admin/offerings/new" prefetch={false}>
          Add new
        </Link>
      </div>
      <form method="get" action="/admin/offerings" className="adm-filter" aria-label="Filter the list">
        <div className="field">
          <label htmlFor="f-type">Type</label>
          <select id="f-type" name="type" className="input select" defaultValue={typeRaw}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" name="status" className="input select" defaultValue={statusRaw}>
            {STATUSES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-outline">Apply filter</button>
      </form>
      <p role="status" className="hint">{total === 0 ? "0 results" : `${total} result${total === 1 ? "" : "s"}. Page ${page} of ${pages}. Newest first inside each type.`}</p>
      {rows.length === 0 && total > 0 ? (
        <EmptyState title="This page is empty." action={{ href: pageHref(1), label: "Go to page 1" }} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing found." action={{ href: "/admin/offerings/new", label: "Add new" }}>
          Change the filter, or add a class or an event. If the list is empty without a filter, the site shows its built-in classes and events until you save one here.
        </EmptyState>
      ) : (
        <DataList
          caption="Classes, 1:1 sessions and events"
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Title", primary: true, render: (r) => r.title },
            { header: "Type", render: (r) => KIND_LABEL[r.type] },
            {
              header: "Price",
              render: (r) => (r.type === "EVENT" && r.eventPricing !== "PAID" ? (r.eventPricing === "DONATION" ? "By donation" : "Free") : priceText(r.priceOptions[0]?.amountCents)),
            },
            {
              header: "Status",
              render: (r) => (r.published ? <span className="adm-badge adm-badge-ok">Published</span> : <span className="adm-badge">Hidden</span>),
            },
            { header: "Edited", render: (r) => (r.adminEditedAt ? formatAdminDate(r.adminEditedAt) : "–") },
            {
              header: "Actions",
              render: (r) => (
                <span className="adm-actions">
                  <Link className="btn btn-outline" href={`/admin/offerings/${r.id}`} prefetch={false} aria-label={`Edit ${r.title}`}>
                    Edit
                  </Link>
                  {r.published ? (
                    <ConfirmDialog
                      triggerLabel="Hide"
                      title={`Hide this ${KIND_LABEL[r.type].toLowerCase()}?`}
                      message={`It will disappear from the site. Existing bookings stay.`}
                      confirmLabel="Hide"
                      action={setOfferingVisible.bind(null, r.id, false)}
                    />
                  ) : (
                    <form action={setOfferingVisible.bind(null, r.id, true)}>
                      <button type="submit" className="btn btn-outline" aria-label={`Restore ${r.title}`}>Restore</button>
                    </form>
                  )}
                </span>
              ),
            },
          ]}
        />
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="adm-pager">
          {page > 1 && <Link className="btn btn-outline" href={pageHref(page - 1)} prefetch={false}>Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link className="btn btn-outline" href={pageHref(page + 1)} prefetch={false}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
