"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { useMediaLibrary } from "@/components/media/useMediaLibrary";
import { BuyCreditsButton, creditsChanged, isCreditsError } from "@/components/credits/CreditsBadge";
import { PackRender } from "@/components/packaging/PackRender";
import { downloadPng, downloadPrintPdf, downloadSvg, thumbnail } from "@/components/packaging/export";
import { normaliseEan13 } from "@shared/barcodes";
import { SAMPLE_PHOTOS, sampleDesign } from "@shared/packaging-samples";
import {
  BLEED_MM,
  INFO_FIELD_LABEL,
  PACK_FORMAT_INFO,
  PACK_FORMATS,
  PACK_STYLE_INFO,
  PRODUCT_TYPE_INFO,
  PRODUCT_TYPES,
  SAFE_MM,
  cleanDesign,
  clampSize,
  newDesign,
  packLayout,
  stylesFor,
  type PackContent,
  type PackDesign,
  type PackFormat,
  type PackStyle,
  type ProductType,
} from "@shared/packaging";
import { friendlyError } from "@/lib/errors/report-client";

export interface StudioProduct {
  id: string;
  name: string;
  images: string[];
  description: string | null;
  barcode: string | null;
  url: string;
  type: ProductType;
}

export interface StudioBrand {
  name: string;
  logo: string | null;
  accent: string;
  ink: string;
  paper: string;
  website: string;
  whatsapp: string | null;
}

type QrChoice = "store" | "product" | "whatsapp" | "custom" | "none";

const inputClass = "h-11 w-full rounded-[12px] border border-app-line bg-white px-3 text-[14px] outline-none focus:border-app-ink";
const areaClass = "w-full rounded-[12px] border border-app-line bg-white px-3 py-2 text-[14px] leading-[1.45] outline-none focus:border-app-ink";

/**
 * Packaging designer (/home/labels/packaging): pick a template (shown live on the seller's own product or a
 * sample), a pack and size, then the words (Peggy writes them), picture (product photo, media library, or Rex
 * makes pack art) and colours; save it, and download a print-ready PDF, a 300 dpi PNG or the SVG.
 */
