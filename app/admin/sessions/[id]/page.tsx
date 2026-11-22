import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PageHeader } from "@/components/admin/PageHeader";
import { SessionForm } from "@/components/admin/SessionForm";
import { DbNotice } from "@/components/ui/DbNotice";
import { formatAdminDateTime } from "@/lib/admin/format";
import { dublinDateAndTime } from "@/lib/admin/sessions-schema";
import { blockedMessage, getSessionForEdit, listSeatHolders } from "@/lib/admin/sessions-service";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import { setSessionCancelled } from "../actions";

export const metadata: Metadata = { title: "Edit session" };

// The id is only known at request time. This page is always rendered per request (login needed), so a blocking route is fine here.
export const instant = false;

export default async function EditSessionPage({ params }: PageProps<"/admin/sessions/[id]">) {
  const { id } = await params;
  await requireAdmin(`/admin/sessions/${id}`);
  const data = await safeDb("admin session", async () => {
    const { prisma } = await import("@/lib/prisma");
    const found = await getSessionForEdit(prisma, id);
    const holders = found ? await listSeatHolders(prisma, id) : [];
    return { found, holders };
  });
  if (!data) return <DbNotice what="this session" />;
  const s = data.found;
  if (!s || (s.offering.type !== "GROUP_CLASS" && s.offering.type !== "EVENT")) notFound();
  const kind = s.offering.type;
  const started = s.startsAt.getTime() <= new Date().getTime();
  const cancelled = s.status === "CANCELLED";
  const { date, time } = dublinDateAndTime(s.startsAt);
  const minutes = Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000);
  const readOnlyReason = started ? "This session has started or is in the past. It is read only." : cancelled ? "This session is cancelled. Restore it from the list to edit it." : undefined;

  return (
    <div className="grid gap-6">
      <PageHeader title={`Session: ${s.offering.title}`} crumbs={[{ label: "Sessions", href: "/admin/sessions" }, { label: formatAdminDateTime(s.startsAt) }]} />
      <SessionForm
        offerings={[]}
        fixedOffering={{ title: s.offering.title, kind, online: s.offering.mode === "ONLINE", published: s.offering.published }}
        readOnlyReason={readOnlyReason}
        initialValues={{ id: s.id, version: String(s.updatedAt.getTime()), offeringId: s.offering.id, date, time, minutes: String(minutes), capacity: String(s.capacity), zoomUrl: s.zoomUrl ?? "" }}
      />
      {!started && !cancelled && (
        <section aria-labelledby="cancel-h" className="adm-fieldset" style={{ maxWidth: 640 }}>
          <h2 id="cancel-h" className="!text-2xl">Cancel this session</h2>
          {data.holders.length === 0 ? (
            <>
              <p>Nobody has booked this session, so you can cancel it. It will disappear from the site.</p>
              <div>
                <ConfirmDialog
                  triggerLabel="Cancel session"
                  title="Cancel this session?"
                  message="It will disappear from the site. You can restore it later if the time is still in the future."
                  confirmLabel="Cancel session"
                  action={setSessionCancelled.bind(null, s.id, true)}
                />
              </div>
            </>
          ) : (
            <>
              <p role="status">{blockedMessage(data.holders.length)}</p>
              <p className="hint">Cancel is off while a session has bookings. Cancelling with bookings, and refunds, need a rule from the owner first.</p>
              <ul className="adm-list">
                {data.holders.map((h) => (
                  <li key={h.id}>
                    {h.name ? `${h.name}, ` : ""}
                    {h.email} ({h.status === "PENDING" ? "payment not finished" : "booked"})
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
