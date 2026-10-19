"use client";

import { useState, useTransition } from "react";
import { PaystackCheckoutButton } from "./PaystackCheckout";
import { upgradeSellerToGrowth, upgradeSellerToMax } from "@/app/actions/payments";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/app-ui/cx";
import { useT } from "@/components/i18n/I18nProvider";
import { annualSaving, type PlanOfferView } from "@shared/plan-catalog";

interface SellerBillingSectionProps {
  userEmail: string;
  userName: string;
  /** The plan tier marker (User.aiCredits): picks the current plan. Not a balance. */
  aiCredits: number;
  /** The AI credits Rex and Peggy actually spend (AiCreditAccount.balance). */
  creditBalance: number;
  productCount?: number;
  /** Today's Growth and Pro prices, plan codes and monthly credits (Admin › Pricing › Plans). */
  offers: { growth: PlanOfferView; pro: PlanOfferView };
}

const naira = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;

const PLANS = [
  {
    key: "starter",
    label: "Starter",
    creditThreshold: 0,
    features: ["5 AI credits to get started", "Up to 10 store products", "Marketplace access", "Community support"],
  },
  {
    key: "growth",
    label: "Growth",
    creditThreshold: 50,
    features: ["50 AI credits/month", "Up to 200 store products", "Analytics dashboard", "Email support"],
  },
  {
    key: "pro",
    label: "Seller Pro",
    creditThreshold: 200,
    features: ["200 AI credits/month", "Unlimited products", "Use your own domain", "Priority support"],
  },
] as const;

