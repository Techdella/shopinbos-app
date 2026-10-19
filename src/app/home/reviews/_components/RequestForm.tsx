"use client";

import { SMS_ENABLED } from "@/lib/features";
import { useActionState, useMemo, useState } from "react";
import { sendReviewRequests, type RequestState } from "@/app/actions/reviews";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";

export interface RequestableOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  contact: string;
  hasEmail: boolean;
  hasPhone: boolean;
  status: string;
  date: string;
  asked: string | null;
  reviewed: boolean;
}

const CHANNELS = [
  { value: "email", label: "req.email" },
  ...(SMS_ENABLED ? [{ value: "sms", label: "SMS" }] : []),
  { value: "whatsapp", label: "WhatsApp" },
  { value: "link", label: "req.fromMyWhatsApp" },
] as const;

export function RequestForm({ orders, ready }: { orders: RequestableOrder[]; ready: Record<string, boolean> }) {
  const t = useT("reviews");
  const [state, action, pending] = useActionState<RequestState, FormData>(sendReviewRequests, null);
  const [channel, setChannel] = useState<string>(ready.email ? "email" : "link");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(() => (showAll ? orders : orders.filter((order) => !order.asked && !order.reviewed)), [orders, showAll]);
  const reachable = (order: RequestableOrder) => (channel === "email" ? order.hasEmail : channel === "link" ? true : order.hasPhone);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const links = state?.results?.filter((result) => result.status === "link" && result.whatsappUrl) ?? [];

  return (
    <form action={action} className="grid gap-4">
      <fieldset className="m-0 border-0 p-0">
        <legend className={field.label}>{t("req.sendBy")}</legend>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((option) => (
            <label key={option.value} className={cx("inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border px-4 text-[14px] font-bold", channel === option.value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
              <input type="radio" name="channel" value={option.value} checked={channel === option.value} onChange={() => setChannel(option.value)} className="sr-only" />
              {option.label.startsWith("req.") ? t.dynamic(option.label) : option.label}
              {option.value !== "link" && !ready[option.value] ? <span className="text-[12px] font-semibold opacity-70">{t("req.notSetUp")}</span> : null}
            </label>
          ))}
        </div>
        <p className={field.hint}>
          {channel === "link"
            ? t("req.linkHint")
            : ready[channel]
              ? t("req.readyHint", { channel: channel === "email" ? t("req.emailLower") : channel === "sms" ? "SMS" : "WhatsApp" })
              : t("req.notReadyHint", { what: channel === "email" ? t("req.emailEnv") : channel === "sms" ? t("req.smsEnv") : t("req.waEnv") })}
        </p>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-app-ink-soft">{t("req.selected", { count: selected.size })}</span>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="min-h-[36px] rounded-full px-3 text-[13px] font-bold hover:bg-app-canvas" onClick={() => setSelected(new Set(visible.filter(reachable).map((order) => order.id)))}>{t("req.selectAll")}</button>
          <button type="button" className="min-h-[36px] rounded-full px-3 text-[13px] font-bold hover:bg-app-canvas" onClick={() => setSelected(new Set())}>{t("req.clear")}</button>
          <button type="button" className="min-h-[36px] rounded-full px-3 text-[13px] font-bold hover:bg-app-canvas" onClick={() => setShowAll((value) => !value)}>{showAll ? t("req.hideAsked") : t("req.showAsked")}</button>
        </div>
      </div>

      {visible.length ? (
        <ul className="m-0 grid max-h-[520px] list-none divide-y divide-app-line overflow-y-auto rounded-[18px] border border-app-line p-0">
          {visible.map((order) => {
            const ok = reachable(order);
            return (
              <li key={order.id}>
                <label className={cx("flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2.5", !ok && "cursor-not-allowed opacity-55")}>
                  <input type="checkbox" name="orderId" value={order.id} checked={selected.has(order.id)} onChange={() => toggle(order.id)} disabled={!ok} className={field.checkbox} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{order.customerName} <span className="font-semibold text-app-ink-soft">· {order.orderNumber}</span></span>
                    <span className="block truncate text-[12.5px] text-app-ink-soft">{order.status} · {order.date} · {order.contact || t("req.noContact")}</span>
                  </span>
                  <span className="shrink-0 text-right text-[12px] font-bold">
                    {order.reviewed ? <span className="text-app-success">{t("req.reviewed")}</span> : order.asked ? <span className="text-app-ink-soft">{t("req.asked", { date: order.asked })}</span> : !ok ? <span className="text-app-ink-soft">{channel === "email" ? t("req.noEmail") : t("req.noPhone")}</span> : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 rounded-[18px] bg-app-canvas px-4 py-6 text-center text-[14px] text-app-ink-soft">{orders.length ? t("req.everyoneAsked") : t("req.noOrders")}</p>
      )}

      {showAll ? <input type="hidden" name="resend" value="1" /> : null}
      {state ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
      {state?.results?.some((result) => result.status === "failed" || result.status === "skipped") ? (
        <ul className="m-0 grid list-none gap-1 p-0 text-[13px] text-app-ink-soft">
          {state.results.filter((result) => result.status === "failed" || result.status === "skipped").slice(0, 20).map((result) => (
            <li key={result.orderId}>{result.orderNumber || t("detail.order")}: {result.reason}</li>
          ))}
        </ul>
      ) : null}
      {links.length ? (
        <div className="grid gap-2 rounded-[18px] bg-app-mint p-4">
          <p className="m-0 text-[14px] font-bold">{t("req.sendFromWhatsApp")}</p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {links.map((result) => (
              <li key={result.orderId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[14px]">{result.customerName} · {result.orderNumber}</span>
                <a href={result.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[38px] items-center rounded-full bg-app-ink px-4 text-[13px] font-bold text-white no-underline">{t("req.openWhatsApp")}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <PillButton type="submit" size="md" tone="accent" busy={pending} disabled={!selected.size} className="w-fit">
        {channel === "link" ? t("req.makeLinks") : selected.size ? t("req.sendN", { count: selected.size }) : t("req.send")}
      </PillButton>
    </form>
  );
}
