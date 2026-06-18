"use client";

import { useState, useTransition } from "react";
import { PaystackCheckoutButton } from "./PaystackCheckout";
import { upgradeSellerToGrowth, upgradeSellerToMax } from "@/app/actions/payments";
import { useToast } from "@/components/ui/Toast";

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Billing & plan</div>
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2 }}>All prices in NGN. Cancel anytime.</div>
          </div>
          {/* Monthly / Annual toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, background: "var(--ink-100)", borderRadius: 999, padding: 3 }}>
            {(["monthly", "annual"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBilling(b)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  border: "none",
                  cursor: "pointer",
                  background: billing === b ? "white" : "transparent",
                  color: billing === b ? "var(--ink-900)" : "var(--ink-500)",
                  boxShadow: billing === b ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                  transition: "all 0.15s",
                  textTransform: "capitalize",
                }}
              >{b}{b === "annual" ? " · save 17%" : ""}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            const planCode = billing === "annual" ? plan.annualPlan : plan.monthlyPlan;
            const displayPrice = billing === "annual" ? plan.annualPrice : plan.monthlyPrice;
            const displaySub = billing === "annual" ? "/year" : plan.priceSub;

            return (
              <div
                key={plan.key}
                className="card"
                style={{
                  padding: 16,
                  background: isCurrent ? "var(--teal-50)" : "var(--ink-50)",
                  border: isCurrent ? "1.5px solid var(--teal-400)" : "1px solid var(--ink-100)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {plan.key === "pro" && !isCurrent && (
                  <div style={{
                    position: "absolute", top: 10, right: -28,
                    background: "var(--teal-600)", color: "white",
                    padding: "2px 30px", fontSize: 9, fontWeight: 700,
                    textTransform: "uppercase", transform: "rotate(45deg)",
                    letterSpacing: "0.06em",
                  }}>
                    Best
                  </div>
                )}
                <div style={{
                  fontSize: 10, color: isCurrent ? "var(--teal-700)" : "var(--ink-500)",
                  fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
                }}>
                  {isCurrent ? "Current plan" : plan.label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink-900)" }}>
                  {displayPrice}
                  <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-500)" }}>{displaySub}</span>
                </div>
                {billing === "annual" && plan.annualNote && (
                  <div style={{ fontSize: 10.5, color: "var(--teal-700)", fontWeight: 600, marginTop: 2 }}>
                    {plan.annualNote}
                  </div>
                )}
                <ul style={{ fontSize: 11.5, color: "var(--ink-600)", paddingLeft: 14, marginTop: 10, lineHeight: 1.9, marginBottom: isCurrent || plan.key === "starter" ? 0 : 12 }}>
                  {plan.features.map((f) => <li key={f}>{f}</li>)}
                </ul>
                {!isCurrent && plan.key === "growth" && planCode && (
                  <PaystackCheckoutButton
                    plan={planCode}
                    email={userEmail}
                    firstName={firstName}
                    lastName={lastName}
                    metadata={{ plan: `seller_growth_${billing}` }}
                    onSuccess={handleGrowthSuccess}
                    className="dbtn dBtn-mint"
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
                    className="dbtn dBtn-mint"
                    label={isPending ? "Upgrading..." : "Upgrade to Pro"}
                    disabled={isPending}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div style={{ background: "var(--ink-50)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, color: "var(--ink-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>AI credits left</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>{aiCredits}</div>
          </div>
          <div style={{ background: "var(--ink-50)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, color: "var(--ink-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Products</div>
            <div style={{ fontSize: 26, fontWeight: 700 }}>
              {productCount}
              <span style={{ fontSize: 13, fontWeight: 400, color: "var(--ink-400)", marginLeft: 4 }}>
                / {currentPlan === "pro" ? "∞" : currentPlan === "growth" ? "200" : "10"}
              </span>
            </div>
          </div>
          <div style={{ background: "var(--ink-50)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10, color: "var(--ink-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Plan</div>
            <div style={{ fontSize: 16, fontWeight: 700, textTransform: "capitalize" }}>{currentPlan}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
