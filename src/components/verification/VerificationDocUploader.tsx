"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Spinner, cx } from "@/components/app-ui";
import {
  DOC_FILE_ACCEPT,
  docDisplayState,
  DOC_FORMATS_LABEL,
  docHasFile,
  docStatusLabel,
  findDoc,
  formatBytes,
  validateDocFile,
  type DocConfig,
  type DocDisplayState,
  type DocType,
  type VerificationDoc,
} from "@shared/verification-docs";
import { docFileUrl } from "./upload-client";
import { docFileProblem, docHint, docLabel, docStatusWords } from "./doc-words";
import { useT } from "@/components/i18n/I18nProvider";

interface VerificationDocUploaderProps {
  role: "supplier" | "logistics_partner";
  docs: VerificationDoc[];
  docConfigs: DocConfig[];
  /** Uploads the file and refreshes `docs` from the server. Throw to show the error on the row. */
  onUpload: (type: DocType, file: File, onProgress?: (percent: number) => void) => Promise<void>;
  /** Removes the document and refreshes `docs`. Throw to show the error on the row. */
  onDelete: (docId: string) => Promise<void>;
  readOnly?: boolean;
}

interface RowState {
  busy?: "upload" | "remove";
  progress?: number;
  error?: string;
}

const pillTone: Record<DocDisplayState, string> = {
  missing: "bg-app-canvas text-app-ink-soft",
  needs_file: "bg-app-danger-tint text-app-danger",
  draft: "bg-app-canvas text-app-ink-soft",
  uploaded: "bg-[#E8EAFB] text-[#3D4FB8]",
  submitted: "bg-[#FDF0D5] text-[#8A5A00]",
  under_review: "bg-[#FDF0D5] text-[#8A5A00]",
  approved: "bg-app-success-tint text-app-success",
  rejected: "bg-app-danger-tint text-app-danger",
};

const lockedStates: DocDisplayState[] = ["submitted", "under_review", "approved"];

