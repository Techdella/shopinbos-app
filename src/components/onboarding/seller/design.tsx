"use client";

/* eslint-disable @next/next/no-img-element -- the seller's own photos and Rex's library. */

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { cx, Notice } from "@/components/app-ui";
import { FunLoader } from "@/components/brand/FunLoader";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { useRexResume } from "@/lib/ai/rex-jobs-client";
import type { LabelledColourSet } from "@shared/colour-sets";
import {
  EXTRA_SECTIONS,
  LAYOUTS,
  REX_SECTIONS,
  STYLES,
  bannerCandidates,
  defaultSections,
  flowPalette,
  palettesFor,
  recommendLayout,
  recommendStyle,
  styleDef,
  styleTokens,
  themeFor,
  type ExtraSection,
  type LayoutChoice,
  type PaletteDef,
  type ShowFirst,
  type StyleId,
} from "@shared/seller-onboarding";
import { applyTheme, fetchColourSets, track, uploadPicture, writeBannerWords } from "./api";
import { RexFrame, RexSays } from "./Frame";
import { ChoiceCard, RexPick, ShopBanner, SwitchRow, Swatches } from "./parts";
import { forgetDraft, LivePreview } from "./preview";
import type { StepCtx } from "./context";

// Step 2 (style, colours: RB-05, RB-06) and step 3 (the home page: banner photo, words, products layout, extra
// sections: RB-07…RB-10) on the web. Every choice is shown as the seller's own shop, with their photos and name; the
// colours, banner photo and words also show on the real shop underneath (./preview.tsx, the storefront renderer).

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** The seller's own product photos (the style cards show these, not stock shops). */
function useShopPhotos(ctx: StepCtx) {
  return useMemo(() => (ctx.data.products ?? []).map((product) => product.image).filter((url): url is string => Boolean(url)), [ctx.data.products]);
}

/** Library photos for the shop's own category first, then the rest. */
function useLibraryUrls(ctx: StepCtx) {
  return useMemo(() => {
    const photos = (ctx.data.library ?? []).filter((photo) => photo.category !== "mine");
    const own = new Set(ctx.flow.categories ?? []);
    return [...photos.filter((photo) => own.has(photo.category)), ...photos.filter((photo) => !own.has(photo.category))].map((photo) => photo.url);
  }, [ctx.data.library, ctx.flow.categories]);
}

const currentHeadline = (ctx: StepCtx, fallback: string) => ctx.flow.words?.headline || fallback;
const serifFor = (style: StyleId | null | undefined) => styleDef(style).font === "elegant" || styleDef(style).font === "clean";

/** D2a "Which style feels like you?": four cards drawn with the seller's photos, Rex's pick tagged. */
export function StyleStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const rex = recommendStyle(ctx.flow.categories);
  const [style, setStyle] = useState<StyleId>(ctx.flow.style ?? rex);
  const [busy, setBusy] = useState(false);
  const photos = useShopPhotos(ctx);
  const library = useLibraryUrls(ctx);
  const pictures = [...photos, ...library];

  // The draft needs a look before Rex can build on it: the starter template for what they sell (on every plan).
  async function choose(next: StyleId, rexPicked = false) {
    setBusy(true);
    try {
      if (!ctx.data.store.themeId && !ctx.flow.themeId) {
        const themeId = themeFor(ctx.flow.categories);
        await applyTheme(themeId).catch(() => null);
        forgetDraft();
        await ctx.save({ themeId });
      }
      if (rexPicked) ctx.rexChose(t.dynamic(`style.${next}`, next), { style: next });
      else await ctx.next({ style: next });
    } finally {
      setBusy(false);
    }
  }

  return (
    <RexFrame {...ctx.frame} wide primary={{ title: t("frame.next"), busy, onPress: () => void choose(style), testId: "style-next" }} onRexChoose={() => void choose(rex, true)}>
      <RexSays title={t("style.title")} sub={t("style.sub")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STYLES.map((def, index) => (
          <ChoiceCard key={def.id} testId={`style-${def.id}`} on={style === def.id} onPress={() => setStyle(def.id)} label={t.dynamic(`style.${def.id}`, def.id)}>
            <ShopBanner name={ctx.data.store.name} photo={pictures[index % Math.max(1, pictures.length)] ?? null} headline={t("style.headline")} palette={palettesFor(def.id)[0]!} height={110} serif={def.id === "soft" || def.id === "luxury"} dots />
            <span className="mt-2.5 flex flex-col gap-0.5">
              <span className="text-[16.5px] font-extrabold">{t.dynamic(`style.${def.id}`, def.id)}</span>
              <span className="text-[13.5px] leading-[1.35] text-app-ink-soft">{t.dynamic(`style.${def.id}.sub`, "")}</span>
              {def.id === rex ? <RexPick className="mt-1.5" /> : null}
            </span>
          </ChoiceCard>
        ))}
      </div>
    </RexFrame>
  );
}

