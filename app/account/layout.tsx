import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountNav } from "@/components/booking/AccountNav";
import { logout } from "@/app/login/actions";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "My account", template: "%s | My account | KEA by Atiana" },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <section className="sec" aria-labelledby="acc-h">
      <div className="wrap">
        <Suspense fallback={<p className="hint" role="status">Loading your account...</p>}>
          <Gate>{children}</Gate>
        </Suspense>
      </div>
    </section>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  // Not logged in -> /login (and back here after login).
  const user = await requireUser("/account");
  return (
    <>
      <div className="acc-head">
        <div>
          <p className="eyebrow">My account</p>
          <h1 id="acc-h" style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)" }}>
            Hello{user.name ? `, ${user.name}` : ""}
          </h1>
          <p className="hint" style={{ margin: 0 }}>{user.email}</p>
        </div>
        <form action={logout}>
          <button className="btn btn-outline btn-sm" type="submit">
            Log out
          </button>
        </form>
      </div>
      <AccountNav />
      {children}
    </>
  );
}
