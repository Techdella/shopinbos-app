import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { starterPacksFor } from "@/lib/marketplace/quick-add.server";
import { PackCard, PackPreview } from "../_components/StarterPacks";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("marketplace");
  return { title: t("packs.heading") };
}

// Starter packs (web; the phone's app/find/packs.tsx): every pack for this seller, or ?id= one pack's preview with
// "Add all 25 to my shop". Linked from Find products and from the seller sign-up's "Do you have products ready?".

export default async function StarterPacksPage({ searchParams }: { searchParams?: Promise<{ id?: string }> }) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketplace");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");
  const found = await starterPacksFor(user.id);
  const packs = found?.packs ?? [];
  const pack = params.id ? packs.find((entry) => entry.id === params.id) ?? null : null;
  const markup = { markup: found?.markup ?? { kind: "percent" as const, value: 30 }, asked: found?.asked ?? false };

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("packs.pageTitle")} sub={t("packs.pageSub")}>
      {pack ? (
        <PackPreview pack={pack} markup={markup} />
      ) : packs.length ? (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
          {packs.map((entry) => (
            <li key={entry.id} className="grid">
              <PackCard pack={entry} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon="package" title={t("packs.emptyTitle")}>{t("packs.emptyBody")}</EmptyState>
      )}
    </SellerPage>
  );
}
