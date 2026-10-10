"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

const LAYOUTS = [
  { id: "single_page", label: "Single Page", icon: "grid", desc: "All steps on one page" },
  { id: "multi_step", label: "Multi Step", icon: "list", desc: "Step-by-step guided flow" },
  { id: "accordion", label: "Accordion", icon: "chevron", desc: "Expandable sections" },
  { id: "minimal", label: "Minimal", icon: "target", desc: "Clean, distraction-free" },
  { id: "express", label: "Express", icon: "bolt", desc: "One-click fast checkout" },
  { id: "mobile", label: "Mobile", icon: "phone", desc: "Mobile-optimized layout" },
] as const;

const ALL_MODULES = [
  { id: "customer_details", label: "Customer Details", icon: "user" },
  { id: "shipping_address", label: "Shipping Address", icon: "pin" },
  { id: "delivery_method", label: "Delivery Method", icon: "truck" },
  { id: "pickup_point", label: "Pickup Point", icon: "store" },
  { id: "coupon", label: "Coupon", icon: "tag" },
  { id: "discount", label: "Discount", icon: "coin" },
  { id: "gift_notes", label: "Gift Notes", icon: "heart" },
  { id: "order_notes", label: "Order Notes", icon: "document" },
  { id: "payment_method", label: "Payment Method", icon: "card" },
  { id: "order_summary", label: "Order Summary", icon: "bag" },
  { id: "upsells", label: "Upsells", icon: "sparkle" },
  { id: "trust_badges", label: "Trust Badges", icon: "shield" },
] as const;

const TOGGLES = [
  { key: "requirePhone", label: "Require Phone", desc: "Require customer phone number at checkout" },
  { key: "enableNotes", label: "Enable Order Notes", desc: "Let customers add notes to their order" },
  { key: "enableGiftNote", label: "Enable Gift Notes", desc: "Allow gift messages and gift wrapping" },
  { key: "enableCoupon", label: "Enable Coupons", desc: "Show coupon code field during checkout" },
  { key: "enableUpsells", label: "Enable Upsells", desc: "Offer upsell products on the checkout page" },
  { key: "enableTrustBadges", label: "Enable Trust Badges", desc: "Show security & trust badges" },
] as const;

interface CheckoutConfig {
  layout: string;
  enabledModules: string[];
  moduleOrder: string[];
  requirePhone: boolean;
  enableNotes: boolean;
  enableGiftNote: boolean;
  enableCoupon: boolean;
  enableUpsells: boolean;
  enableTrustBadges: boolean;
  upsellProducts: string[];
}

