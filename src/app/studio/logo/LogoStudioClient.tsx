"use client";

import { creditsChanged } from "@/components/credits/CreditsBadge";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { FieldLabel, Notice, PillButton, Spinner, TextInput, cx } from "@/components/app-ui";
import { AssistantNote, Pill } from "@/components/app-kit";
import { useT } from "@/components/i18n/I18nProvider";

interface LogoResult {
  style: string;
  label: string;
  url: string;
  palette: { primary: string; secondary: string; accent: string };
}

export function LogoStudioClient({ storeName }: { storeName: string }) {
  const t = useT("rex");
  const [businessName, setBusinessName] = useState(storeName);
  const [description, setDescription] = useState("");
  const [paletteHint, setPaletteHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [logos, setLogos] = useState<LogoResult[]>([]);
  const [error, setError] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  const generateLogos = async () => {
    if (!businessName.trim()) return;
    setLoading(true);
    setError("");
    setLogos([]);
    try {
      const res = await fetch("/api/ai/generate-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessDescription: description.trim(),
          paletteHint: paletteHint.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? t("logo.failed"));
        return;
      }
      setLogos(data.logos ?? []);
      setCredits(data.creditsRemaining ?? null);
    } catch {
      setError(t("studio.offline"));
    } finally {
      setLoading(false);
      creditsChanged();
    }
  };

  const handleSelect = async (url: string) => {
    setSelectedStyle(url);
    setError("");
    try {
      // The logo is saved on the store itself (the old /api/store/logo route never existed).
      const res = await fetch("/api/app/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: url }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSelectedStyle(null);
      setError(t("logo.saveFailed"));
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="grid min-w-0 content-start gap-5">
        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[17px] font-extrabold">{t("logo.brand")}</h2>
          <div className="mt-4 grid gap-4">
            <div>
              <FieldLabel htmlFor="logo-name">{t("logo.name")}</FieldLabel>
              <TextInput id="logo-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder={t("logo.namePh")} />
            </div>
            <div>
              <FieldLabel htmlFor="logo-desc">{t("logo.what")}</FieldLabel>
              <textarea
                id="logo-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("logo.whatPh")}
                className="w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] leading-[1.55] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink"
              />
            </div>
            <div>
              <FieldLabel htmlFor="logo-colours">{t("logo.colours")}</FieldLabel>
              <TextInput id="logo-colours" value={paletteHint} onChange={(e) => setPaletteHint(e.target.value)} placeholder={t("logo.coloursPh")} />
            </div>
            <PillButton tone="accent" size="md" className="w-full" onClick={generateLogos} disabled={loading || !businessName.trim()}>
              {loading ? <><Spinner /> {t("logo.drawing")}</> : <><Icon name="sparkle" size={16} /> {t("logo.make")}</>}
            </PillButton>
            {credits !== null && <p className="m-0 text-center text-[13px] text-app-ink-soft">{t("studio.credits", { count: credits })}</p>}
          </div>
        </section>

        {error && <Notice>{error}</Notice>}

        <AssistantNote who="rex">
          <strong>{t("logo.tipLead")}</strong> {t("logo.tip")}
        </AssistantNote>
      </div>

      <div className="grid min-w-0 content-start gap-5">
        {logos.length === 0 && !loading && (
          <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[22px] border border-dashed border-app-line-strong bg-white px-6 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="palette" size={26} /></span>
            <h2 className="mb-0 mt-3 text-[16px] font-extrabold">{t("logo.emptyTitle")}</h2>
            <p className="mb-0 mt-1 max-w-[320px] text-[14px] text-app-ink-soft">{t("logo.emptyBody")}</p>
          </section>
        )}

        {loading && (
          <section role="status" className="flex min-h-[320px] flex-col items-center justify-center rounded-[22px] border border-app-line bg-white px-6 py-10 text-center">
            <span aria-hidden className="inline-block h-10 w-10 animate-spin rounded-full border-[3px] border-app-ink border-r-transparent" />
            <h2 className="mb-0 mt-4 text-[16px] font-extrabold">{t("logo.loadingTitle")}</h2>
            <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">{t("logo.loadingBody")}</p>
          </section>
        )}

        {logos.length > 0 && (
          <section className="grid gap-3">
            <h2 className="m-0 text-[17px] font-extrabold">{t("logo.pick")}</h2>
            <p className="m-0 text-[13.5px] text-app-ink-soft">{t("logo.tapHint")}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
              {logos.map((logo) => {
                const on = selectedStyle === logo.url;
                return (
                  <button
                    key={logo.style}
                    type="button"
                    aria-pressed={on}
                    onClick={() => handleSelect(logo.url)}
                    className={cx("flex min-w-0 items-center gap-4 rounded-[22px] border-2 bg-white p-3 text-left transition", on ? "border-app-ink" : "border-app-line hover:border-app-line-strong")}
                  >
                    <span className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[16px]" style={{ background: logo.palette.accent }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logo.url} alt={logo.label} className="h-full w-full object-contain" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-extrabold">{logo.label}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Pill>{logo.style}</Pill>
                        {on && <Pill tone="success" dot>{t("logo.yours")}</Pill>}
                      </span>
                      <span className="mt-2 flex gap-1.5">
                        {[logo.palette.primary, logo.palette.secondary, logo.palette.accent].map((c, i) => (
                          <span key={i} className="h-5 w-5 rounded-full border border-app-line" style={{ background: c }} title={c} />
                        ))}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
