import type { Metadata } from "next";
import Link from "next/link";
import { DbNotice } from "@/components/ui/DbNotice";
import { getMyOrders } from "@/lib/account-queries";
import { formatEuro } from "@/lib/orders-service";
import { safeDb } from "@/lib/safe";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "My orders" };

const STATUS: Record<string, { label: string; cls: string }> = {
  PAID: { label: "Paid", cls: "s-confirmed" },
  PENDING: { label: "Waiting for payment", cls: "s-pending" },
  SHIPPED: { label: "Shipped", cls: "s-confirmed" },
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
        <h3>No orders yet</h3>
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
        const st = STATUS[o.status];
        return (
          <li className="acc-card" key={o.id}>
            <div className="row">
              <h3>{o.items.map((i) => i.description).join(", ") || "Order"}</h3>
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
