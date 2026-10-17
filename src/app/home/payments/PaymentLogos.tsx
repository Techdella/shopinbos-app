"use client";

import { useState, useTransition } from "react";
import { Card, CardHead } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { PaymentBadge, PaymentBadgeRow } from "@/components/storefront/shopper/PaymentBadges";
import { PAYMENT_BADGE_KEYS, PAYMENT_BADGE_LABELS, cleanPaymentBadges, type PaymentBadgeKey } from "@shared/payment-badges";
import { useT } from "@/components/i18n/I18nProvider";
import { savePaymentBadges } from "./actions";

// "Payment logos on your store": the seller taps logos on or off and sees the row as shoppers will (storefront
// footer and checkout). Saved straight away through savePaymentBadges (src/lib/seller-payments.server.ts).

export function PaymentLogos({ initial, defaults }: { initial: PaymentBadgeKey[]; defaults: PaymentBadgeKey[] }) {
  const t = useT("payments");
  const [badges, setBadges] = useState<PaymentBadgeKey[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const words: Partial<Record<PaymentBadgeKey, string>> = { transfer: t("badge.transfer"), cod: t("badge.cod") };
  const name = (badge: PaymentBadgeKey) => words[badge] ?? PAYMENT_BADGE_LABELS[badge];

  function save(next: PaymentBadgeKey[]) {
    const previous = badges;
    setBadges(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await savePaymentBadges(next);
      if (result.error) {
        setBadges(previous);
        setError(result.error);
      } else {
        setSaved(true);
      }
    });
  }

  const toggle = (badge: PaymentBadgeKey) => save(cleanPaymentBadges(badges.includes(badge) ? badges.filter((key) => key !== badge) : [...badges, badge]));
  const isDefault = badges.length === defaults.length && badges.every((badge) => defaults.includes(badge));

  return (
    <Card className="p-5">
      <CardHead title={t("badges.title")} sub={pending ? t("methods.saving") : saved ? t("badges.saved") : t("badges.sub")} />
      <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
        {PAYMENT_BADGE_KEYS.map((badge) => {
          const on = badges.includes(badge);
          return (
            <li key={badge}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(badge)}
                className={cx(
                  "inline-flex min-h-[44px] items-center gap-2 rounded-full border-2 py-1.5 pl-1.5 pr-3 text-[13px] font-bold transition",
                  on ? "border-app-ink bg-white text-app-ink" : "border-app-line bg-app-canvas text-app-ink-soft opacity-80 hover:opacity-100",
                )}
              >
                <PaymentBadge badge={badge} label={words[badge]} />
                {badge === "transfer" || badge === "cod" ? null : <span>{name(badge)}</span>}
                <span aria-hidden className={cx("text-[13px]", on ? "text-app-success" : "text-transparent")}>✓</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 rounded-[14px] border border-app-line bg-app-canvas px-4 py-3">
        <div className="text-[12.5px] font-bold text-app-ink-soft">{t("badges.preview")}</div>
        <div className="mt-2 min-h-[24px]">
          {badges.length ? <PaymentBadgeRow badges={badges} labels={words} /> : <p className="m-0 text-[13px] text-app-ink-soft">{t("badges.none")}</p>}
        </div>
      </div>

      {!isDefault && defaults.length ? (
        <button type="button" onClick={() => save(defaults)} disabled={pending} className="mt-3 min-h-[44px] rounded-full px-1 text-[13.5px] font-bold text-app-ink underline underline-offset-4 disabled:opacity-50">
          {t("badges.reset")}
        </button>
      ) : null}
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
    </Card>
  );
}
