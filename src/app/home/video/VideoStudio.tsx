"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FieldLabel, Notice, PillButton, Segmented, TextInput, Toggle } from "@/components/app-ui";
import { cx } from "@/components/app-ui/cx";
import { naira } from "@shared/onboarding";
import { MAX_PHOTOS, VIDEO_LANGUAGES, fallbackScript, type VideoLanguage, type VideoScript } from "@shared/video";
import { loadReelImage, reelSupported, renderReel, type ReelResult } from "@/lib/video/render-reel";
import { uploadFile } from "@/lib/supabase/storage";
import { REX_REEL_HANDOFF_KEY } from "@/lib/ai/rex/cards";
import { useT } from "@/components/i18n/I18nProvider";

interface StudioProduct {
  id: string;
  name: string;
  price: number;
  images: string[];
  description: string;
  hasVideo: boolean;
}

interface Photo {
  key: string;
  src: string;
}

const card = "rounded-[22px] border border-app-line bg-white p-5";

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return response;
}

export function VideoStudio({ products, storeName, storeHost, initialProductId }: { products: StudioProduct[]; storeName: string; storeHost: string; initialProductId: string | null }) {
  const t = useT("video");
  const initial = products.find((product) => product.id === initialProductId) ?? null;
  const [productId, setProductId] = useState<string | null>(initial?.id ?? null);
  const [photos, setPhotos] = useState<Photo[]>(() => (initial ? initial.images.map((src) => ({ key: src, src })) : []));
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial ? naira(initial.price) : "");
  const [language, setLanguage] = useState<VideoLanguage>("pidgin");
  const [script, setScript] = useState<VideoScript | null>(null);
  const [withVoice, setWithVoice] = useState(true);
  const [step, setStep] = useState<"idle" | "writing" | "voicing" | "rendering" | "saving">("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<(ReelResult & { url: string }) | null>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "info" | "success"; text: string } | null>(null);
  const [supported, setSupported] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const product = products.find((item) => item.id === productId) ?? null;

  useEffect(() => setSupported(reelSupported()), []);

  // A reel Rex prepared in Rex Studio arrives with its script and language (see RexCards' video card).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(REX_REEL_HANDOFF_KEY);
      if (!raw) return;
      window.sessionStorage.removeItem(REX_REEL_HANDOFF_KEY);
      const handoff = JSON.parse(raw) as { productId?: string; language?: string; script?: VideoScript };
      if (!handoff.script || handoff.productId !== initialProductId) return;
      if (VIDEO_LANGUAGES.some((option) => option.key === handoff.language)) setLanguage(handoff.language as VideoLanguage);
      setScript({ captions: handoff.script.captions ?? [], voiceover: handoff.script.voiceover ?? "", cta: handoff.script.cta ?? "" });
      setNotice({ tone: "info", text: t("rexWrote") });
    } catch {
      // Storage can be blocked; the studio works without the handoff.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProductId]);
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);

  // Keep the captions in step with the number of photos.
  const captions = useMemo(() => {
    const base = script ?? fallbackScript(name || "this", price, language, photos.length);
    return Array.from({ length: Math.max(1, photos.length) }, (_, i) => base.captions[i] ?? base.captions[i % base.captions.length] ?? "");
  }, [script, name, price, language, photos.length]);

  function chooseProduct(id: string) {
    const next = products.find((item) => item.id === id);
    if (!next) return;
    setProductId(next.id);
    setPhotos(next.images.map((src) => ({ key: src, src })));
    setName(next.name);
    setPrice(naira(next.price));
    setScript(null);
    setResult(null);
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .map((file) => ({ key: `${file.name}-${file.lastModified}`, src: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...added].slice(0, MAX_PHOTOS));
    setResult(null);
  }

  async function writeScript() {
    if (!name.trim()) return setNotice({ tone: "error", text: t("err.name") });
    setStep("writing");
    setNotice(null);
    try {
      const response = await postJson("/api/ai/video-script", { name, price, description: product?.description ?? "", language, photos: Math.max(1, photos.length) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? t("err.write"));
      setScript({ captions: body.data.captions, voiceover: body.data.voiceover, cta: body.data.cta });
      if (!body.data.drafted) setNotice({ tone: "info", text: t("offline") });
    } catch (scriptError) {
      setScript(fallbackScript(name, price, language, photos.length));
      setNotice({ tone: "info", text: scriptError instanceof Error ? `${scriptError.message} ${t("starter")}` : t("starter") });
    } finally {
      setStep("idle");
    }
  }

  async function make() {
    if (!photos.length) return setNotice({ tone: "error", text: t("err.photo") });
    const current = script ?? fallbackScript(name || storeName, price, language, photos.length);
    setNotice(null);
    setResult(null);
    try {
      let voiceover: ArrayBuffer | null = null;
      if (withVoice && current.voiceover.trim()) {
        setStep("voicing");
        const response = await postJson("/api/ai/voiceover", { text: current.voiceover, language });
        if (response.ok) voiceover = await response.arrayBuffer();
        else {
          const body = await response.json().catch(() => null);
          setNotice({ tone: "info", text: body?.error?.message ?? t("noVoice") });
        }
      }
      setStep("rendering");
      setProgress(0);
      const images = await Promise.all(photos.map((photo) => loadReelImage(photo.src)));
      const fontFamily = getComputedStyle(document.documentElement).getPropertyValue("--font-jakarta").trim();
      const reel = await renderReel({ photos: images, captions, cta: current.cta, storeName, price, storeHost, voiceover, fontFamily, onProgress: setProgress });
      setResult({ ...reel, url: URL.createObjectURL(reel.blob) });
    } catch (renderError) {
      setNotice({ tone: "error", text: renderError instanceof Error ? renderError.message : t("err.make") });
    } finally {
      setStep("idle");
    }
  }

  async function saveToProduct() {
    if (!result || !product) return;
    setStep("saving");
    setNotice(null);
    try {
      const file = new File([result.blob], `${product.id}-reel.${result.extension}`, { type: result.mimeType.split(";")[0] });
      const uploaded = await uploadFile("products", file);
      const response = await fetch(`/api/store/products/${product.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoUrl: uploaded.publicUrl }) });
      if (!response.ok) throw new Error(t("err.attach"));
      setNotice({ tone: "success", text: t("added", { name: product.name }) });
    } catch (saveError) {
      setNotice({ tone: "error", text: saveError instanceof Error ? saveError.message : t("err.save") });
    } finally {
      setStep("idle");
    }
  }

  const busy = step !== "idle";
  const current = script ?? fallbackScript(name || storeName, price, language, photos.length);

  if (!supported) {
    return <Notice tone="info">{t("unsupported")}</Notice>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid content-start gap-4">
        <section className={card}>
          <h2 className="m-0 text-[17px] font-extrabold">{t("photos")}</h2>
          {products.length > 0 && (
            <div className="mt-3">
              <FieldLabel htmlFor="video-product">{t("fromProduct")}</FieldLabel>
              <select
                id="video-product"
                value={productId ?? ""}
                onChange={(event) => chooseProduct(event.target.value)}
                className="h-[52px] w-full rounded-[16px] border border-app-line bg-white px-4 text-[15px]"
              >
                <option value="" disabled>{t("chooseProduct")}</option>
                {products.map((item) => <option key={item.id} value={item.id}>{item.name}{item.hasVideo ? ` ${t("hasVideo")}` : ""}</option>)}
              </select>
            </div>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {photos.map((photo, index) => (
              <div key={photo.key} className="relative aspect-[9/16] overflow-hidden rounded-[12px] bg-app-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.src} alt={t("photoN", { n: index + 1 })} className="h-full w-full object-cover" />
                <button type="button" aria-label={t("removePhoto", { n: index + 1 })} onClick={() => setPhotos((list) => list.filter((item) => item.key !== photo.key))} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-[14px] font-bold">×</button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" onClick={() => fileInput.current?.click()} className="grid aspect-[9/16] place-items-center rounded-[12px] border-2 border-dashed border-app-line-strong text-[13px] font-bold text-app-ink-soft">
                {t("addPhoto")}
              </button>
            )}
          </div>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
          <p className="mb-0 mt-2 text-[12.5px] text-app-ink-soft">{t("photosTip", { max: MAX_PHOTOS })}</p>
        </section>

        <section className={card}>
          <h2 className="m-0 text-[17px] font-extrabold">{t("whatPeggySays")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="video-name">{t("product")}</FieldLabel>
              <TextInput id="video-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="video-price">{t("priceOnScreen")}</FieldLabel>
              <TextInput id="video-price" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="₦29,500" />
            </div>
          </div>
          <div className="mt-3">
            <Segmented options={VIDEO_LANGUAGES.map((option) => ({ value: option.key, label: t.dynamic(`lang.${option.key}`, option.label) }))} value={language} onChange={(value) => { setLanguage(value); setScript(null); }} />
          </div>
          <PillButton type="button" tone="white" size="md" className="mt-3" busy={step === "writing"} disabled={busy} onClick={() => void writeScript()}>
            {script ? t("writeAgain") : t("writeWithPeggy")}
          </PillButton>

          <div className="mt-4 grid gap-2">
            {captions.map((caption, index) => (
              <div key={index}>
                <FieldLabel htmlFor={`caption-${index}`}>{t("captionN", { n: index + 1 })}</FieldLabel>
                <TextInput
                  id={`caption-${index}`}
                  value={caption}
                  maxLength={48}
                  onChange={(event) => {
                    const next = [...captions];
                    next[index] = event.target.value;
                    setScript({ ...current, captions: next });
                  }}
                />
              </div>
            ))}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <FieldLabel htmlFor="voiceover">{t("voiceover")}</FieldLabel>
                <span className="flex items-center gap-2 text-[13px] font-bold">
                  {withVoice ? t("on") : t("off")}
                  <Toggle on={withVoice} onChange={setWithVoice} label={t("voiceover")} />
                </span>
              </div>
              <textarea
                id="voiceover"
                rows={3}
                maxLength={320}
                disabled={!withVoice}
                value={current.voiceover}
                onChange={(event) => setScript({ ...current, voiceover: event.target.value })}
                className="w-full rounded-[16px] border border-app-line px-4 py-3 text-[15px] disabled:opacity-50"
              />
            </div>
            <div>
              <FieldLabel htmlFor="video-cta">{t("lastScreen")}</FieldLabel>
              <TextInput id="video-cta" value={current.cta} maxLength={40} onChange={(event) => setScript({ ...current, cta: event.target.value })} />
            </div>
          </div>
        </section>
      </div>

      <aside className="grid content-start gap-4 lg:sticky lg:top-4">
        <section className={cx(card, "grid gap-3")}>
          <h2 className="m-0 text-[17px] font-extrabold">{t("yourReel")}</h2>
          <div className="mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-[18px] bg-app-ink">
            {result ? (
              <video src={result.url} controls playsInline className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center p-6 text-center text-[14px] text-white/70">
                {step === "rendering" ? t("making", { pct: Math.round(progress * 100) }) : step === "voicing" ? t("recording") : t("showsHere")}
              </div>
            )}
          </div>
          <PillButton type="button" busy={step === "voicing" || step === "rendering"} disabled={busy || !photos.length} onClick={() => void make()}>
            {result ? t("makeAgain") : t("make")}
          </PillButton>
          {step === "rendering" && <p className="m-0 text-center text-[12.5px] text-app-ink-soft">{t("keepOpen", { seconds: Math.round(result?.seconds ?? 12) })}</p>}
          {result && (
            <>
              <a href={result.url} download={`${(name || "reel").replace(/[^\w-]+/g, "-").toLowerCase()}.${result.extension}`} className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-app-line bg-white text-[15px] font-extrabold text-app-ink no-underline">
                {t("download", { ext: result.extension.toUpperCase() })}
              </a>
              {product && (
                <PillButton type="button" tone="white" busy={step === "saving"} disabled={busy} onClick={() => void saveToProduct()}>
                  {t("addTo", { name: product.name })}
                </PillButton>
              )}
              {result.extension === "webm" && (
                <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">{t("webm")}</p>
              )}
            </>
          )}
        </section>
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      </aside>
    </div>
  );
}
