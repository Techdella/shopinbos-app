import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, ListCard, ListRow, MoreActions, Pill, PillLink, SplitLayout, StatGrid, StatTile, TextLink } from "@/components/app-kit";
import { Bars, ShareBar, formatDate } from "@/components/growth/kit";
import { formatDate as formatLocaleDate, formatMoney } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { isOnlinePayment } from "@shared/seller-payments";
import { sellerMoneyOverview, sellerPaymentStates } from "@/lib/seller-payments.server";
import { BankCard } from "./BankCard";
import { PaymentMethods } from "./PaymentMethods";
import { readCodLimit } from "@shared/checkout-payments";
import { PaymentLogos } from "./PaymentLogos";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("payments");
  return { title: t("money.title") };
}

export default async function SellerPaymentsPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("payments", "orders", "common");
  const locale = await getLocale();
  const naira = (amount: number) => formatMoney(Math.round(amount), locale);
  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true },
  });
  const now = new Date();
  const [{ summary, waiting, latestPaid, methods: savedMethods, transferWindow, bank, paymentBadges }, methodStates] = await Promise.all([
    sellerMoneyOverview(store, now),
    sellerPaymentStates(user.id, store),
  ]);
  const { paidCount, online, offline, refunded, moneyIn } = summary;
  const days = summary.daily.map((row) => row.day);
  const daily = summary.daily.map((row) => row.total);
  const dayLabel = (key: string) => formatLocaleDate(new Date(`${key}T12:00:00Z`), locale, { day: "numeric", month: "short" });
  const methodLabel = (method: string | null) => (isOnlinePayment(method) ? t("money.online") : t.dynamic(`method.${method}`, PAYMENT_METHOD_LABEL[method!] ?? method!));
  const fortnight = daily.reduce((sum, value) => sum + value, 0);

  // How customers paid, last 30 days.
  const methods = summary.byMethod.map((row) => [methodLabel(row.method), row.total] as const);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("money.title")}
      sub={t("money.sub")}
      actions={
        <>
          <MoreActions>
            <PillLink href="/home/invoices" icon="document">{t("invoices")}</PillLink>
            <PillLink href="/home/payouts" icon="bank">{t("payouts")}</PillLink>
          </MoreActions>
          <PillLink href="/home/orders/new" tone="accent" icon="plus">{t("recordSale")}</PillLink>
        </>
      }
    >
      <SplitLayout
        main={
          <>
            <Card className="app-wash relative overflow-hidden p-6 sm:p-7">
              <div className="text-[14px] text-app-ink-soft">{t("money.in30")}</div>
              <div className="mt-2 break-words text-[40px] font-extrabold leading-none tracking-[-1px] sm:text-[48px]">{naira(moneyIn)}</div>
              <p className="mb-0 mt-3 max-w-[560px] text-[14.5px] leading-[1.5] text-app-ink-soft">
                {paidCount
                  ? t("money.from", { count: paidCount, online: naira(online), offline: naira(offline) })
                  : t("money.none")}
              </p>
            </Card>

            <StatGrid>
              <StatTile tone="card" label={t("money.online")} value={naira(online)} hint={t("money.last30")} />
              <StatTile tone="card" label={t("money.collected")} value={naira(offline)} hint={t("money.collectedHint")} />
              <StatTile tone="card" label={t("money.waiting")} value={naira(waiting.total)} hint={t("count.orders", { count: waiting.count })} />
              <StatTile tone="card" label={t("money.refunded")} value={naira(refunded)} hint={t("money.last30")} />
            </StatGrid>

            <Card className="p-5">
              <CardHead title={t("money.in14")} sub={t("money.inTotal", { amount: naira(fortnight) })} />
              <div className="mt-5">
                <Bars
                  values={daily}
                  labels={days.map((key, index) => (index === days.length - 1 ? t("time.today") : index % 7 === 0 ? dayLabel(key) : ""))}
                  format={naira}
                  recent={7}
                  summary={t("money.chartSummary", { amount: naira(fortnight) })}
                />
              </div>
            </Card>

            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="m-0 text-[17px] font-extrabold">{t("money.latest")}</h2>
                <TextLink href="/home/orders">{t("money.allOrders")}</TextLink>
              </div>
              {latestPaid.length ? (
                <ListCard>
                  {latestPaid.map((order) => (
                    <ListRow key={order.id} href={`/home/orders/${order.id}`}>
                      <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                        <span className="block truncate text-[14.5px] font-extrabold">{order.buyerName || t("money.customer")}</span>
                        <span className="block truncate text-[13px] text-app-ink-soft">{order.orderNumber} · {formatDate(order.createdAt, false, locale)}</span>
                      </span>
                      <span className="text-[13px] text-app-ink-soft sm:w-[140px]">{methodLabel(order.paymentMethod)}</span>
                      <Pill tone="success">{t("money.paid")}</Pill>
                      <span className="text-[14px] font-extrabold sm:w-[100px] sm:text-right">{naira(order.total)}</span>
                    </ListRow>
                  ))}
                </ListCard>
              ) : (
                <Card className="px-5 py-8 text-center text-[14px] text-app-ink-soft">{t("money.latestEmpty")}</Card>
              )}
            </section>
          </>
        }
        side={
          <>
            <BankCard bank={bank} />
            <Card className="p-5">
              <CardHead title={t("money.how")} sub={t("money.last30")} />
              {methods.length ? (
                <div className="mt-4 grid gap-3.5">
                  {methods.map(([label, total], index) => (
                    <ShareBar key={label} label={label} value={naira(total)} share={moneyIn ? total / moneyIn : 0} tone={index === 0 ? "success" : "ink"} />
                  ))}
                </div>
              ) : (
                <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">{t("money.howEmpty")}</p>
              )}
            </Card>
            <PaymentMethods initial={savedMethods} states={methodStates} transferWindow={transferWindow} codLimit={readCodLimit(store?.brandSettings)} />
            {store ? <PaymentLogos initial={paymentBadges.selected} defaults={paymentBadges.defaults} available={paymentBadges.available} blocked={paymentBadges.blocked} /> : null}
            <AssistantNote>
              {t("money.note")}
            </AssistantNote>
          </>
        }
      />
    </SellerPage>
  );
}
