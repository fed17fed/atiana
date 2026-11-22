import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { DataList } from "@/components/admin/DataList";
import { PageHeader } from "@/components/admin/PageHeader";
import { EmptyState, StatusMessage } from "@/components/admin/states";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDateTime } from "@/lib/admin/format";
import { cleanPage, cleanParam } from "@/lib/admin/read-queries";
import { countSessions, listSessionOfferings, listSessions, SESSIONS_PAGE_SIZE } from "@/lib/admin/sessions-service";
import { SESSION_KIND_LABEL } from "@/lib/admin/sessions-schema";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import { setSessionCancelled } from "./actions";

export const metadata: Metadata = { title: "Sessions" };

const FLASH_OK: Record<string, string> = {
  cancelled: "Cancelled. It is off the site. You can restore it if the time is still in the future.",
  restored: "Restored. It is on the site again.",
  none: "Nothing was added: all these times already exist.",
};
const FLASH_ERR: Record<string, string> = {
  blocked: "This session has bookings, so it was not cancelled. Open the session to see who booked.",
  failed: "Sorry, that did not work. Try again.",
};

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function flashFor(key: string | undefined): { ok: boolean; text: string } | null {
  if (!key) return null;
  const m = /^created-(\d{1,2})$/.exec(key);
  if (m) return { ok: true, text: `Added ${m[1]} session${m[1] === "1" ? "" : "s"}. ${Number(m[1]) === 1 ? "It is" : "They are"} on the site now.` };
  if (FLASH_OK[key]) return { ok: true, text: FLASH_OK[key] };
  if (FLASH_ERR[key]) return { ok: false, text: FLASH_ERR[key] };
  return null;
}

