import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import { Seg } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { Picture } from "@/components/kit";
import { Mascot } from "@/components/Mascot";
import { Sheet } from "@/components/Sheet";
import { Field, Label, LinkButton, Notice, PillButton, T, Toggle } from "@/components/ui";
import { buildBanner, drawShopLogos, fetchCollections, saveShopLogo, writeTaglines, type LogoIdea, type RexBanner, type ShopCollection } from "@/lib/banner";
import { ACCENT_CHOICES, type EditorProduct } from "@/lib/shop-edit";
import { useT } from "@/lib/i18n";
import { BANNER_LIMITS, BANNER_VIBES, readableText, type BannerCopy, type BannerLink, type BannerLinkAction, type BannerVibe } from "@shared/store-banner";
import { colors, fonts, radii } from "@/theme";

// Edit my shop › Banner (app/shop-edit.tsx, board M-StoreEdit): a live preview of the top of the shop (announcement
// bar, logo and name, banner picture, heading, text and button) above its fields, and three helpers:
//   Build it with Rex      Rex writes three sets of banner words and makes a banner picture; the seller picks one
//   Make a logo with Rex   Rex's logo ideas (the same as sign-up's), the one picked becomes the shop's logo
//   Write a tagline        Peggy writes three taglines in the app's language; tap one into the tagline or heading
// Words save with Save changes on the screen; a picture, a link, the bar on or off and its colour save at once.

// ─── Live preview ────────────────────────────────────────────────────────────

