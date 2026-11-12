import type { Metadata } from "next";
import Link from "next/link";
import { DbNotice } from "@/components/ui/DbNotice";
import { Icon } from "@/components/ui/Icon";
import { getMyCredits } from "@/lib/account-queries";
import { packsEnabled } from "@/lib/features";
import { safeDb } from "@/lib/safe";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = { title: "My credits" };

export default async function CreditsPage({ searchParams }: PageProps<"/account/credits">) {
  const user = await requireUser("/account/credits");
  const sp = await searchParams;
  const paid = sp.paid !== undefined;
  const grants = await safeDb("my credits", async () => {
    const { prisma } = await import("@/lib/prisma");
    return getMyCredits(prisma, user.id);
  });
  if (!grants) return <DbNotice what="your credits" />;

  const now = new Date();
  return (
    <div className="grid gap-6">
      {paid && (
        <div className="alert a-success" role="status">
          <Icon name="check" />
          <div>
            <p>Thank you. Your credits appear here as soon as the payment is confirmed (a few seconds).</p>
          </div>
        </div>
      )}
      {grants.length === 0 ? (
        <div className="empty">
          <h2>No credits yet</h2>
          {packsEnabled() ? (
            <>
              <p>A class pack gives you credits. One credit books one class.</p>
              <Link className="btn btn-primary" href="/classes#packs">
                See class packs
              </Link>
            </>
          ) : (
            <p>You have no credits at the moment. One credit books one class.</p>
          )}
        </div>
      ) : (
        <ul className="acc-list">
          {grants.map((g) => {
            const expired = g.expiredAt !== null || (g.expiresAt !== null && g.expiresAt <= now);
            const label = g.package?.name ?? (g.source === "REFERRAL" ? "Referral reward" : "Credit from the team");
            return (
              <li className="acc-card" key={g.id}>
                <div className="row">
                  <h2>{label}</h2>
                  <span className={`status ${expired ? "s-past" : g.creditsLeft > 0 ? "s-confirmed" : "s-past"}`}>
                    {expired ? "Expired" : g.creditsLeft > 0 ? "Active" : "Used up"}
                  </span>
                </div>
                <div className="meta">
                  <span>
                    <b>{expired ? 0 : g.creditsLeft}</b> of {g.creditsTotal} credits left
                  </span>
                  <span>{g.appliesTo.includes("ONE_TO_ONE") ? "For 1:1 sessions" : "For group classes"}</span>
                  <span>
                    {g.expiresAt
                      ? `${expired ? "Expired" : "Valid until"} ${formatDate(g.expiresAt, "Europe/Dublin", { day: "numeric", month: "long", year: "numeric" })}`
                      : "No expiry date"}
                  </span>
                </div>
                {expired && g.creditsExpired > 0 && <p className="note">{g.creditsExpired} unused credits expired.</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
