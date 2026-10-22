"use client";

import { useState, useTransition } from "react";
import { PaystackCheckoutButton } from "./PaystackCheckout";
import { subscribeToPlan } from "@/app/actions/payments";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/app-ui/cx";
import { useT } from "@/components/i18n/I18nProvider";
import { AppBillingNotice } from "@/components/billing/AppBillingNotice";
import { useAppSession } from "@/components/billing/useAppSession";
import { PLAN_TIERS, annualSaving, isPlanTier, type PlanOfferView, type PlanTier } from "@shared/plan-catalog";
import { PLANS_BY_ROLE, planFeatureLines, type PlanKey, type PlanRole } from "@shared/plans";

// The plan cards for sellers, suppliers and delivery partners: what each plan includes (shared/plans.ts), today's
// prices (Admin › Pricing › Plans), monthly or yearly, and the Paystack checkout for the ones above the current plan.

export interface PlanPickerProps {
  role: PlanRole;
  current: PlanKey;
  offers: Record<PlanTier, PlanOfferView>;
  userEmail: string;
  userName: string;
  /** Usage shown under the cards, e.g. { label: "Products", used: 12, limit: 20 }. */
  usage?: Array<{ label: string; used: number; limit: number | null }>;
  creditBalance: number;
  creditsHref: string;
}

const naira = (amount: number) => `₦${amount.toLocaleString("en-NG")}`;

/** Hidden on pages the phone app opened (app store rules; see src/lib/app-session.ts). */
export function PlanPicker(props: PlanPickerProps) {
  const inApp = useAppSession();
  return inApp ? <AppBillingNotice /> : <PlanPickerInner {...props} />;
}

function PlanPickerInner({ role, current, offers, userEmail, userName, usage = [], creditBalance, creditsHref }: PlanPickerProps) {
  const t = useT("payments");
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const plans = PLANS_BY_ROLE[role];
  const currentIndex = plans.indexOf(current);
  const [firstName = "", ...rest] = userName.split(" ");

  function paid(tier: PlanTier) {
    return (reference: string) =>
      startTransition(async () => {
        const result = await subscribeToPlan(reference, tier);
        if (result.success) {
          toast(t("plans.upgraded"), "success");
          window.setTimeout(() => window.location.reload(), 1500);
        } else {
          toast(result.error ?? t("bill.verifyFailed"), "error");
        }
      });
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-[22px] border border-app-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 text-[17px] font-extrabold">{t("bill.title")}</h2>
            <p className="mb-0 mt-0.5 text-[13px] text-app-ink-soft">{t("plans.sub")}</p>
          </div>
          <div role="tablist" aria-label={t("bill.period")} className="flex rounded-full bg-app-canvas p-1">
            {(["monthly", "annual"] as const).map((b) => (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={billing === b}
                onClick={() => setBilling(b)}
                className={cx("min-h-[40px] rounded-full px-4 text-[13.5px] font-bold transition", billing === b ? "bg-app-ink text-white" : "text-app-ink hover:bg-white")}
              >
                {b === "annual" ? t("plans.yearly") : t("bill.monthly")}
              </button>
            ))}
          </div>
        </div>

        <div className={cx("mt-4 grid gap-3", plans.length === 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3")}>
          {plans.map((key, index) => {
            const tier = isPlanTier(key) ? key : null;
            const offer = tier ? offers[tier] : null;
            const sold = offer ? (billing === "annual" ? offer.annual : offer.monthly) : null;
            const saving = offer?.monthly && offer.annual ? annualSaving(offer.monthly.amountNgn, offer.annual.amountNgn) : null;
            const isCurrent = key === current;
            const higher = index > currentIndex;
            return (
              <div key={key} className={cx("flex min-w-0 flex-col rounded-[18px] border-2 p-4", isCurrent ? "border-app-ink" : "border-app-line")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-extrabold">{t.dynamic(`plans.name.${key}`, key)}</span>
                  {isCurrent ? (
                    <span className="rounded-full bg-app-ink px-2.5 py-1 text-[12px] font-bold text-white">{t("bill.yourPlan")}</span>
                  ) : index === plans.length - 2 && tier ? (
                    <span className="rounded-full bg-app-peach px-2.5 py-1 text-[12px] font-bold text-app-accent-ink">{t("plans.popular")}</span>
                  ) : null}
                </div>
                <div className="mt-2 text-[24px] font-extrabold tracking-[-0.4px]">
                  {tier ? (sold ? naira(sold.amountNgn) : "—") : t("plan.free")}
                  {tier ? <span className="text-[13px] font-medium text-app-ink-soft">{billing === "annual" ? t("plan.perYear") : t("plan.perMonth")}</span> : null}
                </div>
                {tier && billing === "annual" && saving ? (
                  <div className="mt-0.5 text-[12.5px] font-bold text-app-success">{t("plans.saving", { perMonth: naira(saving.perMonth), months: saving.months })}</div>
                ) : null}
                <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[13px] leading-[1.4]">
                  {planFeatureLines(key).map((line) => (
                    <li key={line.id} className={cx("flex gap-2", line.included ? "text-app-ink-soft" : "text-app-ink-faint")}>
                      <span aria-hidden className={line.included ? "text-app-success" : ""}>{line.included ? "✓" : "–"}</span>
                      <span className={line.included ? "" : "line-through"}>
                        {t.dynamic(`plans.f.${role}.${line.id}`, line.id, line.values)}
                      </span>
                    </li>
                  ))}
                  {tier && billing === "annual" && offer?.annual && PLAN_TIERS[tier].freeDomainAnnual ? (
                    <li className="flex gap-2 font-bold text-app-ink"><span aria-hidden className="text-app-success">✓</span>{t("plan.freeDomain")}</li>
                  ) : null}
                </ul>
                <div className="mt-auto pt-4">
                  {tier && higher && sold ? (
                    <PaystackCheckoutButton
                      plan={sold.code}
                      email={userEmail}
                      firstName={firstName}
                      lastName={rest.join(" ")}
                      metadata={{ plan: `${tier}_${billing}` }}
                      onSuccess={paid(tier)}
                      className={cx(
                        "inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-5 text-[14px] font-extrabold text-white transition disabled:opacity-55",
                        index === plans.length - 1 ? "bg-app-accent hover:brightness-95" : "bg-app-ink hover:bg-black",
                      )}
                      label={pending ? t("bill.upgrading") : t("plans.choose", { name: t.dynamic(`plans.name.${key}`, key) })}
                      disabled={pending}
                    />
                  ) : !isCurrent && !higher ? (
                    <p className="m-0 text-[12.5px] text-app-ink-faint">{t("plans.downgrade")}</p>
                  ) : null}
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
            <a href={creditsHref} className="text-[13px] font-bold text-app-ink underline underline-offset-2">{t("cr.topUp")}</a>
          </div>
        </div>
        {usage.map((row) => (
          <div key={row.label} className="min-w-0 rounded-[16px] bg-app-canvas px-4 py-3">
            <div className="text-[13px] text-app-ink-soft">{row.label}</div>
            <div className="mt-1 text-[26px] font-extrabold leading-none">
              {row.used}
              <span className="ml-1 text-[14px] font-medium text-app-ink-soft">/ {row.limit === null ? "∞" : row.limit}</span>
            </div>
          </div>
        ))}
        <div className="min-w-0 rounded-[16px] bg-app-canvas px-4 py-3">
          <div className="text-[13px] text-app-ink-soft">{t("bill.plan")}</div>
          <div className="mt-1 text-[20px] font-extrabold leading-tight">{t.dynamic(`plans.name.${current}`, current)}</div>
        </div>
      </section>
    </div>
  );
}
