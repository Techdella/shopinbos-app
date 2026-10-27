"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { Pill, type Tone } from "@/components/app-kit";
import { Notice, cx } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";
import { friendlyError } from "@/lib/errors/report-client";
import { readyToSend } from "@/lib/media/shrink-image";
import { DOC_FILE_ACCEPT, validateDocFile, type DocType, type VerificationDoc } from "@shared/verification-docs";
import type { ItemState } from "@shared/partner-tiers";
import type { KycState } from "@/lib/logistics/partner-kyc.server";
import { docFileUrl, uploadVerificationFile } from "@/components/verification/upload-client";

// Shared pieces of the partner verification flow (/logistics/verification): the API caller, status pills, a file
// picker that goes through the existing verification upload route, and small layout helpers.

export type { KycState };
export type KycT = ReturnType<typeof useKycT>;

export function useKycT() {
  return useT("partnerKyc", "verification");
}

/** Calls a /api/logistics/kyc route; resolves with the page state it answers with, rejects with a readable message. */
export async function kycCall<T = KycState>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/logistics/kyc${path}`, init).catch(() => null);
  const body = (await response?.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response?.ok || !body || body.data === undefined) throw new Error(body?.error?.message ?? "");
  return body.data;
}

export function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

/** Runs one action with a busy flag and an error message for the step. */
export function useAction(onState: (state: KycState) => void) {
  const t = useKycT();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const run = useCallback(
    async <T,>(name: string, action: () => Promise<T>, after?: (result: T) => void) => {
      setBusy(name);
      setError("");
      try {
        const result = await action();
        if (result && typeof result === "object" && "tier1" in (result as object)) onState(result as unknown as KycState);
        after?.(result);
        return true;
      } catch (cause) {
        setError(cause instanceof Error && cause.message ? cause.message : friendlyError(cause, t("page.failed")));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [onState, t],
  );
  return { busy, error, setError, run };
}

const TONES: Record<ItemState, Tone> = { missing: "muted", pending: "warning", approved: "success", rejected: "danger" };

export function StatusPill({ state, optional = false }: { state: ItemState; optional?: boolean }) {
  const t = useKycT();
  if (state === "missing" && optional) return <Pill tone="muted">{t("status.optional")}</Pill>;
  return <Pill tone={TONES[state]} dot>{t(`status.${state}`)}</Pill>;
}

/** A document's status as a check (see src/lib/logistics/partner-tiers.server.ts docCheckStatus). */
export function docItemState(doc: VerificationDoc | undefined): ItemState {
  if (!doc || (!doc.filePath && !doc.registry?.verified)) return "missing";
  if (doc.status === "approved") return "approved";
  if (doc.status === "rejected") return "rejected";
  return doc.status === "draft" ? "missing" : "pending";
}

export function StepCard({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
      <div>
        <h2 className="m-0 text-[20px] font-extrabold tracking-[-0.3px]">{title}</h2>
        {sub && <p className="m-0 mt-1 text-[14.5px] leading-[1.5] text-app-ink-soft">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

/** A labelled row inside a step: what it is, its status, and the controls under it. */
export function Row({ label, state, optional, reason, children }: { label: string; state?: ItemState; optional?: boolean; reason?: string | null; children?: ReactNode }) {
  const t = useKycT();
  return (
    <div className="grid gap-3 border-t border-app-line pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[15px] font-extrabold">{label}</span>
        {state && <StatusPill state={state} optional={optional} />}
      </div>
      {state === "rejected" && reason && <Notice tone="error">{t("status.rejectedReason", { reason })}</Notice>}
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={field.label}>{label}</span>
      {children}
      {hint && <span className={cx(field.hint, "block")}>{hint}</span>}
    </label>
  );
}

export function StepError({ error }: { error: string }) {
  return error ? <Notice tone="error">{error}</Notice> : null;
}

/** Upload (or replace) one verification document through /api/logistics/verification/upload. */
export function DocUpload({ type, doc, hint, imagesOnly = false, onDone }: { type: DocType; doc?: VerificationDoc; hint?: string; imagesOnly?: boolean; onDone: () => void }) {
  const t = useKycT();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const locked = doc?.status === "submitted" || doc?.status === "under_review" || doc?.status === "approved";

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    const ready = await readyToSend(file);
    const invalid = validateDocFile(ready);
    if (invalid) return setError(invalid);
    setProgress(0);
    try {
      await uploadVerificationFile("/api/logistics/verification/upload", type, ready, setProgress, t);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("page.failed"));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-2">
      {hint && <p className="m-0 text-[13.5px] leading-[1.5] text-app-ink-soft">{hint}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {!locked && (
          <>
            <input
              ref={input}
              id={id}
              type="file"
              accept={imagesOnly ? "image/jpeg,image/png,image/webp" : DOC_FILE_ACCEPT}
              {...(imagesOnly && type === "selfie" ? { capture: "user" as const } : {})}
              className="sr-only"
              onChange={(event) => void pick(event.target.files?.[0])}
            />
            <label htmlFor={id} className="inline-flex min-h-[40px] cursor-pointer items-center rounded-full border border-app-line bg-white px-4 text-[13px] font-bold hover:border-app-line-strong">
              {progress !== null ? `${t("file.uploading")} ${progress}%` : doc?.filePath ? t("file.replace") : t("file.choose")}
            </label>
          </>
        )}
        {doc?.filePath && (
          <a href={docFileUrl(doc.filePath)} target="_blank" rel="noreferrer" className="text-[13.5px] font-bold text-app-ink underline underline-offset-4">
            {t("file.view")} · {doc.fileName}
          </a>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/** Picks a file without uploading it (vehicle photos go up together with the vehicle). */
export function FilePick({ label, file, onPick, imagesOnly = true }: { label: string; file: File | null; onPick: (file: File | null) => void; imagesOnly?: boolean }) {
  const t = useKycT();
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <span className={field.label}>{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={id}
          type="file"
          accept={imagesOnly ? "image/jpeg,image/png,image/webp" : DOC_FILE_ACCEPT}
          className="sr-only"
          onChange={async (event) => {
            const picked = event.target.files?.[0];
            onPick(picked ? await readyToSend(picked) : null);
          }}
        />
        <label htmlFor={id} className="inline-flex min-h-[40px] cursor-pointer items-center rounded-full border border-app-line bg-white px-4 text-[13px] font-bold hover:border-app-line-strong">
          {file ? t("file.replace") : t("file.choose")}
        </label>
        {file && <span className="min-w-0 truncate text-[13.5px] text-app-ink-soft">{file.name}</span>}
      </div>
    </div>
  );
}

/** One of the flow's "send a code, then type it" pairs (phone, email). */
export function CodeConfirm({ busy, onConfirm }: { busy: boolean; onConfirm: (code: string) => void }) {
  const t = useKycT();
  const [code, setCode] = useState("");
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={t("id.code")}>
        <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className={cx(field.input, "max-w-[180px] tracking-[0.3em]")} />
      </Field>
      <button type="button" disabled={busy || code.length !== 6} onClick={() => onConfirm(code)} className="inline-flex min-h-12 items-center rounded-full bg-app-ink px-5 text-[14px] font-bold text-white disabled:opacity-50">
        {t("id.confirmCode")}
      </button>
    </div>
  );
}
