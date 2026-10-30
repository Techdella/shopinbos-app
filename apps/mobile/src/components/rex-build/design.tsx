import { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Notice, T } from "@/components/ui";
import { VoiceInput } from "@/components/VoiceInput";
import { FunLoader } from "@/components/FunLoader";
import { useLocale, useT } from "@/lib/i18n";
import { pickPhotos, uploadPhoto } from "@/lib/photos";
import { useRexResume } from "@/lib/rex-jobs";
import { applyLook } from "@/lib/templates";
import {
  EXTRA_SECTIONS,
  LAYOUTS,
  REX_SECTIONS,
  STYLES,
  bannerCandidates,
  defaultSections,
  paletteDef,
  palettesFor,
  recommendLayout,
  recommendStyle,
  styleDef,
  themeFor,
  track,
  writeBannerWords,
  type ExtraSection,
  type LayoutChoice,
  type ShowFirst,
  type StyleId,
} from "@/lib/seller-onboarding";
import { colors, fonts, radii, surfaceCard } from "@/theme";
import { RexFrame, RexSays } from "./Frame";
import { CheckBadge, ChoiceCard, RexPick, ShopBanner, SwitchRow, Swatches } from "./parts";
import type { StepCtx } from "./context";

// Step 2 (style, colours: RB-05, RB-06) and step 3 (the home page: banner photo, words, products layout, extra
// sections: RB-07…RB-10). Every choice is shown as the seller's own shop, with their photos and name.

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

function currentHeadline(ctx: StepCtx, fallback: string) {
  return ctx.flow.words?.headline || fallback;
}

/** D2a "Which style feels like you?": four cards drawn with the seller's photos, Rex's pick tagged. */
export function StyleStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const { width } = useWindowDimensions();
  const card = Math.floor((Math.min(width, 600) - 36 - 12) / 2);
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
        await applyLook(themeId).catch(() => null);
        await ctx.save({ themeId });
      }
      if (rexPicked) ctx.rexChose(t(`style.${next}`), { style: next });
      else await ctx.next({ style: next });
    } finally {
      setBusy(false);
    }
  }

  return (
    <RexFrame {...ctx.frame} primary={{ title: t("frame.next"), busy, onPress: () => void choose(style), testID: "style-next" }} onRexChoose={() => void choose(rex, true)}>
      <RexSays title={t("style.title")} sub={t("style.sub")} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {STYLES.map((def, index) => (
          <ChoiceCard key={def.id} testID={`style-${def.id}`} on={style === def.id} onPress={() => setStyle(def.id)} label={t(`style.${def.id}`)} style={{ width: card }}>
            <ShopBanner name={ctx.data.store.name} photo={pictures[index % Math.max(1, pictures.length)] ?? null} headline={t("style.headline")} palette={palettesFor(def.id)[0]!} height={92} serif={def.id === "soft" || def.id === "luxury"} dots />
            <View style={{ gap: 2, marginTop: 10 }}>
              <T weight="extrabold" style={{ fontSize: 16.5 }}>{t(`style.${def.id}`)}</T>
              <T style={{ fontSize: 13.5, lineHeight: 18, color: colors.inkSoft }}>{t(`style.${def.id}.sub`)}</T>
              {def.id === rex ? <RexPick style={{ marginTop: 6 }} /> : null}
            </View>
          </ChoiceCard>
        ))}
      </View>
    </RexFrame>
  );
}

