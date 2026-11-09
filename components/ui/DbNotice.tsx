import { Icon } from "@/components/ui/Icon";

/** Friendly message when the database is not ready (for example the live demo before the Neon main migration). */
export function DbNotice({ what }: { what: string }) {
  return (
    <div className="alert a-warn" role="status">
      <Icon name="info" />
      <div>
        <b>Demo mode</b>
        <p>Demo: {what} is not available yet because the database for this demo site is not ready. Please try again later.</p>
      </div>
    </div>
  );
}
