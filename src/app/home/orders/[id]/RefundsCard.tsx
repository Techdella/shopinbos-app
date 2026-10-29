import { Card, CardHead, Pill } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { getT } from "@/lib/i18n/server";
import type { RefundView } from "@/lib/commerce/order-refunds.server";
import { markRefundSentAction } from "./refund-actions";

// Refunds the seller sends from their own bank, guided (shared/order-refunds.ts): the customer's checked account,
// "Refund sent", and whether the customer got it. Shopinbos never holds the money; who pays the seller back is decided
// in src/lib/faults (the Problems card) and recovered through money owed.

const STATUS_TONE: Record<string, "warning" | "info" | "success" | "danger" | "muted"> = {
  awaiting_account: "muted",
  to_send: "warning",
  sent: "info",
  confirmed: "success",
  disputed: "danger",
};

const button = "min-h-[40px] rounded-full px-4 text-[13.5px] font-bold";

export async function RefundsCard({ orderId, refunds, money, flash }: {
  orderId: string;
  refunds: RefundView[];
  money: (amount: number) => string;
  flash?: { saved?: string; error?: string };
}) {
  if (!refunds.length) return null;
  const t = await getT("orders", "common");
  return (
    <div id="refunds" className="min-w-0 scroll-mt-24 max-xl:order-2">
      <Card className="p-5">
        {(flash?.saved || flash?.error) && (
          <div className="mb-3"><Notice tone={flash.error ? "error" : "success"}>{flash.error ?? flash.saved}</Notice></div>
        )}
        <CardHead title={t("refunds.title")} sub={t("refunds.sub")} />

        <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
          {refunds.map((refund) => (
            <li key={refund.id} className="grid gap-1.5 py-3 text-[14px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{money(refund.amount)} · {refund.reasonText}</span>
                <Pill tone={STATUS_TONE[refund.status] ?? "muted"} dot>{t.dynamic(`refunds.status.${refund.status}`, refund.status)}</Pill>
              </div>
              {refund.fault === "supplier" || refund.fault === "partner" ? (
                <div className="text-[13px] text-app-ink-soft">{refund.fault === "supplier" ? t("refunds.paysBackSupplier") : t("refunds.paysBackPartner")}{refund.note ? ` ${refund.note}` : ""}</div>
              ) : null}
              {refund.status === "awaiting_account" && <div className="text-[13px] text-app-ink-soft">{t("refunds.awaiting")}</div>}
              {refund.status === "to_send" && (
                <form action={markRefundSentAction} className="grid gap-2 rounded-[14px] bg-app-canvas p-3 text-[13.5px]">
                  <input type="hidden" name="orderId" value={orderId} />
                  <input type="hidden" name="refundId" value={refund.id} />
                  <div>{t("refunds.sendTo", { amount: money(refund.amount) })}</div>
                  <div className="font-mono text-[15px] font-bold tracking-[0.04em]">{refund.account}</div>
                  <div className="font-bold">{refund.accountName} · {refund.bankName}</div>
                  <label className="grid gap-1 text-[12.5px] font-bold text-app-ink-soft">
                    {t("refunds.reference")}
                    <input name="reference" maxLength={120} className="min-h-[40px] rounded-[10px] border border-app-line bg-white px-3 text-[14px] font-normal text-app-ink" />
                  </label>
                  <button type="submit" className={`${button} justify-self-start bg-app-ink text-white`}>{t("refunds.markSent")}</button>
                </form>
              )}
              {refund.status === "sent" && <div className="text-[13px] text-app-ink-soft">{t("refunds.sentWaiting", { name: refund.accountName ?? refund.account })}</div>}
              {refund.status === "disputed" && <div className="text-[13px] font-bold text-app-danger">{t("refunds.disputed")}</div>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
