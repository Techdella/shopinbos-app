"use client";

import { creditsChanged, openTopUp } from "@/components/credits/CreditsBadge";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { FieldLabel, Notice, PillButton, Spinner, cx } from "@/components/app-ui";
import { AssistantNote, Pill } from "@/components/app-kit";
import Image from "next/image";
import { useT } from "@/components/i18n/I18nProvider";
import { RexProgress } from "@/components/builder/rex/RexProgress";
import { RexImageActions } from "@/components/builder/rex/RexImageActions";
import { uploadStudioPhoto } from "@/components/builder/rex/api";
import { isVideoFile, videoFrames } from "@/components/builder/rex/video-frames";
import { wantsLogo } from "@shared/brand-context";

const SIZES = [
  { id: "1024x1024", label: "img.square" },
  { id: "1792x1024", label: "img.landscape" },
  { id: "1024x1792", label: "img.portrait" },
] as const;

const STYLES = [
  { id: "vivid", label: "img.vivid" },
  { id: "natural", label: "img.natural" },
] as const;

const QUICK_PROMPTS = ["img.idea.0", "img.idea.1", "img.idea.2", "img.idea.3", "img.idea.4"] as const;
const MAX_REFS = 4;

export interface ImageBrand {
  logoUrl: string | null;
  /** Hex colours: accent, button, text, background. */
  colours: string[];
  /** Top categories. */
  sells: string[];
  products: Array<{ name: string; photo: string | null }>;
}

interface Reference {
  url: string;
  fromVideo: boolean;
}

