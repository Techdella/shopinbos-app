"use client";

import { useEffect, useId, useState } from "react";
import { FieldLabel, Notice, PillButton, TextInput, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import type { VerificationDoc } from "@shared/verification-docs";
import { CAC_COMPANY_TYPES, CAC_COMPANY_TYPE_LABELS, parseCacNumber, type CacCompanyType } from "@/lib/kyb/cac";
import { useT } from "@/components/i18n/I18nProvider";

// "Verify instantly with CAC": the business types its registered name and BN/RC number, we check the CAC
// registry, and a match (with the account holder listed on the record) stands in for the certificate upload.
// Hidden when the check isn't switched on (no provider keys) or the CAC document is already settled.

interface Props {
  apiPath: "/api/supplier/verification/cac" | "/api/logistics/verification/cac";
  defaultName?: string;
  cacDoc?: VerificationDoc;
  onVerified: (doc: VerificationDoc) => void;
}

export function CacInstantCheck({ apiPath, defaultName = "", cacDoc, onVerified }: Props) {
  const ids = useId();
  const t = useT("verification");
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [name, setName] = useState(defaultName);
  const [number, setNumber] = useState("");
  const [type, setType] = useState<CacCompanyType | "">("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "success" | "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(apiPath)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setEnabled(Boolean(d?.data?.enabled)))
      .catch(() => alive && setEnabled(false));
    return () => { alive = false; };
  }, [apiPath]);

  useEffect(() => { if (defaultName && !name) setName(defaultName); }, [defaultName, name]);

  const registry = cacDoc?.registry;
  const settled = cacDoc && ["submitted", "under_review", "approved"].includes(cacDoc.status);
  if (registry?.verified) {
    return (
      <div className="flex items-start gap-3 rounded-[18px] bg-app-success-tint p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-success text-white"><Icon name="check" size={18} /></span>
        <div className="min-w-0 text-[14px] leading-[1.5]">
          <div className="font-extrabold">{t("cac.verified")}</div>
          <div className="text-app-ink-soft">{t("cac.noUploadNeeded", { name: registry.registeredName, prefix: registry.companyType === "BUSINESS_NAME" ? "BN" : "RC", number: registry.rcNumber })}</div>
        </div>
      </div>
    );
  }
  if (!enabled || settled) return null;

  // The BN/RC prefix picks the type when the person hasn't.
  const implied = parseCacNumber(number)?.impliedType ?? null;
  const effectiveType = type || implied || "";

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: name, number, companyType: effectiveType || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ tone: "error", text: body?.error?.message ?? t("cac.failed") });
        return;
      }
      const data = body.data ?? {};
      setResult({ tone: data.outcome === "verified" ? "success" : data.outcome === "needs_review" ? "info" : "error", text: data.message });
      if (data.doc) onVerified(data.doc as VerificationDoc);
    } catch {
      setResult({ tone: "error", text: t("cac.failed") });
    } finally {
      setBusy(false);
    }
  }

  const canCheck = name.trim().length >= 2 && Boolean(parseCacNumber(number)) && Boolean(effectiveType) && !busy;

  return (
    <section aria-labelledby={`${ids}-title`} className="rounded-[22px] border border-app-line bg-app-canvas/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-app-ink text-white"><Icon name="bolt" size={18} /></span>
        <div className="min-w-0">
          <h3 id={`${ids}-title`} className="m-0 text-[15.5px] font-extrabold">{t("cac.title")}</h3>
          <p className="mb-0 mt-0.5 text-[13.5px] leading-[1.5] text-app-ink-soft">
            {t("cac.intro")}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FieldLabel htmlFor={`${ids}-name`}>{t("cac.name")}</FieldLabel>
          <TextInput id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("cac.namePlaceholder")} autoComplete="organization" maxLength={160} />
        </div>
        <div>
          <FieldLabel htmlFor={`${ids}-number`}>{t("cac.number")}</FieldLabel>
          <TextInput id={`${ids}-number`} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="RC 1234567" inputMode="text" autoCapitalize="characters" maxLength={20} />
        </div>
        <div>
          <FieldLabel htmlFor={`${ids}-type`}>{t("cac.type")}</FieldLabel>
          <select
            id={`${ids}-type`}
            value={effectiveType}
            onChange={(e) => setType(e.target.value as CacCompanyType)}
            className={cx("h-[54px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[16px] outline-none transition focus:border-app-ink", !effectiveType && "text-app-ink-faint")}
          >
            <option value="" disabled>{t("cac.chooseType")}</option>
            {CAC_COMPANY_TYPES.map((value) => <option key={value} value={value}>{t.dynamic(`cac.type.${value}`, CAC_COMPANY_TYPE_LABELS[value])}</option>)}
          </select>
        </div>
      </div>

      {result && <div className="mt-3"><Notice tone={result.tone}>{result.text}</Notice></div>}

      <PillButton tone="ink" size="md" className="mt-4 w-full sm:w-auto" onClick={check} disabled={!canCheck} busy={busy}>
        {t("cac.check")}
      </PillButton>
    </section>
  );
}
