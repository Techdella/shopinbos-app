"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FieldLabel, Mascot, Notice, PillButton, TextInput, cx } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import type { StoreConfig } from "@/lib/ai/store-types";
import type { PreviewVariant } from "./StorePreview";
import { StoreLaunchBillingModal, type StoreLaunchPricing } from "@/components/billing/StoreLaunchBillingModal";

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
  const [blockers, setBlockers] = useState<string[]>([]);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [launchPricing, setLaunchPricing] = useState<StoreLaunchPricing | null>(null);
  const [liveSlug, setLiveSlug] = useState<string | null>(null);

  const storeOrigin = buildStorefrontOrigin({ slug: liveSlug ?? storeSlug, customDomain });
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
    setBlockers([]);

    try {
      // 1. Payment and delivery settings. The store's name and slug are left alone here.
      const response = await fetch("/api/app/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(storeConfig.logoUrl ? { logoUrl: storeConfig.logoUrl } : {}),
          brandSettings: {
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
      if (!response.ok) throw new Error("We could not save your payment and delivery settings right now.");
      setSettingsSaved(true);

      // 2. Publish the draft. The first launch needs the launch fee; the billing modal handles that.
      await publish();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "We could not save your launch settings right now.");
    } finally {
      setIsSaving(false);
    }
  }

  async function publish() {
    const response = await fetch("/api/store/editor/publish", { method: "POST" });
    const json = (await response.json().catch(() => null)) as {
      error?: { message?: string; blockers?: string[] };
      billing?: StoreLaunchPricing;
    } | null;
    if (response.status === 402 && json?.billing) {
      setLaunchPricing(json.billing);
      return;
    }
    if (!response.ok) {
      setBlockers(json?.error?.blockers ?? []);
      throw new Error(json?.error?.message ?? "Your store couldn't be published yet.");
    }
    // The live address comes from the saved store, not the preview's suggested slug.
    const editor = await fetch("/api/store/editor", { cache: "no-store" }).then((res) => (res.ok ? res.json() : null)).catch(() => null) as { data?: { store?: { slug?: string } } } | null;
    if (editor?.data?.store?.slug) setLiveSlug(editor.data.store.slug);
    setSaved(true);
  }

  async function retryPublish() {
    setIsSaving(true);
    setSaveError(null);
    setBlockers([]);
    try {
      await publish();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Your store couldn't be published yet.");
    } finally {
      setIsSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center gap-5 py-8 text-center font-app text-app-ink">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-app-success-tint text-app-success">
          <Icon name="check" size={28} />
        </span>
        <div>
          <p className="m-0 text-[14px] font-bold text-app-success">Your store is live</p>
          <h2 className="m-0 mt-1.5 text-[26px] font-extrabold leading-[1.15] tracking-[-0.5px]">{storeName} is ready for customers.</h2>
          <p className="mb-0 mt-2 break-all text-[14.5px] text-app-ink-soft">
            Shoppers can visit <strong className="text-app-ink">{storeUrl}</strong>
          </p>
        </div>

        <div className="flex w-full max-w-[360px] flex-col gap-2">
          <a
            href={storeOrigin}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-app-ink text-[15px] font-extrabold text-white no-underline hover:bg-black"
          >
            <Icon name="eye" size={16} /> View my store
          </a>
          <PillButton size="md" tone="white" onClick={onDone}>Go to Your store</PillButton>
        </div>

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {[
            { label: "Change it with Rex", href: "/studio" },
            { label: "Add products", href: "/products" },
            { label: "Orders", href: "/home/orders" },
          ].map((link) => (
            <Link key={link.href} href={link.href} className="text-[14px] font-extrabold text-app-accent-ink no-underline hover:underline">
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 font-app text-app-ink">
      <div className="flex items-start gap-3 rounded-[18px] bg-app-peach px-4 py-3.5">
        <Mascot name="rex" className="h-9 w-9 shrink-0" alt="Rex" />
        <p className="m-0 text-[14px] leading-[1.55]">
          Almost there. Choose how customers pay you, which bank we send your money to, and how you deliver, then publish. Publishing makes
          your store visible to shoppers; the first launch has a one-time launch fee.
        </p>
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-3 p-0 text-[15px] font-extrabold">How should customers pay you?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { id: "paystack" as const, label: "Paystack", desc: "Customers pay online. Best for Nigeria.", icon: "card" as IconName },
            { id: "flutterwave" as const, label: "Flutterwave", desc: "Customers pay online across Africa.", icon: "globe" as IconName },
            { id: "bank" as const, label: "Bank transfer", desc: "Customers pay straight into your account.", icon: "bank" as IconName },
          ].map((provider) => (
            <ChoiceCard key={provider.id} active={paymentProvider === provider.id} onClick={() => setPaymentProvider(provider.id)} icon={provider.icon} label={provider.label} desc={provider.desc} />
          ))}
        </div>

        {paymentProvider && (
          <div className="mt-4 rounded-[18px] bg-app-canvas p-4">
            <h3 className="m-0 text-[14.5px] font-extrabold">Which bank should we send your money to?</h3>
            <p className="mb-0 mt-1 text-[13px] leading-[1.5] text-app-ink-soft">{payoutHelp}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <FieldLabel htmlFor="payout-bank">Bank name</FieldLabel>
                <TextInput id="payout-bank" value={payoutBankName} onChange={(event) => setPayoutBankName(event.target.value)} placeholder="e.g. GTBank" className="h-[48px] text-[15px]" />
              </div>
              <div className="min-w-0">
                <FieldLabel htmlFor="payout-name">Account name</FieldLabel>
                <TextInput id="payout-name" value={payoutAccountName} onChange={(event) => setPayoutAccountName(event.target.value)} placeholder="e.g. Ade Stores Ltd" autoComplete="name" className="h-[48px] text-[15px]" />
              </div>
              <div className="min-w-0 sm:col-span-2">
                <FieldLabel htmlFor="payout-number">Account number</FieldLabel>
                <TextInput
                  id="payout-number"
                  inputMode="numeric"
                  value={payoutAccountNumber}
                  onChange={(event) => setPayoutAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 12))}
                  placeholder="e.g. 0123456789"
                  className="h-[48px] text-[15px]"
                />
              </div>
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-3 p-0 text-[15px] font-extrabold">How will you deliver?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { id: "self" as const, label: "I deliver myself", desc: "You arrange pickups and drop-offs.", icon: "user" as IconName },
            { id: "logistics" as const, label: "A delivery partner", desc: "Book riders and couriers on Shopinbos.", icon: "truck" as IconName },
            { id: "flat" as const, label: "Flat fee per order", desc: "Charge every customer one delivery fee.", icon: "coin" as IconName },
          ].map((option) => (
            <ChoiceCard key={option.id} active={shippingOption === option.id} onClick={() => setShippingOption(option.id)} icon={option.icon} label={option.label} desc={option.desc} />
          ))}
        </div>

        {shippingOption === "flat" && (
          <div className="mt-3 max-w-[360px]">
            <FieldLabel htmlFor="flat-rate">Delivery fee per order</FieldLabel>
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-bold text-app-ink-soft" aria-hidden>₦</span>
              <TextInput id="flat-rate" inputMode="numeric" value={flatRate} onChange={(event) => setFlatRate(event.target.value.replace(/\D/g, ""))} placeholder="1500" className="h-[48px] text-[15px]" />
            </div>
          </div>
        )}
      </fieldset>

      <StoreLaunchBillingModal open={Boolean(launchPricing)} pricing={launchPricing} onClose={() => setLaunchPricing(null)} />

      {saveError && (
        <Notice>
          {saveError}
          {blockers.length > 1 && (
            <ul className="mb-0 mt-2 list-disc pl-4">
              {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          )}
        </Notice>
      )}

      {settingsSaved && !saved && launchPricing === null && !saveError && !isSaving && (
        <Notice tone="info">Payment and delivery settings saved. Your store goes live once the launch fee is paid; then press &ldquo;Publish my store&rdquo; again.</Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <PillButton
          size="md"
          tone="accent"
          busy={isSaving}
          onClick={settingsSaved ? retryPublish : handleSave}
          disabled={!paymentProvider || !shippingOption || !payoutReady}
        >
          {settingsSaved ? "Publish my store" : "Save and publish my store"}
        </PillButton>
        <button type="button" onClick={onDone} className="min-h-[44px] px-2 text-[14px] font-bold text-app-ink-soft hover:text-app-ink">
          Finish later
        </button>
      </div>
    </div>
  );
}

function ChoiceCard({ active, onClick, icon, label, desc }: { active: boolean; onClick: () => void; icon: IconName; label: string; desc: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cx("flex min-h-[64px] items-start gap-3 rounded-[18px] border-2 bg-white px-4 py-3 text-left transition", active ? "border-app-ink" : "border-app-line hover:border-app-line-strong")}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-app-canvas"><Icon name={icon} size={17} /></span>
      <span className="min-w-0">
        <span className="block text-[14.5px] font-extrabold">{label}</span>
        <span className="block text-[13px] leading-[1.45] text-app-ink-soft">{desc}</span>
      </span>
    </button>
  );
}
