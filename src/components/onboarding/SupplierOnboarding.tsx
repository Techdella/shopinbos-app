"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FieldLabel, Mascot, Notice, PillButton, ProgressBars, TextInput, Wordmark, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import intentRouting from "@/lib/intent-routing";

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
    verificationDocuments?: Document[] | null;
    onboardingState?: { completed?: boolean; readinessScore?: number } | null;
  } | null;
}

interface Document {
  id: string;
  name: string;
  type: "registration" | "tax" | "bank" | "identity" | "product-images" | "factory" | "other";
  fileName?: string;
  status: "pending" | "uploaded" | "reading" | "read" | "optional";
  notes?: string;
  uploadedAt?: string;
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

const DOCUMENTS: Document[] = [
  { id: "registration", name: "Business Name registration or CAC certificate", type: "registration", status: "pending", notes: "Upload your BN registration or CAC certificate." },
  { id: "owner", name: "Owner NIN", type: "identity", status: "pending", notes: "NIN slip or NIN-backed identity document." },
  { id: "product-images", name: "Product images", type: "product-images", status: "pending", notes: "At least 5 images showing your products (min 5, max 20)." },
  { id: "tax", name: "Tax identification", type: "tax", status: "optional", notes: "Optional - upload your TIN certificate or tax document." },
  { id: "bank", name: "Bank account proof", type: "bank", status: "optional", notes: "Optional - upload bank proof that matches the business name." },
];

const requiredDocumentTypes = new Set<Document["type"]>(["registration", "identity", "product-images"]);

function isDocumentComplete(doc: Document) {
  return doc.status === "read" || doc.status === "uploaded";
}

function normalizeDocuments(documents?: Document[] | null) {
  const incoming = documents?.map((doc) => (doc.id === "cac" ? { ...doc, id: "registration" } : doc)) ?? [];
  const normalized = DOCUMENTS.map((defaultDoc) => {
    const uploadedDoc = incoming.find((doc) => doc.id === defaultDoc.id || doc.type === defaultDoc.type);

    return {
      ...defaultDoc,
      ...uploadedDoc,
      id: defaultDoc.id,
      name: defaultDoc.name,
      notes: uploadedDoc?.fileName ? defaultDoc.notes : defaultDoc.notes,
      status: requiredDocumentTypes.has(defaultDoc.type)
        ? uploadedDoc && isDocumentComplete(uploadedDoc)
          ? uploadedDoc.status
          : "pending"
        : uploadedDoc?.status ?? defaultDoc.status,
    };
  });

  const extraDocuments = incoming.filter((doc) => !normalized.some((normalizedDoc) => normalizedDoc.id === doc.id || normalizedDoc.type === doc.type));
  return [...normalized, ...extraDocuments];
}

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
  const [documents, setDocuments] = useState<Document[]>(() => normalizeDocuments(initialSupplier?.verificationDocuments));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialSupplier?.onboardingState?.completed ? "Submitted for admin review." : "");
  const [error, setError] = useState("");

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function handleDocumentUpload(id: string, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setDocuments((current) =>
      current.map((doc) =>
        doc.id === id
          ? { ...doc, fileName: file.name, status: "uploaded" as const, uploadedAt: new Date().toISOString() }
          : doc,
      ),
    );
  }

  function documentTone(status: Document["status"]) {
    if (status === "read") return "bg-app-success-tint text-app-success";
    if (status === "uploaded" || status === "reading") return "bg-[#E8EAFB] text-[#3D4FB8]";
    if (status === "pending") return "bg-app-peach text-app-accent-ink";
    return "bg-app-canvas text-app-ink-soft";
  }

  function documentLabel(doc: Document) {
    if (doc.status === "read") return "Read by Rex";
    if (doc.status === "uploaded") return "Uploaded";
    if (doc.status === "reading") return "Reading";
    if (doc.status === "pending") return "Needed";
    return "Optional";
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
      const requiredDocs = documents.filter((d) => requiredDocumentTypes.has(d.type));
      const missingRequiredDocs = requiredDocs.filter((d) => !isDocumentComplete(d));

      if (completed && !textOrUndefined(businessName)) {
        setError("Add your business name before submitting.");
        setStep(1);
        return;
      }
      if (completed && missingRequiredDocs.length > 0) {
        setError(`Please add ${missingRequiredDocs.map((doc) => doc.name).join(", ")} before submitting.`);
        return;
      }

      const readCount = requiredDocs.filter(isDocumentComplete).length;
      const readinessScore = Math.round((readCount / Math.max(requiredDocs.length, 1)) * 100);

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
          documents,
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

              <ul className="m-0 mt-6 list-none divide-y divide-app-line overflow-hidden rounded-[22px] border border-app-line bg-white p-0">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-canvas">
                      <Icon name={doc.status === "read" || doc.status === "uploaded" ? "check" : doc.status === "reading" ? "refresh" : "document"} size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-extrabold">{doc.name}</span>
                      <span className="block truncate text-[13px] text-app-ink-soft">{doc.fileName ?? doc.notes}</span>
                    </span>
                    <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold", documentTone(doc.status))}>{documentLabel(doc)}</span>
                    <label className="inline-flex min-h-[40px] shrink-0 cursor-pointer items-center rounded-full border border-app-line bg-white px-4 text-[13px] font-extrabold transition hover:border-app-line-strong focus-within:outline focus-within:outline-2 focus-within:outline-app-ink">
                      {doc.status === "pending" || doc.status === "optional" ? "Choose file" : "Replace"}
                      <input type="file" className="sr-only" aria-label={`File for ${doc.name}`} onChange={(e) => handleDocumentUpload(doc.id, e.target.files)} />
                    </label>
                  </li>
                ))}
              </ul>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <PillButton tone="ghost" size="md" onClick={() => setStep(1)}>
                  <Icon name="arrowLeft" size={15} /> Back
                </PillButton>
                <div className="flex flex-wrap gap-2">
                  <PillButton tone="white" size="md" onClick={() => void save(false)} disabled={saving}>Save progress</PillButton>
                  <PillButton tone="accent" size="md" onClick={() => void save(true)} busy={saving}>
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
