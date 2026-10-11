"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { Card, CardHead, PageHead } from "@/components/app-kit";
import { Notice, PillButton, Spinner } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { VerificationDocUploader } from "@/components/verification/VerificationDocUploader";
import { VerificationProgress } from "@/components/verification/VerificationProgress";
import { TrustScoreBreakdown } from "@/components/verification/TrustScoreBreakdown";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import {
  type VerificationDoc,
  type DocType,
  type TrustScoreBreakdownItem,
  logisticsDocTypes,
} from "@/lib/verification-utils";

interface PartnerData {
  id: string;
  displayName: string;
  companyName: string;
  city?: string;
  country?: string;
  verificationStatus: string;
  trustScore: number;
  reliabilityScore: number;
  slug: string;
  logoUrl?: string;
  bannerUrl?: string;
  verificationDocuments: VerificationDoc[];
}

interface UserData {
  name: string;
  email: string;
  avatarUrl?: string;
}

interface TrustData {
  items: TrustScoreBreakdownItem[];
  total: number;
  level: string;
  nextLevel: string;
  nextLevelAt: number;
}

export const dynamic = "force-dynamic";

export default function LogisticsVerificationPage() {
  const [partner, setPartner] = useState<PartnerData | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [documents, setDocuments] = useState<VerificationDoc[]>([]);
  const [trustData, setTrustData] = useState<TrustData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/logistics/me");
      if (!r.ok) throw new Error("Unable to load verification data.");
      const d = await r.json();
      const payload = d.data ?? d;
      if (!payload.partner || !payload.user) throw new Error("Details not returned.");
      setPartner(payload.partner);
      setUser(payload.user);
      setDocuments(payload.partner.verificationDocuments ?? []);
      if (payload.trustBreakdown) setTrustData(payload.trustBreakdown);
    } catch (err: any) {
      setError(err.message || "Unable to load verification.");
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpload = useCallback(async (type: DocType, file: File) => {
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("docType", type);
    try {
      const r = await fetch("/api/logistics/verification/upload", { method: "POST", body: formData });
      const result = await r.json();
      if (!result.success) { setMessage(result.error ?? "Upload failed"); return; }
      setMessage("Document uploaded successfully.");
      fetchData();
    } catch { setMessage("Upload failed."); }
  }, [fetchData]);

  const handleDelete = useCallback(async (docId: string) => {
    setMessage("");
    try {
      const r = await fetch("/api/logistics/verification/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId }),
      });
      const result = await r.json();
      if (!result.success) { setMessage(result.error ?? "Delete failed"); return; }
      setMessage("Document removed.");
      fetchData();
    } catch { setMessage("Delete failed."); }
  }, [fetchData]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setMessage("");
    try {
      const r = await fetch("/api/logistics/verification/submit", { method: "POST" });
      const result = await r.json();
      if (!result.success) { setMessage(result.error ?? "Submit failed"); setSubmitting(false); return; }
      setMessage("Verification submitted for review.");
      fetchData();
    } catch { setMessage("Submit failed."); }
    finally { setSubmitting(false); }
  }, [fetchData]);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-app-canvas p-6 font-app">
        <div className="w-full max-w-[420px]"><Notice tone="error">{error}</Notice></div>
      </div>
    );
  }

  if (!partner || !user) {
    return (
      <div className="grid min-h-dvh place-items-center bg-app-canvas font-app text-app-ink-soft" role="status">
        <span className="flex items-center gap-2 text-[14.5px]"><Spinner /> Loading verification</span>
      </div>
    );
  }

  const isVerified = partner.verificationStatus === "verified";
  const isPending = partner.verificationStatus === "pending";

  const progressSteps = [
    { label: "Account setup", done: true },
    { label: "Business profile", done: Boolean(partner.companyName && partner.city) },
    { label: "Documents uploaded", done: documents.some((d) => d.status === "uploaded" || d.status === "submitted") },
    { label: "Verification submitted", done: isPending || isVerified },
    { label: "Shopinbos review", done: isPending || isVerified },
    { label: "Verification approved", done: isVerified },
  ];

  const badgeTier = isVerified
    ? trustData?.level.toLowerCase().includes("platinum") ? "platinum"
      : trustData?.level.toLowerCase().includes("gold") ? "gold"
      : trustData?.level.toLowerCase().includes("silver") ? "silver"
      : "bronze"
    : "none";

  const failed = /fail|error/i.test(message);

  return (
    <AppFrame
      role="logistics_partner"
      storeName={partner.displayName}
      storeSlug={partner.city ? `${partner.city} · Partner` : "Delivery partner"}
      storeInitial={partner.displayName.charAt(0).toUpperCase()}
      storeLogoUrl={partner.logoUrl ?? null}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
      verificationStatus={partner.verificationStatus}
    >
      <div className="w-full px-4 py-6 font-app text-app-ink sm:px-6 xl:px-8 2xl:px-10">
        <PageHead
          title="Verification"
          sub="Shopinbos checks your business papers before sellers can book you. It usually takes a day or two."
          actions={
            isVerified && trustData ? (
              <VerificationBadge tier={badgeTier} trustScore={trustData.total} verificationStatus={partner.verificationStatus} size="md" />
            ) : undefined
          }
        />

        {message && <div className="mb-4"><Notice tone={failed ? "error" : "success"}>{message}</Notice></div>}

        <Card className={`mb-5 flex flex-wrap items-center gap-4 border-0 p-5 ${isVerified ? "bg-app-success-tint" : "bg-[#FDF0D5]"}`}>
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-white ${isVerified ? "bg-app-success" : "bg-[#F2A93B]"}`}>
            <Icon name={isVerified ? "check" : "clock"} size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[18px] font-extrabold">
              {isVerified ? "You're verified" : isPending ? "We're checking your papers" : "Not verified yet"}
            </h2>
            <p className="m-0 mt-0.5 text-[14px] text-app-ink-soft">
              {isVerified
                ? `Trust score ${trustData?.total ?? partner.reliabilityScore} out of 100.`
                : isPending
                  ? "The Shopinbos team is reviewing your documents. We'll let you know when it's done."
                  : "Upload the documents below, then send them for review."}
            </p>
          </div>
        </Card>

        <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
          <Card className="min-w-0 p-5">
            <CardHead title="Your documents" />
            <div className="mt-4">
              <VerificationDocUploader
                role="logistics_partner"
                docs={documents}
                docConfigs={logisticsDocTypes}
                onUpload={handleUpload}
                onDelete={handleDelete}
                readOnly={isVerified}
              />
            </div>
            {!isVerified && !isPending && (
              <PillButton size="md" className="mt-4 w-full" onClick={handleSubmit} busy={submitting}>
                Send for review
              </PillButton>
            )}
          </Card>

          <div className="grid min-w-0 content-start gap-5">
            <VerificationProgress steps={progressSteps} />
            {trustData && (
              <Card className="p-5">
                <CardHead title="Trust score" />
                <div className="mt-4">
                  <TrustScoreBreakdown
                    items={trustData.items}
                    total={trustData.total}
                    level={trustData.level}
                    nextLevel={trustData.nextLevel}
                    nextLevelAt={trustData.nextLevelAt}
                  />
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