interface ColourCard {
  id: string;
  source: "logo" | "photos" | "rex" | "preset";
  palette: PaletteDef;
  /** The set's own tokens (saved with the pick); null for a preset used as it is. */
  tokens: Record<string, string> | null;
}

/**
 * D2b "Here are 3 colour sets for you." Made from the seller's logo and product photos when they have them (GET
 * /api/mobile/onboarding/colours, every set checked for contrast), else the style's presets. The real shop in the
 * picked colours underneath, changing as the seller clicks.
 */
export function ColoursStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const [made, setMade] = useState<LabelledColourSet[] | null>(null);
  useEffect(() => {
    let gone = false;
    fetchColourSets(ctx.flow.style)
      .then((sets) => {
        if (!gone && sets.length) setMade(sets);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [ctx.flow.style]);
  const cards = useMemo<ColourCard[]>(
    () =>
      made
        ? made.map((set) => ({ id: set.id, source: set.source, palette: { id: set.id, swatch: set.swatch, tokens: set.tokens }, tokens: set.tokens }))
        : palettesFor(ctx.flow.style).map((palette, index) => ({ id: palette.id, source: index === 0 ? "rex" : "preset", palette, tokens: null })),
    [made, ctx.flow.style],
  );
  const [palette, setPalette] = useState(ctx.flow.palette ?? "");
  const pickedCard = cards.find((card) => card.id === palette) ?? cards[0]!;
  const photos = useShopPhotos(ctx);
  const library = useLibraryUrls(ctx);
  const first = cards[0]!;
  const label = (card: ColourCard, index: number) =>
    card.source === "logo" ? t("colours.fromLogo") : card.source === "photos" ? t("colours.fromPhotos") : card.source === "rex" && index === cards.findIndex((entry) => entry.source === "rex") ? t("colours.first") : t("colours.alt");
  const choice = (card: ColourCard) => ({ palette: card.id, paletteTokens: card.tokens });
  const photo = ctx.flow.banner?.url ?? photos[0] ?? library[0] ?? null;
  const headline = currentHeadline(ctx, t("style.headline"));

  return (
    <RexFrame
      {...ctx.frame}
      wide
      primary={{ title: t("frame.next"), onPress: () => void ctx.next(choice(pickedCard)), testId: "colours-next" }}
      onRexChoose={() => ctx.rexChose(first.source === "logo" ? t("colours.fromLogo") : first.source === "photos" ? t("colours.fromPhotos") : t.dynamic(`palette.${first.id}`, first.id), choice(first))}
    >
      <RexSays title={t("colours.title")} sub={made && made.some((set) => set.source !== "rex") ? t("colours.subPictures") : t("colours.sub")} />
      <div className="grid gap-3 lg:grid-cols-3">
        {cards.map((card, index) => {
          const name = card.source === "logo" || card.source === "photos" ? label(card, index) : t.dynamic(`palette.${card.id}`, card.id);
          return (
            <ChoiceCard key={card.id} testId={`palette-${card.id}`} on={pickedCard.id === card.id} onPress={() => setPalette(card.id)} label={name}>
              <span className="flex items-center gap-4 pr-8">
                <Swatches palette={card.palette} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px] font-extrabold">{name}</span>
                  <span className="block text-[14px] text-app-ink-soft">{card.source === "logo" || card.source === "photos" ? t("colours.readable") : label(card, index)}</span>
                </span>
              </span>
            </ChoiceCard>
          );
        })}
      </div>
      <section className="flex flex-col gap-2">
        <span className="self-start rounded-full bg-app-mint px-3 py-1 text-[13px] font-bold text-app-forest">{t("colours.preview")}</span>
        <LivePreview
          label={`${ctx.data.store.name} · ${t("colours.preview")}`}
          choices={{ tokens: styleTokens(ctx.flow.style, pickedCard.id, pickedCard.tokens), photo: ctx.flow.banner?.url ?? null, headline: ctx.flow.words?.headline ?? null }}
          fallback={<ShopBanner name={ctx.data.store.name} photo={photo} headline={headline} cta={t("preview.shop")} palette={pickedCard.palette} height={200} serif={serifFor(ctx.flow.style)} />}
        />
      </section>
    </RexFrame>
  );
}

/** D3a "Do you want this picture as your banner?" Yes · Show me another (about five) · Use my own photo. */
export function BannerStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const photos = useShopPhotos(ctx);
  const library = useLibraryUrls(ctx);
  const options = useMemo(() => bannerCandidates(photos, library), [photos, library]);
  const startAt = Math.max(0, options.findIndex((option) => option.url === ctx.flow.banner?.url));
  const [index, setIndex] = useState(startAt);
  const [swipes, setSwipes] = useState(0);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const palette = flowPalette(ctx.flow);
  const option = options[index] ?? null;
  const headline = currentHeadline(ctx, t("words.default1", { name: ctx.data.store.name }));

  function takeBanner(choice: { url: string; source: "product" | "rex_library" | "upload" } | null, rexPicked = false) {
    if (!choice) return;
    const banner = { url: choice.url, source: choice.source, swipes };
    track("banner_photo_choice", { source: choice.source, swipes });
    if (rexPicked) ctx.rexChose(t(choice.source === "product" ? "banner.fromProducts" : "banner.fromLibrary"), { banner });
    else void ctx.next({ banner });
  }

  async function own(picked: File | undefined) {
    if (!picked) return;
    setUploading(true);
    try {
      const url = await uploadPicture(picked, "brand");
      takeBanner({ url, source: "upload" });
    } catch (cause) {
      ctx.setError(errorText(cause, t("error.save")));
    } finally {
      setUploading(false);
    }
  }

  return (
    <RexFrame
      {...ctx.frame}
      wide
      secondary={options.length > 1 ? { title: t("banner.another"), testId: "banner-another", onPress: () => { setIndex((value) => (value + 1) % options.length); setSwipes((value) => value + 1); } } : null}
      primary={option ? { title: t("banner.yes"), icon: "check", onPress: () => takeBanner(option), testId: "banner-yes" } : null}
      link={{ title: uploading ? t("banner.uploading") : t("banner.own"), icon: "upload", onPress: () => file.current?.click(), testId: "banner-own" }}
    >
      <RexSays title={t("banner.title")} sub={t("banner.sub")} />
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => void own(event.target.files?.[0])} />
      {option ? (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <ShopBanner name={ctx.data.store.name} photo={option.url} headline={headline} cta={t("preview.shop")} palette={palette} height={300} serif />
            <span className="absolute left-4 top-11 inline-flex items-center gap-1.5 rounded-full bg-white/[0.92] px-3 py-1.5 text-[13.5px] font-bold text-app-ink">
              <Icon name={option.source === "product" ? "box" : "image"} size={15} />
              {t(option.source === "product" ? "banner.fromProducts" : "banner.fromLibrary")}
            </span>
          </div>
          <div className="flex justify-center gap-1.5" aria-hidden>
            {options.map((item, at) => (
              <span key={item.url} className={cx("h-2 rounded-full transition-all", at === index ? "w-[22px] bg-app-ink" : "w-2 bg-app-line-strong")} />
            ))}
          </div>
          {/* Rex's pick is the first photo: the seller's best product shot, else the library's. */}
          <button type="button" onClick={() => takeBanner(options[0] ?? null, true)} data-testid="rex-choose" className="inline-flex min-h-[40px] items-center gap-1.5 self-center rounded-full px-3 text-[14.5px] font-bold text-app-forest hover:bg-app-mint">
            <Icon name="sparkle" size={15} />
            {t("frame.rexChoose")}
          </button>
          <LivePreview label={`${ctx.data.store.name} · ${t("colours.preview")}`} height={300} choices={{ tokens: styleTokens(ctx.flow.style, ctx.flow.palette, ctx.flow.paletteTokens), photo: option.url, headline: ctx.flow.words?.headline ?? null }} />
        </div>
      ) : (
        <Notice tone="info">{t("banner.none")}</Notice>
      )}
    </RexFrame>
  );
}

