import Link from "next/link";
import { AdminCard } from "@/components/admin/AdminCard";
import { CardError } from "@/components/admin/states";
import { listLegalOverview } from "@/lib/admin/legal-service";
import { safeDb } from "@/lib/safe";

/** Overview card (owner answer: yes). Warns when a published legal page is NOT the lawyer-approved text, and lists drafts that wait. */
export async function LegalOverviewCard() {
  const rows = await safeDb("admin overview legal", async () => {
    const { prisma } = await import("@/lib/prisma");
    return listLegalOverview(prisma);
  });
  const changed = rows?.filter((r) => !r.approved) ?? [];
  const drafts = rows?.filter((r) => r.draftWaiting) ?? [];
  return (
    <AdminCard id="card-legal" title="Legal pages" href="/admin/legal">
      {rows === null ? (
        <CardError retryHref="/admin" />
      ) : changed.length === 0 && drafts.length === 0 ? (
        <p>All {rows.length} legal pages are the lawyer-approved text.</p>
      ) : (
        <>
          {changed.length > 0 && (
            <>
              <p>
                <b>Changed after lawyer approval:</b> {changed.length} page{changed.length === 1 ? "" : "s"}. This text was not checked by a lawyer.
              </p>
              <ul className="adm-list">
                {changed.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/admin/legal/${r.slug}/versions`} prefetch={false}>{r.title}</Link> (version {r.version})
                  </li>
                ))}
              </ul>
            </>
          )}
          {drafts.length > 0 && (
            <>
              <p>
                <b>Draft waiting (not public):</b>
              </p>
              <ul className="adm-list">
                {drafts.map((r) => (
                  <li key={r.slug}>
                    <Link href={`/admin/legal/${r.slug}`} prefetch={false}>{r.title}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </AdminCard>
  );
}
