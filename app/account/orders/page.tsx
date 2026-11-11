import type { Metadata } from "next";
import Link from "next/link";
import { DbNotice } from "@/components/ui/DbNotice";
import { getMyOrders } from "@/lib/account-queries";
import { formatEuro } from "@/lib/orders-service";
import { holdCutoff } from "@/lib/booking-rules";
import { safeDb } from "@/lib/safe";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "My orders" };

const STATUS: Record<string, { label: string; cls: string }> = {
  PAID: { label: "Paid", cls: "s-confirmed" },
  PENDING: { label: "Waiting for payment", cls: "s-pending" },
  REFUNDED: { label: "Refunded", cls: "s-past" },
  CANCELLED: { label: "Cancelled", cls: "s-cancelled" },
};

export default async function OrdersPage() {
  const user = await requireUser("/account/orders");
  const orders = await safeDb("my orders", async () => {
    const { prisma } = await import("@/lib/prisma");
    return getMyOrders(prisma, user.id);
  });
  if (!orders) return <DbNotice what="your orders" />;

  if (orders.length === 0) {
    return (
      <div className="empty">
        <h2>No orders yet</h2>
        <p>Your payments will appear here.</p>
        <Link className="btn btn-primary" href="/schedule">
          See the schedule
        </Link>
      </div>
    );
  }
  return (
    <ul className="acc-list">
      {orders.map((o) => {
        const stale = o.status === "PENDING" && o.createdAt < holdCutoff(new Date());
        const st = stale ? { label: "Not completed", cls: "s-cancelled" } : STATUS[o.status];
        return (
          <li className="acc-card" key={o.id}>
            <div className="row">
              <h2>{o.items.map((i) => i.description).join(", ") || "Order"}</h2>
              <span className={`status ${st.cls}`}>{st.label}</span>
            </div>
            <div className="meta">
              <span>{formatDate(o.createdAt, "Europe/Dublin", { day: "numeric", month: "long", year: "numeric" })}</span>
              <span>
                <b>{formatEuro(o.totalCents, o.currency)}</b>
              </span>
              <span>Order {o.id.slice(-8)}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
