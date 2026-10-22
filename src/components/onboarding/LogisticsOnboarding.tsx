"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FieldLabel, Mascot, Notice, PillButton, ProgressBars, TextInput, Wordmark, cx } from "@/components/app-ui";
import { CacInstantCheck } from "@/components/verification/CacInstantCheck";
import { VerificationDocUploader } from "@/components/verification/VerificationDocUploader";
import { deleteVerificationFile, uploadVerificationFile } from "@/components/verification/upload-client";
import { Icon } from "@/components/ui/Icon";
import intentRouting from "@/lib/intent-routing";
import { useT } from "@/components/i18n/I18nProvider";
import { LOGISTICS_DOC_TYPES, type DocType, type VerificationDoc } from "@shared/verification-docs";
import { NATIONWIDE, NG_REGIONS, NG_STATES, RATE_SERVICES, SIZE_BANDS, type RateRow } from "@shared/delivery-market";
import {
  SERVICE_KEYS,
  SIZE_KEYS,
  STATE_CHIPS,
  deliverModeOf,
  deliveryAreasFor,
  draftFromRow,
  legacyZonesFor,
  nairaInput,
  newDraftRate,
  pickupAreasFor,
  priceText,
  rowsToSave,
  starterRates,
  stateLabel,
  statesIn,
  type DeliverMode,
  type DraftRate,
} from "@shared/partner-setup";
import { saveSetupBusiness, saveSetupMarket } from "@/app/actions/delivery-market-partner";
import { checkWalletAccountAction, linkWalletBankAction } from "@/app/actions/wallet";

// Delivery partner set-up on the web, the same steps as the phone app's (apps/mobile/src/app/logistics/setup.tsx,
// "Delivery partner app" prototype): welcome, company, documents, where you cover, what you offer, the rate card,
// where we pay you, then "Send for review". The company is saved on its step; the rest waits in this page until the
// last step, which marks set-up done (PATCH /api/logistics/onboarding), saves areas, services and prices
// (saveSetupMarket), links the bank and sends the documents to be checked.

type Step = "welcome" | "biz" | "docs" | "cover" | "services" | "rates" | "payout" | "done";
const NUMBERED: Step[] = ["biz", "docs", "cover", "services", "rates", "payout"];
const UPLOAD_ENDPOINT = "/api/logistics/verification/upload";
const SERVICES = ["doorstep", "pickup_point", "same_day", "interstate"] as const;

interface PartnerSetupData {
  companyName: string;
  cacNumber: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  services: string[];
  pickupAreas: string[];
  deliveryAreas: string[];
  vehicleTypes: string[];
  deliveryTypes: string[];
  documents: VerificationDoc[];
}

const cardClass = "grid gap-5 rounded-[22px] border border-app-line bg-white p-5 sm:p-6";
const selectClass = "h-[54px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[16px] text-app-ink outline-none transition focus:border-app-ink";
const rowLabel = "mb-1 block text-[13px] font-bold text-app-ink-soft lg:sr-only";
const cell = "h-11 w-full min-w-0 rounded-[12px] border border-app-line bg-white px-3 text-[15px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink disabled:opacity-55";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold transition",
        on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
      )}
    >
      {children}
    </button>
  );
}

/** A big tappable choice with a title and a line under it (radio or checkbox). */
function Choice({ multi, on, onClick, title, sub }: { multi?: boolean; on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={on}
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-4 rounded-[18px] border bg-white p-4 text-left transition",
        on ? "border-app-ink shadow-[inset_0_0_0_1px_var(--color-app-ink)]" : "border-app-line hover:border-app-line-strong",
      )}
    >
      <span className={cx("grid h-6 w-6 shrink-0 place-items-center border-2", multi ? "rounded-[7px]" : "rounded-full", on ? "border-app-ink bg-app-ink text-white" : "border-app-line-strong")}>
        {on && <Icon name="check" size={12} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[16px] font-extrabold">{title}</span>
        <span className="block text-[14px] text-app-ink-soft">{sub}</span>
      </span>
    </button>
  );
}

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <>
      <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">{title}</h1>
      {sub && <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">{sub}</p>}
    </>
  );
}

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

