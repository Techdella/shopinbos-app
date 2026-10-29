"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BackButton, DeviceToggle, Mascot, PillButton, Wordmark, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { StorePreview, PREVIEW_VARIANTS, type PreviewVariant } from "./StorePreview";
import { ProductsSetup } from "./ProductsSetup";
import { PagesSetup, type SelectedPage } from "./PagesSetup";
import { BuildProgress, type BuildSummary } from "./BuildProgress";
import { DomainSetup } from "./DomainSetup";
import { LaunchSetup } from "./LaunchSetup";
import { DEFAULT_STORE_CONFIG, type StoreConfig } from "@/lib/ai/store-types";
import { SignOutButton } from "@/components/shell/SignOutButton";
import { snapshotToStoreConfig, type StoreEditorSnapshot } from "@/lib/store-templates";
import {
  isDurableLogoUrl,
  paletteMemoryToStorePalette,
  parseOnboardingMemory,
  type StoreOnboardingMemory,
} from "@/lib/onboarding-memory";
import type { PreviewProduct } from "./ProductsSetup";
import { useT } from "@/components/i18n/I18nProvider";
import { ChatText } from "@/components/chat/ChatText";
import { friendlyError } from "@/lib/errors/report-client";

type BuilderT = ReturnType<typeof useT<["builder"]>>;

type BuilderPhase = "chat" | "products" | "pages" | "building" | "preview" | "domain" | "launch";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  chips?: string[];
  isStreaming?: boolean;
  imagePreviewUrls?: string[];
  docNames?: string[];
}

interface BrandContext {
  paletteName?: string;
  paletteColors?: StoreConfig["palette"];
  logoUrl?: string | null;
  logoLabel?: string;
  customerWho?: string;
  customerVibe?: string;
  category?: string;
  businessDescription?: string;
  documentNotes?: string;
}

interface BuilderMemory {
  phase: BuilderPhase;
  storeConfig: StoreConfig;
  selectedPages: string[];
  selectedPageDetails: SelectedPage[];
  designStyle: PreviewVariant;
  previewVariant: PreviewVariant;
  customDomain: string | null;
  selectedCategory: string;
}

interface UploadedFile {
  name: string;
  type: "image" | "document";
  previewUrl: string;
  dataUrl?: string;
}

interface ChipBuilderProps {
  userName: string;
  /** The seller's profile photo, shown on their messages (else their initial). */
  userAvatarUrl?: string | null;
  selectedTemplate?: {
    templateId: string;
    templateName: string;
    layoutFamily?: string;
    category?: string;
    sourcePack?: string;
    sourcePath?: string;
    supportedPages?: string[];
    aiHints?: string[];
  } | null;
  existingStore?: {
    name: string;
    slug: string;
    description?: string | null;
  } | null;
  onboardingMemory?: StoreOnboardingMemory | null;
  initialPhase?: BuilderPhase;
}

function mergeGeneratedProducts(
  previousProducts: StoreConfig["products"],
  nextProducts: StoreConfig["products"],
  freshImageUrls: string[],
) {
  const namedPrevious = new Map(
    previousProducts
      .filter((product) => product.imageUrl)
      .map((product) => [product.name.trim().toLowerCase(), product.imageUrl as string]),
  );

  const merged = nextProducts.map((product, index) => {
    const preservedImage =
      product.imageUrl
      ?? freshImageUrls[index]
      ?? previousProducts[index]?.imageUrl
      ?? namedPrevious.get(product.name.trim().toLowerCase());

    return preservedImage ? { ...product, imageUrl: preservedImage } : product;
  });

  if (freshImageUrls.length > nextProducts.length) {
    freshImageUrls.slice(nextProducts.length).forEach((imageUrl) => {
      const target = merged.findIndex((product) => !product.imageUrl);
      if (target >= 0) {
        merged[target] = { ...merged[target], imageUrl };
      }
    });
  }

  return merged;
}

function mergeGeneratedStore(
  previousStore: StoreConfig,
  nextStore: StoreConfig,
  freshImageUrls: string[],
): StoreConfig {
  return {
    ...previousStore,
    ...nextStore,
    products: mergeGeneratedProducts(previousStore.products, nextStore.products, freshImageUrls),
  };
}

const PHASE_STEPS: BuilderPhase[] = ["chat", "products", "pages", "building", "preview", "domain", "launch"];
const STEP_COUNT = 7;
const ONBOARDING_MEMORY_KEY = "shopinbos-onboarding-chat";
const BUILDER_MEMORY_KEY = "shopinbos-builder-progress";

