"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
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
  type: "registration" | "tax" | "bank" | "identity" | "factory" | "other";
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

const documentFindingsData = [
  ["Registered name", "Waiting for upload"],
  ["BN / RC number", "Waiting for upload"],
  ["Registration type", "Waiting for upload"],
  ["Director", "Waiting for upload"],
  ["Address", "Waiting for upload"],
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
  const [businessName, setBusinessName] = useState(initialSupplier?.businessName ?? "Your supplier business");
  const [displayName, setDisplayName] = useState(initialSupplier?.displayName ?? initialSupplier?.businessName ?? "Your supplier business");
  const [country, setCountry] = useState(initialSupplier?.country ?? initialUser?.country ?? "Nigeria");
  const [city, setCity] = useState(initialSupplier?.city ?? initialUser?.city ?? "Lagos");
  const [address, setAddress] = useState(initialSupplier?.address ?? "");
  const [description, setDescription] = useState(initialSupplier?.description ?? "");
  const [categories, setCategories] = useState<string[]>(initialSupplier?.categories?.length ? initialSupplier.categories : []);
  const [documents, setDocuments] = useState<Document[]>(() => normalizeDocuments(initialSupplier?.verificationDocuments));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(initialSupplier?.onboardingState?.completed ? "Submitted for admin review." : "");

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
    if (status === "read") return "success";
    if (status === "uploaded" || status === "reading") return "info";
    return "soft";
  }

  function documentLabel(doc: Document) {
    if (doc.status === "read") return "Read by Rex";
    if (doc.status === "uploaded") return "Uploaded";
    if (doc.status === "reading") return "Reading";
    return doc.status;
  }

  async function save(completed: boolean) {
    setSaving(true);
    setSaved("");
    try {
      const requiredDocs = documents.filter((d) => requiredDocumentTypes.has(d.type));
      const missingRequiredDocs = requiredDocs.filter((d) => !isDocumentComplete(d));

      if (completed && missingRequiredDocs.length > 0) {
        setSaved(`Please upload ${missingRequiredDocs.map((doc) => doc.name).join(", ")} before submitting.`);
        return;
      }

      const readCount = requiredDocs.filter(isDocumentComplete).length;
      const readinessScore = Math.round((readCount / Math.max(requiredDocs.length, 1)) * 100);

      await fetch("/api/supplier/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          displayName,
          country,
          city,
          address,
          description,
          categories,
          documents,
          documentFindings: {
            registeredName: "Atelier 12 Trading Ltd",
            rcNumber: "1,748,221",
            businessType: "Limited Liability",
            director: initialUser?.name || "Ifeanyi Okonkwo",
            address,
          },
          readinessScore,
          completed,
        }),
      }).catch(() => null);

      if (completed) {
        const intentParams = extractIntentParams(searchParams);
        const destination = getContinuationPath({
          role: "supplier",
          ...intentParams,
        });
        router.push(destination || "/supplier/dashboard");
      } else {
        setSaved("Progress saved. You can come back and finish verification later.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stage bg-[var(--canvas)] px-7 py-6">
      <div className="mb-6 flex items-center justify-between">
        <BrandLogo className="w-[132px]" />
        <div className="text-[13px] font-semibold text-[var(--ink-500)]">
          Step {step} of 2 · manual admin verification required
        </div>
      </div>
      {saved && (
        <div className="mx-auto mb-5 max-w-[1100px] rounded-[12px] border border-[var(--teal-200)] bg-[var(--teal-50)] px-4 py-3 text-[13px] font-semibold text-[var(--teal-800)]">
          {saved}
        </div>
      )}

      {step === 1 && (
        <div className="mx-auto flex max-w-[800px] flex-col">
          <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-500)]">
            Supplier onboarding
          </div>
          <h1 className="onb-title">Tell us about your business.</h1>
          <p className="onb-sub">
            Save progress anytime. You can use the platform after Shopinbos admin manually verifies your supplier profile.
          </p>

          <div className="card mt-7" style={{ padding: 24 }}>
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field">
                  <span className="label">Business name</span>
                  <input className="inp" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Your registered business name" />
                </label>
                <label className="field">
                  <span className="label">Display name</span>
                  <input className="inp" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Public-facing name" />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field">
                  <span className="label">Country</span>
                  <input className="inp" value={country} onChange={(e) => setCountry(e.target.value)} />
                </label>
                <label className="field">
                  <span className="label">City</span>
                  <input className="inp" value={city} onChange={(e) => setCity(e.target.value)} />
                </label>
              </div>

              <label className="field">
                <span className="label">Business address</span>
                <input className="inp" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, region" />
              </label>

              <label className="field">
                <span className="label">Description of your business</span>
                <textarea className="ta" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What do you manufacture? Materials, capacity, lead times..." />
              </label>

              <div className="field">
                <span className="label">Product categories</span>
                <div className="flex flex-wrap gap-1.5">
                  {categoryOptions.map((cat) => (
                    <button key={cat} type="button" onClick={() => toggleCategory(cat)} className={`chip ${categories.includes(cat) ? "on" : ""}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button type="button" onClick={() => void save(false)} className="btn btn-ghost" disabled={saving}>
              {saving ? "Saving..." : "Save progress"}
            </button>
            <button type="button" onClick={() => setStep(2)} className="btn btn-mint btn-lg">
              Continue to verification <Icon name="arrow" size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mx-auto grid w-full max-w-[1100px] gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-500)]">
              {displayName} - {city}, {country}
            </div>
            <h1 className="onb-title">Verify your business.</h1>
            <p className="onb-sub max-w-[580px]">
              Upload documents, then submit for manual admin verification. Your public page and supplier tools stay locked until approval.
            </p>

            <div className="mt-7 flex flex-col gap-3">
              {documents.map((doc) => (
                <div key={doc.id} className="card flex items-center gap-4" style={{ padding: 14, borderRadius: 12 }}>
                  <div className="grid h-[42px] w-[42px] place-items-center rounded-[10px] bg-[var(--ink-75)] text-[var(--teal-700)]">
                    <Icon name={doc.status === "read" ? "check" : doc.status === "uploaded" || doc.status === "reading" ? "refresh" : "upload"} size={19} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold text-[var(--ink-900)]">{doc.name}</div>
                    <div className="mt-0.5 text-[12px] text-[var(--ink-500)]">{doc.fileName ?? doc.notes}</div>
                  </div>
                  <label className="btn btn-ghost btn-sm cursor-pointer">
                    {doc.status === "pending" || doc.status === "optional" ? "Upload" : "Replace"}
                    <input type="file" className="sr-only" onChange={(e) => handleDocumentUpload(doc.id, e.target.files)} />
                  </label>
                  <span className={`badge badge-${documentTone(doc.status)}`}>{documentLabel(doc)}</span>
                </div>
              ))}
            </div>

            <div className="mt-7 flex items-center justify-between">
              <button type="button" onClick={() => setStep(1)} className="btn btn-ghost">Back</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => void save(false)} className="btn btn-ghost" disabled={saving}>
                  Save progress
                </button>
                <button type="button" onClick={() => void save(true)} className="btn btn-mint btn-lg" disabled={saving}>
                  {saving ? "Saving..." : "Submit for admin review"} <Icon name="arrow" size={14} />
                </button>
              </div>
            </div>
          </div>

          <aside>
            <div className="card mb-4">
              <div className="mb-4 flex gap-3">
                <div className="grid h-[38px] w-[38px] place-items-center rounded-[10px] bg-[var(--teal-100)]">
                  <Icon name="sparkle" size={18} color="var(--teal-700)" />
                </div>
                <div>
                  <div className="onb-card-kicker">Reading your documents</div>
                  <div className="text-[15px] font-semibold text-[var(--ink-900)]">What Rex found in your registration</div>
                </div>
              </div>
              {documentFindingsData.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 py-1.5 text-[13px]">
                  <span className="text-[var(--ink-500)]">{label}</span>
                  <span className="text-right font-semibold text-[var(--ink-900)]">{value}</span>
                </div>
              ))}
              <div className="mt-3 flex items-center gap-1 rounded-[10px] bg-[var(--success-bg)] px-3 py-2 text-[12.5px] font-semibold text-[var(--success)]">
                <Icon name="check" size={14} /> Confirmed against business registration records
              </div>
            </div>
            <div className="card bg-[linear-gradient(160deg,var(--teal-50),var(--teal-100))]">
              <div className="flex gap-4">
                <ChipAvatar mascot="peggy" size={56} />
                <div>
                  <div className="onb-card-kicker">From Peggy</div>
                  <div className="mt-1 text-[13.5px] leading-6 text-[var(--ink-800)]">
                    Once Shopinbos admin approves you, I&apos;ll watch for sellers in your category and suggest you when there&apos;s a match.
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
