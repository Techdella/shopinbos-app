import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage, Card, EmptyState, Pill, PillLink, Thumb, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, money, supplierFrame, type SupplierT } from "@/components/supplier/supplier-kit";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDate } from "@shared/i18n";
import { type PreorderStage, type SupplierPreorderOrder } from "@shared/preorder";
import { supplierPreorders } from "@/lib/supplier-orders/preorders.server";
import { supplierEndPreordersAction, supplierStockReadyAction } from "@/app/actions/preorders";

export const dynamic = "force-dynamic";

// The supplier's preorders, by product (src/lib/supplier-orders/preorders.server.ts): the ship date, units ordered
// against the cap, how many shops, and each shop's order (units, amount, deposit paid / balance due, a link to it).
// "Stock is ready" (after a confirm step) marks the open preorders ready and tells each shop: it ships now, or once
// they pay the rest when there's a deposit. "End preorders" stops taking new ones. The phone has the same screen
// (apps/mobile/src/app/supplier/preorders.tsx).

const STAGE_TONE: Record<PreorderStage, Tone> = { waiting: "warning", pay_balance: "accent", ready: "success", shipped: "info", delivered: "success", cancelled: "muted" };

function paidLine(order: SupplierPreorderOrder, t: SupplierT) {
  if (order.dueKobo <= 0) return t("preorders.paidFull");
  if (order.paidKobo > 0) return t("preorders.depositPaid", { paid: money(order.paidKobo / 100, "NGN"), due: money(order.dueKobo / 100, "NGN") });
  if (order.depositKobo > 0) return t("preorders.depositDue", { amount: money(order.depositKobo / 100, "NGN") });
  return t("preorders.notPaid");
}

type PageProps = { searchParams?: Promise<{ ready?: string; ended?: string; error?: string }> };

export default async function SupplierPreordersPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("supplier", "common");
  const locale = await getLocale();
  const { groups } = await supplierPreorders(supplier.id);
  const day = (shipsOn: string) => formatDate(new Date(`${shipsOn}T12:00:00Z`), locale, { day: "numeric", month: "short", timeZone: "UTC" });

  const saved =
    params.error ? null : params.ready !== undefined ? t("preorders.readyDone", { count: params.ready }) + (params.ended ? ` ${t("preorders.endedDone")}` : "") : params.ended ? t("preorders.endedDone") : null;

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title={t("preorders.title")}
      sub={t("preorders.sub")}
      actions={<PillLink href="/supplier/orders?kind=wholesale" icon="package">{t("preorders.allOrders")}</PillLink>}
    >
      {(params.error || saved) && (
        <div className="mb-4">
          <Notice tone={params.error ? "error" : "success"}>{params.error ?? saved}</Notice>
        </div>
      )}
      {groups.length === 0 ? (
        <EmptyState icon="clock" title={t("preorders.emptyTitle")} action={<PillLink href="/supplier/products" tone="ink">{t("preorders.toProducts")}</PillLink>}>
          {t("preorders.emptyBody")}
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {groups.map((group) => (
            <Card key={group.product.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start gap-3">
                <Thumb src={group.product.image} label={group.product.name} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/supplier/products/${group.product.id}/edit`} className="text-[16px] font-extrabold text-app-ink no-underline hover:underline">{group.product.name}</Link>
                    <Pill tone={group.product.on ? "warning" : "muted"} dot>{group.product.on ? t("preorders.taking") : t("preorders.stopped")}</Pill>
                  </div>
                  <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">
                    {[
                      group.product.shipsOn ? t("preorders.shipsFrom", { date: day(group.product.shipsOn) }) : t("preorders.shipsSoon"),
                      group.product.limit ? t("preorders.unitsOfCap", { units: group.units.toLocaleString("en-NG"), limit: group.product.limit.toLocaleString("en-NG") }) : t("preorders.unitsOrdered", { units: group.units.toLocaleString("en-NG") }),
                      t("preorders.shops", { count: group.shops }),
                      group.product.depositPct ? t("preorders.depositPct", { pct: group.product.depositPct }) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {(group.product.depositPct > 0 || group.paidKobo > 0) && (
                    <p className="m-0 mt-1 text-[13.5px]">
                      <strong>{t("preorders.paidSoFar", { amount: money(group.paidKobo / 100, "NGN") })}</strong>
                      {group.dueKobo > 0 ? ` · ${t("preorders.stillDue", { amount: money(group.dueKobo / 100, "NGN") })}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                  {group.waiting > 0 && (
                    <details className="group w-full sm:w-auto">
                      <summary className={`${buttonClass.ink} cursor-pointer list-none whitespace-nowrap`}><Icon name="checkCircle" size={16} /> {t("preorders.stockReady")}</summary>
                      <form action={supplierStockReadyAction} className="mt-2 grid gap-2 rounded-[16px] border border-app-line bg-white p-3 sm:w-[360px]">
                        <input type="hidden" name="productId" value={group.product.id} />
                        <p className="m-0 text-[13.5px] leading-[1.5]">{group.product.depositPct ? t("preorders.confirmDeposit", { count: group.waiting }) : t("preorders.confirm", { count: group.waiting })}</p>
                        {group.product.on && (
                          <label className="flex items-center gap-2 text-[13.5px]">
                            <input type="checkbox" name="end" className="h-4 w-4 accent-[#16141F]" /> {t("preorders.endToo")}
                          </label>
                        )}
                        <button type="submit" className={`${buttonClass.smallInk} whitespace-nowrap`}>{t("preorders.confirmYes")}</button>
                      </form>
                    </details>
                  )}
                  {group.product.on && (
                    <form action={supplierEndPreordersAction}>
                      <input type="hidden" name="productId" value={group.product.id} />
                      <button type="submit" className={`${buttonClass.white} whitespace-nowrap`}>{t("preorders.end")}</button>
                    </form>
                  )}
                </div>
              </div>
              {group.orders.length > 0 ? (
                <ul className="m-0 mt-3 list-none divide-y divide-app-line rounded-[16px] border border-app-line p-0">
                  {group.orders.map((order) => (
                    <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13.5px]">
                      <span className="min-w-0 flex-1 font-bold">{order.shop} · {t("preorders.qty", { count: order.quantity.toLocaleString("en-NG") })}</span>
                      <span className="text-app-ink-soft">{money(order.totalKobo / 100, "NGN")}</span>
                      <span className="text-app-ink-soft">{paidLine(order, t)}</span>
                      <Pill tone={STAGE_TONE[order.stage]}>{t.dynamic(`preorders.stage.${order.stage}`, order.stage)}</Pill>
                      <PillLink href={`/supplier/orders/${order.id}?kind=wholesale`} size="sm" icon="arrow">{t("open")}</PillLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 mt-3 rounded-[14px] bg-app-canvas px-3 py-2 text-[13.5px] text-app-ink-soft">{t("preorders.noOrders")}</p>
              )}
            </Card>
          ))}
        </div>
      )}
    </AppPage>
  );
}
