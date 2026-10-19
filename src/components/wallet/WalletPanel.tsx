import { Card, CardHead, EmptyState, ListCard, ListRow, Pill, SplitLayout, StatGrid, StatTile } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { walletBankNames, type WalletView } from "@/lib/wallet/wallet.server";
import type { WalletRole } from "@/lib/wallet/rules";
import { BankForm, KycForm } from "./WalletForms";
import { MoneyOwedPanel } from "./MoneyOwedPanel";

// The Shopinbos Wallet page body, the same for sellers, suppliers and delivery partners: set up (ID, then bank),
// then the statement of what customers paid them and Paystack's settlements to their bank. Shopinbos never holds
// the money: Paystack splits each payment at checkout and settles each share straight to the business's bank.

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" }) : "");

const ROLE_WORDS: Record<WalletRole, { who: string; paidFor: string }> = {
  seller: { who: "your customers", paidFor: "Card payments for your store orders" },
  supplier: { who: "shops selling your products", paidFor: "Your cost on every paid dropship order" },
  logistics_partner: { who: "the shops you deliver for", paidFor: "Delivery payments" },
};

function SettlementStatus({ view }: { view: WalletView }) {
  if (view.settlement.frozen) return <Pill tone="danger" dot>Paused</Pill>;
  if (view.settlement.status === "active") return <Pill tone="success" dot>Receiving payments</Pill>;
  if (view.settlement.status === "review") return <Pill tone="warning" dot>Being checked</Pill>;
  if (view.settlement.status === "failed") return <Pill tone="danger" dot>Needs attention</Pill>;
  return <Pill tone="muted" dot>Not set up</Pill>;
}

/** "1.5%", "1.5% (at least ₦100, at most ₦2,000)". */
function feeText(fee: { rate: number; minFee: number; maxFee: number }) {
  const amount = (value: number) => `₦${value.toLocaleString("en-NG")}`;
  const limits = [fee.minFee > 0 ? `at least ${amount(fee.minFee)}` : null, fee.maxFee > 0 ? `at most ${amount(fee.maxFee)}` : null].filter(Boolean);
  return `${fee.rate}%${limits.length ? ` (${limits.join(", ")})` : ""}`;
}

