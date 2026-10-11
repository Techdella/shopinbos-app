"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FieldLabel, Mascot, Notice, PillButton, ProgressBars, TextInput, Wordmark, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { VerificationDocUploader } from "@/components/verification/VerificationDocUploader";
import { deleteVerificationFile, uploadVerificationFile } from "@/components/verification/upload-client";
import intentRouting from "@/lib/intent-routing";
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
  const [saved, setSaved] = useState(initialSupplier?.onboardingState?.completed ? "Submitted for admin review." : "");
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

  async function save(completed: boolean) {
    setSaving(true);
    setSaved("");
    setError("");
    try {
      const missingDocs = missingRequiredDocs(SUPPLIER_DOC_TYPES, documents);

      if (completed && !textOrUndefined(businessName)) {
        setError("Add your business name before submitting.");
        setStep(1);
        return;
      }
      if (completed && uploadsInFlight > 0) {
        setError("Wait for your files to finish uploading, then submit.");
        return;
      }
      if (completed && missingDocs.length > 0) {
        setError(`Please upload ${missingDocs.map((doc) => doc.label).join(", ")} before submitting.`);
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
        }),
      }).catch(() => null);

      if (!response?.ok) {
        const body = await response?.json().catch(() => null);
        setError(body?.error?.message ?? "We couldn't save that. Check your connection and try again.");
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
        setSaved("Progress saved. You can come back and finish later.");
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
        <span className="ml-auto text-[13px] font-bold text-app-ink-soft sm:ml-0">Step {step} of 2</span>
      </header>

      <main className="w-full px-4 pb-10 pt-4 sm:px-6 xl:px-8">
        <div className="grid gap-3">
          {error && <Notice tone="error">{error}</Notice>}
          {saved && <Notice tone="success">{saved}</Notice>}
        </div>

        {step === 1 && (
          <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="min-w-0">
              <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">Tell us about your business.</h1>
              <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">
                Save any time. Your supplier tools open after manual admin verification by the Shopinbos team.
              </p>

              <div className="mt-6 grid gap-5 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="onb-business">Business name</FieldLabel>
                    <TextInput id="onb-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your registered business name" />
                  </div>
                  <div>
                    <FieldLabel htmlFor="onb-display">Name sellers see</FieldLabel>
                    <TextInput id="onb-display" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Same as above, or a shorter name" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor="onb-country">Country</FieldLabel>
                    <TextInput id="onb-country" value={country} onChange={(e) => setCountry(e.target.value)} />
                  </div>
                  <div>
                    <FieldLabel htmlFor="onb-city">City</FieldLabel>
                    <TextInput id="onb-city" value={city} onChange={(e) => setCity(e.target.value)} />
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor="onb-address">Business address</FieldLabel>
                  <TextInput id="onb-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, state" />
                </div>
                <div>
                  <FieldLabel htmlFor="onb-description">What you make or sell</FieldLabel>
                  <textarea id="onb-description" className={textareaClass} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Materials, how much you can make, how long orders take…" />
                </div>
                <fieldset className="m-0 border-0 p-0">
                  <legend className="mb-2 text-[14px] font-bold">Product categories</legend>
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
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <PillButton tone="white" size="md" onClick={() => void save(false)} busy={saving}>Save progress</PillButton>
                <PillButton tone="ink" size="md" onClick={() => setStep(2)}>
                  Continue to documents <Icon name="arrow" size={15} />
                </PillButton>
              </div>
            </section>

            <aside className="flex items-start gap-3 rounded-[22px] bg-app-mint p-5 xl:mt-[92px] xl:self-start">
              <Mascot name="peggy" className="h-12 w-12 shrink-0" alt="Peggy" />
              <p className="m-0 text-[14.5px] leading-[1.55]">
                Once you&apos;re approved, I&apos;ll look out for sellers in your categories and suggest you when there&apos;s a match.
              </p>
            </aside>
          </div>
        )}

        {step === 2 && (
          <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="min-w-0">
              <div className="text-[14px] text-app-ink-soft">{[displayName || businessName, city, country].filter(Boolean).join(" · ")}</div>
              <h1 className="mb-0 mt-1 text-[30px] font-extrabold leading-[1.1] tracking-[-0.8px] sm:text-[34px]">Verify your business.</h1>
              <p className="mb-0 mt-2 max-w-[640px] text-[15px] leading-[1.5] text-app-ink-soft">
                Add your documents, then send them for review. Your public page and supplier tools stay locked until you&apos;re approved.
              </p>

              {needsReupload > 0 && (
                <div className="mt-6">
                  <Notice tone="error">
                    {needsReupload === 1 ? "One document" : `${needsReupload} documents`} from an earlier visit never finished uploading. Please upload {needsReupload === 1 ? "it" : "them"} again.
                  </Notice>
                </div>
              )}

              <div className="mt-6">
                <VerificationDocUploader
                  role="supplier"
                  docs={documents}
                  docConfigs={SUPPLIER_DOC_TYPES}
                  onUpload={handleDocumentUpload}
                  onDelete={handleDocumentRemove}
                />
              </div>
              <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">PDF, JPG, PNG or WebP, up to 10 MB each. Files save as soon as they upload.</p>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <PillButton tone="ghost" size="md" onClick={() => setStep(1)}>
                  <Icon name="arrowLeft" size={15} /> Back
                </PillButton>
                <div className="flex flex-wrap gap-2">
                  <PillButton tone="white" size="md" onClick={() => void save(false)} disabled={saving}>Save progress</PillButton>
                  <PillButton tone="accent" size="md" onClick={() => void save(true)} busy={saving} disabled={uploadsInFlight > 0}>
                    Submit for admin review <Icon name="arrow" size={15} />
                  </PillButton>
                </div>
              </div>
            </section>

            <aside className="grid content-start gap-4 xl:mt-[118px]">
              <div className="rounded-[22px] border border-app-line bg-white p-5">
                <h2 className="m-0 text-[17px] font-extrabold">What happens next</h2>
                <ol className="m-0 mt-3 grid list-none gap-3 p-0 text-[14px] leading-[1.5]">
                  {[
                    "You send your documents for review.",
                    "The Shopinbos team checks them, usually within 1-2 business days.",
                    "Once approved, your public page goes live and sellers can order and ask for quotes.",
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
                  Once you&apos;re approved, I&apos;ll look out for sellers in your categories and suggest you when there&apos;s a match.
                </p>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
