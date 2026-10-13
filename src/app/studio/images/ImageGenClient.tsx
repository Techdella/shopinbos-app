"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { FieldLabel, Notice, PillButton, Spinner, cx } from "@/components/app-ui";
import { AssistantNote, Pill } from "@/components/app-kit";
import Image from "next/image";
import { useT } from "@/components/i18n/I18nProvider";

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

// storeName is kept in the props for the page; the prompt carries the brand details.
export function ImageGenClient({ storeName: _storeName }: { storeName: string }) {
  const t = useT("rex");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<"1024x1024" | "1792x1024" | "1024x1792">("1024x1024");
  const [style, setStyle] = useState<"vivid" | "natural">("vivid");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<{ url: string; style: string; size: string } | null>(null);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState<number | null>(null);

  const generateImage = async (customPrompt?: string) => {
    const p = customPrompt || prompt;
    if (!p.trim()) return;
    setLoading(true);
    setError("");
    setImage(null);
    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p.trim(), size, style }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? t("img.failed"));
        return;
      }
      setImage(data.image);
      setCredits(data.creditsRemaining ?? null);
    } catch {
      setError(t("studio.offline"));
    } finally {
      setLoading(false);
    }
  };

  const chip = (on: boolean) =>
    cx(
      "inline-flex min-h-[40px] items-center rounded-full border px-4 text-[13.5px] font-bold transition",
      on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
    );

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="grid min-w-0 content-start gap-5">
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
          <PillButton tone="accent" size="md" className="mt-5 w-full" onClick={() => generateImage()} disabled={loading || !prompt.trim()}>
            {loading ? <><Spinner /> {t("img.making")}</> : <><Icon name="sparkle" size={16} /> {t("img.make")}</>}
          </PillButton>
          {credits !== null && <p className="mb-0 mt-2 text-center text-[13px] text-app-ink-soft">{t("studio.credits", { count: credits })}</p>}
        </section>

        <section className="rounded-[22px] border border-app-line bg-white p-5">
          <h2 className="m-0 text-[15px] font-extrabold">{t("img.ideas")}</h2>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0">
            {QUICK_PROMPTS.map((key, i) => { const qp = t(key); return (
              <li key={i}>
                <button type="button" onClick={() => { setPrompt(qp); }} className="w-full rounded-[14px] border border-app-line bg-app-canvas px-3.5 py-2.5 text-left text-[13.5px] leading-[1.45] text-app-ink transition hover:border-app-line-strong hover:bg-white">
                  {qp}
                </button>
              </li>
            ); })}
          </ul>
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
          <section role="status" className="flex min-h-[320px] flex-col items-center justify-center rounded-[22px] border border-app-line bg-white px-6 py-10 text-center">
            <span aria-hidden className="inline-block h-10 w-10 animate-spin rounded-full border-[3px] border-app-ink border-r-transparent" />
            <h2 className="mb-0 mt-4 text-[16px] font-extrabold">{t("img.loadingTitle")}</h2>
            <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">{t("img.loadingBody")}</p>
          </section>
        )}

        {image && (
          <section className="rounded-[22px] border border-app-line bg-white p-3">
            <div
              className="relative mx-auto w-full overflow-hidden rounded-[16px] bg-app-canvas"
              style={{ aspectRatio: image.size === "1792x1024" ? "16/9" : image.size === "1024x1792" ? "9/16" : "1/1", maxHeight: "75vh" }}
            >
              <Image src={image.url} alt={t("img.alt")} fill className="object-contain" unoptimized />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex gap-1.5">
                <Pill tone="ink">{image.style}</Pill>
                <Pill>{image.size}</Pill>
              </div>
              <PillButton tone="white" size="sm" onClick={() => {
                const a = document.createElement("a");
                a.href = image.url;
                a.download = `shopinbos-${Date.now()}.jpg`;
                a.click();
              }}>
                <Icon name="download" size={14} /> {t("img.download")}
              </PillButton>
            </div>
          </section>
        )}

        {error && <Notice>{error}</Notice>}
      </div>
    </div>
  );
}
