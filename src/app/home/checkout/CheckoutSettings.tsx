"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, Toggle, cx } from "@/components/app-ui";
import type { CheckoutSettings as Settings } from "@shared/cart-checkout";

// Only settings the storefront checkout honours: each toggle changes what shoppers see or must fill in.

const TOGGLES: ReadonlyArray<{ key: keyof Omit<Settings, "upsellProducts">; label: string; desc: string }> = [
  { key: "requirePhone", label: "Ask for a phone number", desc: "Shoppers can't continue without one. Pay on delivery always asks for it." },
  { key: "enableCoupon", label: "Discount codes", desc: "Show a discount code box in the bag and at checkout. Automatic discounts still apply when this is off." },
  { key: "enableNotes", label: "Order notes", desc: "Let shoppers add a note, like a good time to deliver." },
  { key: "enableGiftNote", label: "Gift messages", desc: "Let shoppers add a gift message. It's added to the order note you see." },
  { key: "enableTrustBadges", label: "Secure checkout line", desc: "Show \"Secure checkout\" with the ways you accept payment under the order summary." },
  { key: "enableUpsells", label: "Add-ons at checkout", desc: "Offer the products you pick below on the review step, and show them first in \"You may also like\" in the bag." },
];

const STEPS = [
  { label: "Contact", desc: "Name, email and phone. No account needed." },
  { label: "Delivery", desc: "Address with Nigerian states, and your delivery options." },
  { label: "Payment", desc: "Only the ways you accept." },
  { label: "Review", desc: "Check everything, then place the order." },
];

interface ProductOption {
  id: string;
  name: string;
  image: string | null;
  price: number;
  hasOptions: boolean;
}

export function CheckoutSettings({ initial, products, paymentLabels, zoneCount }: { initial: Settings; products: ProductOption[]; paymentLabels: string[]; zoneCount: number }) {
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
          <h2 className="m-0 text-[17px] font-extrabold">What shoppers are asked</h2>
          <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0">
            {TOGGLES.map((toggle) => (
              <li key={toggle.key} className="flex items-center gap-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-bold">{toggle.label}</div>
                  <div className="text-[13px] leading-[1.45] text-app-ink-soft">{toggle.desc}</div>
                </div>
                <Toggle on={settings[toggle.key]} onChange={(on) => update(toggle.key, on)} label={toggle.label} />
              </li>
            ))}
          </ul>
        </section>

        {settings.enableUpsells ? (
          <section className="rounded-[22px] border border-app-line bg-white p-5">
            <h2 className="m-0 text-[17px] font-extrabold">Add-ons to offer</h2>
            <p className="mb-0 mt-1 text-[13.5px] text-app-ink-soft">Pick up to 6. Products with sizes or colours can't be added in one tap, so they aren't listed.</p>
            <label htmlFor="upsell-search" className="sr-only">Search your products</label>
            <input
              id="upsell-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search your products"
              className="mt-4 h-11 w-full rounded-full border border-app-line bg-app-canvas px-4 text-[14.5px] outline-none focus-visible:border-app-ink"
            />
            {matches.length === 0 ? (
              <p className="mb-0 mt-4 text-[14px] text-app-ink-soft">{products.length ? "No products match." : "Publish a product first."}</p>
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
                          <span className="block text-[12.5px] text-app-ink-soft">₦{Math.round(product.price).toLocaleString("en-NG")}</span>
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
          <h2 className="m-0 text-[17px] font-extrabold">The steps</h2>
          <ol className="m-0 mt-3 grid list-none gap-3 p-0">
            {STEPS.map((step, index) => (
              <li key={step.label} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-app-ink text-[12.5px] font-bold text-white">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-bold">{step.label}</span>
                  <span className="block text-[13px] text-app-ink-soft">{step.desc}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[17px] font-extrabold">Set elsewhere</h2>
          <ul className="m-0 mt-2 list-none divide-y divide-app-line p-0 text-[14px]">
            <li className="flex items-center gap-3 py-3">
              <Icon name="card" size={17} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Ways to pay</span>
                <span className="block text-[13px] text-app-ink-soft">{paymentLabels.join(", ")}</span>
              </span>
              <Link href="/home/payments" className="font-bold underline underline-offset-4">Change</Link>
            </li>
            <li className="flex items-center gap-3 py-3">
              <Icon name="truck" size={17} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Delivery options</span>
                <span className="block text-[13px] text-app-ink-soft">{zoneCount ? `${zoneCount} delivery ${zoneCount === 1 ? "zone" : "zones"}; each rate is an option shoppers can pick` : "No zones yet, so your flat delivery fee is used"}</span>
              </span>
              <Link href="/home/shipping" className="font-bold underline underline-offset-4">Change</Link>
            </li>
            <li className="flex items-center gap-3 py-3">
              <Icon name="tag" size={17} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Discounts</span>
                <span className="block text-[13px] text-app-ink-soft">Codes and automatic discounts</span>
              </span>
              <Link href="/home/discounts" className="font-bold underline underline-offset-4">Change</Link>
            </li>
          </ul>
        </section>

        {status === "error" ? <Notice>Couldn&apos;t save. Check your connection and try again.</Notice> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {status === "saved" ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-[14px] font-bold text-app-success"><Icon name="check" size={15} /> Saved</span>
          ) : null}
          <PillButton tone="accent" size="md" onClick={() => void save()} busy={saving} className="w-full sm:w-auto">
            Save checkout
          </PillButton>
        </div>
      </aside>
    </div>
  );
}
