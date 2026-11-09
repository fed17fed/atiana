import type { Metadata } from "next";
import { AdminSlotForm } from "@/components/booking/AdminSlotForm";
import { LocalTime } from "@/components/booking/LocalTime";
import { DbNotice } from "@/components/ui/DbNotice";
import { seatTaken } from "@/lib/catalog-queries";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "1:1 slots" };

export default async function AdminSlotsPage() {
  await requireAdmin("/admin/slots");
  const data = await safeDb("admin slots", async () => {
    const { prisma } = await import("@/lib/prisma");
    const offerings = await prisma.offering.findMany({ where: { type: "ONE_TO_ONE", published: true }, select: { id: true, title: true }, orderBy: { title: "asc" } });
    const slots = await prisma.classSession.findMany({
      where: { offering: { type: "ONE_TO_ONE", published: true }, startsAt: { gt: new Date() }, status: "SCHEDULED" },
      orderBy: { startsAt: "asc" },
      take: 60,
      include: { offering: { select: { title: true } }, _count: { select: { bookings: { where: seatTaken(new Date()) } } } },
    });
    return { offerings, slots };
  });
  if (!data) return <DbNotice what="the slot list" />;
  return (
    <div className="grid gap-8">
      <div>
        <h1>1:1 slots</h1>
        <p className="lead">Add free times for 1:1 sessions. A slot can be booked by one person only.</p>
        <AdminSlotForm offerings={data.offerings} />
      </div>
      <section aria-labelledby="up-slots">
        <h2 id="up-slots" className="!text-2xl">Upcoming slots (next 60)</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr><th>When</th><th>Offering</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.slots.map((s) => (
                <tr key={s.id}>
                  <td><LocalTime iso={s.startsAt.toISOString()} format="dayTime" /></td>
                  <td>{s.offering.title}</td>
                  <td>{s._count.bookings > 0 ? "Booked" : "Free"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
