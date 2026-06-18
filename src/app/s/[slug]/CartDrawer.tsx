"use client";

import Link from "next/link";
import { useState } from "react";
import type React from "react";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  variant?: string;
}

export interface CartHook {
  items: CartItem[];
  update: (id: string, qty: number) => void;
  remove: (id: string) => void;
  subtotal: number;
  count: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  cart: CartHook;
  storeBasePath: string;
  currency: string;
  accentColor: string;
  accentTextColor: string;
  variation?: string;
  deliveryEstimate?: string;
  freeDeliveryThreshold?: number;
}

const btnBase: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
};

export function CartDrawer({ open, onClose, cart, storeBasePath, currency, accentColor, accentTextColor, variation = "right-drawer", deliveryEstimate, freeDeliveryThreshold }: Props) {
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);

  if (!open) return null;

  const isBottom = variation === "bottom-drawer";
  const isFullscreen = variation === "fullscreen";
  const isMinimal = variation === "minimal";
  const isUpsell = variation === "upsell";
  const isLuxury = variation === "luxury";
  const isMarketplace = variation === "marketplace";

  const panelStyle: React.CSSProperties = isFullscreen
    ? { position: "fixed", inset: 0, background: "#fff", zIndex: 50, display: "flex", flexDirection: "column" }
    : isBottom
      ? { position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "85vh", background: "#fff", zIndex: 50, display: "flex", flexDirection: "column", borderRadius: "24px 24px 0 0", boxShadow: "0 -8px 40px rgba(14,42,56,0.18)", overflow: "hidden" }
      : isMinimal
        ? { position: "fixed", right: 24, top: 80, width: "min(340px, calc(100vw - 28px))", maxHeight: "min(580px, calc(100vh - 120px))", borderRadius: 18, background: "#fff", zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "0 16px 64px rgba(14,42,56,0.2)", overflow: "hidden" }
        : isUpsell
          ? { position: "fixed", right: 0, top: 0, bottom: 0, width: "min(480px, 100vw)", background: "#fff", zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(14,42,56,0.15)" }
          : isLuxury
            ? { position: "fixed", right: 0, top: 0, bottom: 0, width: "min(460px, 100vw)", background: "#FAF7F1", zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(14,42,56,0.12)" }
            : isMarketplace
              ? { position: "fixed", left: 0, right: 0, bottom: 0, top: "auto", maxHeight: "80vh", background: "#fff", zIndex: 50, display: "flex", flexDirection: "column", borderRadius: "20px 20px 0 0", boxShadow: "0 -4px 30px rgba(14,42,56,0.12)", overflow: "hidden" }
              : { position: "fixed", right: 0, top: 0, bottom: 0, width: "min(420px, 100vw)", background: "#fff", zIndex: 50, display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(14,42,56,0.15)" };

  const renderItem = (item: CartItem) => {
    const lineTotal = item.price * item.quantity;
    return (
      <div key={item.productId} style={{ display: "flex", gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid rgba(14,42,56,0.06)" }}>
        <div style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", background: "#f4f1ea", flexShrink: 0 }}>
          {item.image
            ? <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
            : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#6E6E68", textTransform: "uppercase", letterSpacing: "0.12em" }}>Item</div>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 14, color: "#0E2A38" }}>{item.name}</p>
              {item.variant && <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6E6E68" }}>{item.variant}</p>}
              <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6E6E68" }}>{currency} {item.price.toLocaleString()} each</p>
            </div>
            <button onClick={() => cart.remove(item.productId)} style={{ ...btnBase, color: "#E86A4F", fontSize: 16, padding: 4, lineHeight: 1 }} title="Remove">x</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
            <button onClick={() => cart.update(item.productId, item.quantity - 1)} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(14,42,56,0.15)", background: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>-</button>
            <span style={{ fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: "center" }}>{item.quantity}</span>
            <button onClick={() => cart.update(item.productId, item.quantity + 1)} style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(14,42,56,0.15)", background: "#fff", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>+</button>
            <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#0E2A38" }}>{currency} {lineTotal.toLocaleString()}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(14,42,56,0.45)", zIndex: 40, backdropFilter: "blur(2px)" }} />
      <div style={panelStyle}>
        <div style={{ padding: isLuxury ? "24px 24px 18px" : "20px 20px 16px", borderBottom: "1px solid rgba(14,42,56,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: isLuxury ? 20 : 18, fontWeight: isLuxury ? 400 : 700, color: "#0E2A38", fontFamily: isLuxury ? "var(--font-fraunces), serif" : "inherit" }}>
            {isLuxury ? "Shopping Bag" : isMarketplace ? "Your Items" : `Cart`} ({cart.count})
          </h2>
          <button onClick={onClose} style={{ ...btnBase, fontSize: 22, color: "#6E6E68", lineHeight: 1, padding: 4 }}>x</button>
        </div>

        {cart.items.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#6E6E68", gap: 12, padding: 40 }}>
            <span style={{ fontSize: 40, opacity: 0.3 }}>{isLuxury ? "👜" : isMarketplace ? "🛍️" : "🛒"}</span>
            <p style={{ margin: 0, fontSize: 16 }}>Your cart is empty</p>
            <button onClick={onClose} style={{ ...btnBase, color: accentColor, fontSize: 14, fontWeight: 600, marginTop: 4 }}>Continue shopping</button>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: isLuxury ? "20px 24px" : "16px 20px" }}>
              {cart.items.map(renderItem)}

              {/* Coupon field */}
              <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                <input
                  placeholder="Coupon code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  style={{ flex: 1, padding: "8px 12px", border: "1.5px solid rgba(14,42,56,0.15)", borderRadius: 8, fontSize: 13, fontFamily: "var(--font-mono, monospace)", outline: "none" }}
                />
                <button type="button" onClick={() => setCouponApplied(true)} disabled={!couponCode.trim()}
                  style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: couponCode.trim() ? "#0E2A38" : "#e5e5e5", color: "#fff", border: "none", cursor: couponCode.trim() ? "pointer" : "default" }}>
                  Apply
                </button>
              </div>
              {couponApplied && <div style={{ fontSize: 12, color: "#059669", marginTop: 6 }}>✓ Coupon applied</div>}

              {/* Delivery estimate */}
              {deliveryEstimate && (
                <div style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(14,42,56,0.04)", fontSize: 12, color: "#6E6E68" }}>
                  Estimated delivery: {deliveryEstimate}
                </div>
              )}

              {/* Free delivery progress */}
              {freeDeliveryThreshold && freeDeliveryThreshold > 0 && cart.subtotal < freeDeliveryThreshold && (
                <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "rgba(14,42,56,0.04)", fontSize: 12, color: "#6E6E68" }}>
                  Add {currency} {(freeDeliveryThreshold - cart.subtotal).toLocaleString()} more for free delivery
                </div>
              )}
            </div>

            <div style={{ padding: isLuxury ? "20px 24px 28px" : "16px 20px 24px", borderTop: "1px solid rgba(14,42,56,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontWeight: 600, color: "#0E2A38" }}>Subtotal</span>
                <span style={{ fontWeight: 700, color: "#0E2A38", fontSize: isLuxury ? 20 : 18 }}>{currency} {cart.subtotal.toLocaleString()}</span>
              </div>

              <Link href={getPublicStorefrontPath(storeBasePath, "/checkout")} style={{ display: "block", background: accentColor, color: accentTextColor, borderRadius: 999, padding: "14px", textAlign: "center", fontWeight: 700, fontSize: 16, textDecoration: "none", marginBottom: 8 }} onClick={onClose}>
                Checkout
              </Link>

              {!isMinimal && (
                <button onClick={onClose} style={{ ...btnBase, width: "100%", padding: "10px", borderRadius: 999, border: "1px solid rgba(14,42,56,0.15)", fontSize: 14, fontWeight: 600, color: "#6E6E68", marginTop: 4 }}>
                  Continue shopping
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
