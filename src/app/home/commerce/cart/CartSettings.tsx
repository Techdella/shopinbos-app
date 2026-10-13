"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, Toggle, cx } from "@/components/app-ui";
import type { AfterAddBehaviour, CartSettings as Settings } from "@shared/cart-checkout";
import { useT } from "@/components/i18n/I18nProvider";

// Only what the storefront honours: where shoppers land after "Add to bag", and whether wishlists are on.

const AFTER_ADD: ReadonlyArray<AfterAddBehaviour> = ["drawer", "cart_page", "checkout"];

export function CartSettings({ initial }: { initial: Settings }) {
  const t = useT("store", "common");
  const [afterAdd, setAfterAdd] = useState<AfterAddBehaviour>(initial.afterAdd);
  const [wishlist, setWishlist] = useState(initial.wishlist);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function save() {
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/store/settings/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addToCartBehavior: afterAdd, enableWishlist: wishlist }),
      });
      setStatus(res.ok ? "saved" : "error");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[22px] border border-app-line bg-white p-5">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="m-0 p-0 text-[17px] font-extrabold">{t("cart.afterAdd")}</legend>
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {AFTER_ADD.map((value) => ({ value, label: t(`cart.opt.${value}`), desc: t(`cart.opt.${value}.desc`) })).map((option) => {
            const on = afterAdd === option.value;
            return (
              <label key={option.value} className={cx("flex min-h-[56px] cursor-pointer items-start gap-3 rounded-[16px] border px-4 py-3", on ? "border-app-ink bg-app-canvas" : "border-app-line hover:border-app-line-strong")}>
                <input type="radio" name="afterAdd" value={option.value} checked={on} onChange={() => { setAfterAdd(option.value); setStatus("idle"); }} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[#16141F]" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold">{option.label}</span>
                  <span className="block text-[12.5px] leading-[1.4] text-app-ink-soft">{option.desc}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex items-center gap-4 border-t border-app-line pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[15px] font-extrabold">{t("cart.wishlists")}</h2>
          <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{t("cart.wishlistsSub")}</p>
        </div>
        <Toggle on={wishlist} onChange={(on) => { setWishlist(on); setStatus("idle"); }} label={t("cart.wishlists")} />
      </div>

      {status === "error" ? <div className="mt-4"><Notice>{t("cart.saveError")}</Notice></div> : null}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        {status === "saved" ? <span role="status" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-app-success"><Icon name="check" size={15} /> {t("saved")}</span> : null}
        <PillButton tone="accent" size="md" onClick={() => void save()} busy={saving}>{t("save")}</PillButton>
      </div>
    </section>
  );
}
