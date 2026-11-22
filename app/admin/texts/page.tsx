import type { Metadata } from "next";
import Link from "next/link";
import { DataList } from "@/components/admin/DataList";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/states";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDate } from "@/lib/admin/format";
import { cleanQuery } from "@/lib/admin/read-queries";
import { TEXT_ENTRIES, TEXT_PAGES, type TextEntry } from "@/lib/admin/text-registry";
import { effectiveValue, isEdited, loadBlocks } from "@/lib/admin/text-service";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import { fillTokens } from "@/lib/text-tokens";

export const metadata: Metadata = { title: "Texts" };

const short = (t: string, n = 90) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Wireframe A3: texts by page, search, Default / Edited badge. A plain GET form, so it works without JavaScript. */
export default async function AdminTextsPage({ searchParams }: PageProps<"/admin/texts">) {
  await requireAdmin("/admin/texts");
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const pageRaw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = TEXT_PAGES.find((p) => p.id === pageRaw)?.id ?? null;
  const blocks = await safeDb("admin texts", async () => {
    const { prisma } = await import("@/lib/prisma");
    return loadBlocks(prisma);
  });
  if (!blocks) return <DbNotice what="the text list" />;

  const needle = q?.toLowerCase() ?? null;
  const rows = TEXT_ENTRIES.filter((e) => {
    if (page && e.page !== page) return false;
    if (!needle) return true;
    const shown = fillTokens(effectiveValue(blocks.get(e.key) ?? null, e));
    return `${e.label} ${e.key} ${shown}`.toLowerCase().includes(needle);
  });
  const editedCount = TEXT_ENTRIES.filter((e) => isEdited(blocks.get(e.key) ?? null, e)).length;

  return (
    <div className="grid gap-4">
      <PageHeader title="Texts" crumbs={[{ label: "Texts" }]} lead={`Change the words on Home, About and FAQ. ${editedCount} of ${TEXT_ENTRIES.length} texts are edited. The others use the original text.`} />
      <form method="get" action="/admin/texts" role="search" className="adm-toolbar">
        <div className="field">
          <label htmlFor="tx-page">Page</label>
          <select id="tx-page" name="page" className="select input" defaultValue={page ?? ""}>
            <option value="">All pages</option>
            {TEXT_PAGES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tx-q">Search texts</label>
          <input id="tx-q" name="q" type="search" className="input" defaultValue={q ?? ""} maxLength={120} autoComplete="off" placeholder="Search..." />
        </div>
        <button type="submit" className="btn btn-primary">Search</button>
        {(q || page) && (
          <Link className="btn btn-outline" href="/admin/texts" prefetch={false}>
            Clear search
          </Link>
        )}
      </form>
      <p role="status" className="hint">
        {rows.length} text{rows.length === 1 ? "" : "s"}{q ? ` for "${q}"` : ""}.
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No texts match." action={{ href: "/admin/texts", label: "Clear the search" }} />
      ) : (
        <DataList
          caption="Texts"
          rows={rows}
          rowKey={(r) => r.key}
          columns={[
            {
              header: "Text",
              primary: true,
              render: (r: TextEntry) => (
                <>
                  {r.label}
                  <br />
                  <small className="hint" style={{ fontWeight: 400 }}>{r.key}</small>
                </>
              ),
            },
            { header: "Page", render: (r) => r.pageLabel },
            { header: "Preview", render: (r) => <span className="adm-quote">{short(fillTokens(effectiveValue(blocks.get(r.key) ?? null, r)))}</span> },
            {
              header: "Status",
              render: (r) => {
                const b = blocks.get(r.key) ?? null;
                return isEdited(b, r) ? <span className="adm-badge adm-badge-ok">Edited</span> : <span className="adm-badge">Default</span>;
              },
            },
            {
              header: "Edited",
              render: (r) => {
                const b = blocks.get(r.key) ?? null;
                return isEdited(b, r) && b ? formatAdminDate(b.updatedAt) : "-";
              },
            },
            {
              header: "Action",
              render: (r) => (
                <Link className="btn btn-outline" href={`/admin/texts/${r.key}`} prefetch={false} aria-label={`Edit ${r.label}`}>
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