export async function WalletPanel({ view, role, ownerName, orderHref }: { view: WalletView; role: WalletRole; ownerName: string; orderHref?: (orderId: string) => string }) {
  const words = ROLE_WORDS[role];
  const [firstName = "", ...rest] = ownerName.trim().split(/\s+/);
  const kycDone = view.kyc.status === "verified";
  const banks = await walletBankNames();

  const setup = (
    <Card className="grid gap-5 p-5">
      <CardHead title="Get paid" sub="Add the bank your money goes to. Card payments start as soon as it's set." action={<SettlementStatus view={view} />} />
      {view.settlement.frozen ? <Notice tone="error">Your wallet is paused{view.settlement.frozenReason ? `: ${view.settlement.frozenReason}` : ""}. Contact support to sort it out.</Notice> : null}
      <section className="grid gap-3 border-t border-app-line pt-4">
        <h3 className="m-0 text-[15px] font-extrabold">1. Where should we send your money? {view.settlement.status === "active" ? <span className="ml-1 align-middle"><Pill tone="success">Done</Pill></span> : null}</h3>
        {view.bank ? (
          <p className="m-0 text-[14px]">
            <strong>{view.bank.accountName}</strong> · {view.bank.bankName} {view.bank.accountEnding}
          </p>
        ) : null}
        {view.settlement.status === "review" ? <Notice tone="info">This account isn&apos;t in your name or your business&apos;s, so our team is checking it (usually within a day). Verifying your ID below can approve it at once if the name matches.</Notice> : null}
        {view.settlement.status === "failed" && view.settlement.error ? <Notice tone="error">Paystack couldn&apos;t set up this account: {view.settlement.error}. Check the details or try another account.</Notice> : null}
        {!view.settlement.frozen ? <BankForm banks={banks} current={view.bank} /> : null}
        {view.settlement.status === "active" ? (
          <p className="m-0 text-[13px] text-app-ink-soft">
            Paystack: on. Korapay: {view.settlement.korapay ? "on" : "our team is setting it up for this account"}.
          </p>
        ) : null}
      </section>
      <section className="grid gap-3 border-t border-app-line pt-4">
        <h3 className="m-0 text-[15px] font-extrabold">2. Verify your ID {kycDone ? <span className="ml-1 align-middle"><Pill tone="success">Done</Pill></span> : null}</h3>
        {kycDone ? (
          <p className="m-0 text-[14px] text-app-ink-soft">
            {view.kyc.name} · {view.kyc.idType === "nin" ? "NIN" : "BVN"} ending {view.kyc.idLast4} · verified {day(view.kyc.verifiedAt)}
          </p>
        ) : (
          <>
            <p className="m-0 text-[13.5px] leading-[1.45] text-app-ink-soft">
              {role === "seller"
                ? "Earns your shop a verified badge and approves an account in your name straight away. You can do it any time."
                : "Needed to get verified on Shopinbos. It also approves your ID document, so you don't upload one."}
            </p>
            {view.kyc.checksReady ? <KycForm defaultName={{ firstName, lastName: rest.join(" ") }} /> : <Notice tone="info">ID checks are being switched on. Check back soon.</Notice>}
          </>
        )}
      </section>
      <p className="m-0 border-t border-app-line pt-4 text-[12.5px] leading-[1.5] text-app-ink-soft">
        Shopinbos never holds your money. When {words.who} pay by card or Korapay, the payment is split at checkout and your share settles
        straight to this bank, usually the next working day. Paystack&apos;s fee comes off your share (with Korapay the customer pays it);{" "}
        {view.fee ? `Shopinbos's fee of ${feeText(view.fee)} on each sale (not on delivery) comes off it too.` : "Shopinbos takes nothing."}
      </p>
    </Card>
  );

  const statement = (
    <>
      <StatGrid>
        <StatTile tone="card" label="Paid to you, last 30 days" value={naira(view.totals.last30Kobo)} />
        <StatTile tone="card" label="Paid to you, all time" value={naira(view.totals.paidKobo)} hint="Before Paystack's fee" />
      </StatGrid>
      <MoneyOwedPanel owed={view.owed} role={role} />
      {view.sellerSettles.length ? (
        <Card className="grid gap-3 p-5">
          <CardHead title="Pay these suppliers yourself" sub="They haven't set up a Shopinbos Wallet yet, so their cost was paid to you with the order." />
          <ListCard>
            {view.sellerSettles.map((row) => (
              <ListRow key={row.orderId} href={orderHref?.(row.orderId)}>
                <span className="min-w-0 flex-1 text-[14px] font-bold">Order {row.orderNumber}</span>
                <span className="text-[14px] font-extrabold">{naira(row.amountKobo)}</span>
              </ListRow>
            ))}
          </ListCard>
        </Card>
      ) : null}
      <Card className="grid gap-3 p-5">
        <CardHead title="Payments" sub={words.paidFor} />
        {view.entries.length ? (
          <ListCard>
            {view.entries.map((entry) => (
              <ListRow key={entry.id} href={entry.orderId && orderHref ? orderHref(entry.orderId) : undefined}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold">{entry.description}</span>
                  <span className="block text-[12.5px] text-app-ink-soft">{day(entry.createdAt)}</span>
                </span>
                {entry.status === "refunded" ? <Pill tone="muted">Refunded</Pill> : null}
                <span className="text-[14px] font-extrabold">{naira(entry.amountKobo)}</span>
              </ListRow>
            ))}
          </ListCard>
        ) : (
          <EmptyState icon="coin" title="No payments yet">Card payments split to you show here.</EmptyState>
        )}
      </Card>
      {view.settlements.length ? (
        <Card className="grid gap-3 p-5">
          <CardHead title="Paystack settlements to your bank" />
          <ListCard>
            {view.settlements.map((row) => (
              <ListRow key={row.id}>
                <span className="min-w-0 flex-1 text-[14px] font-bold">{day(row.date) || "Scheduled"}</span>
                <Pill tone={row.status === "success" || row.status === "processed" ? "success" : "info"}>{row.status || "pending"}</Pill>
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
