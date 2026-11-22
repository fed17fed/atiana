import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, StatusMessage } from "@/components/admin/states";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDateTime } from "@/lib/admin/format";
import { cleanKey, getTextEntry } from "@/lib/admin/text-registry";
import { listRevisions } from "@/lib/admin/text-service";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import "@/components/admin/text-editor.css";
import { restoreTextAction } from "../../actions";

export const metadata: Metadata = { title: "Text history" };

const DONE: Record<string, { ok: boolean; text: string }> = {
  restored: { ok: true, text: "Version restored as a new version. Visible on the site now." },
  nochange: { ok: true, text: "Nothing to change: the site already shows this text." },
  invalid: { ok: false, text: "This old version does not pass today's checks (for example a rule number written by hand), so it was not restored." },
  failed: { ok: false, text: "Sorry, that did not work. Try again." },
};

// The key is only known at request time and login is needed: always rendered per request, so a blocking route is fine here.
export const instant = false;

/** Wireframe A5: all versions, newest first. "View" shows an old text read only (?v=id). "Restore" makes a NEW version. Nothing is removed. */
export default async function AdminTextHistoryPage({ params, searchParams }: PageProps<"/admin/texts/[key]/history">) {
  const { key: rawKey } = await params;
  const key = cleanKey(rawKey);
  await requireAdmin(`/admin/texts/${key ?? ""}/history`);
  const entry = key ? getTextEntry(key) : null;
  if (!entry) notFound();
  const sp = await searchParams;
  const doneRaw = Array.isArray(sp.done) ? sp.done[0] : sp.done;
  const done = doneRaw && Object.hasOwn(DONE, doneRaw) ? DONE[doneRaw] : null;
  const viewRaw = Array.isArray(sp.v) ? sp.v[0] : sp.v;

  const revisions = await safeDb("admin text history", async () => {
    const { prisma } = await import("@/lib/prisma");
    return listRevisions(prisma, entry.key);
  });
  if (!revisions) return <DbNotice what="the history" />;

  const selected = viewRaw === "default" ? { id: "default", text: entry.defaultText, title: "Default from code" } : (() => {
    const r = revisions.find((x) => x.id === viewRaw);
    return r ? { id: r.id, text: r.value, title: formatAdminDateTime(r.createdAt) } : null;
  })();
  const here = `/admin/texts/${entry.key}/history`;

  return (
    <div className="grid gap-4">
      <PageHeader title={`History – ${entry.label}`} crumbs={[{ label: "Texts", href: "/admin/texts" }, { label: entry.label, href: `/admin/texts/${entry.key}` }, { label: "History" }]} lead="Every change is kept. Restoring an old version makes a new version. Nothing is removed." />
      {done && (done.ok ? <StatusMessage href={entry.pagePath} linkLabel="View page">{done.text}</StatusMessage> : <div className="alert a-error" role="alert"><div><p>{done.text}</p></div></div>)}
      {revisions.length === 0 ? (
        <EmptyState title="This text was never changed. It uses the default." action={{ href: `/admin/texts/${entry.key}`, label: "Edit this text" }} />
      ) : (
        <ul className="te-versions" aria-label="Versions">
          {revisions.map((r, i) => (
            <li key={r.id} className="adm-rowcard">
              <div className="adm-rowcard-main">
                {formatAdminDateTime(r.createdAt)} {i === 0 && <span className="adm-badge adm-badge-ok">Current</span>}
              </div>
              <div className="adm-rowcard-line">
                <span className="adm-rowcard-label">By</span>
                <span>{r.createdBy?.email ?? "an admin"}{r.note ? ` · “${r.note}”` : ""}</span>
              </div>
              <div className="adm-actions">
                <Link className="btn btn-outline" href={`${here}?v=${r.id}#viewer`} prefetch={false}>View</Link>
                {i > 0 && (
                  <ConfirmDialog triggerLabel="Restore this version" title="Restore this version?" message="It becomes a new version and the site shows it. The current text stays in the history." confirmLabel="Restore" action={restoreTextAction.bind(null, entry.key, r.id)} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="adm-rowcard">
        <div className="adm-rowcard-main">Default from code</div>
        <div className="adm-actions">
          <Link className="btn btn-outline" href={`${here}?v=default#viewer`} prefetch={false}>View</Link>
          <ConfirmDialog triggerLabel="Restore the default" title="Go back to the default text?" message="The site will show the original text again. This is saved as a new version." confirmLabel="Restore" action={restoreTextAction.bind(null, entry.key, "default")} />
        </div>
      </div>
      {selected && (
        <section id="viewer" className="te-preview" aria-labelledby="viewer-h" tabIndex={-1}>
          <h2 id="viewer-h">Selected version (read only): {selected.title}</h2>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0, fontFamily: "inherit" }}>{selected.text}</pre>
        </section>
      )}
      <p>
        <Link className="btn btn-outline" href={`/admin/texts/${entry.key}`} prefetch={false}>Back to the editor</Link>
      </p>
    </div>
  );
}