export function VerificationDocUploader({ docs, docConfigs, onUpload, onDelete, readOnly }: VerificationDocUploaderProps) {
  const t = useT("verification");
  const [rows, setRows] = useState<Partial<Record<DocType, RowState>>>({});

  function setRow(type: DocType, next: RowState) {
    setRows((current) => ({ ...current, [type]: next }));
  }

  async function handleFile(type: DocType, file: File) {
    const invalid = docFileProblem(t, file, validateDocFile(file));
    if (invalid) {
      setRow(type, { error: invalid });
      return;
    }
    setRow(type, { busy: "upload", progress: 0 });
    try {
      await onUpload(type, file, (progress) => setRow(type, { busy: "upload", progress }));
      setRow(type, {});
    } catch (err) {
      setRow(type, { error: err instanceof Error ? err.message : t("uploader.uploadFailed") });
    }
  }

  async function handleRemove(type: DocType, docId: string) {
    setRow(type, { busy: "remove" });
    try {
      await onDelete(docId);
      setRow(type, {});
    } catch (err) {
      setRow(type, { error: err instanceof Error ? err.message : t("uploader.removeFailed") });
    }
  }

  return (
    <div>
    <ul className="m-0 list-none divide-y divide-app-line overflow-hidden rounded-[22px] border border-app-line bg-white p-0">
      {docConfigs.map((config) => {
        const doc = findDoc(docs, config.type);
        const state = docDisplayState(doc);
        const row = rows[config.type] ?? {};
        const hasFile = docHasFile(doc);
        const canChange = !readOnly && !lockedStates.includes(state) && !row.busy;
        const inputId = `verification-file-${config.type}`;
        const label = docLabel(t, config.type, config.label);
        const detail = hasFile && doc
          ? [doc.fileName, formatBytes(doc.fileSize)].filter(Boolean).join(" · ")
          : state === "needs_file"
            ? `${doc?.fileName ? t("uploader.neverReceived", { name: doc.fileName }) : ""}${t("uploader.uploadAgainPlease")}`
            : docHint(t, config.hint);

        return (
          <li key={config.type} className={cx("px-4 py-3.5 sm:px-5", state === "rejected" && "bg-app-danger-tint/40")}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:flex-nowrap">
              <span
                aria-hidden
                className={cx(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-full",
                  state === "approved" ? "bg-app-success-tint text-app-success" : state === "rejected" || state === "needs_file" ? "bg-app-danger-tint text-app-danger" : "bg-app-canvas text-app-ink",
                )}
              >
                <Icon name={state === "approved" ? "check" : state === "rejected" || state === "needs_file" ? "warn" : hasFile ? "file" : "upload"} size={18} />
              </span>

              <div className="min-w-0 flex-1 basis-[200px]">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[14.5px] font-extrabold">{label}</span>
                  {!config.required && <span className="rounded-full bg-app-canvas px-2 py-0.5 text-[11.5px] font-bold text-app-ink-soft">{t("uploader.optional")}</span>}
                </div>
                <div className="truncate text-[13px] text-app-ink-soft">{detail}</div>
                {state === "rejected" && doc?.rejectionReason && (
                  <div className="mt-0.5 text-[13px] text-app-danger">{t("uploader.reason", { reason: doc.rejectionReason })}</div>
                )}
              </div>

              <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold", pillTone[state])}>
                {docStatusWords(t, docStatusLabel(doc, "owner", config.required))}
              </span>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {hasFile && doc && (
                  <a
                    href={docFileUrl(doc.filePath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("uploader.viewAria", { label })}
                    className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-app-ink transition hover:border-app-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-ink"
                  >
                    <Icon name="eye" size={16} />
                  </a>
                )}
                {!readOnly && !lockedStates.includes(state) && (
                  <>
                    <label
                      htmlFor={inputId}
                      aria-disabled={!canChange}
                      className={cx(
                        "inline-flex min-h-[40px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[13px] font-extrabold transition focus-within:outline focus-within:outline-2 focus-within:outline-app-ink",
                        canChange ? "cursor-pointer hover:border-app-line-strong" : "cursor-wait opacity-60",
                      )}
                    >
                      {row.busy === "upload" ? <><Spinner /> {t("uploader.uploading")}</> : hasFile ? t("uploader.replace") : state === "needs_file" ? t("uploader.uploadAgain") : t("uploader.chooseFile")}
                      <input
                        id={inputId}
                        type="file"
                        accept={DOC_FILE_ACCEPT}
                        className="sr-only"
                        disabled={!canChange}
                        aria-label={t("uploader.fileForAria", { label })}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) void handleFile(config.type, file);
                        }}
                      />
                    </label>
                    {doc && (
                      <button
                        type="button"
                        onClick={() => void handleRemove(config.type, doc.id)}
                        disabled={!canChange}
                        aria-label={t("uploader.removeAria", { label })}
                        className="grid h-10 w-10 place-items-center rounded-full border border-app-line bg-white text-app-danger transition hover:border-app-line-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-ink disabled:cursor-wait disabled:opacity-60"
                      >
                        {row.busy === "remove" ? <Spinner /> : <Icon name="trash" size={16} />}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {row.busy === "upload" && (
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-app-canvas"
                role="progressbar"
                aria-label={t("uploader.uploadingAria", { label })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={row.progress ?? 0}
              >
                <div className="h-full rounded-full bg-app-ink transition-[width]" style={{ width: `${row.progress ?? 0}%` }} />
              </div>
            )}
            {row.error && (
              <p role="alert" className="mb-0 mt-2 text-[13px] font-semibold text-app-danger">{row.error}</p>
            )}
          </li>
        );
      })}
    </ul>
    {!readOnly && <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">{t("uploader.formats", { formats: t.dynamic("uploader.formatsList", DOC_FORMATS_LABEL) })}</p>}
    </div>
  );
}
