import { redirect } from "next/navigation";
import { AppPage, EmptyState, ListCard, ListRow, Pill, PillLink, Thumb, cx } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { formatMoney } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { sellerBundles } from "@/lib/products/bundles.server";

// Bundles ("Buy together", shared/bundles.ts): the store's bundles with what's inside, the price and saving, and how
// many can sell with the items' stock now. "Make a bundle" opens the form; a row opens it to edit.

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("bundles");
  return { title: t("title") };
}

export default async function BundlesPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");
  const t = await getT("bundles", "common");
  const locale = await getLocale();
  const naira = (amount: number) => formatMoney(Math.round(amount), locale);
  const bundles = await sellerBundles(workspace.store.id);

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title={t("title")}
      sub={t("sub")}
      actions={
        <>
          <PillLink href="/products" icon="arrowLeft">{t("allProducts")}</PillLink>
          <PillLink href="/products/bundles/new" tone="accent" icon="plus">{t("make")}</PillLink>
        </>
      }
    >
      {bundles.length === 0 ? (
        <EmptyState icon="bag" title={t("empty")} action={<PillLink href="/products/bundles/new" tone="ink" icon="plus">{t("make")}</PillLink>}>
          {t("emptySub")}
        </EmptyState>
      ) : (
        <ListCard>
          {bundles.map((bundle) => {
            const missing = bundle.items.some((item) => item.missing);
            const stock = missing ? t("row.missing") : bundle.available === null ? t("row.unlimited") : bundle.available <= 0 ? t("row.soldOut") : t("row.canSell", { count: bundle.available });
            return (
              <ListRow key={bundle.id} href={`/products/bundles/${bundle.id}`}>
                <div className="flex w-full min-w-0 items-start gap-3.5 md:items-center md:gap-4">
                  <Thumb src={bundle.image} label={bundle.name} />
                  <div className="grid min-w-0 flex-1 items-center gap-x-5 gap-y-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_auto]">
                    <div className="min-w-0">
                      <span className="line-clamp-1 text-[15px] font-extrabold">{bundle.name}</span>
                      <div className="truncate text-[13px] text-app-ink-soft">
                        {t("row.items", { count: bundle.items.length })} · {bundle.items.map((item) => `${item.quantity > 1 ? `${item.quantity} × ` : ""}${item.name}`).join(", ")}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px]">
                      {bundle.status === "published" ? <Pill tone="success">{t("status.live")}</Pill> : <Pill tone="muted">{t("status.draft")}</Pill>}
                      <span className={cx("font-semibold", missing || bundle.available === 0 ? "text-app-accent-ink" : "text-app-ink-soft")}>{stock}</span>
                      <span className="text-app-ink-soft">{t("row.sold", { count: bundle.soldCount })}</span>
                    </div>
                    <div className="text-[15px] font-extrabold md:text-right">
                      {naira(bundle.price)}
                      {bundle.saving.amount > 0 ? <span className="ml-1.5 text-[12.5px] font-semibold text-app-ink-faint line-through">{naira(bundle.partsTotal)}</span> : null}
                    </div>
                  </div>
                </div>
              </ListRow>
            );
          })}
        </ListCard>
      )}
    </AppPage>
  );
}
