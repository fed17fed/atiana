import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/PageHeader";
import { TextEditor } from "@/components/admin/TextEditor";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDateTime } from "@/lib/admin/format";
import { cleanKey, getTextEntry } from "@/lib/admin/text-registry";
import { effectiveValue, isEdited, versionOf } from "@/lib/admin/text-service";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import { ALL_TOKENS, RULE_TOKENS } from "@/lib/text-tokens";

export const metadata: Metadata = { title: "Edit a text" };

const DONE: Record<string, { ok: boolean; text: string }> = {
  default: { ok: true, text: "Back to the default text. Visible on the site now." },
  nochange: { ok: true, text: "Nothing to change: this text already uses the default." },
  failed: { ok: false, text: "Sorry, that did not work. Try again." },
};

// The key is only known at request time and login is needed: always rendered per request, so a blocking route is fine here.
export const instant = false;

/** Wireframe A4: one text, Markdown-like box + live preview. */
export default async function AdminTextEditPage({ params, searchParams }: PageProps<"/admin/texts/[key]">) {
  const { key: rawKey } = await params;
  const key = cleanKey(rawKey);
  await requireAdmin(`/admin/texts/${key ?? ""}`);
  const entry = key ? getTextEntry(key) : null;
  if (!entry) notFound();
  const sp = await searchParams;
  const doneRaw = Array.isArray(sp.done) ? sp.done[0] : sp.done;
  const nonceRaw = Array.isArray(sp.n) ? sp.n[0] : sp.n;
  const nonce = typeof nonceRaw === "string" && /^\d{1,16}$/.test(nonceRaw) ? nonceRaw : "0";
  const done = doneRaw && Object.hasOwn(DONE, doneRaw) ? DONE[doneRaw] : null;

  const block = await safeDb("admin text edit", async () => {
    const { prisma } = await import("@/lib/prisma");
    return { row: await prisma.contentBlock.findUnique({ where: { key: entry.key }, select: { value: true, updatedAt: true, updatedBy: { select: { email: true } } } }) };
  });
  if (!block) return <DbNotice what="this text" />;
  const row = block.row;
  const edited = isEdited(row, entry);
  const version = versionOf(row);
  const tokens = Object.keys(ALL_TOKENS).map((name) => ({ name, value: ALL_TOKENS[name], rule: Object.hasOwn(RULE_TOKENS, name) }));

  return (
    <div className="grid gap-4">
      <PageHeader title={entry.label} crumbs={[{ label: "Texts", href: "/admin/texts" }, { label: entry.label }]} />
      {/* key = n (set by "Back to default"): the editor starts fresh with the default text. A normal save does NOT change the key, so the "Saved" message stays. */}
      <TextEditor
        key={nonce}
        flash={done}
        entry={{ key: entry.key, label: entry.label, kind: entry.kind, pageLabel: entry.pageLabel, pagePath: entry.pagePath, multiline: entry.multiline, maxLength: entry.maxLength, defaultText: entry.defaultText }}
        initialValue={effectiveValue(row, entry)}
        initialVersion={version}
        edited={edited}
        lastSaved={row && edited ? `${formatAdminDateTime(row.updatedAt)} by ${row.updatedBy?.email ?? "an admin"}` : null}
        tokens={tokens}
      />
    </div>
  );
}
