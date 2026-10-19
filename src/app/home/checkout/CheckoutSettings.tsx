"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, Toggle, cx } from "@/components/app-ui";
import type { CheckoutSettings as Settings } from "@shared/cart-checkout";
import { formatMoney } from "@shared/i18n";
import { useLocale, useT } from "@/components/i18n/I18nProvider";

// Only settings the storefront checkout honours: each toggle changes what shoppers see or must fill in.

const TOGGLES: ReadonlyArray<{ key: keyof Omit<Settings, "upsellProducts"> }> = [
  { key: "requirePhone" },
  { key: "enableCoupon" },
  { key: "enableNotes" },
  { key: "enableGiftNote" },
  { key: "enableTrustBadges" },
  { key: "enableUpsells" },
];

const STEPS = ["contact", "delivery", "payment", "review"] as const;

interface ProductOption {
  id: string;
  name: string;
  image: string | null;
  price: number;
  hasOptions: boolean;
}

export function CheckoutSettings({ initial, products, paymentLabels, zoneCount }: { initial: Settings; products: ProductOption[]; paymentLabels: string[]; zoneCount: number }) {
  const t = useT("payments", "common");
  const locale = useLocale();
  const [settings, setSettings] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [query, setQuery] = useState("");

  const picked = settings.upsellProducts;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((product) => !product.hasOptions && (!q || product.name.toLowerCase().includes(q))).slice(0, 30);
  }, [products, query]);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setStatus("idle");
  }

  function togglePick(id: string) {
    update("upsellProducts", picked.includes(id) ? picked.filter((entry) => entry !== id) : [...picked, id].slice(0, 6));
  }

  async function save() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/store/checkout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid min-w-0 content-start gap-5">
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[17px] font-extrabold">{t("co.asked")}</h2>
          <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
            {TOGGLES.map((toggle) => (
              <li key={toggle.key} className="flex items-center gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-bold">{t(`tog.${toggle.key}.label`)}</div>
                  <div className="text-[13px] leading-[1.45] text-app-ink-soft">{t(`tog.${toggle.key}.desc`)}</div>
                </div>
                <Toggle on={settings[toggle.key]} onChange={(on) => update(toggle.key, on)} label={t(`tog.${toggle.key}.label`)} />
              </li>
            ))}
          </ul>
        </section>

        {settings.enableUpsells ? (
          <section className="rounded-[22px] border border-app-line bg-white p-5">
            <h2 className="m-0 text-[17px] font-extrabold">{t("co.addons")}</h2>
            <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">{t("co.addonsSub")}</p>
            <label htmlFor="upsell-search" className="sr-only">{t("co.search")}</label>
            <input
              id="upsell-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("co.search")}
              className="mt-4 h-11 w-full rounded-full border border-app-line bg-app-canvas px-4 text-[14.5px] outline-none focus-visible:border-app-ink"
            />
            {matches.length === 0 ? (
              <p className="mb-0 mt-4 text-[14px] text-app-ink-soft">{products.length ? t("co.noMatch") : t("co.publishFirst")}</p>
            ) : (
              <ul className="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2 2xl:grid-cols-3">
                {matches.map((product) => {
                  const on = picked.includes(product.id);
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => togglePick(product.id)}
                        disabled={!on && picked.length >= 6}
                        className={cx("flex min-h-[56px] w-full items-center gap-3 rounded-[16px] border px-3 py-2 text-left transition disabled:opacity-40", on ? "border-app-ink bg-app-canvas" : "border-app-line hover:border-app-line-strong")}
                      >
                        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-app-canvas">
                          {product.image ? <img src={product.image} alt="" className="h-full w-full object-cover" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-bold">{product.name}</span>
                          <span className="block text-[12.5px] text-app-ink-soft">{formatMoney(Math.round(product.price), locale)}</span>
                        </span>
                        <Icon name={on ? "checkCircle" : "plus"} size={17} className={on ? "text-app-success" : "text-app-ink-soft"} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}
      </div>

      <aside className="grid min-w-0 content-start gap-5">
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[17px] font-extrabold">{t("co.steps")}</h2>
          <ol className="m-0 mt-3 grid list-none gap-3 p-0">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-app-ink text-[12.5px] font-bold text-white">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-bold">{t(`step.${step}.label`)}</span>
                  <span className="block text-[13px] text-app-ink-soft">{t(`step.${step}.desc`)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[17px] font-extrabold">{t("co.elsewhere")}</h2>
          <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0 text-[14px]">
            <li className="flex items-center gap-3 py-3">
              <Icon name="card" size={17} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t("co.waysToPay")}</span>
                <span className="block text-[13px] text-app-ink-soft">{paymentLabels.join(", ")}</span>
              </span>
              <Link href="/home/payments" className="font-bold underline underline-offset-4">{t("co.change")}</Link>
            </li>
            <li className="flex items-center gap-3 py-3">
              <Icon name="truck" size={17} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t("co.deliveryOptions")}</span>
                <span className="block text-[13px] text-app-ink-soft">{zoneCount ? t("co.zones", { count: zoneCount }) : t("co.noZones")}</span>
              </span>
              <Link href="/home/shipping" className="font-bold underline underline-offset-4">{t("co.change")}</Link>
            </li>
            <li className="flex items-center gap-3 py-3">
              <Icon name="tag" size={17} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t("co.discounts")}</span>
                <span className="block text-[13px] text-app-ink-soft">{t("co.discountsSub")}</span>
              </span>
              <Link href="/home/discounts" className="font-bold underline underline-offset-4">{t("co.change")}</Link>
            </li>
          </ul>
        </section>

        {status === "error" ? <Notice>{t("co.saveFailed")}</Notice> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {status === "saved" ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-app-success"><Icon name="check" size={15} /> {t("saved")}</span>
          ) : null}
          <PillButton tone="accent" size="md" onClick={() => void save()} busy={saving} className="w-full sm:w-auto">
            {t("co.save")}
          </PillButton>
        </div>
      </aside>
    </div>
  );
}
