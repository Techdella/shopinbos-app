"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FieldLabel, Mascot, Notice, PillButton, ProgressBars, TextInput, Wordmark, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { VerificationDocUploader } from "@/components/verification/VerificationDocUploader";
import { CacInstantCheck } from "@/components/verification/CacInstantCheck";
import { deleteVerificationFile, uploadVerificationFile } from "@/components/verification/upload-client";
import intentRouting from "@/lib/intent-routing";
import { useT } from "@/components/i18n/I18nProvider";
import {
  SUPPLIER_DOC_TYPES,
  docDisplayState,
  findDoc,
  missingRequiredDocs,
  normalizeVerificationDocs,
  type DocType,
  type VerificationDoc,
} from "@shared/verification-docs";

const UPLOAD_ENDPOINT = "/api/supplier/verification/upload";

interface InitialUser {
  name: string | null;
  city: string | null;
  country: string | null;
}

interface SupplierOnboardingProps {
  initialUser?: InitialUser | null;
  initialSupplier?: {
    businessName: string | null;
    displayName: string | null;
    country: string | null;
    city: string | null;
    address: string | null;
    description: string | null;
    categories: string[];
    verificationDocuments?: unknown;
    onboardingState?: { completed?: boolean; readinessScore?: number } | null;
  } | null;
}

const categoryOptions = [
  "Fashion & clothing",
  "Beauty & skincare",
  "Food & groceries",
  "Electronics & gadgets",
  "Home & living",
  "Kids & baby",
  "Health & wellness",
  "Other",
];

