"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, Toggle, cx } from "@/components/app-ui";

const CART_LABELS = [
  { value: "add_to_cart", label: "Add to cart" },
  { value: "add_to_bag", label: "Add to bag" },
  { value: "add_to_basket", label: "Add to basket" },
  { value: "buy_now", label: "Buy now" },
  { value: "order_now", label: "Order now" },
];

const BEHAVIORS = [
  { value: "drawer", label: "Open cart drawer", desc: "Slides in from the side" },
  { value: "toast", label: "Show a short message", desc: "Brief pop-up notification" },
  { value: "stay", label: "Stay on page", desc: "No visible feedback" },
  { value: "redirect_cart", label: "Go to cart page", desc: "Full page redirect" },
  { value: "redirect_checkout", label: "Go to checkout", desc: "Straight to checkout" },
];

const CART_STYLES = [
  { value: "right-drawer", label: "Side drawer", desc: "Slides in from the right", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="56" height="48" rx="2" fill="white" stroke="#D1D5DB" stroke-width="0.8"/><rect x="8" y="8" width="20" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="12" width="32" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="18" width="14" height="2" rx="1" fill="#F3F4F6"/><rect x="8" y="22" width="24" height="2" rx="1" fill="#F3F4F6"/><rect x="62" y="4" width="14" height="48" rx="2" fill="#16141F" opacity="0.15" stroke="#16141F" stroke-width="0.8"/><rect x="65" y="10" width="8" height="2" rx="1" fill="#16141F" opacity="0.3"/><rect x="65" y="16" width="8" height="2" rx="1" fill="#16141F" opacity="0.2"/><rect x="65" y="22" width="8" height="2" rx="1" fill="#16141F" opacity="0.2"/></svg>` },
  { value: "bottom-drawer", label: "Bottom drawer", desc: "Slides up from the bottom", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="72" height="48" rx="2" fill="white" stroke="#D1D5DB" stroke-width="0.8"/><rect x="8" y="8" width="20" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="12" width="32" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="18" width="14" height="2" rx="1" fill="#F3F4F6"/><rect x="8" y="22" width="24" height="2" rx="1" fill="#F3F4F6"/><rect x="4" y="34" width="72" height="18" rx="2" fill="#16141F" opacity="0.15" stroke="#16141F" stroke-width="0.8"/><rect x="10" y="38" width="8" height="2" rx="1" fill="#16141F" opacity="0.3"/><rect x="22" y="38" width="20" height="2" rx="1" fill="#16141F" opacity="0.2"/><rect x="10" y="43" width="14" height="2" rx="1" fill="#16141F" opacity="0.2"/></svg>` },
  { value: "fullscreen", label: "Fullscreen", desc: "Takes over the full screen on mobile", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="5" y="5" width="70" height="46" rx="3" fill="#16141F" opacity="0.12" stroke="#16141F" stroke-width="0.8"/><rect x="10" y="12" width="60" height="2" rx="1" fill="#16141F" opacity="0.2"/><rect x="10" y="16" width="60" height="2" rx="1" fill="#16141F" opacity="0.15"/><rect x="10" y="22" width="28" height="2" rx="1" fill="#16141F" opacity="0.15"/><rect x="10" y="26" width="24" height="2" rx="1" fill="#16141F" opacity="0.15"/><rect x="10" y="32" width="40" height="2" rx="1" fill="#16141F" opacity="0.12"/><rect x="10" y="36" width="20" height="2" rx="1" fill="#16141F" opacity="0.12"/></svg>` },
  { value: "minimal", label: "Minimal", desc: "Clean, simple cart drawer", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="72" height="48" rx="2" fill="white" stroke="#D1D5DB" stroke-width="0.8"/><rect x="8" y="8" width="20" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="12" width="32" height="2" rx="1" fill="#E5E7EB"/><rect x="68" y="6" width="4" height="4" rx="1" fill="#16141F" opacity="0.2"/><rect x="8" y="18" width="14" height="2" rx="1" fill="#F3F4F6"/></svg>` },
  { value: "upsell", label: "Upsell drawer", desc: "Wide drawer with upsell suggestions", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="52" height="48" rx="2" fill="white" stroke="#D1D5DB" stroke-width="0.8"/><rect x="8" y="8" width="20" height="2" rx="1" fill="#E5E7EB"/><rect x="58" y="4" width="18" height="48" rx="2" fill="#FF6A2B" opacity="0.12" stroke="#FF6A2B" stroke-width="0.8"/><rect x="61" y="10" width="12" height="2" rx="1" fill="#FF6A2B" opacity="0.25"/><rect x="61" y="14" width="8" height="2" rx="1" fill="#FF6A2B" opacity="0.15"/></svg>` },
  { value: "luxury", label: "Luxury bag", desc: "Elegant bag-style cart for fashion", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="72" height="48" rx="2" fill="#FAF7F1" stroke="#D4C5A9" stroke-width="0.8"/><rect x="8" y="10" width="16" height="2" rx="1" fill="#C4B5A5"/><rect x="8" y="14" width="28" height="2" rx="1" fill="#E8DDD0"/><rect x="60" y="10" width="8" height="2" rx="1" fill="#C4B5A5"/><rect x="8" y="20" width="12" height="2" rx="1" fill="#F0EAE0"/></svg>` },
  { value: "marketplace", label: "Marketplace", desc: "Bottom sheet style for marketplaces", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="72" height="48" rx="2" fill="white" stroke="#D1D5DB" stroke-width="0.8"/><rect x="8" y="8" width="20" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="12" width="32" height="2" rx="1" fill="#E5E7EB"/><rect x="4" y="34" width="72" height="18" rx="2" fill="#16141F" opacity="0.12" stroke="#16141F" stroke-width="0.8"/><rect x="10" y="38" width="8" height="2" rx="1" fill="#16141F" opacity="0.25"/><rect x="22" y="38" width="20" height="2" rx="1" fill="#16141F" opacity="0.15"/><rect x="38" y="43" width="20" height="6" rx="3" fill="#16141F" opacity="0.15"/></svg>` },
];

export function CartSettings() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [cartLabel, setCartLabel] = useState("add_to_cart");
  const [cartBehavior, setCartBehavior] = useState("drawer");
  const [cartStyle, setCartStyle] = useState("right-drawer");
  const [enableWishlist, setEnableWishlist] = useState(true);

  useEffect(() => {
    fetch("/api/store/settings/cart")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.data) return;
        setCartLabel(data.data.addToCartLabel ?? "add_to_cart");
        setCartBehavior(data.data.addToCartBehavior ?? "drawer");
        setCartStyle(data.data.cartStyle ?? "right-drawer");
        setEnableWishlist(data.data.enableWishlist !== false);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(false);
    try {
      const res = await fetch("/api/store/settings/cart", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addToCartLabel: cartLabel,
          addToCartBehavior: cartBehavior,
          cartStyle,
          enableWishlist,
        }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const currentStyle = CART_STYLES.find((s) => s.value === cartStyle);
  const buttonLabel = CART_LABELS.find((l) => l.value === cartLabel)?.label ?? "Add to cart";

  return (
    <div className="grid gap-5">
      <section className="rounded-[22px] border border-app-line bg-white p-5">
        <h2 className="m-0 text-[17px] font-extrabold">Cart style</h2>
        <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">How the cart opens when a shopper adds an item.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7" role="radiogroup" aria-label="Cart style">
          {CART_STYLES.map((style) => {
            const on = cartStyle === style.value;
            return (
              <button
                key={style.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setCartStyle(style.value)}
                className={cx("flex min-w-0 flex-col items-center gap-2 rounded-[18px] border-2 p-3 text-center transition", on ? "border-app-ink bg-app-canvas" : "border-app-line bg-white hover:border-app-line-strong")}
              >
                <span aria-hidden className="block w-full max-w-[120px] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: style.svg }} />
                <span className="text-[13.5px] font-extrabold">{style.label}</span>
                <span className="text-[12px] leading-[1.35] text-app-ink-soft">{style.desc}</span>
              </button>
            );
          })}
        </div>
        {currentStyle && (
          <p className="mb-0 mt-4 flex items-start gap-2 rounded-[16px] bg-app-canvas px-4 py-3 text-[13.5px]">
            <Icon name="info" size={15} className="mt-0.5 shrink-0" />
            <span><strong>{currentStyle.label}:</strong> {currentStyle.desc}.</span>
          </p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <OptionList
          title="Button text"
          sub="The words on the add-to-cart button."
          name="cartLabel"
          options={CART_LABELS}
          value={cartLabel}
          onChange={setCartLabel}
        />
        <OptionList
          title="After adding to cart"
          sub={`What happens after a shopper taps "${buttonLabel}".`}
          name="cartBehavior"
          options={BEHAVIORS}
          value={cartBehavior}
          onChange={setCartBehavior}
        />
      </div>

      <section className="flex items-center gap-4 rounded-[22px] border border-app-line bg-white p-5">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[15px] font-extrabold">Wishlist</h2>
          <p className="mb-0 mt-0.5 text-[13.5px] text-app-ink-soft">Show a heart on product cards so shoppers can save items for later.</p>
        </div>
        <Toggle on={enableWishlist} onChange={setEnableWishlist} label="Enable wishlist" />
      </section>

      {error && <Notice>Could not save your cart settings. Try again.</Notice>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {saved && (
          <span role="status" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-app-success">
            <Icon name="check" size={15} /> Saved
          </span>
        )}
        <PillButton tone="accent" size="md" onClick={handleSave} busy={saving}>Save cart settings</PillButton>
      </div>
    </div>
  );
}

function OptionList({
  title,
  sub,
  name,
  options,
  value,
  onChange,
}: {
  title: string;
  sub: string;
  name: string;
  options: Array<{ value: string; label: string; desc?: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="m-0 min-w-0 rounded-[22px] border border-app-line bg-white p-5">
      <legend className="float-left m-0 w-full p-0 text-[17px] font-extrabold">{title}</legend>
      <p className="clear-both mb-0 pt-1 text-[13.5px] text-app-ink-soft">{sub}</p>
      <div className="mt-3 grid gap-2">
        {options.map((opt) => {
          const on = value === opt.value;
          return (
            <label key={opt.value} className={cx("flex min-h-[48px] cursor-pointer items-center gap-3 rounded-[16px] border px-4 py-2.5", on ? "border-app-ink bg-app-canvas" : "border-app-line hover:border-app-line-strong")}>
              <input type="radio" name={name} value={opt.value} checked={on} onChange={(e) => onChange(e.target.value)} className="h-[18px] w-[18px] shrink-0 accent-[#16141F]" />
              <span className="min-w-0">
                <span className="block text-[14px] font-bold">{opt.label}</span>
                {opt.desc && <span className="block text-[12.5px] text-app-ink-soft">{opt.desc}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
