"use client";

import { useRef, useState } from "react";
import { PillButton } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { shrinkImage } from "@/lib/media/shrink-image";

// "Quick selfie video" for supplier onboarding. When Korapay's liveness check is set up
// (NEXT_PUBLIC_KORAPAY_PUBLIC_KEY), it runs first (kora-identity-web-sdk, loaded only when used: the face outline and
// "turn your head slowly") and its reference goes with the selfie; then the front camera takes the photo the server
// matches against the NIN's photo (/api/supplier/kyc/selfie). The delivery partner flow has its own copy
// (src/components/logistics/verification/SelfieCapture.tsx).

export type SelfieValue = { dataUri: string; liveness: { reference: string; passed: boolean } | null };

const LIVENESS_KEY = process.env.NEXT_PUBLIC_KORAPAY_PUBLIC_KEY?.trim() ?? "";
export const LIVENESS_ON = /^pk_(test|live)_/.test(LIVENESS_KEY);

export function readAsDataUri(file: Blob) {
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
  const t = useT("supplierJoin");
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
        user: { firstName: firstName.trim() || "Supplier", lastName: lastName.trim() || undefined },
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
    <div className="grid justify-items-center gap-4 text-center">
      <div className="grid h-44 w-44 place-items-center overflow-hidden rounded-full border-4 border-dashed border-app-line bg-white">
        {value ? <img src={value.dataUri} alt={t("selfie.preview")} className="h-full w-full object-cover" /> : <Icon name="user" size={64} />}
      </div>
      {LIVENESS_ON &&
        (liveness ? (
          <span className="inline-flex items-center gap-1.5 text-[15px] font-bold text-app-success"><Icon name="check" size={16} /> {t("selfie.livenessPassed")}</span>
        ) : (
          <PillButton tone="ink" size="md" busy={checking} onClick={() => void runLiveness()}>{t("selfie.livenessStart")}</PillButton>
        ))}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="user" className="sr-only" onChange={(event) => { void takePhoto(event.target.files?.[0]); event.target.value = ""; }} />
      <PillButton tone={needsLiveness ? "white" : "ink"} size="md" disabled={needsLiveness} onClick={() => input.current?.click()}>
        <Icon name="image" size={16} /> {value ? t("selfie.retake") : t("selfie.take")}
      </PillButton>
      {needsLiveness && <p className="m-0 text-[14px] text-app-ink-soft">{t("selfie.livenessFirst")}</p>}
      {problem && <p className="m-0 text-[14px] font-bold text-app-danger" role="alert">{problem}</p>}
    </div>
  );
}