type WordOption = { headline: string; sub?: string; cta?: string };

/** D3b "What should it say?" Three lines Rex wrote in the chosen style (or their own), shown on the banner on top. */
export function WordsStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const locale = useLocale();
  const name = ctx.data.store.name;
  const fallback: WordOption[] = [
    { headline: t("words.default1", { name }), cta: t("words.cta") },
    { headline: t("words.default2"), cta: t("words.cta") },
    { headline: t("words.default3", { name }), cta: t("words.cta") },
  ];
  const [options, setOptions] = useState<WordOption[]>(ctx.flow.words?.options?.length ? ctx.flow.words.options : []);
  const [chosen, setChosen] = useState<string>(ctx.flow.words?.headline ?? "");
  const [own, setOwn] = useState("");
  const [writing, setWriting] = useState(false);
  const [offline, setOffline] = useState(false);
  const palette = flowPalette(ctx.flow);
  const shown = options.length ? options : offline ? fallback : [];

  function take(list: { heading: string; text?: string; button?: string }[]) {
    const next = list.filter((item) => item.heading?.trim()).slice(0, 3).map((item) => ({ headline: item.heading.trim(), sub: item.text?.trim() || undefined, cta: item.button?.trim() || t("words.cta") }));
    if (!next.length) return false;
    setOptions(next);
    setChosen((current) => current || next[0]!.headline);
    void ctx.save({ words: { headline: chosen || next[0]!.headline, options: next } });
    return true;
  }

  // Lines Rex finished while the seller was away come back here (already paid for).
  useRexResume(["banner"], (job) => {
    const list = Array.isArray(job.result?.options) ? (job.result.options as { heading: string; text?: string; button?: string }[]) : [];
    if (!options.length) take(list);
  }, !options.length);

  useEffect(() => {
    if (options.length) return;
    setWriting(true);
    void writeBannerWords({ vibe: styleDef(ctx.flow.style).vibe, language: locale, round: 1 })
      .then((body) => {
        if (!take(body.options ?? [])) setOffline(true);
      })
      .catch(() => setOffline(true))
      .finally(() => setWriting(false));
    // Once, when the screen opens without lines.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typed = own.trim();
  const picked: WordOption | null = typed ? { headline: typed, cta: t("words.cta") } : shown.find((option) => option.headline === chosen) ?? shown[0] ?? null;
  const save = (option: WordOption | null, rexPicked = false) => {
    if (!option) return;
    const words = { headline: option.headline, sub: option.sub, cta: option.cta, options: shown };
    if (rexPicked) ctx.rexChose(option.headline, { words });
    else void ctx.next({ words });
  };

  return (
    <RexFrame {...ctx.frame} primary={{ title: t("frame.next"), disabled: !picked, onPress: () => save(picked), testId: "words-next" }} onRexChoose={shown.length ? () => save(shown[0] ?? null, true) : null}>
      <ShopBanner name={name} photo={ctx.flow.banner?.url ?? null} headline={picked?.headline ?? " "} sub={picked?.sub} cta={picked?.cta} palette={palette} height={200} serif />
      <RexSays title={t("words.title")} sub={t("words.sub")} />
      {writing ? <FunLoader kind="image" /> : null}
      {offline && !options.length ? <Notice tone="info">{t("words.offline")}</Notice> : null}
      {shown.map((option) => (
        <ChoiceCard key={option.headline} on={!typed && chosen === option.headline} onPress={() => { setOwn(""); setChosen(option.headline); }} label={option.headline}>
          <span className="block pr-9 font-serif text-[20px] italic leading-[1.3]">{option.headline}</span>
        </ChoiceCard>
      ))}
      <div className={cx("flex min-h-[58px] items-center gap-2.5 rounded-[22px] bg-white px-3.5", typed ? "border-[3px] border-app-ink" : "border border-app-line")}>
        <Icon name="edit" size={20} className="shrink-0 text-app-ink-soft" />
        <input id="rex-own-words" value={own} onChange={(event) => setOwn(event.target.value)} placeholder={t("words.own")} maxLength={120} aria-label={t("words.own")} className="min-w-0 flex-1 bg-transparent py-3 text-[16px] text-app-ink outline-none placeholder:text-app-ink-faint" />
        <VoiceInputButton variant="icon" mode="replace" value={own} onChange={setOwn} context="a short headline for a shop banner" />
      </div>
    </RexFrame>
  );
}

/** The little picture of each layout, made of the seller's product photos. */
function LayoutPicture({ kind, photos }: { kind: LayoutChoice; photos: string[] }) {
  const photo = (index: number) => photos[index % Math.max(1, photos.length)] ?? null;
  const box = (url: string | null, className: string) => (url ? <img src={url} alt="" className={cx("object-cover", className)} /> : <span className={cx("block bg-app-canvas", className)} />);
  if (kind === "grid") {
    return <span className="grid grid-cols-2 gap-1.5 p-2">{[0, 1, 2, 3].map((index) => <span key={index}>{box(photo(index), "aspect-[1/0.9] w-full rounded-[8px]")}</span>)}</span>;
  }
  if (kind === "big") return <span className="block p-2">{box(photo(0), "aspect-[1/0.86] w-full rounded-[10px]")}</span>;
  return (
    <span className="flex gap-1.5 overflow-hidden p-2">
      {box(photo(0), "aspect-[0.9/1] w-[78%] shrink-0 rounded-[10px]")}
      {box(photo(1), "aspect-[0.45/1] w-[40%] shrink-0 rounded-[10px]")}
    </span>
  );
}

/** D3c "How should your products show?" Grid · Big cards · Slider; what shows first; prices on or off. */
export function LayoutStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const products = ctx.data.products ?? [];
  const photos = useShopPhotos(ctx);
  const rex = recommendLayout(products.length);
  const [layout, setLayout] = useState<LayoutChoice>(ctx.flow.layout?.layout ?? rex);
  const firsts: { show: ShowFirst; id: string | null; label: string }[] = [
    { show: "best-sellers", id: null, label: t("layout.best") },
    { show: "new", id: null, label: t("layout.new") },
    ...(ctx.data.collections ?? []).filter((collection) => collection.productIds.length).map((collection) => ({ show: "collection" as const, id: collection.id, label: collection.name })),
  ];
  const savedFirst = firsts.findIndex((entry) => entry.show === ctx.flow.layout?.show && (entry.id ?? null) === (ctx.flow.layout?.collectionId ?? null));
  const [first, setFirst] = useState(Math.max(0, savedFirst));
  const [showPrice, setShowPrice] = useState(ctx.flow.layout?.showPrice ?? true);
  const pick = firsts[first] ?? firsts[0]!;
  const value = { layout, show: pick.show, collectionId: pick.id, showPrice };

  return (
    <RexFrame
      {...ctx.frame}
      wide
      primary={{ title: t("frame.next"), onPress: () => void ctx.next({ layout: value }), testId: "layout-next" }}
      onRexChoose={() => ctx.rexChose(t.dynamic(`layout.${rex}`, rex), { layout: { layout: rex, show: "best-sellers", collectionId: null, showPrice: true } })}
    >
      <RexSays title={t("layout.title")} sub={t("layout.sub", { done: 2, total: 4 })} />
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {LAYOUTS.map((kind) => (
          <ChoiceCard key={kind} testId={`layout-${kind}`} on={layout === kind} onPress={() => setLayout(kind)} label={t.dynamic(`layout.${kind}`, kind)} className="!p-1.5">
            <span className="block overflow-hidden rounded-[14px] bg-app-canvas">
              <LayoutPicture kind={kind} photos={photos} />
            </span>
            <span className="flex flex-col gap-0.5 p-1">
              <span className="text-[15.5px] font-extrabold">{t.dynamic(`layout.${kind}`, kind)}</span>
              <span className="text-[12.5px] leading-[1.3] text-app-ink-soft">{t.dynamic(`layout.${kind}.sub`, "")}</span>
              {kind === rex ? <RexPick className="mt-1" /> : null}
            </span>
          </ChoiceCard>
        ))}
      </div>
      <div className="flex items-center gap-3 rounded-[22px] border border-app-line bg-white p-3.5">
        <span className="grid h-[46px] w-[46px] shrink-0 place-items-center overflow-hidden rounded-[14px] bg-app-canvas">
          {photos[0] ? <img src={photos[0]} alt="" className="h-full w-full object-cover" /> : <Icon name="star" size={20} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16.5px] font-extrabold">{t("layout.showFirst")}</span>
          <span className="block truncate text-[14px] text-app-ink-soft">{pick.label}</span>
        </span>
        <button type="button" aria-label={`${t("layout.change")}: ${t("layout.showFirst")}`} onClick={() => setFirst((current) => (current + 1) % firsts.length)} className="min-h-[44px] shrink-0 rounded-full bg-app-canvas px-4 text-[14.5px] font-bold text-app-ink-soft hover:text-app-ink">
          {t("layout.change")}
        </button>
      </div>
      <SwitchRow icon="naira" title={t("layout.prices")} sub={t("layout.pricesSub")} on={showPrice} onChange={setShowPrice} testId="layout-prices" />
    </RexFrame>
  );
}

