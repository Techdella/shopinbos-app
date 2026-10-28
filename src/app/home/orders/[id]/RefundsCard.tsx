import { Card, CardHead, Pill } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { getT } from "@/lib/i18n/server";
import type { RefundView } from "@/lib/commerce/order-refunds.server";
import { markRefundSentAction, resolveIssueAction } from "./refund-actions";

// Refunds the seller sends from their own bank, and problems the customer reported (wrong or damaged item) with the
// packing and delivery photos, so the seller can say who caused it (shared/order-refunds.ts). Shopinbos never holds
// the money: the customer is refunded by the seller, and the supplier or delivery partner pays the seller back.

export interface OrderIssue {
  id: string;
  kind: string;
  message: string | null;
  createdAt: Date;
}

export interface IssueSupplierPart {
  id: string;
  name: string;
  packPhotoUrl: string | null;
}

const STATUS_TONE: Record<string, "warning" | "info" | "success" | "danger" | "muted"> = {
  awaiting_account: "muted",
  to_send: "warning",
  sent: "info",
  confirmed: "success",
  disputed: "danger",
};

const button = "min-h-[40px] rounded-full px-4 text-[13.5px] font-bold";

export async function RefundsCard({ orderId, refunds, issues, supplierParts, proofUrl, hasBooking, money, flash }: {
  orderId: string;
  refunds: RefundView[];
  issues: OrderIssue[];
  supplierParts: IssueSupplierPart[];
  proofUrl: string | null;
  hasBooking: boolean;
  money: (amount: number) => string;
  flash?: { saved?: string; error?: string };
}) {
  if (!refunds.length && !issues.length) return null;
  const t = await getT("orders", "common");
  return (
    <div id="refunds" className="min-w-0 scroll-mt-24 max-xl:order-2">
      <Card className="p-5">
        {(flash?.saved || flash?.error) && (
          <div className="mb-3"><Notice tone={flash.error ? "error" : "success"}>{flash.error ?? flash.saved}</Notice></div>
        )}
        <CardHead title={t("refunds.title")} sub={t("refunds.sub")} />

        {issues.map((issue) => (
          <form key={issue.id} action={resolveIssueAction} className="mt-3 grid gap-2 rounded-[14px] bg-app-danger-tint/50 p-3 text-[13.5px]">
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="issueId" value={issue.id} />
            <div className="font-bold">{issue.kind === "wrong_item" ? t("refunds.issueWrong") : t("refunds.issueDamaged")}</div>
            {issue.message && <div className="text-app-ink-soft">“{issue.message}”</div>}
            <div className="text-app-ink-soft">{t("refunds.issueHelp")}</div>
            {(supplierParts.some((part) => part.packPhotoUrl) || proofUrl) && (
              <div className="flex flex-wrap gap-3">
                {supplierParts.filter((part) => part.packPhotoUrl).map((part) => (
                  <a key={part.id} href={part.packPhotoUrl!} target="_blank" rel="noreferrer" className="grid gap-1 text-[12px] font-bold text-app-accent-ink no-underline">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={part.packPhotoUrl!} alt={t("refunds.packPhoto", { name: part.name })} className="h-20 w-20 rounded-[10px] object-cover" />
                    {t("refunds.packPhoto", { name: part.name })}
                  </a>
                ))}
                {proofUrl && (
                  <a href={proofUrl} target="_blank" rel="noreferrer" className="grid gap-1 text-[12px] font-bold text-app-accent-ink no-underline">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={proofUrl} alt={t("refunds.deliveryPhoto")} className="h-20 w-20 rounded-[10px] object-cover" />
                    {t("refunds.deliveryPhoto")}
                  </a>
                )}
              </div>
            )}
            <fieldset className="m-0 grid gap-1.5 border-0 p-0">
              <legend className="mb-1 font-bold">{t("refunds.whoCaused")}</legend>
              {supplierParts.map((part, index) => (
                <label key={part.id} className="flex items-center gap-2">
                  <input type="radio" name="fault" value={`supplier:${part.id}`} required defaultChecked={index === 0} />
                  {t("refunds.faultSupplier", { name: part.name })}
                </label>
              ))}
              {hasBooking && (
                <label className="flex items-center gap-2">
                  <input type="radio" name="fault" value="partner" required defaultChecked={!supplierParts.length} />
                  {t("refunds.faultPartner")}
                </label>
              )}
              <label className="flex items-center gap-2">
                <input type="radio" name="fault" value="seller" required defaultChecked={!supplierParts.length && !hasBooking} />
                {t("refunds.faultMine")}
              </label>
            </fieldset>
            <button type="submit" className={`${button} justify-self-start bg-app-ink text-white`}>{t("refunds.openRefund")}</button>
          </form>
        ))}

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
