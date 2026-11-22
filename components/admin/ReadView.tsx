import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState } from "@/components/admin/states";
import { PAGE_SIZE } from "@/lib/admin/read-queries";

/**
 * Frame of a read-only list (wireframe A13): header, "Search by email" (plain GET form, works without JavaScript),
 * result count, the list, and paging. Read only: no edit, no delete.
 */
export function ReadViewFrame({
  title,
  lead,
  basePath,
  q,
  page,
  total,
  rowCount,
  emptyTitle,
  emptyText,
  searchLabel = "Search by email",
  extra,
  children,
}: {
  title: string;
  lead: string;
  basePath: string;
  q: string | null;
  page: number;
  total: number;
  rowCount: number;
  emptyTitle: string;
  emptyText: string;
  searchLabel?: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `${basePath}?${new URLSearchParams({ ...(q ? { q } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`.replace(/\?$/, "");
  return (
    <div className="grid gap-4">
      <PageHeader title={title} crumbs={[{ label: title }]} lead={lead} />
      <form method="get" action={basePath} role="search" className="adm-toolbar">
        <div className="field">
          <label htmlFor="rv-q">{searchLabel}</label>
          <input id="rv-q" name="q" type="search" className="input" defaultValue={q ?? ""} maxLength={120} autoComplete="off" placeholder="name@example.com" />
        </div>
        <button type="submit" className="btn btn-primary">Search</button>
        {q && (
          <Link className="btn btn-outline" href={basePath} prefetch={false}>
            Clear search
          </Link>
        )}
        {extra}
      </form>
      <p role="status" className="hint">
        {total === 0 ? "0 results" : `${total} result${total === 1 ? "" : "s"}${q ? ` for "${q}"` : ""}. Page ${Math.min(page, pages)} of ${pages}.`}
      </p>
      {total === 0 ? (
        q ? <EmptyState title="Nothing found for this email.">Check the spelling or search for a shorter part of the address.</EmptyState> : <EmptyState title={emptyTitle}>{emptyText}</EmptyState>
      ) : rowCount === 0 ? (
        <EmptyState title="This page is empty." action={{ href: href(1), label: "Go to page 1" }} />
      ) : (
        children
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="adm-pager">
          {page > 1 && <Link className="btn btn-outline" href={href(page - 1)} prefetch={false}>Previous</Link>}
          <span>Page {Math.min(page, pages)} of {pages}</span>
          {page < pages && <Link className="btn btn-outline" href={href(page + 1)} prefetch={false}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