export function SupplierOnboarding({ initialUser, initialSupplier }: SupplierOnboardingProps) {
  const t = useT("onboarding", "common");
  const tDocs = useT("verification");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { extractIntentParams, getContinuationPath } = intentRouting;

  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState(initialSupplier?.businessName ?? "");
  const [displayName, setDisplayName] = useState(initialSupplier?.displayName ?? initialSupplier?.businessName ?? "");
  const [country, setCountry] = useState(initialSupplier?.country ?? initialUser?.country ?? "Nigeria");
  const [city, setCity] = useState(initialSupplier?.city ?? initialUser?.city ?? "Lagos");
  const [address, setAddress] = useState(initialSupplier?.address ?? "");
  const [description, setDescription] = useState(initialSupplier?.description ?? "");
  const [categories, setCategories] = useState<string[]>(initialSupplier?.categories?.length ? initialSupplier.categories : []);
  const [documents, setDocuments] = useState<VerificationDoc[]>(() => normalizeVerificationDocs(initialSupplier?.verificationDocuments));
  const [uploadsInFlight, setUploadsInFlight] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialSupplier?.onboardingState?.completed ? t("supplier.submitted") : "");
  const [error, setError] = useState("");

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  // The file goes to the same upload route the verification page uses; the row only shows as
  // uploaded once the server returns the stored record. Errors are thrown back to the row.
  async function handleDocumentUpload(type: DocType, file: File, onProgress?: (percent: number) => void) {
    setError("");
    setSaved("");
    setUploadsInFlight((count) => count + 1);
    try {
      const doc = await uploadVerificationFile(UPLOAD_ENDPOINT, type, file, onProgress);
      setDocuments((current) => [...current.filter((d) => d.type !== type), doc]);
    } finally {
      setUploadsInFlight((count) => count - 1);
    }
  }

  async function handleDocumentRemove(docId: string) {
    setError("");
    setSaved("");
    await deleteVerificationFile(UPLOAD_ENDPOINT, docId);
    setDocuments((current) => current.filter((d) => d.id !== docId));
  }

  // Only send name fields once they're long enough for the API; blanks keep what's saved.
  function textOrUndefined(value: string) {
    const trimmed = value.trim();
    return trimmed.length >= 2 ? trimmed : undefined;
  }

  async function save(completed: boolean, docsLater = false) {
    setSaving(true);
    setSaved("");
    setError("");
    try {
      const missingDocs = missingRequiredDocs(SUPPLIER_DOC_TYPES, documents);

      if (completed && !textOrUndefined(businessName)) {
        setError(t("supplier.needName"));
        setStep(1);
        return;
      }
      if (completed && uploadsInFlight > 0) {
        setError(t("supplier.waitUploads"));
        return;
      }
      if (completed && missingDocs.length > 0) {
        setError(t("supplier.uploadMissing", { docs: missingDocs.map((doc) => tDocs.dynamic(`doc.${doc.type}.label`, doc.label)).join(", ") }));
        return;
      }

      // Documents are saved as they upload; the server re-checks them on submit.
      const requiredCount = SUPPLIER_DOC_TYPES.filter((config) => config.required).length;
      const readinessScore = Math.round(((requiredCount - missingDocs.length) / Math.max(requiredCount, 1)) * 100);

      const response = await fetch("/api/supplier/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: textOrUndefined(businessName),
          displayName: textOrUndefined(displayName) ?? textOrUndefined(businessName),
          country: textOrUndefined(country),
          city: textOrUndefined(city),
          address,
          description,
          categories,
          readinessScore,
          completed,
          ...(docsLater ? { docsLater: true } : {}),
        }),
      }).catch(() => null);

      if (!response?.ok) {
        const body = await response?.json().catch(() => null);
        setError(body?.error?.message ?? t("saveFailed"));
        return;
      }

      if (docsLater) {
        router.push("/supplier/dashboard?docs=later");
        return;
      }
      if (completed) {
        const intentParams = extractIntentParams(searchParams);
        const destination = getContinuationPath({
          role: "supplier",
          ...intentParams,
        });
        router.push(destination || "/supplier/dashboard");
      } else {
        setSaved(t("supplier.progressSaved"));
      }
    } finally {
      setSaving(false);
    }
  }

  const needsReupload = SUPPLIER_DOC_TYPES.filter((config) => docDisplayState(findDoc(documents, config.type)) === "needs_file").length;
  const textareaClass = "w-full rounded-[16px] border border-app-line bg-white px-4 py-3 text-[16px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";

  return (
    <div className="min-h-dvh w-full bg-app-canvas font-app text-app-ink">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-4 bg-app-canvas/90 px-4 py-3 backdrop-blur sm:px-6 xl:px-8">
        <Wordmark />
        <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1"><ProgressBars total={2} current={step - 1} /></div>
        <span className="ml-auto text-[13px] font-bold text-app-ink-soft sm:ml-0">{t("stepOf", { step, total: 2 })}</span>
      </header>

      <main className="w-full px-4 pb-10 pt-4 sm:px-6 xl:px-8">
        <div className="grid gap-3">
          {error && <Notice tone="error">{error}</Notice>}
          {saved && <Notice tone="success">{saved}</Notice>}
        </div>

        {step === 1 && (
          <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="min-w-0">
              <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">{t("supplier.aboutTitle")}</h1>
              <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">
                {t("supplier.aboutSub")}
              </p>

              <div className="mt-6 grid gap-5 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="onb-business">{t("supplier.businessName")}</FieldLabel>
                    <TextInput id="onb-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder={t("supplier.businessNamePlaceholder")} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="onb-display">{t("supplier.displayName")}</FieldLabel>
                    <TextInput id="onb-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("supplier.displayNamePlaceholder")} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="onb-country">{t("country")}</FieldLabel>
                    <TextInput id="onb-country" value={country} onChange={(e) => setCountry(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="onb-city">{t("city")}</FieldLabel>
                    <TextInput id="onb-city" value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor="onb-address">{t("supplier.address")}</FieldLabel>
                  <TextInput id="onb-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("supplier.addressPlaceholder")} />
                </div>
                <div>
                  <FieldLabel htmlFor="onb-description">{t("supplier.makeSell")}</FieldLabel>
                  <textarea id="onb-description" className={textareaClass} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("supplier.makeSellPlaceholder")} />
                </div>
                <fieldset className="m-0 border-0 p-0">
                  <legend className="mb-2 text-[14px] font-bold">{t("supplier.categories")}</legend>
                  <div className="flex flex-wrap gap-2">
                    {categoryOptions.map((cat) => {
                      const on = categories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleCategory(cat)}
                          className={cx(
                            "inline-flex min-h-[40px] items-center rounded-full border px-4 text-[14px] font-bold transition",
                            on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
                          )}
                        >
                          {t.dynamic(`cat.${cat}`, cat)}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <PillButton tone="white" size="md" onClick={() => void save(false)} busy={saving}>{t("saveProgress")}</PillButton>
                <PillButton tone="ink" size="md" onClick={() => setStep(2)}>
                  {t("supplier.toDocs")} <Icon name="arrow" size={15} />
                </PillButton>
              </div>
            </section>

            <aside className="flex items-start gap-3 rounded-[22px] bg-app-mint p-5 xl:mt-[92px] xl:self-start">
              <Mascot name="peggy" className="h-12 w-12 shrink-0" alt="Peggy" />
              <p className="m-0 text-[14.5px] leading-[1.55]">
                {t("supplier.peggyNote")}
              </p>
            </aside>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="min-w-0">
              <div className="text-[14px] text-app-ink-soft">{[displayName || businessName, city, country].filter(Boolean).join(" · ")}</div>
              <h1 className="mb-0 mt-1 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">{t("supplier.verifyTitle")}</h1>
              <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">
                {t("supplier.verifySub")}
              </p>

              {needsReupload > 0 && (
                <div className="mt-6">
                  <Notice tone="error">
                    {t("supplier.reupload", { count: needsReupload })}
                  </Notice>
                </div>
              )}

              <div className="mt-6">
                <CacInstantCheck
                  apiPath="/api/supplier/verification/cac"
                  defaultName={businessName}
                  cacDoc={documents.find((d) => d.type === "cac")}
                  onVerified={(doc) => setDocuments((current) => [...current.filter((d) => d.type !== "cac"), doc])}
                />
              </div>

              <div className="mt-4">
                <VerificationDocUploader
                  role="supplier"
                  docs={documents}
                  docConfigs={SUPPLIER_DOC_TYPES}
                  onUpload={handleDocumentUpload}
                  onDelete={handleDocumentRemove}
                />
              </div>
              <p className="mb-0 mt-1 text-[13px] text-app-ink-soft">{t("supplier.filesSave")}</p>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <PillButton tone="ghost" size="md" onClick={() => setStep(1)}>
                  <Icon name="arrowLeft" size={15} /> {t("back")}
                </PillButton>
                <div className="flex flex-wrap gap-2">
                  <PillButton tone="white" size="md" onClick={() => void save(false)} disabled={saving}>{t("saveProgress")}</PillButton>
                  <PillButton tone="accent" size="md" onClick={() => void save(true)} busy={saving} disabled={uploadsInFlight > 0}>
                    {t("supplier.submit")} <Icon name="arrow" size={15} />
                  </PillButton>
                </div>
              </div>

              {/* Not everyone has their papers to hand. Let them in to set up, and remind them to finish. */}
              <div className="mt-6 flex flex-wrap items-center gap-4 rounded-[22px] border border-dashed border-app-line-strong bg-white p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-peach text-app-ink"><Icon name="clock" size={18} /></span>
                <div className="min-w-0 flex-1 basis-[260px]">
                  <h2 className="m-0 text-[16px] font-extrabold">{t("supplier.notReady")}</h2>
                  <p className="mb-0 mt-1 text-[14px] leading-[1.5] text-app-ink-soft">
                    {t("supplier.notReadySub")}
                  </p>
                </div>
                <PillButton tone="ink" size="md" onClick={() => void save(false, true)} disabled={saving || uploadsInFlight > 0}>
                  {t("supplier.withoutDocs")} <Icon name="arrow" size={15} />
                </PillButton>
              </div>
            </section>

            <aside className="grid content-start gap-4 xl:mt-[118px]">
              <div className="rounded-[22px] border border-app-line bg-white p-5">
                <h2 className="m-0 text-[17px] font-extrabold">{t("whatNext")}</h2>
                <ol className="m-0 mt-3 grid list-none gap-3 p-0 text-[14px] leading-[1.5]">
                  {[
                    t("supplier.next1"),
                    t("supplier.next2"),
                    t("supplier.next3"),
                  ].map((line, index) => (
                    <li key={line} className="flex gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-ink text-[12px] font-extrabold text-white">{index + 1}</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex items-start gap-3 rounded-[22px] bg-app-mint p-5">
                <Mascot name="peggy" className="h-12 w-12 shrink-0" alt="Peggy" />
                <p className="m-0 text-[14.5px] leading-[1.55]">
                  {t("supplier.peggyNote")}
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
