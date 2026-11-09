import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | KEA by Atiana" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <section className="sec">
      <div className="wrap">
        <Suspense fallback={<p className="hint" role="status">Loading...</p>}>
          <Gate>{children}</Gate>
        </Suspense>
      </div>
    </section>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");
  return (
    <>
      <p className="eyebrow">Admin</p>
      <nav className="acc-nav" aria-label="Admin">
        <Link href="/admin">Overview</Link>
        <Link href="/admin/slots">1:1 slots</Link>
      </nav>
      {children}
    </>
  );
}