// Rex Studio "Make image": the seller's brand kit (logo, colours) goes into every picture unless they turn it
// off, photos or a video they add are references, and the ideas come from their own products.
export function ImageGenClient({ storeName: _storeName, brand, ideas }: { storeName: string; brand: ImageBrand | null; ideas: string[] }) {
  const t = useT("rex");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<"1024x1024" | "1792x1024" | "1024x1792">("1024x1024");
  const [style, setStyle] = useState<"vivid" | "natural">("vivid");
  const [useLogo, setUseLogo] = useState(false);
  const [logoTouched, setLogoTouched] = useState(false);
  const [useBrand, setUseBrand] = useState(true);
  const [refs, setRefs] = useState<Reference[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<{ url: string; style: string | null; size: string; usedLogo: boolean } | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [credits, setCredits] = useState<number | null>(null);
  const [pictures, setPictures] = useState<{ used: number; limit: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // "…with my logo" or "branded" turns the logo on, until the seller sets the switch themselves.
  useEffect(() => {
    if (!logoTouched) setUseLogo(wantsLogo(prompt));
  }, [prompt, logoTouched]);

  const generateImage = async () => {
    const p = prompt.trim();
    if (!p) return;
    setLoading(true);
    setError("");
    setNote("");
    setImage(null);
    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, size, style, useLogo, useBrand, referenceUrls: refs.map((ref) => ref.url) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? t("img.failed"));
        return;
      }
      setImage({ ...data.image, usedLogo: Boolean(data.usedLogo) });
      if (data.logoProblem === "no_logo") setNote(t("img.noLogoNote"));
      if (data.logoProblem === "unreadable") setNote(t("img.badLogoNote"));
      setCredits(data.creditsRemaining ?? null);
      setPictures(data.pictures ?? null);
    } catch {
      setError(t("studio.offline"));
    } finally {
      setLoading(false);
      creditsChanged();
    }
  };

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    let room = MAX_REFS - refs.length;
    if (room <= 0) {
      setError(t("img.maxRefs", { count: MAX_REFS }));
      return;
    }
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        if (room <= 0) break;
        const video = isVideoFile(file);
        const parts = video ? await videoFrames(file, Math.min(2, room)) : [file];
        for (const part of parts) {
          const url = await uploadStudioPhoto(part);
          setRefs((prev) => [...prev, { url, fromVideo: video }]);
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

  function addProductPhoto(url: string) {
    if (refs.some((ref) => ref.url === url)) return;
    if (refs.length >= MAX_REFS) {
      setError(t("img.maxRefs", { count: MAX_REFS }));
      return;
    }
    setRefs((prev) => [...prev, { url, fromVideo: false }]);
  }

  const chip = (on: boolean) =>
    cx(
      "inline-flex min-h-[40px] items-center rounded-full border px-4 text-[13.5px] font-bold transition",
      on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
    );

  const productPhotos = (brand?.products ?? []).filter((product): product is { name: string; photo: string } => Boolean(product.photo)).slice(0, 6);
  const ideaList = ideas.length ? ideas : QUICK_PROMPTS.map((key) => t(key));

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="grid min-w-0 content-start gap-5">
        {brand ? (
          <section className="rounded-[22px] border border-app-line bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="m-0 text-[15px] font-extrabold">{t("img.brandKit")}</h2>
                <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">{t("img.brandKitSub")}</p>
              </div>
              <Link href="/home/brand-kit" className="shrink-0 text-[13px] font-bold text-app-accent-ink hover:underline">
                {brand.logoUrl ? t("img.editKit") : t("img.addLogo")}
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.logoUrl} alt={t("img.logoAlt")} className="h-12 w-12 rounded-[12px] border border-app-line bg-white object-contain p-1" />
              ) : (
                <span className="grid h-12 w-12 place-items-center rounded-[12px] border border-dashed border-app-line-strong text-center text-[10px] font-bold leading-tight text-app-ink-soft">{t("img.noLogo")}</span>
              )}
              {brand.colours.length ? (
                <span className="flex gap-1.5" aria-label={t("img.colours")}>
                  {brand.colours.map((colour, index) => (
                    <span key={`${colour}-${index}`} title={colour} className="h-7 w-7 rounded-full border border-app-line" style={{ background: colour }} />
                  ))}
                </span>
              ) : null}
              {brand.sells.length ? <p className="m-0 min-w-0 text-[13px] text-app-ink-soft">{t("img.sells", { items: brand.sells.join(", ") })}</p> : null}
            </div>
            <div className="mt-4 grid gap-2.5">
              <Toggle
                id="img-logo"
                checked={useLogo}
                onChange={(next) => {
                  setLogoTouched(true);
                  setUseLogo(next);
                }}
                label={t("img.useLogo")}
                hint={brand.logoUrl ? t("img.useLogoHint") : t("img.noLogoHint")}
              />
              <Toggle id="img-brand" checked={useBrand} onChange={setUseBrand} label={t("img.useBrand")} />
            </div>
          </section>
        ) : null}

        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[17px] font-extrabold">{t("img.describe")}</h2>
          <div className="mt-4">
            <FieldLabel htmlFor="img-prompt">{t("img.what")}</FieldLabel>
            <textarea
              id="img-prompt"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("img.whatPh")}
              className="w-full resize-y rounded-[16px] border border-app-line bg-white px-4 py-3 text-[15px] leading-[1.55] text-app-ink outline-none placeholder:text-app-ink-faint focus:border-app-ink"
            />
          </div>

          <div className="mt-4">
            <p className="m-0 text-[14px] font-bold">{t("img.refs")}</p>
            <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">{t("img.refsHint")}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {refs.map((ref) => (
                <span key={ref.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ref.url} alt={ref.fromVideo ? t("img.fromVideo") : t("img.refAlt")} className="h-16 w-16 rounded-[12px] object-cover" />
                  {ref.fromVideo ? (
                    <span className="absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-full bg-app-ink/80 text-white" title={t("img.fromVideo")}>
                      <Icon name="play" size={10} />
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setRefs((prev) => prev.filter((entry) => entry.url !== ref.url))}
                    aria-label={t("img.removeRef")}
                    className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-app-ink text-white"
                  >
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
              {refs.length < MAX_REFS ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || loading}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-dashed border-app-line-strong px-4 text-[13.5px] font-bold hover:bg-app-canvas disabled:opacity-50"
                >
                  {uploading ? <Spinner className="h-4 w-4" /> : <Icon name="paperclip" size={15} />} {t("img.addRefs")}
                </button>
              ) : null}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" multiple className="sr-only" tabIndex={-1} onChange={(e) => void addFiles(e.target.files)} />
            </div>
            {productPhotos.length ? (
              <div className="mt-3">
                <p className="m-0 text-[12.5px] text-app-ink-soft">{t("img.fromProducts")}</p>
                <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                  {productPhotos.map((product) => {
                    const on = refs.some((ref) => ref.url === product.photo);
                    return (
                      <button
                        key={product.photo}
                        type="button"
                        aria-pressed={on}
                        title={product.name}
                        onClick={() => (on ? setRefs((prev) => prev.filter((ref) => ref.url !== product.photo)) : addProductPhoto(product.photo))}
                        className={cx("relative h-14 w-14 shrink-0 overflow-hidden rounded-[12px] border-2", on ? "border-app-ink" : "border-transparent hover:border-app-line-strong")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={product.photo} alt={product.name} className="h-full w-full object-cover" />
                        {on ? (
                          <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-app-ink text-white">
                            <Icon name="check" size={10} />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-2 p-0 text-[14px] font-bold">{t("img.shape")}</legend>
              <div className="flex flex-wrap gap-2">
                {SIZES.map((s) => (
                  <button key={s.id} type="button" aria-pressed={size === s.id} onClick={() => setSize(s.id)} className={chip(size === s.id)}>{t(s.label)}</button>
                ))}
              </div>
            </fieldset>
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-2 p-0 text-[14px] font-bold">{t("img.look")}</legend>
              <div className="flex flex-wrap gap-2">
                {STYLES.map((s) => (
                  <button key={s.id} type="button" aria-pressed={style === s.id} onClick={() => setStyle(s.id)} className={chip(style === s.id)}>{t(s.label)}</button>
                ))}
              </div>
            </fieldset>
          </div>
          <PillButton tone="accent" size="md" className="mt-5 w-full" onClick={() => void generateImage()} disabled={loading || uploading || !prompt.trim()}>
            {loading ? <><Spinner /> {t("img.making")}</> : <><Icon name="sparkle" size={16} /> {t("img.make")}</>}
          </PillButton>
          {credits !== null && (
            <p className="mb-0 mt-2 text-center text-[13px] text-app-ink-soft">
              {pictures ? `${t("logo.freeUsed", { used: pictures.used, limit: pictures.limit })} · ` : ""}
              {t("studio.credits", { count: credits })}
            </p>
          )}
        </section>

        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[15px] font-extrabold">{ideas.length ? t("img.yourIdeas") : t("img.ideas")}</h2>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0">
            {ideaList.map((idea) => (
              <li key={idea}>
                <button type="button" onClick={() => setPrompt(idea)} className="w-full rounded-[14px] border border-app-line bg-app-canvas px-3.5 py-2.5 text-left text-[13.5px] leading-[1.45] text-app-ink transition hover:border-app-line-strong hover:bg-white">
                  {idea}
                </button>
              </li>
            ))}
          </ul>
          <Link href={`/studio?prompt=${encodeURIComponent(t("img.moreIdeasPrompt"))}`} className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-bold text-app-accent-ink hover:underline">
            <Icon name="sparkle" size={14} /> {t("img.moreIdeas")}
          </Link>
        </section>

        <AssistantNote who="rex">
          <strong>{t("logo.tipLead")}</strong> {t("img.tip")}
        </AssistantNote>
      </div>

      <div className="grid min-w-0 content-start gap-5">
        {!image && !loading && (
          <section className="flex min-h-[320px] flex-col items-center justify-center rounded-[22px] border border-dashed border-app-line-strong bg-white px-6 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-app-peach text-app-accent-ink"><Icon name="image" size={26} /></span>
            <h2 className="mb-0 mt-3 text-[16px] font-extrabold">{t("img.emptyTitle")}</h2>
            <p className="mb-0 mt-1 max-w-[320px] text-[14px] text-app-ink-soft">{t("img.emptyBody")}</p>
          </section>
        )}

        {loading && (
          <section className="flex min-h-[320px] flex-col justify-center rounded-[22px] border border-app-line bg-white px-6 py-8">
            <RexProgress job="image" className="mx-auto max-w-[420px]" />
          </section>
        )}

        {image && (
          <section className="rounded-[22px] border border-app-line bg-white p-3">
            <div
              className="relative mx-auto w-full overflow-hidden rounded-[16px] bg-app-canvas"
              style={{ aspectRatio: image.size === "1536x1024" ? "3/2" : image.size === "1024x1536" ? "2/3" : "1/1", maxHeight: "75vh" }}
            >
              <Image src={image.url} alt={t("img.alt")} fill className="object-contain" unoptimized />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex flex-wrap gap-1.5">
                {image.usedLogo ? <Pill tone="ink">{t("img.logoOn")}</Pill> : null}
                {image.style ? <Pill>{t.dynamic(`img.${image.style}`, image.style)}</Pill> : null}
                <Pill>{image.size}</Pill>
              </div>
            </div>
            <RexImageActions url={image.url} name={prompt.slice(0, 80)} className="mt-3 px-1" />
          </section>
        )}

        {note && <Notice>{note}</Notice>}
        {error && <Notice>{error}</Notice>}
        {error.includes("/home/credits") ? (
          <Link href="/home/credits" onClick={(event) => { if (openTopUp()) event.preventDefault(); }} className="inline-flex min-h-[44px] w-fit items-center gap-1.5 rounded-full bg-app-ink px-5 text-[14px] font-bold text-white no-underline">
            <Icon name="sparkle" size={15} /> {t("img.buyCredits")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Toggle({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (next: boolean) => void; label: string; hint?: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={cx(
          "relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-app-ink",
          checked ? "bg-app-ink" : "bg-app-track",
        )}
      >
        <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-bold">{label}</span>
        {hint ? <span className="block text-[12.5px] text-app-ink-soft">{hint}</span> : null}
      </span>
    </label>
  );
}
