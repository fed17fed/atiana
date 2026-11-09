/**
 * Loading placeholder for streamed (dynamic) page parts. It has about the same height as the real content,
 * so the footer does not jump when the content arrives (layout shift, CLS).
 */
export function PageSkeleton({ minHeight, narrow = false }: { minHeight: number; narrow?: boolean }) {
  return (
    <div className={narrow ? "narrow" : "wrap"} style={{ minHeight }} role="status" aria-busy="true">
      <span className="sr-only">Loading...</span>
      <div className="grid gap-3" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-tile bg-sand" />
        ))}
      </div>
    </div>
  );
}
