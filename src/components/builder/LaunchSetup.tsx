"use client";

import { useMemo, useState } from "react";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import type { StoreConfig } from "@/lib/ai/store-types";
import type { PreviewVariant } from "./StorePreview";

interface LaunchSetupProps {
  storeName: string;
  storeSlug: string;
  customDomain: string | null;
  storeConfig: StoreConfig;
  layoutVariant: PreviewVariant;
  onDone: () => void;
}

type PaymentProvider = "paystack" | "flutterwave" | "bank";
type ShippingOption = "self" | "logistics" | "flat";

export function LaunchSetup({
  storeName,
  storeSlug,
  customDomain,
  storeConfig,
  layoutVariant,
  onDone,
}: LaunchSetupProps) {
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider | null>(null);
  const [shippingOption, setShippingOption] = useState<ShippingOption | null>(null);
  const [payoutBankName, setPayoutBankName] = useState("");
  const [payoutAccountName, setPayoutAccountName] = useState("");
  const [payoutAccountNumber, setPayoutAccountNumber] = useState("");
  const [flatRate, setFlatRate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const storeOrigin = buildStorefrontOrigin({ slug: storeSlug, customDomain });
  const storeUrl = storeOrigin.replace(/^https?:\/\//, "");

  const payoutHelp = useMemo(() => {
    if (paymentProvider === "bank") {
      return "These details can be shown for manual transfer payments at checkout.";
    }
    if (paymentProvider === "paystack") {
      return "Customers pay online. We save this bank account on your store profile for payout setup.";
    }
    if (paymentProvider === "flutterwave") {
      return "Customers pay online. We save this bank account on your store profile for payout setup.";
    }
    return "";
  }, [paymentProvider]);

  const payoutReady =
    !!paymentProvider &&
    payoutBankName.trim().length > 1 &&
    payoutAccountName.trim().length > 1 &&
    payoutAccountNumber.trim().length >= 10;

  async function handleSave() {
    if (!paymentProvider || !shippingOption || !payoutReady) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await fetch("/api/app/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: storeConfig.name,
          description: storeConfig.heroSubline,
          logoUrl: storeConfig.logoUrl ?? undefined,
          status: "active",
          brandSettings: {
            tagline: storeConfig.tagline,
            palette: storeConfig.palette,
            fontStyle: storeConfig.fontStyle,
            heroHeadline: storeConfig.heroHeadline,
            heroSubline: storeConfig.heroSubline,
            heroCtaText: storeConfig.heroCtaText,
            navLinks: storeConfig.navLinks,
            layoutVariant,
            paymentConfig: {
              provider: paymentProvider,
              payoutBankName: payoutBankName.trim(),
              payoutAccountName: payoutAccountName.trim(),
              payoutAccountNumber: payoutAccountNumber.trim(),
            },
            shippingConfig: {
              option: shippingOption,
              flatRate: shippingOption === "flat" && flatRate ? parseFloat(flatRate) : null,
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error("We could not save your launch settings right now.");
      }

      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "We could not save your launch settings right now.");
    } finally {
      setIsSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "rgb(115 216 200 / 0.15)", border: "2px solid rgb(115 216 200 / 0.3)" }}
        >
          <span className="font-mono text-[12px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--color-teal-deep)" }}>
            Live
          </span>
        </div>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--color-teal-deep)" }}>
            Your store is live
          </div>
          <h2 className="mt-2 font-display text-[28px] font-semibold tracking-[-0.03em]" style={{ color: "var(--color-navy)" }}>
            {storeName} is ready for customers.
          </h2>
          <p className="mt-2 text-[14px]" style={{ color: "var(--color-muted)" }}>
            Your store is now live at <strong className="text-[var(--color-navy)]">{storeUrl}</strong>
          </p>
        </div>

        <div className="flex w-full max-w-[340px] flex-col gap-2">
          <a
            href={storeOrigin}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-full py-3 text-[14px] font-semibold text-[var(--color-navy)]"
            style={{ background: "var(--color-mint)" }}
          >
            View my store
          </a>
          <button
            type="button"
            onClick={onDone}
            className="rounded-full border border-[rgb(14_42_56_/_0.12)] bg-white py-3 text-[14px] font-semibold text-[var(--color-navy)]"
          >
            Go to my workspace
          </button>
        </div>

        <div className="mt-2 flex gap-3">
          {[
            { label: "Add Products", href: "/products" },
            { label: "View Orders", href: "/home/orders" },
            { label: "Settings", href: "/home/settings" },
          ].map((link) => (
            <a key={link.href} href={link.href} className="text-[13px] font-semibold underline" style={{ color: "var(--color-teal-deep)" }}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        className="flex items-start gap-3 rounded-[18px] border px-4 py-4"
        style={{ background: "rgb(14 42 56 / 0.03)", borderColor: "rgb(115 216 200 / 0.2)" }}
      >
        <ChipAvatar mascot="rex" size={32} />
        <p className="text-[13px] leading-6" style={{ color: "var(--color-navy)" }}>
          Almost there! Let&apos;s set up how customers pay you, where payouts should land, and how you deliver orders.
          You can always update these later in Settings.
        </p>
      </div>

      <div>
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--color-teal-deep)" }}>
          How should customers pay you?
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { id: "paystack" as const, label: "Paystack", desc: "Customers pay online. Best for Nigeria.", icon: "Pay" },
            { id: "flutterwave" as const, label: "Flutterwave", desc: "Customers pay online across Africa.", icon: "Wave" },
            { id: "bank" as const, label: "Bank Transfer", desc: "Customers pay directly into your account.", icon: "Bank" },
          ].map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => setPaymentProvider(provider.id)}
              className="rounded-[16px] border px-4 py-4 text-left transition-all"
              style={{
                borderColor: paymentProvider === provider.id ? "var(--color-mint)" : "rgb(14 42 56 / 0.08)",
                background: paymentProvider === provider.id ? "rgb(115 216 200 / 0.06)" : "white",
              }}
            >
              <div
                className="mb-2 inline-flex rounded-full px-2 py-1 font-mono text-[10px] font-bold"
                style={{ background: "rgb(115 216 200 / 0.12)", color: "var(--color-teal-deep)" }}
              >
                {provider.icon}
              </div>
              <div className="text-[13px] font-semibold" style={{ color: "var(--color-navy)" }}>
                {provider.label}
              </div>
              <div className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                {provider.desc}
              </div>
            </button>
          ))}
        </div>

        {paymentProvider && (
          <div className="mt-4 rounded-[18px] border bg-[rgb(14_42_56_/_0.02)] p-4" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
            <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--color-teal-deep)" }}>
              Where should we send your payouts?
            </div>
            <p className="mt-2 text-[12px] leading-6" style={{ color: "var(--color-muted)" }}>
              {payoutHelp}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-[12px] font-semibold" style={{ color: "var(--color-muted)" }}>
                Bank name
                <input
                  value={payoutBankName}
                  onChange={(event) => setPayoutBankName(event.target.value)}
                  placeholder="e.g. Your bank"
                  className="w-full rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[13px] outline-none"
                  style={{ color: "var(--color-navy)" }}
                />
              </label>
              <label className="grid gap-1.5 text-[12px] font-semibold" style={{ color: "var(--color-muted)" }}>
                Account name
                <input
                  value={payoutAccountName}
                  onChange={(event) => setPayoutAccountName(event.target.value)}
                  placeholder="e.g. Ade Stores Ltd"
                  className="w-full rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[13px] outline-none"
                  style={{ color: "var(--color-navy)" }}
                />
              </label>
            </div>

            <label className="mt-3 grid gap-1.5 text-[12px] font-semibold" style={{ color: "var(--color-muted)" }}>
              Account number
              <input
                value={payoutAccountNumber}
                onChange={(event) => setPayoutAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="e.g. 0123456789"
                className="w-full rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 text-[13px] outline-none"
                style={{ color: "var(--color-navy)" }}
              />
            </label>
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: "var(--color-teal-deep)" }}>
          How will you deliver to customers?
        </div>
        <div className="grid gap-2">
          {[
            { id: "self" as const, label: "I handle delivery myself", desc: "You arrange pickups and drop-offs.", icon: "Self" },
            { id: "logistics" as const, label: "Use a logistics partner", desc: "Book couriers from our marketplace.", icon: "Partner" },
            { id: "flat" as const, label: "Flat rate per order", desc: "Charge customers one delivery fee.", icon: "Flat" },
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setShippingOption(option.id)}
              className="flex items-center gap-4 rounded-[16px] border px-4 py-3 text-left transition-all"
              style={{
                borderColor: shippingOption === option.id ? "var(--color-mint)" : "rgb(14 42 56 / 0.08)",
                background: shippingOption === option.id ? "rgb(115 216 200 / 0.05)" : "white",
              }}
            >
              <span
                className="w-14 shrink-0 rounded-full px-2 py-1 text-center font-mono text-[10px] font-bold"
                style={{ background: "rgb(115 216 200 / 0.12)", color: "var(--color-teal-deep)" }}
              >
                {option.icon}
              </span>
              <div>
                <div className="text-[13px] font-semibold" style={{ color: "var(--color-navy)" }}>
                  {option.label}
                </div>
                <div className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                  {option.desc}
                </div>
              </div>
            </button>
          ))}
        </div>

        {shippingOption === "flat" && (
          <div className="mt-3 flex items-center gap-2">
            <span className="font-mono text-[14px] font-semibold" style={{ color: "var(--color-muted)" }}>
              â‚¦
            </span>
            <input
              value={flatRate}
              onChange={(event) => setFlatRate(event.target.value.replace(/\D/g, ""))}
              placeholder="1500"
              className="w-full rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-3 font-mono text-[14px] outline-none"
              style={{ color: "var(--color-navy)" }}
            />
            <span className="whitespace-nowrap text-[13px]" style={{ color: "var(--color-muted)" }}>
              per order
            </span>
          </div>
        )}
      </div>

      {saveError && (
        <div className="rounded-[14px] border px-4 py-3 text-[12px]" style={{ borderColor: "rgb(232 106 79 / 0.3)", background: "rgb(232 106 79 / 0.08)", color: "#9F2D20" }}>
          {saveError}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !paymentProvider || !shippingOption || !payoutReady}
          className="rounded-full px-6 py-3 text-[14px] font-semibold text-[var(--color-navy)] disabled:opacity-50"
          style={{ background: "var(--color-mint)" }}
        >
          {isSaving ? "Saving..." : "Launch my store"}
        </button>
        <button type="button" onClick={onDone} className="text-[13px] text-[var(--color-muted)] underline">
          Finish later
        </button>
      </div>
    </div>
  );
}
