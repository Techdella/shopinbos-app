import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, TextInput, useWindowDimensions, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import {
  businessCategories,
  firstNameOf,
  lettermark,
  lookFromTheme,
  naira,
  nextSellerQuestion,
  ONBOARDING_LANGUAGES,
  previousSellerQuestion,
  resumeSellerQuestion,
  SELLER_QUESTIONS,
  sellerQuestionNumber,
  shopSlug,
  suggestedRetailPrice,
  type ProductPath,
  type SellerQuestion,
} from "@shared/onboarding";
import { Chip, Field, InfoTip, Label, LinkButton, Mascot, Notice, PillButton, T } from "@/components/ui";
import { List, Row, Tile } from "@/components/design";
import { AppIcon, type AppIconName } from "@/components/icons";
import { OnboardingFrame } from "@/components/OnboardingFrame";
import { OnboardingWelcome, onboardingWelcomeSeen } from "@/components/OnboardingWelcome";
import { useOnboarding } from "@/components/OnboardingContext";
import { VoiceInput } from "@/components/VoiceInput";
import {
  addSupplierPick,
  buildStore,
  checkAddress,
  createFirstProduct,
  drawLogos,
  fetchSellCategories,
  fetchSupplierPicks,
  finishOnboarding,
  saveAddress,
  saveLogo,
  saveMemory,
  saveStoreName,
  type LogoIdea,
  type StoreAddress,
  type SupplierPick,
} from "@/lib/onboarding";
import { pickPhotos, uploadPhoto, type PhotoSource } from "@/lib/photos";
import { applyLook, fetchLookLibrary, lookDemoUrl, recommendLook, type LookLibrary } from "@/lib/templates";
import { MiniShop } from "@/components/MiniShop";
import * as WebBrowser from "expo-web-browser";
import { publishShop } from "@/lib/publish";
import { shareOnWhatsApp, shareText } from "@/lib/share";
import { localeFromName } from "@shared/i18n";
import { useLocale, useSetLocale, useT } from "@/lib/i18n";
import { colors, fonts, radii } from "@/theme";

// Seller sign-up to a live store, one question per screen (shared/onboarding.ts SELLER_QUESTIONS), the same flow as
// the web (src/components/onboarding/seller/SellerOnboarding.tsx): store name, logo, what you sell, products ready?,
// first product, its name and price, a look, the store address, then "Your store is live!". Each answer is saved as
// it's given and the screen is kept in the onboarding memory, so the app reopens on the same question. No ID, bank or
// CAC: the payout bank and delivery wait on Start here. Buying a domain is a paid checkout, so the phone doesn't offer it.

const OPTIONAL: SellerQuestion[] = ["logo", "product", "details"];
/** Looks shown at a time on "Pick a look". */
const LOOKS_PAGE = 8;
/** 13-RexTheme's starting vibes for "Ask Rex to design it" (sellerStart look.vibe.*). */
const VIBES = ["bold", "soft", "gold", "clean"] as const;

