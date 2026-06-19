"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { VerificationDoc, DocType } from "@/app/actions/verification";

interface DocConfig {
  type: DocType;
  label: string;
  required: boolean;
  hint: string;
}

interface VerificationDocUploaderProps {
  role: "supplier" | "logistics_partner";
  docs: VerificationDoc[];
  docConfigs: DocConfig[];
  onUpload: (type: DocType, file: File) => Promise<void>;
  onDelete: (docId: string) => Promise<void>;
  readOnly?: boolean;
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

export function VerificationDocUploader({ role, docs, docConfigs, onUpload, onDelete, readOnly }: VerificationDocUploaderProps) {
  const [uploading, setUploading] = useState<string | null>(null);

  async function handleFileSelect(type: DocType, file: File) {
    setUploading(type);
    try {
      await onUpload(type, file);
    } finally {
      setUploading(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {docConfigs.map((cfg) => {
        const doc = docs.find((d) => d.type === cfg.type);
        const status = doc?.status ?? "draft";
        const color = statusColors[status] ?? "var(--ink-400)";

        return (
          <div
            key={cfg.type}
            style={{
              padding: "14px 16px",
              border: "1px solid var(--ink-100)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: status === "rejected" ? "var(--danger-bg)" : "white",
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: status === "approved" ? "var(--success-bg)" : status === "rejected" ? "var(--danger-bg)" : "var(--ink-50)",
                color: status === "approved" ? "var(--success)" : status === "rejected" ? "var(--danger)" : "var(--teal-600)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              {status === "approved" ? <Icon name="check" size={20} /> : status === "rejected" ? <Icon name="warn" size={18} /> : <Icon name="upload" size={18} />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{cfg.label}</span>
                {!cfg.required && (
                  <span style={{ fontSize: 10, padding: "1px 6px", background: "var(--ink-50)", borderRadius: 4, color: "var(--ink-500)" }}>
                    Optional
                  </span>
                )}
                {doc?.rejectionReason && (
                  <span style={{ fontSize: 10, color: "var(--danger)", fontWeight: 600 }}>Rejected: {doc.rejectionReason}</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 1 }}>{doc?.fileName ?? cfg.hint}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                <span style={{ fontSize: 11, color, fontWeight: 600 }}>{statusLabels[status]}</span>
                {doc?.uploadedAt && (
                  <span style={{ fontSize: 10, color: "var(--ink-400)" }}>
                    {new Date(doc.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {doc?.filePath && (
                <a
                  href={doc.filePath.startsWith("http") ? doc.filePath : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${process.env.NEXT_PUBLIC_STORAGE_BUCKET ?? "shopinbos-media"}/${doc.filePath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--ink-200)", textDecoration: "none", color: "var(--ink-700)" }}
                >
                  View
                </a>
              )}
              {!readOnly && status !== "submitted" && status !== "under_review" && status !== "approved" && (
                <>
                  <FileInputButton
                    type={cfg.type}
                    uploading={uploading === cfg.type}
                    onSelect={(f) => handleFileSelect(cfg.type, f)}
                    label={doc ? "Replace" : "Upload"}
                  />
                  {doc && (
                    <button
                      onClick={() => onDelete(doc.id)}
                      style={{ fontSize: 11, padding: "4px 8px", border: "none", background: "transparent", color: "var(--danger)", cursor: "pointer" }}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FileInputButton({ type, uploading, onSelect, label }: { type: DocType; uploading: boolean; onSelect: (f: File) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <button
        onClick={() => ref.current?.click()}
        disabled={uploading}
        style={{
          fontSize: 11,
          padding: "4px 10px",
          borderRadius: 6,
          border: "1px solid var(--teal-200)",
          background: "var(--teal-50)",
          color: "var(--teal-700)",
          fontWeight: 600,
          cursor: uploading ? "wait" : "pointer",
        }}
      >
        {uploading ? "Uploading..." : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = "";
        }}
      />
    </>
  );
}
