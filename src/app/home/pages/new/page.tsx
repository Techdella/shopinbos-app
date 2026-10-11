import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, PillLink } from "@/components/app-kit";
import { NewPageForm } from "./NewPageForm";

export const dynamic = "force-dynamic";

export default async function NewPageModal() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const existing = store
    ? await db.storePage.findMany({ where: { storeId: store.id }, select: { id: true, slug: true, title: true } })
    : [];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="New page"
      sub="Pick a page type. Rex writes the first draft, then you can edit it."
      actions={<PillLink href="/home/pages" icon="arrowLeft">Back to pages</PillLink>}
    >
      {store ? (
        <NewPageForm existing={existing} />
      ) : (
        <EmptyState icon="document" title="No store yet" action={<PillLink href="/onboarding" tone="ink">Set up your store</PillLink>}>
          Set up your store first, then add pages to it.
        </EmptyState>
      )}
    </SellerPage>
  );
}
