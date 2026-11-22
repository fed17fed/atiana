import type { Metadata } from "next";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatusMessage } from "@/components/admin/states";
import { AdminSlotZoomForm } from "@/components/booking/AdminSlotZoomForm";
import { AdminSlotForm } from "@/components/booking/AdminSlotForm";
import { DbNotice } from "@/components/ui/DbNotice";
import { DEMO_ZOOM_URL } from "@/content/catalog";
import { seatTaken } from "@/lib/catalog-queries";
import { formatAdminDateTime } from "@/lib/admin/format";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";
import { zonedToUtc } from "@/lib/time";
import { setSlotHidden } from "./actions";

export const metadata: Metadata = { title: "1:1 slots" };

const SLOT_LIMIT = 100;
const FLASH: Record<string, { ok: boolean; text: string }> = {
  hidden: { ok: true, text: "Hidden. Nobody can book this slot now. You can restore it." },
  restored: { ok: true, text: "Restored. The slot can be booked again." },
  blocked: { ok: false, text: "This slot is booked, so it was not hidden. Contact the client first." },
  failed: { ok: false, text: "Sorry, that did not work. Try again." },
};

export default async function AdminSlotsPage({ searchParams }: PageProps<"/admin/slots">) {
  await requireAdmin("/admin/slots");
  const sp = await searchParams;
  const flashKey = Array.isArray(sp.saved) ? sp.saved[0] : sp.saved;
  const flash = flashKey ? FLASH[flashKey] : undefined;
  // Optional "show from" date (Dublin day). Without it: from now. Far-away slots are reachable with this filter (the list is limited).
  const fromRaw = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const fromDay = typeof fromRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : "";
  const data = await safeDb("admin slots", async () => {
    const { prisma } = await import("@/lib/prisma");
    const offerings = await prisma.offering.findMany({ where: { type: "ONE_TO_ONE", published: true }, select: { id: true, title: true, mode: true }, orderBy: { title: "asc" } });
    const now = new Date();
    const [y, m, d] = (fromDay || "2000-01-01").split("-").map(Number);
    const from = fromDay ? zonedToUtc({ year: y, month: m, day: d }) : now;
    const slots = await prisma.classSession.findMany({
      where: { offering: { type: "ONE_TO_ONE", published: true }, startsAt: { gt: from.getTime() > now.getTime() ? from : now } },
      orderBy: { startsAt: "asc" },
      take: SLOT_LIMIT,
      include: { offering: { select: { title: true, mode: true } }, _count: { select: { bookings: { where: seatTaken(new Date()) } } } },
    });
    return { offerings, slots };
  });
  if (!data) return <DbNotice what="the slot list" />;
  return (
    <div className="grid gap-8">
      <div className="min-w-0">
        <PageHeader title="1:1 slots" crumbs={[{ label: "1:1 slots" }]} lead="Add free times for 1:1 sessions. A slot can be booked by one person only. Hide a free slot to stop bookings; you can restore it." />
        {flash && (flash.ok ? <StatusMessage>{flash.text}</StatusMessage> : <div className="alert a-error" role="alert"><p>{flash.text}</p></div>)}
        <AdminSlotForm offerings={data.offerings} />
      </div>
      <section aria-labelledby="up-slots" className="min-w-0">
        <h2 id="up-slots" className="!text-2xl">Upcoming slots (next {SLOT_LIMIT})</h2>
        <form method="get" action="/admin/slots" className="adm-filter" aria-label="Show slots from a day">
          <div className="field">
            <label htmlFor="f-from">Show from (Europe/Dublin)</label>
            <input id="f-from" name="from" type="date" className="input" defaultValue={fromDay} />
          </div>
          <button type="submit" className="btn btn-outline">Apply filter</button>
        </form>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr><th>When (Europe/Dublin)</th><th>Offering</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {data.slots.map((s) => (
                <tr key={s.id}>
                  <td>{formatAdminDateTime(s.startsAt)}</td>
                  <td>{s.offering.title}</td>
                  <td>{s.status === "CANCELLED" ? "Hidden" : s._count.bookings > 0 ? "Booked" : "Free"}</td>
                  <td>
                    <span className="adm-actions">
                      {s.status === "CANCELLED" ? (
                        <form action={setSlotHidden.bind(null, s.id, false, fromDay)}>
                          <button type="submit" className="btn btn-outline">Restore</button>
                        </form>
                      ) : s._count.bookings > 0 ? (
                        <span className="adm-badge">Hide off: booked</span>
                      ) : (
                        <ConfirmDialog
                          triggerLabel="Hide"
                          title="Hide this slot?"
                          message="Nobody can book it while it is hidden. You can restore it."
                          confirmLabel="Hide"
                          action={setSlotHidden.bind(null, s.id, true, fromDay)}
                        />
                      )}
                      {s.status !== "CANCELLED" && s.offering.mode === "ONLINE" && <AdminSlotZoomForm id={s.id} initialUrl={s.zoomUrl && s.zoomUrl !== DEMO_ZOOM_URL ? s.zoomUrl : ""} />}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
