"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BackButton, Notice, PillButton, ProgressBars, TextInput, Wordmark, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import intentRouting from "@/lib/intent-routing";
import { shrinkImage } from "@/lib/media/shrink-image";
import { whatsappChatUrl } from "@/lib/support-contact";
import { StepRail } from "./StepRail";
import type { SupplierOnboardingView } from "@/lib/kyc/supplier-onboarding.server";
import { NG_STATES } from "@shared/delivery-market";
import {
  BUY_MODES,
  SUPPLIER_ID_TYPES,
  SUPPLY_SOURCES,
  nextStep,
  previousStep,
  stepPosition,
  supplierSteps,
  supplierTierBadges,
  type BuyMode,
  type CacAnswer,
  type SupplierIdType,
  type SupplierOnboardingStep,
  type SupplySource,
} from "@shared/supplier-onboarding";
import { SelfieCapture, readAsDataUri, type SelfieValue } from "./supplier/SelfieCapture";
import { PhoneOrThisDevice } from "@/components/kyc/PhoneHandoff";
import { docStamp } from "@/lib/kyc/handoff-shared";

// Supplier onboarding, one question per screen (shared/supplier-onboarding.ts has the order and rules): one question in
// large text, one answer, Continue at the bottom, back arrow top-left, "Step X of N" and a WhatsApp "Need help?".
// Every Continue saves to /api/supplier/onboarding with the next screen, so leaving and coming back resumes there.
// The ID photo and selfie go to /api/supplier/kyc/*, the first product to /api/supplier/onboarding/first-product.
// Wide screens (2026 "Web onboarding, verify identity"): the steps listed on the left (./StepRail.tsx) with "No BVN
// needed", and the selfie and ID photo can be taken on the phone instead (src/components/kyc/PhoneHandoff.tsx). Pre-order shows locked until the
// Established level (shared/supplier-onboarding.ts cleanBuyModes; the API drops it too).

type View = SupplierOnboardingView;
type ApiAnswer<T> = { data?: T; error?: { message?: string } };

async function call<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const response = await fetch(url, { ...rest, headers: json === undefined ? rest.headers : { "Content-Type": "application/json" }, body: json === undefined ? rest.body : JSON.stringify(json) });
  const body = (await response.json().catch(() => null)) as ApiAnswer<T> | null;
  if (!response.ok || !body || body.data === undefined) throw new Error(body?.error?.message || "");
  return body.data;
}

const chip = (on: boolean) =>
  cx(
    "min-h-[52px] rounded-[16px] border px-4 text-left text-[16px] font-bold transition",
    on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
  );