export default function CheckoutPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<CheckoutConfig>({
    layout: "multi_step",
    enabledModules: ["customer_details", "shipping_address", "delivery_method", "payment_method", "order_summary"],
    moduleOrder: ["customer_details", "shipping_address", "delivery_method", "coupon", "order_notes", "payment_method", "order_summary"],
    requirePhone: false,
    enableNotes: true,
    enableGiftNote: false,
    enableCoupon: true,
    enableUpsells: false,
    enableTrustBadges: true,
    upsellProducts: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/store/checkout");
        if (res.ok) {
          const data = await res.json();
          if (data.data) setConfig(data.data);
        }
      } catch {
        toast("Could not load checkout configuration", "error");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [toast]);

  const setLayout = useCallback((layout: string) => {
    setConfig((prev) => ({ ...prev, layout }));
  }, []);

  const toggleModule = useCallback((moduleId: string) => {
    setConfig((prev) => {
      const enabled = prev.enabledModules.includes(moduleId)
        ? prev.enabledModules.filter((m) => m !== moduleId)
        : [...prev.enabledModules, moduleId];
      const order = prev.moduleOrder.filter((m) => m !== moduleId);
      const added = ALL_MODULES.filter((m) => enabled.includes(m.id));
      const ordered = [...order, ...added.map((a) => a.id).filter((id) => !order.includes(id))];
      return { ...prev, enabledModules: enabled, moduleOrder: ordered };
    });
  }, []);

  const moveModule = useCallback((moduleId: string, direction: "up" | "down") => {
    setConfig((prev) => {
      const order = [...prev.moduleOrder];
      const idx = order.indexOf(moduleId);
      if (idx === -1) return prev;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= order.length) return prev;
      [order[idx], order[target]] = [order[target], order[idx]];
      return { ...prev, moduleOrder: order };
    });
  }, []);

  const setToggle = useCallback((key: string, value: boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/store/checkout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast("Checkout configuration saved", "success");
      } else {
        toast("Failed to save configuration", "error");
      }
    } catch {
      toast("Could not save configuration", "error");
    } finally {
      setSaving(false);
    }
  }, [config, toast]);

  if (loading) {
    return (
      <AppFrame role="seller" storeName="Your Store">
        <div style={{ padding: "24px 28px 40px" }}>
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-sec)" }}>Loading...</div>
        </div>
      </AppFrame>
    );
  }

  const orderedModules = config.moduleOrder
    .filter((id) => config.enabledModules.includes(id))
    .map((id) => ALL_MODULES.find((m) => m.id === id))
    .filter(Boolean);

  return (
    <AppFrame role="seller" storeName="Your Store">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 24 }}>

        <PageHead
          title="Checkout"
          sub="Customize your checkout experience"
          actions={
            <button onClick={() => void save()} disabled={saving}
              className="dbtn dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}>
              <Icon name="check" size={14} /> {saving ? "Saving..." : "Save"}
            </button>
          }
        />

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Layout</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {LAYOUTS.map((l) => (
              <button key={l.id} onClick={() => setLayout(l.id)}
                style={{
                  all: "unset", cursor: "pointer", padding: "14px 12px",
                  borderRadius: 10, border: config.layout === l.id ? "2px solid var(--mint)" : "2px solid var(--border)",
                  background: config.layout === l.id ? "var(--mint-bg)" : "var(--card-bg)",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  transition: "all 0.15s", fontFamily: "inherit",
                }}>
                <Icon name={l.icon} size={22} color={config.layout === l.id ? "var(--mint)" : "var(--text-sec)"} />
                <span style={{ fontSize: 13, fontWeight: 600, color: config.layout === l.id ? "var(--mint)" : "var(--text)" }}>{l.label}</span>
                <span style={{ fontSize: 11, color: "var(--text-sec)", textAlign: "center", lineHeight: 1.3 }}>{l.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Modules</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {ALL_MODULES.map((m) => {
              const enabled = config.enabledModules.includes(m.id);
              return (
                <button key={m.id} onClick={() => toggleModule(m.id)}
                  style={{
                    all: "unset", cursor: "pointer", fontFamily: "inherit",
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 500,
                    border: enabled ? "1px solid var(--mint)" : "1px solid var(--border)",
                    background: enabled ? "var(--mint-bg)" : "transparent",
                    color: enabled ? "var(--mint)" : "var(--text-sec)",
                    transition: "all 0.15s",
                  }}>
                  <Icon name={m.icon} size={13} color={enabled ? "var(--mint)" : "var(--text-sec)"} />
                  {m.label}
                </button>
              );
            })}
          </div>

          <h4 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "var(--text-sec)" }}>
            Module Order ({orderedModules.length} enabled)
          </h4>
          {orderedModules.length === 0 ? (
            <div style={{ padding: "16px 0", fontSize: 13, color: "var(--text-sec)", textAlign: "center" }}>
              No modules enabled. Toggle modules above to add them.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {orderedModules.map((m, i) => (
                <div key={m!.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", borderRadius: 8,
                  background: "var(--card-bg)", border: "1px solid var(--border)",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-sec)", minWidth: 20 }}>#{i + 1}</span>
                  <Icon name={m!.icon} size={15} color="var(--text-sec)" />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{m!.label}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => moveModule(m!.id, "up")} disabled={i === 0}
                      className="dbtn dBtn-ghost dBtn-sm"
                      style={{ border: "none", cursor: "pointer", fontFamily: "inherit", opacity: i === 0 ? 0.3 : 1 }}>
                      <Icon name="arrowUp" size={13} />
                    </button>
                    <button onClick={() => moveModule(m!.id, "down")} disabled={i === orderedModules.length - 1}
                      className="dbtn dBtn-ghost dBtn-sm"
                      style={{ border: "none", cursor: "pointer", fontFamily: "inherit", opacity: i === orderedModules.length - 1 ? 0.3 : 1 }}>
                      <Icon name="arrowDown" size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Options</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {TOGGLES.map((t) => {
              const value = config[t.key as keyof CheckoutConfig] as boolean;
              return (
                <label key={t.key} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0", cursor: "pointer", fontFamily: "inherit",
                  borderBottom: "1px solid var(--border)",
                }}>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text)" }}>{t.label}</span>
                    <span style={{ fontSize: 12, color: "var(--text-sec)" }}>{t.desc}</span>
                  </div>
                  <div onClick={() => setToggle(t.key, !value)} style={{
                    width: 42, height: 24, borderRadius: 12,
                    background: value ? "var(--mint)" : "var(--border)",
                    position: "relative", transition: "background 0.2s", flexShrink: 0,
                    cursor: "pointer",
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%",
                      background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                      position: "absolute", top: 2,
                      left: value ? 20 : 2, transition: "left 0.2s",
                    }} />
                  </div>
                </label>
              );
            })}
          </div>
        </div>

      </div>
    </AppFrame>
  );
}
