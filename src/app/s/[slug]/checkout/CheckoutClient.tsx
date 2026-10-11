"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/hooks/useCart";
import { readOrderChannel, useCampaignAttribution } from "@/hooks/useCampaignAttribution";
import { readRememberedStoreVisitor, rememberStoreVisitor, useStoreVisitor } from "@/hooks/useStoreVisitor";
import { getPublicStorefrontPath } from "@/lib/domains/storefront";
import { PaystackCheckoutButton } from "@/components/payments/PaystackCheckout";
import { verifyPaystackPayment, updateOrderPayment } from "@/app/actions/payments";

interface Store {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  currency: string;
  brandSettings: {
    palette?: { accent?: string; ctaBg?: string; ctaText?: string; heroBg?: string; heroText?: string; paperBg?: string };
    shippingConfig?: { flatRate?: number };
    cartConfig?: Record<string, string | boolean>;
  };
}

interface Props {
  store: Store;
  storeBasePath: string;
}

interface CreatedOrder {
  id: string;
  orderNumber: string;
  total: number;
  currency: string;
}

const GATEWAY_FEE_RATE = 0.015;
const GATEWAY_FEE_FLAT = 100;
const PLATFORM_FEE_RATE = 0.02;

function calcGatewayFee(amount: number) {
  return Math.round(amount * GATEWAY_FEE_RATE * 100 + GATEWAY_FEE_FLAT) / 100;
}

function calcPlatformFee(amount: number) {
  return Math.round(amount * PLATFORM_FEE_RATE * 100) / 100;
}

