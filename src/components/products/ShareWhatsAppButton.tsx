"use client";

import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { formatMoney, formatNumber } from "@shared/i18n";
import { productShareMessage, whatsappShareLink } from "@shared/product-codes";

export interface ShareProduct {
  name: string;
  price: number;
  currency?: string | null;
  shortCode?: string | null;
  /** The product's page on the storefront (the message adds ?ref=wa so the order counts as WhatsApp). */
  url: string;
}

/**
 * "Share to WhatsApp" on a product: WhatsApp's own share link (wa.me, no API) with the name, price, code and link,
 * in the seller's language. Opens in a new tab: the WhatsApp app when it's installed, else WhatsApp Web.
 */
export function ShareWhatsAppButton({ product, compact = false, className }: { product: ShareProduct; compact?: boolean; className?: string }) {
  const t = useT("common");
  const locale = useLocale();
  const price = !product.currency || product.currency === "NGN" ? formatMoney(Math.round(product.price), locale) : `${product.currency} ${formatNumber(Math.round(product.price), locale)}`;
  const message = productShareMessage({ name: product.name, price, code: product.shortCode, url: product.url }, { code: t("product.code"), orderHere: t("product.orderHere") });
  const label = t("product.shareWhatsapp");
  return (
    <a
      href={whatsappShareLink(message)}
      target="_blank"
      rel="noreferrer"
      aria-label={compact ? `${label}: ${product.name}` : undefined}
      title={compact ? label : undefined}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-app-line bg-white font-bold text-app-ink no-underline transition hover:border-app-line-strong",
        compact ? "h-11 w-11" : "min-h-[44px] px-5 text-[14px]",
        className,
      )}
    >
      <Icon name="whatsapp" size={16} />
      {compact ? null : label}
    </a>
  );
}
