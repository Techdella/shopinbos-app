"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { intlLocale } from "@shared/i18n";

interface VerificationBadgeProps {
  tier: string;
  trustScore: number;
  verificationStatus: string;
  details?: { label: string; value: string }[];
  reviewedAt?: string;
  size?: "sm" | "md" | "lg";
}

const tierConfig: Record<string, { label: string; color: string; icon: string }> = {
  platinum: { label: "Premium Verified Partner", color: "#8B5CF6", icon: "star" },
  gold: { label: "Trusted Supplier", color: "#F59E0B", icon: "check" },
  silver: { label: "Verified Business", color: "#94A3B8", icon: "check" },
  bronze: { label: "Verified", color: "#D97706", icon: "check" },
  none: { label: "Unverified", color: "#9CA3AF", icon: "lock" },
};

export function VerificationBadge({ tier, trustScore, verificationStatus, details, reviewedAt, size = "md" }: VerificationBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const t = useT("verification");
  const locale = useLocale();
  const tierKey = tierConfig[tier] ? tier : "none";
  const cfg = { ...tierConfig[tierKey], label: t.dynamic(`badge.tier.${tierKey}`, tierConfig[tierKey].label) };
  const isVerified = verificationStatus === "verified";

  const sizeMap = { sm: 18, md: 22, lg: 28 };
  const fontSizeMap = { sm: 11, md: 13, lg: 15 };
  const iconSize = sizeMap[size];

  if (!isVerified) {
    return (
      <span
        style={{ fontSize: fontSizeMap[size], color: cfg.color, display: "inline-flex", alignItems: "center", gap: 4, cursor: "default" }}
        title={t("badge.notYetVerified")}
      >
        <Icon name="lock" size={iconSize} /> {t("badge.tier.none")}
      </span>
    );
  }

  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <span
        onClick={() => setShowTooltip(!showTooltip)}
        style={{
          fontSize: fontSizeMap[size],
          color: cfg.color,
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
          borderBottom: `2px solid ${cfg.color}20`,
        }}
      >
        <Icon name="check" size={iconSize} /> {cfg.label}
      </span>
      {showTooltip && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 50,
            background: "white",
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            padding: 16,
            minWidth: 260,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            fontSize: 12.5,
          }}
          onClick={() => setShowTooltip(false)}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: cfg.color }}>
            <Icon name="check" size={16} /> {cfg.label}
          </div>
          {details?.map((d) => (
            <div key={d.label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderTop: "1px solid #F3F4F6" }}>
              <span style={{ color: "#6B7280" }}>{d.label}</span>
              <span style={{ fontWeight: 600 }}>{d.value}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderTop: "1px solid #F3F4F6", marginTop: 4 }}>
            <span style={{ color: "#6B7280" }}>{t("badge.trustScore")}</span>
            <span style={{ fontWeight: 700 }}>{trustScore}/100</span>
          </div>
          {reviewedAt && (
            <div style={{ color: "#9CA3AF", fontSize: 11, marginTop: 8 }}>
              {t("badge.lastReviewed", { date: new Date(reviewedAt).toLocaleDateString(locale === "en" ? "en-US" : intlLocale(locale), { month: "long", year: "numeric" }) })}
            </div>
          )}
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #F3F4F6" }}>
            <div style={{ height: 4, background: "#E5E7EB", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ width: `${trustScore}%`, height: "100%", background: cfg.color, borderRadius: 999 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
