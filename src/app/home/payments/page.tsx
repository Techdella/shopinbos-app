import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, ListCard, ListRow, Pill, PillLink, SplitLayout, StatGrid, StatTile, TextLink } from "@/components/app-kit";
import { Bars, ShareBar, formatDate } from "@/components/growth/kit";
import { DEFAULT_PAYMENT_METHODS, type PaymentMethodKey } from "@shared/onboarding";
import { formatDate as formatLocaleDate, formatMoney } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { readSavedPaymentMethods, readTransferWindowHours } from "@shared/checkout-payments";
import { unpaidTransferTtlHours } from "@/lib/commerce/stock-holds";
import { BankCard, type PayoutBankSummary } from "./BankCard";
import { PaymentMethods } from "./PaymentMethods";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("payments");
  return { title: t("money.title") };
}

const PAID = ["paid", "processing", "packed", "shipped", "delivered"] as const;
const WAITING = ["pending", "awaiting_payment"] as const;
const REFUNDED = ["refunded", "partially_refunded"] as const;
const DAY = 86_400_000;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Orders taken through Shopinbos checkout have no offline payment method (or "paystack"). */
function isOnline(method: string | null) {
  return !method || method === "paystack";
}

function lagosDayKey(date: Date) {
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

function readBank(settings: Record<string, unknown>): PayoutBankSummary | null {
  const bank = record(settings.payoutBank);
  if (!bank.bankName) return null;
  const digits = String(bank.accountNumberMask ?? bank.accountNumber ?? "").replace(/\D/g, "");
  return {
    bankName: String(bank.bankName),
    accountName: String(bank.accountName ?? ""),
    accountEnding: digits.slice(-4),
    status: typeof bank.verificationStatus === "string" ? bank.verificationStatus : null,
  };
}

// Read exactly as checkout does (readSavedPaymentMethods): a store that never saved its choices offers card
// payments only, and a choice that was never saved is off. Showing the onboarding defaults here instead made
// "Pay on delivery" look on while shoppers never saw it.
function readMethods(settings: Record<string, unknown>): Record<PaymentMethodKey, boolean> {
  const saved = readSavedPaymentMethods(settings);
  return Object.fromEntries(
    (Object.keys(DEFAULT_PAYMENT_METHODS) as PaymentMethodKey[]).map((key) => [key, saved ? saved[key] === true : key === "card"]),
  ) as Record<PaymentMethodKey, boolean>;
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
  const settings = record(store?.brandSettings);
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY);

  const [recent, waiting, latestPaid] = store
    ? await Promise.all([
        db.retailOrder.findMany({
          where: { storeId: store.id, createdAt: { gte: since } },
          select: { total: true, status: true, paymentMethod: true, createdAt: true },
          take: 5000,
        }),
        db.retailOrder.aggregate({ where: { storeId: store.id, status: { in: [...WAITING] } }, _sum: { total: true }, _count: true }),
        db.retailOrder.findMany({
          where: { storeId: store.id, status: { in: [...PAID] } },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, orderNumber: true, buyerName: true, total: true, paymentMethod: true, createdAt: true },
        }),
      ])
    : [[], null, []];

  const paid = recent.filter((order) => (PAID as readonly string[]).includes(order.status));
  const online = paid.filter((order) => isOnline(order.paymentMethod)).reduce((sum, order) => sum + order.total, 0);
  const offline = paid.filter((order) => !isOnline(order.paymentMethod)).reduce((sum, order) => sum + order.total, 0);
  const refunded = recent.filter((order) => (REFUNDED as readonly string[]).includes(order.status)).reduce((sum, order) => sum + order.total, 0);
  const moneyIn = online + offline;

  // Money in per day for the last 14 days, Lagos time.
  const days = Array.from({ length: 14 }, (_, index) => lagosDayKey(new Date(now.getTime() - (13 - index) * DAY)));
  const byDay = new Map(days.map((key) => [key, 0]));
  for (const order of paid) {
    const key = lagosDayKey(order.createdAt);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + order.total);
  }
  const daily = days.map((key) => byDay.get(key) ?? 0);
  const dayLabel = (key: string) => formatLocaleDate(new Date(`${key}T12:00:00Z`), locale, { day: "numeric", month: "short" });
  const methodLabel = (method: string | null) => (isOnline(method) ? t("money.online") : t.dynamic(`method.${method}`, PAYMENT_METHOD_LABEL[method!] ?? method!));
  const fortnight = daily.reduce((sum, value) => sum + value, 0);

  // How customers paid, last 30 days.
  const methodTotals = new Map<string, number>();
  for (const order of paid) {
    const label = methodLabel(order.paymentMethod);
    methodTotals.set(label, (methodTotals.get(label) ?? 0) + order.total);
  }
  const methods = [...methodTotals.entries()].sort((a, b) => b[1] - a[1]);

  const bank = readBank(settings);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("money.title")}
      sub={t("money.sub")}
      actions={
        <>
          <PillLink href="/home/invoices" icon="document">{t("invoices")}</PillLink>
          <PillLink href="/home/payouts" icon="bank">{t("payouts")}</PillLink>
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
                {paid.length
                  ? t("money.from", { count: paid.length, online: naira(online), offline: naira(offline) })
                  : t("money.none")}
              </p>
            </Card>

            <StatGrid>
              <StatTile tone="card" label={t("money.online")} value={naira(online)} hint={t("money.last30")} />
              <StatTile tone="card" label={t("money.collected")} value={naira(offline)} hint={t("money.collectedHint")} />
              <StatTile tone="card" label={t("money.waiting")} value={naira(waiting?._sum.total ?? 0)} hint={t("count.orders", { count: waiting?._count ?? 0 })} />
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
            <PaymentMethods initial={readMethods(settings)} transferWindow={{ hours: readTransferWindowHours(settings), defaultHours: unpaidTransferTtlHours(process.env.UNPAID_TRANSFER_TTL_HOURS) }} />
            <AssistantNote>
              {t("money.note")}
            </AssistantNote>
          </>
        }
      />
    </SellerPage>
  );
}
