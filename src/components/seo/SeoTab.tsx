"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Toggle, cx } from "@/components/app-ui";
import { SEO_LIMITS, lengthMeter, seoChecks, seoScore, type MeterState, type SeoFields } from "@/lib/seo/fields";
import { useT } from "@/components/i18n/I18nProvider";

type SeoT = ReturnType<typeof useT<["seo"]>>;

// The checklist labels come from lib/seo/fields in English; this puts them in the reader's language.
const CHECK_KEYS: Record<string, string> = {
  "Search title is too long; Google cuts it off after about 60 characters": "chk.titleLong",
  "Search title is a good length": "chk.titleGood",
  "Search title is short; aim for 30 to 60 characters": "chk.titleShort",
  "Add a search description": "chk.descEmpty",
  "Search description is short; aim for 70 to 160 characters": "chk.descShort",
  "Search description is too long; keep it under 160 characters": "chk.descLong",
  "Search description is a good length": "chk.descGood",
  "Web address is short and readable": "chk.slugGood",
  "Shorten the web address": "chk.slugLong",
  "Add a web address": "chk.slugEmpty",
  "Add a main search phrase to get tips for it": "chk.kwAdd",
  "Every image has a description (alt text)": "chk.altAll",
  "Has a share image for WhatsApp, Facebook and X": "chk.socialYes",
  "Add a share image so links look good on WhatsApp and Facebook": "chk.socialNo",
  "Hidden from search engines (turn off to let Google list it)": "chk.noindex",
};

function checkLabel(t: SeoT, label: string): string {
  if (t.locale === "en") return label;
  const key = CHECK_KEYS[label];
  if (key) return t.dynamic(key, label);
  const keyword = /^"(.+)" (is|is not) in the (search title|search description|web address|first paragraph)$/.exec(label);
  if (keyword) return t(keyword[2] === "is" ? "chk.kwIn" : "chk.kwOut", { kw: keyword[1]!, where: t.dynamic(`chk.where.${keyword[3]}`, keyword[3]) });
  const words = /^(\d+) words of content$/.exec(label) ?? /^Only (\d+) words;/.exec(label);
  if (words) return t(label.startsWith("Only") ? "chk.wordsFew" : "chk.words", { count: Number(words[1]) });
  const alt = /^(\d+) images? without a description/.exec(label);
  if (alt) return t("chk.altMissing", { count: Number(alt[1]) });
  return label;
}

// The SEO tab used wherever content is edited (CMS items, store pages, products, collections, the builder's
// page settings): search title and description with length meters, web address, main search phrase, share
// card, canonical and noindex, a Google result preview, a share preview, and a short checklist.

export interface SeoTabProps {
  value: SeoFields;
  onChange: (next: SeoFields) => void;
  /** Title of the thing being edited (used when no search title is set). */
  title: string;
  /** Fallback description (excerpt, product summary). */
  fallbackDescription?: string;
  /** Web address segment; pass onSlugChange to make it editable here. */
  slug?: string;
  onSlugChange?: (slug: string) => void;
  /** What comes before the slug in the preview, e.g. "adas.shopinbos.shop/blog/". */
  urlPrefix: string;
  siteName: string;
  /** Fallback share image (featured image, first product photo). */
  fallbackImage?: string | null;
  content?: { firstParagraph?: string; bodyText?: string; images?: { total: number; missingAlt: number } };
  /** Narrow layout for side panels (the builder inspector). */
  compact?: boolean;
  /** Let the seller upload a share image (POSTs to /api/app/cms/upload). */
  allowUpload?: boolean;
}

const METER_TONE: Record<MeterState, { bar: string; text: string }> = {
  empty: { bar: "bg-app-line", text: "text-app-ink-soft" },
  short: { bar: "bg-[#F2A93B]", text: "text-[#8A5A00]" },
  good: { bar: "bg-app-success", text: "text-app-success" },
  long: { bar: "bg-app-danger", text: "text-app-danger" },
};

const input = "min-h-[44px] w-full rounded-[14px] border border-app-line bg-white px-3.5 text-[14.5px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
const area = "w-full resize-y rounded-[14px] border border-app-line bg-white px-3.5 py-2.5 text-[14.5px] leading-6 text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";

function Meter({ length, kind }: { length: number; kind: "title" | "description" }) {
  const t = useT("seo");
  const meter = lengthMeter(length, kind);
  const tone = METER_TONE[meter.state];
  const limit = SEO_LIMITS[kind];
  return (
    <div className="mt-1.5 flex items-center gap-2" aria-live="polite">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-app-canvas" aria-hidden>
        <div className={cx("h-full rounded-full transition-all", tone.bar)} style={{ width: `${meter.pct}%` }} />
      </div>
      <span className={cx("shrink-0 text-[12px] font-bold", tone.text)}>
        {length}/{limit.max} · {t(`meter.${meter.state}`)}
      </span>
    </div>
  );
}

