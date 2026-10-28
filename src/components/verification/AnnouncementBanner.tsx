"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";

interface AnnouncementBannerProps {
  role: "supplier" | "logistics_partner";
  verificationStatus: string;
  displayName?: string;
}

const VERIFYING_PATHS = ["/logistics/verification", "/supplier/verification", "/supplier/onboarding"];

export function AnnouncementBanner({ role, verificationStatus, displayName }: AnnouncementBannerProps) {
  const t = useT("verification");
  const pathname = usePathname() ?? "";
  if (verificationStatus === "verified" || verificationStatus === "suspended") return null;
  // Not on the screens where they are already verifying: the banner only points back to them.
  if (VERIFYING_PATHS.some((path) => pathname.startsWith(path))) return null;

  const isSupplier = role === "supplier";
  const label = isSupplier ? t("banner.supplier") : t("banner.logistics");
  const verificationLink = isSupplier ? "/supplier/verification" : "/logistics/verification";

  return (
    <div
      style={{
        background: "linear-gradient(90deg, #FEF3C7, #FDE68A)",
        borderBottom: "1px solid #F59E0B40",
        padding: "10px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        flexWrap: "wrap",
        fontSize: 13,
        color: "#92400E",
      }}
    >
      <Icon name="warn" size={16} color="#D97706" />
      <span>
        <strong>{t("banner.profile", { name: displayName ?? label })}</strong> — {t("banner.notPublic")}
        {verificationStatus === "unverified" && ` ${t("banner.unverified")}`}
        {verificationStatus === "pending" && ` ${t("banner.pending")}`}
        {verificationStatus === "rejected" && ` ${t("banner.rejected")}`}
      </span>
      <Link
        href={verificationLink}
        style={{
          background: "#92400E",
          color: "white",
          border: "none",
          borderRadius: 8,
          padding: "4px 12px",
          fontSize: 12,
          fontWeight: 600,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {t("banner.view")}
      </Link>
    </div>
  );
}
