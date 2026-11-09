import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ScheduleList } from "@/components/booking/ScheduleList";
import { TimeZoneName } from "@/components/booking/LocalTime";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { Crumbs } from "@/components/ui/Crumbs";
import { DbNotice } from "@/components/ui/DbNotice";
import { Icon } from "@/components/ui/Icon";
import { classTypes, packs } from "@/content/catalog";
import { CANCELLATION_HOURS } from "@/lib/booking-rules";
import { countUsableCredits, getScheduleWeek, getUserActiveSessionIds, hasSessionsAfter } from "@/lib/catalog-queries";
import { formatEuro } from "@/lib/orders-service";
import { safeDb } from "@/lib/safe";
import { getCurrentUser } from "@/lib/session";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = {
  title: "Schedule",
  description: "All upcoming live classes with filters. Times are shown in your own time zone. Demo site.",
  alternates: { canonical: "/schedule" },
  openGraph: { title: "Class schedule – KEA by Atiana", url: "/schedule" },
};

const MAX_WEEK = 7;

export default function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  return (
    <>
      <Crumbs items={[{ label: "Schedule" }]} />
      <div className="wrap page-head">
        <h1>Schedule</h1>
        <p className="lead">
          Times are in your time zone (<TimeZoneName />). Cancel up to {CANCELLATION_HOURS} hours before.
        </p>
      </div>
      <Suspense fallback={<PageSkeleton minHeight={760} />}>
        <ScheduleBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

async function ScheduleBody({ searchParams }: { searchParams: PageProps<"/schedule">["searchParams"] }) {
  const sp = await searchParams;
  const weekRaw = Number.parseInt(first(sp.week) ?? "0", 10);
  const week = Number.isFinite(weekRaw) ? Math.min(Math.max(weekRaw, 0), MAX_WEEK) : 0;
  const typeRaw = first(sp.type);
  const classSlug = classTypes.some((c) => c.slug === typeRaw) ? typeRaw : undefined;

  const user = await getCurrentUser();
  const data = await safeDb("schedule", async () => {
    const { prisma } = await import("@/lib/prisma");
    const w = await getScheduleWeek(prisma, { weekOffset: week, classSlug });
    const booked = user ? await getUserActiveSessionIds(prisma, user.id, w.items.map((i) => i.id)) : new Set<string>();
    const credits = user ? await countUsableCredits(prisma, user.id, "GROUP_CLASS") : 0;
    const more = week < MAX_WEEK ? await hasSessionsAfter(prisma, w.end) : false;
    return { ...w, booked: [...booked], credits, more };
  });

  const query = (w: number) => {
    const q = new URLSearchParams();
    if (w > 0) q.set("week", String(w));
    if (classSlug) q.set("type", classSlug);
    const s = q.toString();
    return s ? `/schedule?${s}` : "/schedule";
  };

  return (
    <div className="wrap sched">
      <aside aria-label="Filters">
        <div className="filters">
          <form method="get" action="/schedule" className="grid gap-4">
            <div className="field">
              <label htmlFor="f-type">Class type</label>
              <select id="f-type" name="type" className="input select" defaultValue={classSlug ?? ""}>
                <option value="">All classes</option>
                {classTypes.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-outline btn-sm" type="submit">
              Apply filter
            </button>
          </form>
          <div>
            <p className="legend" style={{ margin: "0 0 6px" }} id="wk-l">
              Week
            </p>
            <div className="weeknav" role="group" aria-labelledby="wk-l">
              {week > 0 ? (
                <Link className="icon-btn" href={query(week - 1)} aria-label="Previous week">
                  <Icon name="arrow" className="ic [transform:scaleX(-1)]" />
                </Link>
              ) : (
                <span className="icon-btn" aria-hidden="true">
                  <Icon name="arrow" className="ic [transform:scaleX(-1)]" />
                </span>
              )}
              <b aria-live="polite">{data ? `${formatDate(data.start, "Europe/Dublin", { day: "numeric", month: "short" })} – ${formatDate(new Date(data.end.getTime() - 1), "Europe/Dublin", { day: "numeric", month: "short", year: "numeric" })}` : "–"}</b>
              {week < MAX_WEEK ? (
                <Link className="icon-btn" href={query(week + 1)} aria-label="Next week">
                  <Icon name="arrow" className="ic" />
                </Link>
              ) : (
                <span className="icon-btn" aria-hidden="true">
                  <Icon name="arrow" className="ic" />
                </span>
              )}
            </div>
          </div>
          {user ? (
            <p className="credit-chip">
              <Icon name="gift" />
              <span>
                You have {data?.credits ?? 0} class credit{data?.credits === 1 ? "" : "s"}. <Link href="/account/credits">My credits</Link>
              </span>
            </p>
          ) : (
            <p className="login-hint">
              <Icon name="info" className="size-5!" />
              <span>Log in with an email link before you book. No password needed.</span>
            </p>
          )}
        </div>
        <div className="pack-mini" style={{ marginTop: 20 }}>
          <h2>Save with a pack</h2>
          <p>
            {packs[0].credits} classes for {formatEuro(packs[0].priceCents)} (€12 each) or {packs[1].credits} for{" "}
            {formatEuro(packs[1].priceCents)}. Credits expire after {packs[0].validWeeks} or {packs[1].validWeeks} weeks.
          </p>
          <Link className="btn btn-accent btn-sm" href="/classes#packs">
            See packs
          </Link>
        </div>
      </aside>

      <section aria-label="Classes this week">
        <div className="list-top">
          <p className="hint" aria-live="polite">
            {week === 0 ? "Showing classes for this week" : `Showing classes ${week} week${week === 1 ? "" : "s"} from now`}
          </p>
          <Link className="link-arrow" href="/legal/booking-cancellation">
            How booking works <Icon name="arrow" className="ic" />
          </Link>
        </div>
        {data === null ? (
          <DbNotice what="the schedule" />
        ) : data.items.length === 0 ? (
          <div className="empty">
            <Icon name="clock" className="ic" />
            <h2>No classes this week</h2>
            <p>New dates are added every week.</p>
            <div className="row-wrap" style={{ justifyContent: "center", marginTop: 12 }}>
              {data.more && (
                <Link className="btn btn-primary" href={query(week + 1)}>
                  Show next week
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            <ScheduleList items={data.items} bookedIds={data.booked} />
            {data.more && (
              <Link className="btn btn-outline" href={query(week + 1)}>
                Show next week
              </Link>
            )}
          </>
        )}
      </section>
    </div>
  );
}
