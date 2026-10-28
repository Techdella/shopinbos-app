"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { BackButton, cx, Mascot, Notice, PillButton, ProgressBars, Spinner, TextInput } from "@/components/app-ui";
import intentRouting from "@/lib/intent-routing";
import {
  addressFromName,
  BRAND_LOOKS,
  BRAND_PALETTES,
  businessCategories,
  firstNameOf,
  lettermark,
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

// Seller sign-up to a live store, one question per screen (shared/onboarding.ts SELLER_QUESTIONS): store name, logo,
// what you sell, products ready?, first product, its name and price, a look, the store address, then "Your store is
// live!". Each answer is saved as it's given and the screen is kept in the onboarding memory, so leaving and coming
// back opens the same question. No ID, bank or CAC here: the payout bank, delivery and the rest wait on Start here
// (/home/start), where the seller lands afterwards. The phone app follows the same rules (apps/mobile/src/app/onboarding).

const { extractIntentParams, getContinuationPath } = intentRouting;

/** Screens with a "Skip for now". */
const OPTIONAL: SellerQuestion[] = ["logo", "product", "details"];

export function SellerOnboarding({ initialStatus }: { initialStatus: OnboardingStatus }) {
  const router = useRouter();
  const params = useSearchParams();
  const t = useT("sellerStart", "common");
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
  const [lookIndex, setLookIndex] = useState(Math.max(0, BRAND_LOOKS.findIndex((look) => look.templateId === memory?.templateId)));
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

  const look = BRAND_LOOKS[lookIndex] ?? BRAND_LOOKS[0];
  const lookPalette = BRAND_PALETTES[lookIndex % BRAND_PALETTES.length];

  async function buildLook() {
    setBusy(true);
    setError(null);
    const [primary, accent, background] = lookPalette.swatches;
    await saveMemory({ templateId: look.templateId, palette: { id: lookPalette.key, name: lookPalette.label, colors: { primary, accent, background } } }).catch(() => null);
    setBuildNote(t("look.building"));
    try {
      // buildStore always saves a design: Rex's, or the plain name, colours and look when Rex is unavailable.
      await buildStore(
        { storeName: storeName.trim() || status.store.name, slug: slug, description, category: chosen[0], palette: lookPalette, look, tweak: vibe.trim() || undefined },
        (text) => setBuildNote(text.slice(-120)),
      );
      setBuildNote(null);
      forward({ templateId: look.templateId });
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
  const number = sellerQuestionNumber(question);
  const previous = previousSellerQuestion(question, path);
  const skippable = OPTIONAL.includes(question);

  function skip() {
    // Skipping the first product skips its name and price too.
    if (question === "product") return go("look");
    forward();
  }

  const header = (
    <div className="sticky top-0 z-20 -mx-[18px] mb-6 bg-app-canvas/90 px-[18px] py-3 backdrop-blur">
      <div className="flex items-center gap-4">
        {previous && question !== "live" ? <BackButton label={t("back")} onClick={() => go(previous)} /> : <span className="h-11 w-11 shrink-0" aria-hidden />}
        <ProgressBars total={SELLER_QUESTIONS.length} current={number - 1} />
        {skippable ? (
          <button type="button" onClick={skip} disabled={busy} className="shrink-0 text-[14px] font-bold text-app-ink-soft hover:text-app-ink">
            {t("skip")}
          </button>
        ) : (
          <span className="w-11 shrink-0" aria-hidden />
        )}
      </div>
      <p className="m-0 mt-2 text-center font-mono text-[11px] uppercase tracking-[0.16em] text-app-ink-soft">{t("step", { current: number, total: SELLER_QUESTIONS.length })}</p>
    </div>
  );

  const title = (text: string, sub?: string) => (
    <div className="mb-6">
      <h1 className="m-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.6px]">{text}</h1>
      {sub && <p className="m-0 mt-2 text-[15px] text-app-ink-soft">{sub}</p>}
    </div>
  );

  const footer = (children: ReactNode) => (
    <div className="sticky bottom-0 z-10 -mx-[18px] mt-auto bg-gradient-to-t from-app-canvas via-app-canvas to-transparent px-[18px] pb-[18px] pt-6">
      {error && <div className="mb-3"><Notice>{error}</Notice></div>}
      {children}
    </div>
  );

  const continueButton = (onClick: () => void, disabled = false) => footer(
    <PillButton className="w-full" busy={busy} disabled={disabled} onClick={onClick}>{t("continue")}</PillButton>,
  );

  const choice = (opts: { key: string; title: string; hint: string; icon: Parameters<typeof Icon>[0]["name"]; on?: boolean; onClick: () => void }) => (
    <button
      key={opts.key}
      type="button"
      onClick={opts.onClick}
      aria-pressed={opts.on}
      className={cx("flex w-full items-center gap-4 rounded-[22px] border-2 bg-white p-5 text-left transition hover:border-app-line-strong", opts.on ? "border-app-ink" : "border-transparent")}
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-app-mint text-app-forest"><Icon name={opts.icon} size={22} /></span>
      <span className="min-w-0">
        <span className="block text-[17px] font-extrabold">{opts.title}</span>
        <span className="block text-[14px] text-app-ink-soft">{opts.hint}</span>
      </span>
    </button>
  );

  let body: ReactNode = null;

  if (question === "name") {
    body = (
      <>
        {title(name ? t("name.title", { name }) : t("name.titleNoName"), t("name.hint"))}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveName();
          }}
        >
          <TextInput autoFocus value={storeName} onChange={(event) => setStoreName(event.target.value)} placeholder={t("name.placeholder")} aria-label={t("name.titleNoName")} maxLength={60} className="h-[60px] text-[20px] font-bold" />
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
                className={cx("rounded-full border px-4 py-2 text-[14px] font-bold transition", locale === appLocale ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
              >
                {item}
              </button>
            );
          })}
        </div>
        <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{tSettings("language.onboarding")}</p>
        {continueButton(() => void saveName(), !storeName.trim())}
      </>
    );
  }

  if (question === "logo") {
    const ready = Boolean(logoUrl) || logoUnavailable;
    body = (
      <>
        {title(t("logo.title"))}
        <div className="grid gap-3">
          <label className={cx("flex w-full cursor-pointer items-center gap-4 rounded-[22px] border-2 bg-white p-5 transition hover:border-app-line-strong", logoMode === "upload" ? "border-app-ink" : "border-transparent")}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-app-mint text-app-forest"><Icon name="upload" size={22} /></span>
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
          <div className="mt-5 flex items-center gap-4 rounded-[20px] bg-white p-4">
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
                <div className="flex items-center gap-4 rounded-[20px] bg-white p-4">
                  <span className="grid h-16 w-16 place-items-center rounded-[14px] bg-app-ink text-[22px] font-extrabold text-white">{lettermark(storeName)}</span>
                  <p className="m-0 text-[15px] font-bold">{t("logo.useInitials")}</p>
                </div>
              </div>
            )}
            {logos.length > 0 && (
              <>
                <p className="m-0 mb-3 text-[15px] text-app-ink-soft">{t("logo.pick")}</p>
                <div className="grid grid-cols-2 gap-3">
                  {logos.map((logo, index) => (
                    <button
                      key={logo.url}
                      type="button"
                      onClick={() => setLogoUrl(logo.url)}
                      aria-pressed={logoUrl === logo.url}
                      aria-label={t("logo.option", { number: index + 1 })}
                      className={cx("relative aspect-square overflow-hidden rounded-[20px] border-2 bg-white", logoUrl === logo.url ? "border-app-ink" : "border-transparent")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logo.url} alt="" className="h-full w-full object-contain" />
                      {logoUrl === logo.url && <span className="absolute right-2 top-2 rounded-full bg-app-ink px-2.5 py-1 text-[12px] font-bold text-white">{t("logo.chosen")}</span>}
                    </button>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-full bg-white py-1.5 pl-5 pr-1.5">
                  <input
                    value={logoNotes}
                    onChange={(event) => setLogoNotes(event.target.value)}
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
        {continueButton(() => void confirmLogo(), !ready)}
      </>
    );
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
              <button
                key={category}
                type="button"
                aria-pressed={chosen.includes(category)}
                onClick={() => toggleCategory(category)}
                className={cx("rounded-full px-5 py-3 text-[15px] font-bold transition", chosen.includes(category) ? "bg-app-ink text-white" : "bg-white text-app-ink hover:bg-app-lilac")}
              >
                {chosen.includes(category) && <Icon name="check" size={14} />} {category}
              </button>
            ))}
          </div>
        )}
        {continueButton(() => (chosen.length ? forward({ categories: chosen, category: chosen[0] }) : setError(t("sell.needed"))), !chosen.length)}
      </>
    );
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
          <div className="overflow-hidden rounded-[24px] bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="" className="aspect-square w-full object-cover" />
            <p className="m-0 p-4 text-[15px] font-bold">{t("product.photoReady")}</p>
          </div>
        ) : (
          <label className="grid aspect-[4/3] cursor-pointer place-items-center rounded-[24px] border-2 border-dashed border-app-line-strong bg-white text-center">
            <span>
              {busy ? <Spinner className="h-7 w-7" /> : <Icon name="image" size={36} />}
              <span className="mt-3 block text-[17px] font-extrabold">{busy ? t("product.uploading") : t("product.snap")}</span>
            </span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label={t("product.snap")} onChange={(event) => void onProductPhoto(event.target.files?.[0])} />
          </label>
        )}
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-[14px] font-bold text-app-ink-soft hover:text-app-ink">
          <Icon name="upload" size={16} /> {photoUrl ? t("product.retake") : t("product.gallery")}
          <input type="file" accept="image/*" className="sr-only" aria-label={t("product.gallery")} onChange={(event) => void onProductPhoto(event.target.files?.[0])} />
        </label>
        {continueButton(() => (photoUrl ? forward() : setError(t("product.needPhoto"))), !photoUrl)}
      </>
    );
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
          <div className="-mx-[18px] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-2">
            {picks.map((pick) => {
              const sell = suggestedRetailPrice(pick.price) || pick.price;
              return (
                <div key={pick.id} className="w-[82%] shrink-0 snap-center overflow-hidden rounded-[24px] bg-white">
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
        {continueButton(() => forward(), !added.size)}
      </>
    );
  }

  if (question === "details") {
    body = (
      <>
        {title(t("details.title"))}
        <form
          className="grid gap-4"
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
        {continueButton(() => void saveProduct(), !productName.trim() || !price)}
      </>
    );
  }

  if (question === "look") {
    const displayName = storeName.trim() || status.store.name;
    body = (
      <>
        {title(t("look.title"), t("look.hint"))}
        <div
          className="-mx-[18px] flex snap-x snap-mandatory gap-3 overflow-x-auto px-[18px] pb-2"
          onScroll={(event) => {
            const el = event.currentTarget;
            const index = Math.round(el.scrollLeft / Math.max(1, el.firstElementChild?.clientWidth ?? el.clientWidth));
            if (index !== lookIndex && index >= 0 && index < BRAND_LOOKS.length) setLookIndex(index);
          }}
        >
          {BRAND_LOOKS.map((item, index) => {
            const palette = BRAND_PALETTES[index % BRAND_PALETTES.length];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setLookIndex(index)}
                aria-pressed={lookIndex === index}
                aria-label={t("look.of", { current: index + 1, total: BRAND_LOOKS.length })}
                className={cx("flex h-[440px] w-[82%] shrink-0 snap-center flex-col overflow-hidden rounded-[26px] border-2 text-left", lookIndex === index ? "border-app-ink" : "border-transparent")}
                style={{ background: item.background, color: item.ink }}
              >
                <span className="flex items-center gap-2 px-5 pt-5">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="h-8 w-8 rounded-[8px] object-contain" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-[8px] text-[12px] font-extrabold text-white" style={{ background: palette.swatches[0] }}>{lettermark(displayName)}</span>
                  )}
                  <span className="truncate text-[17px] font-semibold" style={{ fontFamily: item.fontCss }}>{displayName}</span>
                </span>
                <span className="mx-5 mt-4 flex flex-1 flex-col justify-end rounded-[18px] p-5" style={{ background: palette.swatches[0], color: palette.swatches[2] }}>
                  <span className="text-[26px] font-semibold leading-[1.05]" style={{ fontFamily: item.fontCss }}>{displayName}</span>
                  <span className="mt-3 inline-flex w-fit rounded-full px-4 py-2 text-[13px] font-bold" style={{ background: palette.swatches[1], color: palette.swatches[2] }}>{t("look.shopNow")}</span>
                </span>
                <span className="flex gap-2 px-5 py-4">
                  <span className="h-16 flex-1 rounded-[12px]" style={{ background: palette.swatches[1], opacity: 0.85 }} />
                  <span className="h-16 flex-1 rounded-[12px]" style={{ background: palette.swatches[2], boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.06)" }} />
                </span>
                <span className="px-5 pb-4 text-[14px] font-bold">{item.label}</span>
              </button>
            );
          })}
        </div>
        <p className="m-0 mt-2 text-center text-[13px] text-app-ink-soft">{t("look.of", { current: lookIndex + 1, total: BRAND_LOOKS.length })}</p>
        {askOpen ? (
          <div className="mt-4 flex items-start gap-3 rounded-[20px] bg-white p-3">
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
          <button type="button" onClick={() => setAskOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-[15px] font-bold">
            <Icon name="sparkle" size={16} /> {t("look.ask")}
          </button>
        )}
        {footer(
          <>
            {busy && buildNote && <p className="mb-3 text-center text-[13px] text-app-ink-soft" aria-live="polite">{buildNote}</p>}
            <PillButton className="w-full" busy={busy} onClick={() => void buildLook()}>{t("look.use")}</PillButton>
          </>,
        )}
      </>
    );
  }

  if (question === "address") {
    const freeHost = address?.host ?? `${shopSlug(slug)}`;
    body = (
      <>
        {title(t("address.title"))}
        <div className="grid gap-3">
          {choice({ key: "free", title: t("address.free"), hint: t("address.freeHint"), icon: "globe", on: addressChoice === "free", onClick: () => setAddressChoice("free") })}
          {addressChoice === "free" && (
            <div className="rounded-[20px] bg-white p-4">
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
            <div className="rounded-[20px] bg-white p-4">
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
                    <li key={domain.domain} className="flex items-center justify-between gap-3 rounded-[14px] bg-app-canvas px-4 py-3">
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
        {continueButton(() => void saveStoreAddress(), addressChoice === "free" && (checking || Boolean(address?.problem)))}
      </>
    );
  }

  if (question === "live") {
    const host = liveUrl.replace(/^https?:\/\//, "");
    body = (
      <>
        {!live ? (
          <>
            {title(liveProblem ? t("live.notYet", { reason: liveProblem }) : t("live.publishing"))}
            {!liveProblem && <Spinner className="h-7 w-7" />}
            {liveProblem && footer(<PillButton className="w-full" busy={busy} onClick={() => void goLive()}>{t("live.retry")}</PillButton>)}
          </>
        ) : (
          <>
            <div className="flex flex-col items-center text-center">
              <Mascot name="rex" mood="wave" className="h-24 w-24" alt="Rex" />
              <h1 className="m-0 mt-4 text-[32px] font-extrabold leading-[1.1] tracking-[-0.6px]">{t("live.title")}</h1>
              <a href={liveUrl} target="_blank" rel="noreferrer" className="mt-3 break-all font-mono text-[15px] font-bold text-app-forest underline underline-offset-4">{host}</a>
            </div>
            <h2 className="mb-3 mt-8 text-[15px] font-bold">{t("live.share")}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <PillButton size="md" tone="forest" onClick={() => void share("whatsapp")}><Icon name="whatsapp" size={16} /> {t("live.whatsapp")}</PillButton>
              <PillButton size="md" tone="white" onClick={() => void share("instagram")}><Icon name="instagram" size={16} /> {t("live.instagram")}</PillButton>
              <PillButton size="md" tone="white" onClick={() => void share("tiktok")}><Icon name="tiktok" size={16} /> {t("live.tiktok")}</PillButton>
              <PillButton size="md" tone="white" onClick={() => void share("copy")}><Icon name="copy" size={16} /> {t("live.copy")}</PillButton>
            </div>
            {shareNote && <div className="mt-3"><Notice tone="success">{shareNote}</Notice></div>}
            <p className="m-0 mt-5 text-center text-[13px] text-app-ink-soft">{t("live.later")}</p>
            {footer(<PillButton className="w-full" busy={busy} onClick={() => void finish()}>{t("live.home")}</PillButton>)}
          </>
        )}
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-app-canvas font-app text-app-ink">
      <div className="mx-auto flex min-h-dvh max-w-[520px] flex-col px-[18px] pt-6">
        {header}
        <div className="flex flex-1 flex-col">{body}</div>
      </div>
    </div>
  );
}
