import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PageHeader } from "@/components/admin/PageHeader";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin/format";
import { loadLegalState } from "@/lib/admin/legal-service";
import { isLegalSlug } from "@/lib/legal";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import "@/components/admin/text-editor.css";
import { restoreLawyerApprovedAction } from "../../actions";

export const metadata: Metadata = { title: "Legal page versions" };

// The slug is only known at request time and login is needed: always rendered per request.
export const instant = false;

/** All versions of one legal page, newest first. "View" shows an old text read only (?v=number). Nothing is ever removed. */
export default async function AdminLegalVersionsPage({ params, searchParams }: PageProps<"/admin/legal/[slug]/versions">) {
  const { slug } = await params;
  await requireAdmin(`/admin/legal/${isLegalSlug(slug) ? slug : ""}/versions`);
  if (!isLegalSlug(slug)) notFound();
  const sp = await searchParams;
  const viewRaw = Array.isArray(sp.v) ? sp.v[0] : sp.v;
  const state = await safeDb("admin legal versions", async () => {
    const { prisma } = await import("@/lib/prisma");
    return loadLegalState(prisma, slug);
  });
  if (!state) return <DbNotice what="the versions" />;
  const here = `/admin/legal/${slug}/versions`;
  const selected = typeof viewRaw === "string" && /^\d{1,6}$/.test(viewRaw) ? state.versions.find((v) => v.version === Number(viewRaw)) ?? null : null;

  return (
    <div className="grid gap-4">
      <PageHeader title={`Versions – ${state.title}`} crumbs={[{ label: "Legal pages", href: "/admin/legal" }, { label: state.title, href: `/admin/legal/${slug}` }, { label: "Versions" }]} lead="Every version is kept. Publishing or restoring makes a new version. Nothing is removed." />
      <ul className="te-versions" aria-label="Versions">
        {state.versions.map((v) => {
          const isPublished = state.published?.version === v.version;
          return (
            <li key={v.id} className="adm-rowcard">
              <div className="adm-rowcard-main">
                Version {v.version}{" "}
                {isPublished && <span className="adm-badge adm-badge-ok">Public now</span>}
                {v.status === "DRAFT" && <span className="adm-badge">{state.draft?.version === v.version ? "Draft waiting" : "Draft (not public)"}</span>}
                {v.status === "PUBLISHED" &&
                  (v.lawyerApproved ? <span className="adm-badge adm-badge-ok">Lawyer approved{v.approvedAt ? ` ${formatAdminDate(v.approvedAt)}` : ""}</span> : <span className="adm-badge lg-badge-warn">Not checked by a lawyer</span>)}
              </div>
              <div className="adm-rowcard-line">
                <span className="adm-rowcard-label">Saved</span>
                <span>
                  {state.fromFile ? "From the lawyer-approved file" : formatAdminDateTime(v.createdAt)} · {v.createdBy?.email ?? (v.id === "file" || v.version === 1 ? "import" : "an admin")}
                  {v.note ? ` · “${v.note}”` : ""}
                </span>
              </div>
              {v.publishedAt && (
                <div className="adm-rowcard-line">
                  <span className="adm-rowcard-label">Version date</span>
                  <span>{formatAdminDate(v.publishedAt)}</span>
                </div>
              )}
              <div className="adm-actions">
                <Link className="btn btn-outline" href={`${here}?v=${v.version}#viewer`} prefetch={false} aria-label={`View version ${v.version}`}>
                  View
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {selected && (
        <section id="viewer" className="te-preview" aria-labelledby="viewer-h" tabIndex={-1}>
          <h2 id="viewer-h">Version {selected.version} (read only)</h2>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0, fontFamily: "inherit" }}>{selected.body}</pre>
        </section>
      )}
      <div className="adm-actions">
        <Link className="btn btn-outline" href={`/admin/legal/${slug}`} prefetch={false}>
          Back to the editor
        </Link>
        <ConfirmDialog triggerLabel="Restore lawyer-approved version" title="Restore the lawyer-approved version?" message="The text the lawyer approved becomes public again. It is saved as a new version; nothing is removed." confirmLabel="Restore" action={restoreLawyerApprovedAction.bind(null, slug)} />
      </div>
    </div>
  );
}
