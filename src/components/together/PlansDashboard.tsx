"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { confirmDialog } from "@/components/ui/dialogs";
import { Box, Button, Message, StatusPill, act, call, inputClass, useFormat } from "./seller-ui";

// Paying small small (pilot "pay_small_small"): every plan with its progress and next due date, the actions on missed
// and cancelled plans (refund per the seller's own rule, sent from their own bank), and the settlement report of every
// part that landed (what the customer paid, Shopinbos's fee in the split, what settled to the seller's bank).

type Plan = {
  id: string; status: string; productName: string; variantLabel: string | null; quantity: number; buyerName: string; buyerPhone: string | null; buyerEmail: string;
  weeks: number; paidCount: number; total: number; paid: number; weekly: number; nextDueAt: string | null; autopay: boolean; refundRule: string; refundStatus: string | null; refundNote: string | null; orderId: string | null; createdAt: string;
};
type Settlement = { planId: string; buyerName: string; productName: string; n: number; weeks: number; amount: number; fee: number; toYou: number; reference: string; via: string; extra: boolean; paidAt: string | null };
type Data = { walletReady: boolean; plans: Plan[]; settlements: Settlement[]; totals: { active: number; completed: number; defaulted: number; received: number; owed: number } };

export function PlansDashboard() {
  const t = useT("together");
  const { money, day } = useFormat();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");

  const load = useCallback(() => {
    call<Data>("/api/app/together?view=plans").then(setData).catch((err: Error) => setError(err.message || t("loadFailed")));
  }, [t]);
  useEffect(load, [load]);

  async function run(body: Record<string, unknown>, confirmFirst = false) {
    if (confirmFirst && !(await confirmDialog(t("confirm")))) return;
    setBusy(true);
    setNote(null);
    try {
      await act(body);
      setNote({ tone: "success", text: t("saved") });
      setRefundFor(null);
      load();
    } catch (err) {
      setNote({ tone: "error", text: (err as Error).message || t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <p className="text-app-danger">{error}</p>;
  if (!data) return <p className="text-app-ink-soft">…</p>;

  return (
    <div className="grid gap-5">
      {!data.walletReady ? <p className="m-0 rounded-[14px] bg-app-canvas px-4 py-3 text-[14px]">{t("walletNeeded")} <Link href="/home/wallet" className="font-extrabold text-app-accent-ink">{t("walletLink")}</Link></p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t("plans.active"), String(data.totals.active)],
          [t("plans.completed"), String(data.totals.completed)],
          [t("plans.received"), money(data.totals.received)],
          [t("plans.owed"), money(data.totals.owed)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-[18px] border border-app-line bg-white px-4 py-3.5">
            <div className="text-[12.5px] font-bold text-app-ink-soft">{label}</div>
            <div className="text-[20px] font-extrabold">{value}</div>
          </div>
        ))}
      </div>
      <Message message={note} />

      {data.plans.length ? (
        <ul className="m-0 grid list-none gap-3 p-0">
          {data.plans.map((plan) => (
            <li key={plan.id}>
              <Box className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-extrabold">{plan.buyerName}</div>
                    <div className="truncate text-[13.5px] text-app-ink-soft">{plan.productName}{plan.variantLabel ? ` · ${plan.variantLabel}` : ""} · {plan.buyerPhone ?? plan.buyerEmail}</div>
                  </div>
                  {plan.autopay ? <span className="rounded-full bg-app-canvas px-2.5 py-1 text-[12px] font-bold">{t("plans.autopay")}</span> : null}
                  <StatusPill status={plan.status} />
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-app-canvas" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((plan.paid / Math.max(1, plan.total)) * 100)}>
                  <div className="h-full rounded-full bg-[#2E7E78]" style={{ width: `${Math.min(100, (plan.paid / Math.max(1, plan.total)) * 100)}%` }} />
                </div>
                <div className="text-[13.5px]">
                  {t("plans.progress", { paid: money(plan.paid), total: money(plan.total), count: plan.paidCount, weeks: plan.weeks })}
                  {plan.nextDueAt && plan.status === "active" ? ` · ${t("plans.next", { date: day(plan.nextDueAt) })}` : ""}
                </div>
                {plan.refundNote ? <p className="m-0 rounded-[12px] bg-app-canvas px-3 py-2 text-[13px]">{plan.refundNote}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {plan.orderId ? <Link href={`/home/orders/${plan.orderId}`} className="inline-flex min-h-[38px] items-center rounded-full border border-app-line px-4 text-[13.5px] font-bold no-underline">{t("plans.order")}</Link> : null}
                  {plan.status === "active" ? <Button tone="danger" disabled={busy} onClick={() => void run({ action: "plan.cancel", planId: plan.id }, true)}>{t("plans.cancel")}</Button> : null}
                  {(plan.status === "defaulted" || plan.status === "cancelled") && plan.refundStatus !== "done" && plan.paid > 0 ? (
                    plan.refundStatus === "manual" ? (
                      <Button tone="line" disabled={busy} onClick={() => void run({ action: "plan.refund_sent", planId: plan.id })}>{t("plans.refundSent")}</Button>
                    ) : (
                      <Button tone="line" disabled={busy} onClick={() => { setRefundFor(plan.id); setRefundAmount(String(Math.max(0, plan.paid - 1000))); }}>{t("plans.refund")}</Button>
                    )
                  ) : null}
                </div>
                {refundFor === plan.id ? (
                  <div className="grid gap-2 rounded-[14px] border border-app-line p-3">
                    <p className="m-0 text-[13px] text-app-ink-soft">“{plan.refundRule}” · {t("plans.refundHint")}</p>
                    <label className="grid max-w-[260px] gap-1.5">
                      <span className="text-[13.5px] font-bold">{t("plans.refundAmount")}</span>
                      <input type="number" min={0} max={plan.paid} value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className={inputClass} />
                    </label>
                    <div><Button disabled={busy} onClick={() => void run({ action: "plan.refund", planId: plan.id, amount: Number(refundAmount) || 0 })}>{t("save")}</Button></div>
                  </div>
                ) : null}
              </Box>
            </li>
          ))}
        </ul>
      ) : (
        <Box><p className="m-0 text-[14.5px] text-app-ink-soft">{t("plans.empty")}</p></Box>
      )}

      {data.settlements.length ? (
        <Box className="grid gap-3">
          <div>
            <h2 className="m-0 text-[17px] font-extrabold">{t("plans.settlements")}</h2>
            <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{t("plans.settlementsSub")}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-app-line text-app-ink-soft">
                  <th className="py-2 pr-3 font-bold" />
                  <th className="py-2 pr-3 font-bold" />
                  <th className="py-2 pr-3 text-right font-bold">₦</th>
                  <th className="py-2 pr-3 text-right font-bold">{t("plans.fee")}</th>
                  <th className="py-2 text-right font-bold">{t("plans.toYou")}</th>
                </tr>
              </thead>
              <tbody>
                {data.settlements.map((row) => (
                  <tr key={row.reference} className="border-b border-app-line last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{row.paidAt ? day(row.paidAt) : ""}</td>
                    <td className="py-2 pr-3">
                      <div className="font-bold">{row.buyerName}</div>
                      <div className="text-app-ink-soft">{row.productName} · {t("plans.part", { n: row.n, weeks: row.weeks })}{row.via === "autopay" ? ` · ${t("plans.autopay")}` : ""}{row.extra ? ` · ${t("plans.extra")}` : ""}</div>
                    </td>
                    <td className="py-2 pr-3 text-right">{money(row.amount)}</td>
                    <td className="py-2 pr-3 text-right text-app-ink-soft">{money(row.fee)}</td>
                    <td className="py-2 text-right font-bold">{money(row.toYou)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
      ) : null}
    </div>
  );
}
