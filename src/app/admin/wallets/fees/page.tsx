import Link from "next/link";
import { AppPage, Card, Pill, type Tone } from "@/components/app-kit";
import { adminFrame, formatDate } from "@/components/admin/AdminKit";
import { cx } from "@/components/app-ui/cx";
import { Icon } from "@/components/ui/Icon";
import { requireRole } from "@/lib/server-auth";
import { EXPORT_PERIODS, feeLines, type ExportPeriod } from "@/lib/wallet/fees-export.server";

export const dynamic = "force-dynamic";

// Admin › Wallets › Shopinbos fees: everything Shopinbos earns, for one period at a time (src/lib/wallet/fees-export.
// server.ts): store fees and supplier commissions kept from split store payments, subscriptions, AI credits and other
// purchases. One total, the split by type, and one list of payments that can be filtered by type and downloaded.

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const SHOWN = 100;

const TYPE_TONE: Record<string, Tone> = {
  "Store fee": "accent",
  "Supplier commission": "warning",
  Subscription: "success",
  "AI credits": "info",
};
const BAR: Record<Tone, string> = {
  accent: "bg-app-accent",
  warning: "bg-[#F2A93B]",
  success: "bg-app-success",
  info: "bg-[#3D4FB8]",
  muted: "bg-app-ink-soft",
  danger: "bg-app-danger",
  ink: "bg-app-ink",
};
const toneOf = (type: string) => TYPE_TONE[type] ?? "muted";

type Search = { period?: string; type?: string };

