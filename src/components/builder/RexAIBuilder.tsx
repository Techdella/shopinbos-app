"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { StorefrontClient } from "@/app/s/[slug]/StorefrontClient";
import { mascotPaths } from "@/lib/brand";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { StoreLaunchBillingModal, type StoreLaunchPricing } from "@/components/billing/StoreLaunchBillingModal";
import {
  createBlankEditorSnapshot,
  createSectionFromLibrary,
  snapshotToStoreConfig,
  type StoreEditorSnapshot,
  type TemplatePageSeed,
  type TemplatePageType,
} from "@/lib/store-templates";
import type { StoreConfig } from "@/lib/ai/store-types";

type EditorEnvelope = {
  seller?: {
    name?: string | null;
    email?: string | null;
  };
  store: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    logoUrl?: string | null;
    city?: string | null;
    country?: string | null;
    currency: string;
    brandSettings: Record<string, unknown>;
    storeProducts: Array<{
      id: string;
      name: string;
      description?: string | null;
      images: string[];
      retailPrice: number;
      currency: string;
    }>;
  };
  template?: {
    templateId: string;
    templateName: string;
  } | null;
  draft?: StoreEditorSnapshot | null;
  published?: StoreEditorSnapshot | null;
};

const rexUi = {
  navy: "#081329",
  panel: "#0F1D38",
  panelRaised: "#172744",
  panelSoft: "#223454",
  teal: "#0FA493",
  tealDark: "#087E73",
  border: "rgba(255,255,255,.14)",
  text: "#F8FAFC",
  muted: "#B9C4D6",
  faint: "#8190A8",
};

const rexImage = mascotPaths.rex[0];

type RexToolId = "logo" | "image" | "product-img" | "banner" | "copy" | "palette";

type GeneratedPalette = {
  id: string;
  name: string;
  personality?: string;
  vibe?: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
  };
};

const rexToolInfo: Record<RexToolId, { title: string; eyebrow: string; description: string }> = {
  logo: {
    title: "Logo Builder",
    eyebrow: "Brand identity",
    description: "Create editable logo concepts that can be applied to your Shopinbos store brand.",
  },
  image: {
    title: "AI Image Editor",
    eyebrow: "Asset studio",
    description: "Clean, resize, enhance, and prepare storefront images for product pages and campaigns.",
  },
  "product-img": {
    title: "Product Image AI",
    eyebrow: "Product photography",
    description: "Generate product-ready visuals in the right format for cards, details, banners, and ads.",
  },
  banner: {
    title: "Banner & Ad Maker",
    eyebrow: "Campaign creative",
    description: "Create promotional banners for your storefront, WhatsApp, Instagram, and seasonal offers.",
  },
  copy: {
    title: "AI Copy Writer",
    eyebrow: "Commerce copy",
    description: "Write product descriptions, taglines, SEO snippets, captions, and conversion-focused text.",
  },
  palette: {
    title: "Brand Colour Palette",
    eyebrow: "Visual system",
    description: "Generate store colors that match the brand and can be applied across the live theme.",
  },
};

type RexMessage = { id: string; role: "user" | "assistant"; content: string; chips?: string[] };
type StoreProductOption = { id: string; name: string; images: string[]; status?: string };
type RexAsset = { url: string; label: string };
type ImageEditKind = "enhance" | "remove_background" | "white_background" | "lifestyle";

const IMAGE_EDIT_ACTIONS: Array<{ kind: ImageEditKind; label: string }> = [
  { kind: "enhance", label: "Enhance quality" },
  { kind: "remove_background", label: "Remove background" },
  { kind: "white_background", label: "White studio background" },
  { kind: "lifestyle", label: "Lifestyle scene" },
];

const BANNER_SIZES: Record<string, string> = {
  "WhatsApp flyer": "1024x1536",
  "Instagram post": "1024x1024",
  "Store banner": "1536x1024",
};

let messageSeq = 0;
const newMessage = (role: RexMessage["role"], content: string, chips?: string[]): RexMessage => ({
  id: `m${Date.now().toString(36)}${(messageSeq++).toString(36)}`,
  role,
  content,
  ...(chips ? { chips } : {}),
});

async function apiError(response: Response, fallback: string) {
  const json = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return json?.error?.message ?? fallback;
}

/** Client-side resize / crop / compress with a canvas; returns a WebP file ready to upload. */
async function processImageInBrowser(url: string, mode: "square" | "compress"): Promise<File> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't edit images.");
  if (mode === "square") {
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const target = Math.min(side, 1200);
    canvas.width = target;
    canvas.height = target;
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, target, target);
  } else {
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", mode === "compress" ? 0.78 : 0.9));
  if (!blob) throw new Error("Couldn't process this image.");
  return new File([blob], `${mode === "square" ? "square" : "compressed"}-${Date.now()}.webp`, { type: "image/webp" });
}