function Label({ htmlFor, children, hint }: { htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13.5px] font-bold text-app-ink">
      {children}
      {hint && <span className="mt-0.5 block text-[12.5px] font-normal text-app-ink-soft">{hint}</span>}
    </label>
  );
}

export function SeoTab(props: SeoTabProps) {
  const { value, onChange } = props;
  const t = useT("seo");
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const set = <K extends keyof SeoFields>(key: K, next: SeoFields[K]) => onChange({ ...value, [key]: next });

  const searchTitle = value.metaTitle || props.title || props.siteName;
  const searchDescription = value.metaDescription || props.fallbackDescription || "";
  const shareTitle = value.socialTitle || searchTitle;
  const shareDescription = value.socialDescription || searchDescription;
  const shareImage = value.socialImage || props.fallbackImage || "";
  const url = `${props.urlPrefix}${props.slug ?? ""}`.replace(/^https?:\/\//, "");

  const checks = useMemo(
    () => seoChecks({ seo: value, title: props.title, slug: props.slug ?? "", firstParagraph: props.content?.firstParagraph, bodyText: props.content?.bodyText, images: props.content?.images }),
    [value, props.title, props.slug, props.content?.firstParagraph, props.content?.bodyText, props.content?.images],
  );
  const score = seoScore(checks);

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/app/cms/upload", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as { data?: { url: string }; error?: { message?: string } } | null;
      if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? t("uploadFailed"));
      set("socialImage", json.data.url);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("uploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const previews = (
    <div className="grid content-start gap-4">
      <section aria-label={t("googlePreview")} className="rounded-[18px] border border-app-line bg-white p-4">
        <p className="m-0 mb-2 text-[12.5px] font-bold text-app-ink-soft">{t("onGoogle")}</p>
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-app-canvas text-[12px] font-extrabold">{props.siteName.charAt(0).toUpperCase() || "S"}</span>
          <div className="min-w-0">
            <p className="m-0 truncate text-[13px] text-[#202124]">{props.siteName}</p>
            <p className="m-0 truncate text-[12px] text-[#4D5156]">{url}</p>
          </div>
        </div>
        <p className="m-0 mt-1.5 line-clamp-2 text-[18px] leading-snug text-[#1A0DAB]">{searchTitle.length > 62 ? `${searchTitle.slice(0, 60)}…` : searchTitle}</p>
        <p className="m-0 mt-1 line-clamp-2 text-[13.5px] leading-snug text-[#4D5156]">{searchDescription || t("googlePicks")}</p>
        {value.noIndex && <p className="m-0 mt-2 text-[12.5px] font-bold text-app-danger">{t("hidden")}</p>}
      </section>

      <section aria-label={t("sharePreview")} className="overflow-hidden rounded-[18px] border border-app-line bg-white">
        <p className="m-0 px-4 pt-3 text-[12.5px] font-bold text-app-ink-soft">{t("sharedOn")}</p>
        <div className="m-3 overflow-hidden rounded-[12px] border border-app-line bg-app-canvas">
          {shareImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shareImage} alt="" className="aspect-[1.91/1] w-full object-cover" />
          ) : (
            <div className="grid aspect-[1.91/1] place-items-center text-[13px] text-app-ink-soft">{t("noShareImage")}</div>
          )}
          <div className="bg-white px-3 py-2.5">
            <p className="m-0 truncate text-[11.5px] uppercase text-app-ink-soft">{url.split("/")[0]}</p>
            <p className="m-0 truncate text-[14px] font-bold">{shareTitle}</p>
            <p className="m-0 line-clamp-2 text-[12.5px] text-app-ink-soft">{shareDescription}</p>
          </div>
        </div>
      </section>

      <section aria-label={t("checklistLabel")} className="rounded-[18px] border border-app-line bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="m-0 text-[14px] font-extrabold">{t("checklist")}</p>
          <span className={cx("rounded-full px-2.5 py-1 text-[12px] font-bold", score >= 75 ? "bg-app-success-tint text-app-success" : score >= 45 ? "bg-[#FDF0D5] text-[#8A5A00]" : "bg-app-danger-tint text-app-danger")}>
            {score}/100
          </span>
        </div>
        <ul className="m-0 grid list-none gap-2 p-0">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-[13.5px] leading-5">
              <span className={cx("mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full", check.ok ? "bg-app-success-tint text-app-success" : "bg-[#FDF0D5] text-[#8A5A00]")} aria-hidden>
                <Icon name={check.ok ? "check" : "dot"} size={12} />
              </span>
              <span>
                <span className="sr-only">{check.ok ? `${t("done")} ` : `${t("todo")} `}</span>
                {checkLabel(t, check.label)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  const fields = (
    <div className="grid content-start gap-5">
      <section className="grid gap-4 rounded-[18px] border border-app-line bg-white p-4 sm:p-5">
        <h3 className="m-0 text-[16px] font-extrabold">{t("searchEngines")}</h3>
        <div>
          <Label htmlFor={`${id}-title`} hint={t("titleHint")}>{t("searchTitle")}</Label>
          <input id={`${id}-title`} className={input} value={value.metaTitle} maxLength={SEO_LIMITS.title.hard} placeholder={props.title} onChange={(e) => set("metaTitle", e.target.value)} />
          <Meter length={searchTitle.length} kind="title" />
        </div>
        <div>
          <Label htmlFor={`${id}-desc`} hint={t("descHint")}>{t("searchDesc")}</Label>
          <textarea id={`${id}-desc`} className={area} rows={3} value={value.metaDescription} maxLength={SEO_LIMITS.description.hard} placeholder={props.fallbackDescription || t("descPh")} onChange={(e) => set("metaDescription", e.target.value)} />
          <Meter length={value.metaDescription.length} kind="description" />
        </div>
        {props.onSlugChange && (
          <div>
            <Label htmlFor={`${id}-slug`} hint={t("slugHint")}>{t("webAddress")}</Label>
            <div className="flex min-h-[44px] items-center overflow-hidden rounded-[14px] border border-app-line bg-white focus-within:border-app-ink">
              <span className="hidden max-w-[50%] shrink-0 truncate pl-3.5 text-[13.5px] text-app-ink-soft sm:block">{props.urlPrefix.replace(/^https?:\/\//, "")}</span>
              <input
                id={`${id}-slug`}
                className="min-h-[42px] min-w-0 flex-1 border-0 bg-transparent px-3.5 text-[14.5px] outline-none sm:pl-0.5"
                value={props.slug ?? ""}
                onChange={(e) => props.onSlugChange?.(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-"))}
              />
            </div>
          </div>
        )}
        <div>
          <Label htmlFor={`${id}-kw`} hint={t("kwHint")}>{t("kw")}</Label>
          <input id={`${id}-kw`} className={input} value={value.focusKeyword} maxLength={80} onChange={(e) => set("focusKeyword", e.target.value)} />
        </div>
      </section>

      <section className="grid gap-4 rounded-[18px] border border-app-line bg-white p-4 sm:p-5">
        <h3 className="m-0 text-[16px] font-extrabold">{t("sharing")}</h3>
        <div>
          <Label htmlFor={`${id}-st`}>{t("shareTitle")}</Label>
          <input id={`${id}-st`} className={input} value={value.socialTitle} maxLength={120} placeholder={searchTitle} onChange={(e) => set("socialTitle", e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${id}-sd`}>{t("shareDesc")}</Label>
          <textarea id={`${id}-sd`} className={area} rows={2} value={value.socialDescription} maxLength={300} placeholder={searchDescription || t("shareDescPh")} onChange={(e) => set("socialDescription", e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`${id}-si`} hint={t("imageHint")}>{t("shareImage")}</Label>
          <div className="flex flex-wrap gap-2">
            <input id={`${id}-si`} className={cx(input, "min-w-0 flex-1 basis-[200px]")} value={value.socialImage} placeholder="https://…" onChange={(e) => set("socialImage", e.target.value.trim())} />
            {props.allowUpload !== false && (
              <>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t("uploadShare")} onChange={(e) => void upload(e.target.files?.[0])} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[13.5px] font-bold hover:border-app-line-strong disabled:opacity-60">
                  <Icon name="upload" size={15} /> {uploading ? t("uploading") : t("upload")}
                </button>
              </>
            )}
          </div>
          {uploadError && <p className="m-0 mt-1.5 text-[13px] text-app-danger" role="alert">{uploadError}</p>}
        </div>
      </section>

      <section className="grid gap-4 rounded-[18px] border border-app-line bg-white p-4 sm:p-5">
        <h3 className="m-0 text-[16px] font-extrabold">{t("advanced")}</h3>
        <div>
          <Label htmlFor={`${id}-canon`} hint={t("canonHint")}>{t("canon")}</Label>
          <input id={`${id}-canon`} className={input} value={value.canonicalUrl} placeholder="https://…" onChange={(e) => set("canonicalUrl", e.target.value.trim())} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="m-0 text-[14px] font-bold">{t("hide")}</p>
            <p className="m-0 text-[12.5px] text-app-ink-soft">{t("hideHelp")}</p>
          </div>
          <Toggle on={value.noIndex} onChange={(on) => set("noIndex", on)} label={t("hide")} />
        </div>
      </section>
    </div>
  );

  if (props.compact) {
    return (
      <div className="grid gap-4">
        {previews}
        {fields}
      </div>
    );
  }
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      {fields}
      <div className="xl:sticky xl:top-4 xl:self-start">{previews}</div>
    </div>
  );
}
