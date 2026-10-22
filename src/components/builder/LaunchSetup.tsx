"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FieldLabel, Mascot, Notice, PillButton, TextInput, cx } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import type { StoreConfig } from "@/lib/ai/store-types";
import type { PreviewVariant } from "./StorePreview";
import { useT } from "@/components/i18n/I18nProvider";
import { BankLinkingModal } from "@/components/payments/BankLinkingModal";
import { myWalletBankAction } from "@/app/actions/wallet";

interface LaunchSetupProps {
  storeName: string;
  storeSlug: string;
  customDomain: string | null;
  storeConfig: StoreConfig;
  layoutVariant: PreviewVariant;
  onDone: () => void;
}

type PaymentProvider = "paystack" | "bank";
type ShippingOption = "self" | "logistics" | "flat";

export function LaunchSetup({
  storeName,
  storeSlug,
  customDomain,
  storeConfig,
  layoutVariant,
  onDone,
}: LaunchSetupProps) {
  const t = useT("builder");
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider | null>(null);
  const [shippingOption, setShippingOption] = useState<ShippingOption | null>(null);
  // The payout bank is looked up and saved through the same dialog as the Money page (it also sets up the wallet
  // that lets customers pay by card), so bank transfer and card payments work as soon as the store is live.
  const [payoutBank, setPayoutBank] = useState<{ bankName: string; accountName: string } | null>(null);
  const [bankOpen, setBankOpen] = useState(false);
  const [flatRate, setFlatRate] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [liveSlug, setLiveSlug] = useState<string | null>(null);

  const storeOrigin = buildStorefrontOrigin({ slug: liveSlug ?? storeSlug, customDomain });
  const storeUrl = storeOrigin.replace(/^https?:\/\//, "");

  const payoutHelp = useMemo(() => {
    if (paymentProvider === "bank") {
      return t("ls.help.bank");
    }
    if (paymentProvider === "paystack") {
      return t("ls.help.online");
    }
    return "";
  }, [paymentProvider, t]);

  const refreshPayoutBank = () => void myWalletBankAction().then(setPayoutBank).catch(() => undefined);
  useEffect(refreshPayoutBank, []);

  const payoutReady = !!paymentProvider && payoutBank !== null;

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
            },
            shippingConfig: {
              option: shippingOption,
              flatRate: shippingOption === "flat" && flatRate ? parseFloat(flatRate) : null,
            },
          },
        }),
      });
      if (!response.ok) throw new Error(t("ls.err.settings"));
      setSettingsSaved(true);

      // 2. Publish the draft.
      await publish();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t("ls.err.launch"));
    } finally {
      setIsSaving(false);
    }
  }

  async function publish() {
    const response = await fetch("/api/store/editor/publish", { method: "POST" });
    const json = (await response.json().catch(() => null)) as {
      error?: { message?: string; blockers?: string[] };
    } | null;
    if (!response.ok) {
      setBlockers(json?.error?.blockers ?? []);
      throw new Error(json?.error?.message ?? t("ls.err.publish"));
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
      setSaveError(error instanceof Error ? error.message : t("ls.err.publish"));
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
          <p className="m-0 text-[14px] font-bold text-app-success">{t("ls.live")}</p>
          <h2 className="m-0 mt-1.5 text-[26px] font-extrabold leading-[1.15] tracking-[-0.5px]">{t("ls.ready", { store: storeName })}</h2>
          <p className="mb-0 mt-2 break-all text-[14.5px] text-app-ink-soft">
            {(() => {
              const [before, after = ""] = t("ls.visit", { url: "\u0001" }).split("\u0001");
              return <>{before}<strong className="text-app-ink">{storeUrl}</strong>{after}</>;
            })()}
          </p>
        </div>

        <div className="flex w-full max-w-[360px] flex-col gap-2">
          <a
            href={storeOrigin}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-app-ink text-[15px] font-extrabold text-white no-underline hover:bg-black"
          >
            <Icon name="eye" size={16} /> {t("ls.view")}
          </a>
          <PillButton size="md" tone="white" onClick={onDone}>{t("ls.goStore")}</PillButton>
        </div>

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {[
            { label: t("ls.link.rex"), href: "/studio" },
            { label: t("ls.link.products"), href: "/products" },
            { label: t("ls.link.orders"), href: "/home/orders" },
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
          {t("ls.intro")}
        </p>
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-3 p-0 text-[15px] font-extrabold">{t("ls.howPay")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { id: "paystack" as const, label: t("ls.online"), desc: t("ls.paystack.desc"), icon: "card" as IconName },
            { id: "bank" as const, label: t("ls.bank"), desc: t("ls.bank.desc"), icon: "bank" as IconName },
          ].map((provider) => (
            <ChoiceCard key={provider.id} active={paymentProvider === provider.id} onClick={() => setPaymentProvider(provider.id)} icon={provider.icon} label={provider.label} desc={provider.desc} />
          ))}
        </div>

        {paymentProvider && (
          <div className="mt-4 rounded-[18px] bg-app-canvas p-4">
            <h3 className="m-0 text-[14.5px] font-extrabold">{t("ls.wherePayouts")}</h3>
            <p className="mb-0 mt-1 text-[13px] leading-[1.5] text-app-ink-soft">{payoutHelp}</p>
            {payoutBank ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[14px] bg-white p-3">
                <Icon name="bank" size={18} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-extrabold">{payoutBank.accountName}</span>
                  <span className="block truncate text-[13px] text-app-ink-soft">{payoutBank.bankName}</span>
                </span>
                <PillButton size="sm" tone="white" onClick={() => setBankOpen(true)}>{t("ls.changeBank")}</PillButton>
              </div>
            ) : (
              <PillButton size="md" tone="ink" className="mt-4" onClick={() => setBankOpen(true)}>
                <Icon name="plus" size={16} /> {t("ls.addBank")}
              </PillButton>
            )}
            <BankLinkingModal isOpen={bankOpen} onClose={() => setBankOpen(false)} onSuccess={refreshPayoutBank} role="seller" initialBankName={payoutBank?.bankName ?? ""} />
          </div>
        )}
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-3 p-0 text-[15px] font-extrabold">{t("ls.howDeliver")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            { id: "self" as const, label: t("ls.self"), desc: t("ls.self.desc"), icon: "user" as IconName },
            { id: "logistics" as const, label: t("ls.partner"), desc: t("ls.partner.desc"), icon: "truck" as IconName },
            { id: "flat" as const, label: t("ls.flat"), desc: t("ls.flat.desc"), icon: "coin" as IconName },
          ].map((option) => (
            <ChoiceCard key={option.id} active={shippingOption === option.id} onClick={() => setShippingOption(option.id)} icon={option.icon} label={option.label} desc={option.desc} />
          ))}
        </div>

        {shippingOption === "flat" && (
          <div className="mt-3 max-w-[360px]">
            <FieldLabel htmlFor="flat-rate">{t("ls.flatFee")}</FieldLabel>
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-bold text-app-ink-soft" aria-hidden>₦</span>
              <TextInput id="flat-rate" inputMode="numeric" value={flatRate} onChange={(event) => setFlatRate(event.target.value.replace(/\D/g, ""))} placeholder="1500" className="h-[48px] text-[15px]" />
            </div>
          </div>
        )}
      </fieldset>


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

      {settingsSaved && !saved && !saveError && !isSaving && (
        <Notice tone="info">{t("ls.savedNotice")}</Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <PillButton
          size="md"
          tone="accent"
          busy={isSaving}
          onClick={settingsSaved ? retryPublish : handleSave}
          disabled={!paymentProvider || !shippingOption || !payoutReady}
        >
          {settingsSaved ? t("ls.publish") : t("ls.savePublish")}
        </PillButton>
        <button type="button" onClick={onDone} className="min-h-[44px] px-2 text-[14px] font-bold text-app-ink-soft hover:text-app-ink">
          {t("ls.later")}
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
