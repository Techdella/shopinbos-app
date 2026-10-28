import Link from "next/link";
import { Card, CardHead, EmptyState, ListCard, ListRow, Pill, SplitLayout, StatGrid, StatTile } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { getT } from "@/lib/i18n/server";
import { walletBankNames, type WalletView } from "@/lib/wallet/wallet.server";
import type { WalletRole } from "@/lib/wallet/rules";
import { BankForm } from "./WalletForms";
import { MoneyOwedPanel } from "./MoneyOwedPanel";

// The Shopinbos Wallet page body, the same for sellers, suppliers and delivery partners: set up (the bank, then a
// supplier's or delivery partner's business registration, CAC or BN; sellers have no check),
// then the statement of what customers paid them and Paystack's settlements to their bank. Shopinbos never holds
// the money: Paystack splits each payment at checkout and settles each share straight to the business's bank.
// Words in shared/i18n/messages/wallet.

type WalletT = Awaited<ReturnType<typeof getT<["wallet"]>>>;

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }) : "");

function SettlementStatus({ view, t }: { view: WalletView; t: WalletT }) {
  if (view.settlement.frozen) return <Pill tone="danger" dot>{t("status.paused")}</Pill>;
  if (view.settlement.status === "active") return <Pill tone="success" dot>{t("status.receiving")}</Pill>;
  if (view.settlement.status === "review") return <Pill tone="warning" dot>{t("status.checking")}</Pill>;
  if (view.settlement.status === "failed") return <Pill tone="danger" dot>{t("status.attention")}</Pill>;
  return <Pill tone="muted" dot>{t("status.notSetUp")}</Pill>;
}

/** "1.5%", "1.5% (at least ₦100, at most ₦2,000)". */
function feeText(fee: { rate: number; minFee: number; maxFee: number }, t: WalletT) {
  const amount = (value: number) => `₦${value.toLocaleString("en-NG")}`;
  if (fee.minFee > 0 && fee.maxFee > 0) return t("fee.limits", { rate: fee.rate, min: amount(fee.minFee), max: amount(fee.maxFee) });
  if (fee.minFee > 0) return t("fee.min", { rate: fee.rate, min: amount(fee.minFee) });
  if (fee.maxFee > 0) return t("fee.max", { rate: fee.rate, max: amount(fee.maxFee) });
  return `${fee.rate}%`;
}

