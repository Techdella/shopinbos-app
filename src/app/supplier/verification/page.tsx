"use client";

import { useCallback, useEffect, useState } from "react";
import { AppPage, Card, CardHead, PillLink } from "@/components/app-kit";
import { Notice, PillButton, Spinner, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { VerificationDocUploader } from "@/components/verification/VerificationDocUploader";
import { CacInstantCheck } from "@/components/verification/CacInstantCheck";
import { TrustScoreBreakdown } from "@/components/verification/TrustScoreBreakdown";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { deleteVerificationFile, uploadVerificationFile } from "@/components/verification/upload-client";
import { isDocComplete } from "@shared/verification-docs";
import { useT } from "@/components/i18n/I18nProvider";
import {
  type VerificationDoc,
  type DocType,
  type TrustScoreBreakdownItem,
  supplierDocTypes,
} from "@/lib/verification-utils";

interface SupplierData {
  id: string;
  displayName: string;
  businessName: string;
  city?: string;
  country?: string;
  verificationStatus: string;
  trustScore: number;
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

export default function SupplierVerificationPage() {
  const t = useT("verification", "common");
  const [supplier, setSupplier] = useState<SupplierData | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [documents, setDocuments] = useState<VerificationDoc[]>([]);
  const [trustData, setTrustData] = useState<TrustData | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch("/api/supplier/me");
      if (!r.ok) throw new Error(t("page.supplierLoadFailed"));
      const d = await r.json();
      const payload = d.data ?? d;
      if (!payload.supplier || !payload.user) throw new Error(t("page.supplierNotReturned"));
      setSupplier(payload.supplier);
      setUser(payload.user);
      setDocuments(payload.supplier.verificationDocuments ?? []);

      if (payload.trustBreakdown) {
        setTrustData(payload.trustBreakdown);
      }
    } catch (err: any) {
      setError(err.message || t("page.supplierLoadFailed"));
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Errors are thrown so the uploader shows them on the document's own row.
  const handleUpload = useCallback(async (type: DocType, file: File, onProgress?: (percent: number) => void) => {
    setMessage("");
    const doc = await uploadVerificationFile("/api/supplier/verification/upload", type, file, onProgress, t);
    setDocuments((current) => [...current.filter((d) => d.type !== type), doc]);
    setMessageTone("success");
    setMessage(t("page.fileUploaded", { name: doc.fileName }));
    fetchData();
  }, [fetchData, t]);

  const handleDelete = useCallback(async (docId: string) => {
    setMessage("");
    await deleteVerificationFile("/api/supplier/verification/upload", docId, t);
    setDocuments((current) => current.filter((d) => d.id !== docId));
    setMessageTone("success");
    setMessage(t("page.removed"));
    fetchData();
  }, [fetchData, t]);

  const handleSubmit = useCallback(async () => {
    setSubmitting(true);
    setMessage("");
    try {
      const r = await fetch("/api/supplier/verification/submit", { method: "POST" });
      const result = await r.json();
      if (!result.success) { setMessageTone("error"); setMessage(result.error ?? t("page.submitFailed")); setSubmitting(false); return; }
      setMessageTone("success");
      setMessage(t("page.sentForReview"));
      fetchData();
    } catch {
      setMessageTone("error");
      setMessage(t("page.sendFailedConnection"));
    } finally { setSubmitting(false); }
  }, [fetchData, t]);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-app-canvas px-4 font-app text-app-ink">
        <div className="max-w-[420px] text-center">
          <Notice tone="error">{error}</Notice>
          <PillButton tone="ink" size="md" className="mt-4" onClick={() => { setError(""); fetchData(); }}>{t("tryAgain")}</PillButton>
        </div>
      </div>
    );
  }

  if (!supplier || !user) {
    return (
      <div role="status" className="grid min-h-dvh place-items-center bg-app-canvas font-app text-app-ink-soft">
        <span className="inline-flex items-center gap-2 text-[14px]"><Spinner /> {t("page.loading")}</span>
      </div>
    );
  }

  const isVerified = supplier.verificationStatus === "verified";
  const isPending = supplier.verificationStatus === "pending";

  const progressSteps = [
    { label: t("step.account"), done: true },
    { label: t("step.profile"), done: Boolean(supplier.businessName && supplier.city) },
    { label: t("step.documents"), done: documents.some(isDocComplete) },
    { label: t("step.submitted"), done: isPending || isVerified },
    { label: t("step.review"), done: isPending || isVerified },
    { label: t("step.approved"), done: isVerified },
  ];

  const badgeTier = supplier.verificationStatus === "verified"
    ? trustData?.level.toLowerCase().includes("platinum") ? "platinum"
      : trustData?.level.toLowerCase().includes("gold") ? "gold"
      : trustData?.level.toLowerCase().includes("silver") ? "silver"
      : "bronze"
    : "none";

  const doneSteps = progressSteps.filter((step) => step.done).length;
  const failed = messageTone === "error";

  return (
    <AppPage
      frame={supplierFrame(user, supplier, { verificationStatus: supplier.verificationStatus })}
      title={t("page.title")}
      sub={t("page.supplierSub")}
      actions={
        isVerified && trustData ? (
          <VerificationBadge tier={badgeTier} trustScore={trustData.total} verificationStatus={supplier.verificationStatus} size="md" />
        ) : undefined
      }
    >
      <div className="grid gap-5">
        {message && <Notice tone={failed ? "error" : "success"}>{message}</Notice>}

        <Card className={cx("flex flex-wrap items-center gap-4 p-5 sm:p-6", isVerified ? "border-transparent bg-app-success-tint" : "border-transparent bg-app-peach")}>
          <span className={cx("grid h-14 w-14 shrink-0 place-items-center rounded-full text-white", isVerified ? "bg-app-success" : "bg-app-accent")}>
            <Icon name={isVerified ? "check" : "clock"} size={26} strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-[22px] font-extrabold tracking-[-0.4px]">
              {isVerified ? t("page.supplierVerified") : isPending ? t("checklist.checking") : t("page.getVerified")}
            </h2>
            <p className="mb-0 mt-1 text-[14.5px] leading-[1.5]">
              {isVerified
                ? <>{t("page.approvedBy")} {t("page.trustScoreLabel")} <strong>{trustData?.total ?? supplier.trustScore}/100</strong>{badgeTier !== "none" && `, ${t.dynamic(`page.badge.${badgeTier}`, `${badgeTier.charAt(0).toUpperCase() + badgeTier.slice(1)} badge`)}`}.</>
                : isPending
                  ? t("page.supplierPending")
                  : t("page.uploadThenSend")}
            </p>
          </div>
          {!isVerified && <PillLink href="/supplier/profile">{t("page.checkProfile")}</PillLink>}
        </Card>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Card className="min-w-0 p-5 sm:p-6">
            <CardHead title={t("page.documents")} sub={isVerified ? t("page.approvedDocs") : t("page.docsHint")} />
            <div className="mt-4">
              <CacInstantCheck
                apiPath="/api/supplier/verification/cac"
                defaultName={supplier.businessName}
                cacDoc={documents.find((d) => d.type === "cac")}
                onVerified={(doc) => { setDocuments((current) => [...current.filter((d) => d.type !== "cac"), doc]); fetchData(); }}
              />
              <div className="mt-4">
                <VerificationDocUploader
                  role="supplier"
                  docs={documents}
                  docConfigs={supplierDocTypes}
                  onUpload={handleUpload}
                  onDelete={handleDelete}
                  readOnly={isVerified}
                />
              </div>
            </div>
            {!isVerified && !isPending && (
              <PillButton tone="accent" size="md" onClick={handleSubmit} busy={submitting} className="mt-5 w-full">
                {t("page.sendForReview")}
              </PillButton>
            )}
          </Card>

          <div className="grid min-w-0 content-start gap-5">
            <Card className="p-5">
              <CardHead title={t("page.yourProgress")} action={<span className="text-[13px] text-app-ink-soft">{t("page.xOfY", { done: doneSteps, total: progressSteps.length })}</span>} />
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-app-canvas">
                <div className="h-full rounded-full bg-app-success" style={{ width: `${(doneSteps / progressSteps.length) * 100}%` }} />
              </div>
              <ul className="m-0 mt-1 list-none divide-y divide-app-line p-0">
                {progressSteps.map((step) => (
                  <li key={step.label} className="flex min-h-[44px] items-center gap-3 py-2">
                    {step.done ? <Icon name="check" size={16} className="text-app-success" /> : <span className="h-4 w-4 rounded-full border-2 border-app-toggle-off" />}
                    <span className={cx("flex-1 text-[14px]", step.done ? "text-app-ink-soft" : "font-semibold")}>{step.label}</span>
                    <span className="sr-only">{step.done ? t("page.done") : t("page.notDone")}</span>
                  </li>
                ))}
              </ul>
            </Card>

            {trustData && (
              <Card className="p-5">
                <CardHead title={t("badge.trustScore")} />
                <div className="mt-3">
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
    </AppPage>
  );
}