export function BannerPreview({
  storeName,
  logoUrl,
  imageUrl,
  heading,
  text,
  button,
  accent,
  bar,
  busy,
  onPicture,
}: {
  storeName: string;
  logoUrl: string | null;
  imageUrl: string;
  heading: string;
  text: string;
  button: string;
  accent: string;
  bar: { on: boolean; text: string; color: string | null } | null;
  busy: boolean;
  onPicture: () => void;
}) {
  const t = useT("m_banner");
  const barBg = bar?.color ?? colors.ink;
  return (
    <View testID="banner-preview" accessibilityLabel={t("preview.label")} style={{ borderRadius: radii.card, overflow: "hidden", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      {bar?.on ? (
        <View style={{ backgroundColor: barBg, paddingHorizontal: 12, paddingVertical: 7 }}>
          <T weight="bold" numberOfLines={1} style={{ fontSize: 12, textAlign: "center", color: readableText(barBg), opacity: bar.text.trim() ? 1 : 0.7 }}>{bar.text.trim() || t("preview.barAuto")}</T>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9 }}>
        <Picture uri={logoUrl} name={storeName} size={26} shape="square" />
        <T weight="extrabold" numberOfLines={1} style={{ flex: 1, fontSize: 14 }}>{storeName}</T>
        <AppIcon name="bag" size={18} />
      </View>
      <Pressable
        testID="banner-picture"
        accessibilityRole="button"
        accessibilityLabel={imageUrl ? t("picture.change") : t("picture.add")}
        disabled={busy}
        onPress={onPicture}
        style={{ minHeight: 210, backgroundColor: colors.lilac, justifyContent: "flex-end" }}
      >
        {imageUrl ? <Image source={{ uri: imageUrl }} style={{ position: "absolute", width: "100%", height: "100%" }} contentFit="cover" /> : null}
        {imageUrl ? <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(10,9,16,0.4)" }} /> : null}
        <View style={{ position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.94)", borderRadius: radii.pill, paddingHorizontal: 12, minHeight: 36 }}>
          <AppIcon name="camera" size={15} />
          <T weight="bold" style={{ fontSize: 13 }}>{busy ? t("picture.uploading") : imageUrl ? t("picture.change") : t("picture.add")}</T>
        </View>
        <View style={{ paddingHorizontal: 16, paddingBottom: 16, paddingTop: 60, gap: 6 }}>
          <T style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 28, letterSpacing: -0.4, color: imageUrl ? "#FFFFFF" : colors.ink }} numberOfLines={3}>
            {heading.trim() || storeName}
          </T>
          {text.trim() ? <T numberOfLines={3} style={{ fontSize: 13.5, lineHeight: 19, color: imageUrl ? "rgba(255,255,255,0.92)" : colors.inkSoft }}>{text.trim()}</T> : null}
          <View style={{ alignSelf: "flex-start", marginTop: 4, backgroundColor: accent, borderRadius: radii.pill, paddingHorizontal: 16, minHeight: 36, justifyContent: "center" }}>
            <T weight="bold" style={{ fontSize: 13.5, color: readableText(accent) }}>{button.trim() || t("preview.buttonDefault")}</T>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

// ─── The three helpers ───────────────────────────────────────────────────────

export function BannerHelpers({ onBuild, onLogo, onTagline }: { onBuild: () => void; onLogo: () => void; onTagline: () => void }) {
  const t = useT("m_banner");
  return (
    <View style={{ gap: 8 }}>
      <Helper testID="banner-rex-build" who="rex" icon="sparkle" tint={colors.peach} title={t("helper.build")} sub={t("helper.buildSub")} onPress={onBuild} />
      <Helper testID="banner-rex-logo" who="rex" icon="star" tint={colors.lilac} title={t("helper.logo")} sub={t("helper.logoSub")} onPress={onLogo} />
      <Helper testID="banner-peggy-tagline" who="peggy" icon="chat" tint={colors.mintTint} title={t("helper.tagline")} sub={t("helper.taglineSub")} onPress={onTagline} />
    </View>
  );
}

function Helper({ who, icon, tint, title, sub, onPress, testID }: { who: "rex" | "peggy"; icon: AppIconName; tint: string; title: string; sub: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}>
        <Mascot who={who} size={36} decorative />
      </View>
      <View style={{ flex: 1 }}>
        <T weight="extrabold" style={{ fontSize: 16 }}>{title}</T>
        <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft, marginTop: 1 }}>{sub}</T>
      </View>
      <AppIcon name={icon} size={18} color={colors.inkSoft} />
    </Pressable>
  );
}

// ─── Where the button (or the bar) goes ──────────────────────────────────────

const ACTION_KEYS: Record<BannerLinkAction, "link.shop" | "link.collection" | "link.product" | "link.whatsapp"> = {
  products: "link.shop",
  collection: "link.collection",
  product: "link.product",
  whatsapp: "link.whatsapp",
};

/** Shop, a collection, a product or WhatsApp (and "No link" when `optional`); a collection or product is picked below. */
export function LinkPicker({
  value,
  onChange,
  products,
  collections,
  optional,
  disabled,
  label,
}: {
  value: BannerLink | null;
  onChange: (link: BannerLink | null) => void;
  products: EditorProduct[];
  collections: ShopCollection[] | null;
  optional?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const t = useT("m_banner");
  const [choosing, setChoosing] = useState<BannerLinkAction | null>(null);
  const shown = choosing ?? value?.action ?? null;
  const pick = (action: BannerLinkAction) => {
    if (action === "collection" || action === "product") return setChoosing(action);
    setChoosing(null);
    onChange({ action, target: "" });
  };
  const choices = shown === "collection" ? (collections ?? []).map((entry) => ({ id: entry.id, name: entry.name })) : shown === "product" ? products.map((entry) => ({ id: entry.id, name: entry.name })) : [];
  return (
    <View style={{ gap: 8, opacity: disabled ? 0.5 : 1 }} pointerEvents={disabled ? "none" : "auto"}>
      <Label>{label}</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {optional ? (
          <Seg
            label={t("link.none")}
            on={!value && !choosing}
            onPress={() => {
              setChoosing(null);
              onChange(null);
            }}
          />
        ) : null}
        {(Object.keys(ACTION_KEYS) as BannerLinkAction[]).map((action) => (
          <Seg key={action} label={t(ACTION_KEYS[action])} on={shown === action} onPress={() => pick(action)} />
        ))}
      </View>
      {shown === "collection" || shown === "product" ? (
        <View style={{ gap: 8, backgroundColor: colors.canvas, borderRadius: radii.field, padding: 10 }}>
          <T style={{ fontSize: 14, color: colors.inkSoft }}>{shown === "collection" ? t("link.pickCollection") : t("link.pickProduct")}</T>
          {shown === "collection" && collections === null ? <T style={{ fontSize: 14 }}>{t("link.loading")}</T> : null}
          {choices.length ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {choices.slice(0, 30).map((entry) => (
                <Seg
                  key={entry.id}
                  label={entry.name}
                  on={value?.action === shown && value.target === entry.id}
                  onPress={() => {
                    setChoosing(null);
                    onChange({ action: shown, target: entry.id });
                  }}
                />
              ))}
            </View>
          ) : shown === "product" || collections !== null ? (
            <T style={{ fontSize: 14 }}>{shown === "collection" ? t("link.noCollections") : t("link.noProducts")}</T>
          ) : null}
        </View>
      ) : null}
      {value?.action === "whatsapp" ? <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("link.whatsappHint")}</T> : null}
    </View>
  );
}

