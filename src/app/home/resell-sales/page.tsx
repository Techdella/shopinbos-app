import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile, type Tone } from "@/components/app-kit";
import { featureOn } from "@/lib/feature-switches.server";
import { ResellNotReady, storeResellSales } from "@/lib/resell/service.server";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDate, formatMoney } from "@shared/i18n";
import { RESELL_FEATURE } from "@shared/resell";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("resell");
  return { title: t("sales.title") };
}

const STATUS_TONE: Record<string, Tone> = { pending: "warning", approved: "accent", paid: "success", void: "muted" };

// Resell sales (pilot "resell"): sales through resellers' links and the commission the shop owes each one. The shop
// pays its resellers; Shopinbos only keeps the record. Reseller names only (never their phone or email).
export default async function ResellSalesPage() {
  const user = await requireRole(["seller"], "/login");
  if (!(await featureOn(user.id, RESELL_FEATURE))) notFound();
  const t = await getT("resell");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true } });
  let data: Awaited<ReturnType<typeof storeResellSales>> | null = null;
  let notReady = false;
  if (store) {
    try {
      data = await storeResellSales(store.id);
    } catch (error) {
      if (!(error instanceof ResellNotReady)) throw error;
      notReady = true;
    }
  }
  const money = (amount: number) => formatMoney(amount, locale, { currency: store?.currency ?? "NGN" });

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("sales.title")} sub={t("sales.sub")} actions={<PillLink href="/resell" icon="link">{t("sales.resellYourself")}</PillLink>}>
      {notReady ? <EmptyState icon="clock" title={t("notReady")} /> : null}
      {data ? (
        <div className="grid gap-5">
          <StatGrid>
            <StatTile tone="card" label={t("sales.owed")} value={money(data.totals.owed)} hint={t("sales.count", { count: data.totals.count })} />
            <StatTile tone="card" label={t("sales.ready")} value={money(data.totals.ready)} />
            <StatTile tone="card" label={t("sales.paid")} value={money(data.totals.paid)} />
            <StatTile tone="card" label={t("sales.amount")} value={money(data.totals.value)} />
          </StatGrid>
          {data.sales.length ? (
            <ListCard>
              {data.sales.map((sale) => (
                <ListRow key={sale.id} href={`/home/orders/${sale.orderId}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-extrabold">{sale.resellerName || t("sales.someone")}</div>
                    <div className="truncate text-[13.5px] text-app-ink-soft">
                      {t("sales.line", { quantity: sale.quantity, product: sale.productName, order: sale.orderNumber ?? "" })} · {formatDate(new Date(sale.createdAt), locale, { day: "numeric", month: "short" })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[15px] font-extrabold">{money(sale.commissionAmount)}</div>
                    <div className="text-[12.5px] text-app-ink-soft">{sale.commissionPct}% · {money(sale.lineTotal)}</div>
                  </div>
                  <Pill tone={STATUS_TONE[sale.status] ?? "muted"}>{t.dynamic(`status.${sale.status}`, sale.status)}</Pill>
                </ListRow>
              ))}
            </ListCard>
          ) : (
            <EmptyState icon="link" title={t("sales.empty")}>{t("sales.emptySub")}</EmptyState>
          )}
        </div>
      ) : null}
    </SellerPage>
  );
}
