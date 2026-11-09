import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PackBuyForm } from "@/components/booking/PackBuyForm";
import { Crumbs } from "@/components/ui/Crumbs";
import { Icon } from "@/components/ui/Icon";
import { classTypes, packs, SINGLE_CLASS_PRICE_CENTS } from "@/content/catalog";
import { CANCELLATION_HOURS } from "@/lib/booking-rules";
import { getActivePackages } from "@/lib/catalog-queries";
import { formatEuro } from "@/lib/orders-service";
import { safeDb } from "@/lib/safe";
import { stripeConfig } from "@/lib/stripe-service";

export const metadata: Metadata = {
  title: "Online group classes",
  description:
    "Live classes on Zoom, every week. Small groups, clear guidance and a kind atmosphere. All levels are welcome. Demo prices.",
  alternates: { canonical: "/classes" },
  openGraph: { title: "Online group classes – KEA by Atiana", url: "/classes" },
};

export default function ClassesPage() {
  return (
    <>
      <Crumbs items={[{ label: "Classes" }]} />
      <div className="wrap page-head">
        <h1>Online group classes</h1>
        <p className="lead">
          Live classes on Zoom, every week. Small groups, clear guidance, and a kind atmosphere. Pick the type that fits
          your day. All levels are welcome.
        </p>
        <div className="row-wrap" style={{ marginTop: 16 }}>
          <Link className="btn btn-primary" href="/schedule">
            See the schedule
          </Link>
          <a className="btn btn-outline" href="#packs">
            Buy a pack
          </a>
        </div>
      </div>

      <section className="sec" aria-labelledby="types-h">
        <div className="wrap">
          <h2 id="types-h" className="sr-only">
            Class types
          </h2>
          <div className="klasses">
            {classTypes.map((c) => (
              <article className="klass" key={c.slug}>
                <h3>{c.title}</h3>
                <div className="meta">
                  <span>{c.level}</span>
                  <span>{c.minutes} minutes</span>
                  <span>Online (Zoom)</span>
                </div>
                <p>{c.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sand" id="packs" aria-labelledby="prices-h">
        <div className="wrap">
          <p className="eyebrow">Prices (demo prices)</p>
          <h2 id="prices-h">Single class or save with a pack</h2>
          <p className="lead">
            Single class: <b>{formatEuro(SINGLE_CLASS_PRICE_CENTS)}</b>. One credit books one class. Cancel up to{" "}
            {CANCELLATION_HOURS} hours before and your credit comes back.
          </p>
          <Suspense fallback={<StaticPacks />}>
            <PacksFromDb />
          </Suspense>
        </div>
      </section>
    </>
  );
}

function PackCard({ name, credits, weeks, price, note, action }: { name: string; credits: number; weeks: number; price: string; note: string; action: React.ReactNode }) {
  return (
    <div className="pack">
      <h3>{name}</h3>
      <p className="price">{price}</p>
      <p>
        {credits} classes · {note}. Credits valid for {weeks} weeks.
      </p>
      {action}
    </div>
  );
}

function StaticPacks() {
  return (
    <div className="packs" style={{ marginTop: 24 }}>
      {packs.map((p) => (
        <PackCard key={p.name} name={p.name} credits={p.credits} weeks={p.validWeeks} price={formatEuro(p.priceCents)} note={p.note} action={<PackBuyForm packageId={null} name={p.name} disabled />} />
      ))}
    </div>
  );
}

async function PacksFromDb() {
  const rows = await safeDb("packages", async () => {
    const { prisma } = await import("@/lib/prisma");
    return getActivePackages(prisma);
  });
  const paymentsOn = stripeConfig() !== null;

  return (
    <>
      {!paymentsOn && (
        <div className="alert a-info" role="status" style={{ marginTop: 16 }}>
          <Icon name="info" />
          <div>
            <p>Demo: online payments are not active yet. The buttons show how it will work.</p>
          </div>
        </div>
      )}
      {rows === null || rows.length === 0 ? (
        <>
          <div className="alert a-warn" role="status" style={{ marginTop: 16 }}>
            <Icon name="info" />
            <div>
              <p>Demo: buying a pack is not available yet because the database for this demo site is not ready.</p>
            </div>
          </div>
          <StaticPacks />
        </>
      ) : (
        <div className="packs" style={{ marginTop: 24 }}>
          {rows.map((p) => {
            const def = packs.find((x) => x.name === p.name);
            return (
              <PackCard
                key={p.id}
                name={p.name}
                credits={p.credits}
                weeks={Math.round(p.validDays / 7)}
                price={formatEuro(p.priceCents, p.currency)}
                note={def?.note ?? ""}
                action={<PackBuyForm packageId={p.id} name={p.name} />}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
