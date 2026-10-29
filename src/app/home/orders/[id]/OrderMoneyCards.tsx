"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHead, Pill } from "@/components/app-kit";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney } from "@shared/i18n";
import type { SellerOrderMoney } from "@/lib/faults/seller.server";
import Link from "next/link";
import { decideFaultAction } from "@/app/actions/faults";

// The seller's order page (src/lib/faults/seller.server.ts sellerOrderMoney): what they earn on the order (C10, from
// the split), problems on it and what each meant for them, and a customer's return to approve, decline or receive.

function Row({ label, value, strong = false, minus = false }: { label: string; value: string; strong?: boolean; minus?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-3 border-t border-app-line pt-3 text-[17px] font-extrabold" : "flex justify-between gap-3 text-[14px]"}>
      <span className={strong ? "" : "text-app-ink-soft"}>{label}</span>
      <span className="text-right tabular-nums">{minus ? "−" : ""}{value}</span>
    </div>
  );
}

export function EarningsCard({ money }: { money: SellerOrderMoney }) {
  const t = useT("faults");
  const locale = useLocale();
  const naira = (kobo: number) => formatMoney(Math.round(kobo) / 100, locale);
  const e = money.earnings;
  return (
    <Card className="p-5">
      <CardHead title={t("earn.title")} />
      <div className="mt-4 grid gap-2.5">
        <Row label={t("earn.customerPaid")} value={naira(e.customerPaidKobo)} />
        {e.suppliersKobo > 0 ? <Row label={t("earn.suppliers")} value={naira(e.suppliersKobo)} minus /> : null}
        {e.deliveryKobo > 0 ? <Row label={t("earn.delivery")} value={naira(e.deliveryKobo)} minus /> : null}
        {e.feeKobo > 0 ? <Row label={t("earn.fee")} value={naira(e.feeKobo)} minus /> : null}
        <Row label={t("earn.you")} value={naira(e.earnKobo)} strong />
        {e.toDebtsKobo > 0 ? <p className="m-0 text-[13px] text-app-ink-soft">{t("earn.toDebts", { amount: naira(e.toDebtsKobo) })}</p> : null}
        {e.faultsKobo !== 0 ? <Row label={t("earn.problems")} value={naira(e.netKobo)} /> : null}
        {e.basis === "estimate" ? <p className="m-0 text-[12.5px] text-app-ink-soft">{t("earn.estimate")}</p> : null}
      </div>
    </Card>
  );
}

/**
 * What went wrong on the order. It's the seller's shop and customer: Shopinbos's suggestions wait here until the
 * seller accepts one (it applies now) or handles it themselves (nothing happens), and the customer's reports link to
 * the evidence to decide.
 */
