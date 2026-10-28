"use client";

import { useRef, useState } from "react";
import { PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { shrinkImage } from "@/lib/media/shrink-image";
import { useKycT } from "./kit";
import { livenessUser } from "@shared/liveness-name";

// The "Quick selfie video" screen's capture. With a NIN slip the server matches it against the NIN's photo (Korapay
// facial matching, src/app/api/logistics/kyc/nin); with another ID the team compares it with the ID photo. When
// Korapay's liveness check is set up (NEXT_PUBLIC_KORAPAY_PUBLIC_KEY) it runs first (kora-identity-web-sdk, loaded
// only when used: the short video where they turn their head) and its reference goes with the selfie.

export type SelfieValue = { dataUri: string; liveness: { reference: string; passed: boolean } | null };

const LIVENESS_KEY = process.env.NEXT_PUBLIC_KORAPAY_PUBLIC_KEY?.trim() ?? "";
export const LIVENESS_ON = /^pk_(test|live)_/.test(LIVENESS_KEY);

function readAsDataUri(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** Korapay's liveness reference, wherever the SDK put it in its success payload. */
function livenessReference(result: unknown): string | null {
  const row = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
  const data = (row.data && typeof row.data === "object" ? row.data : {}) as Record<string, unknown>;
  const reference = [data.reference, row.reference, data.sessionId, row.sessionId].find((value) => typeof value === "string" && value.trim());
  return typeof reference === "string" ? reference.trim().slice(0, 120) : null;
}

export function SelfieCapture({ value, onChange, firstName, lastName, onStartFailed }: {
  value: SelfieValue | null;
  onChange: (value: SelfieValue | null) => void;
  firstName: string;
  lastName: string;
  /** The face check couldn't start here (no camera, camera blocked, Korapay refused): offer the phone instead. */
  onStartFailed?: () => void;
}) {
  const t = useKycT();
  const input = useRef<HTMLInputElement>(null);
  const [liveness, setLiveness] = useState<SelfieValue["liveness"]>(value?.liveness ?? null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState("");

  async function runLiveness() {
    setProblem("");
    setChecking(true);
    try {
      const { koraLivenessService } = await import("kora-identity-web-sdk");
      await koraLivenessService.checkLiveness({
        publicKey: LIVENESS_KEY,
        type: "passive",
        presentation: "modal",
        user: livenessUser(firstName, lastName, "Partner"),
        branding: { color: "#0E2A38" },
        onSuccess: (result: unknown) => {
          const reference = livenessReference(result);
          setChecking(false);
          if (!reference) {
            setProblem(t("selfie.livenessFailed"));
            return;
          }
          setLiveness({ reference, passed: true });
          if (value) onChange({ ...value, liveness: { reference, passed: true } });
        },
        onFailure: () => {
          setChecking(false);
          setProblem(t("selfie.livenessFailed"));
        },
        onClose: () => setChecking(false),
      });
    } catch (error) {
      console.error("[selfie] liveness check couldn't start", error);
      setChecking(false);
      setProblem(t("selfie.livenessUnavailable"));
      onStartFailed?.();
    }
  }

  async function takePhoto(file: File | undefined) {
    setProblem("");
    if (!file) return;
    const small = await shrinkImage(file, 720, "image/jpeg");
    if (!/^image\/(jpeg|png|webp)$/.test(small.type)) {
      setProblem(t("selfie.badPhoto"));
      return;
    }
    onChange({ dataUri: await readAsDataUri(small), liveness });
  }

  const needsLiveness = LIVENESS_ON && !liveness;
  return (
    <div className="grid gap-2">
      {LIVENESS_ON && (
        <div className="flex flex-wrap items-center gap-2">
          {liveness ? (
            <span className="inline-flex items-center gap-1.5 text-[14px] font-bold text-app-success"><Icon name="check" size={16} /> {t("selfie.livenessPassed")}</span>
          ) : (
            <PillButton tone="white" size="md" busy={checking} onClick={() => void runLiveness()}>{t("selfie.livenessStart")}</PillButton>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {value && <img src={value.dataUri} alt={t("selfie.preview")} className="h-20 w-20 rounded-full border border-navy/[0.06] object-cover" />}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="sr-only" onChange={(event) => { void takePhoto(event.target.files?.[0]); event.target.value = ""; }} />
        <PillButton tone="white" size="md" disabled={needsLiveness} onClick={() => input.current?.click()}>
          {value ? t("selfie.retake") : t("selfie.take")}
        </PillButton>
        {value && <button type="button" className="text-[13.5px] font-bold text-app-ink-soft underline" onClick={() => onChange(null)}>{t("selfie.remove")}</button>}
      </div>
      {needsLiveness && <p className="m-0 text-[13px] text-app-ink-soft">{t("selfie.livenessFirst")}</p>}
      {problem && <p className="m-0 text-[13.5px] font-bold text-app-danger" role="alert">{problem}</p>}
    </div>
  );
}