/** D2b "Here are 3 colour sets for you." with the shop's banner in the picked colours underneath. */
export function ColoursStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const sets = palettesFor(ctx.flow.style);
  const [palette, setPalette] = useState(ctx.flow.palette && sets.some((set) => set.id === ctx.flow.palette) ? ctx.flow.palette : sets[0]!.id);
  const photos = useShopPhotos(ctx);
  const library = useLibraryUrls(ctx);
  const picked = paletteDef(palette) ?? sets[0]!;
  return (
    <RexFrame {...ctx.frame} primary={{ title: t("frame.next"), onPress: () => void ctx.next({ palette }), testID: "colours-next" }} onRexChoose={() => ctx.rexChose(t(`palette.${sets[0]!.id}` as "palette.warm"), { palette: sets[0]!.id })}>
      <RexSays title={t("colours.title")} sub={t("colours.sub")} />
      {sets.map((set, index) => (
        <ChoiceCard key={set.id} testID={`palette-${set.id}`} on={palette === set.id} onPress={() => setPalette(set.id)} label={t.dynamic(`palette.${set.id}`, set.id)}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
            <Swatches palette={set} />
            <View style={{ flex: 1 }}>
              <T weight="extrabold" style={{ fontSize: 17 }}>{t.dynamic(`palette.${set.id}`, set.id)}</T>
              <T style={{ fontSize: 14, color: colors.inkSoft }}>{index === 0 ? t("colours.first") : t("colours.alt")}</T>
            </View>
          </View>
        </ChoiceCard>
      ))}
      <View>
        <ShopBanner name={ctx.data.store.name} photo={ctx.flow.banner?.url ?? photos[0] ?? library[0] ?? null} headline={currentHeadline(ctx, t("style.headline"))} cta={t("preview.shop")} palette={picked} height={170} serif={styleDef(ctx.flow.style).font === "elegant" || styleDef(ctx.flow.style).font === "clean"} />
        <View style={{ position: "absolute", top: 8, right: 10, backgroundColor: colors.mintTint, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
          <T weight="bold" style={{ fontSize: 13, color: colors.forest }}>{t("colours.preview")}</T>
        </View>
      </View>
    </RexFrame>
  );
}

/** D3a "Do you want this picture as your banner?" Yes · Show me another (about five) · Use my own photo. */
export function BannerStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const photos = useShopPhotos(ctx);
  const library = useLibraryUrls(ctx);
  const options = useMemo(() => bannerCandidates(photos, library), [photos, library]);
  const startAt = Math.max(0, options.findIndex((option) => option.url === ctx.flow.banner?.url));
  const [index, setIndex] = useState(startAt);
  const [swipes, setSwipes] = useState(0);
  const [uploading, setUploading] = useState(false);
  const palette = paletteDef(ctx.flow.palette) ?? palettesFor(ctx.flow.style)[0]!;
  const option = options[index] ?? null;

  function takeBanner(choice: { url: string; source: "product" | "rex_library" | "upload" } | null, rexPicked = false) {
    if (!choice) return;
    const banner = { url: choice.url, source: choice.source, swipes };
    track("banner_photo_choice", { source: choice.source, swipes });
    if (rexPicked) ctx.rexChose(t(choice.source === "product" ? "banner.fromProducts" : "banner.fromLibrary"), { banner });
    else void ctx.next({ banner });
  }

  async function own() {
    const picked = await pickPhotos("library");
    if (picked === "denied" || !picked.length) return;
    setUploading(true);
    try {
      const url = await uploadPhoto(picked[0]!, "store-banners");
      takeBanner({ url, source: "upload" });
    } catch (cause) {
      ctx.setError(cause instanceof Error && cause.message ? cause.message : t("error.save"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <RexFrame
      {...ctx.frame}
      secondary={options.length > 1 ? { title: t("banner.another"), onPress: () => { setIndex((value) => (value + 1) % options.length); setSwipes((value) => value + 1); } } : null}
      primary={option ? { title: t("banner.yes"), icon: "check", onPress: () => takeBanner(option), testID: "banner-yes" } : null}
      link={{ title: uploading ? t("banner.uploading") : t("banner.own"), icon: "image", onPress: () => void own(), testID: "banner-own" }}
    >
      <RexSays title={t("banner.title")} sub={t("banner.sub")} />
      {option ? (
        <View>
          <ShopBanner name={ctx.data.store.name} photo={option.url} headline={currentHeadline(ctx, t("words.default1", { name: ctx.data.store.name }))} cta={t("preview.shop")} palette={palette} height={300} serif />
          <View style={{ position: "absolute", top: 46, left: 18, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
            <AppIcon name={option.source === "product" ? "box" : "folder"} size={15} color={colors.ink} />
            <T weight="bold" style={{ fontSize: 13.5, color: "#16141F" }}>{t(option.source === "product" ? "banner.fromProducts" : "banner.fromLibrary")}</T>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 12 }}>
            {options.map((item, at) => (
              <View key={item.url} style={{ width: at === index ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: at === index ? colors.inkFill : colors.lineStrong }} />
            ))}
          </View>
        </View>
      ) : (
        <Notice tone="info">{t("banner.none")}</Notice>
      )}
      {/* Rex's pick is the first photo: the seller's best product shot, else the library's. */}
      {option ? (
        <Pressable accessibilityRole="button" onPress={() => takeBanner(options[0] ?? null, true)} style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 40 }} testID="rex-choose">
          <AppIcon name="sparkle" size={15} color={colors.forest} />
          <T weight="bold" style={{ color: colors.forest, fontSize: 14.5 }}>{t("frame.rexChoose")}</T>
        </Pressable>
      ) : null}
    </RexFrame>
  );
}

type WordOption = { headline: string; sub?: string; cta?: string };

/** D3b "What should it say?" Three lines Rex wrote in the chosen style (or their own), shown on the banner on top. */
export function WordsStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
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
  const palette = paletteDef(ctx.flow.palette) ?? palettesFor(ctx.flow.style)[0]!;
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
    <RexFrame {...ctx.frame} primary={{ title: t("frame.next"), disabled: !picked, onPress: () => save(picked), testID: "words-next" }} onRexChoose={shown.length ? () => save(shown[0] ?? null, true) : null}>
      <ShopBanner name={name} photo={ctx.flow.banner?.url ?? null} headline={picked?.headline ?? " "} sub={picked?.sub} palette={palette} height={180} serif />
      <RexSays title={t("words.title")} sub={t("words.sub")} />
      {writing ? <FunLoader kind="image" /> : null}
      {offline && !options.length ? <Notice tone="info">{t("words.offline")}</Notice> : null}
      {shown.map((option) => (
        <ChoiceCard key={option.headline} on={!typed && chosen === option.headline} onPress={() => { setOwn(""); setChosen(option.headline); }} label={option.headline}>
          <T style={{ fontFamily: "serif", fontStyle: "italic", fontSize: 20, lineHeight: 26, paddingRight: 34 }}>{option.headline}</T>
        </ChoiceCard>
      ))}
      <View style={{ ...surfaceCard(22), flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, minHeight: 58, borderWidth: typed ? 3 : 1, borderColor: typed ? colors.ink : colors.line }}>
        <AppIcon name="type" size={20} color={colors.inkSoft} />
        <TextInput value={own} onChangeText={setOwn} placeholder={t("words.own")} placeholderTextColor={colors.inkFaint} maxLength={120} accessibilityLabel={t("words.own")} style={{ flex: 1, fontSize: 16, fontFamily: fonts.regular, color: colors.ink, paddingVertical: 12 }} />
        <VoiceInput variant="icon" mode="replace" value={own} onChange={setOwn} context="a short headline for a shop banner" />
      </View>
    </RexFrame>
  );
}

