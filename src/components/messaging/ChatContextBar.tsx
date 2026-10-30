"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney } from "@shared/i18n";
import type { ShopRiderOrder } from "@shared/seller-inbox";

// The bar under a chat's header in the seller's unified inbox: the order (or delivery job) the chat belongs to,
// with its status and total, and a link to the order. Customer chats show the customer's order in progress (else
// their latest); rider chats the delivery and its order.

const pretty = (status: string) => status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function ChatContextBar({ order, deliveryStatus, empty }: { order: ShopRiderOrder | null; deliveryStatus?: string | null; empty?: string | null }) {
  const t = useT("inbox", "orders");
  const locale = useLocale();
  if (!order && !deliveryStatus) {
    return empty ? <div className="shrink-0 border-b border-app-line bg-app-canvas/40 px-3 py-2 text-[12.5px] text-app-ink-soft sm:px-4">{empty}</div> : null;
  }
  const delivery = deliveryStatus ? t.dynamic(`booking.${deliveryStatus}`, pretty(deliveryStatus)) : null;
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-app-line bg-app-canvas/40 px-3 py-2 sm:px-4" aria-label={t("uni.ctx.label")}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white text-app-ink-soft ring-1 ring-app-line">
        <Icon name={deliveryStatus ? "truck" : "bag"} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.08em] text-app-ink-faint">{deliveryStatus ? t("uni.ctx.delivery") : t("uni.ctx.order")}</span>
        <span className="block truncate text-[13.5px] font-extrabold">
          {order ? t("uni.ctx.orderLine", { number: order.number, total: formatMoney(order.total, locale, { currency: order.currency }) }) : t("uni.ctx.noOrder")}
        </span>
        <span className="block truncate text-[12px] text-app-ink-soft">
          {[order ? t.dynamic(`status.${order.status}`, pretty(order.status)) : null, delivery].filter(Boolean).join(" · ")}
        </span>
      </span>
      {order && (
        <Link href={`/home/orders/${order.id}`} className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-full border border-app-line bg-white px-3 text-[12.5px] font-bold text-app-ink no-underline hover:border-app-line-strong">
          {t("uni.ctx.open")} <Icon name="chevRight" size={12} />
        </Link>
      )}
    </div>
  );
}
