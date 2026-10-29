"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { Pill, type Tone } from "@/components/app-kit";
import { Notice, cx } from "@/components/app-ui";
import { field } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";
import { friendlyError } from "@/lib/errors/report-client";
import { readyToSend, shrinkImage } from "@/lib/media/shrink-image";
import { DOC_FILE_ACCEPT, validateDocFile, type DocType, type VerificationDoc } from "@shared/verification-docs";
import type { ItemState } from "@shared/partner-tiers";
import type { KycState } from "@/lib/logistics/partner-kyc.server";
import { docFileUrl, uploadVerificationFile } from "@/components/verification/upload-client";

// Shared pieces of the partner sign-up flow (/logistics/verification): the API caller, status pills, the one-question
// screen frame and its choice buttons, photos as data URIs, and the CAC certificate upload.

export type { KycState };
export type KycT = ReturnType<typeof useKycT>;

export function useKycT() {
  return useT("partnerKyc", "verification");
}

/**
 * Calls a /api/logistics/kyc route; resolves with the page state it answers with, rejects with our readable message.
 * Without one (no connection, or a reply that isn't ours, like a timeout or a too-big request) it rejects with the
 * browser's error or the HTTP status, so friendlyError shows plain words and Admin › App errors sees what happened.
 * `retry` sends it once more after a gateway timeout or a dropped connection: only for steps that are safe to repeat
 * (saving a photo replaces the last one), never for a paid check like the NIN lookup. Partners on a weak signal hit
 * 504s right after coming back from the camera, and sending again a moment later goes through.
 */
export async function kycCall<T = KycState>(path: string, init?: RequestInit, { retry = false }: { retry?: boolean } = {}): Promise<T> {
  const url = `/api/logistics/kyc${path}`;
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (!retry) throw error;
    await pause(RETRY_PAUSE_MS);
    return kycCall<T>(path, init);
  }
  if (retry && GATEWAY_STATUSES.has(response.status)) {
    await pause(RETRY_PAUSE_MS);
    return kycCall<T>(path, init);
  }
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok || !body || body.data === undefined) throw new Error(body?.error?.message || `HTTP ${response.status} from ${init?.method ?? "GET"} ${url}`);
  return body.data;
}

const GATEWAY_STATUSES = new Set([502, 503, 504]);
const RETRY_PAUSE_MS = 1500;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
        setError(friendlyError(cause, t("page.failed")));
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

// ─── One question per screen ─────────────────────────────────────────────────

/** A sign-up screen: one question in large type, its input, and Continue at the bottom. */
export function QuestionFrame({ title, sub, error, children, onContinue, continueLabel, busy = false, canContinue = true }: {
  title: string;
  sub?: string;
  error?: string;
  children?: ReactNode;
  onContinue?: () => void;
  continueLabel?: string;
  busy?: boolean;
  canContinue?: boolean;
}) {
  const t = useKycT();
  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h2 className="m-0 text-[26px] font-extrabold leading-[1.15] tracking-[-0.5px] sm:text-[32px]">{title}</h2>
        {sub && <p className="m-0 text-[16px] leading-[1.5] text-app-ink-soft">{sub}</p>}
      </div>
      {children}
      <StepError error={error ?? ""} />
      {onContinue && (
        <button
          type="button"
          onClick={onContinue}
          disabled={busy || !canContinue}
          className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-app-ink px-6 text-[17px] font-extrabold text-white transition disabled:opacity-40"
        >
          {busy ? t("flow.saving") : continueLabel ?? t("flow.continue")}
        </button>
      )}
    </section>
  );
}

/** A big tap target for a one-tap answer (or one of several, with `selected`). */
export function Choice({ label, sub, icon, selected = false, onPick, disabled = false }: { label: string; sub?: string; icon?: ReactNode; selected?: boolean; onPick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onPick}
      className={cx(
        "flex min-h-[64px] w-full items-center gap-3 rounded-[18px] border-2 px-5 py-3 text-left transition disabled:opacity-50",
        selected ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
      )}
    >
      {icon && <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15 text-[22px]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-extrabold">{label}</span>
        {sub && <span className={cx("block text-[14px]", selected ? "text-white/80" : "text-app-ink-soft")}>{sub}</span>}
      </span>
    </button>
  );
}

export function readAsDataUri(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** A photo from the camera, shrunk to a JPEG data URI the kyc routes take. Null when it isn't a photo. */
export async function photoDataUri(file: File, maxSide = 1280): Promise<string | null> {
  const small = await shrinkImage(file, maxSide, "image/jpeg");
  return /^image\/(jpeg|png|webp)$/.test(small.type) ? readAsDataUri(small) : null;
}

/** "Take a photo" with the back camera, showing the photo once taken. */
export function PhotoTake({ value, onChange, takeLabel, retakeLabel, alt, facing = "environment" }: { value: string | null; onChange: (dataUri: string | null) => void; takeLabel: string; retakeLabel: string; alt: string; facing?: "environment" | "user" }) {
  const t = useKycT();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState("");
  return (
    <div className="grid gap-3">
      {value && <img src={value} alt={alt} className="max-h-[260px] w-full rounded-[18px] border border-app-line object-contain" />}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={facing}
        className="sr-only"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setProblem("");
          const uri = await photoDataUri(file).catch(() => null);
          if (!uri) return setProblem(t("selfie.badPhoto"));
          onChange(uri);
        }}
      />
      <button type="button" onClick={() => input.current?.click()} className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border-2 border-app-ink bg-white px-5 text-[16px] font-extrabold">
        {value ? retakeLabel : takeLabel}
      </button>
      {problem && <p className="m-0 text-[14px] font-bold text-app-danger" role="alert">{problem}</p>}
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
