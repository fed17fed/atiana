import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/PageHeader";
import { SessionForm } from "@/components/admin/SessionForm";
import { DbNotice } from "@/components/ui/DbNotice";
import { DEFAULT_CAPACITY, listSessionOfferingsForForm } from "@/lib/admin/sessions-page";
import { safeDb } from "@/lib/safe";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Add session" };

export default async function NewSessionPage({ searchParams }: PageProps<"/admin/sessions/new">) {
  await requireAdmin("/admin/sessions/new");
  const sp = await searchParams;
  const offerings = await safeDb("admin session offerings", async () => {
    const { prisma } = await import("@/lib/prisma");
    return listSessionOfferingsForForm(prisma);
  });
  if (!offerings) return <DbNotice what="the classes and events" />;
  const wanted = typeof sp.offering === "string" ? sp.offering : "";
  const preset = offerings.find((o) => o.id === wanted && !(o.kind === "EVENT" && o.hasDate));
  return (
    <div className="grid gap-6">
      <PageHeader title="Add session" crumbs={[{ label: "Sessions", href: "/admin/sessions" }, { label: "Add" }]} lead="Give a class or an event its date and time. Times are in your time zone (Europe/Dublin)." />
      <SessionForm
        offerings={offerings}
        initialValues={{ id: null, version: "", offeringId: preset?.id ?? "", date: "", time: "19:00", minutes: preset?.minutes ? String(preset.minutes) : "60", capacity: String(DEFAULT_CAPACITY), zoomUrl: "" }}
      />
    </div>
  );
}
