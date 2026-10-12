"use client";

import { useTransition } from "react";
import { PaystackCheckoutButton } from "./PaystackCheckout";
import { upgradeUserToSupplierMax } from "@/app/actions/payments";
import { useToast } from "@/components/ui/Toast";

interface PlanUpgradeSectionProps {
  userEmail: string;
  userName: string;
  aiCredits: number;
  productCount?: number;
}

export function PlanUpgradeSection({ userEmail, userName, aiCredits, productCount = 0 }: PlanUpgradeSectionProps) {
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const isSupplierMax = aiCredits >= 100;
  const nameParts = userName.split(" ");
  const firstName = nameParts[0] ?? "";
  const lastName = nameParts.slice(1).join(" ") ?? "";

  const handleUpgradeSuccess = (reference: string) => {
    startTransition(async () => {
      const res = await upgradeUserToSupplierMax(reference);
      if (res.success) {
        toast("Subscription updated to Supplier Max!", "success");
        setTimeout(() => { window.location.reload(); }, 1500);
      } else {
        toast(res.error ?? "Failed to verify payment", "error");
      }
    });
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Billing & plan</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div
          className="card"
          style={{
            padding: 16,
            background: !isSupplierMax ? "var(--teal-50)" : "var(--ink-50)",
            border: !isSupplierMax ? "1px solid var(--teal-200)" : "1px solid var(--ink-100)",
          }}
        >
          <div style={{
            fontSize: 11, color: !isSupplierMax ? "var(--teal-700)" : "var(--ink-500)",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
          }}>
            {!isSupplierMax ? "Current plan" : "Free plan"}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-900)" }}>
            Free
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-600)" }}>
            Free · up to 50 products
          </div>
          <ul style={{ fontSize: 12.5, color: "var(--ink-600)", paddingLeft: 16, marginTop: 10, lineHeight: 1.8 }}>
            <li>Up to 50 products listed</li>
            <li>Basic supplier profile</li>
            <li>Quote request management</li>
            <li>Community support</li>
          </ul>
        </div>

        <div
          className="card"
          style={{
            padding: 16,
            background: isSupplierMax ? "var(--teal-50)" : "var(--ink-50)",
            border: isSupplierMax ? "1px solid var(--teal-200)" : "1px solid var(--ink-100)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {!isSupplierMax && (
            <div style={{
              position: "absolute", top: 10, right: -30,
              background: "var(--teal-600)", color: "white",
              padding: "3px 32px", fontSize: 10, fontWeight: 700,
              textTransform: "uppercase", transform: "rotate(45deg)",
              letterSpacing: "0.06em",
            }}>
              Popular
            </div>
          )}
          <div style={{
            fontSize: 11, color: isSupplierMax ? "var(--teal-700)" : "var(--ink-500)",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
          }}>
            {isSupplierMax ? "Current plan" : "Supplier Max"}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-900)" }}>
            ₦25,000<span style={{ fontSize: 13, fontWeight: 400, color: "var(--ink-500)" }}>/month</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-600)" }}>
            {isSupplierMax ? "Active" : "Unlimited products"}
          </div>
          <ul style={{ fontSize: 12.5, color: "var(--ink-600)", paddingLeft: 16, marginTop: 10, lineHeight: 1.8 }}>
            <li>Unlimited products</li>
            <li>Priority marketplace placement</li>
            <li>More detail on how your shop is doing</li>
            <li>Priority support</li>
          </ul>

          {!isSupplierMax && (
            <div style={{ marginTop: 12 }}>
              <PaystackCheckoutButton
                plan="PLN_q78304vgj7p35o6"
                email={userEmail}
                firstName={firstName}
                lastName={lastName}
                metadata={{ plan: "supplier_max" }}
                onSuccess={handleUpgradeSuccess}
                className="dbtn dBtn-mint"
                label={isPending ? "Upgrading..." : "Upgrade to Supplier Max"}
                disabled={isPending}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div className="card" style={{ padding: 14, background: "var(--ink-50)" }}>
          <div style={{ fontSize: 10.5, color: "var(--ink-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
            Products used
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-accent)" }}>
            {productCount}
            <span style={{ fontSize: 14, fontWeight: 400, color: "var(--ink-400)", marginLeft: 4 }}>
              / {isSupplierMax ? "∞" : "50"}
            </span>
          </div>
        </div>
        <div className="card" style={{ padding: 14, background: "var(--ink-50)" }}>
          <div style={{ fontSize: 10.5, color: "var(--ink-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
            AI credits
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-accent)" }}>
            {aiCredits}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.5, marginTop: 12 }}>
        All prices are in Nigerian Naira (NGN). Subscriptions renew monthly. Cancel anytime from your settings.
      </div>
    </div>
  );
}