export function CheckoutClient({ store, storeBasePath }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cart = useCart(store.slug);
  const visitorKey = useStoreVisitor(store.slug);
  const campaignToken = useCampaignAttribution(store.slug);
  const palette = store.brandSettings?.palette ?? {};
  const ctaBg = palette.ctaBg ?? "#73D8C8";
  const ctaText = palette.ctaText ?? "#0E2A38";
  const heroBg = palette.heroBg ?? "#0E2A38";
  const heroText = palette.heroText ?? "#F4F1EA";
  const paperBg = palette.paperBg ?? "#FAF7F1";
  const shippingFee = store.brandSettings?.shippingConfig?.flatRate ?? 0;

  const steps = ["Contact", "Delivery", "Review & Pay"];
  const [step, setStep] = useState(0);

  const [form, setForm] = useState({
    buyerName: "",
    buyerEmail: "",
    buyerPhone: "",
    street: "",
    city: "",
    state: "",
    country: "Nigeria",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null);
  const [paying, setPaying] = useState(false);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{ type: string; value: number; code: string } | null>(null);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [discountError, setDiscountError] = useState("");

  useEffect(() => {
    const remembered = readRememberedStoreVisitor(store.slug);
    if (remembered.email || remembered.name) {
      setForm((prev) => ({
        ...prev,
        buyerEmail: prev.buyerEmail || remembered.email,
        buyerName: prev.buyerName || remembered.name,
      }));
    }
  }, [store.slug]);

  useEffect(() => {
    if (cart.loaded && cart.items.length === 0 && !createdOrder) router.push(getPublicStorefrontPath(storeBasePath, "/"));
  }, [cart.loaded, cart.items.length, router, storeBasePath, createdOrder]);

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "buyerEmail") rememberStoreVisitor(store.slug, { email: value });
    if (field === "buyerName") rememberStoreVisitor(store.slug, { name: value });
  }

  useEffect(() => {
    if (!visitorKey || cart.items.length === 0 || !form.buyerEmail.includes("@")) return;
    rememberStoreVisitor(store.slug, { email: form.buyerEmail, name: form.buyerName });
    const timer = window.setTimeout(() => {
      fetch(`/api/public/store/${store.slug}/abandoned-cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorKey,
          email: form.buyerEmail,
          name: form.buyerName || undefined,
          items: cart.items,
          subtotal: cart.subtotal,
        }),
      }).catch(() => {});
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [cart.items, cart.subtotal, form.buyerEmail, form.buyerName, store.slug, visitorKey]);

  async function applyDiscount() {
    if (!discountCode.trim()) return;
    setDiscountLoading(true);
    setDiscountError("");
    try {
      const res = await fetch("/api/store/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: discountCode, storeId: store.id, subtotal: cart.subtotal }),
      });
      const data = await res.json();
      if (data.valid) {
        setAppliedDiscount(data);
        setDiscountError("");
      } else {
        setAppliedDiscount(null);
        setDiscountError(data.error || "Invalid code");
      }
    } catch {
      setDiscountError("Failed to validate code");
    } finally {
      setDiscountLoading(false);
    }
  }

  function getDiscountedTotal(base: number): number {
    if (!appliedDiscount) return base;
    if (appliedDiscount.type === "percentage") return base - (base * appliedDiscount.value) / 100;
    if (appliedDiscount.type === "fixed_amount") return Math.max(0, base - appliedDiscount.value);
    return base;
  }

  const subtotalAfterDiscount = getDiscountedTotal(cart.subtotal);
  const gatewayFee = useMemo(() => calcGatewayFee(subtotalAfterDiscount + shippingFee), [subtotalAfterDiscount, shippingFee]);
  const platformFee = useMemo(() => calcPlatformFee(subtotalAfterDiscount + shippingFee), [subtotalAfterDiscount, shippingFee]);
  const total = subtotalAfterDiscount + shippingFee + gatewayFee + platformFee;

  function canProceedToStep(target: number): boolean {
    if (target === 0) return true;
    if (target === 1) return form.buyerName.trim().length > 0 && form.buyerEmail.includes("@");
    if (target === 2) return form.street.trim().length > 0 && form.city.trim().length > 0;
    return true;
  }

  function handleNext() {
    if (!canProceedToStep(step + 1)) return;
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (cart.items.length === 0) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/store/${store.slug}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerName: form.buyerName,
          buyerEmail: form.buyerEmail,
          buyerPhone: form.buyerPhone || undefined,
          deliveryAddress: { street: form.street, city: form.city, state: form.state || undefined, country: form.country },
          items: cart.items,
          paymentMethod: "inline",
          discountCode: appliedDiscount?.code || undefined,
          campaignToken: campaignToken || undefined,
          channel: readOrderChannel(store.slug) ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Something went wrong. Please try again.");
        return;
      }

      setCreatedOrder(data.data.order);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const handlePaymentSuccess = useCallback(
    async (reference: string) => {
      setPaying(true);
      try {
        const verification = await verifyPaystackPayment(reference);
        if (!verification.success) {
          setError(verification.error ?? "Payment verification failed. Please contact support.");
          return;
        }
        const result = await updateOrderPayment(createdOrder!.id, reference);
        if (!result.success) {
          setError(result.error ?? "Failed to update order. Please contact support.");
          return;
        }
        cart.clear();
        router.push(getPublicStorefrontPath(storeBasePath, `/order/${createdOrder!.id}`));
      } catch {
        setError("An unexpected error occurred. Please contact support.");
      } finally {
        setPaying(false);
      }
    },
    [createdOrder, cart, router, storeBasePath],
  );

  if (!cart.loaded) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: paperBg, color: "#6E6E68" }}>Loading...</div>;
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "11px 14px", border: "1.5px solid rgba(14,42,56,0.15)", borderRadius: 10, fontSize: 15, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "#fff", color: "#0E2A38" };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#6E6E68", marginBottom: 6, display: "block", letterSpacing: "0.04em" };

  const nameParts = form.buyerName.split(" ");
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ");

  return (
    <div style={{ background: paperBg, minHeight: "100vh", fontFamily: "var(--font-space-grotesk, sans-serif)" }}>
      <nav style={{ background: heroBg, padding: "0 24px", display: "flex", alignItems: "center", height: 60 }}>
        <a href={getPublicStorefrontPath(storeBasePath, "/")} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          {store.logoUrl && <img src={store.logoUrl} alt={store.name} style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }} />}
          <span style={{ color: heroText, fontWeight: 700, fontSize: 17 }}>{store.name}</span>
        </a>
        <span style={{ marginLeft: 12, color: heroText, opacity: 0.6, fontSize: 14 }}>/ Checkout</span>
      </nav>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 60px" }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 32 }}>
          {steps.map((s, i) => (
            <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: "100%", height: 3, borderRadius: 2, background: i <= step ? ctaBg : "rgba(14,42,56,0.1)", transition: "background .3s" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: i <= step ? ctaBg : "rgba(14,42,56,0.1)", color: i <= step ? "#fff" : "#6E6E68", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, transition: "background .3s" }}>{i + 1}</div>
                <span style={{ fontSize: 12, fontWeight: 600, color: i <= step ? "#0E2A38" : "#6E6E68", display: "none" }}>{s}</span>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {step === 0 && (
            <div>
              <h2 style={{ margin: "0 0 18px", fontSize: 20, fontWeight: 700, color: "#0E2A38" }}>Contact</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Full name</label>
                  <input required placeholder="Oluwaseun Akinlade" value={form.buyerName} onChange={(e) => set("buyerName", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email address</label>
                  <input required type="email" placeholder="seun@example.com" value={form.buyerEmail} onChange={(e) => set("buyerEmail", e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone number (optional)</label>
                  <input type="tel" placeholder="+234 800 000 0000" value={form.buyerPhone} onChange={(e) => set("buyerPhone", e.target.value)} style={inputStyle} />
                </div>
              </div>
              <button type="button" onClick={handleNext}
                disabled={!canProceedToStep(1)}
                style={{ marginTop: 24, width: "100%", background: canProceedToStep(1) ? ctaBg : "#e5e5e5", color: canProceedToStep(1) ? ctaText : "#999", border: "none", borderRadius: 999, padding: "15px", fontSize: 16, fontWeight: 700, cursor: canProceedToStep(1) ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                Continue to Delivery
              </button>
            </div>
          )}

          {step === 1 && (
            <div>
              <h2 style={{ margin: "0 0 18px", fontSize: 20, fontWeight: 700, color: "#0E2A38" }}>Delivery Address</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Street address</label>
                  <input required placeholder="42 Awolowo Road, Ikeja" value={form.street} onChange={(e) => set("street", e.target.value)} style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>City</label>
                    <input required placeholder="Lagos" value={form.city} onChange={(e) => set("city", e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>State / Province</label>
                    <input placeholder="Lagos" value={form.state} onChange={(e) => set("state", e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Country</label>
                  <input value={form.country} onChange={(e) => set("country", e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button type="button" onClick={handleBack}
                  style={{ flex: 1, background: "#fff", color: "#0E2A38", border: "1.5px solid rgba(14,42,56,0.15)", borderRadius: 999, padding: "15px", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Back
                </button>
                <button type="button" onClick={handleNext}
                  disabled={!canProceedToStep(2)}
                  style={{ flex: 1, background: canProceedToStep(2) ? ctaBg : "#e5e5e5", color: canProceedToStep(2) ? ctaText : "#999", border: "none", borderRadius: 999, padding: "15px", fontSize: 16, fontWeight: 700, cursor: canProceedToStep(2) ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                  Review & Pay
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={{ margin: "0 0 18px", fontSize: 20, fontWeight: 700, color: "#0E2A38" }}>Review & Pay</h2>

              <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 4px rgba(14,42,56,0.07)", marginBottom: 20 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {cart.items.map((item) => (
                    <div key={item.productId + (item.variant ?? "")} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ position: "relative", width: 48, height: 48, borderRadius: 8, overflow: "hidden", background: "#f4f1ea", flexShrink: 0 }}>
                        {item.image
                          ? <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#6E6E68", textTransform: "uppercase", letterSpacing: "0.12em" }}>Item</div>}
                        <div style={{ position: "absolute", top: -4, right: -4, background: "#6E6E68", color: "#fff", borderRadius: 999, width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{item.quantity}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0E2A38" }}>{item.name}</p>
                        {item.variant && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#6E6E68" }}>{item.variant}</p>}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#0E2A38" }}>{store.currency} {(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 16, borderTop: "1px solid rgba(14,42,56,0.08)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6E6E68" }}>
                    <span>Product total</span>
                    <span>{store.currency} {cart.subtotal.toLocaleString()}</span>
                  </div>
                  {appliedDiscount && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#059669" }}>
                      <span>Discount ({appliedDiscount.code})</span>
                      <span>-{store.currency} {(cart.subtotal - subtotalAfterDiscount).toLocaleString()}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#6E6E68" }}>
                    <span>Delivery</span>
                    <span>{shippingFee === 0 ? "Free" : `${store.currency} ${shippingFee.toLocaleString()}`}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6E6E68" }}>
                    <span>Gateway fee (1.5% + ₦100)</span>
                    <span>{store.currency} {gatewayFee.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6E6E68" }}>
                    <span>Platform fee (2%)</span>
                    <span>{store.currency} {platformFee.toLocaleString()}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "#0E2A38", marginTop: 4, borderTop: "1px solid rgba(14,42,56,0.08)", paddingTop: 14 }}>
                    <span>Total</span>
                    <span>{store.currency} {total.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    placeholder="Discount code"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyDiscount(); } }}
                    style={{ flex: 1, padding: "8px 12px", border: "1.5px solid rgba(14,42,56,0.15)", borderRadius: 8, fontSize: 13, fontFamily: "var(--font-mono)", outline: "none" }}
                  />
                  <button type="button" onClick={() => void applyDiscount()} disabled={discountLoading || !discountCode.trim()}
                    style={{ padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: discountLoading || !discountCode.trim() ? "#e5e5e5" : "#0E2A38", color: "#fff", border: "none", cursor: discountLoading ? "default" : "pointer" }}>
                    {discountLoading ? "..." : "Apply"}
                  </button>
                </div>
                {discountError && <div style={{ fontSize: 12, color: "#E86A4F", marginTop: 8 }}>{discountError}</div>}
                {appliedDiscount && (
                  <div style={{ fontSize: 12, color: "#059669", marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <span>✓ <strong>{appliedDiscount.code}</strong> applied</span>
                    <button type="button" onClick={() => { setAppliedDiscount(null); setDiscountCode(""); }}
                      style={{ marginLeft: "auto", background: "none", border: "none", color: "#E86A4F", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Remove</button>
                  </div>
                )}
              </div>

              {error && <div style={{ background: "#fef2f2", border: "1px solid #E86A4F", borderRadius: 10, padding: "12px 16px", color: "#E86A4F", fontSize: 14, marginBottom: 16 }}>{error}</div>}

              {createdOrder ? (
                <PaystackCheckoutButton
                  amount={createdOrder.total}
                  email={form.buyerEmail}
                  firstName={firstName}
                  lastName={lastName}
                  phone={form.buyerPhone}
                  metadata={{ orderId: createdOrder.id, orderNumber: createdOrder.orderNumber }}
                  onSuccess={handlePaymentSuccess}
                  onClose={() => setCreatedOrder(null)}
                  disabled={paying}
                  label={paying ? "Verifying payment..." : `Pay ${store.currency} ${total.toLocaleString()}`}
                  style={{ width: "100%", background: paying ? "#9ca3af" : ctaBg, color: ctaText, border: "none", borderRadius: 999, padding: "15px", fontSize: 16, fontWeight: 700, cursor: paying ? "not-allowed" : "pointer", fontFamily: "inherit" }}
                />
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" onClick={handleBack}
                    style={{ flex: 1, background: "#fff", color: "#0E2A38", border: "1.5px solid rgba(14,42,56,0.15)", borderRadius: 999, padding: "15px", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                    Back
                  </button>
                  <button type="submit"
                    disabled={submitting || cart.items.length === 0}
                    style={{ flex: 1, background: submitting ? "#9ca3af" : ctaBg, color: ctaText, border: "none", borderRadius: 999, padding: "15px", fontSize: 16, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                    {submitting ? "Creating order..." : `Pay ${store.currency} ${total.toLocaleString()}`}
                  </button>
                </div>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
