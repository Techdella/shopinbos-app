"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { cx, Mascot, Notice, PillButton, ProgressBars, Spinner, TextInput, Wordmark } from "@/components/app-ui";
import intentRouting from "@/lib/intent-routing";
import {
  addressFromName,
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
import { localeFromName } from "@shared/i18n";
import { useLocale, useSetLocale, useT } from "@/components/i18n/I18nProvider";
import {
  addSupplierPick,
  applyTheme,
  fetchThemeAccess,
  buildStore,
  checkAddress,
  createFirstProduct,
  drawLogos,
  fetchSellCategories,
  fetchSupplierPicks,
  finishOnboarding,
  publishStore,
  saveAddress,
  saveLogo,
  saveMemory,
  saveStoreName,
  searchDomains,
  uploadPicture,
  type DomainResult,
  type LogoIdea,
  type OnboardingStatus,
  type StoreAddress,
  type SupplierPick,
} from "./api";
import { friendlyError } from "@/lib/errors/report-client";
import { whatsappChatUrl } from "@/lib/support-contact";
import { PLAY_STORE_WEB_URL } from "@shared/app-release";
import { StorePreview } from "./StorePreview";
import { ThemePreviewDialog, ThemeThumbnail, TIER_BADGE } from "@/components/builder/theme-preview/ThemePreview";
import { ALL_THEMES_FREE } from "@shared/plans";
import { TIER_PLAN_LABEL } from "@/lib/theme-access";
import {
  chipForStoreCategory,
  filterThemes,
  isLibraryTheme,
  pickThemeByRules,
  themeCategoryChips,
  themeLibraryEntry,
  tierIncludes,
  THEME_LIBRARY,
  type ThemeChipId,
  type ThemeLibraryEntry,
} from "@/lib/store-templates/theme-library";

// Seller sign-up to a live store, one question per screen (shared/onboarding.ts SELLER_QUESTIONS): store name, logo,
// what you sell, products ready?, first product, its name and price, a look, the store address, then "Your store is
// live!". Each answer is saved as it's given and the screen is kept in the onboarding memory, so leaving and coming
// back opens the same question. No ID, bank or CAC here: the payout bank, delivery and the rest wait on Start here
// (/home/start), where the seller lands afterwards. The phone app follows the same rules (apps/mobile/src/app/onboarding).
// On the web the store fills in beside the questions as they're answered (./StorePreview.tsx).

const { extractIntentParams, getContinuationPath } = intentRouting;

/** Name, phone, code and "What brings you here?", answered at sign-up (src/components/auth): counted as done. */
const ACCOUNT_STEPS = 4;

/** Screens with a "Skip for now". */
const OPTIONAL: SellerQuestion[] = ["logo", "product", "details"];
/** Looks shown at a time on "Pick a look" (each card renders a real storefront). */
const LOOKS_PAGE = 8;

export function SellerOnboarding({ initialStatus }: { initialStatus: OnboardingStatus }) {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT("sellerStart", "common");
  const tb = useT("builder");
  const tSettings = useT("settings");
  const appLocale = useLocale();
  const setAppLocale = useSetLocale();
  const status = initialStatus;
  const memory = initialStatus.memory;

  const [question, setQuestion] = useState<SellerQuestion>(() => resumeSellerQuestion(memory?.screen));
  const [path, setPath] = useState<ProductPath | null>(memory?.productPath ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 1 Name
  const [storeName, setStoreName] = useState(status.store.name && !/'s Store$/.test(status.store.name) ? status.store.name : memory?.storeName ?? "");
  // 2 Logo
  const [logoMode, setLogoMode] = useState<"upload" | "rex" | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logos, setLogos] = useState<LogoIdea[]>([]);
  const [logoRound, setLogoRound] = useState(1);
  const [logoNotes, setLogoNotes] = useState("");
  const [logoUnavailable, setLogoUnavailable] = useState(false);
  // 3 What you sell
  const [categories, setCategories] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string[]>(memory?.categories ?? (memory?.category ? [memory.category] : []));
  // 5–6 First product
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [price, setPrice] = useState("");
  const [picks, setPicks] = useState<SupplierPick[] | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [termsFirst, setTermsFirst] = useState<Set<string>>(new Set());
  // 7 Look
  // The theme library (/builder/templates): the seller's own pick, else the one that suits what they sell.
  const [themeId, setThemeId] = useState<string>(() => (isLibraryTheme(memory?.templateId) ? memory!.templateId! : pickThemeByRules({ storeCategory: (memory?.categories ?? []).join(", ") || memory?.category }).themeId));
  const [themeChip, setThemeChip] = useState<ThemeChipId | null>(null);
  const [themesShown, setThemesShown] = useState(LOOKS_PAGE);
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null);
  const [themeAccess, setThemeAccess] = useState<{ tier: "basic" | "premium" | "platinum"; owned: string[] } | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [vibe, setVibe] = useState("");
  const [buildNote, setBuildNote] = useState<string | null>(null);
  // 8 Address
  const [addressChoice, setAddressChoice] = useState<"free" | "buy" | "have">("free");
  const [slug, setSlug] = useState(status.store.slug);
  const [address, setAddress] = useState<StoreAddress | null>(null);
  const [checking, setChecking] = useState(false);
  const [domainQuery, setDomainQuery] = useState("");
  const [domains, setDomains] = useState<DomainResult[] | null>(null);
  // 9 Live
  const [liveUrl, setLiveUrl] = useState(status.store.url);
  const [liveProblem, setLiveProblem] = useState<string | null>(null);
  const [live, setLive] = useState(status.store.live);
  const [shareNote, setShareNote] = useState<string | null>(null);

  const name = firstNameOf(status.ownerName);
  const description = useMemo(() => [storeName, chosen.length ? `sells ${chosen.join(", ")}` : ""].filter(Boolean).join(" "), [storeName, chosen]);

  function go(next: SellerQuestion | null, patch: Record<string, unknown> = {}) {
    setError(null);
    setBusy(false);
    if (!next) return;
    setQuestion(next);
    window.scrollTo({ top: 0 });
    void saveMemory({ screen: next, ...patch }).catch(() => null);
  }
  const forward = (patch: Record<string, unknown> = {}) => go(nextSellerQuestion(question, path), patch);

  function fail(cause: unknown) {
    setError(cause instanceof Error ? friendlyError(cause) : t("error.save"));
    setBusy(false);
  }

  /** Leaves for Start here, or for the marketplace action the seller signed up for. */
  async function finish() {
    setBusy(true);
    await finishOnboarding(live).catch(() => null);
    const intent = extractIntentParams(params);
    router.push(Object.keys(intent).length ? getContinuationPath({ role: "seller", ...intent }) : "/home/start");
  }

  // ── Loaders for the screens that need data ─────────────────────────────────
  useEffect(() => {
    if (question !== "sell" || categories.length) return;
    void fetchSellCategories().then((names) => setCategories(businessCategories(names)));
  }, [question, categories.length]);

  // "Pick a look": the plan's themes, the chip for what they sell, and (before they've picked) the theme that suits it.
  useEffect(() => {
    if (question !== "look") return;
    if (!themeAccess) void fetchThemeAccess().then((access) => access && setThemeAccess(access));
    if (themeChip === null) {
      const wanted = chipForStoreCategory(chosen.join(", "));
      setThemeChip(themeCategoryChips().some((chip) => chip.id === wanted) ? wanted : "all");
    }
    if (!isLibraryTheme(memory?.templateId)) setThemeId(pickThemeByRules({ storeCategory: chosen.join(", ") }).themeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  useEffect(() => {
    if (question !== "product" || path !== "dropship" || picks) return;
    void fetchSupplierPicks().then(setPicks).catch(() => setPicks([]));
  }, [question, path, picks]);

  useEffect(() => {
    if (question !== "address" || addressChoice !== "free") return;
    const wanted = shopSlug(slug);
    if (!wanted) return;
    setChecking(true);
    const timer = window.setTimeout(() => {
      void checkAddress(wanted)
        .then(setAddress)
        .catch(() => setAddress(null))
        .finally(() => setChecking(false));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [question, addressChoice, slug]);

  const published = useRef(false);
  useEffect(() => {
    if (question !== "live" || published.current) return;
    published.current = true;
    void goLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question]);

  // ── Answers ─────────────────────────────────────────────────────────────────
  async function saveName() {
    const value = storeName.trim();
    if (!value) return setError(t("name.needed"));
    setBusy(true);
    try {
      const saved = await saveStoreName(value);
      setSlug(saved.slug);
      // New stores default to "active"; they stay drafts until "Your store is live!" publishes them.
      await saveMemory({ storeName: value }, live ? { onboardingState: "BUILDING_REX" } : { onboardingState: "BUILDING_REX", status: "draft" });
      forward({ storeName: value });
    } catch (cause) {
      fail(cause);
    }
  }

  async function onLogoFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await uploadPicture(file, "brand");
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
      setLogos(await drawLogos({ businessName: storeName.trim() || status.store.name, businessDescription: description, round, notes: logoNotes.trim() || undefined }));
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
      forward({ logo: logoUrl ? { url: logoUrl, style: logoMode === "rex" ? "rex" : "upload" } : { style: "lettermark", label: lettermark(storeName) } });
    } catch (cause) {
      fail(cause);
    }
  }

  function toggleCategory(category: string) {
    setChosen((current) => (current.includes(category) ? current.filter((item) => item !== category) : [...current, category]));
  }

  function chooseReady(next: ProductPath) {
    setPath(next);
    go("product", { productPath: next });
  }

  async function onProductPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setPhotoUrl(await uploadPicture(file, "products"));
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

  async function saveProduct() {
    const amount = Number(price.replace(/[^\d.]/g, ""));
    if (!productName.trim()) return setError(t("details.needName"));
    if (!amount || amount <= 0) return setError(t("details.needPrice"));
    if (!photoUrl) return go("product");
    setBusy(true);
    try {
      await createFirstProduct({ name: productName, price: amount, imageUrl: photoUrl });
      forward();
    } catch (cause) {
      fail(cause);
    }
  }

  const theme = themeLibraryEntry(themeId) ?? THEME_LIBRARY[0];
  const { look, palette: lookPalette } = lookFromTheme(theme);
  // Until the plan is known every theme shows as usable; the server checks again when the look is applied.
  const lockedPlan = (entry: ThemeLibraryEntry) => (themeAccess && !tierIncludes(themeAccess.tier, entry.tier) && !themeAccess.owned.includes(entry.id) ? TIER_PLAN_LABEL[entry.tier] : null);

  async function buildLook(chosenThemeId: string = themeId) {
    const picked = themeLibraryEntry(chosenThemeId) ?? theme;
    const { look, palette: lookPalette } = lookFromTheme(picked);
    if (lockedPlan(picked)) return setError(t("look.locked", { plan: lockedPlan(picked) ?? "" }));
    setThemeId(picked.id);
    setPreviewThemeId(null);
    setBusy(true);
    setError(null);
    const [primary, accent, background] = lookPalette.swatches;
    await saveMemory({ templateId: picked.id, palette: { id: lookPalette.key, name: lookPalette.label, colors: { primary, accent, background } } }).catch(() => null);
    setBuildNote(t("look.building"));
    try {
      // The theme first (its pages and sections), then Rex's words and colours on it.
      await applyTheme(picked.id);
      // buildStore always saves a design: Rex's, or the plain name, colours and look when Rex is unavailable.
      await buildStore(
        { storeName: storeName.trim() || status.store.name, slug: slug, description, category: chosen[0], palette: lookPalette, look, tweak: vibe.trim() || undefined },
        (text) => setBuildNote(text.slice(-120)),
      );
      setBuildNote(null);
      forward({ templateId: picked.id });
    } catch (cause) {
      setBuildNote(null);
      fail(cause);
    }
  }

  async function saveStoreAddress() {
    setBusy(true);
    try {
      if (addressChoice === "free") {
        const wanted = shopSlug(slug);
        if (wanted && wanted !== status.store.slug) {
          const saved = await saveAddress(wanted);
          setLiveUrl(saved.url);
        } else if (address?.url) setLiveUrl(address.url);
      }
      forward();
    } catch (cause) {
      fail(cause);
    }
  }

  async function findDomains() {
    const query = domainQuery.trim() || addressFromName(storeName);
    if (!query) return;
    setBusy(true);
    setError(null);
    try {
      setDomains(await searchDomains(query));
    } catch (cause) {
      setDomains([]);
      fail(cause);
    } finally {
      setBusy(false);
    }
  }

  async function goLive() {
    setBusy(true);
    setLiveProblem(null);
    const problem = await publishStore().catch(() => t("error.save"));
    if (problem) setLiveProblem(problem);
    else setLive(true);
    setBusy(false);
  }

  async function share(app: "whatsapp" | "instagram" | "tiktok" | "copy") {
    const text = t("live.shareText", { name: storeName.trim() || status.store.name, url: liveUrl });
    if (app === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      return;
    }
    try {
      await navigator.clipboard.writeText(app === "copy" ? liveUrl : text);
    } catch {
      // Clipboard blocked: the link is on screen to copy by hand.
    }
    setShareNote(app === "copy" ? t("live.copied") : t("live.copiedFor", { app: app === "instagram" ? "Instagram" : "TikTok" }));
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  // Web layout (2026 "Web onboarding, seller"): a top bar with the progress (the account questions were answered at
  // sign-up, so they count as done), one question on the left with Back / Continue ("or press Enter"), and the store
  // filling in on the right as the seller answers. On narrow screens the preview hides and the buttons stick to the
  // bottom, as on the phone.
  const number = sellerQuestionNumber(question);
  const previous = previousSellerQuestion(question, path);
  const skippable = OPTIONAL.includes(question);
  const overall = ACCOUNT_STEPS + number;
  const totalSteps = ACCOUNT_STEPS + SELLER_QUESTIONS.length;

  function skip() {
    // Skipping the first product skips its name and price too.
    if (question === "product") return go("look");
    forward();
  }

  const title = (text: string, sub?: string, eyebrow?: string) => (
    <div className="mb-7">
      {eyebrow && <p className="m-0 mb-2.5 text-[13px] font-extrabold uppercase tracking-[0.06em] text-app-accent-ink">{eyebrow}</p>}
      <h1 className="m-0 font-app-display text-[32px] font-extrabold leading-[1.05] tracking-[-0.025em] sm:text-[44px]">{text}</h1>
      {sub && <p className="m-0 mt-3 text-[15px] leading-[1.5] text-app-ink-soft sm:text-[17px]">{sub}</p>}
    </div>
  );

  /** The main button of the screen (Enter presses it too), and an optional line above it. */
  let action: { label: string; onClick: () => void; disabled?: boolean } | null = null;
  let actionNote: ReactNode = null;

  const choice = (opts: { key: string; title: string; hint: string; icon: Parameters<typeof Icon>[0]["name"]; on?: boolean; onClick: () => void }) => (
    <button
      key={opts.key}
      type="button"
      onClick={opts.onClick}
      aria-pressed={opts.on}
      className={cx(
        "flex w-full items-center gap-4 rounded-[22px] border-2 p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink focus-visible:ring-offset-2",
        opts.on ? "border-app-accent bg-app-peach" : "border-app-line bg-white hover:border-app-line-strong",
      )}
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-mint text-app-forest"><Icon name={opts.icon} size={22} /></span>
      <span className="min-w-0">
        <span className="block text-[17px] font-extrabold">{opts.title}</span>
        <span className="block text-[14px] text-app-ink-soft">{opts.hint}</span>
      </span>
    </button>
  );

  const chipClass = (on: boolean) =>
    cx(
      "inline-flex min-h-[46px] items-center gap-1.5 rounded-full border-2 px-[18px] text-[15px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink focus-visible:ring-offset-2",
      on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
    );

  let body: ReactNode = null;

  if (question === "name") {
    body = (
      <>
        {title(name ? t("name.title", { name }) : t("name.titleNoName"), t("name.hint"), t("group.store"))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveName();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-bold text-app-ink-soft">{t("name.label")}</span>
            <TextInput autoFocus value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder={t("name.placeholder")} maxLength={60} className="h-[64px] border-2 border-app-ink text-[20px] font-bold" />
          </label>
        </form>
        {/* The app's language, picked once here (shared/i18n); Rex writes the store in it too. */}
        <div className="mt-8 flex flex-wrap gap-2">
          {ONBOARDING_LANGUAGES.map((item) => {
            const locale = localeFromName(item);
            return (
              <button
                key={item}
                type="button"
                lang={locale ?? undefined}
                aria-pressed={locale === appLocale}
                onClick={() => {
                  if (locale && locale !== appLocale) void setAppLocale(locale);
                }}
                className={cx("rounded-full border px-4 py-2 text-[14px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink", locale === appLocale ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
              >
                {item}
              </button>
            );
          })}
        </div>
        <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{tSettings("language.onboarding")}</p>
      </>
    );
    action = { label: t("continue"), onClick: () => void saveName(), disabled: !storeName.trim() };
  }

  if (question === "logo") {
    const ready = Boolean(logoUrl) || logoUnavailable;
    body = (
      <>
        {title(t("logo.title"))}
        <div className="grid gap-3">
          <label
            className={cx(
              "flex w-full cursor-pointer items-center gap-4 rounded-[22px] border-2 p-5 transition focus-within:ring-2 focus-within:ring-app-ink focus-within:ring-offset-2 hover:border-app-line-strong",
              logoMode === "upload" ? "border-app-accent bg-app-peach" : "border-app-line bg-white",
            )}
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-mint text-app-forest"><Icon name="upload" size={22} /></span>
            <span className="min-w-0">
              <span className="block text-[17px] font-extrabold">{t("logo.yes")}</span>
              <span className="block text-[14px] text-app-ink-soft">{t("logo.yesHint")}</span>
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={t("logo.upload")}
              onChange={(event) => {
                setLogoMode("upload");
                setLogos([]);
                void onLogoFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          {choice({ key: "rex", title: t("logo.no"), hint: t("logo.noHint"), icon: "sparkle", on: logoMode === "rex", onClick: () => void askForLogos(logoRound) })}
        </div>

        {logoMode === "upload" && logoUrl && (
          <div className="mt-5 flex items-center gap-4 rounded-[20px] border border-app-line bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="" className="h-16 w-16 rounded-[14px] object-contain" />
            <p className="m-0 text-[15px] font-bold">{t("logo.uploaded")}</p>
          </div>
        )}

        {logoMode === "rex" && (
          <div className="mt-5">
            {busy && !logos.length && (
              <p className="flex items-center gap-2 text-[15px] text-app-ink-soft" aria-live="polite"><Spinner className="h-4 w-4" /> {t("logo.drawing", { name: storeName.trim() || status.store.name })}</p>
            )}
            {logoUnavailable && (
              <div className="grid gap-3">
                <Notice tone="info">{t("logo.unavailable")}</Notice>
                <div className="flex items-center gap-4 rounded-[20px] border border-app-line bg-white p-4">
                  <span className="grid h-16 w-16 place-items-center rounded-[14px] bg-app-ink text-[22px] font-extrabold text-white">{lettermark(storeName)}</span>
                  <p className="m-0 text-[15px] font-bold">{t("logo.useInitials")}</p>
                </div>
              </div>
            )}
            {logos.length > 0 && (
              <>
                <p className="m-0 mb-3 text-[15px] text-app-ink-soft">{t("logo.pick")}</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {logos.map((logo, index) => (
                    <button
                      key={logo.url}
                      type="button"
                      onClick={() => setLogoUrl(logo.url)}
                      aria-pressed={logoUrl === logo.url}
                      aria-label={t("logo.option", { number: index + 1 })}
                      className={cx(
                        "relative aspect-square overflow-hidden rounded-[20px] border-[3px] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink focus-visible:ring-offset-2",
                        logoUrl === logo.url ? "border-app-accent shadow-[0_0_0_3px_var(--color-app-peach)]" : "border-app-line",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logo.url} alt="" className="h-full w-full object-contain" />
                      {logoUrl === logo.url && <span className="absolute right-2 top-2 rounded-full bg-app-ink px-2.5 py-1 text-[12px] font-bold text-white">{t("logo.chosen")}</span>}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-full border border-app-line bg-white py-1.5 pl-5 pr-1.5 focus-within:border-app-ink">
                  <input
                    value={logoNotes}
                    onChange={(event) => setLogoNotes(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter here redraws the logos instead of moving on.
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      if (logoNotes.trim() && !busy) void askForLogos(logoRound);
                    }}
                    placeholder={t("logo.changePlaceholder")}
                    aria-label={t("logo.changeAria")}
                    className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-app-ink-faint"
                  />
                  <PillButton size="sm" tone="forest" busy={busy} disabled={!logoNotes.trim()} onClick={() => void askForLogos(logoRound)}>{t("logo.redo")}</PillButton>
                </div>
                <button type="button" disabled={busy} onClick={() => void askForLogos(logoRound + 1)} className="mt-3 text-[14px] font-bold text-app-ink underline underline-offset-4">
                  {t("logo.more")}
                </button>
              </>
            )}
          </div>
        )}
      </>
    );
    action = { label: t("continue"), onClick: () => void confirmLogo(), disabled: !ready };
  }

  if (question === "sell") {
    body = (
      <>
        {title(t("sell.title"), t("sell.hint"))}
        {!categories.length ? (
          <Spinner className="h-6 w-6 text-app-ink-soft" />
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {categories.map((category) => (
              <button key={category} type="button" aria-pressed={chosen.includes(category)} onClick={() => toggleCategory(category)} className={chipClass(chosen.includes(category))}>
                {chosen.includes(category) && <Icon name="check" size={14} className="shrink-0" />}
                <span>{category}</span>
              </button>
            ))}
          </div>
        )}
      </>
    );
    action = { label: t("continue"), onClick: () => (chosen.length ? forward({ categories: chosen, category: chosen[0] }) : setError(t("sell.needed"))), disabled: !chosen.length };
  }

  if (question === "ready") {
    body = (
      <>
        {title(t("ready.title"))}
        <div className="grid gap-3">
          {choice({ key: "own", title: t("ready.own"), hint: t("ready.ownHint"), icon: "image", on: path === "own", onClick: () => chooseReady("own") })}
          {choice({ key: "dropship", title: t("ready.dropship"), hint: t("ready.dropshipHint"), icon: "truck", on: path === "dropship", onClick: () => chooseReady("dropship") })}
        </div>
      </>
    );
  }

  if (question === "product" && path !== "dropship") {
    body = (
      <>
        {title(t("product.title"))}
        {photoUrl ? (
          <div className="max-w-[420px] overflow-hidden rounded-[24px] border border-app-line bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="" className="aspect-square w-full object-cover" />
            <p className="m-0 p-4 text-[15px] font-bold">{t("product.photoReady")}</p>
          </div>
        ) : (
          <label className="grid aspect-[4/3] max-w-[520px] cursor-pointer place-items-center rounded-[24px] border-2 border-dashed border-app-line-strong bg-app-canvas text-center focus-within:ring-2 focus-within:ring-app-ink focus-within:ring-offset-2">
            <span>
              {busy ? <Spinner className="h-7 w-7" /> : <Icon name="image" size={36} />}
              <span className="mt-3 block text-[17px] font-extrabold">{busy ? t("product.uploading") : t("product.snap")}</span>
            </span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label={t("product.snap")} onChange={(event) => void onProductPhoto(event.target.files?.[0])} />
          </label>
        )}
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-[14px] font-bold text-app-ink-soft focus-within:text-app-ink hover:text-app-ink">
          <Icon name="upload" size={16} /> {photoUrl ? t("product.retake") : t("product.gallery")}
          <input type="file" accept="image/*" className="sr-only" aria-label={t("product.gallery")} onChange={(event) => void onProductPhoto(event.target.files?.[0])} />
        </label>
      </>
    );
    action = { label: t("continue"), onClick: () => (photoUrl ? forward() : setError(t("product.needPhoto"))), disabled: !photoUrl };
  }

  if (question === "product" && path === "dropship") {
    body = (
      <>
        {title(t("product.dropshipTitle"), t("product.dropshipHint"))}
        {picks === null ? (
          <p className="flex items-center gap-2 text-[15px] text-app-ink-soft"><Spinner className="h-4 w-4" /> {t("product.loading")}</p>
        ) : !picks.length ? (
          <Notice tone="info">{t("product.none")}</Notice>
        ) : (
          <div className="-mx-[18px] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
            {picks.map((pick) => {
              const sell = suggestedRetailPrice(pick.price) || pick.price;
              return (
                <div key={pick.id} className="w-[82%] shrink-0 snap-center overflow-hidden rounded-[24px] border border-app-line bg-white sm:w-auto">
                  {pick.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pick.imageUrl} alt="" className="aspect-square w-full object-cover" />
                  ) : (
                    <div className="grid aspect-square w-full place-items-center bg-app-lilac"><Icon name="package" size={40} /></div>
                  )}
                  <div className="p-4">
                    <p className="m-0 text-[17px] font-extrabold leading-tight">{pick.name}</p>
                    <p className="m-0 mt-1 text-[13px] text-app-ink-soft">{pick.supplier} · {t("product.cost", { price: naira(pick.price) })}</p>
                    <p className="m-0 mt-1 text-[14px] font-bold">{t("product.yourPrice", { price: naira(sell) })}</p>
                    {termsFirst.has(pick.id) ? (
                      <p className="m-0 mt-3 text-[13px] text-app-ink-soft">{t("product.checkFirst")}</p>
                    ) : (
                      <PillButton size="md" className="mt-3 w-full" tone={added.has(pick.id) ? "white" : "ink"} disabled={added.has(pick.id)} onClick={() => void addPick(pick)}>
                        {added.has(pick.id) ? <><Icon name="check" size={16} /> {t("product.added")}</> : <><Icon name="plus" size={16} /> {t("product.add")}</>}
                      </PillButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {added.size > 0 && <p className="m-0 mt-3 text-[14px] font-bold text-app-forest">{t("product.addedCount", { count: added.size })}</p>}
      </>
    );
    action = { label: t("continue"), onClick: () => forward(), disabled: !added.size };
  }

  if (question === "details") {
    body = (
      <>
        {title(t("details.title"))}
        <form
          className="grid max-w-[520px] gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveProduct();
          }}
        >
          <label className="block">
            <span className="mb-2 block text-[14px] font-bold">{t("details.name")}</span>
            <TextInput autoFocus value={productName} onChange={(event) => setProductName(event.target.value)} placeholder={t("details.namePlaceholder")} maxLength={120} />
          </label>
          <label className="block">
            <span className="mb-2 block text-[14px] font-bold">{t("details.price")}</span>
            <TextInput inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value.replace(/[^\d]/g, ""))} placeholder={t("details.pricePlaceholder")} />
          </label>
          <button type="submit" className="sr-only">{t("continue")}</button>
        </form>
      </>
    );
    action = { label: t("continue"), onClick: () => void saveProduct(), disabled: !productName.trim() || !price };
  }

  if (question === "look") {
    const brand = { name: storeName.trim() || status.store.name, logoUrl };
    const chips = themeCategoryChips();
    const inChip = filterThemes(themeChip ?? "all");
    // The picked theme first, then the rest of the chip.
    const ordered = [theme, ...inChip.filter((entry) => entry.id !== theme.id)];
    const shown = ordered.slice(0, themesShown);
    const locked = lockedPlan(theme);
    body = (
      <>
        {title(t("look.title"), t("look.hintLibrary", { count: THEME_LIBRARY.length }))}
        <div className="-mx-[18px] mb-4 flex gap-2 overflow-x-auto px-[18px] pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={(themeChip ?? "all") === chip.id}
              onClick={() => {
                setThemeChip(chip.id);
                setThemesShown(LOOKS_PAGE);
              }}
              className={cx(chipClass((themeChip ?? "all") === chip.id), "min-h-[40px] shrink-0 whitespace-nowrap px-4 text-[14px]")}
            >
              {chip.id === "all" ? t("look.all") : tb.dynamic(`chipf.${chip.id}`, chip.label)}
            </button>
          ))}
        </div>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:gap-4">
          {shown.map((entry) => {
            const selected = entry.id === theme.id;
            const entryLocked = lockedPlan(entry);
            return (
              <li key={entry.id} className={cx("relative flex flex-col overflow-hidden rounded-[18px] border-2 bg-white", selected ? "border-app-ink" : "border-app-line")}>
                {/* The preview is a whole storefront (links, buttons), so the select button sits over it, never around it. */}
                <ThemeThumbnail themeId={entry.id} brand={brand} className="rounded-t-[16px]" />
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={t("look.pick", { name: entry.name })}
                  onClick={() => setThemeId(entry.id)}
                  className="absolute inset-0 z-[1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-app-ink"
                />
                {selected && (
                  <span className="pointer-events-none absolute left-2 top-2 z-[2] inline-flex items-center gap-1 rounded-full bg-app-ink px-2.5 py-1 text-[12px] font-bold text-white">
                    <Icon name="check" size={12} className="shrink-0" /> {t("look.selected")}
                  </span>
                )}
                {!ALL_THEMES_FREE && entry.tier !== "basic" && (
                  <span className={cx("pointer-events-none absolute right-2 top-2 z-[2] inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", TIER_BADGE[entry.tier])}>
                    {entryLocked ? <Icon name="lock" size={11} className="shrink-0" /> : null}
                    {tb(`tl.tier.${entry.tier}`)}
                  </span>
                )}
                <div className="relative z-[2] flex flex-1 flex-col gap-1 p-3 pointer-events-none">
                  <span className="truncate text-[15px] font-extrabold">{entry.name}</span>
                  <span className="line-clamp-2 text-[12.5px] leading-[1.35] text-app-ink-soft">{tb.dynamic(`theme.${entry.id}.meaning`, entry.meaning)}</span>
                  <button
                    type="button"
                    onClick={() => setPreviewThemeId(entry.id)}
                    className="pointer-events-auto mt-1 inline-flex min-h-[36px] w-fit items-center gap-1.5 rounded-full border border-app-line bg-white px-3 text-[13px] font-bold hover:border-app-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink"
                  >
                    <Icon name="eye" size={14} className="shrink-0" /> {t("look.preview")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {ordered.length > shown.length && (
          <button type="button" onClick={() => setThemesShown((count) => count + LOOKS_PAGE)} className="mx-auto mt-4 inline-flex min-h-[44px] items-center rounded-full border-2 border-app-line bg-white px-5 text-[15px] font-bold hover:border-app-line-strong">
            {t("look.more", { count: ordered.length - shown.length })}
          </button>
        )}
        {locked && <p className="m-0 mt-3 text-[14px] text-app-ink-soft">{t("look.locked", { plan: locked })}</p>}
        {previewThemeId && (
          <ThemePreviewDialog
            themeId={previewThemeId}
            brand={brand}
            onClose={() => setPreviewThemeId(null)}
            useOwn={false}
            onUseOwnChange={() => {}}
            isCurrent={false}
            busy={busy}
            lockedPlan={(() => {
              const entry = themeLibraryEntry(previewThemeId);
              return entry ? lockedPlan(entry) : null;
            })()}
            onUse={() => void buildLook(previewThemeId)}
          />
        )}
        {askOpen ? (
          <div className="mt-4 flex items-start gap-3 rounded-[20px] border border-app-line bg-white p-3 focus-within:border-app-ink">
            <Mascot name="rex" className="h-10 w-10 shrink-0" alt="Rex" />
            <textarea
              autoFocus
              value={vibe}
              onChange={(event) => setVibe(event.target.value)}
              placeholder={t("look.askPlaceholder")}
              aria-label={t("look.askAria")}
              rows={3}
              maxLength={400}
              className="min-w-0 flex-1 resize-none bg-transparent text-[15px] outline-none placeholder:text-app-ink-faint"
            />
          </div>
        ) : (
          <button type="button" onClick={() => setAskOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-full border border-app-line bg-white px-5 py-3 text-[15px] font-bold">
            <Icon name="sparkle" size={16} /> {t("look.ask")}
          </button>
        )}
      </>
    );
    actionNote = busy && buildNote ? <p className="m-0 mb-3 text-[13px] text-app-ink-soft" aria-live="polite">{buildNote}</p> : null;
    action = { label: t("look.use"), onClick: () => void buildLook(), disabled: Boolean(locked) };
  }

  if (question === "address") {
    const freeHost = address?.host ?? `${shopSlug(slug)}`;
    body = (
      <>
        {title(t("address.title"), t("address.hint"))}
        <div className="grid gap-3">
          {choice({ key: "free", title: t("address.free"), hint: t("address.freeHint"), icon: "globe", on: addressChoice === "free", onClick: () => setAddressChoice("free") })}
          {addressChoice === "free" && (
            <div className="rounded-[20px] bg-app-canvas p-4">
              <label className="block">
                <span className="mb-2 block text-[14px] font-bold">{t("address.edit")}</span>
                <TextInput value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} maxLength={40} aria-describedby="address-state" />
              </label>
              <p id="address-state" className="m-0 mt-2 text-[14px]" aria-live="polite">
                {checking ? (
                  <span className="text-app-ink-soft">{t("address.checking")}</span>
                ) : address?.problem ? (
                  <span className="text-app-danger">{address.problem}</span>
                ) : (
                  <span><span className="font-mono font-bold">{freeHost}</span> · <span className="text-app-forest">{t("address.available")}</span></span>
                )}
              </p>
            </div>
          )}
          {choice({ key: "buy", title: t("address.buy"), hint: t("address.buyHint", { name: addressFromName(storeName) || "yourstore" }), icon: "search", on: addressChoice === "buy", onClick: () => setAddressChoice("buy") })}
          {addressChoice === "buy" && (
            <div className="rounded-[20px] bg-app-canvas p-4">
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void findDomains();
                }}
              >
                <TextInput value={domainQuery} onChange={(event) => setDomainQuery(event.target.value)} placeholder={addressFromName(storeName) || t("address.searchPlaceholder")} aria-label={t("address.searchPlaceholder")} />
                <PillButton type="submit" size="md" busy={busy}>{t("address.search")}</PillButton>
              </form>
              {domains && (
                <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                  {domains.slice(0, 6).map((domain) => (
                    <li key={domain.domain} className="flex items-center justify-between gap-3 rounded-[14px] bg-white px-4 py-3">
                      <span className="min-w-0 truncate font-mono text-[14px] font-bold">{domain.domain}</span>
                      <span className="shrink-0 text-[13px] text-app-ink-soft">
                        {!domain.available ? t("address.taken") : domain.free ? t("address.freeWithPlan") : domain.price ? naira(domain.price) : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="m-0 mt-3 text-[13px] text-app-ink-soft">{t("address.buyOnWeb")}</p>
            </div>
          )}
          {choice({ key: "have", title: t("address.have"), hint: t("address.haveHint"), icon: "link", on: addressChoice === "have", onClick: () => setAddressChoice("have") })}
          {addressChoice === "have" && <Notice tone="info">{t("address.haveNote")}</Notice>}
        </div>
      </>
    );
    action = { label: t("address.launch"), onClick: () => void saveStoreAddress(), disabled: addressChoice === "free" && (checking || Boolean(address?.problem)) };
  }

  if (question === "live") {
    const host = liveUrl.replace(/^https?:\/\//, "");
    if (!live) {
      body = (
        <>
          {title(liveProblem ? t("live.notYet", { reason: liveProblem }) : t("live.publishing"))}
          {!liveProblem && <Spinner className="h-7 w-7" />}
        </>
      );
      if (liveProblem) action = { label: t("live.retry"), onClick: () => void goLive() };
    } else {
      body = (
        <>
          <div className="flex flex-col items-start gap-4">
            <span aria-hidden className="grid h-[76px] w-[76px] place-items-center rounded-full bg-app-success text-white"><Icon name="check" size={36} strokeWidth={2.8} /></span>
            <h1 className="m-0 text-[32px] font-extrabold leading-[1.08] tracking-[-0.025em] sm:text-[40px]">{t("live.title")}</h1>
            <p className="m-0 text-[15px] leading-[1.5] text-app-ink-soft sm:text-[17px]">{t("live.sub", { name: name || storeName.trim() || status.store.name })}</p>
            <a href={liveUrl} target="_blank" rel="noreferrer" className="break-all font-mono text-[15px] font-bold text-app-forest underline underline-offset-4">{host}</a>
          </div>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <a href={PLAY_STORE_WEB_URL} target="_blank" rel="noopener noreferrer" className={chipClass(false)}><Icon name="phone" size={16} /> {t("live.getApp")}</a>
            <button type="button" onClick={() => void share("copy")} className={chipClass(false)}><Icon name="copy" size={16} /> {t("live.copy")}</button>
          </div>
          <h2 className="mb-3 mt-8 text-[15px] font-bold">{t("live.share")}</h2>
          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
            <PillButton size="md" tone="forest" onClick={() => void share("whatsapp")}><Icon name="whatsapp" size={16} /> {t("live.whatsapp")}</PillButton>
            <PillButton size="md" tone="white" onClick={() => void share("instagram")}><Icon name="instagram" size={16} /> {t("live.instagram")}</PillButton>
            <PillButton size="md" tone="white" onClick={() => void share("tiktok")}><Icon name="tiktok" size={16} /> {t("live.tiktok")}</PillButton>
          </div>
          {shareNote && <div className="mt-3"><Notice tone="success">{shareNote}</Notice></div>}
          <p className="m-0 mt-5 text-[13px] text-app-ink-soft">{t("live.later")}</p>
        </>
      );
      action = { label: t("live.dashboard"), onClick: () => void finish() };
    }
  }

  // Enter presses the screen's main button, unless the cursor is in a form (it submits itself), a text area or a button.
  const enterAction = useRef<(() => void) | null>(null);
  const enterTarget = action && !action.disabled && !busy ? action.onClick : null;
  useEffect(() => {
    enterAction.current = enterTarget;
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.defaultPrevented) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target && (target.closest("form, button, a, textarea, select, [role=button]") || target.isContentEditable)) return;
      const run = enterAction.current;
      if (!run) return;
      event.preventDefault();
      run();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── The preview, from the answers so far ────────────────────────────────────
  const at = (screen: SellerQuestion) => number >= sellerQuestionNumber(screen);
  const previewName = storeName.trim() || (/'s Store$/.test(status.store.name) ? t("preview.yourStore") : status.store.name);
  const previewSlug = question === "name" ? addressFromName(storeName) || shopSlug(slug) : shopSlug(slug) || status.store.slug;
  const previewHost = question === "live" ? liveUrl.replace(/^https?:\/\//, "") : address?.host ?? liveUrl.replace(/^https?:\/\//, "").replace(status.store.slug, previewSlug);
  const themed = at("look") || Boolean(memory?.templateId);
  const tiles = [
    ...(photoUrl ? [{ key: "own", imageUrl: photoUrl, label: productName.trim() || undefined }] : []),
    ...(picks ?? []).filter((pick) => added.has(pick.id)).map((pick) => ({ key: pick.id, imageUrl: pick.imageUrl, label: pick.name })),
  ];

  const header = (
    <header className="sticky top-0 z-20 border-b border-app-line bg-white/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-[18px] py-3 sm:px-8 sm:py-4">
        <Wordmark className="!h-4 sm:!h-5" />
        <div className="order-3 w-full sm:order-none sm:mx-auto sm:w-auto sm:max-w-[520px] sm:flex-1">
          <div className="mb-1.5 flex justify-between gap-3 text-[12px] font-extrabold uppercase tracking-[0.05em] text-app-ink-soft">
            <span>{t("group.store")}</span>
            <span className="normal-case">{t("count", { current: overall, total: totalSteps })}</span>
          </div>
          <ProgressBars tone="accent" total={totalSteps} current={overall - 1} />
        </div>
        <a
          href={whatsappChatUrl(t("helpMessage"))}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex min-h-[44px] items-center gap-2 rounded-full px-1 text-[14px] font-bold text-app-ink no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-ink sm:ml-0"
        >
          <Icon name="whatsapp" size={18} /> {t("help")}
        </a>
      </div>
    </header>
  );

  const showBack = Boolean(previous) && question !== "live";
  const nav = (action || showBack || skippable || error) && (
    <div className="sticky bottom-0 z-10 -mx-[18px] mt-auto bg-gradient-to-t from-white via-white to-transparent px-[18px] pb-[18px] pt-6 sm:static sm:mx-0 sm:bg-none sm:px-0 sm:pb-12 sm:pt-10">
      {error && <div className="mb-3"><Notice>{error}</Notice></div>}
      {actionNote}
      <div className="flex flex-wrap items-center gap-3">
        {showBack && previous && (
          <PillButton tone="white" disabled={busy} onClick={() => go(previous)} className="border-2 font-extrabold">
            {t("back")}
          </PillButton>
        )}
        {action && (
          <PillButton tone="orange" busy={busy} disabled={action.disabled} onClick={action.onClick} className="min-w-0 flex-1 text-[17px] font-extrabold sm:flex-none sm:px-8">
            {action.label}
          </PillButton>
        )}
        {action && <span className="hidden text-[13px] text-app-ink-soft md:inline">{t("enterHint")}</span>}
        {skippable && (
          <button type="button" onClick={skip} disabled={busy} className="min-h-[44px] text-[14px] font-bold text-app-ink-soft underline-offset-4 hover:text-app-ink hover:underline sm:ml-auto">
            {t("skip")}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-white font-app text-app-ink">
      {header}
      <div className="flex flex-1 flex-col lg:flex-row">
        <main className="flex w-full min-w-0 flex-col px-[18px] pt-8 sm:px-[clamp(20px,5vw,72px)] sm:pt-14 lg:max-w-[680px] lg:flex-1">
          <div className="flex flex-1 flex-col">{body}</div>
          {nav}
        </main>
        <aside className="hidden min-w-0 flex-1 items-center justify-center bg-app-canvas px-[clamp(16px,4vw,56px)] py-10 lg:flex">
          {question === "look" ? (
            // The picked theme itself, with their name and logo on its sample store.
            <div className="w-full max-w-[560px]">
              <div className="overflow-hidden rounded-[22px] border border-app-line bg-white shadow-[0_10px_40px_rgba(22,20,31,.10)]">
                <ThemeThumbnail key={theme.id} themeId={theme.id} brand={{ name: previewName, logoUrl }} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] font-extrabold">{theme.name} <span className="font-semibold text-app-ink-soft">· {tb.dynamic(`theme.${theme.id}.meaning`, theme.meaning)}</span></span>
                <PillButton size="sm" tone="white" onClick={() => setPreviewThemeId(theme.id)}><Icon name="eye" size={14} className="shrink-0" /> {t("look.preview")}</PillButton>
              </div>
            </div>
          ) : (
          <StorePreview
            host={previewHost}
            storeName={previewName}
            logoUrl={logoUrl}
            lettermark={at("sell") ? lettermark(previewName) : null}
            categories={at("sell") || question === "sell" ? chosen : []}
            look={themed ? look : null}
            palette={themed ? lookPalette : null}
            heroText={chosen.length ? t("preview.newIn", { category: chosen[0] }) : t("preview.hero")}
            tiles={tiles}
            live={question === "live" && live}
            labels={{ heading: t("preview.heading"), live: t("preview.live"), aria: t("preview.aria"), logo: t("preview.logo"), shopNow: t("look.shopNow") }}
          />
          )}
        </aside>
      </div>
    </div>
  );
}