export function RexAIBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [envelope, setEnvelope] = useState<EditorEnvelope | null>(null);
  const [draft, setDraft] = useState<StoreEditorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState("home");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [publishing, setPublishing] = useState(false);
  const [launchPricing, setLaunchPricing] = useState<StoreLaunchPricing | null>(null);
  const [publishedStoreUrl, setPublishedStoreUrl] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Rex AI states
  const [activeLeftTab, setActiveLeftTab] = useState<"chat" | "tools" | "history">("chat");
  const [activeTool, setActiveTool] = useState<null | RexToolId>(null);
  const [rexPrompt, setRexPrompt] = useState("");
  const [rexBusy, setRexBusy] = useState(false);
  const [rexMessages, setRexMessages] = useState<RexMessage[]>([
    newMessage("assistant", "Hi! I am Rex, your AI store builder. Tell me what to change, or ask me to build the whole store."),
  ]);
  const [activity, setActivity] = useState<Array<{ title: string; at: string }>>([]);

  // Tool inputs
  const [logoName, setLogoName] = useState("");
  const [logoTagline, setLogoTagline] = useState("");
  const [logoStyle, setLogoStyle] = useState("Luxury / High-end");
  const [productPrompt, setProductPrompt] = useState("");
  const [productFormat, setProductFormat] = useState("1:1 Square");
  const [bannerHeadline, setBannerHeadline] = useState("");
  const [bannerFormat, setBannerFormat] = useState("Store banner");
  const [copyProductName, setCopyProductName] = useState("");
  const [copyType, setCopyType] = useState("Product description");
  const [copyResult, setCopyResult] = useState("");
  const [paletteVibe, setPaletteVibe] = useState("");
  const [generatedLogos, setGeneratedLogos] = useState<Array<{ style: string; label: string; url: string; palette?: { primary: string; secondary: string; accent: string } }>>([]);
  const [generatedImages, setGeneratedImages] = useState<RexAsset[]>([]);
  const [generatedPalettes, setGeneratedPalettes] = useState<GeneratedPalette[]>([]);
  const [uploadedAssets, setUploadedAssets] = useState<RexAsset[]>([]);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [toolBusy, setToolBusy] = useState<string | null>(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [storeProducts, setStoreProducts] = useState<StoreProductOption[]>([]);
  const [targetProductId, setTargetProductId] = useState("");

  // ── Unsaved changes guard ──
  const [hasChanges, setHasChanges] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const pendingNav = useRef<string | null>(null);

  function requestNavigate(dest: string) {
    if (!hasChanges) { router.push(dest); return; }
    pendingNav.current = dest;
    setLeaveDialog(true);
  }

  // Browser unsaved-changes guard
  useEffect(() => {
    if (!hasChanges) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [hasChanges]);

  function showToast(msg: string) {
    setToastMessage(msg);
  }

  function logActivity(title: string) {
    setActivity((prev) => [{ title, at: new Date().toISOString() }, ...prev].slice(0, 30));
  }

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  async function reloadEnvelope() {
    const response = await fetch("/api/store/editor", { cache: "no-store" });
    const json = (await response.json().catch(() => null)) as { data?: EditorEnvelope } | null;
    if (json?.data) {
      setEnvelope(json.data);
      if (json.data.draft) setDraft(json.data.draft);
    }
    return json?.data ?? null;
  }

  // Load store and template draft state
  useEffect(() => {
    let cancelled = false;
    const fromOnboarding = searchParams.get("onboarding") === "true";

    async function load() {
      try {
        const response = await fetch("/api/store/editor", { cache: "no-store" });
        const json = (await response.json()) as { data?: EditorEnvelope };
        if (!cancelled && json.data) {
          setEnvelope(json.data);
          const loadedDraft = json.data.draft ?? createBlankEditorSnapshot(json.data.store.name);
          setDraft(loadedDraft);
          setSelectedPage(loadedDraft.pages[0]?.pageType ?? "home");
          if (!json.data.draft) {
            void fetch("/api/store/editor", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ snapshot: loadedDraft }),
            });
          }
          setLogoName(json.data.store.name || "");
          setLogoTagline(json.data.store.description || "");
          const sellerName = json.data.seller?.name?.trim() || json.data.store.name || "there";
          setRexMessages([
            newMessage(
              "assistant",
              fromOnboarding
                ? `Hi ${sellerName}! I brought in your onboarding answers. Ask me to build the store for ${json.data.store.name} and I'll design it, write the pages, add sample products if you have none, and create a hero image. Nothing goes live until you publish.`
                : `Hi ${sellerName}! I'm Rex. Tell me what to change on ${json.data.store.name}, or ask me to build the whole store. Nothing goes live until you publish.`,
            ),
          ]);
          if (fromOnboarding) {
            window.localStorage.removeItem("shopinbos:first-run-walkthrough:seller");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  // Products for "Set as product photo" (all statuses, not just published).
  useEffect(() => {
    if (!activeTool || storeProducts.length) return;
    void fetch("/api/store/products?limit=100", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: StoreProductOption[] } | null) => {
        const list = (json?.data ?? []).filter((product) => product.status !== "archived");
        setStoreProducts(list);
        if (list[0]) setTargetProductId((current) => current || list[0].id);
      })
      .catch(() => null);
  }, [activeTool, storeProducts.length]);

  const currentPage: TemplatePageSeed | null = useMemo(() => {
    return draft?.pages.find((page) => page.pageType === selectedPage) ?? draft?.pages[0] ?? null;
  }, [draft, selectedPage]);

  /** Every image Rex can work on: this session's uploads and generations, then the store's product photos. */
  const imageLibrary: RexAsset[] = useMemo(() => {
    const productImages = storeProducts.flatMap((product) => product.images.slice(0, 1).map((url) => ({ url, label: product.name })));
    const all = [...generatedImages, ...uploadedAssets, ...productImages];
    return all.filter((image, index) => all.findIndex((entry) => entry.url === image.url) === index);
  }, [generatedImages, uploadedAssets, storeProducts]);
  const selectedImage = imageLibrary.find((image) => image.url === selectedImageUrl) ?? imageLibrary[0] ?? null;

  function createRexPage(pageType: TemplatePageType): TemplatePageSeed {
    const titleMap: Record<TemplatePageType, string> = {
      home: "Home",
      products: "Products",
      product: "Product Detail",
      categories: "Categories",
      cart: "Cart",
      checkout: "Checkout",
      wishlist: "Wishlist",
      blog: "Blog",
      about: "About",
      contact: "Contact",
      faq: "FAQ",
    };
    const sectionsMap: Record<TemplatePageType, string[]> = {
      home: ["hero-split", "category-list", "featured-products", "promo-banner", "story-split", "newsletter"],
      products: ["filters-toolbar", "category-list", "featured-products", "newsletter"],
      product: ["product-detail", "featured-products"],
      categories: ["category-list", "featured-products"],
      cart: ["cart-summary"],
      checkout: ["checkout-form"],
      wishlist: ["wishlist-grid", "featured-products"],
      blog: ["story-split", "blog-index", "newsletter"],
      about: ["story-split", "text-columns"],
      contact: ["story-split", "contact-form"],
      faq: ["faq", "newsletter"],
    };
    const title = titleMap[pageType];
    return {
      id: `rex-${pageType}`,
      pageType,
      title,
      slug: pageType === "home" ? "home" : pageType,
      sections: sectionsMap[pageType].map((kind) => createSectionFromLibrary(kind)),
      seo: {
        metaTitle: pageType === "home" ? envelope?.store.name ?? "Store" : `${title} | ${envelope?.store.name ?? "Store"}`,
        metaDescription: `${title} page for ${envelope?.store.name ?? "your store"}.`,
      },
    };
  }

  async function saveSnapshot(next: StoreEditorSnapshot, message: string) {
    try {
      const response = await fetch("/api/store/editor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: next }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Couldn't save the draft."));
      const json = (await response.json()) as { data?: { draft?: StoreEditorSnapshot | null } };
      if (json.data?.draft) {
        setDraft(json.data.draft);
        setHasChanges(true);
        logActivity(message);
        showToast(message);
        return true;
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't save the draft.");
    }
    return false;
  }

  /** Adds the standard ecommerce pages the draft is missing, from the section library. No AI involved. */
  async function addMissingPages() {
    if (!draft) return;
    const requiredPages: TemplatePageType[] = ["home", "products", "product", "categories", "cart", "checkout", "wishlist", "blog", "about", "contact", "faq"];
    const existing = new Set(draft.pages.map((page) => page.pageType));
    const missing = requiredPages.filter((page) => !existing.has(page));
    const emptied = draft.pages.filter((page) => page.sections.length === 0).map((page) => page.pageType);
    if (!missing.length && !emptied.length) {
      setRexMessages((prev) => [...prev, newMessage("assistant", "Your draft already has every standard store page (home, products, product detail, categories, cart, checkout, wishlist, blog, about, contact and FAQ).")]);
      return;
    }
    const next: StoreEditorSnapshot = {
      ...draft,
      pages: [
        ...draft.pages.map((page) => (page.sections.length > 0 ? page : createRexPage(page.pageType))),
        ...missing.map((page) => createRexPage(page)),
      ],
      updatedAt: new Date().toISOString(),
    };
    const saved = await saveSnapshot(next, "Added the missing store pages.");
    if (saved) {
      const added = [...missing, ...emptied];
      setRexMessages((prev) => [
        ...prev,
        newMessage("assistant", `I added these pages from the standard section library: ${added.join(", ")}. They use template sections, not copy written for your store yet; ask me to write any of them.`),
      ]);
    }
  }

  /** The real builder: designs the store, saves the draft and pages, adds sample products and images. */
  async function buildWholeStore(request: string) {
    if (rexBusy) return;
    const conversation = rexMessages.slice(1).map((m) => ({ role: m.role, content: m.content })).filter((m) => m.content.trim());
    setRexMessages((prev) => [...prev, newMessage("user", request), newMessage("assistant", "Building your store: designing, writing pages, and creating images. This can take a minute…")]);
    setRexBusy(true);
    try {
      const memory = (envelope?.store.brandSettings?.onboardingMemory ?? {}) as Record<string, unknown>;
      const response = await fetch("/api/ai/build-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...conversation, { role: "user", content: request }].slice(-30),
          brief: [envelope?.store.description, typeof memory.businessDescription === "string" ? memory.businessDescription : ""].filter(Boolean).join("\n") || undefined,
          brandContext: {
            category: typeof memory.category === "string" ? memory.category : undefined,
            businessDescription: typeof memory.businessDescription === "string" ? memory.businessDescription : envelope?.store.description ?? undefined,
          },
          templateContext: envelope?.template ? { templateId: envelope.template.templateId, templateName: envelope.template.templateName } : undefined,
        }),
      });
      if (!response.ok) throw new Error(await apiError(response, "Rex couldn't build the store."));
      const json = (await response.json()) as {
        data: {
          config: StoreConfig;
          products: Array<{ name: string }>;
          pages: Array<{ title: string }>;
          images: { hero: string | null; product: string | null };
          notes: string[];
        };
      };
      await reloadEnvelope();
      setStoreProducts([]);
      setHasChanges(true);
      const result = json.data;
      const made = [
        `designed "${result.config.name}" (${result.config.products.length} products in the layout)`,
        `saved ${result.pages.length} draft pages`,
        result.products.length ? `added ${result.products.length} sample products as drafts, marked "(sample)"` : "",
        result.images.hero ? "generated a hero image" : "",
        result.images.product ? "generated a product photo" : "",
      ].filter(Boolean);
      for (const url of [result.images.hero, result.images.product]) {
        if (url) setGeneratedImages((prev) => [{ url, label: url === result.images.hero ? "Hero image" : "Product photo" }, ...prev]);
      }
      logActivity(`Built the store draft for ${result.config.name}`);
      setRexMessages((prev) => [
        ...prev.slice(0, -1),
        newMessage(
          "assistant",
          [`Done: I ${made.join(", ")}.`, ...result.notes, "Review it in the preview. Press Publish changes when you're ready to go live."].join("\n\n"),
          ["Make it more premium", "Write the About page", "Add missing store pages"],
        ),
      ]);
    } catch (error) {
      setRexMessages((prev) => [...prev.slice(0, -1), newMessage("assistant", error instanceof Error ? error.message : "Rex couldn't build the store.")]);
    } finally {
      setRexBusy(false);
    }
  }

  async function generateLogo() {
    setToolBusy("logo");
    try {
      const response = await fetch("/api/ai/generate-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: logoName || envelope?.store.name, businessDescription: logoTagline || envelope?.store.description, paletteHint: logoStyle }),
      });
      const json = (await response.json().catch(() => null)) as { logos?: typeof generatedLogos; error?: { message?: string } } | null;
      if (json?.logos?.length) {
        setGeneratedLogos(json.logos);
        showToast("Logo concepts generated.");
      } else {
        showToast(json?.error?.message ?? "Logo generation failed.");
      }
    } finally {
      setToolBusy(null);
    }
  }

  async function applyLogo(url: string) {
    const response = await fetch("/api/app/store", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: url }),
    });
    if (!response.ok) {
      showToast(await apiError(response, "Couldn't save the logo."));
      return;
    }
    setEnvelope((prev) => prev ? { ...prev, store: { ...prev.store, logoUrl: url } } : prev);
    logActivity("Applied a new logo");
    showToast("Logo saved to your store.");
  }

  async function generateImageFrom(prompt: string, size: string, label: string) {
    const response = await fetch("/api/ai/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, size }),
    });
    const json = (await response.json().catch(() => null)) as { image?: { url: string }; error?: { message?: string } } | null;
    if (!response.ok || !json?.image?.url) throw new Error(json?.error?.message ?? "Image generation failed.");
    const asset = { url: json.image.url, label };
    setGeneratedImages((prev) => [asset, ...prev].slice(0, 12));
    setSelectedImageUrl(asset.url);
    logActivity(`Generated: ${label}`);
    return asset;
  }

  async function generateProductImage() {
    if (!productPrompt.trim()) {
      showToast("Describe the product photo first.");
      return;
    }
    const size = productFormat === "4:3 Landscape" ? "1536x1024" : productFormat === "3:4 Portrait" ? "1024x1536" : "1024x1024";
    setToolBusy("product-img");
    try {
      await generateImageFrom(productPrompt, size, "Product photo");
      showToast("Product image generated.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Image generation failed.");
    } finally {
      setToolBusy(null);
    }
  }

  async function generateBanner() {
    if (!bannerHeadline.trim()) {
      showToast("Write the banner headline first.");
      return;
    }
    setToolBusy("banner");
    try {
      const storeName = envelope?.store.name ?? "the store";
      await generateImageFrom(
        `Promotional ${bannerFormat.toLowerCase()} for the online store "${storeName}"${envelope?.store.description ? ` (${envelope.store.description})` : ""}. Show the headline "${bannerHeadline.trim()}" in large, clean, correctly spelled typography, with a short "Shop now" call to action. Bold, modern layout with strong contrast; no other text.`,
        BANNER_SIZES[bannerFormat] ?? "1536x1024",
        `${bannerFormat}: ${bannerHeadline.trim()}`,
      );
      showToast("Banner created.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Banner generation failed.");
    } finally {
      setToolBusy(null);
    }
  }

  async function editSelectedImage(kind: ImageEditKind, label: string) {
    if (!selectedImage) {
      showToast("Upload or pick an image first.");
      return;
    }
    setToolBusy(kind);
    try {
      const response = await fetch("/api/ai/enhance-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: selectedImage.url, kind }),
      });
      const json = (await response.json().catch(() => null)) as { image?: { url: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.image?.url) throw new Error(json?.error?.message ?? "Couldn't edit that image.");
      const asset = { url: json.image.url, label: `${label}: ${selectedImage.label}` };
      setGeneratedImages((prev) => [asset, ...prev].slice(0, 12));
      setSelectedImageUrl(asset.url);
      logActivity(asset.label);
      showToast(`${label} done.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't edit that image.");
    } finally {
      setToolBusy(null);
    }
  }

  async function processSelectedImage(mode: "square" | "compress") {
    if (!selectedImage) {
      showToast("Upload or pick an image first.");
      return;
    }
    setToolBusy(mode);
    try {
      const file = await processImageInBrowser(selectedImage.url, mode);
      const asset = await uploadRexAsset(file, "products");
      if (asset) {
        const label = mode === "square" ? "Square crop" : "Compressed";
        setUploadedAssets((prev) => prev.map((entry) => (entry.url === asset.url ? { ...entry, label: `${label}: ${selectedImage.label}` } : entry)));
        setSelectedImageUrl(asset.url);
        logActivity(`${label}: ${selectedImage.label}`);
      }
    } catch (error) {
      showToast(error instanceof Error && error.message ? error.message : "Couldn't process this image in the browser.");
    } finally {
      setToolBusy(null);
    }
  }

  async function writeCopy() {
    setToolBusy("copy");
    setCopyResult("");
    try {
      const fieldByType: Record<string, { field: string; maxWords: number; instructions: string }> = {
        "Product description": { field: "product description", maxWords: 120, instructions: "2 short paragraphs: what it is and why it's worth buying." },
        "Short tagline": { field: "store tagline", maxWords: 8, instructions: "One line, memorable, no clichés." },
        "WhatsApp caption": { field: "WhatsApp broadcast message", maxWords: 60, instructions: "Friendly, direct, ends with a call to order." },
        "SEO meta": { field: "SEO meta description", maxWords: 28, instructions: "Under 155 characters, includes what is sold and where." },
      };
      const config = fieldByType[copyType] ?? fieldByType["Product description"];
      const response = await fetch("/api/ai/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          context: {
            store: envelope?.store.name ?? "",
            "what the store sells": envelope?.store.description ?? "",
            "product or offer": copyProductName,
            location: [envelope?.store.city, envelope?.store.country].filter(Boolean).join(", "),
          },
        }),
      });
      const json = (await response.json().catch(() => null)) as { data?: { text?: string }; error?: { message?: string } } | null;
      if (!response.ok || !json?.data?.text) throw new Error(json?.error?.message ?? "Couldn't write that copy.");
      setCopyResult(json.data.text);
      logActivity(`Wrote ${copyType.toLowerCase()}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Couldn't write that copy.");
    } finally {
      setToolBusy(null);
    }
  }

  /** Saves the copy where it belongs: a tagline becomes the hero subline; a description goes on the chosen product. */
  async function applyCopy() {
    if (!copyResult || !draft) return;
    if (copyType === "Short tagline") {
      const next: StoreEditorSnapshot = {
        ...draft,
        updatedAt: new Date().toISOString(),
        pages: draft.pages.map((page) => page.pageType !== "home" ? page : {
          ...page,
          sections: page.sections.map((section) => section.kind !== "hero-split" ? section : {
            ...section,
            blocks: section.blocks.map((block) => block.type === "copy" ? { ...block, content: { ...block.content, body: copyResult } } : block),
          }),
        }),
      };
      await saveSnapshot(next, "Tagline saved to the homepage hero.");
    } else if (copyType === "Product description" && targetProductId) {
      const response = await fetch(`/api/store/products/${targetProductId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: copyResult }),
      });
      if (!response.ok) showToast(await apiError(response, "Couldn't save the description."));
      else {
        logActivity("Saved a product description");
        showToast("Description saved to the product.");
      }
    }
  }

  async function generatePalette() {
    setToolBusy("palette");
    try {
      const response = await fetch("/api/ai/generate-palette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: envelope?.store.name,
          description: envelope?.store.description || envelope?.store.storeProducts.map((product) => product.name).join(", ") || "online products",
          feeling: paletteVibe || "professional",
          customers: "online shoppers",
        }),
      });
      const json = (await response.json().catch(() => null)) as { palettes?: GeneratedPalette[]; error?: { message?: string } } | null;
      if (json?.palettes?.length) {
        setGeneratedPalettes(json.palettes);
        showToast("Brand palettes generated.");
      } else {
        showToast(json?.error?.message ?? "Palette generation failed.");
      }
    } finally {
      setToolBusy(null);
    }
  }

  async function applyPalette(palette: GeneratedPalette) {
    if (!draft) return;
    const next: StoreEditorSnapshot = {
      ...draft,
      updatedAt: new Date().toISOString(),
      themeTokens: {
        ...draft.themeTokens,
        heroBg: palette.colors.primary,
        heroText: "#FFFFFF",
        accent: palette.colors.accent,
        ctaBg: palette.colors.accent,
        ctaText: "#FFFFFF",
        paperBg: palette.colors.background,
        cardBg: palette.colors.surface,
        ink: palette.colors.text,
        muted: palette.colors.secondary,
      },
    };
    await saveSnapshot(next, `${palette.name} applied to your draft.`);
  }

  /** Puts the image on the first image slot of the selected page (the hero on the homepage). */
  async function applyImageToSelectedPage(url: string) {
    if (!draft || !currentPage) return;
    let applied = false;
    const next: StoreEditorSnapshot = {
      ...draft,
      updatedAt: new Date().toISOString(),
      pages: draft.pages.map((page) =>
        page.pageType === currentPage.pageType
          ? {
              ...page,
              sections: page.sections.map((section) => {
                if (applied || !section.items?.length) return section;
                applied = true;
                return { ...section, items: section.items.map((item, index) => index === 0 ? { ...item, imageUrl: url } : item) };
              }),
            }
          : page,
      ),
    };
    if (!applied) {
      showToast(`The ${currentPage.title} page has no image slot. Pick another page in the preview bar.`);
      return;
    }
    await saveSnapshot(next, `Image placed on the ${currentPage.title} page.`);
  }

  async function setAsProductPhoto(url: string) {
    const product = storeProducts.find((entry) => entry.id === targetProductId);
    if (!product) {
      showToast("Add a product first, then set its photo here.");
      return;
    }
    const response = await fetch(`/api/store/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images: [url, ...product.images.filter((image) => image !== url)].slice(0, 10) }),
    });
    if (!response.ok) {
      showToast(await apiError(response, "Couldn't save the product photo."));
      return;
    }
    setStoreProducts((prev) => prev.map((entry) => (entry.id === product.id ? { ...entry, images: [url, ...entry.images.filter((image) => image !== url)] } : entry)));
    logActivity(`Set the main photo of ${product.name}`);
    showToast(`Saved as the main photo of ${product.name}.`);
  }

  async function restoreLiveVersion() {
    const published = envelope?.published;
    if (!published) return;
    const saved = await saveSnapshot({ ...published, updatedAt: new Date().toISOString() }, "Draft reset to the live version.");
    if (saved) setHasChanges(false);
  }

  /** The store as Rex sees it: the current draft's design plus real products, for the builder prompt. */
  function currentStoreConfig(): StoreConfig | null {
    if (!draft || !envelope) return null;
    const fromDraft = snapshotToStoreConfig(draft, envelope.store.name);
    const realProducts = envelope.store.storeProducts.slice(0, 8).map((product, index) => ({
      name: product.name,
      subtitle: product.description?.slice(0, 80) ?? "",
      price: `${product.currency} ${product.retailPrice}`,
      color: fromDraft.products[index]?.color ?? "#2E7E78",
      ...(product.images[0] ? { imageUrl: product.images[0] } : {}),
    }));
    return {
      ...fromDraft,
      name: envelope.store.name,
      slug: envelope.store.slug,
      logoUrl: envelope.store.logoUrl ?? null,
      products: realProducts.length ? realProducts : fromDraft.products,
    };
  }

  // Ask Rex to update the editable store draft (streaming store-builder).
  async function sendRexPrompt(prompt: string) {
    if (!prompt.trim() || !draft || rexBusy) return;
    // "Build my store" / "Create a full online shop" goes to the real builder; edits stream through the chat.
    if (/^(please\s+)?(build|create|generate)\s+(me\s+)?(my|a|the)?\s*(whole|full|complete|entire|new)?\s*(online\s+)?(store|shop)\b/i.test(prompt.trim())) {
      setRexPrompt("");
      await buildWholeStore(prompt.trim());
      return;
    }

    const history = rexMessages.slice(1).map((m) => ({ role: m.role, content: m.content })).filter((m) => m.content.trim());
    const userMessage = newMessage("user", prompt);
    const placeholder = newMessage("assistant", "");
    const setPlaceholder = (patch: Partial<RexMessage>) =>
      setRexMessages((prev) => prev.map((m) => (m.id === placeholder.id ? { ...m, ...patch } : m)));
    setRexMessages((prev) => [...prev, userMessage, placeholder]);
    setRexBusy(true);
    setRexPrompt("");

    try {
      const memory = (envelope?.store.brandSettings?.onboardingMemory ?? {}) as Record<string, unknown>;
      const res = await fetch("/api/ai/store-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...history, { role: "user", content: prompt }],
          store: currentStoreConfig(),
          brandContext: {
            businessDescription: (typeof memory.businessDescription === "string" ? memory.businessDescription : null) ?? envelope?.store.description ?? undefined,
            category: typeof memory.category === "string" ? memory.category : undefined,
          },
          templateContext: envelope?.template ? {
            templateId: envelope.template.templateId,
            templateName: envelope.template.templateName,
          } : undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error(await apiError(res, "Rex couldn't start. Try again."));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let pendingConfig: StoreConfig | null = null;
      let streamError: string | null = null;
      let chips: string[] | undefined;

      const handle = (chunk: { type: string; text?: string; data?: unknown; message?: string }) => {
        if (chunk.type === "status" && chunk.message && !assistantText) setPlaceholder({ content: `${chunk.message}…` });
        else if (chunk.type === "token" && typeof chunk.text === "string") {
          assistantText += chunk.text;
          setPlaceholder({ content: assistantText });
        } else if (chunk.type === "store" && chunk.data && typeof chunk.data === "object") pendingConfig = chunk.data as StoreConfig;
        else if (chunk.type === "chips" && Array.isArray(chunk.data)) chips = (chunk.data as unknown[]).filter((chip): chip is string => typeof chip === "string");
        else if (chunk.type === "error") streamError = chunk.message ?? "Rex hit a problem.";
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try { handle(JSON.parse(line)); } catch { /* malformed line */ }
        }
      }
      if (buffer.trim()) {
        try { handle(JSON.parse(buffer)); } catch { /* ignore */ }
      }

      const config = pendingConfig as StoreConfig | null;
      let saveNote = "";
      if (config) {
        // Persist through the editor's hydrate path so the change survives a reload.
        const patchRes = await fetch("/api/store/editor", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hydrateFromStoreConfig: config }),
        });
        const patchJson = (await patchRes.json().catch(() => null)) as { data?: { draft?: StoreEditorSnapshot | null }; error?: { message?: string } } | null;
        if (patchRes.ok && patchJson?.data?.draft) {
          setDraft(patchJson.data.draft);
          setHasChanges(true);
          logActivity(`Rex: ${prompt.slice(0, 60)}`);
          showToast("Rex updated your draft. Review it in the preview.");
        } else {
          saveNote = `I couldn't save that change to your draft (${patchJson?.error?.message ?? "save failed"}). Try again.`;
        }
      }
      const finalError = streamError as string | null;
      setPlaceholder({
        content: [assistantText || (config ? "Done. Check the preview." : ""), finalError ?? "", saveNote].filter(Boolean).join("\n\n") || "Rex didn't return anything. Try rephrasing.",
        chips: finalError ? ["Try again"] : chips,
      });
    } catch (error) {
      setPlaceholder({ content: error instanceof Error ? error.message : "Rex had trouble connecting. Try again." });
    } finally {
      setRexBusy(false);
    }
  }

  // Publish changes to live store
  async function applyChanges() {
    if (publishing) return;
    setPublishing(true);
    try {
      const response = await fetch("/api/store/editor/publish", { method: "POST" });
      const json = (await response.json().catch(() => null)) as { data?: EditorEnvelope; billing?: StoreLaunchPricing; error?: { message?: string } } | null;
      if (response.status === 402 && json?.billing) {
        setLaunchPricing(json.billing);
        return;
      }
      if (!response.ok) throw new Error(json?.error?.message ?? "Could not publish changes.");
      if (json?.data) {
        setEnvelope((prev) => (prev ? { ...prev, published: json.data?.published ?? prev.published } : prev));
        setHasChanges(false);
        logActivity("Published to the live store");
        const storeSlug = json.data.store?.slug ?? envelope?.store?.slug;
        if (storeSlug) setPublishedStoreUrl(`/s/${storeSlug}`);
        else showToast("Changes published to your live store.");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Error publishing changes.");
    } finally {
      setPublishing(false);
    }
  }

  function handleCopyText(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard!`);
  }

  async function uploadRexAsset(file: File, folder: "brand" | "products" | "store-banners" = "brand") {
    setUploadingAsset(true);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("folder", folder);
      const response = await fetch("/api/upload", { method: "POST", body });
      const json = (await response.json()) as { data?: { publicUrl?: string }; error?: { message?: string } };
      if (!response.ok || !json.data?.publicUrl) {
        throw new Error(json.error?.message ?? "Upload failed.");
      }
      const asset = { url: json.data.publicUrl, label: file.name.replace(/\.[^.]+$/, "") || "Uploaded image" };
      setUploadedAssets((prev) => [asset, ...prev].slice(0, 12));
      setSelectedImageUrl(asset.url);
      showToast("Image uploaded and ready to use.");
      return asset;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Image upload failed.");
      return null;
    } finally {
      setUploadingAsset(false);
    }
  }

  function downloadAsset(url: string, label = "shopinbos-asset") {
    const link = document.createElement("a");
    link.href = url;
    link.download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shopinbos-asset"}.webp`;
    link.target = "_blank";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function renderAIToolWorkspace() {
    if (!activeTool || !envelope?.store || !draft) return null;
    const store = envelope.store;
    const tool = rexToolInfo[activeTool];
    const inputStyle = {
      width: "100%",
      border: "1px solid #D6DCE8",
      borderRadius: 8,
      padding: "10px 12px",
      fontSize: 13,
      color: "#122033",
      outline: "none",
      fontFamily: "inherit",
      background: "#FFFFFF",
    };
    const labelStyle = {
      display: "block",
      fontSize: 11,
      fontWeight: 700,
      color: "#52627A",
      marginBottom: 6,
      textTransform: "uppercase" as const,
      letterSpacing: ".4px",
    };
    const primaryButtonStyle = {
      background: rexUi.teal,
      color: "white",
      border: "none",
      borderRadius: 8,
      padding: "10px 14px",
      fontSize: 13,
      fontWeight: 700,
      cursor: "pointer",
      fontFamily: "inherit",
    };
    const secondaryButtonStyle = {
      background: "#F3F6FA",
      color: "#122033",
      border: "1px solid #D6DCE8",
      borderRadius: 8,
      padding: "9px 12px",
      fontSize: 12,
      fontWeight: 650,
      cursor: "pointer",
      fontFamily: "inherit",
    };
    const sectionStyle = {
      background: "#FFFFFF",
      border: "1px solid #DCE3EE",
      borderRadius: 12,
      padding: 18,
      boxShadow: "0 14px 34px rgba(18,32,51,.08)",
    };
    const conceptLogos = generatedLogos.length
      ? generatedLogos
      : [
          { style: "classic-seal", label: "Classic seal", url: "", palette: { primary: rexUi.navy, secondary: rexUi.teal, accent: "#C9A96E" } },
          { style: "modern-wordmark", label: "Modern wordmark", url: "", palette: { primary: "#FFFFFF", secondary: rexUi.teal, accent: rexUi.navy } },
          { style: "premium-badge", label: "Premium badge", url: "", palette: { primary: "#C9A96E", secondary: "#B8860B", accent: "#FFFFFF" } },
        ];

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          background: "#EEF3F8",
          overflowY: "auto",
          padding: "22px 26px 42px",
        }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: rexUi.tealDark, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>
                {tool.eyebrow}
              </div>
              <h1 style={{ margin: 0, color: "#0D1830", fontSize: 28, lineHeight: 1.1, fontFamily: "var(--serif)" }}>
                {tool.title}
              </h1>
              <p style={{ margin: "8px 0 0", color: "#52627A", fontSize: 13, maxWidth: 680, lineHeight: 1.55 }}>
                {tool.description}
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button type="button" onClick={() => setActiveTool(null)} style={secondaryButtonStyle}>
                Back to live preview
              </button>
              <button type="button" onClick={() => setPublishConfirmOpen(true)} disabled={publishing} style={{ ...primaryButtonStyle, opacity: publishing ? 0.6 : 1 }}>
                {publishing ? "Publishing..." : "Publish changes"}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 440px) minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={sectionStyle}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#122033", marginBottom: 14 }}>Inputs</div>

                {activeTool === "logo" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <label>
                      <span style={labelStyle}>Brand name</span>
                      <input placeholder="Brand name" value={logoName} onChange={(e) => setLogoName(e.target.value)} style={inputStyle} />
                    </label>
                    <label>
                      <span style={labelStyle}>Tagline or promise</span>
                      <input placeholder="Luxury hair, delivered fast" value={logoTagline} onChange={(e) => setLogoTagline(e.target.value)} style={inputStyle} />
                    </label>
                    <label>
                      <span style={labelStyle}>Logo direction</span>
                      <select value={logoStyle} onChange={(e) => setLogoStyle(e.target.value)} style={inputStyle}>
                        <option>Luxury / High-end</option>
                        <option>Modern / Minimal</option>
                        <option>Bold / Playful</option>
                        <option>Traditional / Classic</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => void generateLogo()} disabled={toolBusy === "logo"} style={{ ...primaryButtonStyle, opacity: toolBusy === "logo" ? 0.6 : 1 }}>
                      {toolBusy === "logo" ? "Generating…" : "Generate logo concepts"}
                    </button>
                    <label style={{ ...secondaryButtonStyle, textAlign: "center" }}>
                      {uploadingAsset ? "Uploading..." : "Upload existing logo"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        disabled={uploadingAsset}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          if (file) void uploadRexAsset(file, "brand").then((asset) => {
                            if (asset) void applyLogo(asset.url);
                          });
                        }}
                      />
                    </label>
                  </div>
                )}

                {activeTool === "image" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <div style={{ height: 180, borderRadius: 12, overflow: "hidden", background: "#DCE3EE", display: "grid", placeItems: "center" }}>
                      {selectedImage ? (
                        <img src={selectedImage.url} alt={selectedImage.label} style={{ width: "100%", height: "100%", objectFit: "contain", background: "#F3F6FA" }} />
                      ) : (
                        <span style={{ color: "#52627A", fontSize: 12, padding: 16, textAlign: "center" }}>Upload a photo, or pick one of your product photos on the right.</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#52627A" }}>AI edits (OpenAI image model; each uses one image credit)</div>
                    {IMAGE_EDIT_ACTIONS.map((action) => (
                      <button
                        key={action.kind}
                        type="button"
                        disabled={!selectedImage || Boolean(toolBusy)}
                        onClick={() => void editSelectedImage(action.kind, action.label)}
                        style={{ ...secondaryButtonStyle, opacity: !selectedImage || toolBusy ? 0.6 : 1 }}
                      >
                        {toolBusy === action.kind ? "Working…" : action.label}
                      </button>
                    ))}
                    <div style={{ fontSize: 11, color: "#52627A" }}>Quick fixes (done in your browser, free)</div>
                    <button type="button" disabled={!selectedImage || Boolean(toolBusy)} onClick={() => void processSelectedImage("square")} style={{ ...secondaryButtonStyle, opacity: !selectedImage || toolBusy ? 0.6 : 1 }}>
                      {toolBusy === "square" ? "Cropping…" : "Square crop for product cards (1200px)"}
                    </button>
                    <button type="button" disabled={!selectedImage || Boolean(toolBusy)} onClick={() => void processSelectedImage("compress")} style={{ ...secondaryButtonStyle, opacity: !selectedImage || toolBusy ? 0.6 : 1 }}>
                      {toolBusy === "compress" ? "Compressing…" : "Resize and compress for faster loading"}
                    </button>
                    <label style={{ ...primaryButtonStyle, textAlign: "center" }}>
                      {uploadingAsset ? "Uploading..." : "Upload an image"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: "none" }}
                        disabled={uploadingAsset}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          if (file) void uploadRexAsset(file, "products");
                        }}
                      />
                    </label>
                  </div>
                )}

                {activeTool === "product-img" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <label>
                      <span style={labelStyle}>Prompt</span>
                      <textarea value={productPrompt} onChange={(e) => setProductPrompt(e.target.value)} placeholder="e.g. Shea butter in an amber jar on a wooden table, soft morning light, white background" style={{ ...inputStyle, minHeight: 130, resize: "vertical" }} />
                    </label>
                    <label>
                      <span style={labelStyle}>Output format</span>
                      <select value={productFormat} onChange={(e) => setProductFormat(e.target.value)} style={inputStyle}>
                        <option>1:1 Square</option>
                        <option>4:3 Landscape</option>
                        <option>3:4 Portrait</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => void generateProductImage()} disabled={toolBusy === "product-img"} style={{ ...primaryButtonStyle, opacity: toolBusy === "product-img" ? 0.6 : 1 }}>
                      {toolBusy === "product-img" ? "Generating… (up to a minute)" : "Generate product image"}
                    </button>
                    <label style={{ ...secondaryButtonStyle, textAlign: "center" }}>
                      {uploadingAsset ? "Uploading..." : "Upload product image"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: "none" }}
                        disabled={uploadingAsset}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          if (file) void uploadRexAsset(file, "products");
                        }}
                      />
                    </label>
                  </div>
                )}

                {activeTool === "banner" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <label>
                      <span style={labelStyle}>Campaign headline</span>
                      <input value={bannerHeadline} onChange={(e) => setBannerHeadline(e.target.value)} placeholder="e.g. Aso Ebi season: 20% off all bundles" style={inputStyle} />
                    </label>
                    <label>
                      <span style={labelStyle}>Placement</span>
                      <select value={bannerFormat} onChange={(e) => setBannerFormat(e.target.value)} style={inputStyle}>
                        <option>Store banner</option>
                        <option>WhatsApp flyer</option>
                        <option>Instagram post</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => void generateBanner()} disabled={toolBusy === "banner"} style={{ ...primaryButtonStyle, opacity: toolBusy === "banner" ? 0.6 : 1 }}>
                      {toolBusy === "banner" ? "Creating… (up to a minute)" : "Create banner"}
                    </button>
                    <label style={{ ...secondaryButtonStyle, textAlign: "center" }}>
                      {uploadingAsset ? "Uploading..." : "Upload banner image"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        style={{ display: "none" }}
                        disabled={uploadingAsset}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          if (file) void uploadRexAsset(file, "store-banners");
                        }}
                      />
                    </label>
                  </div>
                )}

                {activeTool === "copy" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <label>
                      <span style={labelStyle}>Product or offer</span>
                      <input value={copyProductName} onChange={(e) => setCopyProductName(e.target.value)} placeholder="e.g. Brazilian Body Wave 18 inch" style={inputStyle} />
                    </label>
                    <label>
                      <span style={labelStyle}>Copy type</span>
                      <select value={copyType} onChange={(e) => { setCopyType(e.target.value); setCopyResult(""); }} style={inputStyle}>
                        <option>Product description</option>
                        <option>Short tagline</option>
                        <option>WhatsApp caption</option>
                        <option>SEO meta</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => void writeCopy()} disabled={toolBusy === "copy"} style={{ ...primaryButtonStyle, opacity: toolBusy === "copy" ? 0.6 : 1 }}>
                      {toolBusy === "copy" ? "Writing…" : "Write copy"}
                    </button>
                  </div>
                )}

                {activeTool === "palette" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <label>
                      <span style={labelStyle}>Brand vibe</span>
                      <input value={paletteVibe} onChange={(e) => setPaletteVibe(e.target.value)} placeholder="Elegant, trusted, premium..." style={inputStyle} />
                    </label>
                    <button type="button" onClick={() => void generatePalette()} disabled={toolBusy === "palette"} style={{ ...primaryButtonStyle, opacity: toolBusy === "palette" ? 0.6 : 1 }}>
                      {toolBusy === "palette" ? "Generating…" : "Generate palettes"}
                    </button>
                  </div>
                )}
              </div>

              <div style={sectionStyle}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#122033", marginBottom: 10 }}>Store context</div>
                {[
                  ["Store", store.name],
                  ["Slug", `${store.slug}.shopinbos.store`],
                  ["Currency", store.currency],
                  ["Products", `${storeProducts.length || store.storeProducts.length} in your store`],
                  ["Pages", `${draft.pages.length} editable drafts`],
                  ["Current page", currentPage?.title ?? selectedPage],
                  ["Template", envelope.template?.templateName ?? draft.templateName],
                  ["Images this session", `${uploadedAssets.length + generatedImages.length}`],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid #EEF2F6", fontSize: 12 }}>
                    <span style={{ color: "#6B7890" }}>{label}</span>
                    <span style={{ color: "#122033", fontWeight: 700, textAlign: "right" }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: 14 }}>
              {activeTool === "logo" && (
                <div style={sectionStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#122033" }}>Logo concepts</div>
                      <div style={{ color: "#6B7890", fontSize: 12, marginTop: 3 }}>Click a generated concept to apply it to your store logo.</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                    {conceptLogos.slice(0, 3).map((logo, index) => (
                      <button
                        key={logo.style}
                        type="button"
                        onClick={() => logo.url ? void applyLogo(logo.url) : showToast("Generate logo concepts first.")}
                        style={{ border: "1px solid #DCE3EE", borderRadius: 12, background: "#FFFFFF", overflow: "hidden", padding: 0, cursor: "pointer", textAlign: "left" }}
                      >
                        <div
                          style={{
                            height: 190,
                            background: logo.url ? `url(${logo.url}) center/cover` : index === 1 ? "#F8FAFC" : index === 2 ? "linear-gradient(135deg,#C9A96E,#B8860B)" : rexUi.navy,
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          {!logo.url && (
                            <div style={{ textAlign: "center", color: index === 1 ? rexUi.navy : "#FFFFFF" }}>
                              <div style={{ width: 44, height: 44, margin: "0 auto 12px", borderRadius: 14, background: index === 1 ? rexUi.teal : "rgba(255,255,255,.18)", display: "grid", placeItems: "center", fontWeight: 900 }}>
                                {(logoName || store.name || "S").slice(0, 2).toUpperCase()}
                              </div>
                              <div style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 800, letterSpacing: ".5px" }}>
                                {(logoName || store.name || "Shopinbos").toUpperCase()}
                              </div>
                              <div style={{ width: 72, height: 2, background: rexUi.teal, margin: "10px auto" }} />
                              <div style={{ fontSize: 10, letterSpacing: "1.4px", opacity: 0.72 }}>{logo.label.toUpperCase()}</div>
                            </div>
                          )}
                        </div>
                        <div style={{ padding: 12 }}>
                          <div style={{ color: "#122033", fontSize: 13, fontWeight: 800 }}>{logo.label}</div>
                          <div style={{ color: "#6B7890", fontSize: 11, marginTop: 3 }}>{logo.url ? "Ready to apply" : "Preview concept"}</div>
                          {logo.url ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                downloadAsset(logo.url, logo.label);
                              }}
                              style={{ ...secondaryButtonStyle, width: "100%", marginTop: 10, padding: "7px 10px" }}
                            >
                              Download
                            </button>
                          ) : null}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(activeTool === "product-img" || activeTool === "image" || activeTool === "banner") && (
                <div style={sectionStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", marginBottom: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "#122033" }}>Your images</div>
                      <div style={{ color: "#6B7890", fontSize: 12, marginTop: 3 }}>
                        Click an image to select it. &ldquo;Use on {currentPage?.title ?? "page"}&rdquo; saves it to the draft page selected in the preview bar.
                      </div>
                    </div>
                    {storeProducts.length > 0 && (
                      <label style={{ fontSize: 11, color: "#52627A" }}>
                        Product for &ldquo;Set as product photo&rdquo;{" "}
                        <select value={targetProductId} onChange={(e) => setTargetProductId(e.target.value)} style={{ ...inputStyle, width: 200, padding: "6px 8px", fontSize: 12 }}>
                          {storeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                  {imageLibrary.length === 0 ? (
                    <div style={{ border: "1px dashed #C9D3E1", borderRadius: 12, padding: 28, textAlign: "center", color: "#52627A", fontSize: 13 }}>
                      No images yet. Generate one, or upload a photo on the left.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                      {imageLibrary.map((image) => (
                        <div
                          key={image.url}
                          style={{ border: selectedImage?.url === image.url ? `2px solid ${rexUi.teal}` : "1px solid #DCE3EE", borderRadius: 12, background: "#FFFFFF", overflow: "hidden", textAlign: "left" }}
                        >
                          <button type="button" onClick={() => setSelectedImageUrl(image.url)} style={{ display: "block", width: "100%", padding: 0, border: "none", cursor: "pointer", background: "#F3F6FA" }}>
                            <img src={image.url} alt={image.label} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }} />
                          </button>
                          <div style={{ padding: "8px 10px 4px", color: "#122033", fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{image.label}</div>
                          <div style={{ display: "grid", gap: 6, padding: "4px 10px 10px" }}>
                            <button type="button" onClick={() => void applyImageToSelectedPage(image.url)} style={{ ...primaryButtonStyle, padding: "7px 8px", fontSize: 11 }}>
                              Use on {currentPage?.title ?? "page"}
                            </button>
                            {storeProducts.length > 0 && (
                              <button type="button" onClick={() => void setAsProductPhoto(image.url)} style={{ ...secondaryButtonStyle, padding: "7px 8px", fontSize: 11 }}>
                                Set as product photo
                              </button>
                            )}
                            <button type="button" onClick={() => downloadAsset(image.url, image.label)} style={{ ...secondaryButtonStyle, padding: "7px 8px", fontSize: 11 }}>
                              Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTool === "copy" && (
                <div style={sectionStyle}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#122033", marginBottom: 12 }}>Your copy</div>
                  {copyResult ? (
                    <div style={{ display: "grid", gap: 12 }}>
                      <textarea value={copyResult} onChange={(e) => setCopyResult(e.target.value)} style={{ ...inputStyle, minHeight: 160, lineHeight: 1.6, resize: "vertical" }} />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <button type="button" onClick={() => handleCopyText(copyResult, copyType)} style={secondaryButtonStyle}>Copy text</button>
                        {copyType === "Short tagline" && (
                          <button type="button" onClick={() => void applyCopy()} style={primaryButtonStyle}>Use as homepage tagline</button>
                        )}
                        {copyType === "Product description" && storeProducts.length > 0 && (
                          <>
                            <select value={targetProductId} onChange={(e) => setTargetProductId(e.target.value)} style={{ ...inputStyle, width: 220 }}>
                              {storeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                            </select>
                            <button type="button" onClick={() => void applyCopy()} style={primaryButtonStyle}>Save to this product</button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p style={{ color: "#52627A", margin: 0, lineHeight: 1.7, fontSize: 13 }}>
                      Pick a copy type and press &ldquo;Write copy&rdquo;. The text appears here for you to edit, copy, or save to your store.
                    </p>
                  )}
                </div>
              )}

              {activeTool === "palette" && (
                <div style={sectionStyle}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#122033", marginBottom: 12 }}>Palettes</div>
                  {generatedPalettes.length === 0 ? (
                    <p style={{ color: "#52627A", margin: 0, lineHeight: 1.7, fontSize: 13 }}>
                      Describe the vibe and press &ldquo;Generate palettes&rdquo;. Click one to apply it to your draft; it goes live when you publish.
                    </p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
                      {generatedPalettes.slice(0, 5).map((palette) => (
                        <button
                          key={palette.id}
                          type="button"
                          onClick={() => void applyPalette(palette)}
                          style={{ border: "1px solid #E3EAE7", borderRadius: 12, background: "#FFFFFF", padding: 12, textAlign: "left", cursor: "pointer" }}
                        >
                          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                            {Object.entries(palette.colors).map(([key, color]) => (
                              <span key={key} title={`${key} ${color}`} style={{ flex: 1, height: 40, borderRadius: 6, background: color, border: "1px solid rgba(0,0,0,.08)" }} />
                            ))}
                          </div>
                          <div style={{ fontWeight: 800, color: "#122033", fontSize: 13 }}>{palette.name}</div>
                          <div style={{ color: "#6B7890", fontSize: 11, marginTop: 2 }}>{palette.personality || "Click to apply this palette."}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D1B35",
          color: "white",
          fontFamily: "var(--sans)",
          gap: 14,
        }}
      >
        <div style={{ width: 44, height: 44, background: "#0FA493", borderRadius: 14, display: "grid", placeItems: "center", fontSize: 22 }}>✦</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Loading Rex AI workspace…</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,.45)" }}>Connecting to your store</div>
      </div>
    );
  }

  if (!envelope?.store || !draft) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D1B35",
          color: "white",
          fontFamily: "var(--sans)",
          gap: 16,
          textAlign: "center",
          padding: 24,
        }}
      >
        <div style={{ width: 52, height: 52, background: "rgba(232,97,74,.2)", border: "1px solid rgba(232,97,74,.4)", borderRadius: 16, display: "grid", placeItems: "center", fontSize: 24 }}>⚠</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>Rex couldn&apos;t connect to your store</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.55)", maxWidth: 380, lineHeight: 1.6 }}>
          Your store workspace couldn&apos;t be loaded. This usually means your store isn&apos;t set up yet, or there was a temporary connection issue.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            onClick={() => { setLoading(true); window.location.reload(); }}
            style={{ background: "#0FA493", color: "white", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Retry
          </button>
          <button
            onClick={() => router.push("/onboarding?role=seller")}
            style={{ background: "rgba(255,255,255,.1)", color: "white", border: "1px solid rgba(255,255,255,.15)", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Set up store
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "52px 1fr",
        height: "100vh",
        minHeight: "100vh",
        background: rexUi.navy,
        color: "var(--g900)",
        fontFamily: "var(--sans)",
        overflow: "hidden",
      }}
    >
      <StoreLaunchBillingModal open={Boolean(launchPricing)} pricing={launchPricing} onClose={() => setLaunchPricing(null)} />
      {/* ── Topbar ── */}
      <header
        style={{
          height: 52,
          background: rexUi.navy,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 12,
          flexShrink: 0,
          borderBottom: `1px solid ${rexUi.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", minWidth: 142 }} onClick={() => requestNavigate("/home")}>
          <BrandLogo theme="light" className="w-[132px]" priority />
        </div>

        <div style={{ width: 1, height: 22, background: "rgba(255,255,255,.1)" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <span
            style={{ color: "rgba(255,255,255,.45)", cursor: "pointer" }}
            onClick={() => requestNavigate("/builder/editor")}
          >
            Store Editor
          </span>
          <span style={{ color: "rgba(255,255,255,.2)" }}>/</span>
          <span style={{ color: "rgba(255,255,255,.8)", fontWeight: 500 }}>Rex AI Builder</span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => requestNavigate("/builder/editor")}
            style={{
              background: "rgba(255,255,255,.08)",
              border: "1px solid rgba(255,255,255,.12)",
              color: "rgba(255,255,255,.8)",
              fontSize: 12,
              fontWeight: 500,
              padding: "5px 12px",
              borderRadius: 8,
              cursor: "pointer",
              transition: ".15s",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,.14)";
              e.currentTarget.style.color = "white";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "rgba(255,255,255,.08)";
              e.currentTarget.style.color = "rgba(255,255,255,.8)";
            }}
          >
            Back to Editor
          </button>
          <button
            onClick={() => setPublishConfirmOpen(true)}
            disabled={publishing}
            style={{
              background: "var(--teal)",
              border: "none",
              color: "white",
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 16px",
              borderRadius: 8,
              cursor: "pointer",
              transition: ".15s",
              opacity: publishing ? 0.6 : 1,
            }}
            onMouseOver={(e) => {
              if (!publishing) e.currentTarget.style.background = "var(--teal2)";
            }}
            onMouseOut={(e) => {
              if (!publishing) e.currentTarget.style.background = "var(--teal)";
            }}
          >
            {publishing ? "Publishing..." : "Publish changes"}
          </button>
        </div>
      </header>

      {/* ── Body Layout ── */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* ── LEFT PANEL (Navy Chat & Tools) ── */}
        <aside
          style={{
            width: 380,
            background: rexUi.panel,
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            borderRight: `1px solid ${rexUi.border}`,
            boxShadow: "12px 0 28px rgba(8,19,41,.18)",
            minHeight: 0,
          }}
        >
          {/* Rex Branding Header */}
          <div
            style={{
              padding: "20px 18px 14px",
              background: `linear-gradient(180deg, ${rexUi.navy} 0%, ${rexUi.panelRaised} 100%)`,
              borderBottom: `1px solid ${rexUi.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <div
                style={{
                  width: 50,
                  height: 50,
                  background: "#FFFFFF",
                  borderRadius: 14,
                  overflow: "hidden",
                  flexShrink: 0,
                  border: "2px solid rgba(255,255,255,.22)",
                }}
              >
                <img src={rexImage} alt="Rex AI Builder" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
              </div>
              <div>
                <div style={{ color: "white", fontWeight: 700, fontSize: 15, fontFamily: "var(--serif)" }}>
                  Rex AI Builder
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1 }}>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      background: "#4CE88A",
                      borderRadius: "50%",
                    }}
                  />
                  <span style={{ whiteSpace: "nowrap", fontSize: 10, color: "#4CE88A" }}>
                    Active — Building your store
                  </span>
                </div>
              </div>
            </div>
            <p style={{ fontSize: 11, color: rexUi.muted, lineHeight: 1.5, marginTop: 6, margin: "6px 0 0" }}>
              Tell Rex what kind of store you want. Describe your products, brand or style — Rex will design and build it.
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {[
                `${envelope.store.storeProducts.length} products ready`,
                `${envelope.store.currency} pricing`,
                draft.pages.length ? `${draft.pages.length} editable pages` : "Draft ready",
              ].map((item) => (
                <span key={item} style={{ border: "1px solid rgba(255,255,255,.14)", borderRadius: 999, color: rexUi.text, background: "rgba(255,255,255,.07)", padding: "4px 8px", fontSize: 10, fontWeight: 650 }}>
                  {item}
                </span>
              ))}
            </div>
          </div>
          {/* Panel Tabs */}
          <div style={{ display: "flex", background: rexUi.panelRaised, flexShrink: 0, borderBottom: `1px solid ${rexUi.border}` }}>
            {(["chat", "tools", "history"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveLeftTab(tab)}
                style={{
                  flex: 1,
                  background: activeLeftTab === tab ? "#F8FAFC" : "transparent",
                  border: "none",
                  color: activeLeftTab === tab ? rexUi.navy : rexUi.muted,
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "12px 4px 10px",
                  cursor: "pointer",
                  borderBottom: activeLeftTab === tab ? `3px solid ${rexUi.teal}` : "3px solid transparent",
                  textTransform: "uppercase",
                  letterSpacing: ".4px",
                  fontFamily: "inherit",
                }}
              >
                {tab === "chat" ? "Chat" : tab === "tools" ? "AI Tools" : "History"}
              </button>
            ))}
          </div>

          {/* Chat Tab Panel */}
          {activeLeftTab === "chat" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: rexUi.panel }}>
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                {rexMessages.map((msg, idx) => (
                  <div
                    key={msg.id}
                    style={{
                      background: msg.role === "user" ? rexUi.tealDark : "#F8FAFC",
                      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "88%",
                      borderRadius:
                        msg.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                      padding: "10px 12px",
                      fontSize: 12,
                      color: msg.role === "user" ? "#FFFFFF" : "#102033",
                      lineHeight: 1.6,
                      border: msg.role === "user" ? "1px solid rgba(255,255,255,.08)" : "1px solid rgba(15,29,56,.08)",
                      boxShadow: "0 8px 18px rgba(3,10,24,.12)",
                    }}
                  >
                    {msg.role === "assistant" && (
                      <div
                        style={{
                          fontSize: 8,
                          fontWeight: 700,
                          color: rexUi.tealDark,
                          textTransform: "uppercase",
                          letterSpacing: ".6px",
                          marginBottom: 4,
                        }}
                      >
                        Rex AI
                      </div>
                    )}
                    <div style={{ whiteSpace: "pre-wrap" }}>{msg.content || (rexBusy ? "…" : "")}</div>
                    {msg.role === "assistant" && msg.chips?.length && idx === rexMessages.length - 1 && !rexBusy ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                        {msg.chips.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => (/missing store pages/i.test(chip) ? void addMissingPages() : void sendRexPrompt(chip))}
                            style={{ border: "1px solid rgba(15,29,56,.16)", background: "#FFFFFF", borderRadius: 999, padding: "4px 9px", fontSize: 10.5, color: rexUi.tealDark, cursor: "pointer", fontFamily: "inherit", fontWeight: 650 }}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}

                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 4 }}>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: rexUi.faint,
                      textTransform: "uppercase",
                      letterSpacing: ".6px",
                      marginBottom: 2,
                    }}
                  >
                    Quick starts
                  </div>
                  {[
                    { label: "Build my whole store with Rex (design, pages, sample products, images)", run: () => buildWholeStore("Build my whole store: design, homepage, pages, products and images.") },
                    { label: "Make my store look more premium and conversion ready", run: () => sendRexPrompt("Make my store look more premium and conversion ready") },
                    { label: "Rewrite my homepage hero for my real customers", run: () => sendRexPrompt("Rewrite my homepage hero for my real customers") },
                    { label: "Add any missing store pages (cart, checkout, wishlist, FAQ…)", run: () => addMissingPages() },
                  ].map(({ label: chip, run }) => (
                    <button
                      key={chip}
                      onClick={() => void run()}
                      disabled={rexBusy}
                      style={{
                        background: rexUi.panelRaised,
                        border: `1px solid ${rexUi.border}`,
                        borderRadius: 7,
                        padding: "8px 10px",
                        fontSize: 11,
                        color: rexUi.text,
                        cursor: "pointer",
                        textAlign: "left",
                        transition: ".15s",
                        fontFamily: "inherit",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = rexUi.panelSoft;
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = rexUi.panelRaised;
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Input Container */}
              <div
                style={{
                  padding: 10,
                  borderTop: `1px solid ${rexUi.border}`,
                  background: rexUi.panelRaised,
                  display: "flex",
                  gap: 6,
                  alignItems: "flex-end",
                }}
              >
                <textarea
                  value={rexPrompt}
                  onChange={(e) => setRexPrompt(e.target.value)}
                  placeholder="Describe what you want Rex to build..."
                  disabled={rexBusy}
                  style={{
                    flex: 1,
                    background: "#FFFFFF",
                    border: "1px solid rgba(15,29,56,.18)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontSize: 11,
                    color: "#102033",
                    resize: "none",
                    height: 60,
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                    outline: "none",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendRexPrompt(rexPrompt);
                    }
                  }}
                />
                <button
                  onClick={() => void sendRexPrompt(rexPrompt)}
                  disabled={rexBusy || !rexPrompt.trim()}
                  style={{
                    background: rexUi.teal,
                    border: "none",
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    cursor: "pointer",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 14 14" fill="white" width="13" height="13">
                    <path d="M13 7L1 1l2.5 6L1 13z" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* AI Tools Tab Panel */}
          {activeLeftTab === "tools" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 12, background: rexUi.panel }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: rexUi.faint,
                  textTransform: "uppercase",
                  letterSpacing: ".7px",
                  marginBottom: 10,
                }}
              >
                AI Creative Tools
              </div>

              {[
                {
                  id: "logo",
                  title: "Logo Builder",
                  desc: "Generate a professional logo for your brand",
                  bg: "linear-gradient(135deg, #5B6FD4, #8B4DBF)",
                  icon: (
                    <svg viewBox="0 0 16 16" fill="white" width="14">
                      <path d="M8 1l2 4h4l-3 3 1 4-4-2.5L4 12l1-4-3-3h4z" />
                    </svg>
                  ),
                },
                {
                  id: "image",
                  title: "AI Image Editor",
                  desc: "Remove backgrounds, enhance photos, resize",
                  bg: "linear-gradient(135deg, #0E9E85, #0bb898)",
                  icon: (
                    <svg viewBox="0 0 16 16" fill="white" width="14">
                      <rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="white" strokeWidth="1.2" />
                      <path d="M1 10l4-4 3 3 2-2 5 5" stroke="white" strokeWidth="1.2" fill="none" />
                      <circle cx="5" cy="5" r="1.5" fill="white" />
                    </svg>
                  ),
                },
                {
                  id: "product-img",
                  title: "Product Image AI",
                  desc: "Generate studio-quality product photos",
                  bg: "linear-gradient(135deg, #E8614A, #ef7a65)",
                  icon: (
                    <svg viewBox="0 0 16 16" fill="white" width="14">
                      <rect x="1" y="3" width="10" height="10" rx="1.5" fill="none" stroke="white" strokeWidth="1.2" />
                      <path d="M11 6l3-2v8l-3-2" stroke="white" strokeWidth="1.2" fill="none" />
                      <circle cx="4.5" cy="6.5" r="1.2" fill="white" />
                    </svg>
                  ),
                },
                {
                  id: "banner",
                  title: "Banner & Ad Maker",
                  desc: "Create promo banners, WhatsApp flyers",
                  bg: "linear-gradient(135deg, #C9A96E, #B8860B)",
                  icon: (
                    <svg viewBox="0 0 16 16" fill="white" width="14">
                      <rect x="1" y="3" width="14" height="10" rx="1.5" fill="none" stroke="white" strokeWidth="1.2" />
                      <line x1="4" y1="7" x2="12" y2="7" stroke="white" strokeWidth="1.2" />
                      <line x1="4" y1="10" x2="9" y2="10" stroke="white" strokeWidth="1" />
                    </svg>
                  ),
                },
                {
                  id: "copy",
                  title: "AI Copy Writer",
                  desc: "Write product descriptions, taglines, ads",
                  bg: "linear-gradient(135deg, #2D6A4F, #52B788)",
                  icon: (
                    <svg viewBox="0 0 16 16" fill="none" width="14">
                      <path d="M3 2h10v12H3z" stroke="white" strokeWidth="1.2" />
                      <line x1="5" y1="5" x2="11" y2="5" stroke="white" strokeWidth="1" />
                      <line x1="5" y1="8" x2="11" y2="8" stroke="white" strokeWidth="1" />
                      <line x1="5" y1="11" x2="8" y2="11" stroke="white" strokeWidth="1" />
                    </svg>
                  ),
                },
                {
                  id: "palette",
                  title: "Brand Colour Palette",
                  desc: "Generate a palette that matches your brand",
                  isPalette: true,
                },
              ].map((tool) => (
                <div
                  key={tool.id}
                  onClick={() => setActiveTool(tool.id as any)}
                  style={{
                    background: activeTool === tool.id ? "rgba(15,164,147,.2)" : rexUi.panelRaised,
                    border: activeTool === tool.id ? `1px solid ${rexUi.teal}` : `1px solid ${rexUi.border}`,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                    cursor: "pointer",
                    transition: ".15s",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                  onMouseOver={(e) => {
                    if (activeTool !== tool.id) e.currentTarget.style.background = rexUi.panelSoft;
                  }}
                  onMouseOut={(e) => {
                    if (activeTool !== tool.id) e.currentTarget.style.background = rexUi.panelRaised;
                  }}
                >
                  {tool.isPalette ? (
                    <div style={{ width: 36, height: 36, borderRadius: 8, overflow: "hidden", display: "flex", flexShrink: 0 }}>
                      <div style={{ flex: 1, background: "#0D1B35" }} />
                      <div style={{ flex: 1, background: "#0E9E85" }} />
                      <div style={{ flex: 1, background: "#E8614A" }} />
                      <div style={{ flex: 1, background: "#C9A96E" }} />
                    </div>
                  ) : (
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        background: tool.bg,
                        borderRadius: 8,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      {tool.icon}
                    </div>
                  )}

                  <div>
                    <div style={{ color: rexUi.text, fontSize: 12, fontWeight: 600, marginBottom: 1 }}>
                      {tool.title}
                    </div>
                    <div style={{ color: rexUi.muted, fontSize: 10 }}>{tool.desc}</div>
                  </div>
                  <svg viewBox="0 0 8 14" fill="none" width="8" style={{ marginLeft: "auto", flexShrink: 0 }}>
                    <path d="M1 1l6 6-6 6" stroke={rexUi.faint} strokeWidth="1.5" />
                  </svg>
                </div>
              ))}
            </div>
          )}

          {/* History Tab Panel */}
          {activeLeftTab === "history" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 12, background: rexUi.panel }}>
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: rexUi.faint,
                  textTransform: "uppercase",
                  letterSpacing: ".7px",
                  marginBottom: 10,
                }}
              >
                Versions
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ background: rexUi.panelRaised, border: `1px solid ${rexUi.border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ color: rexUi.text, fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Draft (what you&apos;re editing)</div>
                  <div style={{ color: rexUi.muted, fontSize: 10 }}>
                    Last saved {draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : "just now"}
                  </div>
                </div>
                <div style={{ background: rexUi.panelRaised, border: `1px solid ${rexUi.border}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ color: rexUi.text, fontSize: 11, fontWeight: 600, marginBottom: 2 }}>Live store</div>
                  <div style={{ color: rexUi.muted, fontSize: 10 }}>
                    {envelope.published ? `Published version from ${new Date(envelope.published.updatedAt).toLocaleString()}` : "Not published yet"}
                  </div>
                  {envelope.published ? (
                    <button
                      type="button"
                      onClick={() => void restoreLiveVersion()}
                      style={{ marginTop: 8, background: "transparent", border: `1px solid ${rexUi.border}`, color: rexUi.text, borderRadius: 6, padding: "5px 9px", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Discard draft changes (go back to the live version)
                    </button>
                  ) : null}
                </div>
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: rexUi.faint, textTransform: "uppercase", letterSpacing: ".7px", margin: "16px 0 8px" }}>
                This session
              </div>
              {activity.length === 0 ? (
                <div style={{ color: rexUi.muted, fontSize: 11 }}>Changes you make with Rex in this session are listed here.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {activity.map((entry) => (
                    <div key={`${entry.at}-${entry.title}`} style={{ background: rexUi.panelRaised, border: `1px solid ${rexUi.border}`, borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ color: rexUi.text, fontSize: 11, fontWeight: 500 }}>{entry.title}</div>
                      <div style={{ color: rexUi.muted, fontSize: 10 }}>{new Date(entry.at).toLocaleTimeString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── RIGHT PANEL (Tools + Preview Frame) ── */}
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            background: "#D8DEE8",
            minWidth: 0,
            minHeight: 0,
            position: "relative",
          }}
        >
          {/* ── Address bar / Viewport toggle bar ── */}
          {activeTool ? renderAIToolWorkspace() : null}

          <div
            style={{
              height: 38,
              background: "white",
              borderBottom: "1px solid var(--g200)",
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", background: "var(--g50)", border: "1px solid var(--g200)", borderRadius: 6, overflow: "hidden" }}>
              {(["desktop", "mobile"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setDevice(mode)}
                  style={{
                    border: "none",
                    padding: "4px 8px",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    background: device === mode ? "var(--navy)" : "transparent",
                    color: device === mode ? "white" : "var(--g400)",
                    fontFamily: "inherit",
                    fontWeight: device === mode ? 600 : 400,
                  }}
                >
                  {mode === "desktop" ? "▭ Desktop" : "▯ Mobile"}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 3, margin: "0 4px" }}>
              {draft.pages.map((page) => page.pageType).slice(0, 10).map((pType) => (
                <button
                  key={pType}
                  onClick={() => setSelectedPage(pType)}
                  style={{
                    background: selectedPage === pType ? "var(--teal-soft)" : "transparent",
                    color: selectedPage === pType ? "var(--teal-deep)" : "var(--g500)",
                    border: "none",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: selectedPage === pType ? 600 : 500,
                    padding: "4px 8px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textTransform: "capitalize",
                  }}
                >
                  {pType}
                </button>
              ))}
            </div>

            <div
              style={{
                flex: 1,
                background: "var(--g50)",
                border: "1px solid var(--g200)",
                borderRadius: 20,
                padding: "4px 12px",
                fontSize: 11,
                color: "var(--g500)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                minWidth: 100,
              }}
            >
              <svg viewBox="0 0 16 16" fill="var(--g400)" width="10" height="10">
                <path d="M12.5 11h-.79l-.28-.27A6.471 6.471 0 0 0 13 6.5 6.5 6.5 0 1 0 6.5 13c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L17.49 16l-4.99-5zm-6 0C4.01 11 2 8.99 2 6.5S4.01 2 6.5 2 11 4.01 11 6.5 8.99 11 6.5 11z" />
              </svg>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {envelope.store.slug}.shopinbos.store
              </span>
            </div>
            <div style={{ fontSize: 10, color: "var(--teal)", fontWeight: 600 }}>Live preview</div>
          </div>

          {/* ── Scrollable Frame Area ── */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "14px 16px 50px",
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                background: "white",
                borderRadius: 12,
                boxShadow: "0 8px 32px rgba(0,0,0,.12)",
                border: "1px solid var(--g200)",
                width: "100%",
                maxWidth: device === "desktop" ? "100%" : 380,
                overflow: "hidden",
                transition: "max-width .22s",
              }}
            >
              {/* Chrome Mock Bar */}
              <div
                style={{
                  background: "#F0F2F4",
                  padding: "7px 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  borderBottom: "1px solid var(--g200)",
                }}
              >
                <div style={{ display: "flex", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF5F57", display: "block" }} />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FFBD2E", display: "block" }} />
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#28C840", display: "block" }} />
                </div>
                <div
                  style={{
                    flex: 1,
                    background: "white",
                    border: "1px solid var(--g200)",
                    borderRadius: 3,
                    padding: "2px 8px",
                    fontSize: 10,
                    color: "var(--g400)",
                    textAlign: "center",
                  }}
                >
                  {envelope.store.slug}.shopinbos.store — Rex is building
                </div>
              </div>

              {/* Render dynamic Storefront Client preview */}
              <div style={{ minHeight: 480 }}>
                <StorefrontClient
                  store={envelope.store}
                  storeBasePath={`/s/${envelope.store.slug}`}
                  previewSnapshot={draft}
                  previewMode
                  device={device === "mobile" ? "mobile" : "desktop"}
                  selectedPage={selectedPage}
                  onSelectPage={(page) => startTransition(() => setSelectedPage(page))}
                />
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Toast Notification element */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0D1B35",
            color: "white",
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            zIndex: 9999,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* ── Publish success modal ── */}
      {publishedStoreUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(14,42,56,0.82)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: 24,
              padding: "40px 36px",
              maxWidth: 420,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 24px 64px rgba(0,0,0,0.28)",
            }}
          >
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 800, color: "var(--ink-900, #0e2a38)" }}>
              Your store is live!
            </h2>
            <p style={{ margin: "0 0 24px", fontSize: 14, color: "var(--ink-500, #6e6e68)", lineHeight: 1.5 }}>
              Your changes are now visible to shoppers. Share your store link to start getting customers.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <a
                href={publishedStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "block",
                  padding: "12px 20px",
                  borderRadius: 999,
                  background: "var(--mint, #73D8C8)",
                  color: "var(--navy, #0e2a38)",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                View live store →
              </a>
              <button
                type="button"
                onClick={() => setPublishedStoreUrl(null)}
                style={{
                  padding: "12px 20px",
                  borderRadius: 999,
                  background: "transparent",
                  border: "1px solid var(--ink-200, #e0dfdb)",
                  color: "var(--ink-700, #2e2e2a)",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Continue editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Publish confirmation dialog ── */}
      <ConfirmDialog
        open={publishConfirmOpen}
        title="Publish to your live store?"
        message="Your changes will be visible to customers immediately. Make sure everything looks right in the preview first."
        confirmLabel="Publish now"
        cancelLabel="Go back"
        variant="info"
        icon="eye"
        loading={publishing}
        onConfirm={() => { setPublishConfirmOpen(false); void applyChanges(); }}
        onCancel={() => setPublishConfirmOpen(false)}
      />

      {/* ── Leave confirmation dialog ── */}
      <ConfirmDialog
        open={leaveDialog}
        title="Unsaved changes"
        message="You have unsaved changes in Rex AI Builder. If you leave now, your progress will be lost."
        confirmLabel="Leave anyway"
        cancelLabel="Stay"
        variant="warning"
        onConfirm={() => {
          setLeaveDialog(false);
          const dest = pendingNav.current;
          pendingNav.current = null;
          if (dest) router.push(dest);
        }}
        onCancel={() => {
          setLeaveDialog(false);
          pendingNav.current = null;
        }}
      />
    </div>
  );
}
