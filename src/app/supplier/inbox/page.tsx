import type { Metadata } from "next";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { MessagesPage, type MessagesSearchParams } from "@/components/conversations/MessagesPage";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inbox" };

// Supplier ↔ seller and supplier ↔ delivery partner chats.
export default async function SupplierInboxPage({ searchParams }: { searchParams?: Promise<MessagesSearchParams> }) {
  const params = await searchParams;
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  return (
    <AppPage frame={supplierFrame(user, supplier)} title="Inbox" sub="Reply to sellers about stock, prices and orders, and arrange pickups with delivery partners.">
      <MessagesPage role="supplier" params={params} />
    </AppPage>
  );
}
