"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Card, Pill, StatGrid, StatTile } from "@/components/app-kit";
import { Notice, PillButton, Toggle } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { inboxApi } from "@/components/messaging/inbox-ui";
import { QrCode } from "@/components/payment-links/QrCode";
import { useT } from "@/components/i18n/I18nProvider";
import type { WhatsAppStoreView } from "@/lib/whatsapp-store/server";
import { friendlyError } from "@/lib/errors/report-client";

// The WhatsApp store: one switch, the link to share (with a QR code), what still needs doing before customers can
// buy, the order confirmations switch, and the orders that came in from WhatsApp. The orders themselves are
// managed on the Orders page like every other order.

type Message = { tone: "error" | "success" | "info"; text: string } | null;

function Switch({ label, sub, on, onChange, disabled }: { label: string; sub?: ReactNode; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex min-h-[56px] items-center justify-between gap-3 rounded-[14px] bg-app-canvas px-4 py-2 ${disabled ? "opacity-60" : ""}`}>
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold">{label}</span>
        {sub ? <span className="block text-[12.5px] text-app-ink-soft">{sub}</span> : null}
      </span>
      <Toggle on={on} onChange={(next) => !disabled && onChange(next)} label={label} />
    </div>
  );
}

function Step({ done, optional, children, action }: { done: boolean; optional?: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex min-h-[48px] items-center gap-3 border-b border-app-line py-2 last:border-b-0">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? "bg-[#25D366] text-white" : optional ? "border border-app-line text-app-ink-soft" : "bg-app-canvas text-app-ink-soft"}`} aria-hidden>
        <Icon name={done ? "check" : optional ? "plus" : "x"} size={14} />
      </span>
      <span className="min-w-0 flex-1 text-[14px]">{children}</span>
      {action}
    </li>
  );
}

