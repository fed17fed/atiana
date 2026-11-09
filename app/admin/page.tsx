import Link from "next/link";
import { requireAdmin } from "@/lib/session";

export default async function AdminPage() {
  await requireAdmin("/admin");
  return (
    <>
      <h1>Admin</h1>
      <p className="lead">The full admin panel comes in Phase 8. For now you can add 1:1 slots.</p>
      <Link className="btn btn-primary" href="/admin/slots">
        Add 1:1 slots
      </Link>
    </>
  );
}