function readBuilderMemory(): BuilderMemory | null {
  try {
    const saved = localStorage.getItem(BUILDER_MEMORY_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as BuilderMemory;
  } catch {
    return null;
  }
}

function clearBuilderMemory() {
  try {
    localStorage.removeItem(BUILDER_MEMORY_KEY);
  } catch {
    // ignore
  }
}

function readLocalOnboardingMemory(): StoreOnboardingMemory | null {
  try {
    const saved = localStorage.getItem(ONBOARDING_MEMORY_KEY);
    if (!saved) return null;
    const m = JSON.parse(saved) as Record<string, unknown>;
    return parseOnboardingMemory({
      ...m,
      palette: m.palette ?? m.selectedPalette,
      logo: m.logo ?? m.selectedLogo,
      uploadedLogoUrl: m.uploadedLogoUrl ?? m.uploadedLogo,
    }) ?? null;
  } catch {
    return null;
  }
}

function buildBrandContext(memory: StoreOnboardingMemory | null): BrandContext | null {
  if (!memory) return null;
  const logoUrl =
    isDurableLogoUrl(memory.logo?.url) ? memory.logo.url :
    isDurableLogoUrl(memory.uploadedLogoUrl) ? memory.uploadedLogoUrl :
    null;
  const paletteColors = paletteMemoryToStorePalette(memory.palette);

  if (!paletteColors && !logoUrl && !memory.customerProfile?.who && !memory.category && !memory.businessDescription) return null;

  return {
    paletteName: memory.palette?.name,
    paletteColors,
    logoUrl,
    logoLabel: memory.logo?.label,
    customerWho: memory.customerProfile?.who,
    customerVibe: memory.customerProfile?.vibe,
    category: memory.category,
    businessDescription: memory.businessDescription,
    documentNotes: memory.documentNotes,
  };
}

function buildInitialMessage(t: BuilderT, firstName: string, ctx: BrandContext | null, memory: StoreOnboardingMemory | null, existingStore?: ChipBuilderProps["existingStore"]): string {
  const stepGuide = t("chip.stepGuide");

  if (!ctx) {
    if (existingStore) {
      return `${stepGuide}${t("chip.welcomeBackStore", { name: firstName, store: existingStore.name })}`;
    }

    return `${stepGuide}${t("chip.hi", { name: firstName })}`;
  }

  const brandParts: string[] = [];
  if (ctx.paletteName) brandParts.push(t("chip.thePalette", { name: ctx.paletteName }));
  else if (ctx.paletteColors) brandParts.push(t("chip.yourPalette"));
  if (ctx.logoLabel) brandParts.push(t("chip.theLogo", { name: ctx.logoLabel }));
  else if (ctx.logoUrl) brandParts.push(t("chip.yourLogo"));

  const brandLine =
    brandParts.length > 0
      ? t("chip.stillHave", { items: brandParts.join(t("chip.and")) })
      : t("chip.stillRemember");

  const categoryLine = memory?.category ? t("chip.categoryLine", { category: memory.category }) : "";
  const businessLine = memory?.businessDescription ? t("chip.businessLine", { note: memory.businessDescription }) : "";
  const customerLine = ctx.customerWho ? t("chip.customerLine", { who: ctx.customerWho }) : "";
  const storeLine = existingStore ? t("chip.welcomeBackTo", { store: existingStore.name }) : t("chip.welcomeBack", { name: firstName });

  return `${stepGuide}${storeLine}${t("chip.continue", { details: `${categoryLine}${businessLine}${brandLine}${customerLine}` })}`;
}

function previewVariantFromLayout(layoutFamily?: string | null): PreviewVariant {
  if (!layoutFamily) return "editorial";
  if (layoutFamily === "electronics-grid" || layoutFamily === "marketplace-grid") return "bold";
  if (layoutFamily === "minimal-showcase") return "minimal";
  if (layoutFamily === "editorial-boutique" || layoutFamily === "fashion-runway" || layoutFamily === "book-lifestyle") return "editorial";
  return "classic";
}

export function ChipBuilder({ userName, userAvatarUrl = null, existingStore, selectedTemplate, onboardingMemory, initialPhase }: ChipBuilderProps) {
  const router = useRouter();
  const t = useT("builder");
  const firstName = userName.split(" ")[0];

  const [brandContext, setBrandContext] = useState<BrandContext | null>(null);
  const [resolvedOnboardingMemory, setResolvedOnboardingMemory] = useState<StoreOnboardingMemory | null>(onboardingMemory ?? null);

  const [phase, setPhase] = useState<BuilderPhase>(initialPhase ?? "chat");

  const [storeConfig, setStoreConfig] = useState<StoreConfig>(DEFAULT_STORE_CONFIG);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initialMemory = onboardingMemory ?? null;
    return [{ role: "assistant", content: buildInitialMessage(t, firstName, buildBrandContext(initialMemory), initialMemory, existingStore), chips: [] }];
  });

  const [selectedCategory, setSelectedCategory] = useState("");
  const [customDomain, setCustomDomain] = useState<string | null>(null);
  const [selectedPages, setSelectedPages] = useState<string[]>(["home", "products"]);
  const [selectedPageDetails, setSelectedPageDetails] = useState<SelectedPage[]>([
    { type: "home", label: "Home", userContent: "" },
    { type: "products", label: "Products", userContent: "" },
  ]);
  const [designStyle, setDesignStyle] = useState("minimal");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [liveChanges, setLiveChanges] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<UploadedFile[]>([]);
  const [showBrandPanel, setShowBrandPanel] = useState(false);
  const [previewVariant, setPreviewVariant] = useState<PreviewVariant>("classic");
  const [mounted, setMounted] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const currentPhaseIdx = PHASE_STEPS.indexOf(phase);

  // Scroll the message list only: scrollIntoView also scrolls every container above it (and the page), which
  // pushed the header off screen and left a blank band under the builder on each streamed word.
  useEffect(() => {
    const list = messagesEndRef.current?.parentElement;
    list?.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setMounted(true);
    const memory = onboardingMemory ?? readLocalOnboardingMemory();
    const ctx = buildBrandContext(memory);
    const savedBuilder = readBuilderMemory();
    setResolvedOnboardingMemory(memory);
    setBrandContext(ctx);

    const initialStore = savedBuilder ? { ...DEFAULT_STORE_CONFIG, ...savedBuilder.storeConfig } : { ...DEFAULT_STORE_CONFIG };
    if (memory?.storeName || existingStore?.name) {
      const name = memory?.storeName ?? existingStore?.name ?? DEFAULT_STORE_CONFIG.name;
      initialStore.name = name;
      initialStore.slug = existingStore?.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
    if (memory?.businessDescription) {
      initialStore.tagline = memory.businessDescription.slice(0, 80);
      initialStore.heroSubline = memory.businessDescription;
    } else if (memory?.category) {
      initialStore.tagline = `${memory.category} store`;
      initialStore.heroSubline = `A ${memory.category.toLowerCase()} store shaped from your onboarding answers.`;
    }
    if (ctx?.paletteColors) {
      initialStore.palette = ctx.paletteColors;
    }
    if (ctx?.logoUrl) {
      initialStore.logoUrl = ctx.logoUrl;
    }
    setStoreConfig(initialStore);

    if (savedBuilder) {
      setPhase(initialPhase ?? savedBuilder.phase);
      setSelectedPages(savedBuilder.selectedPages);
      setSelectedPageDetails(savedBuilder.selectedPageDetails);
      setDesignStyle(savedBuilder.designStyle);
      setPreviewVariant(savedBuilder.previewVariant);
      setSelectedCategory(savedBuilder.selectedCategory);
      setCustomDomain(savedBuilder.customDomain);
    }

    async function loadTemplateDraft() {
      if (savedBuilder) return;
      try {
        const response = await fetch("/api/store/editor", { cache: "no-store" });
        const json = await response.json() as { data?: { draft?: unknown } };
        if (json.data?.draft && typeof json.data.draft === "object") {
          const draftStore = snapshotToStoreConfig(
            json.data.draft as StoreEditorSnapshot,
            existingStore?.name ?? "Your Store",
          );
          setStoreConfig((prev) => ({ ...prev, ...draftStore, changed: ["template"] }));
        }
      } catch {
        // Best-effort. The builder can still start from defaults.
      }
    }

    void loadTemplateDraft();
  }, []);

  useEffect(() => {
    if (!mounted || !brandContext) return;
    setMessages([{ role: "assistant", content: buildInitialMessage(t, firstName, brandContext, resolvedOnboardingMemory, existingStore), chips: [] }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, brandContext, resolvedOnboardingMemory, existingStore, firstName]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        BUILDER_MEMORY_KEY,
        JSON.stringify({
          phase,
          storeConfig,
          selectedPages,
          selectedPageDetails,
          designStyle,
          previewVariant,
          customDomain,
          selectedCategory,
        }),
      );
    } catch {
      // ignore local storage failures
    }
  }, [mounted, phase, storeConfig, selectedPages, selectedPageDetails, designStyle, previewVariant, customDomain, selectedCategory]);

  useEffect(() => {
    if (selectedTemplate?.layoutFamily) {
      setPreviewVariant(previewVariantFromLayout(selectedTemplate.layoutFamily));
    }
  }, [selectedTemplate?.layoutFamily]);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    let imageCount = 0;
    files.forEach((file) => {
      const isImage = file.type.startsWith("image/");
      const previewUrl = URL.createObjectURL(file);
      if (isImage) {
        imageCount++;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          setPendingFiles((prev) => [...prev, { name: file.name, type: "image", previewUrl, dataUrl }]);
        };
        reader.readAsDataURL(file);
      } else {
        setPendingFiles((prev) => [...prev, { name: file.name, type: "document", previewUrl }]);
      }
    });
    if (imageCount > 0) {
      const rexMsg: ChatMessage = {
        role: "assistant",
        content: imageCount === 1
          ? t("chip.gotImage")
          : t("chip.gotImages", { count: imageCount }),
        chips: [],
      };
      setMessages((prev) => [...prev, rexMsg]);
    }
    e.target.value = "";
  }

  const sendMessage = useCallback(
    async (text: string) => {
      if ((!text.trim() && pendingFiles.length === 0) || isLoading) return;
      setInput("");

      const imageDataUrls = pendingFiles.filter((f) => f.type === "image" && f.dataUrl).map((f) => f.dataUrl!);
      const imagePreviewUrls = pendingFiles.filter((f) => f.type === "image").map((f) => f.previewUrl);
      const docNames = pendingFiles.filter((f) => f.type === "document").map((f) => f.name);
      setPendingFiles([]);

      const userMsg: ChatMessage = {
        role: "user",
        content: text,
        imagePreviewUrls: imagePreviewUrls.length > 0 ? imagePreviewUrls : undefined,
        docNames: docNames.length > 0 ? docNames : undefined,
      };
      const history = [...messages, userMsg];
      setMessages(history);

      const streamingIdx = history.length;
      setMessages((prev) => [...prev, { role: "assistant", content: "", isStreaming: true, chips: [] }]);

      setIsLoading(true);
      const setStreaming = (patch: Partial<ChatMessage>) =>
        setMessages((prev) => {
          const next = [...prev];
          next[streamingIdx] = { ...next[streamingIdx], ...patch };
          return next;
        });
      try {
        const response = await fetch("/api/ai/store-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Prior turns as text; the images attached to this message go separately.
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            currentImageDataUrls: imageDataUrls.length > 0 ? imageDataUrls : undefined,
            currentDocNames: docNames.length > 0 ? docNames : undefined,
            store: storeConfig,
            brandContext,
            templateContext: selectedTemplate ?? undefined,
          }),
        });

        if (!response.ok || !response.body) {
          const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(json?.error?.message ?? t("chip.cantStart"));
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let streamError: string | null = null;

        const handle = (event: { type: string; text?: string; data?: unknown; message?: string }) => {
          if (event.type === "status" && event.message && !accumulated) {
            setStreaming({ content: `${event.message}…`, isStreaming: true });
          } else if (event.type === "token" && event.text) {
            accumulated += event.text;
            setStreaming({ content: accumulated, isStreaming: true });
          } else if (event.type === "store" && event.data) {
            const generatedStore = event.data as StoreConfig;
            setStoreConfig((prev) => {
              const mergedStore = mergeGeneratedStore(prev, generatedStore, imageDataUrls);
              setLiveChanges(mergedStore.changed ?? []);
              if (mergedStore.name !== "Your Store") {
                setSelectedCategory(mergedStore.name);
              }
              return mergedStore;
            });
          } else if (event.type === "chips" && Array.isArray(event.data)) {
            setStreaming({ chips: event.data as string[] });
          } else if (event.type === "error") {
            streamError = event.message ?? t("chip.problem");
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              handle(JSON.parse(line) as { type: string; text?: string; data?: unknown; message?: string });
            } catch {
              /* skip malformed lines */
            }
          }
        }
        if (buffer.trim()) {
          try { handle(JSON.parse(buffer) as { type: string; text?: string; data?: unknown; message?: string }); } catch { /* ignore */ }
        }

        const finalError = streamError as string | null;
        setStreaming({
          content: finalError ? [accumulated, finalError].filter(Boolean).join("\n\n") : accumulated || t("chip.done"),
          isStreaming: false,
          ...(finalError ? { chips: [t("chip.tryAgain")] } : {}),
        });
      } catch (error) {
        setStreaming({
          role: "assistant",
          content: error instanceof Error ? friendlyError(error) : t("chip.wrong"),
          isStreaming: false,
          chips: [t("chip.tryAgain")],
        });
      } finally {
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    [messages, storeConfig, isLoading, pendingFiles, brandContext, selectedTemplate, t],
  );

  const handleProductsChange = useCallback((prods: PreviewProduct[]) => {
    if (prods.length === 0) return;
    setStoreConfig((prev) => ({ ...prev, products: prods }));
  }, []);

  function handlePagesAndBuild(pages: SelectedPage[]) {
    setSelectedPages(pages.map((p) => p.type));
    setSelectedPageDetails(pages);
    setDesignStyle(previewVariant); // carry design style from the user's chosen preview variant
    setPhase("building");
  }

  const lastMessage = messages[messages.length - 1];
  const chips = lastMessage?.chips ?? [];
  const storeReady = storeConfig.name !== "Your Store";

  const [previewPage, setPreviewPage] = useState("home");
  const [editSectionChat, setEditSectionChat] = useState(false);
  const [editInput, setEditInput] = useState("");

  const hasBrand = !!(brandContext?.paletteName || brandContext?.logoUrl || brandContext?.logoLabel);
  const previewTabs = Array.from(new Set([...selectedPages, "cart", "checkout"]));

  function formatPreviewLabel(page: string) {
    if (page.startsWith("product:")) return t("chip.singleProduct");
    return page
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function submitRexPreviewEdit() {
    const request = editInput.trim();
    if (!request) return;
    sendMessage(
      `Edit the ${formatPreviewLabel(previewPage)} page in my store preview: ${request}. Apply the change to the relevant storefront area, including navigation, product cards, product detail pages, wishlist, cart, checkout, page copy, or blog CMS setup if needed.`,
    );
    setEditInput("");
    setEditSectionChat(false);
  }

  function handleBuildComplete(summary: BuildSummary) {
    // The build step saves the design through /api/ai/build-store; if that failed, keep the design anyway.
    if (!summary.designSaved) {
      void fetch("/api/store/editor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hydrateFromStoreConfig: storeConfig }),
      }).catch(() => null);
    }

    const notes = [
      ...summary.notes,
      summary.failedPages.length ? t("chip.couldntWrite", { pages: summary.failedPages.join(", ") }) : "",
      selectedPages.includes("blog") ? t("chip.blogReady") : "",
      t("chip.draftNote"),
    ].filter(Boolean);
    setMessages((prev) => [...prev, { role: "assistant", content: notes.join("\n\n"), chips: [] }]);
    setPreviewPage("home");
    setPhase("preview");
  }

  function goBack() {
    if (phase === "products") setPhase("chat");
    else if (phase === "pages") setPhase("products");
    else if (phase === "building") setPhase("pages");
    else if (phase === "preview") setPhase("pages");
    else if (phase === "domain") setPhase("preview");
    else if (phase === "launch") setPhase("domain");
  }

  const stepNumber = currentPhaseIdx + 1;
  const stepLabels = Array.from({ length: STEP_COUNT }, (_, i) => t.dynamic(`chip.stepLabel.${i}`));
  const stepEyebrow = t("chip.step", { n: stepNumber, total: STEP_COUNT, label: stepLabels[currentPhaseIdx] ?? "" });
  const productCount = storeConfig.products.filter((p) => p.name && p.name !== "Product One" && p.name !== "Product Two" && p.name !== "Product Three").length || storeConfig.products.length;

  const previewPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="m-0 min-w-0 truncate text-[13px] font-bold text-app-ink-soft">
          {t("chip.livePreview", { address: `${storeConfig.slug}.mybos.store` })}
        </p>
        <DeviceToggle value={device} onChange={setDevice} size="sm" className="bg-white" />
      </div>

      <div className="flex shrink-0 flex-wrap gap-1.5" role="group" aria-label={t("chip.layout")}>
        {PREVIEW_VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={previewVariant === v.id}
            onClick={() => setPreviewVariant(v.id)}
            className={cx(
              "min-h-[34px] rounded-full border px-3 text-[12.5px] font-bold transition",
              previewVariant === v.id ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
            )}
          >
            {t.dynamic(`chip.variant.${v.id}`, v.label)}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] border border-app-line bg-white">
        <div className="flex shrink-0 items-center gap-3 border-b border-app-line px-4 py-2.5">
          <div className="flex gap-[5px]" aria-hidden>
            {["#FF6A2B", "#F2A93B", "#16794A"].map((c) => (
              <span key={c} className="h-[9px] w-[9px] rounded-full opacity-70" style={{ background: c }} />
            ))}
          </div>
          <div className="min-w-0 flex-1 truncate rounded-full bg-app-canvas px-3 py-1 text-[12px] text-app-ink-soft">{storeConfig.slug}.mybos.store</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <StorePreview
            store={storeConfig}
            changed={liveChanges}
            device={device}
            variant={previewVariant}
            currentPage={previewPage}
            onPageChange={setPreviewPage}
            pages={previewTabs}
          />
        </div>
      </div>

      {liveChanges.length > 0 && (
        <p className="m-0 flex shrink-0 items-center gap-2 rounded-[14px] bg-app-success-tint px-3 py-2 text-[12.5px] font-semibold text-app-success" role="status">
          <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-app-success" />
          <span className="truncate">{t("chip.updated", { items: liveChanges.join(", ") })}</span>
        </p>
      )}
    </div>
  );

  const showSidePreview = phase !== "building" && phase !== "preview";

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-app-canvas font-app text-app-ink">
      <header className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-app-line bg-white px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {phase !== "chat" && <BackButton onClick={goBack} label={t("chip.prevStep")} />}
          <Wordmark className="h-[18px]" />
        </div>

        <ol className="m-0 hidden list-none items-center gap-1 p-0 xl:flex" aria-label={t("chip.steps")}>
          {stepLabels.map((label, i) => {
            const done = i < currentPhaseIdx;
            const active = i === currentPhaseIdx;
            return (
              <li key={label} className="flex items-center gap-1" aria-current={active ? "step" : undefined}>
                <span
                  className={cx(
                    "inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-bold",
                    active ? "bg-app-ink text-white" : done ? "text-app-ink" : "text-app-ink-faint",
                  )}
                >
                  <span className={cx("grid h-[18px] w-[18px] place-items-center rounded-full text-[10.5px]", active ? "bg-white/20" : done ? "bg-app-success-tint text-app-success" : "bg-app-canvas")}>
                    {done ? <Icon name="check" size={10} /> : i + 1}
                  </span>
                  {label}
                </span>
                {i < stepLabels.length - 1 && <span className="h-px w-2 bg-app-line" aria-hidden />}
              </li>
            );
          })}
        </ol>
        <span className="text-[13px] font-bold text-app-ink-soft xl:hidden">{stepEyebrow}</span>

        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => router.push("/builder/templates")} className="hidden min-h-[38px] rounded-full px-3 text-[13px] font-bold text-app-ink hover:bg-app-canvas md:inline-flex md:items-center">
            {t("chip.templates")}
          </button>
          <button type="button" onClick={() => router.push("/seller/store/builder")} className="hidden min-h-[38px] rounded-full px-3 text-[13px] font-bold text-app-ink hover:bg-app-canvas md:inline-flex md:items-center">
            {t("chip.editStore")}
          </button>
          <SignOutButton variant="link" label={t("chip.signOut")} beforeSignOut={clearBuilderMemory} className="min-h-[38px] rounded-full px-3 text-[13px] font-bold text-app-ink-soft hover:bg-app-canvas hover:text-app-ink" />
          <PillButton size="sm" tone={storeReady ? "ink" : "white"} onClick={() => router.push(storeReady ? "/home/store" : "/home")}>
            {storeReady ? t("chip.goStore") : t("chip.skip")}
          </PillButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className={cx("grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-5 overflow-hidden p-4 sm:p-5", showSidePreview && "lg:grid-cols-[minmax(0,1fr)_minmax(360px,44%)]")}>
          <div className="flex min-h-0 flex-col overflow-hidden">

            {phase === "chat" && (
              <>
                <div className="mb-3 shrink-0">
                  <p className="m-0 text-[13px] font-bold text-app-ink-soft">{stepEyebrow}</p>
                  <h1 className="m-0 mt-1 text-[28px] font-extrabold leading-[1.08] tracking-[-0.8px] sm:text-[32px]">
                    {t("chip.headline")} <span className="text-app-accent-ink">{t("chip.headline2")}</span>
                  </h1>
                </div>

                {mounted && hasBrand && (
                  <div className="mb-3 shrink-0 rounded-[18px] bg-white px-3.5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        {brandContext?.logoUrl && (
                          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[10px] border border-app-line">
                            <Image src={brandContext.logoUrl} alt={t("chip.yourLogoAlt")} fill sizes="36px" className="object-contain" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("chip.brandFrom")}</p>
                          <div className="mt-0.5 flex min-w-0 items-center gap-2">
                            {brandContext?.paletteColors && (
                              <span className="flex shrink-0 gap-1" aria-hidden>
                                {Object.values(brandContext.paletteColors).slice(0, 4).map((c, i) => (
                                  <span key={i} className="h-3.5 w-3.5 rounded-full" style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(22,20,31,0.1)" }} />
                                ))}
                              </span>
                            )}
                            <span className="truncate text-[13.5px] font-bold">
                              {brandContext?.paletteName ?? t("chip.yourColours")}
                              {brandContext?.logoLabel ? t("chip.logoLabel", { name: brandContext.logoLabel }) : brandContext?.logoUrl ? t("chip.logoReady") : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-expanded={showBrandPanel}
                        onClick={() => setShowBrandPanel(!showBrandPanel)}
                        className="min-h-[36px] shrink-0 rounded-full border border-app-line px-3 text-[13px] font-bold hover:border-app-line-strong"
                      >
                        {showBrandPanel ? t("chip.close") : t("chip.changeBrand")}
                      </button>
                    </div>

                    {showBrandPanel && (
                      <div className="mt-3 border-t border-app-line pt-3">
                        <p className="m-0 mb-2 text-[13px] text-app-ink-soft">{t("chip.tellChange")}</p>
                        <div className="flex flex-wrap gap-2">
                          {[t("chip.opt.0"), t("chip.opt.1"), t("chip.opt.2"), t("chip.opt.3")].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => { sendMessage(opt); setShowBrandPanel(false); }}
                              className="min-h-[36px] rounded-full border border-app-line bg-white px-3 text-[13px] font-bold hover:border-app-ink"
                            >
                              {opt}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => router.push("/home/brand-kit")}
                            className="min-h-[36px] rounded-full border border-app-line bg-white px-3 text-[13px] font-bold hover:border-app-ink"
                          >
                            {t("chip.openBrandKit")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2 pr-1" aria-live="polite">
                  {messages.map((msg, i) => (
                    <div key={i} className={cx("flex items-end gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                      {msg.role === "assistant" && <Mascot name="rex" className="h-8 w-8 shrink-0" alt="" />}

                      <div className={cx("flex min-w-0 max-w-[85%] flex-col gap-2", msg.role === "user" && "items-end")}>
                        {msg.imagePreviewUrls && msg.imagePreviewUrls.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.imagePreviewUrls.map((url, j) => (
                              <div key={j} className="relative h-20 w-20 overflow-hidden rounded-[14px]">
                                <Image src={url} alt={t("chip.attachedPhoto")} fill sizes="80px" className="object-cover" />
                              </div>
                            ))}
                          </div>
                        )}

                        {msg.docNames && msg.docNames.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.docNames.map((name, j) => (
                              <span key={j} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-semibold">
                                <Icon name="file" size={13} /> {name}
                              </span>
                            ))}
                          </div>
                        )}

                        <div
                          className={cx(
                            "rounded-[20px] px-4 py-3 text-[14.5px] leading-[1.5]",
                            msg.role === "user" && "whitespace-pre-line",
                            msg.role === "user" ? "rounded-br-[6px] bg-app-ink text-white" : "rounded-bl-[6px] bg-white text-app-ink",
                          )}
                        >
                          <span className="sr-only">{msg.role === "user" ? `${t("chip.you")} ` : `${t("chip.rex")} `}</span>
                          {msg.content ? (msg.role === "user" ? msg.content : <ChatText text={msg.content} />) : (msg.isStreaming ? (
                            <span className="inline-flex gap-1 text-app-ink-soft" aria-label={t("chip.writing")}>
                              {[0, 150, 300].map((d) => (
                                <span key={d} className="animate-bounce" style={{ animationDelay: `${d}ms` }}>·</span>
                              ))}
                            </span>
                          ) : null)}
                        </div>

                        {msg.role === "assistant" && !msg.isStreaming && msg.chips && msg.chips.length > 0 && i === messages.length - 1 && (
                          <div className="flex flex-wrap gap-2">
                            {msg.chips.map((chip) => (
                              <button
                                key={chip}
                                type="button"
                                // "Publish this" / "Looks good" move on to the real build and launch steps instead of
                                // asking the model to publish (it can't).
                                onClick={() => (/^(publish|launch|looks good)/i.test(chip) && storeReady ? setPhase("products") : sendMessage(chip))}
                                className="min-h-[36px] rounded-full border border-app-line bg-white px-3.5 text-[13px] font-bold transition hover:border-app-ink"
                              >
                                {chip}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {msg.role === "user" && (userAvatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={userAvatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-app-peach text-[13px] font-extrabold text-app-accent-ink" aria-hidden>
                          {firstName[0]?.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                <div className="mt-3 shrink-0">
                  {pendingFiles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {pendingFiles.map((f, i) => (
                        <div key={i} className="relative">
                          {f.type === "image" ? (
                            <div className="relative h-16 w-16 overflow-hidden rounded-[12px]">
                              <Image src={f.previewUrl} alt={f.name} fill sizes="64px" className="object-cover" />
                            </div>
                          ) : (
                            <span className="inline-flex h-16 items-center gap-1.5 rounded-[12px] bg-white px-3 text-[12.5px]">
                              <Icon name="file" size={14} />
                              <span className="max-w-[110px] truncate font-semibold">{f.name}</span>
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                            aria-label={t("chip.remove", { name: f.name })}
                            className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-app-ink text-white shadow"
                          >
                            <Icon name="x" size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendMessage(input);
                    }}
                  >
                    <input
                      ref={uploadInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden
                      onChange={handleFileUpload}
                    />
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={isLoading}
                      aria-label={t("chip.attach")}
                      className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-white text-app-ink transition hover:bg-app-lilac disabled:opacity-40"
                    >
                      <Icon name="paperclip" size={18} />
                    </button>
                    <label htmlFor="rex-reply" className="sr-only">{t("chip.reply")}</label>
                    <input
                      id="rex-reply"
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={pendingFiles.length > 0 ? t("chip.notePh") : t("chip.replyPh")}
                      disabled={isLoading}
                      className="h-[52px] min-w-0 flex-1 rounded-full bg-white px-5 text-[15.5px] text-app-ink outline-none placeholder:text-app-ink-faint focus:ring-2 focus:ring-app-ink/15"
                      suppressHydrationWarning
                    />
                    <button
                      type="submit"
                      disabled={isLoading || (!input.trim() && pendingFiles.length === 0)}
                      aria-label={t("chip.send")}
                      className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-app-ink text-white disabled:opacity-45"
                    >
                      <Icon name="send" size={18} />
                    </button>
                  </form>

                  {chips.length === 0 && !isLoading && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {[t("chip.starter.0"), t("chip.starter.1"), t("chip.starter.2"), t("chip.starter.3")].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => sendMessage(s)}
                          className="min-h-[36px] whitespace-normal rounded-[18px] border border-app-line bg-white px-3.5 py-1.5 text-left text-[13px] font-bold leading-snug transition hover:border-app-ink"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {storeReady && (
                    <div className="mt-3 flex justify-end">
                      <PillButton size="md" tone="accent" onClick={() => setPhase("products")}>
                        {t("chip.looksGood")} <Icon name="arrow" size={16} />
                      </PillButton>
                    </div>
                  )}
                </div>
              </>
            )}

            {phase === "products" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <PhaseHead
                  eyebrow={stepEyebrow}
                  title={t("chip.addProducts")}
                  sub={t("chip.addProductsSub")}
                />
                {storeReady && (
                  <StoreStrip>
                    <span className="font-bold text-app-ink">{storeConfig.name}</span>
                    {storeConfig.tagline && <span className="truncate">· {storeConfig.tagline}</span>}
                  </StoreStrip>
                )}
                <div className="rounded-[22px] bg-white p-4 sm:p-5">
                  <ProductsSetup
                    category={resolvedOnboardingMemory?.category || selectedCategory || storeConfig.name}
                    onNext={() => setPhase("pages")}
                    onBack={() => setPhase("chat")}
                    onProductsChange={handleProductsChange}
                  />
                </div>
              </div>
            )}

            {phase === "pages" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <PhaseHead
                  eyebrow={stepEyebrow}
                  title={t("chip.choosePages")}
                  sub={t("chip.choosePagesSub")}
                />
                <StoreStrip>
                  <span className="font-bold text-app-ink">{storeConfig.name}</span>
                  <span>· {t("chip.productCount", { count: productCount })}</span>
                  <span className="capitalize">· {t("chip.layoutName", { name: t.dynamic(`chip.variant.${previewVariant}`, previewVariant) })}</span>
                </StoreStrip>
                <div className="rounded-[22px] bg-white p-4 sm:p-5">
                  <PagesSetup
                    storeName={storeConfig.name}
                    category={selectedCategory || storeConfig.name}
                    designStyle={previewVariant}
                    onBuild={handlePagesAndBuild}
                    onBack={() => setPhase("products")}
                  />
                </div>
              </div>
            )}

            {phase === "building" && (
              <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto rounded-[22px] bg-white sm:items-center">
                <BuildProgress
                  selectedPages={selectedPages}
                  selectedPageDetails={selectedPageDetails}
                  storeConfig={{ name: storeConfig.name, category: selectedCategory, designStyle, tagline: storeConfig.tagline }}
                  design={storeConfig}
                  onComplete={handleBuildComplete}
                />
              </div>
            )}

            {phase === "preview" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <PhaseHead
                  eyebrow={stepEyebrow}
                  title={t("chip.review")}
                  sub={`${t("chip.reviewSub")}${selectedTemplate ? t("chip.templateName", { name: selectedTemplate.templateName }) : ""}`}
                  action={<PillButton size="md" tone="accent" onClick={() => setPhase("domain")}>{t("chip.setAddress")} <Icon name="arrow" size={16} /></PillButton>}
                />

                <div className="mb-3 flex shrink-0 flex-wrap gap-1.5" role="group" aria-label={t("chip.page")}>
                  {previewTabs.map((p) => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={previewPage === p}
                      onClick={() => setPreviewPage(p)}
                      className={cx(
                        "min-h-[36px] rounded-full border px-3.5 text-[13px] font-bold capitalize transition",
                        previewPage === p ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
                      )}
                    >
                      {formatPreviewLabel(p)}
                    </button>
                  ))}
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
                  <div className="min-h-0 flex-1 overflow-y-auto rounded-[22px] border border-app-line bg-white">
                    <StorePreview
                      store={storeConfig}
                      changed={liveChanges}
                      device={device}
                      variant={previewVariant}
                      currentPage={previewPage}
                      onPageChange={setPreviewPage}
                      pages={previewTabs}
                    />
                  </div>

                  {editSectionChat && (
                    <form
                      className="flex shrink-0 flex-col rounded-[22px] bg-app-peach p-4 lg:w-[280px]"
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitRexPreviewEdit();
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Mascot name="rex" className="h-8 w-8" alt="" />
                        <span className="text-[14px] font-extrabold">{t("chip.whatChange")}</span>
                      </div>
                      <label htmlFor="rex-edit" className="sr-only">{t("chip.changeOn", { page: formatPreviewLabel(previewPage) })}</label>
                      <textarea
                        id="rex-edit"
                        rows={3}
                        value={editInput}
                        onChange={(e) => setEditInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitRexPreviewEdit(); } }}
                        placeholder={t("chip.editPh", { page: formatPreviewLabel(previewPage).toLowerCase() })}
                        className="mt-3 w-full resize-none rounded-[14px] border border-transparent bg-white px-3 py-2.5 text-[14px] leading-[1.5] outline-none focus:border-app-ink"
                      />
                      <PillButton type="submit" size="sm" className="mt-2 self-start" disabled={!editInput.trim()}>{t("chip.sendRex")}</PillButton>
                    </form>
                  )}
                </div>

                <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
                  <PillButton size="sm" tone="white" aria-expanded={editSectionChat} onClick={() => setEditSectionChat(!editSectionChat)}>
                    <Icon name="sparkle" size={14} /> {editSectionChat ? t("chip.close") : t("chip.changeWithRex")}
                  </PillButton>
                  <DeviceToggle value={device} onChange={setDevice} size="sm" className="bg-white" />
                </div>
              </div>
            )}

            {phase === "domain" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <PhaseHead eyebrow={stepEyebrow} title={t("chip.chooseAddress")} sub={t("chip.chooseAddressSub")} />
                <StoreStrip>
                  <span>{t("chip.freeAddress")}</span>
                  <span className="font-bold text-app-ink">{storeConfig.slug}.mybos.store</span>
                  <span>{t("chip.counts", { products: storeConfig.products.length, pages: selectedPages.length })}</span>
                </StoreStrip>
                <DomainSetup
                  storeSlug={storeConfig.slug}
                  storeName={storeConfig.name}
                  onDone={(domain) => { setCustomDomain(domain); setPhase("launch"); }}
                />
              </div>
            )}

            {phase === "launch" && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <PhaseHead eyebrow={stepEyebrow} title={t("chip.payDelivery")} sub={t("chip.payDeliverySub")} />
                <StoreStrip>
                  <span className="font-bold text-app-ink">{storeConfig.name}</span>
                  <span>· {customDomain ?? `${storeConfig.slug}.mybos.store`}</span>
                </StoreStrip>
                <div className="rounded-[22px] bg-white p-4 sm:p-5">
                  <LaunchSetup
                    storeName={storeConfig.name}
                    storeSlug={storeConfig.slug}
                    customDomain={customDomain}
                    storeConfig={storeConfig}
                    layoutVariant={previewVariant}
                    onDone={() => router.push("/home/store")}
                  />
                </div>
              </div>
            )}
          </div>

          {showSidePreview && <div className="hidden min-h-0 flex-col overflow-hidden lg:flex">{previewPanel}</div>}
        </div>
      </div>

      {showSidePreview && (
        <>
          <button
            type="button"
            onClick={() => setMobilePreview(true)}
            className="fixed bottom-4 right-4 z-20 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-app-ink px-4 text-[14px] font-bold text-white shadow-[0_12px_30px_-10px_rgba(22,20,31,0.5)] lg:hidden"
          >
            <Icon name="eye" size={16} /> {t("chip.preview")}
          </button>
          {mobilePreview && (
            <div role="dialog" aria-modal="true" aria-label={t("chip.storePreview")} className="fixed inset-0 z-30 flex flex-col bg-app-canvas p-4 lg:hidden">
              <div className="mb-3 flex shrink-0 items-center justify-between">
                <span className="text-[16px] font-extrabold">{t("chip.preview")}</span>
                <button type="button" onClick={() => setMobilePreview(false)} aria-label={t("chip.closePreview")} className="grid h-11 w-11 place-items-center rounded-full bg-white">
                  <Icon name="x" size={18} />
                </button>
              </div>
              {previewPanel}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StoreStrip({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-[16px] bg-white px-3.5 py-2.5 text-[13px] text-app-ink-soft">{children}</div>;
}

function PhaseHead({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="m-0 text-[13px] font-bold text-app-ink-soft">{eyebrow}</p>
        <h2 className="m-0 mt-1 text-[26px] font-extrabold leading-[1.1] tracking-[-0.6px]">{title}</h2>
        {sub && <p className="mb-0 mt-1.5 max-w-[640px] text-[14.5px] leading-[1.5] text-app-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
