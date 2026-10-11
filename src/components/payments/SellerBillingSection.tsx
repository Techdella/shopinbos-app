"use client";

import { useState, useTransition } from "react";
import { PaystackCheckoutButton } from "./PaystackCheckout";
import { upgradeSellerToGrowth, upgradeSellerToMax } from "@/app/actions/payments";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/app-ui/cx";

interface SellerBillingSectionProps {
  userEmail: string;
  userName: string;
  aiCredits: number;
  productCount?: number;
}

const PLANS = [
  {
    key: "starter",
    label: "Starter",
    monthlyPrice: "Free",
    annualPrice: "Free",
    priceSub: "",
    annualNote: "",
    creditThreshold: 0,
    features: ["5 AI credits to get started", "Up to 10 store products", "Marketplace access", "Community support"],
    monthlyPlan: null,
    annualPlan: null,
  },
  {
    key: "growth",
    label: "Growth",
    monthlyPrice: "₦8,000",
    annualPrice: "₦80,000",
    priceSub: "/month",
    annualNote: "₦6,667/mo · 2 months free",
    creditThreshold: 50,
    features: ["50 AI credits/month", "Up to 200 store products", "Analytics dashboard", "Email support"],
    monthlyPlan: "PLN_8ou289e71czicvm",
    annualPlan: "PLN_q1k3ssxpx7rxxuz",
  },
  {
    key: "pro",
    label: "Seller Pro",
    monthlyPrice: "₦18,000",
    annualPrice: "₦180,000",
    priceSub: "/month",
    annualNote: "₦15,000/mo · 2 months free",
    creditThreshold: 200,
    features: ["200 AI credits/month", "Unlimited products", "Custom domain included", "Priority support"],
    monthlyPlan: "PLN_2gph11w3yd0250y",
    annualPlan: "PLN_9gma70ofldhbj4r",
  },
] as const;

export function SellerBillingSection({ userEmail, userName, aiCredits, productCount = 0 }: SellerBillingSectionProps) {
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
        toast("Upgraded to Growth plan!", "success");
        setTimeout(() => { window.location.reload(); }, 1500);
      } else {
        toast(res.error ?? "Failed to verify payment", "error");
      }
    });
  };

  const handleProSuccess = (reference: string) => {
    startTransition(async () => {
      const res = await upgradeSellerToMax(reference);
      if (res.success) {
        toast("Upgraded to Seller Pro!", "success");
        setTimeout(() => { window.location.reload(); }, 1500);
      } else {
        toast(res.error ?? "Failed to verify payment", "error");
      }
    });
  };

  const upgradeBase = "inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-5 text-[14px] font-extrabold text-white transition disabled:opacity-55";

  return (
    <div className="grid gap-5">
      <section className="rounded-[22px] border border-app-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="m-0 text-[17px] font-extrabold">Plan and billing</h2>
            <p className="mb-0 mt-0.5 text-[13px] text-app-ink-soft">All prices in naira. Cancel any time.</p>
          </div>
          <div role="tablist" aria-label="Billing period" className="flex rounded-full bg-app-canvas p-1">
            {(["monthly", "annual"] as const).map((b) => (
              <button
                key={b}
                type="button"
                role="tab"
                aria-selected={billing === b}
                onClick={() => setBilling(b)}
                className={cx("min-h-[40px] rounded-full px-4 text-[13.5px] font-bold capitalize transition", billing === b ? "bg-app-ink text-white" : "text-app-ink hover:bg-white")}
              >{b}{b === "annual" ? " · save 17%" : ""}</button>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            const planCode = billing === "annual" ? plan.annualPlan : plan.monthlyPlan;
            const displayPrice = billing === "annual" ? plan.annualPrice : plan.monthlyPrice;
            const displaySub = billing === "annual" ? "/year" : plan.priceSub;

            return (
              <div key={plan.key} className={cx("flex min-w-0 flex-col rounded-[18px] border-2 p-4", isCurrent ? "border-app-ink" : "border-app-line")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-extrabold">{plan.label}</span>
                  {isCurrent ? (
                    <span className="rounded-full bg-app-ink px-2.5 py-1 text-[12px] font-bold text-white">Your plan</span>
                  ) : plan.key === "pro" ? (
                    <span className="rounded-full bg-app-peach px-2.5 py-1 text-[12px] font-bold text-app-accent-ink">Best value</span>
                  ) : null}
                </div>
                <div className="mt-2 text-[24px] font-extrabold tracking-[-0.4px]">
                  {displayPrice}
                  <span className="text-[13px] font-medium text-app-ink-soft">{displaySub}</span>
                </div>
                {billing === "annual" && plan.annualNote && <div className="mt-0.5 text-[12.5px] font-bold text-app-success">{plan.annualNote}</div>}
                <ul className="m-0 mt-3 grid list-none gap-1.5 p-0 text-[13.5px] text-app-ink-soft">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2"><span aria-hidden className="text-app-success">✓</span>{f}</li>
                  ))}
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
                      label={isPending ? "Upgrading..." : "Upgrade"}
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
                      label={isPending ? "Upgrading..." : "Upgrade to Pro"}
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
          <div className="text-[13px] text-app-ink-soft">AI credits left</div>
          <div className="mt-1 text-[26px] font-extrabold leading-none">{aiCredits}</div>
        </div>
        <div className="min-w-0 rounded-[16px] bg-app-canvas px-4 py-3">
          <div className="text-[13px] text-app-ink-soft">Products</div>
          <div className="mt-1 text-[26px] font-extrabold leading-none">
            {productCount}
            <span className="ml-1 text-[14px] font-medium text-app-ink-soft">/ {currentPlan === "pro" ? "∞" : currentPlan === "growth" ? "200" : "10"}</span>
          </div>
        </div>
        <div className="min-w-0 rounded-[16px] bg-app-canvas px-4 py-3">
          <div className="text-[13px] text-app-ink-soft">Plan</div>
          <div className="mt-1 text-[20px] font-extrabold capitalize leading-tight">{currentPlan}</div>
        </div>
      </section>
    </div>
  );
}
