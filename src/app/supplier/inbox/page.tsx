import type { Metadata } from "next";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { MessagesPage, type MessagesSearchParams } from "@/components/conversations/MessagesPage";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { requireRole } from "@/lib/server-auth";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("supplier"))("inbox.title") };
}

// Supplier ↔ seller and supplier ↔ delivery partner chats.
export default async function SupplierInboxPage({ searchParams }: { searchParams?: Promise<MessagesSearchParams> }) {
  const params = await searchParams;
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("supplier");

  return (
    <AppPage frame={supplierFrame(user, supplier)} title={t("inbox.title")} sub={t("inbox.sub")}>
      <MessagesPage role="supplier" params={params} />
    </AppPage>
  );
}