export function ProblemsCard({ orderId, money }: { orderId: string; money: SellerOrderMoney }) {
  const t = useT("faults");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (!money.problems.length && !money.reports.length) return null;
  async function decide(caseId: string, accept: boolean) {
    setBusy(caseId);
    setNote(null);
    const result = await decideFaultAction(caseId, accept).catch(() => ({ ok: false as const, error: t("error.generic") }));
    setBusy(null);
    setNote(result.ok ? { ok: true, text: result.message ?? t("problems.done") } : { ok: false, text: result.error });
    router.refresh();
  }
  return (
    <div id="problems" className="scroll-mt-24"><Card className="p-5">
      <CardHead title={t("problems.title")} />
      <ul className="m-0 mt-3 grid list-none gap-2 p-0">
        {money.reports.map((row) => (
          <li key={row.id} className="grid gap-1.5 rounded-[14px] border border-app-line bg-white p-3">
            <div className="text-[13px] font-extrabold">{row.kind === "wrong_item" ? t("problems.kind.wrong_item") : row.kind === "damaged" ? t("problems.kind.damaged") : t("problems.kind.not_delivered")}</div>
            <p className="m-0 text-[14px]">{t("problems.reportBody")}</p>
            <Link href={`/home/orders/${orderId}/problems/${row.id}`} className="justify-self-start text-[13.5px] font-bold text-app-accent-ink no-underline hover:underline">{t("problems.decide")}</Link>
          </li>
        ))}
        {money.problems.map((row) => (
          <li key={row.id} className={`grid gap-1.5 rounded-[14px] p-3 ${row.status === "proposed" ? "border border-app-line bg-white" : "bg-app-canvas"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-extrabold">{row.label}</span>
              {row.status === "proposed" ? <Pill tone="warning">{t("problems.yourCall")}</Pill> : row.status === "declined" ? <Pill tone="muted">{t("problems.handling")}</Pill> : null}
            </div>
            {row.status === "proposed" ? (
              <>
                <p className="m-0 text-[14px]"><span className="font-bold">{t("problems.suggested")} </span>{row.line}</p>
                {row.customerLine ? <p className="m-0 text-[13px] text-app-ink-soft">{t("problems.customerWould", { line: row.customerLine })}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => void decide(row.id, true)} className="min-h-[40px] rounded-full bg-app-ink px-4 text-[13.5px] font-bold text-white">{busy === row.id ? "…" : t("problems.accept")}</button>
                  <button type="button" disabled={busy !== null} onClick={() => void decide(row.id, false)} className="min-h-[40px] rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold">{t("problems.myself")}</button>
                </div>
              </>
            ) : row.line && row.status === "applied" ? <p className="m-0 text-[14px]">{row.line}</p> : null}
          </li>
        ))}
      </ul>
      {note ? <p role="status" className={`m-0 mt-2 text-[13px] font-bold ${note.ok ? "text-app-success" : "text-app-danger"}`}>{note.text}</p> : null}
    </Card></div>
  );
}

export function ReturnsCard({ orderId, money }: { orderId: string; money: SellerOrderMoney }) {
  const t = useT("faults");
  const locale = useLocale();
  const router = useRouter();
  const [returns, setReturns] = useState(money.returns);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [why, setWhy] = useState("");
  const current = returns[0];
  if (!current) return null;
  async function act(action: "approve" | "decline" | "received") {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/app/orders/${encodeURIComponent(orderId)}/returns/${encodeURIComponent(current!.id)}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason: action === "decline" ? why : undefined }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error?.message ?? t("error.generic"));
      setReturns(json.data.returns);
      setDeclining(false);
      router.refresh();
    } catch (actError) {
      setError(actError instanceof Error ? actError.message : t("error.generic"));
    } finally {
      setBusy(null);
    }
  }
  const tone = current.status === "requested" ? "warning" : current.status === "declined" ? "muted" : current.status === "refunded" ? "success" : "info";
  return (
    <Card className="p-5">
      <CardHead title={t("returns.title")} action={<Pill tone={tone}>{t.dynamic(`return.status.${current.status}`, current.status)}</Pill>} />
      <div className="mt-3 grid gap-3 text-[14px]">
        <div>
          <div className="font-extrabold">{current.reasonLabel}</div>
          {current.message ? <p className="m-0 mt-1 text-app-ink-soft">&ldquo;{current.message}&rdquo;</p> : null}
          <p className="m-0 mt-1 text-[13px] text-app-ink-soft">{t(current.returnPayer === "seller" ? "returns.payer.seller" : "returns.payer.customer")}</p>
        </div>
        {current.photos.length ? (
          <div>
            <div className="mb-1.5 text-[12.5px] font-bold text-app-ink-soft">{t("returns.photos")}</div>
            <div className="flex flex-wrap gap-2">
              {current.photos.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="h-16 w-16 rounded-[12px] border border-app-line object-cover" /></a>
              ))}
            </div>
          </div>
        ) : null}
        {current.status === "refunded" ? <p className="m-0 font-bold text-app-success">{t("returns.refunded", { amount: formatMoney(current.refundKobo / 100, locale) })}</p> : null}
        {error ? <p role="alert" className="m-0 rounded-[12px] bg-app-danger-tint px-3 py-2 font-bold text-app-danger">{error}</p> : null}
        {current.status === "requested" && !declining ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={Boolean(busy)} onClick={() => void act("approve")} className="inline-flex min-h-11 items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white disabled:opacity-60">{busy === "approve" ? "…" : t("returns.approve")}</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => setDeclining(true)} className="inline-flex min-h-11 items-center rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold disabled:opacity-60">{t("returns.decline")}</button>
          </div>
        ) : null}
        {current.status === "requested" && declining ? (
          <div className="grid gap-2">
            <label className="grid gap-1 text-[13px] font-bold">{t("returns.declineWhy")}<textarea value={why} onChange={(event) => setWhy(event.target.value)} rows={2} maxLength={500} className="rounded-[12px] border border-app-line px-3 py-2 text-[14px] font-normal" /></label>
            <div className="flex gap-2">
              <button type="button" disabled={Boolean(busy)} onClick={() => void act("decline")} className="inline-flex min-h-11 items-center rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white disabled:opacity-60">{t("returns.decline")}</button>
              <button type="button" onClick={() => setDeclining(false)} className="min-h-11 px-3 text-[14px] font-bold underline">{t("cancel")}</button>
            </div>
          </div>
        ) : null}
        {current.status === "approved" ? (
          <button type="button" disabled={Boolean(busy)} onClick={() => void act("received")} className="inline-flex min-h-11 items-center justify-self-start rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white disabled:opacity-60">{busy === "received" ? "…" : t("returns.received")}</button>
        ) : null}
      </div>
    </Card>
  );
}
