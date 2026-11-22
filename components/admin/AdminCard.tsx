import Link from "next/link";

/** A card on the overview: title (links to the full list when it exists), then content. */
export function AdminCard({ id, title, href, children }: { id: string; title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="adm-card" aria-labelledby={id}>
      <h2 id={id}>{href ? <Link href={href} prefetch={false}>{title}</Link> : title}</h2>
      {children}
    </section>
  );
}

export function CardSkeleton({ label }: { label: string }) {
  return (
    <div className="adm-card" role="status" aria-busy="true">
      <span className="sr-only">Loading {label}...</span>
      <div aria-hidden="true" className="grid gap-2">
        <div className="h-5 w-1/2 animate-pulse rounded bg-sand" />
        <div className="h-4 animate-pulse rounded bg-sand" />
        <div className="h-4 animate-pulse rounded bg-sand" />
      </div>
    </div>
  );
}
