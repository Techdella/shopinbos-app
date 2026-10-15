"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { uploadStudioPhoto } from "@/components/builder/rex/api";
import { isVideoFile, videoFrames } from "@/components/builder/rex/video-frames";
import { creditsChanged, openTopUp } from "@/components/credits/CreditsBadge";
import { Icon } from "@/components/ui/Icon";
import { FieldLabel, Notice, PillButton, Spinner, TextInput, cx } from "@/components/app-ui";
import { AssistantNote, Pill } from "@/components/app-kit";
import { useT } from "@/components/i18n/I18nProvider";
import { RexProgress } from "@/components/builder/rex/RexProgress";
import { RexImageActions } from "@/components/builder/rex/RexImageActions";

interface LogoResult {
  style: string;
  label: string;
  url: string;
  palette: { primary: string; secondary: string; accent: string };
}

const MAX_INSPIRATION = 3;

interface Batch {
  id: number;
  /** "ideas": three directions; "like": variations of one logo. */
  kind: "ideas" | "like";
  logos: LogoResult[];
}

// Logo studio: make three ideas, tap one to choose it, then "Use as my store logo" and the next steps (see it on
// the store, brand kit, dashboard, save, post). "New ideas" tries a fresh direction; "More like this" varies the
// chosen one. Earlier rounds stay on the page so nothing is lost.
export function LogoStudioClient({ storeName, about = "", currentLogo = null }: { storeName: string; about?: string; currentLogo?: string | null }) {
  const t = useT("rex");
  const [businessName, setBusinessName] = useState(storeName);
  const [description, setDescription] = useState(about);
  const [paletteHint, setPaletteHint] = useState("");
  const [notes, setNotes] = useState("");
  const [inspiration, setInspiration] = useState<Array<{ url: string; fromVideo: boolean }>>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState<null | "ideas" | "like">(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [round, setRound] = useState(0);
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState<LogoResult | null>(null);
  const [storeLogo, setStoreLogo] = useState<string | null>(currentLogo);
  const [saving, setSaving] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [pictures, setPictures] = useState<{ used: number; limit: number } | null>(null);

  async function generate(likeUrl?: string) {
    if (!businessName.trim() || loading) return;
    const nextRound = likeUrl ? round : round + 1;
    setLoading(likeUrl ? "like" : "ideas");
    setError("");
    try {
      const res = await fetch("/api/ai/generate-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessDescription: description.trim(),
          paletteHint: paletteHint.trim(),
          notes: notes.trim(),
          referenceUrls: inspiration.map((item) => item.url),
          round: nextRound,
          ...(likeUrl ? { likeUrl } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? t("logo.failed"));
        return;
      }
      setRound(nextRound);
      setBatches((prev) => [{ id: Date.now(), kind: likeUrl ? "like" : "ideas", logos: data.logos ?? [] }, ...prev]);
      setCredits(data.creditsRemaining ?? null);
      setPictures(data.pictures ?? null);
      if (!likeUrl) setChosen(null);
    } catch {
      setError(t("studio.offline"));
    } finally {
      setLoading(null);
      creditsChanged();
    }
  }

  /** Photos (or stills from a video) the seller gives Rex as inspiration: an old sign, packaging, logos they like. */
  async function addInspiration(files: FileList | null) {
    if (!files?.length) return;
    let room = MAX_INSPIRATION - inspiration.length;
    if (room <= 0) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        if (room <= 0) break;
        const video = isVideoFile(file);
        const parts = video ? await videoFrames(file, Math.min(2, room)) : [file];
        for (const part of parts) {
          const url = await uploadStudioPhoto(part);
          setInspiration((prev) => [...prev, { url, fromVideo: video }]);
          room -= 1;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("img.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function useAsLogo(logo: LogoResult) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/app/store", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ logoUrl: logo.url }) });
      if (!res.ok) throw new Error();
      setStoreLogo(logo.url);
    } catch {
      setError(t("logo.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const [latest, ...earlier] = batches;
  const chosenIsLogo = Boolean(chosen && storeLogo === chosen.url);
  const nextLink = "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold text-app-ink no-underline hover:border-app-line-strong";

  function logoCard(logo: LogoResult, small = false) {
    const on = chosen?.url === logo.url;
    const isStoreLogo = storeLogo === logo.url;
    return (
      <button
        key={logo.url}
        type="button"
        aria-pressed={on}
        onClick={() => setChosen(logo)}
        className={cx("flex min-w-0 items-center gap-4 rounded-[22px] border-2 bg-white text-left transition", small ? "p-2" : "p-3", on ? "border-app-ink shadow-[0_8px_24px_rgba(22,20,31,0.08)]" : "border-app-line hover:border-app-line-strong")}
      >
        <span className={cx("grid shrink-0 place-items-center overflow-hidden rounded-[16px] bg-white", small ? "h-16 w-16" : "h-24 w-24")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo.url} alt={logo.label} className="h-full w-full object-contain" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-extrabold">{logo.label}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {isStoreLogo ? <Pill tone="success" dot>{t("logo.yours")}</Pill> : on ? <Pill tone="ink">{t("logo.selected")}</Pill> : <Pill>{logo.style}</Pill>}
          </span>
          {small ? null : (
            <span className="mt-2 flex gap-1.5">
              {[logo.palette.primary, logo.palette.secondary, logo.palette.accent].map((c, i) => (
                <span key={i} className="h-5 w-5 rounded-full border border-app-line" style={{ background: c }} title={c} />
              ))}
            </span>
          )}
        </span>
      </button>
    );
  }

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
            <div className="rounded-[16px] bg-app-canvas p-4">
              <p className="m-0 text-[14px] font-bold">{t("logo.context")}</p>
              <p className="m-0 mt-0.5 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("logo.contextHint")}</p>
              <label htmlFor="logo-notes" className="sr-only">{t("logo.notes")}</label>
              <textarea
                id="logo-notes"
                rows={3}
                maxLength={600}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("logo.notesPh")}
                className="mt-3 w-full resize-y rounded-[14px] border border-app-line bg-white px-3.5 py-2.5 text-[14px] leading-[1.5] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink"
              />
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {inspiration.map((item) => (
                  <span key={item.url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={item.fromVideo ? t("img.fromVideo") : t("logo.inspirationAlt")} className="h-14 w-14 rounded-[10px] object-cover" />
                    {item.fromVideo ? (
                      <span className="absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-full bg-app-ink/80 text-white"><Icon name="play" size={10} /></span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setInspiration((prev) => prev.filter((entry) => entry.url !== item.url))}
                      aria-label={t("img.removeRef")}
                      className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-app-ink text-white"
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </span>
                ))}
                {inspiration.length < MAX_INSPIRATION ? (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || loading !== null}
                    className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-dashed border-app-line-strong bg-white px-4 text-[13px] font-bold hover:border-app-ink disabled:opacity-50"
                  >
                    {uploading ? <Spinner className="h-4 w-4" /> : <Icon name="paperclip" size={14} />} {t("logo.addInspiration")}
                  </button>
                ) : null}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" multiple className="sr-only" tabIndex={-1} onChange={(e) => void addInspiration(e.target.files)} />
              </div>
            </div>
            <PillButton tone="accent" size="md" className="w-full" onClick={() => void generate()} disabled={loading !== null || uploading || !businessName.trim()}>
              {loading === "ideas" ? <><Spinner /> {t("logo.drawing")}</> : <><Icon name="sparkle" size={16} /> {batches.length ? t("logo.newIdeas") : t("logo.make")}</>}
            </PillButton>
            <div className="grid gap-1 text-center text-[12.5px] text-app-ink-soft">
              <p className="m-0">{t("logo.cost")}</p>
              {pictures ? <p className="m-0">{t("logo.freeUsed", { used: pictures.used, limit: pictures.limit })}</p> : null}
              {credits !== null ? (
                <p className="m-0">
                  {t("studio.credits", { count: credits })} ·{" "}
                  <Link href="/home/credits" onClick={(event) => { if (openTopUp()) event.preventDefault(); }} className="font-bold text-app-ink underline underline-offset-2">{t("logo.topUp")}</Link>
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {error && <Notice>{error}</Notice>}

        <AssistantNote who="rex">
          <strong>{t("logo.tipLead")}</strong> {t("logo.tip")}
        </AssistantNote>
      </div>

      <div className="grid min-w-0 content-start gap-5">
        {batches.length === 0 && !loading && (
          <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[22px] border border-dashed border-app-line-strong bg-white px-6 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="palette" size={26} /></span>
            <h2 className="mb-0 mt-3 text-[16px] font-extrabold">{t("logo.emptyTitle")}</h2>
            <p className="mb-0 mt-1 max-w-[320px] text-[14px] text-app-ink-soft">{t("logo.emptyBody")}</p>
          </section>
        )}

        {loading && (
          <section className="rounded-[22px] border border-app-line bg-white px-6 py-7">
            <RexProgress job="logo" className="mx-auto max-w-[420px]" />
          </section>
        )}

        {chosen ? (
          <section className="rounded-[22px] border-2 border-app-ink bg-white p-5" aria-labelledby="logo-next">
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={chosen.url} alt={chosen.label} className="h-24 w-24 shrink-0 rounded-[16px] border border-app-line bg-white object-contain" />
              <div className="min-w-0 flex-1">
                <h2 id="logo-next" className="m-0 text-[17px] font-extrabold">{chosenIsLogo ? t("logo.isYours") : t("logo.next")}</h2>
                <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-app-ink-soft">{chosenIsLogo ? t("logo.isYoursBody") : t("logo.nextBody")}</p>
              </div>
            </div>

            <ol className="m-0 mt-4 grid list-none gap-2.5 p-0">
              <li className="flex flex-wrap items-center gap-2">
                <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-extrabold", chosenIsLogo ? "bg-app-success text-white" : "bg-app-ink text-white")}>{chosenIsLogo ? <Icon name="check" size={12} /> : 1}</span>
                {chosenIsLogo ? (
                  <span className="text-[14px] font-bold">{t("logo.usingIt")}</span>
                ) : (
                  <PillButton size="sm" tone="ink" busy={saving} onClick={() => void useAsLogo(chosen)}>
                    <Icon name="check" size={14} /> {t("logo.useIt")}
                  </PillButton>
                )}
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-canvas text-[12px] font-extrabold">2</span>
                <Link href="/studio?preview=1" className={nextLink}><Icon name="eye" size={14} /> {t("logo.seeStore")}</Link>
                <Link href="/home/brand-kit" className={nextLink}><Icon name="tag" size={14} /> {t("logo.brandKit")}</Link>
                <Link href="/home" className={nextLink}><Icon name="home" size={14} /> {t("logo.dashboard")}</Link>
              </li>
              <li className="flex flex-wrap items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-app-canvas text-[12px] font-extrabold">3</span>
                <button type="button" onClick={() => void generate(chosen.url)} disabled={loading !== null} className={cx(nextLink, "disabled:opacity-50")}>
                  {loading === "like" ? <Spinner className="h-4 w-4" /> : <Icon name="sparkle" size={14} />} {t("logo.moreLike")}
                </button>
                <button type="button" onClick={() => void generate()} disabled={loading !== null} className={cx(nextLink, "disabled:opacity-50")}>
                  <Icon name="refresh" size={14} /> {t("logo.newIdeas")}
                </button>
              </li>
            </ol>
            <RexImageActions url={chosen.url} name={`${businessName.trim() || storeName} logo`} withProductPicker={false} className="mt-4 border-t border-app-line pt-4" />
          </section>
        ) : null}

        {latest ? (
          <section className="grid gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="m-0 text-[17px] font-extrabold">{latest.kind === "like" ? t("logo.variations") : t("logo.pick")}</h2>
                <p className="m-0 text-[13.5px] text-app-ink-soft">{t("logo.tapHint")}</p>
              </div>
              <button type="button" onClick={() => void generate()} disabled={loading !== null} className={cx(nextLink, "disabled:opacity-50")}>
                <Icon name="refresh" size={14} /> {t("logo.newIdeas")}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
              {latest.logos.map((logo) => logoCard(logo))}
            </div>
          </section>
        ) : null}

        {earlier.length ? (
          <details className="rounded-[22px] border border-app-line bg-white p-4">
            <summary className="cursor-pointer text-[14px] font-extrabold">{t("logo.earlier", { count: earlier.reduce((sum, batch) => sum + batch.logos.length, 0) })}</summary>
            <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
              {earlier.flatMap((batch) => batch.logos).map((logo) => logoCard(logo, true))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