const LAYOUT_ICON: Record<LayoutChoice, "grid" | "big" | "slider"> = { grid: "grid", big: "big", slider: "slider" };

/** The little picture of each layout, made of the seller's product photos. */
function LayoutPicture({ kind, photos, size }: { kind: LayoutChoice; photos: string[]; size: number }) {
  const photo = (index: number) => photos[index % Math.max(1, photos.length)] ?? null;
  const box = (url: string | null, style: object) => (url ? <Image source={{ uri: url }} style={style} contentFit="cover" /> : <View style={[style, { backgroundColor: colors.grayTint }]} />);
  const inner = size - 16;
  if (LAYOUT_ICON[kind] === "grid") {
    const cell = (inner - 6) / 2;
    return (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, padding: 8 }}>
        {[0, 1, 2, 3].map((index) => <View key={index}>{box(photo(index), { width: cell, height: cell * 0.9, borderRadius: 8 })}</View>)}
      </View>
    );
  }
  if (LAYOUT_ICON[kind] === "big") return <View style={{ padding: 8 }}>{box(photo(0), { width: inner, height: inner * 0.86, borderRadius: 10 })}</View>;
  return (
    <View style={{ flexDirection: "row", gap: 6, padding: 8, overflow: "hidden" }}>
      {box(photo(0), { width: inner * 0.78, height: inner * 0.86, borderRadius: 10 })}
      {box(photo(1), { width: inner * 0.4, height: inner * 0.86, borderRadius: 10 })}
    </View>
  );
}

