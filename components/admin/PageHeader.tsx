import Link from "next/link";

export type Crumb = { label: string; href?: string };

/** Top of every admin page (wireframe A1): breadcrumb + H1. The last crumb is the current page. */
export function PageHeader({ title, crumbs = [], lead }: { title: string; crumbs?: Crumb[]; lead?: string }) {
  const all: Crumb[] = [{ label: "Admin", href: "/admin" }, ...crumbs];
  return (
    <header className="adm-head">
      <nav aria-label="Breadcrumb">
        <ol className="adm-crumbs">
          {all.map((c, i) => (
            <li key={`${c.label}-${i}`}>
              {c.href && i < all.length - 1 ? <Link href={c.href} prefetch={false}>{c.label}</Link> : <span aria-current={i === all.length - 1 ? "page" : undefined}>{c.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
      <h1>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
    </header>
  );
}