export default async function AdminPlatformFeesPage(props: { searchParams?: Promise<Search> }) {
  const user = await requireRole(["admin"], "/admin/login");
  const search = (await props.searchParams) ?? {};
  const period: ExportPeriod = search.period && search.period in EXPORT_PERIODS ? (search.period as ExportPeriod) : "month";
  const report = await feeLines(period);
  const type = report.totals.some((total) => total.type === search.type) ? search.type : undefined;
  const lines = type ? report.lines.filter((line) => line.type === type) : report.lines;
  const href = (next: Search) => {
    const params = new URLSearchParams();
    const merged = { period, type, ...next };
    if (merged.period && merged.period !== "month") params.set("period", merged.period);
    if (merged.type) params.set("type", merged.type);
    const query = params.toString();
    return `/admin/wallets/fees${query ? `?${query}` : ""}`;
  };
  const download = (format: "csv" | "pdf") => `/api/admin/wallets/fees/export?format=${format}&period=${period}`;

  return (
    <AppPage frame={adminFrame(user)} title="Shopinbos fees" sub="What Shopinbos earns: fees on store payments, subscriptions, AI credits and other purchases.">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Period" className="flex flex-wrap gap-1 rounded-full border border-app-line bg-white p-1">
          {(Object.keys(EXPORT_PERIODS) as ExportPeriod[]).map((key) => (
            <Link
              key={key}
              href={href({ period: key, type: undefined })}
              aria-current={key === period ? "page" : undefined}
              className={cx("inline-flex min-h-[36px] items-center rounded-full px-4 text-[13.5px] font-bold no-underline", key === period ? "bg-app-ink text-white" : "text-app-ink hover:bg-app-canvas")}
            >
              {EXPORT_PERIODS[key]}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <a href={download("csv")} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-extrabold no-underline">
            <Icon name="download" size={14} /> CSV
          </a>
          <a href={download("pdf")} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-extrabold no-underline">
            <Icon name="download" size={14} /> PDF
          </a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[22px] bg-app-ink p-6 text-white">
          <div className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-white/60">Shopinbos earned · {EXPORT_PERIODS[period]}</div>
          <div className="mt-2 text-[40px] font-extrabold leading-none tracking-[-1px]">{naira(report.totalKobo)}</div>
          <div className="mt-2 text-[13.5px] text-white/70">
            {report.lines.length ? `From ${report.lines.length} payment${report.lines.length === 1 ? "" : "s"}` : "Nothing earned in this period yet"}
          </div>
          {report.totals.length ? (
            <ul className="m-0 mt-6 grid list-none gap-3 p-0">
              {report.totals.map((total) => (
                <li key={total.type}>
                  <div className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="font-bold">
                      {total.type} <span className="font-normal text-white/60">· {total.count}</span>
                    </span>
                    <span className="font-extrabold">{naira(total.amountKobo)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={cx("h-full rounded-full", BAR[toneOf(total.type)])} style={{ width: `${Math.max(2, Math.round((total.amountKobo / Math.max(report.totalKobo, 1)) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <div className="grid content-start gap-4">
          <Card className="p-5">
            <h2 className="m-0 text-[15px] font-extrabold">On a paid plan now</h2>
            {report.subscribers.length ? (
              <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                {report.subscribers.map((plan) => (
                  <li key={`${plan.role}:${plan.label}`} className="flex items-center justify-between gap-3 text-[14px]">
                    <span>
                      {plan.label} <span className="text-app-ink-soft">· {plan.role === "logistics_partner" ? "delivery" : plan.role}</span>
                    </span>
                    <span className="font-extrabold">{plan.active}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 mt-2 text-[13.5px] text-app-ink-soft">No one is on a paid plan yet.</p>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="m-0 text-[15px] font-extrabold">Through wallets</h2>
            <p className="mb-3 mt-0.5 text-[12.5px] text-app-ink-soft">Last 30 days. Not counted in what Shopinbos earned.</p>
            <dl className="m-0 grid gap-2 text-[14px]">
              <div className="flex items-center justify-between gap-3">
                <dt>Spent on Shopinbos services</dt>
                <dd className="m-0 font-extrabold">{naira(report.wallet.spendKobo.month)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Paid into wallet account numbers</dt>
                <dd className="m-0 font-extrabold">{naira(report.wallet.transfersInKobo.month)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-line px-5 py-4">
          <h2 className="m-0 text-[17px] font-extrabold">Payments</h2>
          {report.totals.length > 1 ? (
            <nav aria-label="Type" className="flex flex-wrap gap-1.5">
              {[{ label: "All", value: undefined, count: report.lines.length }, ...report.totals.map((total) => ({ label: total.type, value: total.type, count: total.count }))].map((chip) => (
                <Link
                  key={chip.label}
                  href={href({ type: chip.value })}
                  aria-current={chip.value === type ? "page" : undefined}
                  className={cx(
                    "inline-flex min-h-[32px] items-center rounded-full border px-3 text-[13px] font-bold no-underline",
                    chip.value === type ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
                  )}
                >
                  {chip.label}
                  <span className={cx("ml-1", chip.value === type ? "text-white/70" : "text-app-ink-soft")}>{chip.count}</span>
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
        {lines.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-[14px]">
              <thead className="bg-app-canvas text-[12px] font-bold uppercase tracking-[0.06em] text-app-ink-soft">
                <tr>
                  <th className="px-5 py-2.5 font-bold">Date</th>
                  <th className="px-5 py-2.5 font-bold">Business</th>
                  <th className="px-5 py-2.5 font-bold">Type</th>
                  <th className="px-5 py-2.5 font-bold">What</th>
                  <th className="px-5 py-2.5 text-right font-bold">Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-line">
                {lines.slice(0, SHOWN).map((line, index) => (
                  <tr key={`${line.at}:${line.type}:${index}`} className="align-top">
                    <td className="whitespace-nowrap px-5 py-3.5 text-app-ink-soft">{formatDate(line.at)}</td>
                    <td className="px-5 py-3.5">
                      <span className="font-bold">{line.business}</span>
                      {line.email ? <span className="block text-[12.5px] text-app-ink-soft">{line.email}</span> : null}
                    </td>
                    <td className="px-5 py-3.5"><Pill tone={toneOf(line.type)}>{line.type}</Pill></td>
                    <td className="px-5 py-3.5">
                      {line.item}
                      {line.orderKobo !== null ? <span className="block text-[12.5px] text-app-ink-soft">Order total {naira(line.orderKobo)}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right font-extrabold">{naira(line.amountKobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lines.length > SHOWN ? (
              <p className="m-0 border-t border-app-line px-5 py-3 text-[13px] text-app-ink-soft">
                Showing the latest {SHOWN} of {lines.length}. <a href={download("csv")} className="font-bold text-app-ink underline underline-offset-4">Download the CSV</a> for all of them.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="m-0 px-5 py-10 text-center text-[14px] text-app-ink-soft">No payments in this period. Try a longer period above.</p>
        )}
      </Card>

      <p className="mb-0 mt-4 text-[12.5px] leading-[1.5] text-app-ink-soft">
        Store fees and supplier commissions are what Shopinbos keeps when a store payment is split; the rest settles straight to each business&apos;s bank. Only paid purchases count: refunds, domains free with a plan, add-ons included in a plan and cancelled print orders are left out.
      </p>
      <p className="mb-0 mt-3 text-[13.5px]">
        <Link href="/admin/wallets" className="font-bold underline underline-offset-4">← Wallets</Link>
      </p>
    </AppPage>
  );
}
