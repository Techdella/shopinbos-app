"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

interface AnnouncementBannerProps {
  role: "supplier" | "logistics_partner";
  verificationStatus: string;
  displayName?: string;
}

export function AnnouncementBanner({ role, verificationStatus, displayName }: AnnouncementBannerProps) {
  if (verificationStatus === "verified" || verificationStatus === "suspended") return null;

  const isSupplier = role === "supplier";
  const label = isSupplier ? "Supplier" : "Logistics";
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
        <strong>{displayName ?? label} Profile</strong> — Your profile will not appear publicly until ShopinBos verification is completed.
        {verificationStatus === "unverified" && " Upload your documents to start the verification process."}
        {verificationStatus === "pending" && " Your documents are under review by the ShopinBos team."}
        {verificationStatus === "rejected" && " Your verification was not approved. Please update and resubmit."}
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
        View verification status
      </Link>
    </div>
  );
}
