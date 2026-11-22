import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminCard, CardSkeleton } from "@/components/admin/AdminCard";
import { PageHeader } from "@/components/admin/PageHeader";
import { LegalOverviewCard } from "@/components/admin/LegalOverviewCard";
import { CardError, EmptyState } from "@/components/admin/states";
import { formatAdminDate, formatAdminDateTime } from "@/lib/admin/format";
import { getNewBookings, getNewMessages, getNextSessions, OVERVIEW_DAYS } from "@/lib/admin/overview";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminPage() {
  await requireAdmin("/admin");
  return (
    <>
      <PageHeader title="Overview" lead="What needs your attention." />
      <div className="adm-cards">
        <Suspense fallback={<CardSkeleton label="next sessions" />}>
          <NextSessionsCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton label="new bookings" />}>
          <BookingsCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton label="new messages" />}>
          <MessagesCard />
        </Suspense>
        <Suspense fallback={<CardSkeleton label="legal pages" />}>
          <LegalOverviewCard />
        </Suspense>
      </div>
      <div className="adm-quick">
        <Link className="btn btn-primary" href="/admin/slots">
          Add 1:1 slots
        </Link>
        <Link className="btn btn-outline" href="/admin/texts">
          Edit a text
        </Link>
        <Link className="btn btn-outline" href="/admin/sessions/new" prefetch={false}>
          Add a session
        </Link>
      </div>
    </>
  );
}

async function NextSessionsCard() {
  const rows = await safeDb("admin overview sessions", async () => {
    const { prisma } = await import("@/lib/prisma");
    return getNextSessions(prisma);
  });
  return (
    <AdminCard id="card-sessions" title={`Next sessions (${OVERVIEW_DAYS} days)`}>
      {rows === null ? (
        <CardError retryHref="/admin" />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing new">No sessions in the next {OVERVIEW_DAYS} days.</EmptyState>
      ) : (
        <ul className="adm-list">
          {rows.map((s) => (
            <li key={s.id}>
              {formatAdminDateTime(s.startsAt)} – {s.title}: {s.booked} / {s.capacity} booked
            </li>
          ))}
        </ul>
      )}
    </AdminCard>
  );
}

async function BookingsCard() {
  const data = await safeDb("admin overview bookings", async () => {
    const { prisma } = await import("@/lib/prisma");
    return getNewBookings(prisma);
  });
  return (
    <AdminCard id="card-bookings" title={`New bookings (${OVERVIEW_DAYS} days)`}>
      {data === null ? (
        <CardError retryHref="/admin" />
      ) : data.count === 0 ? (
        <EmptyState title="Nothing new">No new bookings.</EmptyState>
      ) : (
        <>
          <p>{data.count} new booking{data.count === 1 ? "" : "s"}.</p>
          <ul className="adm-list">
            {data.latest.map((b) => (
              <li key={b.id}>
                {b.title} on {formatAdminDateTime(b.startsAt)} (booked {formatAdminDate(b.createdAt)})
              </li>
            ))}
          </ul>
        </>
      )}
    </AdminCard>
  );
}

async function MessagesCard() {
  const data = await safeDb("admin overview messages", async () => {
    const { prisma } = await import("@/lib/prisma");
    return getNewMessages(prisma);
  });
  return (
    <AdminCard id="card-messages" title="Unread messages">
      {data === null ? (
        <CardError retryHref="/admin" />
      ) : data.count === 0 ? (
        <EmptyState title="Nothing new">No unread messages.</EmptyState>
      ) : (
        <>
          <p>{data.count} unread message{data.count === 1 ? "" : "s"}. <Link href="/admin/messages" prefetch={false}>Open messages</Link></p>
          <ul className="adm-list">
            {data.latest.map((m) => (
              <li key={m.id}>
                {m.name} – {formatAdminDate(m.createdAt)}
              </li>
            ))}
          </ul>
        </>
      )}
    </AdminCard>
  );
}