export async function WalletPanel({ view, role, ownerName, orderHref }: { view: WalletView; role: WalletRole; ownerName: string; orderHref?: (orderId: string) => string }) {
  const t = await getT("wallet");
  const banks = await walletBankNames();
  const done = <span className="ml-1 align-middle"><Pill tone="success">{t("setup.done")}</Pill></span>;
  const who = t.dynamic(`setup.who.${role}`, "");

  const setup = (
    <Card className="grid gap-5 p-5">
      <CardHead title={t("setup.title")} sub={t("setup.sub")} action={<SettlementStatus view={view} t={t} />} />
      {view.settlement.frozen ? <Notice tone="error">{view.settlement.frozenReason ? t("setup.pausedWhy", { reason: view.settlement.frozenReason }) : t("setup.paused")}</Notice> : null}
      <section className="grid gap-3 border-t border-app-line pt-4">
        <h3 className="m-0 text-[15px] font-extrabold">{t("setup.bankStep")} {view.settlement.status === "active" ? done : null}</h3>
        {view.bank ? (
          <p className="m-0 text-[14px]">
            <strong>{view.bank.accountName}</strong> · {view.bank.bankName} {view.bank.accountEnding}
          </p>
        ) : null}
        {view.settlement.status === "review" ? <Notice tone="info">{t("setup.review")}</Notice> : null}
        {view.settlement.status === "failed" && view.settlement.error ? <Notice tone="error">{t("setup.failed", { reason: view.settlement.error })}</Notice> : null}
        {!view.settlement.frozen ? <BankForm banks={banks} current={view.bank} /> : null}
      </section>
      {view.check.kind === "business" ? (
        <section className="grid gap-3 border-t border-app-line pt-4">
          <h3 className="m-0 text-[15px] font-extrabold">{t("setup.businessStep")} {view.check.status === "approved" ? done : null}</h3>
          <p className="m-0 text-[13.5px] leading-[1.45] text-app-ink-soft">{t.dynamic(`setup.business.${view.check.status}`, "")}</p>
          {view.check.status !== "approved" ? (
            <Link href={view.check.href} className="inline-flex min-h-10 w-fit items-center rounded-pill bg-app-ink px-4 text-[14px] font-extrabold text-white">
              {view.check.status === "pending" ? t("setup.businessView") : t("setup.businessGo")}
            </Link>
          ) : null}
        </section>
      ) : null}
      <p className="m-0 border-t border-app-line pt-4 text-[12.5px] leading-[1.5] text-app-ink-soft">
        {view.fee ? t("setup.neverFee", { who, fee: feeText(view.fee, t) }) : view.commissionPct ? t("setup.neverCommission", { who, pct: view.commissionPct }) : t("setup.never", { who })}
      </p>
    </Card>
  );

  const statement = (
    <>
      <StatGrid>
        <StatTile tone="card" label={t("stats.last30")} value={naira(view.totals.last30Kobo)} />
        <StatTile tone="card" label={t("stats.allTime")} value={naira(view.totals.paidKobo)} hint={t("stats.beforeFee")} />
      </StatGrid>
      <MoneyOwedPanel owed={view.owed} role={role} />
      {view.sellerSettles.length ? (
        <Card className="grid gap-3 p-5">
          <CardHead title={t("settles.title")} sub={t("settles.sub")} />
          <ListCard>
            {view.sellerSettles.map((row) => (
              <ListRow key={row.orderId} href={orderHref?.(row.orderId)}>
                <span className="min-w-0 flex-1 text-[14px] font-bold">{t("order", { number: row.orderNumber })}</span>
                <span className="text-[14px] font-extrabold">{naira(row.amountKobo)}</span>
              </ListRow>
            ))}
          </ListCard>
        </Card>
      ) : null}
      <Card className="grid gap-3 p-5">
        <CardHead title={t("payments.title")} sub={t.dynamic(`payments.sub.${role}`, "")} />
        {view.entries.length ? (
          <ListCard>
            {view.entries.map((entry) => (
              <ListRow key={entry.id} href={entry.orderId && orderHref ? orderHref(entry.orderId) : undefined}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold">{entry.description}</span>
                  <span className="block text-[12.5px] text-app-ink-soft">{day(entry.createdAt)}</span>
                </span>
                {entry.status === "refunded" ? <Pill tone="muted">{t("payments.refunded")}</Pill> : null}
                {/* Money taken for what this business owes (shared/money-owed.ts deductionLine): its own line, in red. */}
                <span className={`text-[14px] font-extrabold ${entry.kind === "deduction" ? "text-app-danger" : ""}`}>{entry.kind === "deduction" ? `−${naira(Math.abs(entry.amountKobo))}` : naira(entry.amountKobo)}</span>
              </ListRow>
            ))}
          </ListCard>
        ) : (
          <EmptyState icon="coin" title={t("payments.none")}>{t("payments.noneSub")}</EmptyState>
        )}
      </Card>
      {view.settlements.length ? (
        <Card className="grid gap-3 p-5">
          <CardHead title={t("settlements.title")} />
          <ListCard>
            {view.settlements.map((row) => (
              <ListRow key={row.id}>
                <span className="min-w-0 flex-1 text-[14px] font-bold">{day(row.date) || t("settlements.scheduled")}</span>
                <Pill tone={row.status === "success" || row.status === "processed" ? "success" : "info"}>{row.status || t("settlements.pending")}</Pill>
                <span className="text-[14px] font-extrabold">{naira(row.amountKobo)}</span>
              </ListRow>
            ))}
          </ListCard>
        </Card>
      ) : null}
    </>
  );

  return <SplitLayout main={statement} side={setup} sideWidth="460px" />;
}
