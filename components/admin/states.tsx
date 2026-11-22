import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/** Wireframe A14: shared states. Same markup everywhere, so every admin screen behaves the same. */

/** Green box: saved / done. Stays until the next action (no auto-hide). */
export function StatusMessage({ children, href, linkLabel }: { children: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="alert a-success" role="status">
      <Icon name="check" />
      <div>
        <p>
          {children}
          {href && linkLabel && (
            <>
              {" "}
              <Link href={href} prefetch={false}>{linkLabel}</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/** Empty list: say what is missing and what to do next (never a blank area). */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="adm-empty">
      <p className="adm-empty-title">{title}</p>
      {children && <p className="hint">{children}</p>}
      {action && (
        <Link className="btn btn-primary" href={action.href} prefetch={false}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Error inside one card: the other cards keep working. A plain link reloads the page (= retry). */
export function CardError({ retryHref }: { retryHref: string }) {
  return (
    <p className="adm-card-error" role="status">
      Could not load. <a href={retryHref}>Try again</a>
    </p>
  );
}