export default function SellerQuestions() {
  const { status, refresh, lang, setLang } = useOnboarding();
  const params = useLocalSearchParams<{ screen?: string }>();
  const t = useT("sellerStart", "common");
  const tb = useT("builder");
  const tl = useT("m_looks");
  const tSettings = useT("settings");
  const appLocale = useLocale();
  const setAppLocale = useSetLocale();
  const memory = status?.memory;
  const { width } = useWindowDimensions();

  const [intro, setIntro] = useState(() => !memory?.screen && !onboardingWelcomeSeen());
  const [question, setQuestion] = useState<SellerQuestion>(() => resumeSellerQuestion(params.screen ?? memory?.screen));
  const [path, setPath] = useState<ProductPath | null>(memory?.productPath ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  const [storeName, setStoreName] = useState("");
  const [logoMode, setLogoMode] = useState<"upload" | "rex" | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logos, setLogos] = useState<LogoIdea[]>([]);
  const [logoRound, setLogoRound] = useState(1);
  const [logoNotes, setLogoNotes] = useState("");
  const [logoUnavailable, setLogoUnavailable] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [picks, setPicks] = useState<SupplierPick[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [termsFirst, setTermsFirst] = useState<Set<string>>(new Set());
  // "Pick a look": the web's theme library (GET /api/mobile/looks), the same themes as /builder/templates.
  const [library, setLibrary] = useState<LookLibrary | null>(null);
  const [libraryFailed, setLibraryFailed] = useState(false);
  const [lookId, setLookId] = useState<string | null>(null);
  const [lookChip, setLookChip] = useState("all");
  const [looksShown, setLooksShown] = useState(LOOKS_PAGE);
  const [vibe, setVibe] = useState("");
  // No "Buy a new domain" on the phone: a domain is a paid checkout, and app store rules keep that off the app.
  const [addressChoice, setAddressChoice] = useState<"free" | "have">("free");
  const [slug, setSlug] = useState("");
  const [address, setAddress] = useState<StoreAddress | null>(null);
  const [checking, setChecking] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [liveProblem, setLiveProblem] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  // 05-StoreName: "adaskloset.mybos.store is free" under the name, checked as they type.
  const [nameAddress, setNameAddress] = useState<StoreAddress | null>(null);
  // 11-Details: "Add another one" saved a product and came back to the camera.
  const [productNote, setProductNote] = useState<string | null>(null);

  // The status arrives after the first render: take the saved answers once.
  useEffect(() => {
    if (!status || loaded.current) return;
    loaded.current = true;
    const saved = status.memory;
    setQuestion(resumeSellerQuestion(params.screen ?? saved?.screen));
    setPath(saved?.productPath ?? null);
    setStoreName(status.store.name && !/'s Store$/.test(status.store.name) ? status.store.name : saved?.storeName ?? "");
    setChosen(saved?.categories ?? (saved?.category ? [saved.category] : []));
    setSlug(status.store.slug);
    setLiveUrl(status.store.url);
    setLive(status.store.live);
    if (saved?.templateId) setLookId(saved.templateId);
    setIntro((current) => current && !saved?.screen);
  }, [status, params.screen]);

  const name = firstNameOf(status?.ownerName);
  const displayName = storeName.trim() || status?.store.name || "";
  const description = [displayName, chosen.length ? `sells ${chosen.join(", ")}` : ""].filter(Boolean).join(" ");

  function go(next: SellerQuestion | null, patch: Record<string, unknown> = {}) {
    setError(null);
    setBusy(false);
    if (!next) return;
    setQuestion(next);
    void saveMemory({ screen: next, ...patch }).catch(() => null);
  }
  const forward = (patch: Record<string, unknown> = {}) => go(nextSellerQuestion(question, path), patch);

  function fail(cause: unknown) {
    setError(cause instanceof Error && cause.message ? cause.message : t("error.save"));
    setBusy(false);
  }

  useEffect(() => {
    if (question !== "sell" || categories.length) return;
    void fetchSellCategories().then((names) => setCategories(businessCategories(names)));
  }, [question, categories.length]);

  // "Pick a look": the theme library, and (before they've picked one) Rex's pick for what they sell.
  useEffect(() => {
    if (question !== "look" || library) return;
    let live = true;
    fetchLookLibrary()
      .then(async (loadedLibrary) => {
        if (!live) return;
        if (!loadedLibrary?.looks.length) return setLibraryFailed(true);
        setLibrary(loadedLibrary);
        const usable = (id: string | null | undefined) => Boolean(id && loadedLibrary.looks.some((look) => look.id === id && !look.lockedPlan));
        if (usable(lookId)) return;
        const pick = await recommendLook().catch(() => null);
        if (live) setLookId(usable(pick?.themeId) ? pick!.themeId : loadedLibrary.looks.find((look) => !look.lockedPlan)?.id ?? null);
      })
      .catch(() => live && setLibraryFailed(true));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, library]);

  useEffect(() => {
    if (question !== "product" || path !== "dropship" || picks) return;
    void fetchSupplierPicks().then(setPicks).catch(() => setPicks([]));
  }, [question, path, picks]);

  useEffect(() => {
    if (question !== "address" || addressChoice !== "free") return;
    const wanted = shopSlug(slug);
    if (!wanted) return;
    setChecking(true);
    const timer = setTimeout(() => {
      void checkAddress(wanted)
        .then(setAddress)
        .catch(() => setAddress(null))
        .finally(() => setChecking(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [question, addressChoice, slug]);

  useEffect(() => {
    if (question !== "name") return;
    const wanted = shopSlug(storeName);
    if (!wanted) return setNameAddress(null);
    const timer = setTimeout(() => {
      void checkAddress(wanted)
        .then(setNameAddress)
        .catch(() => setNameAddress(null));
    }, 450);
    return () => clearTimeout(timer);
  }, [question, storeName]);

  const published = useRef(false);
  useEffect(() => {
    if (question !== "live" || published.current || !status) return;
    published.current = true;
    void goLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, status]);

  async function saveName() {
    const value = storeName.trim();
    if (!value) return setError(t("name.needed"));
    setBusy(true);
    try {
      const saved = await saveStoreName(value);
      setSlug(saved.slug);
      await saveMemory({ storeName: value }, live ? { onboardingState: "BUILDING_REX" } : { onboardingState: "BUILDING_REX", status: "draft" });
      forward({ storeName: value });
    } catch (cause) {
      fail(cause);
    }
  }

  async function pickLogo(source: PhotoSource) {
    setLogoMode("upload");
    setLogos([]);
    const photos = await pickPhotos(source);
    if (photos === "denied" || !photos.length) return;
    setBusy(true);
    try {
      const url = await uploadPhoto(photos[0], "brand");
      await saveLogo(url);
      setLogoUrl(url);
      setBusy(false);
    } catch (cause) {
      fail(cause);
    }
  }

  async function askForLogos(round: number) {
    setLogoMode("rex");
    setLogoRound(round);
    setLogoUnavailable(false);
    setBusy(true);
    setError(null);
    try {
      setLogos(await drawLogos({ businessName: displayName, businessDescription: description, round, notes: logoNotes.trim() || undefined }));
    } catch {
      setLogoUnavailable(true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmLogo() {
    setBusy(true);
    try {
      if (logoMode === "rex" && logoUrl) await saveLogo(logoUrl);
      forward({ logo: logoUrl ? { url: logoUrl, style: logoMode === "rex" ? "rex" : "upload" } : { style: "lettermark", label: lettermark(displayName) } });
    } catch (cause) {
      fail(cause);
    }
  }

  function chooseReady(next: ProductPath) {
    setPath(next);
    go("product", { productPath: next });
  }

  async function takeProductPhoto(source: PhotoSource) {
    const photos = await pickPhotos(source);
    if (photos === "denied" || !photos.length) return;
    setBusy(true);
    setError(null);
    try {
      setPhotoUrl(await uploadPhoto(photos[0], "products"));
      setProductNote(null);
      setBusy(false);
    } catch (cause) {
      fail(cause);
    }
  }

  async function addPick(pick: SupplierPick) {
    try {
      const result = await addSupplierPick(pick.id, suggestedRetailPrice(pick.price) || pick.price);
      if (result === "terms") setTermsFirst((current) => new Set([...current, pick.id]));
      else setAdded((current) => new Set([...current, pick.id]));
    } catch (cause) {
      fail(cause);
    }
  }

  /** Saves the product; "Add another one" (11-Details) goes back to the camera for the next instead of on. */
  async function saveProduct(another = false) {
    const amount = Number(price.replace(/[^\d]/g, ""));
    if (!productName.trim()) return setError(t("details.needName"));
    if (!amount) return setError(t("details.needPrice"));
    if (!photoUrl) return go("product");
    setBusy(true);
    try {
      await createFirstProduct({ name: productName, price: amount, imageUrl: photoUrl });
      if (!another) return forward();
      setProductNote(t("details.addedNext", { name: productName.trim() }));
      setPhotoUrl(null);
      setProductName("");
      setPrice("");
      go("product");
    } catch (cause) {
      fail(cause);
    }
  }

  async function buildLook() {
    const picked = library?.looks.find((look) => look.id === lookId) ?? library?.looks.find((look) => !look.lockedPlan) ?? null;
    if (!picked) return setError(t("look.loadFailed"));
    const { look, palette } = lookFromTheme(picked);
    setBusy(true);
    setError(null);
    const [primary, accent, background] = palette.swatches;
    await saveMemory({ templateId: picked.id, palette: { id: palette.key, name: palette.label, colors: { primary, accent, background } } }).catch(() => null);
    try {
      // The theme first (its pages and sections, the web's switch route, which checks the plan), then Rex's words
      // and colours on it. Always saves a design: Rex's, or the plain name and colours when Rex is unavailable.
      await applyLook(picked.id);
      await buildStore({ storeName: displayName, slug, description, category: chosen[0], palette, look, tweak: vibe.trim() || undefined });
      forward({ templateId: picked.id });
    } catch (cause) {
      fail(cause);
    }
  }

  async function saveStoreAddress() {
    setBusy(true);
    try {
      if (addressChoice === "free") {
        const wanted = shopSlug(slug);
        if (wanted && wanted !== status?.store.slug) setLiveUrl((await saveAddress(wanted)).url);
        else if (address?.url) setLiveUrl(address.url);
      }
      forward();
    } catch (cause) {
      fail(cause);
    }
  }

  async function goLive() {
    setBusy(true);
    setLiveProblem(null);
    try {
      const shop = await publishShop();
      if (shop.url) setLiveUrl(shop.url);
      setLive(true);
    } catch (cause) {
      setLiveProblem(cause instanceof Error && cause.message ? cause.message : t("error.save"));
    } finally {
      setBusy(false);
    }
  }

  /** Home; a next step on "Your store is live!" (15-Live) opens its screen over Home. */
  async function finish(next?: "/wallet" | "/delivery" | "/add-products") {
    setBusy(true);
    await finishOnboarding(live).catch(() => null);
    await refresh().catch(() => null);
    router.replace("/home");
    if (next) router.push(next);
  }

  async function share(app: "whatsapp" | "instagram" | "tiktok" | "copy" | "more") {
    const url = liveUrl ?? "";
    const text = t("live.shareText", { name: displayName, url });
    if (app === "whatsapp") return shareOnWhatsApp(text);
    if (app === "more") return void shareText(text);
    await Clipboard.setStringAsync(app === "copy" ? url : text).catch(() => undefined);
    setShareNote(app === "copy" ? t("live.copied") : t("live.copiedFor", { app: app === "instagram" ? "Instagram" : "TikTok" }));
    if (app === "instagram") void Linking.openURL("instagram://app").catch(() => undefined);
    if (app === "tiktok") void Linking.openURL("snssdk1233://").catch(() => undefined);
  }

  if (intro) return <OnboardingWelcome name={status?.ownerName} onDone={() => setIntro(false)} />;

  const previous = previousSellerQuestion(question, path);
  const skippable = OPTIONAL.includes(question);

  function skip() {
    if (question === "product") return go("look");
    forward();
  }

  // `tip`: the longer explanation, behind an ⓘ after the title (a step shows at most one short line).
  const title = (text: string, sub?: string, tip?: string) => (
    <View style={{ marginBottom: 22 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <T accessibilityRole="header" style={{ flexShrink: 1, fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6 }}>{text}</T>
        {tip ? <InfoTip title={text} text={tip} size={20} /> : null}
      </View>
      {sub ? <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21, marginTop: 8 }}>{sub}</T> : null}
    </View>
  );

  const choice = (key: string, label: string, hint: string, icon: AppIconName, on: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 2, borderColor: on ? colors.ink : "transparent", opacity: pressed ? 0.9 : 1 })}
    >
      <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.mintTint, alignItems: "center", justifyContent: "center" }}>
        <AppIcon name={icon} size={22} color={colors.forest} />
      </View>
      <View style={{ flex: 1 }}>
        <T weight="extrabold" style={{ fontSize: 17 }}>{label}</T>
        <T style={{ color: colors.inkSoft, fontSize: 14, marginTop: 2 }}>{hint}</T>
      </View>
    </Pressable>
  );

  const continueButton = (onPress: () => void, disabled = false): ReactNode => (
    <>
      {error ? <Notice>{error}</Notice> : null}
      <PillButton title={t("continue")} busy={busy} disabled={disabled} onPress={onPress} />
    </>
  );

  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (question === "name") {
    body = (
      <>
        {name ? <T weight="bold" style={{ color: colors.accentInk, fontSize: 15, marginBottom: 6 }}>{t("name.welcome", { name })}</T> : null}
        {title(t("name.titleNoName"), t("name.hintKnown"))}
        <Label>{t("name.label")}</Label>
        <Field autoFocus value={storeName} onChangeText={setStoreName} placeholder={t("name.placeholder")} accessibilityLabel={t("name.titleNoName")} maxLength={60} returnKeyType="next" onSubmitEditing={() => void saveName()} style={{ fontSize: 20, fontFamily: fonts.bold }} />
        {storeName.trim() && nameAddress && !nameAddress.problem && nameAddress.host ? (
          <View testID="onboarding-name-free" accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 10, marginTop: 12, backgroundColor: colors.surface, borderRadius: radii.pill, paddingVertical: 8, paddingLeft: 8, paddingRight: 16 }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.successTint, alignItems: "center", justifyContent: "center" }}>
              <AppIcon name="check" size={14} color={colors.success} strokeWidth={3} />
            </View>
            <T style={{ fontSize: 14, flexShrink: 1 }}>{t("name.free", { host: nameAddress.host })}</T>
          </View>
        ) : null}
        {/* The app's language, picked once here (shared/i18n); Rex writes the store in it too. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 28 }}>
          {ONBOARDING_LANGUAGES.map((item) => (
            <Chip
              key={item}
              label={item}
              on={localeFromName(item) === appLocale}
              onPress={() => {
                setLang(item);
                const locale = localeFromName(item);
                if (locale && locale !== appLocale) void setAppLocale(locale);
              }}
            />
          ))}
        </View>
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 8 }}>{tSettings("language.onboarding")}</T>
      </>
    );
    footer = continueButton(() => void saveName(), !storeName.trim());
  }

  if (question === "logo") {
    body = (
      <>
        {title(t("logo.title"), t("logo.sub", { name: displayName }))}
        <View style={{ gap: 12 }}>
          {choice("yes", t("logo.yes"), t("logo.yesHint"), "camera", logoMode === "upload", () => setLogoMode("upload"))}
          {logoMode === "upload" ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <PillButton size="md" tone="white" style={{ flex: 1 }} icon="camera" title={t("product.snap")} onPress={() => void pickLogo("camera")} />
              <PillButton size="md" tone="white" style={{ flex: 1 }} icon="image" title={t("product.gallery")} onPress={() => void pickLogo("library")} />
            </View>
          ) : null}
          {choice("rex", t("logo.no"), t("logo.noHint"), "sparkle", logoMode === "rex", () => void askForLogos(logoRound))}
        </View>
        {logoMode === "upload" && logoUrl ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginTop: 18, backgroundColor: colors.surface, borderRadius: 20, padding: 14 }}>
            <Image source={{ uri: logoUrl }} style={{ width: 64, height: 64, borderRadius: 14 }} resizeMode="contain" />
            <T weight="bold" style={{ fontSize: 15 }}>{t("logo.uploaded")}</T>
          </View>
        ) : null}
        {logoMode === "rex" ? (
          <View style={{ marginTop: 18, gap: 12 }}>
            {busy && !logos.length ? <T style={{ color: colors.inkSoft }}>{t("logo.drawing", { name: displayName })}</T> : null}
            {logoUnavailable ? (
              <>
                <Notice tone="info">{t("logo.unavailable")}</Notice>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.surface, borderRadius: 20, padding: 14 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: colors.inkFill, alignItems: "center", justifyContent: "center" }}>
                    <T weight="extrabold" style={{ color: "#FFFFFF", fontSize: 22 }}>{lettermark(displayName)}</T>
                  </View>
                  <T weight="bold" style={{ flex: 1, fontSize: 15 }}>{t("logo.useInitials")}</T>
                </View>
              </>
            ) : null}
            {logos.length ? (
              <>
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <Mascot name="rex" size={34} />
                  <View style={{ flex: 1, backgroundColor: colors.mintTint, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <T style={{ fontSize: 14, lineHeight: 20 }}>{t("logo.rexSaid", { name: displayName })}</T>
                  </View>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {logos.map((logo, index) => (
                    <Pressable
                      key={logo.url}
                      accessibilityRole="button"
                      accessibilityLabel={t("logo.option", { number: index + 1 })}
                      accessibilityState={{ selected: logoUrl === logo.url }}
                      onPress={() => setLogoUrl(logo.url)}
                      style={{ width: (width - 50) / 2, aspectRatio: 1, borderRadius: 20, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 2, borderColor: logoUrl === logo.url ? colors.ink : "transparent" }}
                    >
                      <Image source={{ uri: logo.url }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <TextInput
                    value={logoNotes}
                    onChangeText={setLogoNotes}
                    placeholder={t("logo.changePlaceholder")}
                    placeholderTextColor={colors.inkFaint}
                    accessibilityLabel={t("logo.changeAria")}
                    style={{ flex: 1, minHeight: 50, borderRadius: radii.pill, backgroundColor: colors.surface, paddingHorizontal: 18, fontSize: 15, fontFamily: fonts.regular, color: colors.ink }}
                  />
                  <PillButton size="sm" tone="forest" title={t("logo.redo")} disabled={!logoNotes.trim() || busy} onPress={() => void askForLogos(logoRound)} />
                </View>
                <PillButton size="md" tone="white" icon="sparkle" title={t("logo.more")} disabled={busy} onPress={() => void askForLogos(logoRound + 1)} />
              </>
            ) : null}
          </View>
        ) : null}
      </>
    );
    footer = continueButton(() => void confirmLogo(), !logoUrl && !logoUnavailable);
  }

  if (question === "sell") {
    body = (
      <>
        {title(t("sell.title"), t("sell.hint"))}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {categories.map((category) => (
            <Chip key={category} label={category} on={chosen.includes(category)} onPress={() => setChosen((current) => (current.includes(category) ? current.filter((item) => item !== category) : [...current, category]))} />
          ))}
        </View>
      </>
    );
    footer = (
      <>
        {chosen.length ? <T style={{ fontSize: 14, color: colors.inkSoft, textAlign: "center" }}>{t("sell.picked", { count: chosen.length })}</T> : null}
        {continueButton(() => (chosen.length ? forward({ categories: chosen, category: chosen[0] }) : setError(t("sell.needed"))), !chosen.length)}
      </>
    );
  }

  if (question === "ready") {
    body = (
      <>
        {title(t("ready.title"), t("ready.sub"))}
        <View style={{ gap: 12 }}>
          {choice("own", t("ready.own"), t("ready.ownHint"), "camera", path === "own", () => chooseReady("own"))}
          {choice("dropship", t("ready.dropship"), t("ready.dropshipHint"), "truck", path === "dropship", () => chooseReady("dropship"))}
        </View>
        {/* Ready-made starter packs of supplier products (app/find/packs.tsx). */}
        <LinkButton testID="onboarding-starter-packs" title={t("ready.packs")} style={{ marginTop: 14 }} onPress={() => router.push("/find/packs")} />
      </>
    );
  }

  if (question === "product" && path !== "dropship") {
    body = (
      <>
        {productNote ? <View style={{ marginBottom: 16 }}><Notice tone="success">{productNote}</Notice></View> : null}
        {title(productNote ? t("product.titleNext") : t("product.title"), t("product.tip"))}
        {photoUrl ? (
          <View style={{ borderRadius: 24, overflow: "hidden", backgroundColor: colors.surface }}>
            <Image source={{ uri: photoUrl }} style={{ width: "100%", aspectRatio: 1 }} />
            <T weight="bold" style={{ padding: 16, fontSize: 15 }}>{t("product.photoReady")}</T>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("product.snap")}
            onPress={() => void takeProductPhoto("camera")}
            style={{ aspectRatio: 4 / 3, borderRadius: 24, borderWidth: 2, borderStyle: "dashed", borderColor: colors.line, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", gap: 10 }}
          >
            <AppIcon name="camera" size={38} />
            <T weight="extrabold" style={{ fontSize: 17 }}>{busy ? t("product.uploading") : t("product.snap")}</T>
          </Pressable>
        )}
        <PillButton size="md" tone="white" icon="image" style={{ marginTop: 12 }} title={photoUrl ? t("product.retake") : t("product.gallery")} onPress={() => void takeProductPhoto(photoUrl ? "camera" : "library")} />
      </>
    );
    footer = continueButton(() => (photoUrl ? forward() : setError(t("product.needPhoto"))), !photoUrl);
  }

  if (question === "product" && path === "dropship") {
    const cardWidth = width - 72;
    body = (
      <>
        {title(t("product.dropshipTitle"), undefined, t("product.dropshipHint"))}
        {picks === null ? (
          <T style={{ color: colors.inkSoft }}>{t("product.loading")}</T>
        ) : !picks.length ? (
          <Notice tone="info">{t("product.none")}</Notice>
        ) : (
          <ScrollView horizontal snapToInterval={cardWidth + 12} decelerationRate="fast" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingLeft: 20 }}>
            {picks.map((pick) => {
              const sell = suggestedRetailPrice(pick.price) || pick.price;
              return (
                <View key={pick.id} style={{ width: cardWidth, borderRadius: 24, overflow: "hidden", backgroundColor: colors.surface }}>
                  {pick.imageUrl ? <Image source={{ uri: pick.imageUrl }} style={{ width: "100%", aspectRatio: 1 }} /> : <View style={{ width: "100%", aspectRatio: 1, backgroundColor: colors.canvas }} />}
                  <View style={{ padding: 16, gap: 4 }}>
                    <T weight="extrabold" style={{ fontSize: 17 }}>{pick.name}</T>
                    <T style={{ color: colors.inkSoft, fontSize: 13 }}>{pick.supplier} · {t("product.cost", { price: naira(pick.price) })}</T>
                    <T weight="bold" style={{ fontSize: 14 }}>{t("product.yourPrice", { price: naira(sell) })}</T>
                    {termsFirst.has(pick.id) ? (
                      <T style={{ color: colors.inkSoft, fontSize: 13, marginTop: 8 }}>{t("product.checkFirst")}</T>
                    ) : (
                      <PillButton size="md" style={{ marginTop: 10 }} tone={added.has(pick.id) ? "white" : "ink"} icon={added.has(pick.id) ? "check" : "plus"} title={added.has(pick.id) ? t("product.added") : t("product.add")} disabled={added.has(pick.id)} onPress={() => void addPick(pick)} />
                    )}
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
        {added.size ? <T weight="bold" style={{ color: colors.forest, marginTop: 12 }}>{t("product.addedCount", { count: added.size })}</T> : null}
      </>
    );
    footer = continueButton(() => forward(), !added.size);
  }

  if (question === "details") {
    body = (
      <>
        {photoUrl ? <Image source={{ uri: photoUrl }} accessibilityLabel={t("product.photoReady")} style={{ width: 120, height: 120, borderRadius: 20, marginBottom: 18, backgroundColor: colors.surface }} /> : null}
        {title(t("details.title"))}
        <Label>{t("details.name")}</Label>
        <Field autoFocus value={productName} onChangeText={setProductName} placeholder={t("details.namePlaceholder")} maxLength={120} />
        <View style={{ height: 16 }} />
        <Label>{t("details.price")}</Label>
        <Field value={price} onChangeText={(value) => setPrice(value.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder={t("details.pricePlaceholder")} />
        <T style={{ color: colors.inkSoft, fontSize: 14, lineHeight: 20, marginTop: 14 }}>{t("details.later")}</T>
      </>
    );
    footer = (
      <>
        {error ? <Notice>{error}</Notice> : null}
        <PillButton title={t("details.add")} busy={busy} disabled={!productName.trim() || !price} onPress={() => void saveProduct()} />
        <LinkButton testID="onboarding-add-another" title={t("details.another")} onPress={() => (busy || !productName.trim() || !price ? undefined : void saveProduct(true))} />
      </>
    );
  }

  if (question === "look") {
    const cardWidth = Math.floor((width - 40 - 12) / 2);
    const inChip = (library?.looks ?? []).filter((look) => lookChip === "all" || look.categories.includes(lookChip));
    const picked = library?.looks.find((look) => look.id === lookId) ?? null;
    // The picked look first, then the rest of the chip.
    const ordered = picked ? [picked, ...inChip.filter((look) => look.id !== picked.id)] : inChip;
    const shown = ordered.slice(0, looksShown);
    body = (
      <>
        {title(t("look.title"), undefined, t("look.hintLibrary", { count: library?.looks.length ?? 60 }))}
        {!library ? (
          libraryFailed ? <Notice>{t("look.loadFailed")}</Notice> : <ActivityIndicator color={colors.ink} style={{ marginVertical: 24 }} />
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginBottom: 12 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
              {library.chips.map((chip) => (
                <Chip key={chip} label={chip === "all" ? t("look.all") : tb.dynamic(`chipf.${chip}`, chip)} on={lookChip === chip} onPress={() => { setLookChip(chip); setLooksShown(LOOKS_PAGE); }} />
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {shown.map((look) => {
                const selected = look.id === lookId;
                return (
                  <View key={look.id} style={{ width: cardWidth, borderRadius: 20, padding: 6, gap: 6, backgroundColor: colors.surface, borderWidth: selected ? 2.5 : 1, borderColor: selected ? colors.ink : colors.line }}>
                    <Pressable
                      testID={`onboarding-look-${look.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={t("look.pick", { name: look.name })}
                      accessibilityState={{ selected, disabled: Boolean(look.lockedPlan) }}
                      disabled={Boolean(look.lockedPlan)}
                      onPress={() => setLookId(look.id)}
                      style={({ pressed }) => ({ gap: 6, opacity: look.lockedPlan ? 0.55 : pressed ? 0.88 : 1 })}
                    >
                      <MiniShop look={look} height={190} storeName={displayName} />
                      {selected ? (
                        <View style={{ position: "absolute", left: 6, top: 30, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.inkFill }}>
                          <AppIcon name="check" size={11} color="#FFFFFF" strokeWidth={2.6} />
                          <T weight="bold" style={{ fontSize: 11, color: "#FFFFFF" }}>{t("look.selected")}</T>
                        </View>
                      ) : null}
                      <View style={{ paddingHorizontal: 4, gap: 2 }}>
                        <T weight="extrabold" numberOfLines={1} style={{ fontSize: 14 }}>{look.name}</T>
                        <T numberOfLines={2} style={{ fontSize: 12.5, lineHeight: 16, color: colors.inkSoft, minHeight: 32 }}>{look.lockedPlan ? tl("notOnPlan") : tb.dynamic(`theme.${look.id}.meaning`, look.meaning)}</T>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={t("look.previewName", { name: look.name })}
                      onPress={() => void WebBrowser.openBrowserAsync(lookDemoUrl(look))}
                      style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, marginHorizontal: 4, marginBottom: 4, minHeight: 34, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line }}
                    >
                      <AppIcon name="globe" size={14} color={colors.ink} />
                      <T weight="bold" style={{ fontSize: 13 }}>{t("look.preview")}</T>
                    </Pressable>
                  </View>
                );
              })}
            </View>
            {ordered.length > shown.length ? (
              <PillButton size="md" tone="white" style={{ marginTop: 14, alignSelf: "center" }} title={t("look.more", { count: ordered.length - shown.length })} onPress={() => setLooksShown((count) => count + LOOKS_PAGE)} />
            ) : null}
          </>
        )}
        {/* 12-Look / 13-RexTheme: "Ask Rex to design it", with the vibes to start from. */}
        <T weight="extrabold" style={{ fontSize: 16, marginTop: 20, marginBottom: 10 }}>{t("look.askRex")}</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {VIBES.map((key) => {
            const words = t(`look.vibe.${key}`);
            return <Chip key={key} label={words} on={vibe.trim() === words} onPress={() => setVibe(vibe.trim() === words ? "" : words)} />;
          })}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12, backgroundColor: colors.surface, borderRadius: 20, padding: 12 }}>
          <Mascot name="rex" size={40} />
          <TextInput
            value={vibe}
            onChangeText={setVibe}
            placeholder={t("look.askPlaceholder")}
            placeholderTextColor={colors.inkFaint}
            accessibilityLabel={t("look.askAria")}
            multiline
            maxLength={400}
            style={{ flex: 1, minHeight: 44, fontSize: 15, fontFamily: fonts.regular, color: colors.ink }}
          />
          <VoiceInput variant="icon" value={vibe} onChange={setVibe} language={lang} context="the look they want for their shop" />
        </View>
        {busy ? <T style={{ color: colors.inkSoft, textAlign: "center", marginTop: 12 }}>{t("look.building")}</T> : null}
      </>
    );
    footer = (
      <>
        {error ? <Notice>{error}</Notice> : null}
        <PillButton title={t("look.use")} busy={busy} onPress={() => void buildLook()} />
      </>
    );
  }

  if (question === "address") {
    body = (
      <>
        {title(t("address.title"), undefined, t("address.noRush"))}
        <View style={{ gap: 12 }}>
          {choice("free", t("address.free"), t("address.freeHint"), "globe", addressChoice === "free", () => setAddressChoice("free"))}
          {addressChoice === "free" ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 14 }}>
              <Label>{t("address.edit")}</Label>
              <Field value={slug} onChangeText={(value) => setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} autoCapitalize="none" autoCorrect={false} maxLength={40} />
              <T style={{ marginTop: 8, fontSize: 14, color: address?.problem ? colors.danger : colors.inkSoft }} accessibilityLiveRegion="polite">
                {checking ? t("address.checking") : address?.problem ? address.problem : `${address?.host ?? shopSlug(slug)} · ${t("address.available")}`}
              </T>
            </View>
          ) : null}
          {choice("have", t("address.have"), t("address.haveHint"), "link", addressChoice === "have", () => setAddressChoice("have"))}
          {addressChoice === "have" ? <Notice tone="info">{t("address.haveNote")}</Notice> : null}
        </View>
      </>
    );
    footer = (
      <>
        {error ? <Notice>{error}</Notice> : null}
        <PillButton title={addressChoice === "free" ? t("address.continueFree") : t("continue")} busy={busy} disabled={addressChoice === "free" && (checking || Boolean(address?.problem))} onPress={() => void saveStoreAddress()} />
      </>
    );
  }

  if (question === "live") {
    const host = (liveUrl ?? "").replace(/^https?:\/\//, "");
    body = live ? (
      <>
        <View style={{ alignItems: "center", gap: 12, marginTop: 12 }}>
          <Mascot name="rex" mood="wave" size={96} />
          <T accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 36, textAlign: "center" }}>{t("live.title")}</T>
          {name ? <T style={{ color: colors.inkSoft, fontSize: 15, lineHeight: 21, textAlign: "center" }}>{t("live.subPhone", { name })}</T> : null}
          {host ? <T selectable weight="bold" style={{ color: colors.forest, fontSize: 15 }}>{host}</T> : null}
        </View>
        <T weight="bold" style={{ fontSize: 15, marginTop: 28, marginBottom: 10 }}>{t("live.share")}</T>
        <View style={{ gap: 10 }}>
          <PillButton size="md" tone="forest" icon="chat" title={t("live.whatsapp")} onPress={() => void share("whatsapp")} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <PillButton size="md" tone="white" style={{ flex: 1 }} title={t("live.instagram")} onPress={() => void share("instagram")} />
            <PillButton size="md" tone="white" style={{ flex: 1 }} title={t("live.tiktok")} onPress={() => void share("tiktok")} />
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <PillButton size="md" tone="white" style={{ flex: 1 }} icon="copy" title={t("live.copy")} onPress={() => void share("copy")} />
            <PillButton size="md" tone="white" style={{ flex: 1 }} icon="share" title={t("live.share")} onPress={() => void share("more")} />
          </View>
          {shareNote ? <Notice tone="success">{shareNote}</Notice> : null}
        </View>
        {/* 15-Live: what to do next, each opening its screen over Home. */}
        <T weight="bold" style={{ fontSize: 15, marginTop: 24, marginBottom: 10 }}>{t("live.next")}</T>
        <List>
          <Row testID="live-next-bank" lead={<Tile icon="wallet" tone="peach" />} title={t("live.next.bank")} sub={t("live.next.bankSub")} onPress={() => void finish("/wallet")} />
          <Row testID="live-next-delivery" lead={<Tile icon="truck" tone="mint" />} title={t("live.next.delivery")} sub={t("live.next.deliverySub")} onPress={() => void finish("/delivery")} />
          <Row testID="live-next-products" lead={<Tile icon="camera" tone="blue" />} title={t("live.next.products")} sub={t("live.next.productsSub")} onPress={() => void finish("/add-products")} />
        </List>
      </>
    ) : (
      <>{title(liveProblem ? t("live.notYet", { reason: liveProblem }) : t("live.publishing"))}</>
    );
    footer = live ? (
      // Next: the link in bio step (onboarding/bio.tsx), which finishes onboarding and opens Home (skippable).
      <PillButton testID="live-continue" title={t("live.home")} busy={busy} onPress={() => router.push("/onboarding/bio")} />
    ) : liveProblem ? (
      <PillButton title={t("live.retry")} busy={busy} onPress={() => void goLive()} />
    ) : null;
  }

  return (
    <OnboardingFrame
      step="chat"
      progress={{ current: sellerQuestionNumber(question), total: SELLER_QUESTIONS.length }}
      onBack={previous && question !== "live" ? () => go(previous) : () => (router.canGoBack() ? router.back() : router.replace("/home"))}
      onSkip={skippable ? skip : null}
      footer={footer}
    >
      {body}
    </OnboardingFrame>
  );
}