export function SellerBillingSection({ userEmail, userName, aiCredits, creditBalance, productCount = 0, offers }: SellerBillingSectionProps) {
  const t = useT("payments");
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const currentPlan = aiCredits >= 200 ? "pro" : aiCredits >= 50 ? "growth" : "starter";

  const nameParts = userName.split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") ?? "";

  const handleGrowthSuccess = (reference: string) => {
    startTransition(async () => {
      const res = await upgradeSellerToGrowth(reference);
      if (res.success) {
        toast(t("bill.upgradedGrowth"), "success");
        setTimeout(() => { window.location.reload(); }, 1500);
      } else {
        toast(res.error ?? t("bill.verifyFailed"), "error");
      }
    });
  };

  const handleProSuccess = (reference: string) => {
    startTransition(async () => {
      const res = await upgradeSellerToMax(reference);
      if (res.success) {
        toast(t("bill.upgradedPro"), "success");
        setTimeout(() => { window.location.reload(); }, 1500);
      } else {
        toast(res.error ?? t("bill.verifyFailed"), "error");
      }
    });
  };

  const upgradeBase = "inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-5 text-[14px] font-extrabold text-white transition disabled:opacity-55";

  return (
    <div className="grid gap-5">
      <section className="rounded-[22px] border border-app-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 text-[17px] font-extrabold">{t("bill.title")}</h2>
            <p className="mb-0 mt-0.5 text-[13px] text-app-ink-soft">{t("bill.sub")}</p>
          </div>
          <div role="tablist" aria-label={t("bill.period")} className="flex rounded-full bg-app-canvas p-1">
            {(["monthly", "annual"] as const).map((b) => (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={billing === b}
                onClick={() => setBilling(b)}
                className={cx("min-h-[40px] rounded-full px-4 text-[13.5px] font-bold capitalize transition", billing === b ? "bg-app-ink text-white" : "text-app-ink hover:bg-white")}
              >{b === "annual" ? t("bill.annual") : t("bill.monthly")}</button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            const offer = plan.key === "starter" ? null : offers[plan.key];
            const sold = offer ? (billing === "annual" ? offer.annual : offer.monthly) : null;
            const planCode = sold?.code ?? null;
            const displayPrice = offer ? (sold ? naira(sold.amountNgn) : "—") : t("plan.free");
            const saving = offer?.monthly && offer.annual ? annualSaving(offer.monthly.amountNgn, offer.annual.amountNgn) : null;
            const displaySub = !offer ? "" : billing === "annual" ? t("plan.perYear") : t("plan.perMonth");

            return (
              <div key={plan.key} className={cx("flex min-w-0 flex-col rounded-[18px] border-2 p-4", isCurrent ? "border-app-ink" : "border-app-line")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-extrabold">{t(`plan.${plan.key}`)}</span>
                  {isCurrent ? (
                    <span className="rounded-full bg-app-ink px-2.5 py-1 text-[12px] font-bold text-white">{t("bill.yourPlan")}</span>
                  ) : plan.key === "pro" ? (
                    <span className="rounded-full bg-app-peach px-2.5 py-1 text-[12px] font-bold text-app-accent-ink">{t("bill.bestValue")}</span>
                  ) : null}
                </div>
                <div className="mt-2 text-[24px] font-extrabold tracking-[-0.4px]">
                  {displayPrice}
                  <span className="text-[13px] font-medium text-app-ink-soft">{displaySub}</span>
                </div>
                {billing === "annual" && saving && (
                  <div className="mt-0.5 text-[12.5px] font-bold text-app-success">
                    {t(plan.key === "growth" ? "plan.growthNote" : "plan.proNote", { perMonth: naira(saving.perMonth), months: saving.months })}
                  </div>
                )}
                <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[13.5px] text-app-ink-soft">
                  {plan.features.map((f, index) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden className="text-app-success">✓</span>
                      {offer && index === 0 ? t(plan.key === "growth" ? "plan.growth.f1" : "plan.pro.f1", { count: offer.creditsPerMonth }) : t.dynamic(`plan.${plan.key}.f${index + 1}`, f)}
                    </li>
                  ))}
                  {/* Any paid plan lets the seller turn the "Built with Shopinbos" badge off in the store editor (src/lib/store-badges.ts). */}
                  {offer && (
                    <li className="flex gap-2"><span aria-hidden className="text-app-success">✓</span>{t("plan.noBadge")}</li>
                  )}
                  {/* Annual Growth and Pro pay for the seller's domain (src/lib/seller-plan.ts); monthly plans don't. */}
                  {billing === "annual" && offer?.annual && (
                    <li className="flex gap-2 font-bold text-app-ink"><span aria-hidden className="text-app-success">✓</span>{t("plan.freeDomain")}</li>
                  )}
                </ul>
                <div className="mt-auto pt-4">
                  {!isCurrent && plan.key === "growth" && planCode && (
                    <PaystackCheckoutButton
                      plan={planCode}
                      email={userEmail}
                      firstName={firstName}
                      lastName={lastName}
                      metadata={{ plan: `seller_growth_${billing}` }}
                      onSuccess={handleGrowthSuccess}
                      className={cx(upgradeBase, "bg-app-ink hover:bg-black")}
                      label={isPending ? t("bill.upgrading") : t("bill.upgrade")}
                      disabled={isPending}
                    />
                  )}
                  {!isCurrent && plan.key === "pro" && planCode && (
                    <PaystackCheckoutButton
                      plan={planCode}
                      email={userEmail}
                      firstName={firstName}
                      lastName={lastName}
                      metadata={{ plan: `seller_pro_${billing}` }}
                      onSuccess={handleProSuccess}
                      className={cx(upgradeBase, "bg-app-accent hover:brightness-95")}
                      label={isPending ? t("bill.upgrading") : t("bill.upgradePro")}
                      disabled={isPending}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 rounded-[22px] border border-app-line bg-white p-2 sm:grid-cols-3">
        <div className="min-w-0 rounded-[16px] bg-app-canvas px-4 py-3">
          <div className="text-[13px] text-app-ink-soft">{t("bill.creditsLeft")}</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-[26px] font-extrabold leading-none">{creditBalance}</span>
            <a href="/home/credits" className="text-[13px] font-bold text-app-ink underline underline-offset-2">{t("cr.topUp")}</a>
          </div>
        </div>
        <div className="min-w-0 rounded-[16px] bg-app-canvas px-4 py-3">
          <div className="text-[13px] text-app-ink-soft">{t("bill.products")}</div>
          <div className="mt-1 text-[26px] font-extrabold leading-none">
            {productCount}
            <span className="ml-1 text-[14px] font-medium text-app-ink-soft">/ {currentPlan === "pro" ? "∞" : currentPlan === "growth" ? "200" : "10"}</span>
          </div>
        </div>
        <div className="min-w-0 rounded-[16px] bg-app-canvas px-4 py-3">
          <div className="text-[13px] text-app-ink-soft">{t("bill.plan")}</div>
          <div className="mt-1 text-[20px] font-extrabold capitalize leading-tight">{t(`plan.${currentPlan}`)}</div>
        </div>
      </section>
    </div>
  );
}
