"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon } from "@/components/ui";
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
      <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "var(--danger)" }}>{error}</div>
    );
  }

  if (!partner || !user) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", color: "var(--ink-400)" }}>Loading...</div>
    );
  }

  const isVerified = partner.verificationStatus === "verified";
  const isPending = partner.verificationStatus === "pending";

  const progressSteps = [
    { label: "Account setup", done: true },
    { label: "Business profile", done: Boolean(partner.companyName && partner.city) },
    { label: "Documents uploaded", done: documents.some((d) => d.status === "uploaded" || d.status === "submitted") },
    { label: "Verification submitted", done: isPending || isVerified },
    { label: "ShopinBos review", done: isPending || isVerified },
    { label: "Verification approved", done: isVerified },
  ];

  const badgeTier = isVerified
    ? trustData?.level.toLowerCase().includes("platinum") ? "platinum"
      : trustData?.level.toLowerCase().includes("gold") ? "gold"
      : trustData?.level.toLowerCase().includes("silver") ? "silver"
      : "bronze"
    : "none";

  return (
    <AppFrame
        role="logistics_partner"
        storeName={partner.displayName}
      storeSlug={`${partner.city ?? "Lagos"} · Fleet`}
      storeInitial={partner.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
      verificationStatus={partner.verificationStatus}
    >
        <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
          <PageHead
            title="Verification"
            sub={`${partner.displayName} — ${isVerified ? "Verified" : partner.verificationStatus}`}
            actions={
              isVerified && trustData ? (
                <VerificationBadge tier={badgeTier} trustScore={trustData.total} verificationStatus={partner.verificationStatus} size="md" />
              ) : undefined
            }
          />

          {message && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: message.includes("fail") || message.includes("error") ? "var(--danger-bg)" : "var(--teal-50)", border: `1px solid ${message.includes("fail") || message.includes("error") ? "var(--danger)" : "var(--teal-200)"}`, color: message.includes("fail") || message.includes("error") ? "var(--danger)" : "var(--teal-800)", fontSize: 13 }}>
              {message}
            </div>
          )}

          {isVerified ? (
            <div className="card" style={{ padding: 24, background: "linear-gradient(135deg, #d1fae5, #b9e9d4)", border: "none" }}>
              <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
                <div style={{ width: 62, height: 62, borderRadius: 18, background: "var(--success)", color: "white", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Icon name="check" size={32} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-accent)", fontSize: 26, fontWeight: 400, lineHeight: 1.1, color: "var(--success)" }}>
                    Verified logistics partner
                  </div>
                  <div style={{ fontSize: 13.5, color: "var(--ink-700)", marginTop: 5 }}>
                    Approved by ShopinBos — Trust score <strong>{trustData?.total ?? partner.reliabilityScore}/100</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 24, background: "linear-gradient(135deg, var(--amber-50), #fdecd4)", border: "1px solid var(--amber-200)" }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ width: 50, height: 50, borderRadius: 14, background: "var(--amber-100)", color: "var(--amber-700)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Icon name="clock" size={24} />
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-accent)", fontSize: 22, fontWeight: 400, color: "var(--amber-700)" }}>
                    {isPending ? "Under review" : "Verification pending"}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-600)", marginTop: 3 }}>
                    {isPending
                      ? "Your documents are being reviewed by the ShopinBos team."
                      : "Upload your documents below to get verified."
                    }
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 18 }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Documents required</div>
              <VerificationDocUploader
                role="logistics_partner"
                docs={documents}
                docConfigs={logisticsDocTypes}
                onUpload={handleUpload}
                onDelete={handleDelete}
                readOnly={isVerified}
              />
              {!isVerified && !isPending && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{
                    marginTop: 16,
                    padding: "10px 20px",
                    borderRadius: 10,
                    border: "none",
                    background: "var(--teal-600)",
                    color: "white",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: submitting ? "wait" : "pointer",
                    width: "100%",
                  }}
                >
                  {submitting ? "Submitting..." : "Submit for admin review"}
                </button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <VerificationProgress steps={progressSteps} />
              {trustData && (
                <div className="card" style={{ padding: 18 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Trust score breakdown</div>
                  <TrustScoreBreakdown
                    items={trustData.items}
                    total={trustData.total}
                    level={trustData.level}
                    nextLevel={trustData.nextLevel}
                    nextLevelAt={trustData.nextLevelAt}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </AppFrame>
  );
}