const SECTION_ICON: Record<ExtraSection, IconName> = { reviews: "star", delivery: "truck", whatsapp: "whatsapp", countdown: "clock", instagram: "instagram" };

/** D3d "Want any of these on your home page?" Rex switched on the useful ones (tagged "Rex"). */
export function SectionsStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("rexBuild");
  const [on, setOn] = useState<Record<ExtraSection, boolean>>({ ...defaultSections(), ...(ctx.flow.sections ?? {}) });
  return (
    <RexFrame
      {...ctx.frame}
      primary={{ title: t("frame.next"), onPress: () => void ctx.next({ sections: on }), testId: "sections-next" }}
      onRexChoose={() => ctx.rexChose(REX_SECTIONS.map((key) => t.dynamic(`sections.${key}`, key)).join(", "), { sections: defaultSections() })}
    >
      <RexSays title={t("sections.title")} sub={t("sections.sub")} />
      {EXTRA_SECTIONS.map((key) => (
        <SwitchRow
          key={key}
          testId={`section-${key}`}
          icon={SECTION_ICON[key]}
          title={t.dynamic(`sections.${key}`, key)}
          sub={t.dynamic(`sections.${key}.sub`, "")}
          tag={REX_SECTIONS.includes(key) ? t("sections.rex") : undefined}
          on={on[key]}
          onChange={(value) => setOn((current) => ({ ...current, [key]: value }))}
        />
      ))}
    </RexFrame>
  );
}
