import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage, type Tone, Card, CardHead, EmptyState, ListCard, Pill, SplitLayout, StatGrid, StatTile, Thumb } from "@/components/app-kit";
import { PayoutBankSection } from "@/components/payments/PayoutBankSection";
import { ORDER_STATUS, money, orderRef, shortDate, statusOf, supplierFrame } from "@/components/supplier/supplier-kit";
import { markSupplierPayout } from "@/app/actions/supplier";
import { DROPSHIP_TO_SHIP, SUPPLIER_EARNED_STATUSES, WHOLESALE_TO_SHIP, supplierOrderRef } from "@/lib/supplier-orders/pure";
import { orderLines } from "@/lib/supplier-orders/views.server";
import { supplierEarnings } from "@/lib/supplier-orders/money.server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const PAYABLE: readonly string[] = SUPPLIER_EARNED_STATUSES;
const DROPSHIP_STAGE: Record<string, { label: string; tone: "accent" | "warning" | "info" | "success" | "muted" }> = {
  pending: { label: "New", tone: "accent" },
  accepted: { label: "To pack", tone: "warning" },
  shipped: { label: "Sent", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  rejected: { label: "Declined", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

/** Wholesale and dropship orders in one list, newest first. */
interface PayoutRow {
  kind: "wholesale" | "dropship";
  id: string;
  ref: string;
  title: string;
  image: string | null | undefined;
  who: string;
  createdAt: Date;
  status: string;
  stage: { label: string; tone: Tone };
  amount: number;
  currency: string;
  paidOutAt: Date | null;
}

export default async function SupplierPayoutsPage({ searchParams }: { searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("supplier", "common");

  const payoutAccount = await db.supplierPayoutAccount.findUnique({
    where: { supplierId: supplier.id },
  });
  const payoutBank = payoutAccount
    ? {
        bankName: payoutAccount.bankName,
        accountNumber: payoutAccount.accountNumberMask,
        accountName: payoutAccount.accountName,
      }
    : null;

  const notice = (await searchParams) ?? {};
  const [wholesale, dropship, totals, openWholesale, openDropship] = await Promise.all([
    db.wholesaleOrder.findMany({
      where: { supplierId: supplier.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        totalPrice: true,
        currency: true,
        status: true,
        createdAt: true,
        paidOutAt: true,
        seller: { select: { name: true } },
        supplierProduct: { select: { name: true, images: true } },
      },
    }),
    db.supplierOrder.findMany({
      where: { supplierId: supplier.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, costTotal: true, currency: true, status: true, createdAt: true, paidOutAt: true, items: true, storeId: true },
    }),
    // All time, not just the rows listed.
    supplierEarnings(supplier.id),
    db.wholesaleOrder.aggregate({ where: { supplierId: supplier.id, status: { in: [...WHOLESALE_TO_SHIP] } }, _sum: { totalPrice: true }, _count: { _all: true } }),
    db.supplierOrder.aggregate({ where: { supplierId: supplier.id, status: { in: [...DROPSHIP_TO_SHIP] } }, _sum: { costTotal: true }, _count: { _all: true } }),
  ]);
  const shops = dropship.length
    ? new Map((await db.store.findMany({ where: { id: { in: [...new Set(dropship.map((row) => row.storeId))] } }, select: { id: true, name: true } })).map((store) => [store.id, store.name]))
    : new Map<string, string>();

  const orders: PayoutRow[] = [
    ...wholesale.map((o): PayoutRow => ({
      kind: "wholesale",
      id: o.id,
      ref: orderRef(o.id),
      title: o.supplierProduct.name,
      image: o.supplierProduct.images[0],
      who: o.seller.name,
      createdAt: o.createdAt,
      status: o.status,
      stage: statusOf(ORDER_STATUS, o.status, t),
      amount: Number(o.totalPrice),
      currency: o.currency,
      paidOutAt: o.paidOutAt,
    })),
    ...dropship.map((o): PayoutRow => {
      const lines = orderLines(o.items);
      return {
        kind: "dropship",
        id: o.id,
        ref: supplierOrderRef(o.id),
        title: lines.length > 1 ? t("payouts.andMore", { name: lines[0].name, more: lines.length - 1 }) : lines[0]?.name ?? t("order.dropshipOrder"),
        image: lines[0]?.image,
        who: t("payouts.dropshipFor", { shop: shops.get(o.storeId) ?? t("payouts.aShop") }),
        createdAt: o.createdAt,
        status: o.status,
        stage: DROPSHIP_STAGE[o.status] ? { ...DROPSHIP_STAGE[o.status], label: t.dynamic(`payouts.dropshipStage.${o.status}`, DROPSHIP_STAGE[o.status].label) } : statusOf(DROPSHIP_STAGE, o.status),
        amount: Number(o.costTotal),
        currency: o.currency,
        paidOutAt: o.paidOutAt,
      };
    }),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const openCount = openWholesale._count._all + openDropship._count._all;
  const openValue = (openWholesale._sum.totalPrice ?? 0) + (openDropship._sum.costTotal ?? 0);
  const verifiedBank = payoutAccount?.verificationStatus === "verified";

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title={t("payouts.title")}
      sub={payoutAccount && verifiedBank
        ? t("payouts.subReady", { bank: payoutAccount.bankName, mask: payoutAccount.accountNumberMask })
        : t("payouts.subSetup", { count: totals.earnedCount, amount: money(totals.earned) })}
    >
      {notice.error ? <div role="alert" className="mb-4 rounded-[16px] bg-app-danger-tint px-4 py-3 text-[14px] font-bold text-app-danger">{notice.error}</div> : null}
      <StatGrid className="mb-5">
        <StatTile tone="card" label={t("payouts.earned")} value={money(totals.earned)} hint={t("payouts.earnedHint", { count: totals.earnedCount })} />
        <StatTile tone="card" label={t("payouts.owed")} value={money(totals.owed)} hint={t("payouts.owedHint", { count: totals.owedCount })} />
        <StatTile tone="card" label={t("payouts.paid")} value={money(totals.paid)} hint={t("payouts.paidHint", { count: totals.paidCount })} />
        <StatTile tone="card" label={t("payouts.stillToSend")} value={money(openValue)} hint={t("payouts.openHint", { count: openCount })} />
        <StatTile tone="card" label={t("payouts.bankAccount")} value={verifiedBank ? t("payouts.ready") : payoutAccount ? t("payouts.checking") : t("payouts.notSet")} hint={payoutAccount ? payoutAccount.bankName : t("payouts.addBelow")} />
      </StatGrid>

      <SplitLayout
        main={
          <section className="min-w-0">
            <h2 className="mb-3 mt-0 text-[17px] font-extrabold">{t("payouts.ordersWorth")}</h2>
            {orders.length === 0 ? (
              <EmptyState icon="coin" title={t("payouts.emptyTitle")}>
                {t("payouts.emptyBody")}
              </EmptyState>
            ) : (
              <ListCard>
                {orders.slice(0, 30).map((o) => {
                  const earned = PAYABLE.includes(o.status);
                  return (
                    <li key={`${o.kind}-${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-5">
                      <Thumb src={o.image ?? undefined} label={o.title} size={44} />
                      <span className="min-w-0 flex-1 basis-[calc(100%-72px)] sm:basis-0">
                        <span className="block truncate text-[14px] font-extrabold">{o.title}</span>
                        <span className="block truncate text-[12.5px] text-app-ink-soft">{o.ref} · {o.who} · {shortDate(o.createdAt, t.locale)}</span>
                      </span>
                      <Pill tone={earned ? (o.paidOutAt ? "success" : "warning") : o.stage.tone}>{earned ? (o.paidOutAt ? t("payouts.paidPill") : t("payouts.owedPill")) : o.stage.label}</Pill>
                      <span className="w-[110px] text-right text-[14px] font-extrabold">{money(o.amount, o.currency)}</span>
                      {earned ? (
                        <form action={markSupplierPayout} className="w-full sm:w-auto">
                          <input type="hidden" name="kind" value={o.kind} />
                          <input type="hidden" name="orderId" value={o.id} />
                          <input type="hidden" name="paid" value={o.paidOutAt ? "0" : "1"} />
                          <button type="submit" className="min-h-[40px] rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold text-app-ink">
                            {o.paidOutAt ? t("payouts.notPaid") : t("payouts.markPaid")}
                          </button>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ListCard>
            )}
          </section>
        }
        side={
          <>
            <PayoutBankSection role="supplier" payoutBank={payoutBank} displayName={supplier.displayName} />
            <Card className="p-5">
              <CardHead title={t("payouts.payoutAccount")} />
              <dl className="m-0 mt-3 divide-y divide-app-line text-[14px]">
                {[
                  [t("payouts.bank"), payoutBank ? `${payoutBank.bankName} ··${payoutBank.accountNumber.slice(-4)}` : t("payouts.notConnected")],
                  [t("payouts.paystackCheck"), payoutAccount?.verificationStatus ?? t("payouts.notSetUp")],
                  [t("payouts.transferRecipient"), payoutAccount?.paystackRecipientCode ? t("payouts.connected") : t("payouts.notCreated")],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 py-2.5">
                    <dt className="text-app-ink-soft">{label}</dt>
                    <dd className="m-0 truncate font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </>
        }
      />
    </AppPage>
  );
}
