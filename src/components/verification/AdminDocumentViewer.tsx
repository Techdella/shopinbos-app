"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import type { VerificationDoc } from "@/app/actions/verification";

interface AdminDocumentViewerProps {
  role: "supplier" | "logistics_partner";
  entityId: string;
  docs: VerificationDoc[];
  verificationStatus: string;
  trustScore: number;
}

const statusColors: Record<string, string> = {
  draft: "var(--ink-400)",
  uploaded: "var(--teal-600)",
  submitted: "var(--amber-600)",
  under_review: "var(--blue-600)",
  approved: "var(--success)",
  rejected: "var(--danger)",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  uploaded: "Uploaded",
  submitted: "Submitted",
  under_review: "Under Review",
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
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update document");
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setModerating(null);
    }
  }, [apiBase, router]);

  const submittedDocs = docs.filter((d) => d.status === "submitted" || d.status === "under_review");
  const processedDocs = docs.filter((d) => d.status === "approved" || d.status === "rejected");
  const draftDocs = docs.filter((d) => d.status === "draft" || d.status === "uploaded");

  function renderDocList(items: VerificationDoc[], showActions: boolean) {
    if (items.length === 0) {
      return (
        <div className="rounded-[12px] border border-dashed border-[var(--ink-200)] px-4 py-8 text-center text-[13px] text-[var(--ink-400)]">
          No documents in this category
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {items.map((doc) => {
          const fileUrl = buildFileUrl(doc.filePath);
          const color = statusColors[doc.status] ?? "var(--ink-400)";

          return (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-[12px] border border-[var(--ink-100)] bg-white px-4 py-3"
            >
              <div
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[8px] text-[var(--teal-600)]"
                style={{ background: doc.status === "approved" ? "var(--success-bg)" : doc.status === "rejected" ? "var(--danger-bg)" : "var(--ink-50)", color: doc.status === "approved" ? "var(--success)" : doc.status === "rejected" ? "var(--danger)" : "var(--teal-600)" }}
              >
                {doc.type === "product-images" ? <Icon name="image" size={16} /> : <Icon name="file" size={16} />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-semibold text-[var(--ink-800)]">
                    {docTypeLabels[doc.type] ?? doc.label ?? doc.type}
                  </span>
                  {doc.rejectionReason && (
                    <span className="truncate text-[11px] text-[var(--danger)]" title={doc.rejectionReason}>
                      Reason: {doc.rejectionReason}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-[var(--ink-500)]">
                  <span>{doc.fileName}</span>
                  <span>{(doc.fileSize / 1024).toFixed(0)} KB</span>
                  <span style={{ color, fontWeight: 600 }}>{statusLabels[doc.status]}</span>
                  {doc.updatedAt && (
                    <span>{new Date(doc.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-[6px] border border-[var(--ink-200)] text-[var(--ink-600)] transition-colors hover:border-[var(--teal-400)] hover:text-[var(--teal-600)]"
                  title="View document"
                >
                  <Icon name="eye" size={14} />
                </a>
                <a
                  href={fileUrl}
                  download={doc.fileName}
                  className="flex h-[30px] w-[30px] items-center justify-center rounded-[6px] border border-[var(--ink-200)] text-[var(--ink-600)] transition-colors hover:border-[var(--teal-400)] hover:text-[var(--teal-600)]"
                  title="Download"
                >
                  <Icon name="download" size={14} />
                </a>
                {showActions && (
                  <>
                    <button
                      onClick={() => handleAction(doc.id, "approve")}
                      disabled={moderating === doc.id}
                      className="flex h-[30px] items-center gap-1 rounded-[6px] border border-[var(--success)] bg-[var(--success-bg)] px-2.5 text-[11px] font-semibold text-[var(--success)] transition-colors hover:bg-[var(--success)] hover:text-white disabled:opacity-50"
                    >
                      <Icon name="check" size={12} />
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(doc.id, "reject")}
                      disabled={moderating === doc.id}
                      className="flex h-[30px] items-center gap-1 rounded-[6px] border border-[var(--danger)] bg-[var(--danger-bg)] px-2.5 text-[11px] font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger)] hover:text-white disabled:opacity-50"
                    >
                      <Icon name="warn" size={12} />
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-[12px] border border-[var(--danger)] bg-[var(--danger-bg)] px-4 py-3 text-[13px] text-[var(--danger)]">
          {error}
        </div>
      )}

      {docs.length === 0 && (
        <div className="card flex flex-col items-center gap-3 px-8 py-12 text-center">
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-[var(--ink-50)] text-[var(--ink-400)]">
            <Icon name="file" size={24} />
          </div>
          <div className="text-[15px] font-semibold text-[var(--ink-700)]">No verification documents</div>
          <div className="max-w-[360px] text-[13px] text-[var(--ink-500)]">
            This {role === "supplier" ? "supplier" : "logistics partner"} has not uploaded any verification documents yet.
          </div>
        </div>
      )}

      {submittedDocs.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-[15px] font-semibold text-[var(--teal-700)]">
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[var(--amber-100)] text-[11px] font-bold text-[var(--amber-700)]">
              {submittedDocs.length}
            </span>
            Pending Review
          </h3>
          {renderDocList(submittedDocs, true)}
        </div>
      )}

      {processedDocs.length > 0 && (
        <div>
          <h3 className="mb-2 text-[15px] font-semibold text-[var(--ink-700)]">Reviewed Documents</h3>
          {renderDocList(processedDocs, false)}
        </div>
      )}

      {draftDocs.length > 0 && (
        <div>
          <h3 className="mb-2 text-[15px] font-semibold text-[var(--ink-500)]">Not Yet Submitted</h3>
          {renderDocList(draftDocs, false)}
        </div>
      )}

      {docs.length > 0 && (
        <div className="mt-4 rounded-[12px] border border-[var(--ink-100)] p-4">
          <div className="mb-3 text-[13px] font-semibold text-[var(--ink-600)]">
            Overall {role === "supplier" ? "Trust" : "Reliability"} Score: {trustScore}/100 &middot; Status: {verificationStatus}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ink-100)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${trustScore}%`,
                background: trustScore >= 60 ? "var(--success)" : trustScore >= 40 ? "var(--amber-500)" : "var(--danger)",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