/** The shop's collections, loaded once when a picker first needs them. */
export function useCollections() {
  const [collections, setCollections] = useState<ShopCollection[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchCollections().then((rows) => live && setCollections(rows));
    return () => {
      live = false;
    };
  }, []);
  return collections;
}

// ─── Announcement bar colour ─────────────────────────────────────────────────

export function BarColours({ value, onChange, disabled }: { value: string | null; onChange: (color: string | null) => void; disabled?: boolean }) {
  const t = useT("m_banner");
  const swatch = (key: string, color: string | null, label: string) => {
    const on = (value ?? null) === color;
    return (
      <Pressable
        key={key}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ selected: on, disabled }}
        disabled={disabled}
        onPress={() => onChange(color)}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: color ?? colors.surface, borderWidth: on ? 3 : 1, borderColor: on ? colors.ink : colors.line, alignItems: "center", justifyContent: "center" }}
      >
        {color ? (on ? <AppIcon name="check" size={18} color={readableText(color)} strokeWidth={3} /> : null) : <T weight="bold" style={{ fontSize: 11 }}>{t("bar.themeShort")}</T>}
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 8 }}>
      <Label>{t("bar.colour")}</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel={t("bar.colour")}>
        {swatch("theme", null, t("bar.themeColour"))}
        {ACCENT_CHOICES.map((color) => swatch(color, color, t("bar.colourName", { colour: color })))}
      </View>
    </View>
  );
}

// ─── Build it with Rex ───────────────────────────────────────────────────────