export function SupplierOnboarding({ initialView }: { initialView: View }) {
  const t = useT("supplierJoin");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState(initialView);
  const [step, setStep] = useState<SupplierOnboardingStep>(initialView.completed ? "review" : initialView.step ?? "name");
  const [cacPhase, setCacPhase] = useState<"ask" | "number" | "confirm">("ask");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const [name, setName] = useState(initialView.displayName || initialView.businessName || "");
  const [cacNumber, setCacNumber] = useState(initialView.cac?.number ?? "");
  const [cacFound, setCacFound] = useState<{ name: string; verified: boolean } | null>(null);
  const [cats, setCats] = useState<string[]>(initialView.categories);
  const preorderLocked = initialView.preorderLocked;
  const [modes, setModes] = useState<BuyMode[]>(initialView.buyModes.filter((mode): mode is BuyMode => (BUY_MODES as readonly string[]).includes(mode) && !(mode === "preorder" && preorderLocked)));
  const [moq, setMoq] = useState(initialView.minimumOrder ?? 10);
  const [state, setState] = useState(initialView.originState ?? "");
  const [area, setArea] = useState(initialView.city && initialView.city !== initialView.originState ? initialView.city : "");
  const [address, setAddress] = useState(initialView.address ?? "");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(initialView.pickupLat !== null && initialView.pickupLng !== null ? { lat: initialView.pickupLat, lng: initialView.pickupLng } : null);
  const [locating, setLocating] = useState(false);
  const [idType, setIdType] = useState<SupplierIdType | null>(initialView.idType);
  const [idPhoto, setIdPhoto] = useState<string | null>(null);
  const [nin, setNin] = useState("");
  const [firstName, setFirstName] = useState(initialView.owner.firstName);
  const [lastName, setLastName] = useState(initialView.owner.lastName);
  const [dob, setDob] = useState("");
  const [selfie, setSelfie] = useState<SelfieValue | null>(null);
  const [productPhoto, setProductPhoto] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const idInput = useRef<HTMLInputElement>(null);
  const productInput = useRef<HTMLInputElement>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  // "Do it on your phone": the ID photo's and selfie's stamps when their screen opened, and the view the phone produced.
  const opened = useRef({ id: docStamp(initialView.idDocument), selfie: docStamp(initialView.selfie) });
  const fromPhone = useRef<View | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => {
    opened.current = { id: docStamp(viewRef.current.idDocument), selfie: docStamp(viewRef.current.selfie) };
  }, [step]);
  const phoneArrived = (kind: "id" | "selfie") => async () => {
    const fresh = await call<View>("/api/supplier/onboarding");
    fromPhone.current = fresh;
    return docStamp(kind === "id" ? fresh.idDocument : fresh.selfie) !== opened.current[kind];
  };
  function phoneSent(kind: "id" | "selfie") {
    const fresh = fromPhone.current;
    if (!fresh) return;
    setView(fresh);
    opened.current = { id: docStamp(fresh.idDocument), selfie: docStamp(fresh.selfie) };
    if (kind === "id") {
      setIdType(fresh.idType);
      save({}, "selfie");
    } else if (fresh.selfie?.status !== "rejected") {
      setNote(fresh.selfie?.status === "approved" ? t("selfie.approved") : t("selfie.pending"));
      save({}, "product");
    }
  }

  const { index, total } = stepPosition(step, modes);

  function go(next: SupplierOnboardingStep) {
    setError("");
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (failure) {
      setError((failure instanceof Error && failure.message) || t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  /** Saves this screen's answer with the screen to resume on, then opens it. */
  function save(patch: Record<string, unknown>, next: SupplierOnboardingStep) {
    void run(async () => {
      setView(await call<View>("/api/supplier/onboarding", { method: "PATCH", json: { ...patch, step: next } }));
      setNote("");
      go(next);
    });
  }

  function back() {
    if (step === "cac" && cacPhase !== "ask") return setCacPhase(cacPhase === "confirm" ? "number" : "ask");
    const previous = previousStep(step, modes);
    if (previous) go(previous);
  }

  function finishedPath() {
    const intent = intentRouting.extractIntentParams(searchParams) as Record<string, string | undefined>;
    return intentRouting.getContinuationPath({ role: "supplier", ...intent }) || "/supplier/dashboard";
  }

  async function photoFrom(file: File | undefined, max: number) {
    if (!file) return null;
    const small = await shrinkImage(file, max, "image/jpeg");
    return /^image\/(jpeg|png|webp)$/.test(small.type) ? readAsDataUri(small) : null;
  }

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return setError(t("loc.denied"));
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setNote(t("loc.found"));
      },
      () => {
        setLocating(false);
        setError(t("loc.denied"));
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const ninDetailsProblem = () => {
    if (nin.replace(/\D/g, "").length !== 11) return t("id.needNin");
    if (firstName.trim().length < 2 || lastName.trim().length < 2) return t("id.needName");
    if (!dob) return t("id.needDob");
    return "";
  };

  const ninFields = (
    <div className="grid gap-3 text-left">
      <div>
        <p className="m-0 text-[16px] font-bold">{t("id.ninTitle")}</p>
        <p className="m-0 mt-1 text-[14px] text-app-ink-soft">{t("id.ninHint")}</p>
      </div>
      <TextInput inputMode="numeric" autoComplete="off" maxLength={14} aria-label={t("id.nin")} placeholder={t("id.nin")} value={nin} onChange={(event) => setNin(event.target.value.replace(/[^\d ]/g, ""))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput aria-label={t("id.firstName")} placeholder={t("id.firstName")} value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        <TextInput aria-label={t("id.lastName")} placeholder={t("id.lastName")} value={lastName} onChange={(event) => setLastName(event.target.value)} />
      </div>
      <label className="grid gap-1 text-[14px] font-bold">
        {t("id.dob")}
        <TextInput type="date" value={dob} onChange={(event) => setDob(event.target.value)} />
      </label>
    </div>
  );

  // ─── Screens ───────────────────────────────────────────────────────────────

  let title = "";
  let hint = "";
  let body: ReactNode = null;
  let action: { label: string; onClick: () => void; disabled?: boolean } | null = { label: t("continue"), onClick: () => undefined };
  let skip: (() => void) | null = null;

  if (step === "name") {
    title = t("name.title");
    hint = t("name.hint");
    body = <TextInput autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t("name.placeholder")} className="h-[60px] text-[18px]" onKeyDown={(event) => event.key === "Enter" && action?.onClick()} />;
    action = { label: t("continue"), onClick: () => (name.trim().length < 2 ? setError(t("name.need")) : save({ businessName: name.trim() }, "cac")) };
  } else if (step === "cac" && cacPhase === "ask") {
    title = t("cac.title");
    const answer = (value: CacAnswer) => {
      if (value === "yes") {
        void run(async () => {
          setView(await call<View>("/api/supplier/onboarding", { method: "PATCH", json: { cacAnswer: "yes", step: "cac" } }));
          setCacPhase("number");
        });
      } else save({ cacAnswer: value }, "categories");
    };
    body = (
      <div className="grid gap-3">
        {(["yes", "no", "registering"] as const).map((value) => (
          <button key={value} type="button" className={chip(view.cacAnswer === value)} onClick={() => answer(value)} disabled={busy}>
            {t(`cac.${value}`)}
          </button>
        ))}
        <p className="m-0 text-[14px] text-app-ink-soft">{t("cac.noteNo")}</p>
      </div>
    );
    action = null;
  } else if (step === "cac" && cacPhase === "number") {
    title = t("cac.numberTitle");
    hint = view.cacCheckEnabled ? t("cac.numberHint") : t("cac.off");
    body = view.cacCheckEnabled ? (
      <div className="grid gap-3">
        <TextInput autoFocus value={cacNumber} onChange={(event) => setCacNumber(event.target.value.toUpperCase())} placeholder={t("cac.numberPlaceholder")} className="h-[60px] text-[18px] uppercase" />
        {error && <PillButton tone="white" size="md" onClick={() => go("categories")}>{t("cac.skipCheck")}</PillButton>}
      </div>
    ) : null;
    action = view.cacCheckEnabled
      ? {
          label: t("cac.check"),
          onClick: () => {
            if (cacNumber.trim().length < 3) return setError(t("cac.needNumber"));
            void run(async () => {
              const result = await call<{ outcome: string; message: string; registeredName?: string }>("/api/supplier/verification/cac", {
                method: "POST",
                json: { businessName: view.businessName || name, number: cacNumber.trim() },
              });
              if (!result.registeredName) throw new Error(result.message);
              setCacFound({ name: result.registeredName, verified: result.outcome === "verified" });
              setCacPhase("confirm");
            });
          },
        }
      : { label: t("continue"), onClick: () => go("categories") };
    skip = () => go("categories");
  } else if (step === "cac") {
    title = t("cac.confirmTitle");
    body = (
      <div className="grid gap-4">
        <div className="rounded-[18px] border border-app-line bg-white p-5 text-[20px] font-extrabold">{cacFound?.name}</div>
        {cacFound?.verified && <Notice tone="success">{t("cac.verified")}</Notice>}
        <PillButton tone="white" size="md" onClick={() => setCacPhase("number")}>{t("cac.confirmNo")}</PillButton>
      </div>
    );
    action = { label: t("cac.confirmYes"), onClick: () => save({}, "categories") };
  } else if (step === "categories") {
    title = t("cats.title");
    hint = t("cats.hint");
    body = (
      <div className="flex flex-wrap gap-2">
        {view.categoryOptions.map((option) => {
          const on = cats.includes(option);
          return (
            <button key={option} type="button" aria-pressed={on} className={cx(chip(on), "rounded-full")} onClick={() => setCats(on ? cats.filter((value) => value !== option) : [...cats, option])}>
              {option}
            </button>
          );
        })}
      </div>
    );
    action = { label: t("continue"), onClick: () => (cats.length ? save({ categories: cats }, "source") : setError(t("cats.need"))) };
  } else if (step === "source") {
    title = t("source.title");
    body = (
      <div className="grid gap-3">
        {SUPPLY_SOURCES.map((value: SupplySource) => (
          <button key={value} type="button" className={chip(view.source === value)} disabled={busy} onClick={() => save({ source: value }, "buyModes")}>
            {t(`source.${value}`)}
          </button>
        ))}
      </div>
    );
    action = null;
  } else if (step === "buyModes") {
    title = t("buy.title");
    hint = t("buy.hint");
    body = (
      <div className="grid gap-3">
        {BUY_MODES.map((mode) => {
          const on = modes.includes(mode);
          if (mode === "preorder" && preorderLocked) {
            return (
              <div key={mode} className="flex min-h-[52px] items-center justify-between gap-3 rounded-[16px] border border-dashed border-app-line-strong bg-app-canvas px-4 py-3 text-left text-[16px] font-bold text-app-ink-soft" aria-disabled="true">
                <span>
                  {t("buy.preorder")}
                  <span className="block text-[14px] font-normal">{t("buy.preorderLocked")}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12px] font-bold">
                  <Icon name="lock" size={13} /> {t("buy.locked")}
                </span>
              </div>
            );
          }
          return (
            <button key={mode} type="button" aria-pressed={on} className={chip(on)} onClick={() => setModes(on ? modes.filter((value) => value !== mode) : BUY_MODES.filter((value) => value === mode || modes.includes(value)))}>
              <span className="flex items-center justify-between gap-3">
                <span>
                  {t(`buy.${mode}`)}
                  <span className={cx("block text-[14px] font-normal", on ? "text-white/80" : "text-app-ink-soft")}>{t(`buy.${mode}Sub`)}</span>
                </span>
                {on && <Icon name="check" size={20} />}
              </span>
            </button>
          );
        })}
        <ul className="m-0 mt-1 grid list-none gap-2 p-0 text-[14px] leading-[1.45] text-app-ink-soft">
          <li className="flex gap-2"><Icon name="tag" size={16} className="mt-0.5 shrink-0" /> {t("buy.pricesLater")}</li>
          {modes.includes("dropship") && <li className="flex gap-2"><Icon name="package" size={16} className="mt-0.5 shrink-0" /> {t("buy.blindPacking")}</li>}
        </ul>
      </div>
    );
    action = { label: t("continue"), onClick: () => (modes.length ? save({ buyModes: modes }, nextStep("buyModes", modes)) : setError(t("buy.need"))) };
  } else if (step === "moq") {
    title = t("moq.title");
    hint = t("moq.hint");
    const stepBy = moq >= 100 ? 10 : 1;
    body = (
      <div className="flex items-center justify-center gap-4">
        <button type="button" aria-label={t("moq.less")} className="grid h-14 w-14 place-items-center rounded-full border border-app-line bg-white" onClick={() => setMoq(Math.max(1, moq - stepBy))}>
          <Icon name="minus" size={22} />
        </button>
        <div className="min-w-[140px] text-center">
          <input inputMode="numeric" aria-label={t("moq.title")} value={moq} onChange={(event) => setMoq(Math.max(1, Math.min(100_000, Number(event.target.value.replace(/\D/g, "")) || 1)))} className="w-full bg-transparent text-center text-[44px] font-extrabold outline-none" />
          <div className="text-[15px] text-app-ink-soft">{t("moq.items", { count: moq })}</div>
        </div>
        <button type="button" aria-label={t("moq.more")} className="grid h-14 w-14 place-items-center rounded-full border border-app-line bg-white" onClick={() => setMoq(Math.min(100_000, moq + stepBy))}>
          <Icon name="plus" size={22} />
        </button>
      </div>
    );
    action = { label: t("continue"), onClick: () => save({ minimumOrder: moq }, "location") };
  } else if (step === "location") {
    title = t("loc.title");
    body = (
      <div className="grid gap-3">
        <PillButton tone={coords ? "white" : "ink"} size="md" busy={locating} onClick={useMyLocation}>
          <Icon name={coords ? "check" : "pin"} size={16} /> {coords ? t("loc.found") : t("loc.useMine")}
        </PillButton>
        <label className="grid gap-1 text-[14px] font-bold">
          {t("loc.state")}
          <select value={state} onChange={(event) => setState(event.target.value)} className="h-[54px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[16px] font-normal">
            <option value="">{t("loc.statePick")}</option>
            {NG_STATES.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-[14px] font-bold">
          {t("loc.area")}
          <TextInput value={area} onChange={(event) => setArea(event.target.value)} placeholder={t("loc.areaPlaceholder")} />
        </label>
        <label className="grid gap-1 text-[14px] font-bold">
          {t("loc.address")}
          <TextInput value={address} onChange={(event) => setAddress(event.target.value)} placeholder={t("loc.addressPlaceholder")} />
        </label>
        <p className="m-0 flex gap-2 text-[14px] leading-[1.45] text-app-ink-soft"><Icon name="truck" size={16} className="mt-0.5 shrink-0" /> {t("loc.noDelivery")}</p>
      </div>
    );
    action = {
      label: t("continue"),
      onClick: () => {
        if (!state) return setError(t("loc.needState"));
        if (address.trim().length < 3) return setError(t("loc.needAddress"));
        save({ pickup: { state, area: area.trim() || undefined, address: address.trim(), lat: coords?.lat ?? null, lng: coords?.lng ?? null } }, "id");
      },
    };
  } else if (step === "id") {
    title = t("id.title");
    hint = t("id.hint");
    const saved = view.idDocument && view.idDocument.status !== "rejected" && view.idType === idType;
    body = (
      <PhoneOrThisDevice purpose="id" createUrl="/api/supplier/kyc/handoff" arrived={phoneArrived("id")} onArrived={() => phoneSent("id")}>
      <div className="grid gap-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {SUPPLIER_ID_TYPES.map((value) => (
            <button key={value} type="button" aria-pressed={idType === value} className={chip(idType === value)} onClick={() => setIdType(value)}>
              {t(`id.type.${value}`)}
            </button>
          ))}
        </div>
        {idType && (
          <div className="grid justify-items-center gap-3">
            {idPhoto ? <img src={idPhoto} alt={t("id.preview")} className="max-h-56 rounded-[16px] border border-app-line object-contain" /> : saved ? <Notice tone="success">{t("id.saved")}</Notice> : null}
            <input ref={idInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void photoFrom(file, 1600).then((uri) => (uri ? setIdPhoto(uri) : file && setError(t("selfie.badPhoto")))); }} />
            <PillButton tone={idPhoto || saved ? "white" : "ink"} size="md" onClick={() => idInput.current?.click()}>
              <Icon name="image" size={16} /> {idPhoto || saved ? t("id.retake") : t("id.take")}
            </PillButton>
          </div>
        )}
        {idType === "nin_slip" && ninFields}
      </div>
      </PhoneOrThisDevice>
    );
    action = {
      label: t("continue"),
      onClick: () => {
        if (!idType) return setError(t("id.needType"));
        if (!idPhoto && !saved) return setError(t("id.needPhoto"));
        if (idType === "nin_slip") {
          const problem = ninDetailsProblem();
          if (problem) return setError(problem);
        }
        void run(async () => {
          if (idPhoto) setView(await call<View>("/api/supplier/kyc/id-document", { method: "POST", json: { idType, photo: idPhoto } }));
          setIdPhoto(null);
          setView(await call<View>("/api/supplier/onboarding", { method: "PATCH", json: { step: "selfie" } }));
          go("selfie");
        });
      },
    };
    skip = () => save({ docsLater: true }, "product");
  } else if (step === "selfie") {
    title = t("selfie.title");
    hint = t("selfie.hint");
    const needsNin = view.idType === "nin_slip" && ninDetailsProblem() !== "";
    body = (
      <div className="grid gap-5">
        {view.selfie?.status === "rejected" && view.selfie.reason && <Notice tone="error">{view.selfie.reason}</Notice>}
        <PhoneOrThisDevice purpose="selfie" createUrl="/api/supplier/kyc/handoff" arrived={phoneArrived("selfie")} onArrived={() => phoneSent("selfie")} cameraFailed={cameraFailed}>
          <SelfieCapture value={selfie} onChange={setSelfie} firstName={firstName} lastName={lastName} onStartFailed={() => setCameraFailed(true)} />
          {needsNin && ninFields}
        </PhoneOrThisDevice>
      </div>
    );
    action = {
      label: t("continue"),
      onClick: () => {
        if (!selfie) return setError(t("selfie.need"));
        if (view.idType === "nin_slip") {
          const problem = ninDetailsProblem();
          if (problem) return setError(problem);
        }
        void run(async () => {
          const next = await call<View>("/api/supplier/kyc/selfie", {
            method: "POST",
            json: { selfie: selfie.dataUri, liveness: selfie.liveness, ...(view.idType === "nin_slip" ? { nin: nin.replace(/\D/g, ""), firstName: firstName.trim(), lastName: lastName.trim(), dateOfBirth: dob } : {}) },
          });
          setView(next);
          if (next.selfie?.status === "rejected") {
            setSelfie(null);
            throw new Error(next.selfie.reason || t("selfie.badPhoto"));
          }
          setView(await call<View>("/api/supplier/onboarding", { method: "PATCH", json: { step: "product" } }));
          setNote(next.selfie?.status === "approved" ? t("selfie.approved") : t("selfie.pending"));
          go("product");
        });
      },
    };
    skip = () => save({ docsLater: true }, "product");
  } else if (step === "product") {
    title = t("product.title");
    hint = t("product.hint");
    body = (
      <div className="grid gap-4">
        <div className="grid justify-items-center gap-3">
          {productPhoto && <img src={productPhoto} alt={t("product.preview")} className="max-h-60 rounded-[16px] border border-app-line object-contain" />}
          <input ref={productInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void photoFrom(file, 1600).then((uri) => (uri ? setProductPhoto(uri) : file && setError(t("selfie.badPhoto")))); }} />
          <PillButton tone={productPhoto ? "white" : "ink"} size="md" onClick={() => productInput.current?.click()}>
            <Icon name="image" size={16} /> {productPhoto ? t("product.retake") : t("product.take")}
          </PillButton>
        </div>
        {productPhoto && (
          <div className="grid gap-3">
            <TextInput aria-label={t("product.name")} placeholder={t("product.namePlaceholder")} value={productName} onChange={(event) => setProductName(event.target.value)} />
            <TextInput inputMode="numeric" aria-label={t("product.price")} placeholder={t("product.price")} value={productPrice} onChange={(event) => setProductPrice(event.target.value.replace(/[^\d]/g, ""))} />
          </div>
        )}
      </div>
    );
    action = {
      label: t("product.add"),
      onClick: () => {
        if (!productPhoto) return setError(t("product.needPhoto"));
        if (productName.trim().length < 2) return setError(t("product.needName"));
        if (!Number(productPrice)) return setError(t("product.needPrice"));
        void run(async () => {
          const product = await call<{ name: string }>("/api/supplier/onboarding/first-product", { method: "POST", json: { photo: productPhoto, name: productName.trim(), price: Number(productPrice) } });
          setView(await call<View>("/api/supplier/onboarding", { method: "PATCH", json: { step: "review" } }));
          setNote(t("product.added", { name: product.name }));
          setProductPhoto(null);
          go("review");
        });
      },
    };
    skip = () => save({}, "review");
  } else {
    const idSent = Boolean(view.idDocument && view.selfie && view.idDocument.status !== "rejected" && view.selfie.status !== "rejected");
    const verified = view.verificationStatus === "verified";
    const badges = supplierTierBadges(view.tiers);
    title = view.completed ? (verified ? t("review.verifiedTitle") : t("review.title")) : idSent ? t("review.readyTitle") : t("review.missingTitle");
    hint = view.completed ? (verified ? t("review.verifiedSub") : t("review.sub")) : idSent ? t("review.readySub") : t("review.missingSub");
    body = (
      <div className="grid gap-4">
        {badges.length > 0 && (
          <div>
            <p className="m-0 mb-2 text-[14px] font-bold">{t("review.badges")}</p>
            <div className="flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span key={badge} className="inline-flex items-center gap-1.5 rounded-full bg-app-ink px-3 py-1.5 text-[14px] font-bold text-white">
                  <Icon name="checkCircle" size={15} /> {t(`badge.${badge}` as "badge.verified_individual")}
                </span>
              ))}
            </div>
          </div>
        )}
        {!view.completed && !idSent && <PillButton tone="white" size="md" onClick={() => go("id")}>{t("review.addId")}</PillButton>}
        <p className="m-0 text-[14px] text-app-ink-soft">{t("review.payoutLater")}</p>
      </div>
    );
    action = view.completed
      ? { label: t("review.open"), onClick: () => router.push(finishedPath()) }
      : idSent
        ? { label: t("review.send"), onClick: () => void run(async () => setView(await call<View>("/api/supplier/onboarding", { method: "PATCH", json: { completed: true, step: "review" } }))) }
        : {
            label: t("review.later"),
            onClick: () =>
              void run(async () => {
                await call<View>("/api/supplier/onboarding", { method: "PATCH", json: { docsLater: true, step: "review" } });
                router.push("/supplier/dashboard?docs=later");
              }),
          };
  }

  const canGoBack = step !== "name" && !(step === "review" && view.completed);
  const order = supplierSteps(modes);
  const railSteps = order.map((key, position) => ({ key, label: t(`rail.${key}`), done: position < index || (key === "review" && view.completed) }));
  return (
    <div className="flex min-h-dvh w-full bg-app-canvas font-app text-app-ink lg:bg-white">
      <StepRail
        className="sticky top-0 hidden h-dvh w-[280px] shrink-0 overflow-y-auto lg:flex"
        who={name.trim() || view.displayName || view.businessName || t("rail.title")}
        role={t("rail.title")}
        steps={railSteps}
        current={step}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 grid gap-3 bg-app-canvas/90 px-4 py-3 backdrop-blur sm:px-6 lg:bg-white/90 lg:px-12">
          <div className="flex items-center gap-3">
            {canGoBack ? <BackButton onClick={back} label={t("back")} /> : <Wordmark className="lg:invisible" />}
            <span className="flex-1 text-center text-[14px] font-bold text-app-ink-soft lg:text-left">{t("progress", { step: index + 1, total })}</span>
            <a href={whatsappChatUrl(t("helpMessage"))} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-bold text-app-ink underline underline-offset-4">
              <Icon name="whatsapp" size={16} /> {t("help")}
            </a>
          </div>
          <div className="lg:hidden">
            <ProgressBars total={total} current={index} />
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col px-4 pb-6 pt-6 sm:px-6 lg:mx-0 lg:max-w-[760px] lg:px-12 lg:pt-12">
          <h1 className="m-0 font-app-display text-[30px] font-extrabold leading-[1.05] tracking-[-0.025em] sm:text-[34px] lg:text-[44px]">{title}</h1>
          {hint && <p className="m-0 mt-2 max-w-[620px] text-[16px] leading-[1.5] text-app-ink-soft lg:mt-3 lg:text-[17px]">{hint}</p>}
          <div className="mt-6 grid gap-3">
            {note && <Notice tone="success">{note}</Notice>}
            {body}
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        </main>

        {(action || skip) && (
          <footer className="sticky bottom-0 z-20 mx-auto grid w-full max-w-[560px] gap-2 bg-app-canvas/95 px-4 pb-5 pt-3 backdrop-blur sm:px-6 lg:mx-0 lg:flex lg:max-w-[760px] lg:items-center lg:gap-4 lg:bg-white/95 lg:px-12 lg:pb-10">
            {action && (
              <PillButton tone="ink" busy={busy} disabled={action.disabled} onClick={action.onClick} className="w-full lg:w-auto lg:min-w-[200px]">
                {action.label}
              </PillButton>
            )}
            {skip && (
              <button type="button" className="min-h-[44px] text-[15px] font-bold text-app-ink-soft underline underline-offset-4" disabled={busy} onClick={skip}>
                {t("skip")}
              </button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
