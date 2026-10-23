"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { Card, CardHead, PageHead } from "@/components/app-kit";
import { Notice, PillButton, Spinner } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { VerificationDocUploader } from "@/components/verification/VerificationDocUploader";
import { CacInstantCheck } from "@/components/verification/CacInstantCheck";
import { VerificationProgress } from "@/components/verification/VerificationProgress";
import { TrustScoreBreakdown } from "@/components/verification/TrustScoreBreakdown";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import {
  type VerificationDoc,
  type DocType,
  type TrustScoreBreakdownItem,
  logisticsDocTypes,
} from "@/lib/verification-utils";
import { useT } from "@/components/i18n/I18nProvider";
import { friendlyError } from "@/lib/errors/report-client";

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
  const t = useT("verification", "logistics", "common");
  const [partner, setPartner] = useState<PartnerData | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [documents, setDocuments] = useState<VerificationDoc[]>([]);
  const [trustData, setTrustData] = useState<TrustData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const say = useCallback((text: string, isError: boolean) => { setFailed(isError); setMessage(text); }, []);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/logistics/me");
      if (!r.ok) throw new Error(t("page.partnerLoadConnection"));
      const d = await r.json();
      const payload = d.data ?? d;
      if (!payload.partner || !payload.user) throw new Error(t("page.partnerLoadRefresh"));
      setPartner(payload.partner);
      setUser(payload.user);
      setDocuments(payload.partner.verificationDocuments ?? []);
      if (payload.trustBreakdown) setTrustData(payload.trustBreakdown);
    } catch (err: any) {
      setError(friendlyError(err, t("page.partnerLoadRefresh")));
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleUpload = useCallback(async (type: DocType, file: File) => {
    setMessage("");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("docType", type);
    try {
      const r = await fetch("/api/logistics/verification/upload", { method: "POST", body: formData });
      const result = await r.json();
      if (!result.success) { say(result.error ?? t("page.uploadFailed"), true); return; }
      say(t("page.uploaded"), false);
      fetchData();
    } catch { say(t("page.uploadFailed"), true); }
  }, [fetchData, say, t]);

  const handleDelete = useCallback(async (docId: string) => {
    setMessage("");
    try {
      const r = await fetch("/api/logistics/verification/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId }),
      });
      const result = await r.json();
      if (!result.success) { say(result.error ?? t("page.removeFailed"), true); return; }
      say(t("page.removed"), false);
      fetchData();
    } catch { say(t("page.removeFailed"), true); }
  }, [fetchData, say, t]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setMessage("");
    try {
      const r = await fetch("/api/logistics/verification/submit", { method: "POST" });
      const result = await r.json();
      if (!result.success) { say(result.error ?? t("page.partnerSendFailed"), true); setSubmitting(false); return; }
      say(t("page.partnerSent"), false);
      fetchData();
    } catch { say(t("page.partnerSendFailedConnection"), true); }
    finally { setSubmitting(false); }
  }, [fetchData, say, t]);

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
        <span className="flex items-center gap-2 text-[15px]"><Spinner /> {t("page.loading")}</span>
      </div>
    );
  }

  const isVerified = partner.verificationStatus === "verified";
  const isPending = partner.verificationStatus === "pending";

  const progressSteps = [
    { label: t("step.account"), done: true },
    { label: t("step.profile"), done: Boolean(partner.companyName && partner.city) },
    { label: t("step.documents"), done: documents.some((d) => d.status === "uploaded" || d.status === "submitted") },
    { label: t("step.submitted"), done: isPending || isVerified },
    { label: t("step.review"), done: isPending || isVerified },
    { label: t("step.approved"), done: isVerified },
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
      storeSlug={partner.city ? t("kit.cityPartner", { city: partner.city }) : t("kit.deliveryPartner")}
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
          title={t("page.title")}
          sub={t("page.partnerSub")}
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
              {isVerified ? t("page.partnerVerified") : isPending ? t("page.underReview") : t("page.notVerifiedYet")}
            </h2>
            <p className="m-0 mt-0.5 text-[15px] text-app-ink-soft">
              {isVerified
                ? t("page.trustOutOf", { score: trustData?.total ?? partner.reliabilityScore })
                : isPending
                  ? t("page.partnerPending")
                  : t("page.uploadThenSend")}
            </p>
          </div>
        </Card>

        <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
          <Card className="min-w-0 p-5">
            <CardHead title={t("page.yourDocuments")} />
            <div className="mt-4">
              <CacInstantCheck
                apiPath="/api/logistics/verification/cac"
                defaultName={partner.companyName}
                cacDoc={documents.find((d) => d.type === "cac")}
                onVerified={(doc) => { setDocuments((current) => [...current.filter((d) => d.type !== "cac"), doc]); fetchData(); }}
              />
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
            </div>
            {!isVerified && !isPending && (
              <PillButton size="md" className="mt-4 w-full" onClick={handleSubmit} busy={submitting}>
                {t("page.sendForReview")}
              </PillButton>
            )}
          </Card>

          <div className="grid min-w-0 content-start gap-5">
            <VerificationProgress steps={progressSteps} />
            {trustData && (
              <Card className="p-5">
                <CardHead title={t("badge.trustScore")} />
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
