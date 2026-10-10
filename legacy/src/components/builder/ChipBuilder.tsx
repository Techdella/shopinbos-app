"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
import { StorePreview, PREVIEW_VARIANTS, type PreviewVariant } from "./StorePreview";
import { ProductsSetup } from "./ProductsSetup";
import { PagesSetup, type SelectedPage } from "./PagesSetup";
import { BuildProgress } from "./BuildProgress";
import { DomainSetup } from "./DomainSetup";
import { LaunchSetup } from "./LaunchSetup";
import { DEFAULT_STORE_CONFIG, type StoreConfig } from "@/lib/ai/store-types";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { snapshotToStoreConfig, type StoreEditorSnapshot } from "@/lib/store-templates";
import {
  isDurableLogoUrl,
  paletteMemoryToStorePalette,
  parseOnboardingMemory,
  type StoreOnboardingMemory,
} from "@/lib/onboarding-memory";
import type { PreviewProduct } from "./ProductsSetup";

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
const STEP_LABELS = ["Tell Rex", "Products", "Pages", "Building", "Preview", "Domain", "Launch"];
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

function buildInitialMessage(firstName: string, ctx: BrandContext | null, memory: StoreOnboardingMemory | null, existingStore?: ChipBuilderProps["existingStore"]): string {
  const stepGuide = `Here's what we'll do together:\n1. Tell me about your business (this step)\n2. Add your products\n3. Choose your store pages\n4. Set up your domain\n5. Set up payments and go live\n\n`;

  if (!ctx) {
    if (existingStore) {
      return `${stepGuide}Welcome back ${firstName}! Let's continue building ${existingStore.name}. Tell me what you'd like to finish or update first.`;
    }

    return `${stepGuide}Hi ${firstName}, I'm Rex — your store builder. Tell me about your business: what you sell, who your customers are, and where you're based.`;
  }

  const brandParts: string[] = [];
  if (ctx.paletteName) brandParts.push(`the ${ctx.paletteName} palette`);
  else if (ctx.paletteColors) brandParts.push("your palette");
  if (ctx.logoLabel) brandParts.push(`the ${ctx.logoLabel} logo`);
  else if (ctx.logoUrl) brandParts.push("your logo");

  const brandLine =
    brandParts.length > 0
      ? `I still have ${brandParts.join(" and ")} from your brand setup. `
      : "I still remember your brand setup. ";

  const categoryLine = memory?.category ? `You said your store is in ${memory.category}. ` : "";
  const businessLine = memory?.businessDescription ? `I have the business note: ${memory.businessDescription}. ` : "";
  const customerLine = ctx.customerWho ? `You mentioned you're selling to ${ctx.customerWho}. ` : "";
  const storeLine = existingStore ? `Welcome back to ${existingStore.name}! ` : `Welcome back ${firstName}! `;

  return `${stepGuide}${storeLine}Let's continue building your store. ${categoryLine}${businessLine}${brandLine}${customerLine}I'll use this memory for your template, palette, logo direction, products, and page copy. Tell me any missing product details, or say "continue" and I'll build from what I remember.`;
}

function previewVariantFromLayout(layoutFamily?: string | null): PreviewVariant {
  if (!layoutFamily) return "editorial";
  if (layoutFamily === "electronics-grid" || layoutFamily === "marketplace-grid") return "bold";
  if (layoutFamily === "minimal-showcase") return "minimal";
  if (layoutFamily === "editorial-boutique" || layoutFamily === "fashion-runway" || layoutFamily === "book-lifestyle") return "editorial";
  return "classic";
}

