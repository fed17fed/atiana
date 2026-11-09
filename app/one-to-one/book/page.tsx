import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OneToOnePicker } from "@/components/booking/OneToOnePicker";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Crumbs } from "@/components/ui/Crumbs";
import { DbNotice } from "@/components/ui/DbNotice";
import { Icon } from "@/components/ui/Icon";
import { countUsableCredits, getOneToOneSlots } from "@/lib/catalog-queries";
import { formatEuro } from "@/lib/orders-service";
import { safeDb } from "@/lib/safe";
import { getCurrentUser } from "@/lib/session";
import { stripeConfig } from "@/lib/stripe-service";

export const metadata: Metadata = {
  title: "Book a 1:1 session",
  description: "Choose a format, a day and a time for your 1:1 session. Demo site.",
  alternates: { canonical: "/one-to-one/book" },
  robots: { index: false, follow: false },
};

export default function BookOneToOnePage({ searchParams }: PageProps<"/one-to-one/book">) {
  return (
    <>
      <Crumbs items={[{ label: "1:1 Sessions", href: "/one-to-one" }, { label: "Book" }]} />
      <div className="wrap page-head">
        <h1>Book a 1:1 session</h1>
        <p className="lead">Sixty minutes, just for you. Online on Zoom or in person in Ireland.</p>
      </div>
      <Suspense fallback={<PageSkeleton minHeight={900} narrow />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/one-to-one/book">["searchParams"] }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const slotParam = one(sp.slot)?.slice(0, 60);
  const format = one(sp.format) === "person" ? "person" : "online";
  const user = await getCurrentUser();

  const data = await safeDb("1:1 slots", async () => {
    const { prisma } = await import("@/lib/prisma");
    const mode = format === "person" ? "IN_PERSON" : "ONLINE";
    const slots = await getOneToOneSlots(prisma, { mode, limit: 80 });
    const credits = user ? await countUsableCredits(prisma, user.id, "ONE_TO_ONE") : 0;
    return { slots, credits };
  });

  const seg = (f: "online" | "person", label: string, icon: "video" | "pin") => (
    <Link href={`/one-to-one/book?format=${f}`} aria-current={format === f ? "true" : undefined}>
      <Icon name={icon} className="size-5!" /> {label}
    </Link>
  );

  return (
    <div className="narrow">
      <div className="panel" style={{ marginBottom: 20 }}>
        <p className="legend" style={{ marginBottom: 8 }} id="fmt-l">
          Format
        </p>
        <div className="fmt-seg" role="group" aria-labelledby="fmt-l">
          {seg("online", "Online", "video")}
          {seg("person", "In person", "pin")}
        </div>
        <p className="hint" style={{ margin: "8px 0 0" }}>
          Online: 60 minutes on Zoom. In person: 60 minutes in Ireland (the address is sent after your booking is confirmed).
        </p>
      </div>
      {data === null ? (
        <DbNotice what="1:1 booking" />
      ) : (
        <OneToOnePicker
          key={format}
          slots={data.slots}
          initialSlotId={slotParam}
          priceLabel={data.slots[0]?.priceCents != null ? formatEuro(data.slots[0].priceCents) : "–"}
          minutes={data.slots[0]?.minutes ?? 60}
          formatLabel={format === "person" ? "In person" : "Online (Zoom)"}
          formatKey={format}
          loggedIn={!!user}
          credits={data.credits}
          paymentsOn={stripeConfig() !== null}
          userEmail={user?.email ?? null}
        />
      )}
    </div>
  );
}
