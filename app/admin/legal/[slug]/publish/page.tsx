import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LegalPublishPanel } from "@/components/admin/LegalPublishPanel";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, StatusMessage } from "@/components/admin/states";
import { DbNotice } from "@/components/ui/DbNotice";
import { Icon } from "@/components/ui/Icon";
import { loadLegalState } from "@/lib/admin/legal-service";
import { isLegalSlug } from "@/lib/legal";
import { diffWithContext, legalDateLabel, lineDiff, renderLegalBody, sameIgnoringDate, setLastUpdatedLine } from "@/lib/legal-versions";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import "@/components/admin/text-editor.css";
import { publishLegalAction } from "../../actions";

export const metadata: Metadata = { title: "Publish a legal page" };

const DONE: Record<string, { ok: boolean; text: string }> = {
  published: { ok: true, text: "Published. The public page shows this version now." },
  same: { ok: false, text: "The draft is the same as the lawyer-approved text, so there is nothing to publish. To go back to the approved text, use Restore lawyer-approved version in the editor." },
  confirm: { ok: false, text: 'Not published. Please tick "I understand this text is not checked by a lawyer".' },
  stale: { ok: false, text: "Not published. The page changed while you were here (a newer draft or version exists). Open the editor and check it." },
  invalid: { ok: false, text: "Not published. The draft does not pass today's checks (for example a rule number written by hand). Open the editor, fix it and save the draft again." },
  failed: { ok: false, text: "Sorry, that did not work. Try again." },
};

// The slug is only known at request time and login is needed: always rendered per request.
export const instant = false;

/** Wireframe A8: step 2 = diff against the lawyer-approved text, full preview, tick box, Publish. */
export default async function AdminLegalPublishPage({ params, searchParams }: PageProps<"/admin/legal/[slug]/publish">) {
  const { slug } = await params;
  await requireAdmin(`/admin/legal/${isLegalSlug(slug) ? slug : ""}/publish`);
  if (!isLegalSlug(slug)) notFound();
  const sp = await searchParams;
  const doneRaw = Array.isArray(sp.done) ? sp.done[0] : sp.done;
  const done = doneRaw && Object.hasOwn(DONE, doneRaw) ? DONE[doneRaw] : null;

  const state = await safeDb("admin legal publish", async () => {
    const { prisma } = await import("@/lib/prisma");
    return loadLegalState(prisma, slug);
  });
  if (!state) return <DbNotice what="this legal page" />;

  const now = new Date();
  const flash = done ? done.ok ? <StatusMessage href={`/legal/${slug}`} linkLabel="View page">{done.text}</StatusMessage> : (
    <div className="alert a-error" role="alert">
      <Icon name="error" />
      <div>
        <p>{done.text}</p>
      </div>
    </div>
  ) : null;

  const draft = state.draft;
  const approved = state.approved;
  let body: React.ReactNode;
  if (!draft || !approved) {
    body = (
      <EmptyState title="No draft is waiting." action={{ href: `/admin/legal/${slug}`, label: "Open the editor" }}>
        Edit the text and click Save draft first. Then come back here to see the changes.
      </EmptyState>
    );
  } else {
    const prepared = setLastUpdatedLine(draft.body, now);
    const d = lineDiff(approved.body, prepared.body);
    const same = sameIgnoringDate(draft.body, approved.body);
    body = same ? (
      <>
        <p role="status">The draft is the same as the lawyer-approved text. Publish is off.</p>
        <p>
          <Link className="btn btn-outline" href={`/admin/legal/${slug}`} prefetch={false}>
            Back to editing
          </Link>
        </p>
      </>
    ) : (
      <LegalPublishPanel
        slug={slug}
        version={String(draft.version)}
        diff={diffWithContext(d.lines, 2)}
        added={d.added}
        removed={d.removed}
        preview={renderLegalBody(prepared.body)}
        canPublish
        dateNote={prepared.found ? `When you publish, the line "Last updated" is set to ${legalDateLabel(now)}.` : 'This text has no "Last updated: ..." line. Only the version date at the bottom of the page is set.'}
        publishAction={publishLegalAction.bind(null, slug)}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <PageHeader title={`Publish – ${state.title}`} crumbs={[{ label: "Legal pages", href: "/admin/legal" }, { label: state.title, href: `/admin/legal/${slug}` }, { label: "Publish" }]} />
      <div className="alert a-error" role="note">
        <Icon name="error" />
        <div>
          <b>Changes are NOT checked by a lawyer.</b>
        </div>
      </div>
      {flash}
      {body}
    </div>
  );
}
