import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { TextEditor } from "@/components/admin/TextEditor";
import { DbNotice } from "@/components/ui/DbNotice";
import { Icon } from "@/components/ui/Icon";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin/format";
import { loadLegalState } from "@/lib/admin/legal-service";
import { isLegalSlug } from "@/lib/legal";
import { LEGAL_MAX_LENGTH } from "@/lib/legal-versions";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import { ALL_TOKENS, RULE_TOKENS } from "@/lib/text-tokens";

export const metadata: Metadata = { title: "Edit a legal page" };

const DONE: Record<string, { ok: boolean; text: string }> = {
  restored: { ok: true, text: "The lawyer-approved text is public again (saved as a new version)." },
  nochange: { ok: true, text: "Nothing to change: the newest version is already the lawyer-approved text." },
  failed: { ok: false, text: "Sorry, that did not work. Try again." },
};

// The slug is only known at request time and login is needed: always rendered per request.
export const instant = false;

/** Wireframe A7: step 1 = a draft. Same editor as the other texts (Markdown box + preview), red warning, no Publish button here. */
export default async function AdminLegalEditPage({ params, searchParams }: PageProps<"/admin/legal/[slug]">) {
  const { slug } = await params;
  await requireAdmin(`/admin/legal/${isLegalSlug(slug) ? slug : ""}`);
  if (!isLegalSlug(slug)) notFound();
  const sp = await searchParams;
  const doneRaw = Array.isArray(sp.done) ? sp.done[0] : sp.done;
  const nonceRaw = Array.isArray(sp.n) ? sp.n[0] : sp.n;
  const nonce = typeof nonceRaw === "string" && /^\d{1,16}$/.test(nonceRaw) ? nonceRaw : "0";
  const done = doneRaw && Object.hasOwn(DONE, doneRaw) ? DONE[doneRaw] : null;

  const state = await safeDb("admin legal edit", async () => {
    const { prisma } = await import("@/lib/prisma");
    return loadLegalState(prisma, slug);
  });
  if (!state) return <DbNotice what="this legal page" />;
  const start = state.draft ?? state.published ?? state.versions[0];
  const approvedOn = state.approved?.approvedAt ? formatAdminDate(state.approved.approvedAt) : null;
  const tokens = Object.keys(ALL_TOKENS).map((name) => ({ name, value: ALL_TOKENS[name], rule: Object.hasOwn(RULE_TOKENS, name) }));

  return (
    <div className="grid gap-4">
      <PageHeader title={`Legal – ${state.title}`} crumbs={[{ label: "Legal pages", href: "/admin/legal" }, { label: state.title }]} />
      <div className="alert a-error" role="note">
        <Icon name="error" />
        <div>
          <b>
            {approvedOn ? `The lawyer approved the current text on ${approvedOn}. ` : "The lawyer approved the text of this page. "}
            Changes are NOT checked by a lawyer.
          </b>
          <p>
            {state.draft ? "You are editing the draft. It is not public." : "You are editing a copy of the published text. Save draft keeps it private. Publishing is the next step."}
          </p>
        </div>
      </div>
      <TextEditor
        key={nonce}
        flash={done}
        entry={{ key: slug, label: state.title, kind: "MARKDOWN", pageLabel: "Legal", pagePath: `/legal/${slug}`, multiline: true, maxLength: LEGAL_MAX_LENGTH, defaultText: "" }}
        initialValue={start.body}
        initialVersion={String(state.maxVersion)}
        edited={!!state.draft}
        lastSaved={state.draft ? `${formatAdminDateTime(state.draft.createdAt)} by ${state.draft.createdBy?.email ?? "an admin"}` : null}
        tokens={tokens}
        legal={{ slug, draftWaiting: !!state.draft }}
      />
    </div>
  );
}