export function PackagingStudio({
  brand,
  products,
  saved,
  start,
  aiReady,
}: {
  brand: StudioBrand;
  products: StudioProduct[];
  saved: { id: string; title: string; design: PackDesign } | null;
  start: { productId: string | null; style: PackStyle | null; format: PackFormat | null; type: ProductType | null; fromRex: boolean };
  aiReady: boolean;
}) {
  const t = usePackT();
  const router = useRouter();
  const media = useMediaLibrary();
  const startProduct = products.find((product) => product.id === start.productId) ?? null;
  const [mode, setMode] = useState<"gallery" | "editor">(saved || start.style || start.format ? "editor" : "gallery");
  const [galleryType, setGalleryType] = useState<ProductType>(start.type ?? startProduct?.type ?? "food");
  const [galleryFormat, setGalleryFormat] = useState<PackFormat | null>(null);
  const [galleryProduct, setGalleryProduct] = useState<string>(startProduct?.id ?? "");
  const [id, setId] = useState<string | null>(saved?.id ?? null);
  const [title, setTitle] = useState(saved?.title ?? (startProduct ? `${startProduct.name} packaging` : ""));
  const [design, setDesign] = useState<PackDesign>(() => saved?.design ?? fromProduct(startProduct, brand, start.style ?? undefined, start.format ?? undefined, start.type ?? startProduct?.type ?? "food"));
  const [view, setView] = useState<"flat" | "front">("front");
  const [guides, setGuides] = useState(true);
  const [qr, setQr] = useState<QrChoice>(saved ? (saved.design.content.qrUrl ? "custom" : "none") : "store");
  const [customQr, setCustomQr] = useState(saved?.design.content.qrUrl ?? "");
  const [brief, setBrief] = useState("");
  const [artPrompt, setArtPrompt] = useState("");
  const [busy, setBusy] = useState<null | "save" | "pdf" | "png" | "svg" | "peggy" | "art">(null);
  const [status, setStatus] = useState<{ tone: "error" | "info" | "success"; text: string; credits?: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  const product = products.find((item) => item.id === design.productId) ?? null;
  const layout = useMemo(() => packLayout(design.format, design.size), [design.format, design.size]);
  const formatInfo = PACK_FORMAT_INFO[design.format];
  const typeInfo = PRODUCT_TYPE_INFO[design.productType];
  const ean = design.content.barcode ? normaliseEan13(design.content.barcode) : null;

  function update(patch: Partial<PackDesign>) {
    setDesign((current) => cleanDesign({ ...current, ...patch }));
    setDirty(true);
  }

  function setContent(patch: Partial<PackContent>) {
    setDesign((current) => cleanDesign({ ...current, content: { ...current.content, ...patch } }));
    setDirty(true);
  }

  function qrUrlFor(choice: QrChoice, custom = customQr) {
    if (choice === "store") return brand.website;
    if (choice === "product") return product?.url ?? brand.website;
    if (choice === "whatsapp") return brand.whatsapp ? `https://wa.me/${brand.whatsapp.replace(/\D/g, "")}` : "";
    if (choice === "custom") return /^https?:\/\/\S+$/i.test(custom.trim()) ? custom.trim() : "";
    return "";
  }

  function chooseQr(choice: QrChoice) {
    setQr(choice);
    setContent({ qrUrl: qrUrlFor(choice) });
  }

  function useTemplate(style: PackStyle) {
    const chosen = products.find((item) => item.id === galleryProduct) ?? null;
    const types = PRODUCT_TYPE_INFO[chosen ? chosen.type : galleryType].formats;
    const next = fromProduct(chosen, brand, style, galleryFormat ?? types.find((value) => !["jar_label", "round_sticker", "sleeve"].includes(value)) ?? types[0], chosen ? chosen.type : galleryType);
    setDesign(next);
    setTitle(chosen ? `${chosen.name} packaging` : "");
    setId(null);
    setMode("editor");
    setDirty(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pickProduct(productId: string) {
    const chosen = products.find((item) => item.id === productId) ?? null;
    if (!chosen) {
      update({ productId: null });
      return;
    }
    const type = chosen.type;
    setDesign((current) =>
      cleanDesign({
        ...current,
        productId: chosen.id,
        productType: type,
        image: chosen.images[0] ? { url: chosen.images[0], fit: current.image?.fit ?? fitFor(current.style) } : current.image,
        content: { ...current.content, name: shortName(chosen.name), barcode: chosen.barcode && normaliseEan13(chosen.barcode) ? chosen.barcode : current.content.barcode, qrUrl: qr === "product" ? chosen.url : current.content.qrUrl },
      }),
    );
    if (!title) setTitle(`${chosen.name} packaging`);
    setDirty(true);
  }

  function changeFormat(format: PackFormat) {
    update({ format, size: PACK_FORMAT_INFO[format].sizes[1] });
  }

  function changeStyle(style: PackStyle) {
    const info = PACK_STYLE_INFO[style];
    setDesign((current) => cleanDesign({ ...current, style, colours: info.colours, image: current.image ? { ...current.image, fit: fitFor(style) } : null }));
    setDirty(true);
  }

  async function writeWithPeggy() {
    if (!design.content.name.trim()) {
      setStatus({ tone: "error", text: t("err.needName") });
      return;
    }
    setBusy("peggy");
    setStatus(null);
    try {
      const response = await fetch("/api/app/packaging/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productType: design.productType, name: product?.name ?? design.content.name, productId: design.productId, brief: brief.trim() || null, current: design.content }),
      });
      const json = (await response.json().catch(() => null)) as { data?: { content: Partial<PackContent>; ai: boolean }; error?: { code?: string; message?: string } } | null;
      if (!response.ok || !json?.data) {
        setStatus({ tone: "error", text: json?.error?.message ?? t("err.peggy"), credits: isCreditsError(json?.error?.code) });
        return;
      }
      setContent(json.data.content);
      setStatus({ tone: "success", text: json.data.ai ? t("peggy.done") : t("peggy.offline") });
    } catch {
      setStatus({ tone: "error", text: t("err.peggy") });
    } finally {
      setBusy(null);
      creditsChanged();
    }
  }

  async function makeArt() {
    setBusy("art");
    setStatus(null);
    const subject = `${design.content.name || product?.name || "the product"}${design.content.variant ? `, ${design.content.variant}` : ""}`;
    const prompt =
      artPrompt.trim() ||
      `A mouth-watering, premium studio photo of ${subject} (${typeInfo.name.toLowerCase()}), the product itself only, not its packaging, arranged ${design.productType === "food" || design.productType === "pet" ? "in a round bowl seen from above" : "as a clean hero shot"}, soft natural shadow, centred, on a plain solid background in ${design.colours.ground}. No text, no labels, no logos.`;
    try {
      const response = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, size: "1024x1024", useLogo: false, useBrand: false, referenceUrls: product?.images.slice(0, 1) ?? [] }),
      });
      const json = (await response.json().catch(() => null)) as { image?: { url: string }; error?: { code?: string; message?: string } } | null;
      if (!response.ok || !json?.image) {
        setStatus({ tone: "error", text: json?.error?.message ?? t("err.art"), credits: isCreditsError(json?.error?.code) });
        return;
      }
      update({ image: { url: json.image.url, fit: design.image?.fit && design.image.fit !== "none" ? design.image.fit : fitFor(design.style) } });
      setStatus({ tone: "success", text: t("art.done") });
    } catch {
      setStatus({ tone: "error", text: t("err.art") });
    } finally {
      setBusy(null);
      creditsChanged();
    }
  }

  async function pickPhoto() {
    const [asset] = await media.open({ title: t("photo.pick") });
    if (asset) update({ image: { url: asset.url, fit: design.image?.fit && design.image.fit !== "none" ? design.image.fit : fitFor(design.style) } });
  }

  async function save(): Promise<string | null> {
    setBusy("save");
    setStatus(null);
    try {
      const name = title.trim() || `${design.content.name || t("untitled")} packaging`;
      const response = await fetch("/api/app/print-designs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "packaging", id, title: name, design }) });
      const json = (await response.json().catch(() => null)) as { data?: { id: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? t("err.save"));
      const savedId = json.data.id;
      setId(savedId);
      setTitle(name);
      setDirty(false);
      if (thumbRef.current) {
        const blob = await thumbnail(thumbRef.current, design.colours.ground).catch(() => null);
        if (blob) {
          const form = new FormData();
          form.append("file", new File([blob], "preview.png", { type: "image/png" }));
          await fetch(`/api/app/print-designs/${savedId}/preview`, { method: "POST", body: form }).catch(() => null);
        }
      }
      router.replace(`/home/labels/packaging?design=${savedId}`, { scroll: false });
      setStatus({ tone: "success", text: t("saved") });
      return savedId;
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? friendlyError(error) : t("err.save") });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function download(kind: "pdf" | "png" | "svg") {
    if (!exportRef.current) return;
    setBusy(kind);
    setStatus(null);
    try {
      const name = title.trim() || `${design.content.brand} ${design.content.name}`.trim();
      if (kind === "pdf") await downloadPrintPdf(exportRef.current, design, name);
      else if (kind === "png") await downloadPng(exportRef.current, design, name);
      else downloadSvg(exportRef.current, name);
      setStatus({ tone: "success", text: kind === "pdf" ? t("dl.pdfDone") : t("dl.done") });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error && error.message ? error.message : t("err.download") });
    } finally {
      setBusy(null);
    }
  }

  async function orderPrints() {
    const savedId = id && !dirty ? id : await save();
    if (savedId) router.push(`/home/labels/order?design=${savedId}`);
  }

  async function requestPrint() {
    const savedId = id && !dirty ? id : await save();
    if (savedId) router.push(`/home/labels/request?design=${savedId}`);
  }

  // ─── Gallery ───────────────────────────────────────────────────────────────
  if (mode === "gallery") {
    const chosen = products.find((item) => item.id === galleryProduct) ?? null;
    const type = chosen?.type ?? galleryType;
    const formats = PRODUCT_TYPE_INFO[type].formats;
    const shown = galleryFormat ?? formats.find((value) => !["jar_label", "round_sticker", "sleeve"].includes(value)) ?? formats[0];
    return (
      <div className="grid gap-5">
        {media.dialog}
        <section className="grid gap-4 rounded-[22px] border border-app-line bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="m-0 text-[17px] font-extrabold">{t("gallery.title")}</p>
              <p className="m-0 mt-1 max-w-[640px] text-[14px] text-app-ink-soft">{t("gallery.sub")}</p>
            </div>
            <label className="grid w-full gap-1 text-[13px] font-bold sm:w-[320px]">
              {t("gallery.myProduct")}
              <select value={galleryProduct} onChange={(event) => setGalleryProduct(event.target.value)} className={inputClass}>
                <option value="">{t("gallery.sample")}</option>
                {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
          {!chosen ? (
            <Chips label={t("type.label")}>
              {PRODUCT_TYPES.map((value) => (
                <Chip key={value} on={value === galleryType} onClick={() => { setGalleryType(value); setGalleryFormat(null); }}>
                  {t.dynamic(`type.${value}`, PRODUCT_TYPE_INFO[value].name)}
                </Chip>
              ))}
            </Chips>
          ) : null}
          <Chips label={t("gallery.showOn")}>
            {formats.map((value) => (
              <Chip key={value} on={shown === value} onClick={() => setGalleryFormat(value)}>
                {t.dynamic(`format.${value}`, PACK_FORMAT_INFO[value].name)}
              </Chip>
            ))}
          </Chips>
        </section>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {stylesFor(type).map((style) => {
            const sample = chosen ? fromProduct(chosen, brand, style, shown, chosen.type) : sampleDesign(type, style, shown);
            const info = PACK_STYLE_INFO[style];
            return (
              <button key={style} type="button" onClick={() => useTemplate(style)} className="group grid gap-2 rounded-[20px] border border-app-line bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(22,20,31,0.45)]">
                <div className="grid aspect-[4/5] place-items-center overflow-hidden rounded-[14px] bg-app-canvas p-3">
                  <PackRender design={sample} view="front" className="max-h-full max-w-full drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)]" />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="m-0 text-[14.5px] font-extrabold">{info.name}</p>
                    <p className="m-0 mt-0.5 line-clamp-2 text-[12.5px] text-app-ink-soft">{t.dynamic(`style.${style}`, info.feel)}</p>
                  </div>
                  {info.best.includes(type) ? <span className="shrink-0 rounded-full bg-app-canvas px-2 py-0.5 text-[11px] font-bold">{t("gallery.goodFit")}</span> : null}
                </div>
                <span className="text-[13px] font-bold text-app-accent group-hover:underline">{t("gallery.use")}</span>
              </button>
            );
          })}
        </div>
        {!chosen ? (
          <p className="m-0 text-[12px] text-app-ink-soft">
            {t("gallery.photoCredit")}{" "}
            <a href={`${SAMPLE_PHOTOS[type].link}?utm_source=shopinbos&utm_medium=referral`} target="_blank" rel="noreferrer" className="underline">{SAMPLE_PHOTOS[type].credit}</a>{" "}
            · <a href="https://unsplash.com/?utm_source=shopinbos&utm_medium=referral" target="_blank" rel="noreferrer" className="underline">Unsplash</a>
          </p>
        ) : null}
        <CustomCta t={t} />
      </div>
    );
  }

  // ─── Editor ────────────────────────────────────────────────────────────────
  const infoFields = typeInfo.fields.filter((field) => field !== "nutrition");
  const hasNutrition = typeInfo.fields.includes("nutrition");
  const sizeLabel = design.format === "round_sticker" ? `${design.size.w} mm` : `${design.size.w} × ${design.size.h}${formatInfo.usesDepth ? ` × ${design.size.d}` : ""} mm`;

  return (
    <div className="grid gap-5">
      {media.dialog}
      <div className="flex flex-wrap items-center gap-2 rounded-[22px] border border-app-line bg-white p-3">
        <button type="button" onClick={() => setMode("gallery")} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[13.5px] font-bold hover:bg-app-canvas">
          <Icon name="grid" size={15} /> {t("templates")}
        </button>
        <input value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} placeholder={t("titlePlaceholder")} aria-label={t("titleLabel")} className="h-10 min-w-[180px] flex-1 rounded-full border border-app-line px-4 text-[14px] font-bold outline-none focus:border-app-ink" />
        <PillButton size="sm" tone="white" busy={busy === "save"} disabled={Boolean(busy)} onClick={() => void save()}>
          <Icon name="check" size={14} /> {id && !dirty ? t("savedShort") : t("save")}
        </PillButton>
        <PillButton size="sm" busy={busy === "pdf"} disabled={Boolean(busy)} onClick={() => void download("pdf")}>
          <Icon name="download" size={14} /> {t("dl.pdf")}
        </PillButton>
        <PillButton size="sm" tone="white" busy={busy === "png"} disabled={Boolean(busy)} onClick={() => void download("png")}>PNG</PillButton>
        <PillButton size="sm" tone="white" busy={busy === "svg"} disabled={Boolean(busy)} onClick={() => void download("svg")}>SVG</PillButton>
        <PillButton size="sm" tone="accent" disabled={Boolean(busy)} onClick={() => void orderPrints()}>
          <Icon name="cart" size={14} /> {t("order.cta")}
        </PillButton>
        <PillButton size="sm" tone="ghost" disabled={Boolean(busy)} onClick={() => void requestPrint()}>
          <Icon name="truck" size={14} /> {t("getPrinted")}
        </PillButton>
      </div>

      {start.fromRex && !id ? <Notice tone="info">{t("fromRex")}</Notice> : null}
      {status ? (
        <div className="grid gap-2">
          <Notice tone={status.tone}>{status.text}</Notice>
          {status.credits ? <BuyCreditsButton /> : null}
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="grid gap-4">
          <Section title={t("s.product")} icon="tag">
            <label className="grid gap-1 text-[13px] font-bold">
              {t("product.pick")}
              <select value={design.productId ?? ""} onChange={(event) => pickProduct(event.target.value)} className={inputClass}>
                <option value="">{t("product.none")}</option>
                {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[13px] font-bold">
              {t("type.label")}
              <select value={design.productType} onChange={(event) => update({ productType: event.target.value as ProductType })} className={inputClass}>
                {PRODUCT_TYPES.map((value) => <option key={value} value={value}>{t.dynamic(`type.${value}`, PRODUCT_TYPE_INFO[value].name)}</option>)}
              </select>
            </label>
          </Section>

          <Section title={t("s.pack")} icon="package">
            <div className="grid grid-cols-2 gap-2">
              {[...typeInfo.formats, ...PACK_FORMATS.filter((value) => !typeInfo.formats.includes(value))].map((value) => (
                <button key={value} type="button" onClick={() => changeFormat(value)} className={cx("rounded-[14px] border px-3 py-2 text-left text-[13px] font-bold", value === design.format ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
                  {t.dynamic(`format.${value}`, PACK_FORMAT_INFO[value].name)}
                </button>
              ))}
            </div>
            <p className="m-0 text-[12.5px] text-app-ink-soft">{t.dynamic(`formatHint.${design.format}`, formatInfo.hint)}</p>
            <label className="grid gap-1 text-[13px] font-bold">
              {t("size.label")}
              <select value={formatInfo.sizes.findIndex((size) => size.w === design.size.w && size.h === design.size.h && size.d === design.size.d)} onChange={(event) => { const size = formatInfo.sizes[Number(event.target.value)]; if (size) update({ size }); }} className={inputClass}>
                {formatInfo.sizes.map((size, index) => <option key={size.label} value={index}>{size.label}</option>)}
                <option value={-1}>{t("size.custom")}</option>
              </select>
            </label>
            <div className={cx("grid gap-2", formatInfo.usesDepth ? "grid-cols-3" : design.format === "round_sticker" ? "grid-cols-1" : "grid-cols-2")}>
              <MmInput label={design.format === "round_sticker" ? t("size.diameter") : t("size.width")} value={design.size.w} onChange={(w) => update({ size: clampSize(design.format, { ...design.size, w }) })} />
              {design.format !== "round_sticker" ? <MmInput label={t("size.height")} value={design.size.h} onChange={(h) => update({ size: clampSize(design.format, { ...design.size, h }) })} /> : null}
              {formatInfo.usesDepth ? <MmInput label={t.dynamic(`size.${formatInfo.depthLabel?.toLowerCase()}`, formatInfo.depthLabel ?? "Depth")} value={design.size.d} onChange={(d) => update({ size: clampSize(design.format, { ...design.size, d }) })} /> : null}
            </div>
          </Section>

          <Section title={t("s.style")} icon="sparkle">
            <div className="grid grid-cols-3 gap-2">
              {stylesFor(design.productType).map((style) => (
                <button key={style} type="button" onClick={() => changeStyle(style)} title={PACK_STYLE_INFO[style].name} className={cx("grid gap-1 rounded-[14px] border p-1.5 text-[11.5px] font-bold", style === design.style ? "border-app-ink ring-2 ring-app-ink/15" : "border-app-line")}>
                  <span className="grid aspect-[4/5] place-items-center overflow-hidden rounded-[10px] bg-app-canvas p-1">
                    <PackRender design={{ ...design, style, image: design.image ?? { url: SAMPLE_PHOTOS[design.productType].url, fit: fitFor(style) }, colours: PACK_STYLE_INFO[style].colours, format: design.format === "round_sticker" ? "round_sticker" : "pouch", size: PACK_FORMAT_INFO[design.format === "round_sticker" ? "round_sticker" : "pouch"].sizes[0] }} view="front" className="max-h-full max-w-full" />
                  </span>
                  <span className="truncate">{PACK_STYLE_INFO[style].name}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(["ground", "ink", "accent", "accent2"] as const).map((key) => (
                <label key={key} className="grid gap-1 text-[12px] font-bold">
                  {t(`colour.${key}`)}
                  <input type="color" value={design.colours[key]} onChange={(event) => update({ colours: { ...design.colours, [key]: event.target.value } })} className="h-10 w-full cursor-pointer rounded-[10px] border border-app-line bg-white p-1" />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <PillButton size="sm" tone="white" onClick={() => update({ colours: { ...design.colours, accent: brand.accent } })}>{t("colour.brand")}</PillButton>
              <PillButton size="sm" tone="ghost" onClick={() => update({ colours: PACK_STYLE_INFO[design.style].colours })}>{t("colour.reset")}</PillButton>
            </div>
            <label className="flex items-center gap-2 text-[13.5px] font-bold">
              <input type="checkbox" checked={design.showLogo} onChange={(event) => update({ showLogo: event.target.checked })} className="h-4 w-4" />
              {brand.logo ? t("logo.show") : t("logo.none")}
            </label>
            {!brand.logo ? <Link href="/home/brand-kit" className="text-[13px] font-bold text-app-accent">{t("logo.add")}</Link> : null}
          </Section>

          <Section title={t("s.picture")} icon="image">
            <div className="flex items-center gap-3">
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-app-line bg-app-canvas">
                {design.image ? <img src={design.image.url} alt="" className="h-full w-full object-cover" /> : <Icon name="image" size={20} />}
              </span>
              <div className="flex flex-wrap gap-2">
                {product?.images[0] && design.image?.url !== product.images[0] ? <PillButton size="sm" tone="white" onClick={() => update({ image: { url: product.images[0], fit: fitFor(design.style) } })}>{t("photo.product")}</PillButton> : null}
                <PillButton size="sm" tone="white" onClick={() => void pickPhoto()}><Icon name="upload" size={14} /> {t("photo.library")}</PillButton>
                {design.image ? <PillButton size="sm" tone="ghost" onClick={() => update({ image: null })}>{t("photo.remove")}</PillButton> : null}
              </div>
            </div>
            {design.image ? (
              <label className="grid gap-1 text-[13px] font-bold">
                {t("photo.fit")}
                <select value={design.image.fit} onChange={(event) => update({ image: { url: design.image!.url, fit: event.target.value as NonNullable<PackDesign["image"]>["fit"] } })} className={inputClass}>
                  {(["bowl", "cutout", "arch", "none"] as const).map((fit) => <option key={fit} value={fit}>{t(`fit.${fit}`)}</option>)}
                </select>
              </label>
            ) : null}
            <div className="grid gap-2 rounded-[14px] bg-app-canvas p-3">
              <p className="m-0 flex items-center gap-1.5 text-[13.5px] font-extrabold"><Icon name="sparkle" size={14} /> {t("art.title")}</p>
              <p className="m-0 text-[12.5px] text-app-ink-soft">{t("art.sub")}</p>
              <textarea value={artPrompt} onChange={(event) => setArtPrompt(event.target.value)} rows={2} placeholder={t("art.placeholder")} className={areaClass} />
              <PillButton size="sm" busy={busy === "art"} disabled={Boolean(busy) || !aiReady} onClick={() => void makeArt()} className="w-fit">{t("art.make")}</PillButton>
            </div>
          </Section>

          <Section title={t("s.words")} icon="document">
            <div className="grid gap-2 rounded-[14px] bg-app-canvas p-3">
              <p className="m-0 flex items-center gap-1.5 text-[13.5px] font-extrabold"><Icon name="sparkle" size={14} /> {t("peggy.title")}</p>
              <p className="m-0 text-[12.5px] text-app-ink-soft">{t("peggy.sub")}</p>
              <input value={brief} onChange={(event) => setBrief(event.target.value)} placeholder={t("peggy.placeholder")} className={inputClass} />
              <PillButton size="sm" busy={busy === "peggy"} disabled={Boolean(busy)} onClick={() => void writeWithPeggy()} className="w-fit">{t("peggy.write")}</PillButton>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TextField label={t("f.brand")} value={design.content.brand} onChange={(brand) => setContent({ brand })} />
              <TextField label={t("f.name")} value={design.content.name} onChange={(name) => setContent({ name })} />
              <TextField label={t("f.variant")} value={design.content.variant} onChange={(variant) => setContent({ variant })} />
              <TextField label={t("f.net")} value={design.content.netContent} onChange={(netContent) => setContent({ netContent })} />
            </div>
            <TextField label={t("f.tagline")} value={design.content.tagline} onChange={(tagline) => setContent({ tagline })} />
            <div className="grid gap-1 text-[13px] font-bold">
              {t("f.claims")}
              <div className="grid grid-cols-2 gap-2">
                {[0, 1, 2, 3].map((index) => (
                  <input
                    key={index}
                    value={design.content.claims[index] ?? ""}
                    placeholder={typeInfo.claims[index] ?? ""}
                    onChange={(event) => {
                      const claims = [...design.content.claims];
                      claims[index] = event.target.value;
                      setContent({ claims: claims.map((claim) => claim ?? "").filter((claim, i) => claim || i < index) });
                    }}
                    className={inputClass}
                  />
                ))}
              </div>
            </div>
            <AreaField label={t("f.description")} value={design.content.description} onChange={(description) => setContent({ description })} rows={2} />
            {infoFields.map((field) => (
              <AreaField key={field} label={t.dynamic(`field.${field}`, INFO_FIELD_LABEL[field])} value={design.content[field]} onChange={(value) => setContent({ [field]: value } as Partial<PackContent>)} rows={field === "ingredients" ? 3 : 2} />
            ))}
            {hasNutrition ? <NutritionEditor rows={design.content.nutrition} serving={design.content.servingSize} t={t} onChange={(nutrition, servingSize) => setContent({ nutrition, servingSize })} /> : null}
          </Section>

          <Section title={t("s.codes")} icon="code">
            <TextField label={t("f.barcode")} value={design.content.barcode} onChange={(barcode) => setContent({ barcode })} placeholder="6151234567890" />
            <p className={cx("m-0 text-[12.5px]", design.content.barcode && !ean ? "text-[#8A5A00]" : "text-app-ink-soft")}>
              {design.content.barcode ? (ean ? t("barcode.ean") : t("barcode.code128")) : t("barcode.none")}
            </p>
            <label className="grid gap-1 text-[13px] font-bold">
              {t("qr.label")}
              <select value={qr} onChange={(event) => chooseQr(event.target.value as QrChoice)} className={inputClass}>
                <option value="store">{t("qr.store")}</option>
                <option value="product" disabled={!product}>{t("qr.product")}</option>
                <option value="whatsapp" disabled={!brand.whatsapp}>{t("qr.whatsapp")}</option>
                <option value="custom">{t("qr.custom")}</option>
                <option value="none">{t("qr.none")}</option>
              </select>
            </label>
            {qr === "custom" ? <TextField label={t("qr.link")} value={customQr} placeholder="https://" onChange={(value) => { setCustomQr(value); setContent({ qrUrl: qrUrlFor("custom", value) }); }} /> : null}
            <div className="grid grid-cols-2 gap-2">
              <TextField label={typeInfo.regLabel || t("f.reg")} value={design.content.regNumber} onChange={(regNumber) => setContent({ regNumber })} />
              <TextField label={t("f.madeIn")} value={design.content.madeIn} onChange={(madeIn) => setContent({ madeIn })} />
              <TextField label={t("f.batch")} value={design.content.batch} onChange={(batch) => setContent({ batch })} placeholder={t("f.blankStamp")} />
              <TextField label={t("f.expiry")} value={design.content.expiry} onChange={(expiry) => setContent({ expiry })} placeholder={t("f.blankStamp")} />
              <TextField label={t("f.website")} value={design.content.website} onChange={(website) => setContent({ website })} />
              <TextField label={t("f.phone")} value={design.content.phone} onChange={(phone) => setContent({ phone })} />
            </div>
            <AreaField label={t("f.manufacturer")} value={design.content.manufacturer} onChange={(manufacturer) => setContent({ manufacturer })} rows={2} />
          </Section>

          <Section title={t("s.finish")} icon="layers">
            <div className="flex flex-wrap gap-2">
              {(["matte", "gloss", "kraft", "foil"] as const).map((finish) => (
                <Chip key={finish} on={design.finish === finish} onClick={() => update({ finish })}>{t(`finish.${finish}`)}</Chip>
              ))}
            </div>
            <p className="m-0 text-[12.5px] text-app-ink-soft">{t("finish.note")}</p>
          </Section>
        </div>

        <div className="grid gap-3 lg:sticky lg:top-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-full bg-white p-1 shadow-[inset_0_0_0_1px_var(--color-app-line,#e5e2da)]">
              {(["front", "flat"] as const).map((value) => (
                <button key={value} type="button" onClick={() => setView(value)} className={cx("min-h-[36px] rounded-full px-4 text-[13px] font-bold", view === value ? "bg-app-ink text-white" : "text-app-ink")}>
                  {value === "front" ? t("view.front") : t("view.flat")}
                </button>
              ))}
            </div>
            {view === "flat" ? (
              <label className="flex items-center gap-2 text-[13px] font-bold">
                <input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} className="h-4 w-4" /> {t("view.guides")}
              </label>
            ) : null}
          </div>
          <div className="grid min-h-[420px] place-items-center rounded-[22px] border border-app-line bg-[repeating-conic-gradient(#f3f1ec_0%_25%,#fbfaf7_0%_50%)] bg-[length:22px_22px] p-4 sm:p-8">
            <PackRender design={design} view={view} guides={guides && view === "flat"} className={cx("h-auto max-h-[72vh] w-full max-w-full drop-shadow-[0_18px_30px_rgba(0,0,0,0.25)]", view === "front" && "max-w-[460px]")} />
          </div>
          <div className="grid gap-2 rounded-[18px] border border-app-line bg-white p-4 text-[13px]">
            <p className="m-0 flex items-center gap-1.5 font-extrabold"><Icon name="check" size={14} /> {t("ready.title")}</p>
            <ul className="m-0 grid gap-1 pl-5 text-app-ink-soft">
              <li>{t("ready.size", { size: sizeLabel, flat: `${round1(layout.width)} × ${round1(layout.height)} mm` })}</li>
              <li>{t("ready.bleed", { bleed: BLEED_MM, safe: SAFE_MM })}</li>
              <li>{t("ready.dieline")}</li>
              <li>{t("ready.colour")}</li>
            </ul>
            {view === "flat" && guides ? (
              <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-app-ink-soft">
                <Legend colour="#E5007E">{t("legend.cut")}</Legend>
                <Legend colour="#00A0E3" dashed>{t("legend.fold")}</Legend>
                <Legend colour="#2E7E78" dashed>{t("legend.safe")}</Legend>
                <Legend colour="#E86A4F" dashed>{t("legend.bleed")}</Legend>
                <Legend colour="#E86A4F" fill>{t("legend.seal")}</Legend>
              </p>
            ) : null}
          </div>
          <CustomCta t={t} />
        </div>
      </div>

      {/* Full-size, guide-free renders for export and the gallery thumbnail. */}
      <div aria-hidden className="pointer-events-none fixed left-[-200000px] top-0">
        <div ref={exportRef} className="inline-block">
          <PackRender design={design} view="flat" pixelSize />
        </div>
        <div ref={thumbRef} className="inline-block">
          <PackRender design={design} view="front" pixelSize />
        </div>
      </div>
    </div>
  );
}

function fitFor(style: PackStyle): "bowl" | "cutout" | "arch" {
  const photo = PACK_STYLE_INFO[style].photo;
  return photo === "none" ? "cutout" : photo;
}

function shortName(name: string) {
  return name.replace(/\s*[-–(].*$/, "").split(/\s+/).slice(0, 4).join(" ");
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function fromProduct(product: StudioProduct | null, brand: StudioBrand, style: PackStyle | undefined, format: PackFormat | undefined, type: ProductType): PackDesign {
  const design = newDesign({
    productType: type,
    style,
    format,
    brand: brand.name,
    name: product ? shortName(product.name) : "",
    productId: product?.id ?? null,
    image: product?.images[0] ?? null,
    logoUrl: brand.logo,
    website: brand.website.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    barcode: product?.barcode && normaliseEan13(product.barcode) ? product.barcode : "",
    qrUrl: brand.website,
  });
  if (product?.description) design.content.description = product.description.replace(/\s+/g, " ").slice(0, 220);
  return design;
}

function usePackT() {
  return useT("packaging", "common");
}
type T = ReturnType<typeof usePackT>;

function Section({ title, icon, children }: { title: string; icon: Parameters<typeof Icon>[0]["name"]; children: ReactNode }) {
  return (
    <section className="grid gap-3 rounded-[20px] border border-app-line bg-white p-4">
      <p className="m-0 flex items-center gap-2 text-[15px] font-extrabold"><Icon name={icon} size={16} /> {title}</p>
      {children}
    </section>
  );
}

function Chips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <p className="m-0 text-[12.5px] font-bold text-app-ink-soft">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cx("min-h-[36px] rounded-full border px-3.5 text-[13px] font-bold", on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white")}>
      {children}
    </button>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1 text-[13px] font-bold">
      {label}
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </label>
  );
}

function AreaField({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <label className="grid gap-1 text-[13px] font-bold">
      {label}
      <textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} className={areaClass} />
    </label>
  );
}

function MmInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return (
    <label className="grid gap-1 text-[12.5px] font-bold">
      {label}
      <div className="flex items-center rounded-[12px] border border-app-line bg-white pr-2 focus-within:border-app-ink">
        <input
          inputMode="decimal"
          value={focused ? draft : String(value)}
          onFocus={() => { setDraft(String(value)); setFocused(true); }}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => { setFocused(false); const n = Number(draft); if (Number.isFinite(n) && n > 0) onChange(n); }}
          className="h-10 w-full rounded-[12px] px-3 text-[14px] outline-none"
        />
        <span className="text-[12px] text-app-ink-soft">mm</span>
      </div>
    </label>
  );
}

function NutritionEditor({ rows, serving, onChange, t }: { rows: PackContent["nutrition"]; serving: string; onChange: (rows: PackContent["nutrition"], serving: string) => void; t: T }) {
  const list = rows.length ? rows : [];
  return (
    <div className="grid gap-2">
      <div className="flex items-end justify-between gap-2">
        <p className="m-0 text-[13px] font-bold">{t("nutrition.title")}</p>
        <input value={serving} onChange={(event) => onChange(list, event.target.value)} placeholder={t("nutrition.per")} className="h-9 w-[130px] rounded-[10px] border border-app-line px-2 text-[13px]" />
      </div>
      {list.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_110px_36px] gap-2">
          <input value={row.label} onChange={(event) => onChange(list.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)), serving)} className="h-9 rounded-[10px] border border-app-line px-2 text-[13px]" />
          <input value={row.value} onChange={(event) => onChange(list.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)), serving)} className="h-9 rounded-[10px] border border-app-line px-2 text-[13px]" />
          <button type="button" aria-label={t("nutrition.remove")} onClick={() => onChange(list.filter((_, i) => i !== index), serving)} className="grid h-9 place-items-center rounded-[10px] border border-app-line">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <PillButton size="sm" tone="white" disabled={list.length >= 10} onClick={() => onChange([...list, { label: "", value: "" }], serving)}>{t("nutrition.add")}</PillButton>
        {!list.length ? <PillButton size="sm" tone="ghost" onClick={() => onChange(["Energy", "Fat", "Carbohydrate", "Sugars", "Protein", "Salt"].map((label) => ({ label, value: "" })), serving || "100 g")}>{t("nutrition.standard")}</PillButton> : null}
      </div>
    </div>
  );
}

function Legend({ colour, dashed, fill, children }: { colour: string; dashed?: boolean; fill?: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-5 rounded-[2px]" style={fill ? { background: colour, opacity: 0.3 } : { borderTop: `2px ${dashed ? "dashed" : "solid"} ${colour}` }} />
      {children}
    </span>
  );
}

function CustomCta({ t }: { t: T }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-app-ink p-5 text-white">
      <div className="min-w-0">
        <p className="m-0 text-[15.5px] font-extrabold">{t("custom.title")}</p>
        <p className="m-0 mt-1 max-w-[520px] text-[13.5px] text-white/75">{t("custom.sub")}</p>
      </div>
      <Link href="/home/labels/request" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white px-5 text-[14px] font-bold text-app-ink no-underline">
        {t("custom.cta")} <Icon name="arrow" size={14} />
      </Link>
    </div>
  );
}


