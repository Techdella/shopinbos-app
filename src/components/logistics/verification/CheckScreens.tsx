"use client";

import Link from "next/link";
import { useState } from "react";
import { Notice, cx } from "@/components/app-ui";
import { Pill } from "@/components/app-kit";
import { field } from "@/components/seller-core";
import { Icon } from "@/components/ui/Icon";
import { NG_STATES } from "@shared/delivery-market";
import { ID_TYPES, ITEM_SCREEN, TIER1_ITEMS, type FlowScreen, type IdType, type ItemState } from "@shared/partner-tiers";
import { Choice, CodeConfirm, PhotoTake, QuestionFrame, StatusPill, jsonInit, kycCall, useAction, useKycT, type KycState } from "./kit";
import { SelfieCapture, type SelfieValue } from "./SelfieCapture";
import { SelfieWays } from "@/components/onboarding/SelfieWays";
import type { ScreenProps } from "./QuestionScreens";

// Screens 8–11 of the partner sign-up: where they're based (location, address, optional photo), a photo of their ID,
// a selfie with Korapay's liveness check, then review and send ("You're in review" once sent, their status after).

/** NIN details typed on the ID screen, checked with the selfie on the next one (never stored before the check). */
export type NinDraft = { nin: string; firstName: string; lastName: string; dateOfBirth: string };

