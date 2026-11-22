import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageSkeleton } from "@/components/ui/PageSkeleton";
import { requireAdmin } from "@/lib/session";
import "./admin.css";

// noindex here AND as the X-Robots-Tag header (next.config.ts). Cache-Control: no-store is also set there.
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | Admin | KEA by Atiana" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <section className="sec">
      <div className="wrap">
        <Suspense fallback={<PageSkeleton minHeight={480} />}>
          <Gate>{children}</Gate>
        </Suspense>
      </div>
    </section>
  );
}

/** Not logged in -> /login. Logged in, not ADMIN -> 403. Every admin page and action also checks again by itself. */
async function Gate({ children }: { children: React.ReactNode }) {
  await requireAdmin("/admin");
  return <AdminShell>{children}</AdminShell>;
}
