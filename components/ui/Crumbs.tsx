import Link from "next/link";

export function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <div className="wrap">
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          {items.map((i) => (
            <li key={i.label}>{i.href ? <Link href={i.href}>{i.label}</Link> : <span aria-current="page">{i.label}</span>}</li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
