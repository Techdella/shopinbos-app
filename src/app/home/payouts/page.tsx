import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/seller/Pagination";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { formatDate, humanize } from "@/components/growth/kit";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { formatMoney } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { sellerBalance } from "@/lib/commerce/payment-split.server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("payments");
  return { title: t("po.title") };
}

const PAID = ["paid", "processing", "packed", "shipped", "delivered"] as const;
const PAGE_SIZE = 50;

function isOnline(method: string | null) {
  return !method || method === "paystack";
}

export default async function SellerPayoutsPage({ searchParams }: { searchParams?: Promise<{ show?: string; page?: string }> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("payments", "orders", "common");
  const locale = await getLocale();
  const naira = (amount: number) => formatMoney(Math.round(amount), locale);
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true } });

  // Totals cover every paid order; the list shows one page of the chosen kind.
  const storeId = store?.id ?? "__none__";
  const paidWhere: Prisma.RetailOrderWhereInput = { storeId, status: { in: [...PAID] } };
  const onlineWhere: Prisma.RetailOrderWhereInput = { ...paidWhere, OR: [{ paymentMethod: null }, { paymentMethod: "paystack" }] };
  const offlineWhere: Prisma.RetailOrderWhereInput = { ...paidWhere, AND: [{ NOT: { paymentMethod: null } }, { NOT: { paymentMethod: "paystack" } }] };
  const [onlineSum, offlineSum] = store
    ? await Promise.all([
        db.retailOrder.aggregate({ where: onlineWhere, _count: { _all: true }, _sum: { total: true } }),
        db.retailOrder.aggregate({ where: offlineWhere, _count: { _all: true }, _sum: { total: true } }),
      ])
    : [null, null];
  const onlineCount = onlineSum?._count._all ?? 0;
  const offlineCount = offlineSum?._count._all ?? 0;
  const paidCount = onlineCount + offlineCount;
  const onlineTotal = Number(onlineSum?._sum.total ?? 0);
  const offlineTotal = Number(offlineSum?._sum.total ?? 0);
  const show = params?.show === "offline" ? "offline" : params?.show === "all" ? "all" : "online";
  const paging = pageWindow(params?.page, show === "online" ? onlineCount : show === "offline" ? offlineCount : paidCount, PAGE_SIZE);
  const shown = paging.total
    ? await db.retailOrder.findMany({
        where: show === "online" ? onlineWhere : show === "offline" ? offlineWhere : paidWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: paging.skip,
        take: paging.take,
        select: { id: true, orderNumber: true, buyerName: true, total: true, status: true, paymentMethod: true, createdAt: true },
      })
    : [];
  const brand = store?.brandSettings && typeof store.brandSettings === "object" ? (store.brandSettings as Record<string, unknown>) : {};
  const hasBank = Boolean(brand.payoutBank && typeof brand.payoutBank === "object" && (brand.payoutBank as Record<string, unknown>).bankName);
  // Split payments: what refunded orders left the seller owing (+), or Shopinbos owing them (-).
  const balance = store ? await sellerBalance(store.id).catch(() => 0) : 0;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("po.title")}
      sub={t("po.sub")}
      actions={<PillLink href="/home/payments" icon="coin">{t("money.title")}</PillLink>}
    >
      <div className="grid gap-5">
        {!hasBank && (
          <AssistantNote action={<PillLink href="/home/payments" tone="ink" size="sm">{t("bank.add")}</PillLink>}>
            {t("po.noBank")}
          </AssistantNote>
        )}

        {balance >= 1 && <AssistantNote>{t("po.splitOwes", { amount: naira(balance) })}</AssistantNote>}
        {balance <= -1 && <AssistantNote>{t("po.splitOwed", { amount: naira(-balance) })}</AssistantNote>}

        <StatGrid>
          <StatTile tone="card" label={t("po.paidOnline")} value={naira(onlineTotal)} hint={t("count.orders", { count: onlineCount })} />
          <StatTile tone="card" label={t("money.collected")} value={naira(offlineTotal)} hint={t("count.orders", { count: offlineCount })} />
          <StatTile tone="card" label={t("po.paidOrders")} value={paidCount} hint={t("po.allTime")} />
          <StatTile tone="card" label={t("bank.title")} value={hasBank ? t("po.added") : t("po.notAdded")} />
        </StatGrid>

        <FilterChips
          items={[
            { label: t("po.paidOnline"), href: "/home/payouts", count: onlineCount, active: show === "online" },
            { label: t("money.collected"), href: "/home/payouts?show=offline", count: offlineCount, active: show === "offline" },
            { label: t("po.all"), href: "/home/payouts?show=all", count: paidCount, active: show === "all" },
          ]}
        />

        {shown.length ? (
          <div>
          <ListCard>
            {shown.map((order) => (
              <ListRow key={order.id} href={`/home/orders/${order.id}`}>
                <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <span className="block truncate text-[14.5px] font-extrabold">{order.buyerName || t("money.customer")}</span>
                  <span className="block truncate font-mono text-[12.5px] text-app-ink-soft">{order.orderNumber}</span>
                </span>
                <span className="text-[13px] text-app-ink-soft sm:w-[150px]">
                  {isOnline(order.paymentMethod) ? t("po.onlineToBank") : t("po.keptByYou", { method: t.dynamic(`method.${order.paymentMethod}`, PAYMENT_METHOD_LABEL[order.paymentMethod!] ?? order.paymentMethod!) })}
                </span>
                <span className="text-[13px] text-app-ink-soft sm:w-[100px]">{formatDate(order.createdAt, false, locale)}</span>
                <Pill tone={order.status === "delivered" ? "success" : "info"}>{t.dynamic(`status.${order.status}`, humanize(order.status))}</Pill>
                <span className="text-[14px] font-extrabold sm:w-[100px] sm:text-right">{naira(order.total)}</span>
              </ListRow>
            ))}
          </ListCard>
          <Pagination {...paging} base="/home/payouts" params={{ show: show === "online" ? undefined : show }} label={t("po.pages")} />
          </div>
        ) : (
          <EmptyState icon="coin" title={t("po.empty")}>{t("po.emptySub")}</EmptyState>
        )}

        <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">{t("po.note")}</p>
      </div>
    </SellerPage>
  );
}