export default async function AdminSessionsPage({ searchParams }: PageProps<"/admin/sessions">) {
  await requireAdmin("/admin/sessions");
  const sp = await searchParams;
  const flash = flashFor(first(sp.saved));
  const when = first(sp.when) === "past" ? "past" : "upcoming";
  const statusRaw = first(sp.status) ?? "";
  const status = statusRaw === "open" ? "SCHEDULED" : statusRaw === "cancelled" ? "CANCELLED" : undefined;
  const offeringRaw = cleanParam(sp.offering, 60) ?? ""; // control characters removed (N19-1); an unknown id simply finds nothing

  const pageRaw = cleanPage(sp.page);
  const nowDate = new Date(); // one "now" for the count and the list, so pages agree
  const data = await safeDb("admin sessions", async () => {
    const { prisma } = await import("@/lib/prisma");
    const opts = { offeringId: offeringRaw || undefined, when, status, now: nowDate } as const;
    const [offerings, total, rows] = await Promise.all([listSessionOfferings(prisma), countSessions(prisma, opts), listSessions(prisma, { ...opts, page: pageRaw })]);
    return { offerings, total, rows };
  });
  if (!data) return <DbNotice what="the sessions" />;
  const now = nowDate.getTime();
  const pages = Math.max(1, Math.ceil(data.total / SESSIONS_PAGE_SIZE));
  const page = Math.min(pageRaw, pages);
  const pageHref = (p: number) =>
    `/admin/sessions?${new URLSearchParams({ ...(offeringRaw ? { offering: offeringRaw } : {}), ...(when === "past" ? { when: "past" } : {}), ...(statusRaw ? { status: statusRaw } : {}), ...(p > 1 ? { page: String(p) } : {}) }).toString()}`.replace(/\?$/, "");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Sessions"
        crumbs={[{ label: "Sessions" }]}
        lead="Dates and times of classes and events. Times are in your time zone (Europe/Dublin). 1:1 times are on the 1:1 slots page. Nothing is removed: a session is cancelled, and can be restored."
      />
      {flash && (flash.ok ? <StatusMessage>{flash.text}</StatusMessage> : <div className="alert a-error" role="alert"><p>{flash.text}</p></div>)}
      <div>
        <Link className="btn btn-primary" href="/admin/sessions/new" prefetch={false}>
          Add session
        </Link>
      </div>
      <form method="get" action="/admin/sessions" className="adm-filter" aria-label="Filter the list">
        <div className="field">
          <label htmlFor="f-off">Class or event</label>
          <select id="f-off" name="offering" className="input select" defaultValue={offeringRaw}>
            <option value="">All</option>
            {data.offerings.map((o) => (
              <option key={o.id} value={o.id}>{o.title}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-when">When</label>
          <select id="f-when" name="when" className="input select" defaultValue={when}>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" name="status" className="input select" defaultValue={statusRaw}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <button type="submit" className="btn btn-outline">Apply filter</button>
      </form>
      <p role="status" className="hint">{data.total === 0 ? "0 results" : `${data.total} result${data.total === 1 ? "" : "s"}. Page ${page} of ${pages}. ${when === "past" ? "Latest first." : "Soonest first."}`}</p>
      {data.rows.length === 0 && data.total > 0 ? (
        <EmptyState title="This page is empty." action={{ href: pageHref(1), label: "Go to page 1" }} />
      ) : data.rows.length === 0 ? (
        <EmptyState title="No sessions yet." action={{ href: "/admin/sessions/new", label: "Add session" }}>
          {when === "past" ? "There are no past sessions for this filter." : "Add your first session. Until a class has a session, the schedule shows nothing for it."}
        </EmptyState>
      ) : (
        <DataList
          caption="Sessions of classes and events"
          rows={data.rows}
          rowKey={(r) => r.id}
          columns={[
            { header: "Date (Dublin)", primary: true, render: (r) => formatAdminDateTime(r.startsAt) },
            { header: "Class or event", render: (r) => <>{r.title} <span className="adm-badge">{SESSION_KIND_LABEL[r.kind]}</span></> },
            { header: "Booked", render: (r) => `${r.booked} / ${r.capacity}` },
            {
              header: "Status",
              render: (r) =>
                r.status === "CANCELLED" ? (
                  <span className="adm-badge">Cancelled</span>
                ) : r.endsAt.getTime() <= now || r.startsAt.getTime() <= now ? (
                  <span className="adm-badge">Past</span>
                ) : r.booked >= r.capacity ? (
                  <span className="adm-badge adm-badge-ok">Full</span>
                ) : (
                  <span className="adm-badge adm-badge-ok">Open</span>
                ),
            },
            { header: "Zoom", render: (r) => (r.online ? (r.hasZoom ? "Set" : "Missing") : "–") },
            {
              header: "Actions",
              render: (r) => {
                const future = r.startsAt.getTime() > now;
                return (
                  <span className="adm-actions">
                    <Link className="btn btn-outline" href={`/admin/sessions/${r.id}`} prefetch={false} aria-label={`${future ? "Edit" : "View"} ${r.title}, ${formatAdminDateTime(r.startsAt)}`}>
                      {future ? "Edit" : "View"}
                    </Link>
                    {future && r.status === "CANCELLED" && (
                      <form action={setSessionCancelled.bind(null, r.id, false)}>
                        <button type="submit" className="btn btn-outline" aria-label={`Restore ${r.title}, ${formatAdminDateTime(r.startsAt)}`}>Restore</button>
                      </form>
                    )}
                    {future && r.status === "SCHEDULED" && r.booked === 0 && (
                      <ConfirmDialog
                        triggerLabel="Cancel session"
                        title="Cancel this session?"
                        message="It will disappear from the site. You can restore it later if the time is still in the future."
                        confirmLabel="Cancel session"
                        action={setSessionCancelled.bind(null, r.id, true)}
                      />
                    )}
                    {future && r.status === "SCHEDULED" && r.booked > 0 && <span className="adm-badge">Cancel off: has bookings</span>}
                  </span>
                );
              },
            },
          ]}
        />
      )}
      {pages > 1 && (
        <nav aria-label="Pages" className="adm-pager">
          {page > 1 && <Link className="btn btn-outline" href={pageHref(page - 1)} prefetch={false}>Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link className="btn btn-outline" href={pageHref(page + 1)} prefetch={false}>Next</Link>}
        </nav>
      )}
    </div>
  );
}
