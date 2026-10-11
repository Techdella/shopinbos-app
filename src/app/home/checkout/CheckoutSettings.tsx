"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { PillButton, Spinner, Toggle, cx } from "@/components/app-ui";

const LAYOUTS: ReadonlyArray<{ id: string; label: string; icon: IconName; desc: string }> = [
  { id: "single_page", label: "One page", icon: "grid", desc: "Every step on one page" },
  { id: "multi_step", label: "Step by step", icon: "list", desc: "A guided flow, one step at a time" },
  { id: "accordion", label: "Fold-out", icon: "chevron", desc: "Sections that open one by one" },
  { id: "minimal", label: "Minimal", icon: "target", desc: "Clean, nothing to distract" },
  { id: "express", label: "Express", icon: "bolt", desc: "Fast checkout in one tap" },
  { id: "mobile", label: "Phone first", icon: "phone", desc: "Made for small screens" },
];

const ALL_MODULES: ReadonlyArray<{ id: string; label: string; icon: IconName }> = [
  { id: "customer_details", label: "Customer details", icon: "user" },
  { id: "shipping_address", label: "Delivery address", icon: "pin" },
  { id: "delivery_method", label: "Delivery method", icon: "truck" },
  { id: "pickup_point", label: "Pickup point", icon: "store" },
  { id: "coupon", label: "Coupon", icon: "tag" },
  { id: "discount", label: "Discount", icon: "coin" },
  { id: "gift_notes", label: "Gift note", icon: "heart" },
  { id: "order_notes", label: "Order note", icon: "document" },
  { id: "payment_method", label: "Payment method", icon: "card" },
  { id: "order_summary", label: "Order summary", icon: "bag" },
  { id: "upsells", label: "Upsells", icon: "sparkle" },
  { id: "trust_badges", label: "Trust badges", icon: "shield" },
];

const TOGGLES = [
  { key: "requirePhone", label: "Ask for a phone number", desc: "Shoppers must give a phone number to check out" },
  { key: "enableNotes", label: "Order notes", desc: "Let shoppers add a note to their order" },
  { key: "enableGiftNote", label: "Gift notes", desc: "Allow gift messages and gift wrapping" },
  { key: "enableCoupon", label: "Coupons", desc: "Show a coupon code box at checkout" },
  { key: "enableUpsells", label: "Upsells", desc: "Suggest extra products at checkout" },
  { key: "enableTrustBadges", label: "Trust badges", desc: "Show secure payment and trust badges" },
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

export function CheckoutSettings() {
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
      <div className="flex items-center justify-center gap-3 rounded-[22px] border border-app-line bg-white py-16 text-[14px] text-app-ink-soft" role="status">
        <Spinner /> Loading checkout settings
      </div>
    );
  }

  const orderedModules = config.moduleOrder
    .filter((id) => config.enabledModules.includes(id))
    .map((id) => ALL_MODULES.find((m) => m.id === id))
    .filter((m): m is (typeof ALL_MODULES)[number] => Boolean(m));

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid min-w-0 content-start gap-5">
          <section className="rounded-[22px] border border-app-line bg-white p-5">
            <h2 className="m-0 text-[17px] font-extrabold">Layout</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6" role="radiogroup" aria-label="Checkout layout">
              {LAYOUTS.map((l) => {
                const on = config.layout === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setLayout(l.id)}
                    className={cx("flex min-w-0 flex-col items-start gap-2 rounded-[18px] border-2 p-4 text-left transition", on ? "border-app-ink bg-app-canvas" : "border-app-line bg-white hover:border-app-line-strong")}
                  >
                    <span className={cx("grid h-9 w-9 place-items-center rounded-full", on ? "bg-app-ink text-white" : "bg-app-canvas text-app-ink")}>
                      <Icon name={l.icon} size={17} />
                    </span>
                    <span className="text-[14px] font-extrabold">{l.label}</span>
                    <span className="text-[12.5px] leading-[1.4] text-app-ink-soft">{l.desc}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[22px] border border-app-line bg-white p-5">
            <h2 className="m-0 text-[17px] font-extrabold">What shoppers see</h2>
            <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">Tap to turn a section on or off.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {ALL_MODULES.map((m) => {
                const enabled = config.enabledModules.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={enabled}
                    onClick={() => toggleModule(m.id)}
                    className={cx(
                      "inline-flex min-h-[40px] items-center gap-2 rounded-full border px-4 text-[14px] font-bold transition",
                      enabled ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
                    )}
                  >
                    <Icon name={enabled ? "check" : m.icon} size={14} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[22px] border border-app-line bg-white p-5">
            <h2 className="m-0 text-[17px] font-extrabold">Options</h2>
            <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
              {TOGGLES.map((t) => {
                const value = config[t.key];
                return (
                  <li key={t.key} className="flex items-center gap-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-bold">{t.label}</div>
                      <div className="text-[13px] text-app-ink-soft">{t.desc}</div>
                    </div>
                    <Toggle on={value} onChange={(on) => setToggle(t.key, on)} label={t.label} />
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="grid min-w-0 content-start gap-5">
          <section className="overflow-hidden rounded-[22px] border border-app-line bg-white">
            <div className="px-5 pb-3 pt-5">
              <h2 className="m-0 text-[17px] font-extrabold">Order of steps</h2>
              <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">{orderedModules.length} on</p>
            </div>
            {orderedModules.length === 0 ? (
              <p className="m-0 border-t border-app-line px-5 py-8 text-center text-[14px] text-app-ink-soft">Nothing turned on yet. Pick sections on the left.</p>
            ) : (
              <ol className="m-0 list-none divide-y divide-app-line border-t border-app-line p-0">
                {orderedModules.map((m, i) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-6 text-[13px] font-bold text-app-ink-soft">{i + 1}</span>
                    <Icon name={m.icon} size={16} className="shrink-0 text-app-ink-soft" />
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{m.label}</span>
                    <button
                      type="button"
                      onClick={() => moveModule(m.id, "up")}
                      disabled={i === 0}
                      aria-label={`Move ${m.label} up`}
                      className="grid h-10 w-10 place-items-center rounded-full text-app-ink hover:bg-app-canvas disabled:opacity-30"
                    >
                      <Icon name="arrowUp" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveModule(m.id, "down")}
                      disabled={i === orderedModules.length - 1}
                      aria-label={`Move ${m.label} down`}
                      className="grid h-10 w-10 place-items-center rounded-full text-app-ink hover:bg-app-canvas disabled:opacity-30"
                    >
                      <Icon name="arrowDown" size={15} />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <PillButton tone="accent" size="md" onClick={() => void save()} busy={saving} className="w-full">
            <Icon name="check" size={16} /> Save checkout
          </PillButton>
        </aside>
      </div>
    </div>
  );
}
