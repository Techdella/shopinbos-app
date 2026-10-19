"use client";

import { useTransition } from "react";
import { PaystackCheckoutButton } from "./PaystackCheckout";
import { upgradeUserToSupplierMax } from "@/app/actions/payments";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { AppBillingNotice } from "@/components/billing/AppBillingNotice";
import { useAppSession } from "@/components/billing/useAppSession";
import type { PlanOfferView } from "@shared/plan-catalog";

interface PlanUpgradeSectionProps {
  userEmail: string;
  userName: string;
  /** The plan tier marker (User.aiCredits): picks Free or Supplier Max. Not a balance. */
  aiCredits: number;
  /** The AI credits the supplier actually spends (welcome, plan and bought credits). */
  creditBalance: number;
  productCount?: number;
  /** Today's Supplier Max price, plan code and monthly credits (Admin › Pricing › Plans). */
  offer: PlanOfferView;
}

/** Hidden on pages the phone app opened (app store rules; see src/lib/app-session.ts). */
export function PlanUpgradeSection(props: PlanUpgradeSectionProps) {
  const inApp = useAppSession();
  return inApp ? <AppBillingNotice /> : <PlanUpgradeSectionInner {...props} />;
}

function PlanUpgradeSectionInner({ userEmail, userName, aiCredits, creditBalance, productCount = 0, offer }: PlanUpgradeSectionProps) {
  const t = useT("payments", "account");
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
        toast(t("sm.updated"), "success");
        setTimeout(() => { window.location.reload(); }, 1500);
      } else {
        toast(res.error ?? t("bill.verifyFailed"), "error");
      }
    });
  };

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>{t("sm.title")}</div>

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
            {!isSupplierMax ? t("sm.current") : t("sm.freePlan")}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-900)" }}>
            {t("plan.free")}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-600)" }}>
            {t("sm.free50")}
          </div>
          <ul style={{ fontSize: 12.5, color: "var(--ink-600)", paddingLeft: 16, marginTop: 10, lineHeight: 1.8 }}>
            <li>{t("sm.f1")}</li>
            <li>{t("sm.f2")}</li>
            <li>{t("sm.f3")}</li>
            <li>{t("plan.starter.f1")}</li>
            <li>{t("plan.starter.f4")}</li>
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
              {t("sm.popular")}
            </div>
          )}
          <div style={{
            fontSize: 11, color: isSupplierMax ? "var(--teal-700)" : "var(--ink-500)",
            fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
          }}>
            {isSupplierMax ? t("sm.current") : "Supplier Max"}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-900)" }}>
            {offer.monthly ? `₦${offer.monthly.amountNgn.toLocaleString("en-NG")}` : "—"}<span style={{ fontSize: 13, fontWeight: 400, color: "var(--ink-500)" }}>{t("plan.perMonth")}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-600)" }}>
            {isSupplierMax ? t("sm.active") : t("plan.pro.f2")}
          </div>
          <ul style={{ fontSize: 12.5, color: "var(--ink-600)", paddingLeft: 16, marginTop: 10, lineHeight: 1.8 }}>
            <li>{t("plan.pro.f2")}</li>
            <li>{t("sm.f5")}</li>
            <li>{t("sm.f6")}</li>
            <li>{t("sm.credits", { count: offer.creditsPerMonth })}</li>
            <li>{t("plan.pro.f4")}</li>
          </ul>

          {!isSupplierMax && offer.monthly && (
            <div style={{ marginTop: 12 }}>
              <PaystackCheckoutButton
                plan={offer.monthly.code}
                email={userEmail}
                firstName={firstName}
                lastName={lastName}
                metadata={{ plan: "supplier_max" }}
                onSuccess={handleUpgradeSuccess}
                className="dbtn dBtn-mint"
                label={isPending ? t("bill.upgrading") : t("sm.upgrade")}
                disabled={isPending}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        <div className="card" style={{ padding: 14, background: "var(--ink-50)" }}>
          <div style={{ fontSize: 10.5, color: "var(--ink-500)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
            {t("sm.productsUsed")}
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
            {t("store.credits")}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-accent)" }}>{creditBalance}</span>
            <a href="/supplier/credits" style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-900)", textDecoration: "underline" }}>{t("cr.topUp")}</a>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.5, marginTop: 12 }}>
        {t("sm.note")}
      </div>
    </div>
  );
}