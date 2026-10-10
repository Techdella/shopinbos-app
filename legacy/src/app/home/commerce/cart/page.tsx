"use client";

import { useState, useEffect } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon } from "@/components/ui";

const CART_LABELS = [
  { value: "add_to_cart", label: "Add to Cart" },
  { value: "add_to_bag", label: "Add to Bag" },
  { value: "add_to_basket", label: "Add to Basket" },
  { value: "buy_now", label: "Buy Now" },
  { value: "order_now", label: "Order Now" },
];

const BEHAVIORS = [
  { value: "drawer", label: "Open cart drawer", desc: "Slides in from the side" },
  { value: "toast", label: "Show confirmation toast", desc: "Brief pop-up notification" },
  { value: "stay", label: "Stay on page", desc: "No visible feedback" },
  { value: "redirect_cart", label: "Go to cart page", desc: "Full page redirect" },
  { value: "redirect_checkout", label: "Go to checkout", desc: "Straight to checkout" },
];

const CART_STYLES = [
  { value: "right-drawer", label: "Right Drawer", desc: "Slides in from the right", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="56" height="48" rx="2" fill="white" stroke="#D1D5DB" stroke-width="0.8"/><rect x="8" y="8" width="20" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="12" width="32" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="18" width="14" height="2" rx="1" fill="#F3F4F6"/><rect x="8" y="22" width="24" height="2" rx="1" fill="#F3F4F6"/><rect x="62" y="4" width="14" height="48" rx="2" fill="#0E9E85" opacity="0.15" stroke="#0E9E85" stroke-width="0.8"/><rect x="65" y="10" width="8" height="2" rx="1" fill="#0E9E85" opacity="0.3"/><rect x="65" y="16" width="8" height="2" rx="1" fill="#0E9E85" opacity="0.2"/><rect x="65" y="22" width="8" height="2" rx="1" fill="#0E9E85" opacity="0.2"/></svg>` },
  { value: "bottom-drawer", label: "Bottom Drawer", desc: "Slides up from the bottom", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="72" height="48" rx="2" fill="white" stroke="#D1D5DB" stroke-width="0.8"/><rect x="8" y="8" width="20" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="12" width="32" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="18" width="14" height="2" rx="1" fill="#F3F4F6"/><rect x="8" y="22" width="24" height="2" rx="1" fill="#F3F4F6"/><rect x="4" y="34" width="72" height="18" rx="2" fill="#0E9E85" opacity="0.15" stroke="#0E9E85" stroke-width="0.8"/><rect x="10" y="38" width="8" height="2" rx="1" fill="#0E9E85" opacity="0.3"/><rect x="22" y="38" width="20" height="2" rx="1" fill="#0E9E85" opacity="0.2"/><rect x="10" y="43" width="14" height="2" rx="1" fill="#0E9E85" opacity="0.2"/></svg>` },
  { value: "fullscreen", label: "Fullscreen", desc: "Takes over the full screen on mobile", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="5" y="5" width="70" height="46" rx="3" fill="#0E9E85" opacity="0.12" stroke="#0E9E85" stroke-width="0.8"/><rect x="10" y="12" width="60" height="2" rx="1" fill="#0E9E85" opacity="0.2"/><rect x="10" y="16" width="60" height="2" rx="1" fill="#0E9E85" opacity="0.15"/><rect x="10" y="22" width="28" height="2" rx="1" fill="#0E9E85" opacity="0.15"/><rect x="10" y="26" width="24" height="2" rx="1" fill="#0E9E85" opacity="0.15"/><rect x="10" y="32" width="40" height="2" rx="1" fill="#0E9E85" opacity="0.12"/><rect x="10" y="36" width="20" height="2" rx="1" fill="#0E9E85" opacity="0.12"/></svg>` },
  { value: "minimal", label: "Minimal", desc: "Clean, simple cart drawer", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="72" height="48" rx="2" fill="white" stroke="#D1D5DB" stroke-width="0.8"/><rect x="8" y="8" width="20" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="12" width="32" height="2" rx="1" fill="#E5E7EB"/><rect x="68" y="6" width="4" height="4" rx="1" fill="#0E9E85" opacity="0.2"/><rect x="8" y="18" width="14" height="2" rx="1" fill="#F3F4F6"/></svg>` },
  { value: "upsell", label: "Upsell Drawer", desc: "Wide drawer with upsell suggestions", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="52" height="48" rx="2" fill="white" stroke="#D1D5DB" stroke-width="0.8"/><rect x="8" y="8" width="20" height="2" rx="1" fill="#E5E7EB"/><rect x="58" y="4" width="18" height="48" rx="2" fill="#F59E0B" opacity="0.12" stroke="#F59E0B" stroke-width="0.8"/><rect x="61" y="10" width="12" height="2" rx="1" fill="#F59E0B" opacity="0.25"/><rect x="61" y="14" width="8" height="2" rx="1" fill="#F59E0B" opacity="0.15"/></svg>` },
  { value: "luxury", label: "Luxury Bag", desc: "Elegant bag-style cart for fashion", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="72" height="48" rx="2" fill="#FAF7F1" stroke="#D4C5A9" stroke-width="0.8"/><rect x="8" y="10" width="16" height="2" rx="1" fill="#C4B5A5"/><rect x="8" y="14" width="28" height="2" rx="1" fill="#E8DDD0"/><rect x="60" y="10" width="8" height="2" rx="1" fill="#C4B5A5"/><rect x="8" y="20" width="12" height="2" rx="1" fill="#F0EAE0"/></svg>` },
  { value: "marketplace", label: "Marketplace", desc: "Bottom sheet style for marketplaces", svg: `<svg viewBox="0 0 80 56" fill="none"><rect width="80" height="56" rx="4" fill="#F3F4F6"/><rect x="4" y="4" width="72" height="48" rx="2" fill="white" stroke="#D1D5DB" stroke-width="0.8"/><rect x="8" y="8" width="20" height="2" rx="1" fill="#E5E7EB"/><rect x="8" y="12" width="32" height="2" rx="1" fill="#E5E7EB"/><rect x="4" y="34" width="72" height="18" rx="2" fill="#0E9E85" opacity="0.12" stroke="#0E9E85" stroke-width="0.8"/><rect x="10" y="38" width="8" height="2" rx="1" fill="#0E9E85" opacity="0.25"/><rect x="22" y="38" width="20" height="2" rx="1" fill="#0E9E85" opacity="0.15"/><rect x="38" y="43" width="20" height="6" rx="3" fill="#0E9E85" opacity="0.15"/></svg>` },
];

