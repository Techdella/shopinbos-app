import Link from "next/link";
import { AppPage, Card, CardHead, EmptyState, StatGrid, StatTile } from "@/components/app-kit";
import { adminFrame, formatDate } from "@/components/admin/AdminKit";
import { requireRole } from "@/lib/server-auth";
import { platformFeeSummary } from "@/lib/wallet/platform-fees.server";

export const dynamic = "force-dynamic";

// Admin › Wallets › Shopinbos fees: what Shopinbos earns on payments (src/lib/wallet/platform-fees.server.ts).
// Every other naira of a store payment settles straight to the businesses through their Paystack subaccounts.

const CREDIT_METHOD = { card: "Card", auto: "Auto top-up", wallet: "Wallet balance" } as const;

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export default async function AdminPlatformFeesPage() {
  const user = await requireRole(["admin"], "/admin/login");
  const summary = await platformFeeSummary();
  return (
    <AppPage frame={adminFrame(user)} title="Shopinbos fees" sub="What Shopinbos keeps from store payments split through Paystack (the rest settles straight to each business's bank), subscription payments and AI credit purchases.">
      <p className="mb-4 mt-0 text-[13.5px]">
        <Link href="/admin/wallets" className="font-bold underline underline-offset-4">← Wallets</Link>
      </p>
      <StatGrid className="mb-5">
        {summary.periods.map((period) => (
          <StatTile
            key={period.key}
            label={period.label}
            value={naira(period.feeKobo + period.commissionKobo)}
            hint={`${period.orders} paid order${period.orders === 1 ? "" : "s"} · ${naira(period.volumeKobo)} through checkout${period.commissionKobo ? ` · ${naira(period.commissionKobo)} supplier commission` : ""}`}
          />
        ))}
      </StatGrid>
      <StatGrid className="mb-5">
        <StatTile label="Spent on Shopinbos services from wallets (30 days)" value={naira(summary.walletSpendKobo.month)} hint={`${naira(summary.walletSpendKobo.all)} all time`} />
        <StatTile label="Paid into businesses' wallet account numbers (30 days)" value={naira(summary.transfersInKobo.month)} hint={`${naira(summary.transfersInKobo.all)} all time · settled straight to their banks`} />
      </StatGrid>
      <h2 className="mb-3 mt-0 text-[18px] font-extrabold">Subscriptions</h2>
      <StatGrid className="mb-5">
        {summary.subscriptions.periods.map((period) => (
          <StatTile key={period.key} label={period.label} value={naira(period.amountKobo)} hint={`${period.payments} subscription payment${period.payments === 1 ? "" : "s"}`} />
        ))}
      </StatGrid>
      <Card className="mb-5 overflow-x-auto">
        <CardHead title="Subscription payments" sub="Plan payments through Paystack: first payments and renewals. Subscriptions are paid to Shopinbos in full." />
        {summary.subscriptions.latest.length ? (
          <>
            <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
              <thead className="text-[12px] uppercase tracking-[0.06em] text-app-ink-soft">
                <tr>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3 text-right">Subscribed now</th>
                  <th className="px-4 py-3 text-right">Payments</th>
                  <th className="px-4 py-3 text-right">Paid all time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-line">
                {summary.subscriptions.tiers.map((row) => (
                  <tr key={row.tier}>
                    <td className="px-4 py-3 font-bold">{row.label} <span className="font-normal text-app-ink-soft">· {row.role === "logistics_partner" ? "delivery" : row.role}</span></td>
                    <td className="px-4 py-3 text-right">{row.active}</td>
                    <td className="px-4 py-3 text-right">{row.payments}</td>
                    <td className="px-4 py-3 text-right font-bold">{naira(row.amountKobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="mt-2 w-full min-w-[720px] border-collapse border-t border-app-line text-left text-[13.5px]">
              <thead className="text-[12px] uppercase tracking-[0.06em] text-app-ink-soft">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-line">
                {summary.subscriptions.latest.map((row) => (
                  <tr key={row.reference}>
                    <td className="px-4 py-3">
                      <span className="font-bold">{row.who}</span>
                      {row.email ? <span className="block text-[12px] text-app-ink-soft">{row.email}</span> : null}
                    </td>
                    <td className="px-4 py-3">{row.plan}{row.renewal ? <span className="text-app-ink-soft"> · renewal</span> : null}</td>
                    <td className="px-4 py-3 text-app-ink-soft">{formatDate(row.at)}</td>
                    <td className="px-4 py-3 text-right font-bold">{naira(row.amountKobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <EmptyState icon="coin" title="No subscription payments yet">Plan payments show here once someone subscribes.</EmptyState>
        )}
      </Card>
      <h2 className="mb-3 mt-0 text-[18px] font-extrabold">AI credits</h2>
      <StatGrid className="mb-5">
        {summary.credits.periods.map((period) => (
          <StatTile key={period.key} label={period.label} value={naira(period.amountKobo)} hint={`${period.purchases} pack${period.purchases === 1 ? "" : "s"} · ${period.credits.toLocaleString("en-NG")} credits`} />
        ))}
      </StatGrid>
      <Card className="mb-5 overflow-x-auto">
        <CardHead
          title="AI credit purchases"
          sub={`All time: ${summary.credits.byMethod.map((row) => `${naira(row.amountKobo)} ${CREDIT_METHOD[row.method].toLowerCase()} (${row.purchases})`).join(" · ")}. Packs paid from the wallet are also in wallet spend above.`}
        />
        {summary.credits.latest.length ? (
          <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
            <thead className="text-[12px] uppercase tracking-[0.06em] text-app-ink-soft">
              <tr>
                <th className="px-4 py-3">Business</th>
                <th className="px-4 py-3">Credits</th>
                <th className="px-4 py-3">Paid by</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-line">
              {summary.credits.latest.map((row) => (
                <tr key={row.reference}>
                  <td className="px-4 py-3">
                    <span className="font-bold">{row.who}</span>
                    {row.email ? <span className="block text-[12px] text-app-ink-soft">{row.email}</span> : null}
                  </td>
                  <td className="px-4 py-3">{row.credits.toLocaleString("en-NG")}</td>
                  <td className="px-4 py-3">{CREDIT_METHOD[row.method]}</td>
                  <td className="px-4 py-3 text-app-ink-soft">{formatDate(row.at)}</td>
                  <td className="px-4 py-3 text-right font-bold">{naira(row.amountKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon="coin" title="No AI credit purchases yet">Credit packs bought by card, auto top-up or from the wallet show here.</EmptyState>
        )}
      </Card>
      <Card className="overflow-x-auto">
        <CardHead title="Latest fees" sub="Store orders where Shopinbos kept a fee or a supplier commission." />
        {summary.latest.length ? (
          <table className="w-full min-w-[720px] border-collapse text-left text-[13.5px]">
            <thead className="text-[12px] uppercase tracking-[0.06em] text-app-ink-soft">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Order total</th>
                <th className="px-4 py-3 text-right">Shopinbos fee</th>
                <th className="px-4 py-3 text-right">Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-line">
              {summary.latest.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-bold">{row.orderNumber}</td>
                  <td className="px-4 py-3">{row.store}</td>
                  <td className="px-4 py-3 text-app-ink-soft">{formatDate(row.at)}</td>
                  <td className="px-4 py-3 text-right">{naira(row.totalKobo)}</td>
                  <td className="px-4 py-3 text-right font-bold">{naira(row.feeKobo)}</td>
                  <td className="px-4 py-3 text-right">{row.commissionKobo ? naira(row.commissionKobo) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon="coin" title="No fees yet">Fees show here once paid store orders are split through Paystack.</EmptyState>
        )}
      </Card>
    </AppPage>
  );
}
