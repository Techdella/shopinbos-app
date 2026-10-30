"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { useT } from "@/components/i18n/I18nProvider";
import { BuyCreditsButton, creditsChanged, isCreditsError } from "@/components/credits/CreditsBadge";
import { rexPost, RexRequestError, useRexResume } from "@/lib/ai/rex-jobs-client";
import { isPackConcept } from "@shared/pack-concepts";
import { PRODUCT_TYPE_INFO, type ProductType } from "@shared/packaging";
import {
  MAX_PACK_VARIANTS,
  PACK_CONCEPTS,
  PACK_CONCEPT_INFO,
  PACK_CONCEPT_PHOTO,
  PACK_SCENES,
  PACK_SCENE_INFO,
  PACK_SHAPES,
  PACK_SHAPE_INFO,
  defaultPackShape,
  type PackConcept,
  type PackScene,
  type PackShape,
} from "@shared/pack-concepts";
import type { StudioBrand, StudioProduct } from "./PackagingStudio";

const inputClass = "h-11 w-full rounded-[12px] border border-white/15 bg-white/10 px-3 text-[14px] text-white outline-none placeholder:text-white/45 focus:border-white/60";

interface Render {
  url: string;
  concept: PackConcept;
  shape: "portrait" | "landscape" | "square";
}

/**
 * "Premium AI packaging" on the packaging designer: pick a concept (mascot face, mood range, ingredient
 * fusion…), the pack and how it's shot, and Rex renders a photo-real mockup of the finished pack or range with
 * the seller's product photo and logo. Renders land in the media library; the templates below make the print file.
 */
