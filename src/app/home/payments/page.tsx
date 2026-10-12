import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, Card, CardHead, ListCard, ListRow, Pill, PillLink, SplitLayout, StatGrid, StatTile, TextLink } from "@/components/app-kit";
import { Bars, ShareBar, formatDate } from "@/components/growth/kit";
import { DEFAULT_PAYMENT_METHODS, naira, type PaymentMethodKey } from "@shared/onboarding";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { readSavedPaymentMethods } from "@shared/checkout-payments";
import { BankCard, type PayoutBankSummary } from "./BankCard";
import { PaymentMethods } from "./PaymentMethods";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Money" };

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
  const dayLabel = (key: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));
  const fortnight = daily.reduce((sum, value) => sum + value, 0);

  // How customers paid, last 30 days.
  const methodTotals = new Map<string, number>();
  for (const order of paid) {
    const label = isOnline(order.paymentMethod) ? "Online checkout" : PAYMENT_METHOD_LABEL[order.paymentMethod!] ?? order.paymentMethod!;
    methodTotals.set(label, (methodTotals.get(label) ?? 0) + order.total);
  }
  const methods = [...methodTotals.entries()].sort((a, b) => b[1] - a[1]);

  const bank = readBank(settings);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Money"
      sub="Shopinbos handles checkout. Here's what came in, what's still owed, and where your money goes."
      actions={
        <>
          <PillLink href="/home/invoices" icon="document">Invoices</PillLink>
          <PillLink href="/home/payouts" icon="bank">Payouts</PillLink>
          <PillLink href="/home/orders/new" tone="accent" icon="plus">Record a sale</PillLink>
        </>
      }
    >
      <SplitLayout
        main={
          <>
            <Card className="app-wash relative overflow-hidden p-6 sm:p-7">
              <div className="text-[14px] text-app-ink-soft">Money in, last 30 days</div>
              <div className="mt-2 break-words text-[40px] font-extrabold leading-none tracking-[-1px] sm:text-[48px]">{naira(moneyIn)}</div>
              <p className="mb-0 mt-3 max-w-[560px] text-[14.5px] leading-[1.5] text-app-ink-soft">
                {paid.length
                  ? `From ${paid.length} paid order${paid.length === 1 ? "" : "s"}. ${naira(online)} came through online checkout and ${naira(offline)} you collected yourself.`
                  : "No paid orders in the last 30 days. Share your shop link to get the next one."}
              </p>
            </Card>

            <StatGrid>
              <StatTile tone="card" label="Online checkout" value={naira(online)} hint="Last 30 days" />
              <StatTile tone="card" label="Collected yourself" value={naira(offline)} hint="Cash, transfer, POS" />
              <StatTile tone="card" label="Waiting for payment" value={naira(waiting?._sum.total ?? 0)} hint={`${waiting?._count ?? 0} order${waiting?._count === 1 ? "" : "s"}`} />
              <StatTile tone="card" label="Refunded" value={naira(refunded)} hint="Last 30 days" />
            </StatGrid>

            <Card className="p-5">
              <CardHead title="Money in, last 14 days" sub={`${naira(fortnight)} in total`} />
              <div className="mt-5">
                <Bars
                  values={daily}
                  labels={days.map((key, index) => (index === days.length - 1 ? "Today" : index % 7 === 0 ? dayLabel(key) : ""))}
                  format={naira}
                  recent={7}
                  summary={`Money from paid orders for each of the last 14 days. ${naira(fortnight)} in total.`}
                />
              </div>
            </Card>

            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="m-0 text-[17px] font-extrabold">Latest payments</h2>
                <TextLink href="/home/orders">All orders</TextLink>
              </div>
              {latestPaid.length ? (
                <ListCard>
                  {latestPaid.map((order) => (
                    <ListRow key={order.id} href={`/home/orders/${order.id}`}>
                      <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                        <span className="block truncate text-[14.5px] font-extrabold">{order.buyerName || "Customer"}</span>
                        <span className="block truncate text-[13px] text-app-ink-soft">{order.orderNumber} · {formatDate(order.createdAt)}</span>
                      </span>
                      <span className="text-[13px] text-app-ink-soft sm:w-[140px]">{isOnline(order.paymentMethod) ? "Online checkout" : PAYMENT_METHOD_LABEL[order.paymentMethod!] ?? order.paymentMethod}</span>
                      <Pill tone="success">Paid</Pill>
                      <span className="text-[14px] font-extrabold sm:w-[100px] sm:text-right">{naira(order.total)}</span>
                    </ListRow>
                  ))}
                </ListCard>
              ) : (
                <Card className="px-5 py-8 text-center text-[14px] text-app-ink-soft">Paid orders show up here.</Card>
              )}
            </section>
          </>
        }
        side={
          <>
            <BankCard bank={bank} />
            <Card className="p-5">
              <CardHead title="How customers paid" sub="Last 30 days" />
              {methods.length ? (
                <div className="mt-4 grid gap-3.5">
                  {methods.map(([label, total], index) => (
                    <ShareBar key={label} label={label} value={naira(total)} share={moneyIn ? total / moneyIn : 0} tone={index === 0 ? "success" : "ink"} />
                  ))}
                </div>
              ) : (
                <p className="mb-0 mt-2 text-[14px] text-app-ink-soft">Shows up after your first paid order.</p>
              )}
            </Card>
            <PaymentMethods initial={readMethods(settings)} />
            <AssistantNote>
              Online payments go through Paystack checkout and are paid out to your payout bank. Cash, transfers and POS you record yourself never pass through Shopinbos.
            </AssistantNote>
          </>
        }
      />
    </SellerPage>
  );
}