export function BaseScreen({ state, onState, onDone }: ScreenProps) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const base = state.identity.base;
  const [address, setAddress] = useState(base?.address ?? state.identity.address?.value ?? "");
  const [baseState, setBaseState] = useState(base?.state ?? state.flow.answers.homeState ?? "");
  const [spot, setSpot] = useState<{ lat: number; lng: number } | null>(base?.lat !== undefined && base.lng !== undefined ? { lat: base.lat, lng: base.lng } : null);
  const [locating, setLocating] = useState(false);
  const [locateProblem, setLocateProblem] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const hasPhoto = state.docs.some((doc) => doc.type === "base-photo" && doc.filePath);

  function locate() {
    setLocateProblem("");
    if (!navigator.geolocation) return setLocateProblem(t("q.base.locateFailed"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setSpot({ lat: Math.round(position.coords.latitude * 1e6) / 1e6, lng: Math.round(position.coords.longitude * 1e6) / 1e6 });
      },
      () => {
        setLocating(false);
        setLocateProblem(t("q.base.locateFailed"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <QuestionFrame
      title={t("q.base.title")}
      sub={t("q.base.sub")}
      error={error}
      busy={busy === "base"}
      canContinue={address.trim().length >= 5}
      onContinue={() => void run("base", () => kycCall("/base", jsonInit("POST", { address, state: baseState || undefined, ...(spot ?? {}), photo: photo ?? undefined })), onDone)}
    >
      <button type="button" onClick={locate} disabled={locating} className={cx("inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border-2 px-5 text-[16px] font-extrabold", spot ? "border-app-success bg-app-success-tint" : "border-app-ink bg-white")}>
        <Icon name={spot ? "check" : "pin"} size={18} /> {locating ? t("q.base.locating") : spot ? t("q.base.located") : t("q.base.locate")}
      </button>
      {locateProblem && <p className="m-0 text-[14px] font-bold text-app-danger" role="alert">{locateProblem}</p>}
      <label className="grid gap-1.5">
        <span className={field.label}>{t("q.base.address")}</span>
        <textarea value={address} onChange={(event) => setAddress(event.target.value)} rows={2} autoComplete="street-address" className={cx(field.textarea, "text-[17px]")} />
      </label>
      <label className="grid gap-1.5">
        <span className={field.label}>{t("q.base.state")}</span>
        <select value={baseState} onChange={(event) => setBaseState(event.target.value)} className={cx(field.select, "min-h-[52px] text-[16px]")}>
          <option value="">{t("q.base.pickState")}</option>
          {NG_STATES.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <div className="grid gap-2 rounded-[18px] border border-dashed border-app-line-strong bg-white p-4">
        <span className="text-[16px] font-extrabold">{t("q.base.photo")}</span>
        <span className="text-[14px] text-app-ink-soft">{hasPhoto && !photo ? t("q.base.photoSent") : t("q.base.photoHint")}</span>
        <PhotoTake value={photo} onChange={setPhoto} takeLabel={t("q.base.takePhoto")} retakeLabel={t("q.photo.retake")} alt={t("q.base.photo")} />
      </div>
    </QuestionFrame>
  );
}

export function IdScreen({ state, onState, onDone, draft, onDraft }: ScreenProps & { draft: NinDraft; onDraft: (draft: NinDraft) => void }) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const [idType, setIdType] = useState<IdType | null>(state.identity.idDocument?.type ?? null);
  const [photo, setPhoto] = useState<string | null>(null);
  const sent = state.tier1.idDocument === "approved" || state.tier1.idDocument === "pending";
  const ninDone = state.identity.nin?.status === "approved";
  const ninNeeded = idType === "nin_slip" && !ninDone;
  const ninReady = !ninNeeded || (draft.nin.length === 11 && draft.firstName.trim().length >= 2 && draft.lastName.trim().length >= 2 && Boolean(draft.dateOfBirth));
  const canContinue = Boolean(idType) && (Boolean(photo) || (sent && idType === state.identity.idDocument?.type)) && ninReady;

  return (
    <QuestionFrame
      title={t("q.id.title")}
      sub={t("q.id.sub")}
      error={error}
      busy={busy === "id"}
      canContinue={canContinue}
      onContinue={() => (photo ? void run("id", () => kycCall("/id-document", jsonInit("POST", { idType, photo })), onDone) : onDone())}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {ID_TYPES.map((type) => <Choice key={type} label={t(`idType.${type}` as "idType.nin_slip")} selected={idType === type} onPick={() => setIdType(type)} />)}
      </div>
      {idType && (
        <>
          {sent && !photo && idType === state.identity.idDocument?.type && <Notice tone="success">{t("q.id.sent")}</Notice>}
          <PhotoTake value={photo} onChange={setPhoto} takeLabel={t("q.id.take")} retakeLabel={t("q.photo.retake")} alt={t("q.id.title")} />
          {ninNeeded && <NinFields draft={draft} onDraft={onDraft} />}
        </>
      )}
    </QuestionFrame>
  );
}

function NinFields({ draft, onDraft }: { draft: NinDraft; onDraft: (draft: NinDraft) => void }) {
  const t = useKycT();
  const input = cx(field.input, "min-h-[52px] text-[17px]");
  return (
    <div className="grid gap-3 rounded-[18px] border border-app-line bg-white p-4">
      <p className="m-0 text-[15px] text-app-ink-soft">{t("q.id.ninHint")}</p>
      <label className="grid gap-1.5"><span className={field.label}>{t("id.nin")}</span><input value={draft.nin} onChange={(event) => onDraft({ ...draft, nin: event.target.value.replace(/\D/g, "").slice(0, 11) })} inputMode="numeric" className={input} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5"><span className={field.label}>{t("id.firstName")}</span><input value={draft.firstName} onChange={(event) => onDraft({ ...draft, firstName: event.target.value })} autoComplete="given-name" className={input} /></label>
        <label className="grid gap-1.5"><span className={field.label}>{t("id.lastName")}</span><input value={draft.lastName} onChange={(event) => onDraft({ ...draft, lastName: event.target.value })} autoComplete="family-name" className={input} /></label>
      </div>
      <label className="grid gap-1.5"><span className={field.label}>{t("id.dob")}</span><input type="date" value={draft.dateOfBirth} onChange={(event) => onDraft({ ...draft, dateOfBirth: event.target.value })} className={input} /></label>
    </div>
  );
}

export function SelfieScreen({ state, onState, onDone, draft, onDraft }: ScreenProps & { draft: NinDraft; onDraft: (draft: NinDraft) => void }) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const [shot, setShot] = useState<SelfieValue | null>(null);
  const byNin = state.identity.idDocument?.type === "nin_slip" && state.identity.nin?.status !== "approved";
  const ninReady = draft.nin.length === 11 && draft.firstName.trim().length >= 2 && draft.lastName.trim().length >= 2 && Boolean(draft.dateOfBirth);
  const sent = state.tier1.selfie === "approved" || state.tier1.selfie === "pending";
  const selfie = state.docs.find((doc) => doc.type === "selfie");

  function send() {
    if (!shot) return onDone();
    const call = byNin
      ? () => kycCall("/nin", jsonInit("POST", { ...draft, selfie: shot.dataUri, liveness: shot.liveness ?? undefined }))
      : () => kycCall("/selfie", jsonInit("POST", { selfie: shot.dataUri, liveness: shot.liveness ?? undefined }));
    void run("selfie", call, () => { setShot(null); onDone(); });
  }

  return (
    <QuestionFrame title={t("q.selfie.title")} sub={t("q.selfie.sub")} error={error} busy={busy === "selfie"} canContinue={(Boolean(shot) && (!byNin || ninReady)) || (sent && !shot)} onContinue={send}>
      {state.tier1.selfie === "rejected" && selfie?.rejectionReason && <Notice tone="error">{t("status.rejectedReason", { reason: selfie.rejectionReason })}</Notice>}
      {sent && !shot && <Notice tone="success">{state.tier1.selfie === "approved" ? t("selfie.matched") : t("selfie.waiting")}</Notice>}
      {/* On a computer: "Continue on my phone" (this page on the phone, moving on here once the selfie is in) or this camera. */}
      <SelfieWays
        phonePath="/logistics/verification?step=selfie"
        check={async () => {
          const next = await kycCall("");
          const arrived = !sent && (next.tier1.selfie === "approved" || next.tier1.selfie === "pending");
          if (arrived) onState(next);
          return arrived;
        }}
        onArrived={onDone}
      >
        <div className="grid gap-3">
          <div className="grid place-items-center gap-2 rounded-[22px] bg-app-ink p-6 text-white">
            <span aria-hidden className="grid h-36 w-28 place-items-center rounded-[50%] border-4 border-dashed border-white/70" />
            <span className="text-center text-[15px]">{t("q.selfie.how")}</span>
          </div>
          <SelfieCapture value={shot} onChange={setShot} firstName={draft.firstName} lastName={draft.lastName} />
        </div>
      </SelfieWays>
      {byNin && !ninReady && <NinFields draft={draft} onDraft={onDraft} />}
      {!state.idChecksReady && byNin && <p className="m-0 text-[14px] text-app-ink-soft">{t("id.ninManual")}</p>}
    </QuestionFrame>
  );
}

const TONE: Record<string, string> = {
  unverified: "bg-[#FDF0D5]",
  pending_review: "bg-[#E8EAFB]",
  tier1_verified: "bg-app-success-tint",
  tier2_verified: "bg-app-success-tint",
  rejected: "bg-app-danger-tint",
  suspended: "bg-app-danger-tint",
};

/** Screen 11: what's still needed (phone, terms), Send, then "You're in review" and the status after. */
export function ReviewScreen({ state, onState, goTo }: Omit<ScreenProps, "onDone"> & { goTo: (screen: FlowScreen) => void }) {
  const t = useKycT();
  const { busy, error, run } = useAction(onState);
  const [agreed, setAgreed] = useState(state.termsCurrent);
  const [phone, setPhone] = useState(state.identity.phone?.value ?? "");
  const [challenge, setChallenge] = useState<string | null>(null);
  const blocking = TIER1_ITEMS.filter((item) => item !== "terms" && (state.tier1[item] === "missing" || state.tier1[item] === "rejected"));
  const sent = Boolean(state.submittedAt);
  const verified = state.state === "tier1_verified" || state.state === "tier2_verified";
  const showStatus = sent && (state.state === "pending_review" || verified || state.state === "suspended") && blocking.length === 0;

  async function submit() {
    if (!state.termsCurrent && !(await run("terms", () => kycCall("/terms", { method: "POST" })))) return;
    await run("submit", () => kycCall("/submit", { method: "POST" }));
  }

  if (showStatus) {
    return (
      <section className="grid gap-5">
        <div className={cx("grid gap-3 rounded-[22px] p-6", TONE[state.state])}>
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white"><Icon name={verified ? "check" : "clock"} size={26} /></span>
          <h2 className="m-0 text-[26px] font-extrabold leading-[1.15] tracking-[-0.5px] sm:text-[32px]">{verified ? t(`state.${state.state}`) : state.state === "suspended" ? t("state.suspended") : t("q.done.title")}</h2>
          <p className="m-0 text-[16px] leading-[1.5]">{verified ? t(`state.${state.state}.body`) : state.state === "suspended" ? t("state.suspended.body") : t("q.done.body")}</p>
          {state.badges.length > 0 && <div className="flex flex-wrap gap-1.5">{state.badges.map((badge) => <Pill key={badge} tone="success">{t.dynamic(`badge.${badge}`, badge)}</Pill>)}</div>}
        </div>
        <Extras state={state} goTo={goTo} />
      </section>
    );
  }

  const line = (item: (typeof TIER1_ITEMS)[number], value: ItemState) => (
    <li key={item} className="flex flex-wrap items-center gap-2 border-t border-app-line py-3 first:border-t-0">
      <span className="min-w-0 flex-1 text-[16px]">{t(`item.${item}`)}</span>
      <StatusPill state={value} />
      {(value === "missing" || value === "rejected") && item !== "terms" && item !== "phone" && (
        <button type="button" onClick={() => goTo(ITEM_SCREEN[item])} className="text-[15px] font-bold underline underline-offset-4">{t("rev.fix")}</button>
      )}
    </li>
  );

  return (
    <QuestionFrame
      title={state.state === "rejected" ? t("state.rejected") : t("q.review.title")}
      sub={state.state === "rejected" ? state.statusReason ?? t("state.rejected.body") : t("q.review.sub")}
      error={error}
      busy={busy === "submit" || busy === "terms"}
      canContinue={blocking.length === 0 && agreed && state.state !== "suspended"}
      continueLabel={state.submittedAt ? t("rev.resubmit") : t("rev.submit")}
      onContinue={() => void submit()}
    >
      <ul className="m-0 list-none rounded-[18px] border border-app-line bg-white px-4 py-1">{TIER1_ITEMS.map((item) => line(item, item === "terms" && agreed ? "approved" : state.tier1[item]))}</ul>
      {state.tier1.phone !== "approved" && (
        <div className="grid gap-3 rounded-[18px] border border-app-line bg-white p-4">
          <span className="text-[16px] font-extrabold">{t("q.review.phone")}</span>
          <div className="flex flex-wrap items-end gap-2">
            <input value={phone} onChange={(event) => { setPhone(event.target.value); setChallenge(null); }} inputMode="tel" autoComplete="tel" aria-label={t("id.phone")} placeholder="0803 123 4567" className={cx(field.input, "min-h-[52px] text-[17px] sm:max-w-[280px]")} />
            <button type="button" disabled={!phone.trim() || busy === "phone-send"} onClick={() => void run("phone-send", () => kycCall<{ challenge: string }>("/phone", jsonInit("POST", { action: "send", phone })), (result) => setChallenge(result.challenge))} className="inline-flex min-h-[52px] items-center rounded-full border-2 border-app-ink bg-white px-5 text-[15px] font-extrabold disabled:opacity-50">
              {t("id.sendCode")}
            </button>
          </div>
          {challenge && (
            <>
              <p className="m-0 text-[14px] text-app-ink-soft">{t("id.codeSent", { to: phone })}</p>
              <CodeConfirm busy={busy === "phone-verify"} onConfirm={(code) => void run("phone-verify", () => kycCall("/phone", jsonInit("POST", { action: "verify", phone, challenge, code })), () => setChallenge(null))} />
            </>
          )}
        </div>
      )}
      {!state.termsCurrent && (
        <label className="flex items-start gap-3 text-[16px]">
          <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className={`${field.checkbox} mt-1`} />
          <span>
            {t("rev.terms")} · <Link href="/logistics/terms" target="_blank" className="font-bold underline underline-offset-4">{t("rev.readTerms")}</Link>
          </span>
        </label>
      )}
      {blocking.length > 0 && <Notice tone="info">{t("rev.missing", { items: blocking.map((item) => t(`item.${item}`)).join(", ") })}</Notice>}
      <p className="m-0 flex gap-2 text-[14px] leading-[1.5] text-app-ink-soft"><Icon name="lock" size={16} className="mt-0.5 shrink-0" /> {t("q.charge.podLater")}</p>
    </QuestionFrame>
  );
}

/** After sending: CAC for Registered Business, the base photo for Address Verified, and the bank account for payouts. */
function Extras({ state, goTo }: { state: KycState; goTo: (screen: FlowScreen) => void }) {
  const t = useKycT();
  const hasBasePhoto = state.docs.some((doc) => doc.type === "base-photo" && doc.filePath);
  const rows = [
    state.tier !== "tier2" ? { key: "cac", title: t("q.extra.cac"), sub: t("q.extra.cacSub"), action: () => goTo("cac") } : null,
    !hasBasePhoto ? { key: "base", title: t("q.extra.base"), sub: t("q.extra.baseSub"), action: () => goTo("base") } : null,
    !state.badges.includes("payout_ready") ? { key: "bank", title: t("q.extra.bank"), sub: t("q.extra.bankSub"), href: "/logistics/wallet" } : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);
  if (!rows.length) return null;
  return (
    <div className="grid gap-3">
      <h3 className="m-0 text-[17px] font-extrabold">{t("q.extra.title")}</h3>
      {rows.map((row) =>
        "href" in row && row.href ? (
          <Link key={row.key} href={row.href} className="flex min-h-[64px] items-center gap-3 rounded-[18px] border-2 border-app-line bg-white px-5 py-3 no-underline">
            <span className="min-w-0 flex-1"><span className="block text-[16px] font-extrabold text-app-ink">{row.title}</span><span className="block text-[14px] text-app-ink-soft">{row.sub}</span></span>
            <Icon name="arrow" size={16} />
          </Link>
        ) : (
          <Choice key={row.key} label={row.title} sub={row.sub} onPick={"action" in row && row.action ? row.action : () => undefined} />
        ),
      )}
      <p className="m-0 text-[14px]"><Link href="/logistics/cac-help" className="font-bold underline underline-offset-4">{t("page.cacHelpLink")}</Link></p>
    </div>
  );
}
