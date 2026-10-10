"use client";

import Link from "next/link";
import { useCart } from "@/hooks/useCart";

interface CartPageClientProps {
  store: {
    name: string;
    slug: string;
    currency: string;
    brandSettings: any;
  };
}

export function CartPageClient({ store }: CartPageClientProps) {
  const cart = useCart(store.slug);
  const theme = store.brandSettings?.palette ?? store.brandSettings?.themeTokens ?? {};
  const accent = theme.accent ?? theme.ctaBg ?? "#1B7B6A";
  const ink = theme.ink ?? theme.heroBg ?? "#0B262C";
  const paper = theme.paperBg ?? "#FAF7F1";

  return (
    <main style={{ minHeight: "100vh", background: paper, color: ink, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <nav style={{ background: "#fff", borderBottom: "1px solid rgba(11,38,44,.12)" }}>
        <div style={{ maxWidth: 980, margin: "0 auto", height: 64, padding: "0 22px", display: "flex", alignItems: "center" }}>
          <Link href={`/store/${store.slug}`} style={{ color: ink, fontWeight: 800, textDecoration: "none" }}>{store.name}</Link>
          <span style={{ marginLeft: 10, color: "rgba(11,38,44,.45)", fontSize: 13 }}>/ Cart</span>
        </div>
      </nav>

      <section style={{ maxWidth: 980, margin: "0 auto", padding: "42px 22px 70px" }}>
        <h1 style={{ margin: "0 0 22px", fontSize: 34 }}>Your cart</h1>
        {!cart.loaded ? (
          <div style={{ background: "#fff", borderRadius: 14, padding: 28 }}>Loading cart...</div>
        ) : cart.items.length === 0 ? (
          <div style={{ background: "#fff", border: "1px solid rgba(11,38,44,.12)", borderRadius: 14, padding: 42, textAlign: "center" }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>Your cart is empty</h2>
            <p style={{ margin: "0 auto 20px", maxWidth: 420, color: "rgba(11,38,44,.62)", lineHeight: 1.6 }}>
              Add a product to your cart and come back here to review your order.
            </p>
            <Link href={`/store/${store.slug}`} style={{ display: "inline-block", background: accent, color: "#fff", borderRadius: 8, padding: "12px 18px", fontWeight: 800, textDecoration: "none" }}>
              Continue shopping
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
            <div style={{ display: "grid", gap: 12 }}>
              {cart.items.map((item) => (
                <div key={item.productId} style={{ display: "grid", gridTemplateColumns: "86px 1fr auto", gap: 14, alignItems: "center", background: "#fff", border: "1px solid rgba(11,38,44,.10)", borderRadius: 12, padding: 12 }}>
                  <div style={{ width: 86, height: 86, borderRadius: 10, overflow: "hidden", background: "rgba(11,38,44,.06)" }}>
                    {item.image ? <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>{item.name}</div>
                    <div style={{ fontSize: 13, color: "rgba(11,38,44,.62)" }}>{store.currency} {item.price.toLocaleString()} each</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                      <button type="button" onClick={() => cart.update(item.productId, item.quantity - 1)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(11,38,44,.14)", background: "#fff" }}>-</button>
                      <span style={{ minWidth: 24, textAlign: "center", fontWeight: 800 }}>{item.quantity}</span>
                      <button type="button" onClick={() => cart.update(item.productId, item.quantity + 1)} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(11,38,44,.14)", background: "#fff" }}>+</button>
                      <button type="button" onClick={() => cart.remove(item.productId)} style={{ border: "none", background: "none", color: "#B44435", fontWeight: 700, marginLeft: 8 }}>Remove</button>
                    </div>
                  </div>
                  <div style={{ fontWeight: 900 }}>{store.currency} {(item.price * item.quantity).toLocaleString()}</div>
                </div>
              ))}
            </div>

            <aside style={{ background: "#fff", border: "1px solid rgba(11,38,44,.10)", borderRadius: 14, padding: 18, position: "sticky", top: 18 }}>
              <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 14 }}>Summary</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 10 }}>
                <span>Subtotal</span>
                <strong>{store.currency} {cart.subtotal.toLocaleString()}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "rgba(11,38,44,.62)", marginBottom: 18 }}>
                <span>Delivery</span>
                <span>Calculated at checkout</span>
              </div>
              <Link href={`/store/${store.slug}/checkout`} style={{ display: "block", background: accent, color: "#fff", borderRadius: 10, padding: "13px 16px", textAlign: "center", fontWeight: 900, textDecoration: "none" }}>
                Proceed to checkout
              </Link>
              <Link href={`/store/${store.slug}`} style={{ display: "block", marginTop: 10, textAlign: "center", color: accent, fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
                Continue shopping
              </Link>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