export function RexBannerSheet({ visible, onClose, onApply }: { visible: boolean; onClose: () => void; onApply: (choice: { copy: BannerCopy | null; imageUrl: string | null }) => Promise<boolean> }) {
  const t = useT("m_banner");
  const { height } = useWindowDimensions();
  const [vibe, setVibe] = useState<BannerVibe | null>(null);
  const [prompt, setPrompt] = useState("");
  const [picture, setPicture] = useState(true);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RexBanner | null>(null);
  const [picked, setPicked] = useState(0);
  const [usePicture, setUsePicture] = useState(true);

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const made = await buildBanner({ prompt, vibe, picture });
      setResult(made);
      setPicked(0);
      setUsePicture(Boolean(made.imageUrl));
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : t("rex.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!result) return;
    setApplying(true);
    const done = await onApply({ copy: result.options[picked] ?? null, imageUrl: usePicture ? result.imageUrl : null });
    setApplying(false);
    if (done) {
      setResult(null);
      onClose();
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={t("rex.title")} testID="banner-rex-sheet">
      <ScrollView style={{ maxHeight: height * 0.72 }} contentContainerStyle={{ gap: 12, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Mascot who="rex" mood={busy ? "working" : result ? "celebrate" : "idle"} size={40} decorative />
          <T style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{busy ? t("rex.working") : result ? t("rex.done") : t("rex.intro")}</T>
        </View>
        {!result ? (
          <>
            <Label>{t("rex.vibe")}</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {BANNER_VIBES.map((entry) => (
                <Seg key={entry.id} label={t.dynamic(`vibe.${entry.id}`, entry.id)} on={vibe === entry.id} onPress={() => setVibe(vibe === entry.id ? null : entry.id)} />
              ))}
            </View>
            <View>
              <Label>{t("rex.prompt")}</Label>
              <Field value={prompt} onChangeText={setPrompt} maxLength={300} multiline placeholder={t("rex.promptHint")} accessibilityLabel={t("rex.prompt")} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <T weight="bold" style={{ fontSize: 15 }}>{t("rex.picture")}</T>
                <T style={{ fontSize: 14, color: colors.inkSoft }}>{t("rex.pictureHint")}</T>
              </View>
              <Toggle label={t("rex.picture")} on={picture} onChange={setPicture} />
            </View>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <PillButton testID="banner-rex-go" tone="accent" icon="sparkle" title={busy ? t("rex.building") : t("rex.build")} busy={busy} disabled={!vibe && !prompt.trim()} onPress={() => void build()} />
          </>
        ) : (
          <>
            {result.imageUrl ? (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: usePicture }} accessibilityLabel={t("rex.usePicture")} onPress={() => setUsePicture(!usePicture)} style={{ borderRadius: radii.card, overflow: "hidden", borderWidth: 2, borderColor: usePicture ? colors.ink : colors.line }}>
                <Image source={{ uri: result.imageUrl }} style={{ width: "100%", aspectRatio: 3 / 2 }} contentFit="cover" />
                <View style={{ position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.94)", borderRadius: radii.pill, paddingHorizontal: 10, minHeight: 32 }}>
                  <AppIcon name={usePicture ? "check" : "image"} size={14} />
                  <T weight="bold" style={{ fontSize: 13 }}>{usePicture ? t("rex.usingPicture") : t("rex.usePicture")}</T>
                </View>
              </Pressable>
            ) : null}
            {result.pictureProblem ? <Notice tone="info">{t("rex.pictureProblem")}</Notice> : null}
            {result.options.length ? <Label>{t("rex.pickWords")}</Label> : null}
            {result.options.map((option, index) => (
              <Pressable
                key={option.heading}
                testID={`banner-rex-option-${index}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: picked === index }}
                accessibilityLabel={`${option.heading}. ${option.text}`}
                onPress={() => setPicked(index)}
                style={{ borderRadius: 18, borderWidth: 2, borderColor: picked === index ? colors.ink : colors.line, padding: 12, gap: 4, backgroundColor: colors.surface }}
              >
                <T style={{ fontFamily: fonts.displayBold, fontSize: 18, lineHeight: 22 }}>{option.heading}</T>
                {option.text ? <T style={{ fontSize: 14, lineHeight: 19, color: colors.inkSoft }}>{option.text}</T> : null}
                {option.button ? (
                  <View style={{ alignSelf: "flex-start", marginTop: 4, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 12, minHeight: 30, justifyContent: "center" }}>
                    <T weight="bold" style={{ fontSize: 13 }}>{option.button}</T>
                  </View>
                ) : null}
              </Pressable>
            ))}
            {error ? <Notice tone="error">{error}</Notice> : null}
            <PillButton testID="banner-rex-apply" tone="accent" title={t("rex.apply")} busy={applying} disabled={busy || (!result.options.length && !(usePicture && result.imageUrl))} onPress={() => void apply()} />
            <LinkButton title={t("rex.again")} onPress={() => setResult(null)} />
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

// ─── Make a logo with Rex ────────────────────────────────────────────────────

export function RexLogoSheet({ visible, onClose, storeName, onSaved }: { visible: boolean; onClose: () => void; storeName: string; onSaved: (url: string) => void }) {
  const t = useT("m_banner");
  const { width, height } = useWindowDimensions();
  const [logos, setLogos] = useState<LogoIdea[]>([]);
  const [round, setRound] = useState(1);
  const [notes, setNotes] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draw(next: number) {
    setBusy(true);
    setError(null);
    try {
      const ideas = await drawShopLogos({ businessName: storeName, round: next, notes });
      if (!ideas.length) throw new Error(t("logo.failed"));
      setLogos(ideas);
      setRound(next);
      setPicked(null);
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : t("logo.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function use() {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      await saveShopLogo(picked);
      onSaved(picked);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("logo.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const tile = Math.min(150, (Math.min(width, 520) - 70) / 3);
  return (
    <Sheet visible={visible} onClose={onClose} title={t("logo.title")} testID="banner-logo-sheet">
      <ScrollView style={{ maxHeight: height * 0.72 }} contentContainerStyle={{ gap: 12, paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <Mascot who="rex" mood={busy ? "working" : "idle"} size={40} decorative />
          <T style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{busy ? t("logo.drawing", { name: storeName }) : logos.length ? t("logo.pick") : t("logo.intro", { name: storeName })}</T>
        </View>
        {logos.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {logos.map((logo, index) => (
              <Pressable
                key={logo.url}
                testID={`banner-logo-${index}`}
                accessibilityRole="radio"
                accessibilityLabel={t("logo.option", { number: index + 1 })}
                accessibilityState={{ selected: picked === logo.url }}
                onPress={() => setPicked(logo.url)}
                style={{ width: tile, height: tile, borderRadius: 18, overflow: "hidden", backgroundColor: colors.canvas, borderWidth: 2, borderColor: picked === logo.url ? colors.ink : "transparent" }}
              >
                <Image source={{ uri: logo.url }} style={{ width: "100%", height: "100%" }} contentFit="contain" />
              </Pressable>
            ))}
          </View>
        ) : null}
        {logos.length ? (
          <View style={{ gap: 8 }}>
            <Field value={notes} onChangeText={setNotes} maxLength={300} placeholder={t("logo.notesHint")} accessibilityLabel={t("logo.notes")} />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <PillButton size="sm" tone="white" icon="sparkle" title={notes.trim() ? t("logo.redraw") : t("logo.more")} disabled={busy} onPress={() => void draw(notes.trim() ? round : round + 1)} />
            </View>
          </View>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {logos.length ? (
          <PillButton testID="banner-logo-use" tone="accent" title={t("logo.use")} busy={saving} disabled={!picked || busy} onPress={() => void use()} />
        ) : (
          <PillButton testID="banner-logo-go" tone="accent" icon="sparkle" title={busy ? t("logo.drawingShort") : t("logo.draw")} busy={busy} onPress={() => void draw(round)} />
        )}
      </ScrollView>
    </Sheet>
  );
}

// ─── Write a tagline with Peggy ──────────────────────────────────────────────

export function PeggyTaglineSheet({ visible, onClose, current, onUse }: { visible: boolean; onClose: () => void; current: string; onUse: (line: string, where: "tagline" | "heading") => void }) {
  const t = useT("m_banner");
  const [lines, setLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const { taglines } = await writeTaglines(current);
      setLines(taglines);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : t("tagline.failed"));
    } finally {
      setBusy(false);
    }
  }

  // Peggy starts writing as the sheet opens (once; "Write 3 more" asks again).
  useEffect(() => {
    if (!visible || lines.length || busy || error) return;
    const start = setTimeout(() => void ask(), 0);
    return () => clearTimeout(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose} title={t("tagline.title")} testID="banner-tagline-sheet">
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Mascot who="peggy" mood={busy ? "thinking" : lines.length ? "wave" : "idle"} size={40} decorative />
        <T style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{busy ? t("tagline.writing") : lines.length ? t("tagline.pick") : t("tagline.intro")}</T>
      </View>
      {lines.map((line, index) => (
        <View key={line} testID={`banner-tagline-${index}`} style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 10 }}>
          <T weight="bold" style={{ fontSize: 17, lineHeight: 23 }}>{line}</T>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <PillButton size="sm" tone="ink" title={t("tagline.useTagline")} accessibilityLabel={t("tagline.useTaglineAria", { line })} onPress={() => onUse(line, "tagline")} />
            <PillButton size="sm" tone="white" title={t("tagline.useHeading")} accessibilityLabel={t("tagline.useHeadingAria", { line })} onPress={() => onUse(line, "heading")} />
          </View>
        </View>
      ))}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <PillButton testID="banner-tagline-more" tone="white" icon="sparkle" title={busy ? t("tagline.writingShort") : lines.length ? t("tagline.more") : t("tagline.write")} busy={busy} onPress={() => void ask()} />
    </Sheet>
  );
}

/** A labelled group inside the Banner section. */
export function Group({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <T weight="extrabold" style={{ flex: 1, fontSize: 17 }}>{title}</T>
        {right}
      </View>
      {children}
    </View>
  );
}

export { BANNER_LIMITS };