export function PackConceptStudio({ brand, product, type, aiReady }: { brand: StudioBrand; product: StudioProduct | null; type: ProductType; aiReady: boolean }) {
  const t = useT("packaging", "common");
  const [concept, setConcept] = useState<PackConcept>("mascot");
  const [shape, setShape] = useState<PackShape>(defaultPackShape("mascot"));
  const [scene, setScene] = useState<PackScene>("studio");
  const [name, setName] = useState(product ? shortName(product.name) : "");
  const [nameFor, setNameFor] = useState(product?.id ?? null);
  const [tagline, setTagline] = useState("");
  const [variants, setVariants] = useState("");
  const [brief, setBrief] = useState("");
  const [useLogo, setUseLogo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "error" | "info" | "success"; text: string; credits?: boolean } | null>(null);
  const [renders, setRenders] = useState<Render[]>([]);
  const tJobs = useT("rexJobs");
  // A pack Rex finished while the seller was away: back on the shelf, already paid for.
  useRexResume(["packaging"], (job) => {
    const url = job.result?.url;
    const made = job.result?.shape as Render["shape"] | undefined;
    const input = (job.result ?? {}) as { concept?: unknown };
    if (typeof url !== "string" || !made) return;
    setRenders((current) => (current.some((item) => item.url === url) ? current : [{ url, concept: isPackConcept(input.concept) ? input.concept : concept, shape: made }, ...current].slice(0, 8)));
    setStatus({ tone: "success", text: tJobs("resume.packaging") });
  });

  // Follow the product picked above until the seller types their own name.
  if ((product?.id ?? null) !== nameFor) {
    setNameFor(product?.id ?? null);
    if (product) setName(shortName(product.name));
  }

  function pickConcept(next: PackConcept) {
    setConcept(next);
    if (!PACK_CONCEPT_INFO[next].shapes.includes(shape)) setShape(defaultPackShape(next));
    if (next === "mood_range") setScene("grid");
    else if (next === "ingredient_fusion") setScene("colour_split");
    else if (scene === "grid" || scene === "colour_split") setScene("studio");
  }

  async function render() {
    if (!name.trim()) {
      setStatus({ tone: "error", text: t("pc.needName") });
      return;
    }
    setBusy(true);
    setStatus({ tone: "info", text: t("pc.making") });
    try {
      const data = await rexPost<{ url: string; shape: Render["shape"] }>(
        "/api/app/packaging/concept",
        {
          concept,
          shape,
          scene,
          name: name.trim(),
          productId: product?.id ?? null,
          productKind: PRODUCT_TYPE_INFO[type].name,
          variants: variants.split(/[,\n]/).map((value) => value.trim()).filter(Boolean).slice(0, MAX_PACK_VARIANTS),
          tagline: tagline.trim() || null,
          brief: brief.trim() || null,
          useLogo,
        },
        { slot: "pack-concept", envelope: true },
      );
      setRenders((current) => [{ url: data.url, concept, shape: data.shape }, ...current].slice(0, 8));
      setStatus({ tone: "success", text: t("pc.done") });
    } catch (cause) {
      if (cause instanceof RexRequestError) setStatus({ tone: cause.code === "REX_PENDING" ? "info" : "error", text: cause.code === "REX_PENDING" ? tJobs("resume.stillWorking") : cause.message || t("pc.err"), credits: isCreditsError(cause.code) });
      else setStatus({ tone: "error", text: t("pc.err") });
    } finally {
      setBusy(false);
      creditsChanged();
    }
  }

  const info = PACK_CONCEPT_INFO[concept];

  return (
    <section className="relative grid gap-5 overflow-hidden rounded-[22px] bg-navy p-5 text-cream sm:p-6">
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative grid gap-1">
        <p className="m-0 font-mono text-[11px] uppercase tracking-[0.16em] text-mint">{t("pc.eyebrow")}</p>
        <p className="m-0 font-display text-[24px] font-medium tracking-[-0.02em]">{t("pc.title")}</p>
        <p className="m-0 max-w-[720px] text-[14px] text-cream/75">{t("pc.sub")}</p>
      </div>

      <div className="relative grid gap-2">
        <p className="m-0 text-[12.5px] font-bold text-cream/70">{t("pc.concept")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="radiogroup" aria-label={t("pc.concept")}>
          {PACK_CONCEPTS.map((id) => {
            const photo = PACK_CONCEPT_PHOTO[id];
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={concept === id}
                onClick={() => pickConcept(id)}
                title={PACK_CONCEPT_INFO[id].hint}
                className={cx("grid gap-1.5 rounded-[14px] border p-1.5 text-left text-[12.5px] font-bold leading-tight", concept === id ? "border-mint bg-white/10 ring-2 ring-mint/40" : "border-white/15 hover:border-white/40")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" title={`Photo: ${photo.credit} / Unsplash`} loading="lazy" className="block aspect-[4/3] w-full rounded-[10px] bg-white/10 object-cover" />
                <span className="px-0.5">{t.dynamic(`pc.c.${id}`, PACK_CONCEPT_INFO[id].name)}</span>
              </button>
            );
          })}
        </div>
        <p className="m-0 text-[13px] text-cream/75">{t.dynamic(`pc.h.${concept}`, info.hint)}</p>
      </div>

      <div className="relative grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-3">
          <DarkChips label={t("pc.shape")}>
            {PACK_SHAPES.map((value) => (
              <DarkChip key={value} on={shape === value} soft={!info.shapes.includes(value)} onClick={() => setShape(value)}>
                {t.dynamic(`pc.s.${value}`, PACK_SHAPE_INFO[value].name)}
              </DarkChip>
            ))}
          </DarkChips>
          <DarkChips label={t("pc.scene")}>
            {PACK_SCENES.map((value) => (
              <DarkChip key={value} on={scene === value} onClick={() => setScene(value)}>
                {t.dynamic(`pc.sc.${value}`, PACK_SCENE_INFO[value].name)}
              </DarkChip>
            ))}
          </DarkChips>
          <label className="flex items-center gap-2 text-[13px] font-bold">
            <input type="checkbox" checked={useLogo} onChange={(event) => setUseLogo(event.target.checked)} className="h-4 w-4" disabled={!brand.logo} />
            {t("pc.logo")}
          </label>
          {!brand.logo ? <Link href="/home/brand-kit" className="text-[12.5px] font-bold text-mint">{t("pc.noLogo")}</Link> : null}
        </div>
        <div className="grid content-start gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <DarkField label={t("pc.name")}>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t("pc.namePlaceholder")} maxLength={80} className={inputClass} />
            </DarkField>
            <DarkField label={t("pc.tagline")}>
              <input value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder={t("pc.taglinePlaceholder")} maxLength={60} className={inputClass} />
            </DarkField>
          </div>
          <DarkField label={t("pc.variants")}>
            <input value={variants} onChange={(event) => setVariants(event.target.value)} placeholder={t("pc.variantsPlaceholder")} maxLength={180} className={inputClass} />
          </DarkField>
          <DarkField label={t("pc.brief")}>
            <input value={brief} onChange={(event) => setBrief(event.target.value)} placeholder={t("pc.briefPlaceholder")} maxLength={400} className={inputClass} />
          </DarkField>
          <PillButton tone="accent" busy={busy} disabled={busy || !aiReady} onClick={() => void render()} className="w-fit">
            <Icon name="sparkle" size={15} /> {t("pc.make")}
          </PillButton>
          {!aiReady ? <p className="m-0 text-[12.5px] text-cream/70">{t("pc.noAi")}</p> : null}
        </div>
      </div>

      {status ? (
        <div className="relative">
          <Notice tone={status.tone}>
            {status.text} {status.credits ? <BuyCreditsButton /> : null}
          </Notice>
        </div>
      ) : null}

      {renders.length ? (
        <div className="relative grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {renders.map((item) => (
            <figure key={item.url} className="m-0 grid gap-2 rounded-[18px] bg-white p-2 text-app-ink">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt={PACK_CONCEPT_INFO[item.concept].name} className={cx("block w-full rounded-[12px] bg-app-canvas object-cover", item.shape === "landscape" ? "aspect-[3/2]" : item.shape === "square" ? "aspect-square" : "aspect-[2/3]")} />
              <figcaption className="flex flex-wrap items-center gap-2 px-1 pb-1">
                <span className="mr-auto text-[13px] font-extrabold">{t.dynamic(`pc.c.${item.concept}`, PACK_CONCEPT_INFO[item.concept].name)}</span>
                <a href={item.url} download className="inline-flex items-center gap-1 rounded-full border border-app-line px-3 py-1.5 text-[12.5px] font-bold">
                  <Icon name="download" size={13} /> {t("pc.download")}
                </a>
                <a href={item.url} target="_blank" rel="noreferrer" className="rounded-full px-2 py-1.5 text-[12.5px] font-bold text-app-accent">{t("pc.open")}</a>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      <p className="relative m-0 text-[12px] text-cream/60">{t("pc.note")}</p>
    </section>
  );
}

function shortName(name: string) {
  return name.replace(/\s*[-–(].*$/, "").split(/\s+/).slice(0, 4).join(" ");
}

function DarkChips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <p className="m-0 text-[12.5px] font-bold text-cream/70">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function DarkChip({ on, soft, onClick, children }: { on: boolean; soft?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={cx("min-h-[34px] rounded-full border px-3 text-[12.5px] font-bold", on ? "border-mint bg-mint text-navy" : soft ? "border-white/10 text-cream/55" : "border-white/25 text-cream")}>
      {children}
    </button>
  );
}

function DarkField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-[13px] font-bold">
      {label}
      {children}
    </label>
  );
}
