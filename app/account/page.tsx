import type { Metadata } from "next";
import Link from "next/link";
import { DbNotice } from "@/components/ui/DbNotice";
import { getMyBookings, getMyCredits } from "@/lib/account-queries";
import { isUsableCredit } from "@/lib/booking-rules";
import { safeDb } from "@/lib/safe";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  const data = await safeDb("account overview", async () => {
    const { prisma } = await import("@/lib/prisma");
    const [bookings, credits] = await Promise.all([getMyBookings(prisma, user.id), getMyCredits(prisma, user.id)]);
    return { bookings, credits };
  });
  if (!data) return <DbNotice what="your account data" />;

  const now = new Date();
  const upcoming = data.bookings.filter((b) => b.startsAt > now && (b.status === "CONFIRMED" || b.status === "PENDING")).length;
  const group = data.credits.filter((g) => isUsableCredit(g, "GROUP_CLASS", now)).reduce((n, g) => n + g.creditsLeft, 0);
  const one = data.credits.filter((g) => isUsableCredit(g, "ONE_TO_ONE", now)).reduce((n, g) => n + g.creditsLeft, 0);

  return (
    <div className="stat-grid">
      <div className="stat">
        <span className="big-num">{upcoming}</span>
        <p>Upcoming bookings</p>
        <Link href="/account/bookings">My bookings</Link>
      </div>
      <div className="stat">
        <span className="big-num">{group}</span>
        <p>Class credits</p>
        <Link href="/account/credits">My credits</Link>
      </div>
      <div className="stat">
        <span className="big-num">{one}</span>
        <p>1:1 credits</p>
        <Link href="/classes#packs">Buy a pack</Link>
      </div>
    </div>
  );
}