export function ChipBuilder({ userName, existingStore, selectedTemplate, onboardingMemory, initialPhase }: ChipBuilderProps) {
  const router = useRouter();
  const firstName = userName.split(" ")[0];

  const handleSignOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    clearBuilderMemory();
    router.push("/login");
  }, [router]);

  const [brandContext, setBrandContext] = useState<BrandContext | null>(null);
  const [resolvedOnboardingMemory, setResolvedOnboardingMemory] = useState<StoreOnboardingMemory | null>(onboardingMemory ?? null);

  const [phase, setPhase] = useState<BuilderPhase>(initialPhase ?? "chat");

  const [storeConfig, setStoreConfig] = useState<StoreConfig>(DEFAULT_STORE_CONFIG);

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const initialMemory = onboardingMemory ?? null;
    return [{ role: "assistant", content: buildInitialMessage(firstName, buildBrandContext(initialMemory), initialMemory, existingStore), chips: [] }];
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const currentPhaseIdx = PHASE_STEPS.indexOf(phase);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
    setMessages([{ role: "assistant", content: buildInitialMessage(firstName, brandContext, resolvedOnboardingMemory, existingStore), chips: [] }]);
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
          ? "Got the image — nice. Tell me the product name and price and I'll add it to the preview right away."
          : `Got ${imageCount} product images. Tell me the name and price for each one and I'll update the preview.`,
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
      try {
        const response = await fetch("/api/ai/store-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({
              role: m.role,
              content: m.content,
              imageDataUrls: m.imagePreviewUrls
                ? pendingFiles.filter((f) => f.type === "image").map((f) => f.dataUrl).filter(Boolean)
                : undefined,
            })),
            // Pass the current message's image data separately so the API can use it
            currentImageDataUrls: imageDataUrls.length > 0 ? imageDataUrls : undefined,
            currentDocNames: docNames.length > 0 ? docNames : undefined,
            store: storeConfig,
            brandContext,
            templateContext: selectedTemplate ?? undefined,
          }),
        });

        if (!response.body) throw new Error("No response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const lines = decoder.decode(value, { stream: true }).split("\n").filter(Boolean);
          for (const line of lines) {
            try {
              const event = JSON.parse(line) as { type: string; text?: string; data?: unknown };

              if (event.type === "token" && event.text) {
                accumulated += event.text;
                setMessages((prev) => {
                  const next = [...prev];
                  next[streamingIdx] = { role: "assistant", content: accumulated, isStreaming: true, chips: [] };
                  return next;
                });
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
              } else if (event.type === "chips" && event.data) {
                const chips = event.data as string[];
                setMessages((prev) => {
                  const next = [...prev];
                  next[streamingIdx] = { ...next[streamingIdx], chips };
                  return next;
                });
              } else if (event.type === "done") {
                setMessages((prev) => {
                  const next = [...prev];
                  next[streamingIdx] = { ...next[streamingIdx], isStreaming: false };
                  return next;
                });
              }
            } catch {
              /* skip malformed lines */
            }
          }
        }
      } catch {
        setMessages((prev) => {
          const next = [...prev];
          next[streamingIdx] = {
            role: "assistant",
            content: "Something went wrong. Please try again.",
            isStreaming: false,
            chips: ["Try again"],
          };
          return next;
        });
      } finally {
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    },
    [messages, storeConfig, isLoading, pendingFiles, brandContext, selectedTemplate],
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
    if (page.startsWith("product:")) return "single product";
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

  function handleBuildComplete() {
    void fetch("/api/store/editor", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hydrateFromStoreConfig: {
          name: storeConfig.name,
          tagline: storeConfig.tagline,
          heroHeadline: storeConfig.heroHeadline,
          heroSubline: storeConfig.heroSubline,
          heroCtaText: storeConfig.heroCtaText,
          navLinks: storeConfig.navLinks,
          fontStyle: storeConfig.fontStyle,
          palette: storeConfig.palette,
          products: storeConfig.products,
        },
      }),
    }).catch(() => null);

    if (selectedPages.includes("blog")) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Your blog is set up. You can write and publish articles from the CMS in your workspace: go to Workspace, then CMS. Peggy can write full SEO-optimized articles for you from a prompt, including long-form guides over 5000 words when needed.",
          chips: [],
        },
      ]);
    }
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

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: "var(--color-navy)", color: "var(--color-cream)" }}>
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-60" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between border-b px-6 py-3" style={{ borderColor: "rgba(115,216,200,0.12)" }}>
        <div className="flex items-center gap-3">
          {phase !== "chat" && (
            <button
              type="button"
              onClick={goBack}
              className="rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors hover:border-[var(--color-mint)]"
              style={{
                borderColor: "rgba(115,216,200,0.28)",
                color: "var(--color-mint)",
                background: "rgba(115,216,200,0.08)",
              }}
            >
              Back
            </button>
          )}
          <BrandLogo theme="light" className="w-[140px]" />
          </div>

        <div className="hidden items-center gap-1 md:flex">
          {STEP_LABELS.map((label, i) => {
            const done = i < currentPhaseIdx;
            const active = i === currentPhaseIdx;
            return (
              <div key={label} className="flex items-center gap-1">
                <div className="flex items-center gap-1.5">
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                    style={{
                      background: done || active ? "var(--color-mint)" : "rgba(115,216,200,0.18)",
                      color: done || active ? "var(--color-navy)" : "rgba(115,216,200,0.5)",
                    }}
                  >
                    {done ? "OK" : i + 1}
                  </div>
                  <span
                    className="text-[11px]"
                    style={{ color: active ? "var(--color-cream)" : "rgba(115,216,200,0.5)", fontWeight: active ? 600 : 400 }}
                  >
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && <div className="mx-1.5 h-px w-3" style={{ background: "rgba(115,216,200,0.18)" }} />}
              </div>
            );
          })}
        </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/builder/templates")}
              className="rounded-full border px-4 py-1.5 text-[12px] font-semibold"
              style={{
                borderColor: "rgba(115,216,200,0.28)",
                color: "rgba(115,216,200,0.8)",
                background: "transparent",
              }}
            >
              Templates
            </button>

            <button
              type="button"
              onClick={() => router.push("/builder/editor")}
              className="rounded-full border px-4 py-1.5 text-[12px] font-semibold"
              style={{
                borderColor: "rgba(115,216,200,0.28)",
                color: "rgba(115,216,200,0.8)",
                background: "transparent",
              }}
            >
              Visual editor
            </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-full border px-2.5 py-1 text-[10px] font-semibold"
            style={{
              borderColor: "rgba(115,216,200,0.28)",
              color: "rgba(115,216,200,0.62)",
              background: "transparent",
            }}
          >
            Out
          </button>

          <button
            type="button"
            onClick={() => router.push("/home")}
            className="rounded-full px-4 py-1.5 text-[12px] font-semibold"
            style={{
              background: storeReady ? "var(--color-mint)" : "rgba(115,216,200,0.18)",
              color: storeReady ? "var(--color-navy)" : "rgba(115,216,200,0.6)",
            }}
          >
            {storeReady ? "Go to workspace" : "Skip setup"}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="relative z-10 flex flex-1 gap-6 overflow-hidden p-5 pt-4">
        <div
          className="grid flex-1 gap-6 overflow-hidden"
          style={{ gridTemplateColumns: phase === "building" ? "1fr" : "1fr 480px" }}
        >
          {/* Left panel */}
          <div className="flex flex-col overflow-hidden">

            {/* CHAT phase */}
            {phase === "chat" && (
              <>
                <div className="mb-3 shrink-0">
                  <div className="font-mono text-[11px] tracking-[0.12em]" style={{ color: "rgba(115,216,200,0.7)" }}>
                    CONVERSATION
                  </div>
                  <h1 className="mt-2 font-display text-[32px] font-medium leading-[1.06] tracking-[-0.03em]" style={{ color: "var(--color-cream)" }}>
                    Tell Rex what you sell.
                    <br />
                    <span className="font-accent italic" style={{ color: "var(--color-mint)" }}>He&apos;ll design the rest.</span>
                  </h1>
                </div>

                {/* Brand context bar */}
                {mounted && hasBrand && (
                  <div
                    className="mb-3 shrink-0 rounded-[12px] px-3 py-2.5"
                    style={{ background: "rgba(115,216,200,0.07)", border: "1px solid rgba(115,216,200,0.18)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {brandContext?.logoUrl && (
                          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-[6px]">
                            <Image src={brandContext.logoUrl} alt="Brand logo" fill sizes="32px" className="object-contain" />
                          </div>
                        )}
                        <div>
                          <div className="font-mono text-[9px] tracking-[0.1em] uppercase" style={{ color: "rgba(115,216,200,0.6)" }}>
                            Brand from onboarding
                          </div>
                          <div className="mt-0.5 flex items-center gap-2">
                            {brandContext?.paletteColors && (
                              <div className="flex gap-1">
                                {Object.values(brandContext.paletteColors).slice(0, 4).map((c, i) => (
                                  <div key={i} className="h-3 w-3 rounded-full" style={{ background: c }} />
                                ))}
                              </div>
                            )}
                            <span className="text-[11px] font-medium" style={{ color: "var(--color-cream)" }}>
                              {brandContext?.paletteName ?? "Custom palette"}
                              {brandContext?.logoLabel ? ` · ${brandContext.logoLabel} logo` : brandContext?.logoUrl ? " · Logo ready" : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowBrandPanel(!showBrandPanel)}
                        className="shrink-0 text-[11px] font-semibold underline"
                        style={{ color: "rgba(115,216,200,0.7)" }}
                      >
                        {showBrandPanel ? "Close" : "Change brand"}
                      </button>
                    </div>

                    {showBrandPanel && (
                      <div className="mt-3 border-t pt-3" style={{ borderColor: "rgba(115,216,200,0.12)" }}>
                        <p className="mb-2 text-[12px]" style={{ color: "rgba(115,216,200,0.8)" }}>
                          Tell Rex what you want to change and he&apos;ll update it live:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {["Change my palette", "Use a different logo", "I want darker colors", "Make it brighter"].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => { sendMessage(opt); setShowBrandPanel(false); }}
                              className="rounded-full border px-3 py-1 text-[11px] transition-colors hover:border-[var(--color-mint)]"
                              style={{ borderColor: "rgba(115,216,200,0.2)", color: "rgba(115,216,200,0.8)" }}
                            >
                              {opt}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => router.push("/onboarding")}
                            className="rounded-full border px-3 py-1 text-[11px] transition-colors hover:border-[var(--color-mint)]"
                            style={{ borderColor: "rgba(115,216,200,0.2)", color: "rgba(115,216,200,0.8)" }}
                          >
                            Redesign brand
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Messages */}
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-2 pr-1">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      {msg.role === "assistant" && <ChipAvatar mascot="rex" size={34} />}

                      <div className="flex max-w-[82%] flex-col gap-2">
                        {msg.role === "assistant" && (
                          <div className="font-mono text-[10px] tracking-[0.1em]" style={{ color: "var(--color-mint)" }}>
                            {msg.isStreaming ? "REX · DRAFTING" : "REX"}
                          </div>
                        )}

                        {/* Image attachments */}
                        {msg.imagePreviewUrls && msg.imagePreviewUrls.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.imagePreviewUrls.map((url, j) => (
                              <div key={j} className="relative h-20 w-20 overflow-hidden rounded-[10px]">
                                <Image src={url} alt="Attached" fill sizes="80px" className="object-cover" />
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Doc attachments */}
                        {msg.docNames && msg.docNames.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.docNames.map((name, j) => (
                              <div
                                key={j}
                                className="rounded-[8px] px-2.5 py-1.5 text-[11px] font-medium"
                                style={{ background: "rgba(115,216,200,0.15)", color: "var(--color-cream)" }}
                              >
                                {name}
                              </div>
                            ))}
                          </div>
                        )}

                        <div
                          className="rounded-[16px] px-4 py-3 text-[13px] leading-[1.55]"
                          style={{
                            background: msg.role === "user" ? "var(--color-mint)" : "rgba(115,216,200,0.07)",
                            border: msg.role === "assistant" ? "1px solid rgba(115,216,200,0.18)" : "none",
                            color: msg.role === "user" ? "var(--color-navy)" : "var(--color-cream)",
                          }}
                        >
                          {msg.content || (msg.isStreaming ? (
                            <span className="inline-flex gap-1">
                              {[0, 150, 300].map((d) => (
                                <span key={d} className="animate-bounce" style={{ animationDelay: `${d}ms` }}>·</span>
                              ))}
                            </span>
                          ) : null)}
                        </div>

                        {msg.role === "assistant" && !msg.isStreaming && msg.chips && msg.chips.length > 0 && i === messages.length - 1 && (
                          <div className="mt-1 flex flex-wrap gap-2">
                            {msg.chips.map((chip) => (
                              <button
                                key={chip}
                                type="button"
                                onClick={() => sendMessage(chip)}
                                className="rounded-full border px-3 py-1.5 text-[11px] transition-colors hover:border-[var(--color-mint)] hover:text-[var(--color-mint)]"
                                style={{ borderColor: "rgba(115,216,200,0.2)", color: "rgba(115,216,200,0.7)" }}
                              >
                                {chip}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {msg.role === "user" && (
                        <div
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] font-display text-[13px] font-bold"
                          style={{ background: "var(--color-amber)", color: "var(--color-navy)" }}
                        >
                          {firstName[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input area */}
                <div className="mt-3 shrink-0">
                  {/* Pending file previews */}
                  {pendingFiles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {pendingFiles.map((f, i) => (
                        <div key={i} className="group relative">
                          {f.type === "image" ? (
                            <div className="relative h-16 w-16 overflow-hidden rounded-[8px]">
                              <Image src={f.previewUrl} alt={f.name} fill sizes="64px" className="object-cover" />
                            </div>
                          ) : (
                            <div
                              className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[11px]"
                              style={{ background: "rgba(115,216,200,0.12)", color: "var(--color-cream)" }}
                            >
                              <span>doc</span>
                              <span className="max-w-[100px] truncate font-medium">{f.name}</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                            className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-[var(--color-navy)] shadow group-hover:flex"
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Input row */}
                  <div
                    className="flex items-center gap-2 rounded-[14px] px-3 py-2.5"
                    style={{ background: "rgba(244,241,234,0.06)", border: "1px solid rgba(115,216,200,0.18)" }}
                  >
                    {/* Upload button */}
                    <input
                      ref={uploadInputRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <button
                      type="button"
                      onClick={() => uploadInputRef.current?.click()}
                      disabled={isLoading}
                      title="Attach image or document"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-[16px] transition-colors hover:bg-[rgba(115,216,200,0.1)] disabled:opacity-40"
                      style={{ color: "rgba(115,216,200,0.6)" }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path d="M2 11L6.5 6.5a2.121 2.121 0 013 0l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                        <path d="M9.5 9.5L10.5 8.5a1.5 1.5 0 012.121 0L14 9.879" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                        <rect x="1" y="1" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4"/>
                      </svg>
                    </button>

                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
                      }}
                      placeholder={pendingFiles.length > 0 ? "Add a note about this file (optional)..." : "Reply to Rex..."}
                      disabled={isLoading}
                      className="flex-1 bg-transparent text-[14px] outline-none"
                      style={{ color: "var(--color-cream)" }}
                      suppressHydrationWarning
                    />
                    <button
                      type="button"
                      onClick={() => sendMessage(input)}
                      disabled={isLoading || (!input.trim() && pendingFiles.length === 0)}
                      className="rounded-full px-4 py-1.5 text-[12px] font-semibold disabled:opacity-40"
                      style={{ background: "var(--color-mint)", color: "var(--color-navy)" }}
                    >
                      Send
                    </button>
                  </div>

                  {chips.length === 0 && !isLoading && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["I sell fashion", "Beauty products", "Food & drinks", "Electronics"].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => sendMessage(s)}
                          className="rounded-full border px-3 py-1.5 text-[11px] transition-colors hover:border-[var(--color-mint)] hover:text-[var(--color-mint)]"
                          style={{ borderColor: "rgba(115,216,200,0.2)", color: "rgba(115,216,200,0.7)", background: "transparent" }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {storeReady && (
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setPhase("products")}
                        className="rounded-full px-5 py-2.5 text-[13px] font-semibold"
                        style={{ background: "var(--color-mint)", color: "var(--color-navy)" }}
                      >
                        Looks good — add products
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* PRODUCTS phase */}
            {phase === "products" && (
              <div className="flex flex-1 flex-col overflow-y-auto">
                <div className="mb-3 shrink-0">
                  <div className="font-mono text-[11px] tracking-[0.12em]" style={{ color: "rgba(115,216,200,0.7)" }}>STEP 2 OF 5 — PRODUCTS</div>
                  <h2 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.03em]" style={{ color: "var(--color-cream)" }}>
                    Add your products
                  </h2>
                  <p className="mt-1 text-[13px]" style={{ color: "rgba(244,241,234,0.6)" }}>
                    Add real products and product images. Rex uses these images in the store preview, and Peggy can help turn your notes into clean product copy.
                  </p>
                </div>
                {storeReady && (
                  <div className="mb-3 shrink-0 flex items-center gap-2 rounded-[10px] px-3 py-2" style={{ background: "rgba(115,216,200,0.07)", border: "1px solid rgba(115,216,200,0.12)" }}>
                    <span className="font-mono text-[10px]" style={{ color: "rgba(115,216,200,0.6)" }}>Store:</span>
                    <span className="text-[12px] font-semibold" style={{ color: "var(--color-cream)" }}>{storeConfig.name}</span>
                    {storeConfig.tagline && <span className="text-[11px]" style={{ color: "rgba(115,216,200,0.5)" }}>· {storeConfig.tagline}</span>}
                  </div>
                )}
                <div className="rounded-[20px] bg-white p-5">
                  <ProductsSetup
                    category={resolvedOnboardingMemory?.category || selectedCategory || storeConfig.name}
                    onNext={() => setPhase("pages")}
                    onBack={() => setPhase("chat")}
                    onProductsChange={handleProductsChange}
                  />
                </div>
              </div>
            )}

            {/* PAGES phase */}
            {phase === "pages" && (
              <div className="flex flex-1 flex-col overflow-y-auto">
                <div className="mb-3 shrink-0">
                  <div className="font-mono text-[11px] tracking-[0.12em]" style={{ color: "rgba(115,216,200,0.7)" }}>STEP 3 OF 5 — PAGES</div>
                  <h2 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.03em]" style={{ color: "var(--color-cream)" }}>
                    Choose your pages
                  </h2>
                  <p className="mt-1 text-[13px]" style={{ color: "rgba(244,241,234,0.6)" }}>
                    Pick pages and give Rex your copy insights: tone, promises, FAQs, delivery notes, and anything buyers should know. Rex writes the full store from that.
                  </p>
                </div>
                <div className="mb-3 shrink-0 flex items-center gap-2 rounded-[10px] px-3 py-2" style={{ background: "rgba(115,216,200,0.07)", border: "1px solid rgba(115,216,200,0.12)" }}>
                  <span className="font-mono text-[10px]" style={{ color: "rgba(115,216,200,0.6)" }}>Store:</span>
                  <span className="text-[12px] font-semibold" style={{ color: "var(--color-cream)" }}>{storeConfig.name}</span>
                  <span className="text-[11px]" style={{ color: "rgba(115,216,200,0.5)" }}>·</span>
                  <span className="text-[11px]" style={{ color: "rgba(115,216,200,0.6)" }}>{storeConfig.products.filter(p => p.name && p.name !== "Product One" && p.name !== "Product Two" && p.name !== "Product Three").length || storeConfig.products.length} products</span>
                  <span className="text-[11px]" style={{ color: "rgba(115,216,200,0.5)" }}>·</span>
                  <span className="text-[11px] capitalize" style={{ color: "rgba(115,216,200,0.6)" }}>{previewVariant} layout</span>
                </div>
                <div className="rounded-[20px] bg-white p-5">
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

            {/* BUILDING phase */}
            {phase === "building" && (
              <div className="flex flex-1 items-center justify-center overflow-hidden rounded-[20px] bg-white">
                <BuildProgress
                  selectedPages={selectedPages}
                  selectedPageDetails={selectedPageDetails}
                  storeConfig={{ name: storeConfig.name, category: selectedCategory, designStyle, tagline: storeConfig.tagline }}
                  onComplete={handleBuildComplete}
                />
              </div>
            )}

            {/* PREVIEW phase */}
            {phase === "preview" && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="mb-3 shrink-0">
                  <div className="font-mono text-[11px] tracking-[0.12em]" style={{ color: "rgba(115,216,200,0.7)" }}>STEP 4 OF 5 — PREVIEW</div>
                  <div className="mt-1 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-[24px] font-semibold tracking-[-0.03em]" style={{ color: "var(--color-cream)" }}>
                        Review your store
                      </h2>
                      <p className="mt-0.5 text-[12px]" style={{ color: "rgba(244,241,234,0.55)" }}>
                        Browse each page tab. Click &ldquo;Edit with Rex&rdquo; to change any section live.
                      </p>
                      {selectedTemplate ? (
                        <p className="mt-1 text-[11px]" style={{ color: "rgba(115,216,200,0.72)" }}>
                          Starting from template: {selectedTemplate.templateName}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPhase("domain")}
                      className="shrink-0 rounded-full px-5 py-2 text-[13px] font-semibold"
                      style={{ background: "var(--color-mint)", color: "var(--color-navy)" }}
                    >
                      Set up domain
                    </button>
                  </div>
                </div>

                <div className="mb-3 flex shrink-0 gap-1">
                  {previewTabs.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPreviewPage(p)}
                      className="rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition-all"
                      style={{
                        background: previewPage === p ? "var(--color-mint)" : "rgba(115,216,200,0.12)",
                        color: previewPage === p ? "var(--color-navy)" : "rgba(115,216,200,0.7)",
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <div className="flex flex-1 gap-4 overflow-hidden">
                  <div className="flex-1 overflow-y-auto rounded-[14px]">
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
                    <div
                      className="flex w-[220px] shrink-0 flex-col rounded-[14px]"
                      style={{ background: "rgba(115,216,200,0.07)", border: "1px solid rgba(115,216,200,0.18)" }}
                    >
                      <div className="flex items-center gap-2 px-3 py-3" style={{ borderBottom: "1px solid rgba(115,216,200,0.1)" }}>
                        <ChipAvatar mascot="rex" size={22} />
                        <span className="font-mono text-[10px]" style={{ color: "var(--color-mint)" }}>REX · EDITING</span>
                      </div>
                      <div className="flex-1 px-3 py-3 text-[12px]" style={{ color: "rgba(115,216,200,0.7)" }}>
                        What would you like to change?
                      </div>
                      <div className="px-3 pb-3">
                        <div className="flex gap-1">
                          <input
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") submitRexPreviewEdit(); }}
                            placeholder={`Edit ${formatPreviewLabel(previewPage).toLowerCase()}...`}
                            className="flex-1 rounded-[8px] px-2 py-1.5 text-[11px] outline-none"
                            style={{ background: "rgba(115,216,200,0.1)", color: "var(--color-cream)", border: "1px solid rgba(115,216,200,0.18)" }}
                          />
                          <button
                            type="button"
                            onClick={submitRexPreviewEdit}
                            className="rounded-[8px] px-2 py-1.5 text-[11px] font-bold"
                            style={{ background: "var(--color-mint)", color: "var(--color-navy)" }}
                          >
                            OK
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditSectionChat(!editSectionChat)}
                    className="rounded-full border px-4 py-2 text-[12px] font-semibold transition-colors hover:border-[var(--color-mint)]"
                    style={{ borderColor: "rgba(115,216,200,0.3)", color: "rgba(115,216,200,0.8)" }}
                  >
                    {editSectionChat ? "Close editor" : "Edit sections with Rex"}
                  </button>
                </div>
              </div>
            )}

            {/* DOMAIN phase */}
            {phase === "domain" && (
              <div className="flex flex-1 flex-col overflow-y-auto">
                <div className="mb-3 shrink-0">
                  <div className="font-mono text-[11px] tracking-[0.12em]" style={{ color: "rgba(115,216,200,0.7)" }}>STEP 4 OF 5 — DOMAIN</div>
                  <h2 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.03em]" style={{ color: "var(--color-cream)" }}>
                    Choose your domain
                  </h2>
                  <p className="mt-1 text-[13px]" style={{ color: "rgba(244,241,234,0.6)" }}>
                    Use your free Shopinbos link or connect a domain you already own through Vercel.
                  </p>
                </div>
                <div className="mb-3 shrink-0 flex flex-wrap items-center gap-2 rounded-[10px] px-3 py-2" style={{ background: "rgba(115,216,200,0.07)", border: "1px solid rgba(115,216,200,0.12)" }}>
                  <span className="font-mono text-[10px]" style={{ color: "rgba(115,216,200,0.6)" }}>Free link:</span>
                  <span className="font-mono text-[12px] font-semibold" style={{ color: "var(--color-mint)" }}>{storeConfig.slug}.shopinbos.com</span>
                  <span className="text-[11px]" style={{ color: "rgba(115,216,200,0.4)" }}>·</span>
                  <span className="text-[11px]" style={{ color: "rgba(115,216,200,0.6)" }}>{storeConfig.products.length} products · {selectedPages.length} pages</span>
                </div>
                <div className="rounded-[20px] bg-white p-5">
                  <DomainSetup
                    storeSlug={storeConfig.slug}
                    storeName={storeConfig.name}
                    onDone={(domain) => { setCustomDomain(domain); setPhase("launch"); }}
                  />
                </div>
              </div>
            )}

            {/* LAUNCH phase */}
            {phase === "launch" && (
              <div className="flex flex-1 flex-col overflow-y-auto">
                <div className="mb-3 shrink-0">
                  <div className="font-mono text-[11px] tracking-[0.12em]" style={{ color: "rgba(115,216,200,0.7)" }}>STEP 5 OF 5 — LAUNCH</div>
                  <h2 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.03em]" style={{ color: "var(--color-cream)" }}>
                    Payments and delivery
                  </h2>
                  <p className="mt-1 text-[13px]" style={{ color: "rgba(244,241,234,0.6)" }}>
                    Last step. Set up how customers pay and how you deliver — then your store goes live.
                  </p>
                </div>
                <div className="mb-3 shrink-0 flex flex-wrap items-center gap-2 rounded-[10px] px-3 py-2" style={{ background: "rgba(115,216,200,0.07)", border: "1px solid rgba(115,216,200,0.12)" }}>
                  <span className="font-mono text-[10px]" style={{ color: "rgba(115,216,200,0.6)" }}>Store:</span>
                  <span className="text-[12px] font-semibold" style={{ color: "var(--color-cream)" }}>{storeConfig.name}</span>
                  <span className="text-[11px]" style={{ color: "rgba(115,216,200,0.4)" }}>·</span>
                  <span className="font-mono text-[11px]" style={{ color: "rgba(115,216,200,0.6)" }}>
                    {customDomain ?? `${storeConfig.slug}.shopinbos.com`}
                  </span>
                </div>
                <div className="rounded-[20px] bg-white p-5">
                    <LaunchSetup
                      storeName={storeConfig.name}
                      storeSlug={storeConfig.slug}
                      customDomain={customDomain}
                      storeConfig={storeConfig}
                      layoutVariant={previewVariant}
                      onDone={() => router.push("/home")}
                    />
                </div>
              </div>
            )}
          </div>

          {/* Right panel: live preview */}
          {phase !== "building" && (
            <div className="flex flex-col gap-3 overflow-hidden">
              <div className="flex shrink-0 items-center justify-between">
                <div className="font-mono text-[11px] tracking-[0.12em]" style={{ color: "var(--color-teal)" }}>
                  LIVE PREVIEW · {storeConfig.slug}.shopinbos.com
                </div>
                <div className="flex gap-1">
                  {(["desktop", "mobile"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDevice(d)}
                      className="rounded-[6px] px-2 py-1 text-[10px] font-semibold capitalize transition-colors"
                      style={{
                        background: device === d ? "white" : "transparent",
                        border: "1px solid rgba(14,42,56,0.1)",
                        color: device === d ? "var(--color-navy)" : "rgba(115,216,200,0.5)",
                      }}
                    >
                      {d === "desktop" ? "Desktop" : "Mobile"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Layout variant selector */}
              <div className="flex shrink-0 gap-1">
                {PREVIEW_VARIANTS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setPreviewVariant(v.id)}
                    className="rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all"
                    style={{
                      background: previewVariant === v.id ? "var(--color-mint)" : "rgba(115,216,200,0.1)",
                      color: previewVariant === v.id ? "var(--color-navy)" : "rgba(115,216,200,0.55)",
                      border: previewVariant === v.id ? "none" : "1px solid rgba(115,216,200,0.15)",
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <div
                className="flex-1 overflow-hidden rounded-[14px]"
                style={{ background: "var(--color-paper)", border: "1px solid rgba(14,42,56,0.08)" }}
              >
                <div
                  className="flex items-center gap-3 px-4 py-2.5"
                  style={{ borderBottom: "1px solid rgba(14,42,56,0.06)", background: "white" }}
                >
                  <div className="flex gap-[5px]">
                    {["#E86A4F", "#F2A93B", "#73D8C8"].map((c) => (
                      <div key={c} className="h-[9px] w-[9px] rounded-full" style={{ background: c }} />
                    ))}
                  </div>
                  <div
                    className="flex-1 rounded-[6px] px-2 py-1 font-mono text-[10px]"
                    style={{ background: "var(--color-paper)", color: "var(--color-muted)" }}
                  >
                    {storeConfig.slug}.shopinbos.com
                  </div>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 260px)" }}>
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
                <div
                  className="flex shrink-0 items-center gap-2 rounded-[10px] px-3 py-2"
                  style={{ background: "rgba(115,216,200,0.12)", border: "1px solid rgba(46,126,120,0.25)" }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--color-teal)", boxShadow: "0 0 0 3px rgba(46,126,120,0.3)", animation: "pulse 1.5s infinite" }}
                  />
                  <span className="font-mono text-[10px]" style={{ color: "var(--color-teal-deep)" }}>
                    Updated: {liveChanges.join(", ")}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