export default function CommerceCartPage() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  const currentStyle = CART_STYLES.find((s) => s.value === cartStyle);

  return (
    <AppFrame role="seller">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Cart"
          sub="Choose how your cart looks and behaves on the storefront"
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              {saved && (
                <span style={{ fontSize: 13, color: "var(--teal-600)", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                  <Icon name="check" size={14} /> Saved
                </span>
              )}
              <button onClick={handleSave} disabled={saving} className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer" }}>
                {saving ? "Saving..." : "Save settings"}
              </button>
            </div>
          }
        />

        {/* Cart Style */}
        <div className="card" style={{ padding: 20 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>Cart Style</h2>
          <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "0 0 14px" }}>
            Choose how the cart panel appears when a customer adds an item.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
            {CART_STYLES.map((style) => (
              <button
                key={style.value}
                onClick={() => setCartStyle(style.value)}
                style={{
                  padding: 12, borderRadius: 10, cursor: "pointer",
                  background: cartStyle === style.value ? "var(--teal-50)" : "var(--ink-50)",
                  border: cartStyle === style.value ? "2px solid var(--teal-600)" : "2px solid transparent",
                  textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  transition: "all 0.15s",
                }}
              >
                <span dangerouslySetInnerHTML={{ __html: style.svg }} style={{ width: 80, height: 56 }} />
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink-800)" }}>{style.label}</div>
                <div style={{ fontSize: 10, color: "var(--ink-500)", lineHeight: 1.3 }}>{style.desc}</div>
              </button>
            ))}
          </div>

          {currentStyle && (
            <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "var(--teal-50)", fontSize: 13, color: "var(--teal-800)", display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="info" size={14} />
              <strong>{currentStyle.label}:</strong> {currentStyle.desc}. This affects how customers see their items.
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" }}>
          {/* Button Label */}
          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>Button Label</h2>
            <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "0 0 14px" }}>
              What text appears on the add-to-cart button.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {CART_LABELS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                    background: cartLabel === opt.value ? "var(--teal-50)" : "transparent",
                    border: cartLabel === opt.value ? "1px solid var(--teal-200)" : "1px solid var(--ink-200)",
                    transition: "all 0.12s",
                  }}
                >
                  <input
                    type="radio"
                    name="cartLabel"
                    value={opt.value}
                    checked={cartLabel === opt.value}
                    onChange={(e) => setCartLabel(e.target.value)}
                    style={{ accentColor: "var(--teal-600)" }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Behavior */}
          <div className="card" style={{ padding: 20 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 800 }}>Add-to-Cart Behavior</h2>
            <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "0 0 14px" }}>
              What happens after a customer taps "Add to Cart".
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {BEHAVIORS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                    background: cartBehavior === opt.value ? "var(--teal-50)" : "transparent",
                    border: cartBehavior === opt.value ? "1px solid var(--teal-200)" : "1px solid var(--ink-200)",
                    transition: "all 0.12s",
                  }}
                >
                  <input
                    type="radio"
                    name="cartBehavior"
                    value={opt.value}
                    checked={cartBehavior === opt.value}
                    onChange={(e) => setCartBehavior(e.target.value)}
                    style={{ accentColor: "var(--teal-600)" }}
                  />
                  <div style={{ fontSize: 13 }}>
                    <div style={{ fontWeight: 600 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Wishlist Toggle */}
        <div className="card" style={{ padding: 20, display: "flex", alignItems: "center", gap: 14 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}>
            <input
              type="checkbox"
              checked={enableWishlist}
              onChange={(e) => setEnableWishlist(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "var(--teal-600)" }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Enable wishlist</div>
              <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                Show heart icon on product cards so customers can save items for later.
              </div>
            </div>
          </label>
        </div>
      </div>
    </AppFrame>
  );
}
