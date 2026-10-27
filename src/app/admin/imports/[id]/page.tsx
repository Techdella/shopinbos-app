import { notFound } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { ImportOrderDesk, type DeskOrder } from "@/components/admin/ImportOrderDesk";
import { requireAdminSection } from "@/lib/admin-team/service.server";
import { getPartnerImport } from "@/lib/imports/service.server";

export const dynamic = "force-dynamic";

// /admin/imports/[id]: one import for the sourcing partner. Quote it, then move it on a step at a time, adding QC
// photos and tracking on the way. Every change shows in the seller's My imports and sends them an alert.

export default async function AdminImportPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminSection("imports");
  const { id } = await params;
  const order = await getPartnerImport(id).catch(() => null);
  if (!order) notFound();
  const iso = (value: Date | null) => value?.toISOString() ?? null;
  const desk: DeskOrder = {
    ...order,
    quoteValidUntil: iso(order.quoteValidUntil),
    estimatedArrival: iso(order.estimatedArrival),
    quotedAt: iso(order.quotedAt),
    acceptedAt: iso(order.acceptedAt),
    paidAt: iso(order.paidAt),
    deliveredAt: iso(order.deliveredAt),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    events: order.events,
  };
  return (
    <AppPage
      frame={adminFrame(user, "Search imports")}
      title={`${order.ref} · ${order.title}`}
      sub={`${order.store?.name ?? "A store"} asked for this on ${order.createdAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}.`}
      actions={<PillLink href="/admin/imports" icon="arrowLeft">All imports</PillLink>}
    >
      <ImportOrderDesk initial={desk} />
    </AppPage>
  );
}