export function WhatsAppStoreClient({ initial, storeName }: { initial: WhatsAppStoreView; storeName: string }) {
  const t = useT("inbox", "common");
  const [view, setView] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [copied, setCopied] = useState(false);
  const money = (amount: number) => {
    try {
      return new Intl.NumberFormat("en-NG", { style: "currency", currency: view.stats.currency, maximumFractionDigits: 0 }).format(amount);
    } catch {
      return `${view.stats.currency} ${Math.round(amount).toLocaleString("en-NG")}`;
    }
  };

  async function save(patch: { on?: boolean; confirmations?: boolean }) {
    setSaving(true);
    setMessage(null);
    try {
      const next = await inboxApi<WhatsAppStoreView>("/api/app/whatsapp-store", { method: "PUT", body: JSON.stringify(patch) });
      setView(next);
      if (patch.on !== undefined) setMessage({ tone: "success", text: next.on ? (next.mode === "test" ? t("ws.onTest") : t("ws.onLive")) : t("ws.offSaved") });
    } catch (error) {
      setMessage({ tone: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!view.shareUrl) return;
    try {
      await navigator.clipboard.writeText(view.shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const shareText = view.shareUrl ? t("ws.shareText", { store: storeName, url: view.shareUrl }) : "";
  const canTurnOn = view.connected && view.products > 0;

  return (
    <div className="grid max-w-[760px] gap-5">
      <Card className="grid gap-4 p-6">
        <div className="flex flex-wrap items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#25D366] text-white" aria-hidden><Icon name="cart" size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-[20px] font-extrabold leading-tight">{t("ws.heroTitle")}</h2>
              <Pill tone={view.on ? "success" : "muted"} dot>{view.on ? (view.mode === "test" ? t("ws.statusTest") : t("ws.statusLive")) : t("ws.statusOff")}</Pill>
            </div>
            <p className="mb-0 mt-1 text-[15px] leading-[1.5] text-app-ink-soft">{t("ws.heroSub")}</p>
          </div>
        </div>
        <ul className="m-0 grid gap-1.5 p-0 text-[14px] sm:grid-cols-2">
          {(["ws.feat1", "ws.feat2", "ws.feat3", "ws.feat4"] as const).map((key) => (
            <li key={key} className="flex list-none items-start gap-2"><span className="mt-0.5 text-[#1DA851]"><Icon name="check" size={16} /></span>{t(key)}</li>
          ))}
        </ul>
        <Switch label={t("ws.switch")} sub={view.connected ? (view.displayName ? t("ws.switchSub", { number: view.displayName }) : undefined) : t("ws.needsWhatsApp")} on={view.on} disabled={saving || (!view.on && !canTurnOn)} onChange={(on) => void save({ on })} />
        {!view.connected ? (
          <Notice tone="info">
            {t("ws.connectFirst")} <Link href="/home/inbox/chatbot?tab=whatsapp" className="font-bold underline">{t("ws.connect")}</Link>
          </Notice>
        ) : null}
        {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      </Card>

      {view.shareUrl ? (
        <Card className="grid gap-4 p-6">
          <div>
            <h3 className="m-0 text-[17px] font-extrabold">{t("ws.shareTitle")}</h3>
            <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">{t("ws.shareSub")}</p>
          </div>
          <div className="flex flex-wrap items-start gap-5">
            <div className="grid min-w-0 flex-1 gap-3">
              <code className="block break-all rounded-[14px] border border-app-line bg-app-canvas px-3 py-2.5 font-mono text-[13px]">{view.shareUrl}</code>
              <div className="flex flex-wrap gap-2">
                <PillButton size="md" onClick={() => void copy()}><Icon name="copy" size={16} /> {copied ? t("ws.copied") : t("ws.copy")}</PillButton>
                <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-5 text-[14px] font-bold text-app-ink no-underline hover:border-app-line-strong">
                  <Icon name="whatsapp" size={16} /> {t("ws.shareStatus")}
                </a>
              </div>
              {!view.on ? <p className="m-0 text-[12.5px] text-app-ink-soft">{t("ws.shareWhenOn")}</p> : null}
            </div>
            <QrCode value={view.shareUrl} label={t("ws.qr")} size={132} />
          </div>
        </Card>
      ) : null}

      <Card className="grid gap-3 p-6">
        <h3 className="m-0 text-[17px] font-extrabold">{t("ws.readyTitle")}</h3>
        <ul className="m-0 p-0">
          <Step done={view.connected} action={view.connected ? null : <Link href="/home/inbox/chatbot?tab=whatsapp" className="text-[13px] font-bold underline">{t("ws.connect")}</Link>}>
            {view.connected ? t("ws.stepConnected", { number: view.displayName ?? "WhatsApp" }) : t("ws.stepConnect")}
          </Step>
          <Step done={view.products > 0} action={view.products > 0 ? null : <Link href="/products" className="text-[13px] font-bold underline">{t("ws.addProducts")}</Link>}>
            {view.products > 0 ? t("ws.stepProducts", { count: view.products }) : t("ws.stepNoProducts")}
          </Step>
          <Step done={view.payments.ready} action={view.payments.ready ? null : <Link href="/home/payments" className="text-[13px] font-bold underline">{t("ws.setUpPayments")}</Link>}>
            {view.payments.ready ? t("ws.stepPayments") : t("ws.stepNoPayments")}
          </Step>
          <Step done={view.catalog.cart} optional action={<Link href="/home/inbox/whatsapp-catalog" className="text-[13px] font-bold underline">{view.catalog.cart ? t("ws.manage") : t("ws.setUp")}</Link>}>
            {view.catalog.cart ? t("ws.stepCatalog") : t("ws.stepNoCatalog")}
          </Step>
        </ul>
        <p className="m-0 text-[12.5px] text-app-ink-soft">{t("ws.freePlan")}</p>
      </Card>

      <Card className="grid gap-3 p-6">
        <h3 className="m-0 text-[17px] font-extrabold">{t("ws.confirmTitle")}</h3>
        <Switch label={t("ws.confirmSwitch")} sub={t("ws.confirmSub")} on={view.confirmations} disabled={saving} onChange={(confirmations) => void save({ confirmations })} />
        <p className="m-0 text-[12.5px] text-app-ink-soft">
          {t("ws.confirmTemplates")} <Link href="/home/marketing/messages" className="font-bold underline">{t("ws.orderMessages")}</Link>
        </p>
      </Card>

      <Card className="grid gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-[17px] font-extrabold">{t("ws.ordersTitle")}</h3>
          <Link href="/home/orders" className="text-[13px] font-bold underline">{t("ws.allOrders")}</Link>
        </div>
        <StatGrid>
          <StatTile label={t("ws.statOrders")} value={view.stats.orders} />
          <StatTile label={t("ws.statRevenue")} value={money(view.stats.revenue)} />
          <StatTile label={t("ws.statCarts")} value={view.stats.openCarts} />
        </StatGrid>
        {view.recentOrders.length ? (
          <ul className="m-0 p-0">
            {view.recentOrders.map((order) => (
              <li key={order.id} className="list-none border-b border-app-line last:border-b-0">
                <Link href={`/home/orders/${order.id}`} className="flex min-h-[52px] items-center gap-3 py-2 text-app-ink no-underline">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">{order.buyerName || t("ws.customer")}</span>
                    <span className="block font-mono text-[12px] text-app-ink-soft">{order.orderNumber} · {new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                  </span>
                  <span className="text-[14px] font-bold">{money(order.total)}</span>
                  <Pill tone={["paid", "processing", "packed", "shipped", "delivered"].includes(order.status) ? "success" : "muted"}>{order.status.replace(/_/g, " ")}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px] text-app-ink-soft">{t("ws.noOrders")}</p>
        )}
      </Card>
    </div>
  );
}
