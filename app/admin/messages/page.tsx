import type { Metadata } from "next";
import { DataList } from "@/components/admin/DataList";
import { ReadViewFrame } from "@/components/admin/ReadView";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDateTime } from "@/lib/admin/format";
import { cleanPage, cleanQuery, listMessages } from "@/lib/admin/read-queries";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import { markMessageReadAction, markMessageUnreadAction } from "./actions";

export const metadata: Metadata = { title: "Messages" };

export default async function AdminMessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  await requireAdmin("/admin/messages");
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const page = cleanPage(sp.page);
  const data = await safeDb("admin messages", async () => {
    const { prisma } = await import("@/lib/prisma");
    return listMessages(prisma, { q, page });
  });
  if (!data) return <DbNotice what="the message list" />;
  return (
    <ReadViewFrame title="Messages" lead={`Messages from the contact form, newest first. ${data.unread} unread. You can mark a message as read or as unread. Nothing is removed.`} basePath="/admin/messages" q={q} page={page} total={data.total} rowCount={data.rows.length} emptyTitle="No messages yet." emptyText="When someone uses the contact form, the message appears here.">
      <DataList
        caption="Contact messages"
        rows={data.rows}
        rowKey={(r) => r.id}
        columns={[
          { header: "From", primary: true, render: (r) => r.name },
          { header: "Status", render: (r) => (r.readAt ? <span className="adm-badge">Read</span> : <span className="adm-badge adm-badge-demo">Unread</span>) },
          { header: "Email", render: (r) => r.email },
          { header: "Received", render: (r) => formatAdminDateTime(r.createdAt) },
          {
            header: "Message",
            render: (r) => (
              // React escapes the text (no HTML from a visitor is ever rendered). pre-wrap keeps the line breaks.
              <details>
                <summary>{r.message.length > 80 ? `${r.message.replace(/\s+/g, " ").slice(0, 79)}…` : r.message.replace(/\s+/g, " ")}</summary>
                <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{r.message}</p>
              </details>
            ),
          },
          {
            header: "Action",
            render: (r) =>
              r.readAt ? (
                <form action={markMessageUnreadAction.bind(null, r.id)}>
                  <button type="submit" className="btn btn-outline" aria-label={`Mark as unread: message from ${r.name}`}>
                    Mark as unread
                  </button>
                </form>
              ) : (
                <form action={markMessageReadAction.bind(null, r.id)}>
                  <button type="submit" className="btn btn-outline" aria-label={`Mark as read: message from ${r.name}`}>
                    Mark as read
                  </button>
                </form>
              ),
          },
        ]}
      />
    </ReadViewFrame>
  );
}
