"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Notice, PillButton, cx } from "@/components/app-ui";
import type { VerificationDoc } from "@/lib/verification-utils";

interface AdminDocumentViewerProps {
  role: "supplier" | "logistics_partner";
  entityId: string;
  docs: VerificationDoc[];
  verificationStatus: string;
  trustScore: number;
}

const statusTone: Record<string, string> = {
  draft: "bg-app-canvas text-app-ink-soft",
  uploaded: "bg-app-canvas text-app-ink-soft",
  submitted: "bg-[#FDF0D5] text-[#8A5A00]",
  under_review: "bg-[#E8EAFB] text-[#3D4FB8]",
  approved: "bg-app-success-tint text-app-success",
  rejected: "bg-app-danger-tint text-app-danger",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  uploaded: "Uploaded",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
};

function buildFileUrl(filePath: string): string {
  if (filePath.startsWith("http")) return filePath;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const bucket = process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media";
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`;
}

const docTypeLabels: Record<string, string> = {
  cac: "Business registration / CAC certificate",
  tax: "Tax Identification Number (TIN)",
  utility: "Utility bill",
  identity: "Owner identity document (NIN)",
  "product-images": "Product images",
  insurance: "Insurance certificate",
  fleet: "Fleet / vehicle documents",
  other: "Other document",
};

export function AdminDocumentViewer({ role, entityId, docs, verificationStatus, trustScore }: AdminDocumentViewerProps) {
  const router = useRouter();
  const [moderating, setModerating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiBase = role === "supplier"
    ? `/api/admin/suppliers/${entityId}/documents`
    : `/api/admin/logistics-partners/${entityId}/documents`;

  const handleAction = useCallback(async (docId: string, action: "approve" | "reject") => {
    setModerating(docId);
    setError(null);

    const rejectionReason = action === "reject"
      ? prompt("Rejection reason (optional):") ?? undefined
      : undefined;

    if (action === "reject" && rejectionReason === undefined) {
      setModerating(null);
      return;
    }

    try {
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId, action, rejectionReason }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = typeof data.error === "string" ? data.error : data.error?.message;
        throw new Error(message ?? "Could not update the document.");
      }

      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not update the document.");
    } finally {
      setModerating(null);
    }
  }, [apiBase, router]);

  const submittedDocs = docs.filter((d) => d.status === "submitted" || d.status === "under_review");
  const processedDocs = docs.filter((d) => d.status === "approved" || d.status === "rejected");
  const draftDocs = docs.filter((d) => d.status === "draft" || d.status === "uploaded");

  function renderDocList(items: VerificationDoc[], showActions: boolean) {
    return (
      <ul className="m-0 list-none divide-y divide-app-line overflow-hidden rounded-[22px] border border-app-line bg-white p-0">
        {items.map((doc) => {
          const fileUrl = buildFileUrl(doc.filePath);
          const name = docTypeLabels[doc.type] ?? doc.label ?? doc.type;

          return (
            <li key={doc.id} className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3.5 sm:px-5 md:flex-nowrap">
              <span
                className={cx(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-[12px]",
                  doc.status === "approved" ? "bg-app-success-tint text-app-success" : doc.status === "rejected" ? "bg-app-danger-tint text-app-danger" : "bg-app-canvas text-app-ink",
                )}
              >
                <Icon name={doc.type === "product-images" ? "image" : "file"} size={18} />
              </span>

              <div className="min-w-0 flex-1 basis-[200px]">
                <div className="truncate text-[15px] font-extrabold">{name}</div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-app-ink-soft">
                  <span className="max-w-full truncate">{doc.fileName}</span>
                  <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>
                  {doc.updatedAt && <span>{new Date(doc.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
                </div>
                {doc.rejectionReason && (
                  <div className="mt-1 text-[13px] text-app-danger">Reason: {doc.rejectionReason}</div>
                )}
              </div>

              <span className={cx("inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-bold", statusTone[doc.status] ?? statusTone.draft)}>
                {statusLabels[doc.status] ?? doc.status}
              </span>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${name}`}
                  className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-app-ink transition hover:border-app-line-strong"
                >
                  <Icon name="eye" size={16} />
                </a>
                <a
                  href={fileUrl}
                  download={doc.fileName}
                  aria-label={`Download ${name}`}
                  className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-app-ink transition hover:border-app-line-strong"
                >
                  <Icon name="download" size={16} />
                </a>
                {showActions && (
                  <>
                    <PillButton tone="white" size="sm" className="text-app-danger" onClick={() => handleAction(doc.id, "reject")} disabled={moderating === doc.id} aria-label={`Reject ${name}`}>
                      Reject
                    </PillButton>
                    <PillButton tone="ink" size="sm" busy={moderating === doc.id} onClick={() => handleAction(doc.id, "approve")} aria-label={`Approve ${name}`}>
                      <Icon name="check" size={14} />
                      Approve
                    </PillButton>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  const scoreLabel = role === "supplier" ? "Trust score" : "Reliability score";

  return (
    <div className="grid gap-6 font-app text-app-ink">
      {error && <Notice tone="error">{error}</Notice>}

      {docs.length === 0 && (
        <section className="flex flex-col items-center rounded-[22px] border border-app-line bg-white px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="file" size={22} /></span>
          <h2 className="mb-0 mt-4 text-[18px] font-extrabold">No verification documents</h2>
          <p className="mb-0 mt-1.5 max-w-[420px] text-[14.5px] leading-[1.55] text-app-ink-soft">
            This {role === "supplier" ? "supplier" : "logistics partner"} has not uploaded any verification documents yet.
          </p>
        </section>
      )}

      {submittedDocs.length > 0 && (
        <section>
          <h2 className="mb-3 mt-0 flex items-center gap-2 text-[17px] font-extrabold">
            Waiting for your review
            <span className="rounded-full bg-[#FDF0D5] px-2.5 py-0.5 text-[12.5px] font-bold text-[#8A5A00]">{submittedDocs.length}</span>
          </h2>
          {renderDocList(submittedDocs, true)}
        </section>
      )}

      {processedDocs.length > 0 && (
        <section>
          <h2 className="mb-3 mt-0 text-[17px] font-extrabold">Reviewed</h2>
          {renderDocList(processedDocs, false)}
        </section>
      )}

      {draftDocs.length > 0 && (
        <section>
          <h2 className="mb-3 mt-0 text-[17px] font-extrabold text-app-ink-soft">Not sent yet</h2>
          {renderDocList(draftDocs, false)}
        </section>
      )}

      {docs.length > 0 && (
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-[14px]">
            <span className="font-extrabold">{scoreLabel}: {trustScore}/100</span>
            <span className="text-app-ink-soft">Verification: {verificationStatus.replace(/_/g, " ")}</span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-app-track"
            role="meter"
            aria-label={scoreLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={trustScore}
          >
            <div
              className={cx("h-full rounded-full transition-all", trustScore >= 60 ? "bg-app-success" : trustScore >= 40 ? "bg-[#F2A93B]" : "bg-app-danger")}
              style={{ width: `${Math.max(0, Math.min(100, trustScore))}%` }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
