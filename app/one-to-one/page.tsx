import type { Metadata } from "next";
import Link from "next/link";
import { Crumbs } from "@/components/ui/Crumbs";
import { Suspense } from "react";
import { PackBuyForm } from "@/components/booking/PackBuyForm";
import { oneToOnePacks } from "@/content/catalog";
import { packsEnabled } from "@/lib/features";
import { getActivePackages } from "@/lib/catalog-queries";
import { safeDb } from "@/lib/safe";
import { CANCELLATION_HOURS } from "@/lib/booking-rules";
import { loadPublicOfferings } from "@/lib/offerings-cache";
import { formatEuro } from "@/lib/orders-service";

export const metadata: Metadata = {
  title: "1:1 sessions",
  description: "Time that is only for you. Online on Zoom or in person in Ireland. Demo prices.",
  alternates: { canonical: "/one-to-one" },
  openGraph: { title: "1:1 sessions – KEA by Atiana", url: "/one-to-one" },
};

export default async function OneToOnePage() {
  // Titles and texts come from the 1:1 offerings (admin), or today's code content when the database cannot be read or is empty (task 12.8, F-8).
  const { oneToOne } = await loadPublicOfferings();
  const online = oneToOne.find((o) => o.mode === "ONLINE");
  const person = oneToOne.find((o) => o.mode === "IN_PERSON");
  return (
    <>
      <Crumbs items={[{ label: "1:1 Sessions" }]} />
      <div className="wrap page-head">
        <h1>1:1 sessions</h1>
        <p className="lead">
          Time that is only for you. Your teacher listens, then guides you at your pace. Choose online on Zoom, or meet in
          person.
        </p>
      </div>

      <section className="sec" aria-labelledby="oto-h">
        <div className="wrap">
          <h2 id="oto-h" className="sr-only">
            Choose a format
          </h2>
          <div className="klasses">
            {online && (
              <article className="klass">
                <h3>{online.title}</h3>
                <div className="meta">
                  <span>{online.minutes} minutes</span>
                  <span>{formatEuro(online.priceCents)} (demo price)</span>
                </div>
                <p>{online.summary}</p>
                <p style={{ marginTop: 14 }}>
                  <Link className="btn btn-primary" href="/one-to-one/book?format=online">
                    Choose a time
                  </Link>
                </p>
              </article>
            )}
            {person && (
              <article className="klass">
                <h3>{person.title}</h3>
                <div className="meta">
                  <span>{person.minutes} minutes</span>
                  <span>{formatEuro(person.priceCents)} (demo price) [OWNER: confirm in-person price]</span>
                </div>
                <p>{person.summary}</p>
                <p className="hint" style={{ marginTop: 8 }}>
                  Location: [OWNER: address and city of the in-person room]. Demo location in Ireland.
                </p>
                <p style={{ marginTop: 14 }}>
                  <Link className="btn btn-primary" href="/one-to-one/book?format=person">
                    Choose a time
                  </Link>
                </p>
              </article>
            )}
          </div>
        </div>
      </section>

      <section className="sec sand" aria-label="Good to know">
        <div className="wrap prose-narrow">
          {packsEnabled() && (
            <>
          <h2 id="pack-h">5-session package</h2>
          <p>
            Five sessions at a better price. Use your credits at any time while they are valid. Package price:{" "}
            {formatEuro(oneToOnePacks[0].priceCents)} (demo price). Credits valid for {oneToOnePacks[0].validWeeks} weeks.
            Credits are shown in your account.
          </p>
          <Suspense fallback={<PackBuyForm packageId={null} name={oneToOnePacks[0].name} disabled />}>
            <PackFromDb />
          </Suspense>
            </>
          )}
          <h2>Good to know</h2>
          <ul style={{ display: "grid", gap: 8, listStyle: "disc", paddingLeft: "1.3em" }}>
            <li>
              Sessions can be cancelled up to {CANCELLATION_HOURS} hours before. Your credit is kept as described in our{" "}
              <Link href="/legal/booking-cancellation">Booking and cancellation</Link> page.
            </li>
            <li>
              1:1 sessions are not medical care. Please read the <Link href="/legal/health-disclaimer">Health notice</Link>.
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}

async function PackFromDb() {
  const rows = await safeDb("1:1 packages", async () => {
    const { prisma } = await import("@/lib/prisma");
    return getActivePackages(prisma, "ONE_TO_ONE");
  });
  const pack = rows?.[0];
  return (
    <>
      {!pack && <p className="hint">Demo: buying the package is not available yet because the database for this demo site is not ready.</p>}
      <PackBuyForm packageId={pack?.id ?? null} name={pack?.name ?? oneToOnePacks[0].name} disabled={!pack} />
    </>
  );
}