/** D3c "How should your products show?" Grid · Big cards · Slider; what shows first; prices on or off. */
export function LayoutStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const { width } = useWindowDimensions();
  const card = Math.floor((Math.min(width, 600) - 36 - 16) / 3);
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
      primary={{ title: t("frame.next"), onPress: () => void ctx.next({ layout: value }), testID: "layout-next" }}
      onRexChoose={() => ctx.rexChose(t(`layout.${rex}`), { layout: { layout: rex, show: "best-sellers", collectionId: null, showPrice: true } })}
    >
      <RexSays title={t("layout.title")} sub={t("layout.sub", { done: 2, total: 4 })} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {LAYOUTS.map((kind) => (
          <ChoiceCard key={kind} testID={`layout-${kind}`} on={layout === kind} onPress={() => setLayout(kind)} label={t(`layout.${kind}`)} style={{ width: card, padding: 6 }}>
            <View style={{ borderRadius: 14, backgroundColor: colors.canvas, overflow: "hidden" }}>
              <LayoutPicture kind={kind} photos={photos} size={card - 12} />
            </View>
            <View style={{ padding: 4, gap: 2 }}>
              <T weight="extrabold" style={{ fontSize: 15.5 }}>{t(`layout.${kind}`)}</T>
              <T style={{ fontSize: 12.5, lineHeight: 16, color: colors.inkSoft }}>{t(`layout.${kind}.sub`)}</T>
              {kind === rex ? <RexPick style={{ marginTop: 4 }} /> : null}
            </View>
          </ChoiceCard>
        ))}
      </View>
      <View style={{ ...surfaceCard(22), flexDirection: "row", alignItems: "center", gap: 12, padding: 14 }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: colors.grayTint, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {photos[0] ? <Image source={{ uri: photos[0] }} style={{ width: 46, height: 46 }} contentFit="cover" /> : <AppIcon name="star" size={20} color={colors.ink} />}
        </View>
        <View style={{ flex: 1 }}>
          <T weight="extrabold" style={{ fontSize: 16.5 }}>{t("layout.showFirst")}</T>
          <T style={{ fontSize: 14, color: colors.inkSoft }} numberOfLines={1}>{pick.label}</T>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`${t("layout.change")}: ${t("layout.showFirst")}`} onPress={() => setFirst((value) => (value + 1) % firsts.length)} style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: radii.pill, backgroundColor: colors.grayTint, justifyContent: "center" }}>
          <T weight="bold" style={{ fontSize: 14.5, color: colors.inkSoft }}>{t("layout.change")}</T>
        </Pressable>
      </View>
      <SwitchRow icon="naira" title={t("layout.prices")} sub={t("layout.pricesSub")} on={showPrice} onChange={setShowPrice} testID="layout-prices" />
    </RexFrame>
  );
}

const SECTION_ICON: Record<ExtraSection, AppIconName> = { reviews: "star", delivery: "truck", whatsapp: "chat", countdown: "clock", instagram: "image" };

/** D3d "Want any of these on your home page?" Rex switched on the useful ones (tagged "Rex"). */
export function SectionsStep({ ctx }: { ctx: StepCtx }) {
  const t = useT("m_rexBuild");
  const [on, setOn] = useState<Record<ExtraSection, boolean>>({ ...defaultSections(), ...(ctx.flow.sections ?? {}) });
  return (
    <RexFrame {...ctx.frame} primary={{ title: t("frame.next"), onPress: () => void ctx.next({ sections: on }), testID: "sections-next" }} onRexChoose={() => ctx.rexChose(REX_SECTIONS.map((key) => t(`sections.${key}`)).join(", "), { sections: defaultSections() })}>
      <RexSays title={t("sections.title")} sub={t("sections.sub")} />
      {EXTRA_SECTIONS.map((key) => (
        <SwitchRow
          key={key}
          testID={`section-${key}`}
          icon={SECTION_ICON[key]}
          title={t(`sections.${key}`)}
          sub={t(`sections.${key}.sub`)}
          tag={REX_SECTIONS.includes(key) ? t("sections.rex") : undefined}
          on={on[key]}
          onChange={(value) => setOn((current) => ({ ...current, [key]: value }))}
        />
      ))}
    </RexFrame>
  );
}

export { CheckBadge };