export function LogisticsOnboarding({
  partner,
  rateCard,
  bank: linkedBank,
  banks,
}: {
  partner: PartnerSetupData;
  rateCard: { rows: RateRow[]; failedAttemptFee: number; returnFee: number; notes: string } | null;
  bank: { bankName: string; accountName: string } | null;
  banks: string[];
}) {
  const t = useT("onboarding", "common");
  const tl = useT("logistics");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { extractIntentParams, getContinuationPath } = intentRouting;
  const id = useId();

  const [step, setStep] = useState<Step>("welcome");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Company
  const [company, setCompany] = useState(partner.companyName);
  const [cac, setCac] = useState(partner.cacNumber);
  const [contact, setContact] = useState(partner.contactName);
  const [phone, setPhone] = useState(partner.contactPhone);
  const [email, setEmail] = useState(partner.contactEmail);
  const [address, setAddress] = useState(partner.address);
  // Documents
  const [documents, setDocuments] = useState<VerificationDoc[]>(partner.documents);
  // Coverage and services
  const [pickup, setPickup] = useState<string[]>(statesIn(partner.pickupAreas));
  const [mode, setMode] = useState<DeliverMode>(deliverModeOf(partner.pickupAreas, partner.deliveryAreas));
  const [deliver, setDeliver] = useState<string[]>(statesIn(partner.deliveryAreas));
  const [services, setServices] = useState<string[]>(partner.services.length ? partner.services : ["doorstep"]);
  // Rate card
  const [rows, setRows] = useState<DraftRate[]>(rateCard?.rows.length ? rateCard.rows.map(draftFromRow) : []);
  const [fail, setFail] = useState(priceText(rateCard?.failedAttemptFee ?? null));
  const [ret, setRet] = useState(priceText(rateCard?.returnFee ?? null));
  const [notes, setNotes] = useState(rateCard?.notes ?? "");
  // Payout
  const [bank, setBank] = useState(linkedBank?.bankName ?? "");
  const [acct, setAcct] = useState("");
  const [acctName, setAcctName] = useState<string | null>(null);

  useEffect(() => {
    if (!bank || acct.length !== 10) {
      setAcctName(null);
      return;
    }
    let live = true;
    checkWalletAccountAction({ bankName: bank, accountNumber: acct })
      .then((result) => live && setAcctName(result.status === "resolved" ? result.accountName : null))
      .catch(() => live && setAcctName(null));
    return () => {
      live = false;
    };
  }, [bank, acct]);

  const number = NUMBERED.indexOf(step) + 1;

  function go(next: Step) {
    setError("");
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function back() {
    const index = NUMBERED.indexOf(step);
    go(index > 0 ? NUMBERED[index - 1]! : "welcome");
  }

  async function saveCompany() {
    setBusy(true);
    setError("");
    try {
      const result = await saveSetupBusiness({ companyName: company.trim(), cacNumber: cac.trim(), contactName: contact.trim(), contactPhone: phone.trim(), contactEmail: email.trim(), address: address.trim() });
      if (result.ok) go("docs");
      else setError(result.error);
    } catch {
      setError(t("ps.error.retry"));
    } finally {
      setBusy(false);
    }
  }

  async function upload(type: DocType, file: File, onProgress?: (percent: number) => void) {
    setError("");
    const doc = await uploadVerificationFile(UPLOAD_ENDPOINT, type, file, onProgress);
    setDocuments((current) => [...current.filter((d) => d.type !== type), doc]);
  }

  async function remove(docId: string) {
    setError("");
    await deleteVerificationFile(UPLOAD_ENDPOINT, docId);
    setDocuments((current) => current.filter((d) => d.id !== docId));
  }

  function toRates() {
    if (!services.length) return setError(t("ps.svc.needOne"));
    if (!rows.length) setRows(starterRates(pickup, mode, deliver, services));
    go("rates");
  }

  async function sendForReview() {
    const priced = rowsToSave(rows);
    if (!priced.length) return setError(t("ps.rates.needOne"));
    setBusy(true);
    setError("");
    try {
      // Set-up done first: areas and prices can only be saved after it.
      const onboarding = await fetch("/api/logistics/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: company.trim().length >= 2 ? company.trim() : undefined,
          coverageZones: legacyZonesFor(pickup),
          vehicleTypes: partner.vehicleTypes.length ? partner.vehicleTypes : ["bike"],
          deliveryTypes: partner.deliveryTypes.length ? partner.deliveryTypes : services.includes("same_day") ? ["same_day", "next_day"] : ["next_day"],
          pricingModel: "fixed",
          basePrice: Math.min(...priced.map((row) => row.price)),
          completed: true,
        }),
      });
      if (!onboarding.ok) {
        const body = await onboarding.json().catch(() => null);
        throw new Error(body?.error?.message ?? t("ps.error.retry"));
      }
      const market = await saveSetupMarket({
        services,
        pickupAreas: pickupAreasFor(pickup, partner.pickupAreas),
        deliveryAreas: deliveryAreasFor(mode, pickup, deliver, partner.deliveryAreas),
        rows: priced,
        failedAttemptFee: nairaInput(fail) ?? 0,
        returnFee: nairaInput(ret) ?? 0,
        notes,
      });
      if (!market.ok) throw new Error(market.error);
      if (bank && acct.length === 10) {
        const linked = await linkWalletBankAction({ bankName: bank, accountNumber: acct });
        if (!linked.ok) throw new Error(linked.error);
      }
      // Sent to be checked once the required documents are in; otherwise they finish from Verification.
      await fetch("/api/logistics/verification/submit", { method: "POST" }).catch(() => null);
      go("done");
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : t("ps.error.retry"));
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (step === "biz") return void saveCompany();
    if (step === "docs") return go("cover");
    if (step === "cover") {
      if (!pickup.length) return setError(t("ps.cover.needPickup"));
      if (mode === "some" && !deliver.length) return setError(t("ps.cover.needDeliver"));
      return go("services");
    }
    if (step === "services") return toRates();
    if (step === "rates") return rowsToSave(rows).length ? go("payout") : setError(t("ps.rates.needOne"));
    if (step === "payout") return void sendForReview();
  }

  const updateRow = (rowId: string, patch: Partial<DraftRate>) => {
    setError("");
    setRows((list) => list.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };
  const finish = () => router.push(getContinuationPath({ role: "logistics_partner", ...extractIntentParams(searchParams) }) || "/logistics/dashboard");

  if (step === "welcome" || step === "done") {
    const welcome = step === "welcome";
    return (
      <div className="grid min-h-dvh w-full place-items-center bg-app-canvas px-4 py-10 font-app text-app-ink">
        <div className="grid w-full max-w-[520px] justify-items-center gap-4 text-center">
          <Wordmark />
          <span className={cx("mt-6 grid h-24 w-24 place-items-center", welcome ? "rounded-[32px] bg-app-mint" : "rounded-full bg-app-success-tint text-app-success")}>
            <Icon name={welcome ? "truck" : "clock"} size={44} />
          </span>
          {welcome && <span className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-app-ink-soft">{t("ps.setup.eyebrow")}</span>}
          <h1 className="m-0 text-[32px] font-extrabold leading-[1.1] tracking-[-0.8px]">{welcome ? t("ps.setup.title") : t("ps.setup.checking")}</h1>
          <p className="m-0 text-[16px] leading-[1.55] text-app-ink-soft">{welcome ? t("ps.setup.sub") : t("ps.setup.checkingSub")}</p>
          {welcome ? (
            <>
              <PillButton tone="forest" size="lg" className="mt-4 w-full" onClick={() => go("biz")}>
                {t("ps.setup.start")} <Icon name="arrow" size={16} />
              </PillButton>
              <span className="text-[14px] text-app-ink-soft">{t("ps.setup.free")}</span>
            </>
          ) : (
            <PillButton tone="forest" size="lg" className="mt-4 w-full" onClick={finish}>
              {t("ps.setup.toDashboard")} <Icon name="arrow" size={16} />
            </PillButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full bg-app-canvas font-app text-app-ink">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-4 bg-app-canvas/90 px-4 py-3 backdrop-blur sm:px-6 xl:px-8">
        <Wordmark />
        <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1"><ProgressBars total={NUMBERED.length} current={number - 1} /></div>
        <span className="ml-auto text-[13px] font-bold text-app-ink-soft sm:ml-0">{t("ps.setup.step", { step: number, total: NUMBERED.length })}</span>
      </header>

      <main className="w-full px-4 pb-10 pt-4 sm:px-6 xl:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0">
            {step === "biz" && (
              <>
                <Heading title={t("ps.setup.bizTitle")} />
                <div className={cx(cardClass, "mt-6 sm:grid-cols-2")}>
                  {([
                    ["company", t("ps.setup.company"), company, setCompany, { autoComplete: "organization" }],
                    ["cac", t("ps.setup.cac"), cac, setCac, { placeholder: "RC123456", autoCapitalize: "characters" }],
                    ["contact", t("ps.setup.contact"), contact, setContact, { autoComplete: "name" }],
                    ["phone", t("ps.setup.phone"), phone, setPhone, { type: "tel", autoComplete: "tel" }],
                    ["email", t("ps.setup.email"), email, setEmail, { type: "email", autoComplete: "email" }],
                    ["office", t("ps.setup.office"), address, setAddress, { autoComplete: "street-address" }],
                  ] as const).map(([key, label, value, set, extra]) => (
                    <div key={key} className="min-w-0">
                      <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
                      <TextInput id={`${id}-${key}`} value={value} onChange={(event) => set(event.target.value)} {...extra} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {step === "docs" && (
              <>
                <Heading title={t("ps.docs.title")} sub={t("ps.docs.sub")} />
                <div className="mt-6 grid gap-4">
                  <CacInstantCheck
                    apiPath="/api/logistics/verification/cac"
                    defaultName={company}
                    cacDoc={documents.find((doc) => doc.type === "cac")}
                    onVerified={(doc) => setDocuments((current) => [...current.filter((d) => d.type !== "cac"), doc])}
                  />
                  <VerificationDocUploader role="logistics_partner" docs={documents} docConfigs={LOGISTICS_DOC_TYPES} onUpload={upload} onDelete={remove} />
                </div>
              </>
            )}

            {step === "cover" && (
              <>
                <Heading title={t("ps.setup.coverTitle")} sub={t("ps.setup.coverNote")} />
                <div className={cx(cardClass, "mt-6")}>
                  <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className="mb-3 text-[17px] font-extrabold">{t("ps.cover.pickQ")}</legend>
                    <div className="flex flex-wrap gap-2">
                      {STATE_CHIPS.map((state) => <Chip key={state} on={pickup.includes(state)} onClick={() => setPickup((list) => toggle(list, state))}>{stateLabel(state)}</Chip>)}
                    </div>
                  </fieldset>
                  <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className="mb-3 text-[17px] font-extrabold">{t("ps.cover.deliverQ")}</legend>
                    <div role="radiogroup" className="grid gap-2 sm:grid-cols-3">
                      {(["same", "all", "some"] as const).map((choice) => (
                        <Choice key={choice} on={mode === choice} onClick={() => setMode(choice)} title={t.dynamic(`ps.cover.${choice}`)} sub={t.dynamic(`ps.cover.${choice}Sub`)} />
                      ))}
                    </div>
                    {mode === "some" && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {STATE_CHIPS.map((state) => <Chip key={state} on={deliver.includes(state)} onClick={() => setDeliver((list) => toggle(list, state))}>{stateLabel(state)}</Chip>)}
                      </div>
                    )}
                  </fieldset>
                </div>
              </>
            )}

            {step === "services" && (
              <>
                <Heading title={t("ps.setup.svcTitle")} sub={t("ps.setup.svcSub")} />
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {SERVICES.map((service) => (
                    <Choice key={service} multi on={services.includes(service)} onClick={() => setServices((list) => toggle(list, service))} title={t.dynamic(`ps.svcLong.${service}`)} sub={t.dynamic(`ps.svcSub.${service}`)} />
                  ))}
                </div>
              </>
            )}

            {step === "rates" && (
              <>
                <Heading title={t("ps.rates.title")} sub={`${t("ps.rates.sub")} ${t("ps.rates.subStarter")}`} />
                <datalist id={`${id}-places`}>
                  <option value={NATIONWIDE} />
                  {Object.keys(NG_REGIONS).map((region) => <option key={region} value={region} />)}
                  {NG_STATES.map((state) => <option key={state} value={state} />)}
                </datalist>
                <div className={cx(cardClass, "mt-6")}>
                  <div aria-hidden className="hidden gap-2 text-[13px] font-bold text-app-ink-soft lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_44px] lg:grid">
                    <span>{t("ps.rates.from")}</span>
                    <span>{t("ps.rates.to")}</span>
                    <span>{tl("market.editor.service")}</span>
                    <span>{tl("market.editor.size")}</span>
                    <span>{t("ps.rates.price")}</span>
                    <span>{t("ps.rates.minDays")}</span>
                    <span>{t("ps.rates.maxDays")}</span>
                  </div>
                  <ol className="m-0 grid list-none gap-3 p-0 lg:gap-2">
                    {rows.map((row, index) => {
                      const sameDay = row.service === "same_day";
                      const rid = `${id}-${row.id}`;
                      return (
                        <li key={row.id} className="grid grid-cols-2 gap-2 rounded-[16px] border border-app-line p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.5fr)_minmax(0,0.5fr)_44px] lg:items-center lg:rounded-none lg:border-0 lg:p-0">
                          <div className="min-w-0">
                            <label htmlFor={`${rid}-from`} className={rowLabel}>{t("ps.rates.from")}</label>
                            <input id={`${rid}-from`} list={`${id}-places`} value={row.from} onChange={(event) => updateRow(row.id, { from: event.target.value })} className={cell} />
                          </div>
                          <div className="min-w-0">
                            <label htmlFor={`${rid}-to`} className={rowLabel}>{t("ps.rates.to")}</label>
                            <input id={`${rid}-to`} list={`${id}-places`} value={row.to} onChange={(event) => updateRow(row.id, { to: event.target.value })} className={cell} />
                          </div>
                          <div className="min-w-0">
                            <label htmlFor={`${rid}-service`} className={rowLabel}>{tl("market.editor.service")}</label>
                            <select id={`${rid}-service`} value={row.service} onChange={(event) => updateRow(row.id, { service: event.target.value as DraftRate["service"], ...(event.target.value === "same_day" ? { minDays: 0, maxDays: 0 } : row.maxDays === 0 ? { minDays: 1, maxDays: 2 } : {}) })} className={cell}>
                              {RATE_SERVICES.map((service) => <option key={service} value={service}>{t.dynamic(`ps.${SERVICE_KEYS[service]}`, service)}</option>)}
                            </select>
                          </div>
                          <div className="min-w-0">
                            <label htmlFor={`${rid}-size`} className={rowLabel}>{tl("market.editor.size")}</label>
                            <select id={`${rid}-size`} value={row.sizeBand} onChange={(event) => updateRow(row.id, { sizeBand: event.target.value as DraftRate["sizeBand"] })} className={cell}>
                              {SIZE_BANDS.map((band) => <option key={band} value={band}>{t.dynamic(`ps.${SIZE_KEYS[band]}`, band)}</option>)}
                            </select>
                          </div>
                          <div className="col-span-2 min-w-0 lg:col-span-1">
                            <label htmlFor={`${rid}-price`} className={rowLabel}>{t("ps.rates.price")}</label>
                            <input id={`${rid}-price`} value={row.price} onChange={(event) => updateRow(row.id, { price: event.target.value })} inputMode="numeric" placeholder="2,500" aria-label={t("ps.rates.priceFor", { route: `${stateLabel(row.from)} → ${stateLabel(row.to)}` })} className={cell} />
                          </div>
                          <div className="min-w-0">
                            <label htmlFor={`${rid}-min`} className={rowLabel}>{t("ps.rates.minDays")}</label>
                            <input id={`${rid}-min`} value={String(row.minDays)} disabled={sameDay} onChange={(event) => updateRow(row.id, { minDays: Number(event.target.value.replace(/\D/g, "") || 0) })} inputMode="numeric" className={cell} />
                          </div>
                          <div className="min-w-0">
                            <label htmlFor={`${rid}-max`} className={rowLabel}>{t("ps.rates.maxDays")}</label>
                            <input id={`${rid}-max`} value={String(row.maxDays)} disabled={sameDay} onChange={(event) => updateRow(row.id, { maxDays: Number(event.target.value.replace(/\D/g, "") || 0) })} inputMode="numeric" className={cell} />
                          </div>
                          <div className="col-span-2 flex justify-end lg:col-span-1">
                            <button
                              type="button"
                              onClick={() => setRows((list) => list.filter((item) => item.id !== row.id))}
                              aria-label={`${t("ps.rates.remove")} (${index + 1})`}
                              className="grid h-11 w-11 place-items-center rounded-full text-app-ink-soft transition hover:bg-app-canvas hover:text-app-danger"
                            >
                              <Icon name="x" size={16} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                  <div className="flex flex-wrap items-center gap-3">
                    <PillButton tone="white" size="sm" onClick={() => setRows((list) => [...list, newDraftRate(list.at(-1)?.from || pickup[0] || "Lagos", list.at(-1)?.to || pickup[0] || "Lagos")])}>
                      {t("ps.rates.add")}
                    </PillButton>
                    <span className="text-[14px] text-app-ink-soft">{t("ps.rates.placeHint")}</span>
                  </div>
                  <div className="grid gap-4 border-t border-app-line pt-4 sm:grid-cols-2">
                    <div className="min-w-0">
                      <FieldLabel htmlFor={`${id}-fail`}>{t("ps.rates.reattempt")}</FieldLabel>
                      <TextInput id={`${id}-fail`} value={fail} onChange={(event) => setFail(event.target.value)} inputMode="numeric" placeholder="0" />
                    </div>
                    <div className="min-w-0">
                      <FieldLabel htmlFor={`${id}-return`}>{t("ps.rates.return")}</FieldLabel>
                      <TextInput id={`${id}-return`} value={ret} onChange={(event) => setRet(event.target.value)} inputMode="numeric" placeholder="0" />
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <FieldLabel htmlFor={`${id}-notes`}>{t("ps.rates.notes")}</FieldLabel>
                      <textarea id={`${id}-notes`} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={500} className="w-full min-w-0 rounded-[16px] border border-app-line bg-white px-4 py-3 text-[16px] text-app-ink outline-none transition focus:border-app-ink" />
                    </div>
                  </div>
                </div>
              </>
            )}

            {step === "payout" && (
              <>
                <Heading title={t("ps.setup.payTitle")} sub={t("ps.setup.paySub")} />
                <div className={cx(cardClass, "mt-6")}>
                  {linkedBank && (
                    <div className="flex items-center gap-3 rounded-[16px] bg-app-success-tint p-4">
                      <Icon name="check" size={18} />
                      <span className="min-w-0 text-[15px] font-bold">{linkedBank.bankName} · {linkedBank.accountName}</span>
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="min-w-0">
                      <FieldLabel htmlFor={`${id}-bank`}>{t("ps.setup.bank")}</FieldLabel>
                      <select id={`${id}-bank`} value={bank} onChange={(event) => setBank(event.target.value)} className={selectClass}>
                        <option value="" />
                        {banks.map((name) => <option key={name} value={name}>{name}</option>)}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <FieldLabel htmlFor={`${id}-acct`}>{t("ps.setup.acct")}</FieldLabel>
                      <TextInput id={`${id}-acct`} value={acct} onChange={(event) => setAcct(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" placeholder={t("ps.setup.acctPlaceholder")} />
                    </div>
                  </div>
                  {acctName && (
                    <div className="flex items-center gap-4 rounded-[20px] bg-app-success-tint p-5">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white text-app-success"><Icon name="check" size={22} /></span>
                      <span className="min-w-0">
                        <span className="block text-[16px] font-bold">{acctName}</span>
                        <span className="block text-[14px] text-app-ink-soft">{t("ps.setup.isThisYou")}</span>
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}

            {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <PillButton tone="ghost" size="md" onClick={back} disabled={busy}>
                <Icon name="arrowLeft" size={15} /> {t("back")}
              </PillButton>
              {step === "payout" ? (
                <PillButton tone="forest" size="md" onClick={next} busy={busy}>
                  {t("ps.setup.sendReview")} <Icon name="arrow" size={15} />
                </PillButton>
              ) : (
                <PillButton tone="ink" size="md" onClick={next} busy={busy}>
                  {t("next")} <Icon name="arrow" size={15} />
                </PillButton>
              )}
            </div>
          </section>

          <aside className="grid content-start gap-4 xl:mt-[52px]">
            <div className="rounded-[22px] border border-app-line bg-white p-5">
              <h2 className="m-0 text-[17px] font-extrabold">{t("whatNext")}</h2>
              <ol className="m-0 mt-3 grid list-none gap-3 p-0 text-[14px] leading-[1.5]">
                {[t("lp.next1"), t("lp.next2"), t("lp.next3")].map((line, index) => (
                  <li key={line} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-ink text-[12px] font-extrabold text-white">{index + 1}</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex items-start gap-3 rounded-[22px] bg-app-mint p-5">
              <Mascot name="peggy" className="h-12 w-12 shrink-0" alt="Peggy" />
              <p className="m-0 text-[14.5px] leading-[1.55]">{t("lp.peggyNote")}</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
