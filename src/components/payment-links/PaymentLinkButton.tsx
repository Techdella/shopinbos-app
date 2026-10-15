"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui/cx";
import { useT } from "@/components/i18n/I18nProvider";
import { PaymentLinkDialog, type LinkProduct } from "./PaymentLinkDialog";

/** "Payment link" on a product: opens the dialog with that product already picked. */
export function PaymentLinkButton({ product, storeName, ready = true, compact = false }: { product: LinkProduct; storeName: string; ready?: boolean; compact?: boolean }) {
  const t = useT("paylinks");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={compact ? `${t("button")}: ${product.name}` : undefined}
        title={compact ? t("button") : undefined}
        className={cx(
          "inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-app-line bg-white font-extrabold text-app-ink transition hover:border-app-line-strong",
          compact ? "h-11 w-11" : "min-h-[44px] px-5 text-[14px]",
        )}
      >
        <Icon name="link" size={16} />
        {compact ? null : t("button")}
      </button>
      {open ? <PaymentLinkDialog catalog={[product]} initialProductIds={[product.id]} storeName={storeName} ready={ready} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
