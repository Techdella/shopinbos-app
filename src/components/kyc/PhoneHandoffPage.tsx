"use client";

import { useState } from "react";
import { Notice, PillButton, Wordmark, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { field } from "@/components/seller-core";
import { Choice, PhotoTake, useKycT } from "@/components/logistics/verification/kit";
import { SelfieCapture, type SelfieValue } from "@/components/logistics/verification/SelfieCapture";
import { ID_TYPES, type IdType } from "@shared/partner-tiers";
import type { HandoffInfo } from "@/lib/kyc/handoff.server";

// The phone end of "Do it on your phone" (/verify/phone/[token]): just the selfie (with Korapay's face check) or the
// ID photo, sent with the link's token to /api/handoff/[token], which runs the same step as the signed-in screen.
// Then "Done. Go back to your computer.": the computer's screen notices and moves on by itself.

export function PhoneHandoffPage({ token, info }: { token: string; info: HandoffInfo }) {
  const t = useT("handoff");
  const k = useKycT();
  const [shot, setShot] = useState<SelfieValue | null>(null);
  const [idType, setIdType] = useState<IdType | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [nin, setNin] = useState({ nin: "", firstName: info.firstName, lastName: info.lastName, dateOfBirth: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const isSelfie = info.purpose === "selfie";
  const needIdFirst = isSelfie && info.kind === "supplier" && !info.hasIdPhoto;
  const ninReady = !info.needsNin || (nin.nin.length === 11 && nin.firstName.trim().length >= 2 && nin.lastName.trim().length >= 2 && Boolean(nin.dateOfBirth));
  const ready = isSelfie ? Boolean(shot) && ninReady && !needIdFirst : Boolean(idType && photo);

  async function send() {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    const body = isSelfie
      ? { selfie: shot?.dataUri, liveness: shot?.liveness ?? undefined, ...(info.needsNin ? nin : {}) }
      : { idType, photo };
    const response = await fetch(`/api/handoff/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await response?.json().catch(() => null)) as { data?: { done?: boolean }; error?: { message?: string } } | null;
    setBusy(false);
    if (response?.ok && answer?.data?.done) return setDone(true);
    if (isSelfie) setShot(null);
    setError(answer?.error?.message || t("page.failed"));
  }

  const input = cx(field.input, "min-h-[52px] text-[17px]");
  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-[520px] content-start gap-5 bg-app-canvas px-4 py-6 font-app text-app-ink">
      <Wordmark />
      {done ? (
        <div className="grid justify-items-center gap-3 rounded-[22px] bg-white p-6 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-app-success-tint text-app-success"><Icon name="check" size={28} /></span>
          <h1 className="m-0 text-[24px] font-extrabold leading-tight">{t("page.doneTitle")}</h1>
          <p className="m-0 text-[15.5px] text-app-ink-soft">{t("page.doneBody")}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-1.5">
            <h1 className="m-0 text-[28px] font-extrabold leading-tight tracking-[-0.5px]">{isSelfie ? k("q.selfie.title") : k("q.id.title")}</h1>
            <p className="m-0 text-[16px] text-app-ink-soft">{isSelfie ? k("q.selfie.sub") : k("q.id.sub")}</p>
          </div>
          {needIdFirst ? (
            <Notice tone="info">{t("page.needIdFirst")}</Notice>
          ) : isSelfie ? (
            <>
              <div className="grid place-items-center gap-2 rounded-[22px] bg-app-ink p-6 text-white">
                <span aria-hidden className="grid h-36 w-28 place-items-center rounded-[50%] border-4 border-dashed border-white/70" />
                <span className="text-center text-[15px]">{k("q.selfie.how")}</span>
              </div>
              <SelfieCapture value={shot} onChange={setShot} firstName={nin.firstName} lastName={nin.lastName} />
              {info.needsNin && (
                <div className="grid gap-3 rounded-[18px] border border-app-line bg-white p-4">
                  <p className="m-0 text-[15px] text-app-ink-soft">{k("q.id.ninHint")}</p>
                  <label className="grid gap-1.5"><span className={field.label}>{k("id.nin")}</span><input value={nin.nin} onChange={(event) => setNin({ ...nin, nin: event.target.value.replace(/\D/g, "").slice(0, 11) })} inputMode="numeric" className={input} /></label>
                  <label className="grid gap-1.5"><span className={field.label}>{k("id.firstName")}</span><input value={nin.firstName} onChange={(event) => setNin({ ...nin, firstName: event.target.value })} autoComplete="given-name" className={input} /></label>
                  <label className="grid gap-1.5"><span className={field.label}>{k("id.lastName")}</span><input value={nin.lastName} onChange={(event) => setNin({ ...nin, lastName: event.target.value })} autoComplete="family-name" className={input} /></label>
                  <label className="grid gap-1.5"><span className={field.label}>{k("id.dob")}</span><input type="date" value={nin.dateOfBirth} onChange={(event) => setNin({ ...nin, dateOfBirth: event.target.value })} className={input} /></label>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid gap-3">
                {ID_TYPES.map((type) => <Choice key={type} label={k(`idType.${type}` as "idType.nin_slip")} selected={idType === type} onPick={() => setIdType(type)} />)}
              </div>
              {idType && <PhotoTake value={photo} onChange={setPhoto} takeLabel={k("q.id.take")} retakeLabel={k("q.photo.retake")} alt={k("q.id.title")} />}
            </>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          {!needIdFirst && <PillButton disabled={!ready} busy={busy} onClick={() => void send()} className="w-full">{t("page.send")}</PillButton>}
        </>
      )}
    </main>
  );
}

/** The link is expired or doesn't work: say so and what to do. */
export function PhoneHandoffProblem({ reason }: { reason: "invalid" | "expired" | "unavailable" }) {
  const t = useT("handoff");
  const expired = reason === "expired";
  return (
    <main className="mx-auto grid min-h-[100dvh] max-w-[520px] content-start gap-5 bg-app-canvas px-4 py-6 font-app text-app-ink">
      <Wordmark />
      <div className="grid gap-2 rounded-[22px] bg-white p-6">
        <h1 className="m-0 text-[24px] font-extrabold leading-tight">{expired ? t("page.expiredTitle") : t("page.brokenTitle")}</h1>
        <p className="m-0 text-[15.5px] text-app-ink-soft">{expired ? t("page.expiredBody") : t("page.brokenBody")}</p>
      </div>
    </main>
  );
}
