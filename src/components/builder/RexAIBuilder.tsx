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
  const [rexMessages, setRexMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content:
        "Hi! I am Rex, your AI store builder. I can build sections, write copy, generate product layouts and redesign your store. What would you like to create today?",
    },
  ]);

  // Tool Specific Inputs
  const [logoName, setLogoName] = useState("");
  const [logoTagline, setLogoTagline] = useState("");
  const [logoStyle, setLogoStyle] = useState("Luxury / High-end");
  const [productPrompt, setProductPrompt] = useState(
    "Brazilian body wave hair on a black female model, studio lighting, white background, luxury feel"
  );
  const [productFormat, setProductFormat] = useState("1:1 Square");
  const [bannerHeadline, setBannerHeadline] = useState("Aso Ebi Season Sale — 20% off all bundles");
  const [bannerFormat, setBannerFormat] = useState("WhatsApp flyer");
  const [copyProductName, setCopyProductName] = useState("Brazilian Body Wave 18 inch");
  const [copyType, setCopyType] = useState("Product description");
  const [paletteVibe, setPaletteVibe] = useState("Luxury Nigerian hair brand, elegant, premium, feminine");
  const [generatedLogos, setGeneratedLogos] = useState<Array<{ style: string; label: string; url: string; palette?: { primary: string; secondary: string; accent: string } }>>([]);
  const [generatedImages, setGeneratedImages] = useState<Array<{ url: string; label: string }>>([]);
  const [generatedPalettes, setGeneratedPalettes] = useState<GeneratedPalette[]>([]);
  const [uploadedAssets, setUploadedAssets] = useState<Array<{ url: string; label: string }>>([]);
  const [uploadingAsset, setUploadingAsset] = useState(false);

  // ── Unsaved changes guard ──
  const [hasChanges, setHasChanges] = useState(false);
  const [leaveDialog, setLeaveDialog] = useState(false);
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

  // Show Toast Toast Notification helper
  function showToast(msg: string) {
    setToastMessage(msg);
  }

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

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
            {
              role: "assistant",
              content: fromOnboarding
                ? `Hi ${sellerName}! I brought in your onboarding memory. I can now build the complete editable store for ${json.data.store.name}: pages, products, cart, checkout, blog, FAQ, and launch sections.`
                : `Hi ${sellerName}! I am Rex, your AI store builder. I can build sections, write copy, generate product layouts and redesign ${json.data.store.name}. What would you like to create today?`,
            },
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

  const currentPage: TemplatePageSeed | null = useMemo(() => {
    return draft?.pages.find((page) => page.pageType === selectedPage) ?? draft?.pages[0] ?? null;
  }, [draft, selectedPage]);

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
      slug: pageType === "home" ? "" : pageType,
      sections: sectionsMap[pageType].map((kind) => createSectionFromLibrary(kind)),
      seo: {
        metaTitle: pageType === "home" ? envelope?.store.name ?? "Store" : `${title} | ${envelope?.store.name ?? "Store"}`,
        metaDescription: `${title} page for ${envelope?.store.name ?? "your store"}.`,
      },
    };
  }

  async function saveSnapshot(next: StoreEditorSnapshot, message: string) {
    const response = await fetch("/api/store/editor", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: next }),
    });
    const json = (await response.json()) as { data?: { draft?: StoreEditorSnapshot | null } };
    if (json.data?.draft) {
      setDraft(json.data.draft);
      showToast(message);
    }
  }

  async function buildFullEcommerceStore() {
    if (!draft) return;
    const requiredPages: TemplatePageType[] = ["home", "products", "product", "categories", "cart", "checkout", "wishlist", "blog", "about", "contact", "faq"];
    const existing = new Set(draft.pages.map((page) => page.pageType));
    const pages = [
      ...draft.pages.map((page) =>
        page.sections.length > 0
          ? page
          : createRexPage(page.pageType),
      ),
      ...requiredPages.filter((page) => !existing.has(page)).map((page) => createRexPage(page)),
    ];
    const next: StoreEditorSnapshot = {
      ...draft,
      pages,
      updatedAt: new Date().toISOString(),
    };
    await saveSnapshot(next, "Rex built a complete ecommerce store draft.");
    setSelectedPage("home");
    setRexMessages((prev) => [...prev, { role: "assistant", content: "I built the full ecommerce structure: home, products, product detail, categories, cart, checkout, wishlist, blog, about, contact, and FAQ. Review each page in preview, then apply changes." }]);
  }

  async function generateLogo() {
    const response = await fetch("/api/ai/generate-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName: logoName || envelope?.store.name, businessDescription: logoTagline || envelope?.store.description, paletteHint: logoStyle }),
    });
    const json = (await response.json()) as { logos?: typeof generatedLogos; error?: { message?: string } };
    if (json.logos?.length) {
      setGeneratedLogos(json.logos);
      setHasChanges(true);
      showToast("Logo concepts generated.");
    } else {
      showToast(json.error?.message ?? "Logo generation failed.");
    }
  }

  async function applyLogo(url: string) {
    await fetch("/api/app/store", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: url }),
    });
    setEnvelope((prev) => prev ? { ...prev, store: { ...prev.store, logoUrl: url } } : prev);
    showToast("Logo applied to store.");
  }

  async function generateProductImage() {
    const size = productFormat === "4:3 Landscape" ? "1792x1024" : productFormat === "3:4 Portrait" ? "1024x1792" : "1024x1024";
    const response = await fetch("/api/ai/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: productPrompt, size, style: "vivid" }),
    });
    const json = (await response.json()) as { image?: { url: string }; error?: { message?: string } };
    if (json.image?.url) {
      setGeneratedImages((prev) => [{ url: json.image!.url, label: "Generated product image" }, ...prev].slice(0, 6));
      setHasChanges(true);
      showToast("Product image generated.");
    } else {
      showToast(json.error?.message ?? "Image generation failed.");
    }
  }

  async function generatePalette() {
    const response = await fetch("/api/ai/generate-palette", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: envelope?.store.name,
        description: envelope?.store.description || envelope?.store.storeProducts.map((product) => product.name).join(", ") || "online products",
        feeling: paletteVibe,
        customers: "online shoppers",
      }),
    });
    const json = (await response.json()) as { palettes?: GeneratedPalette[]; error?: { message?: string } };
    if (json.palettes?.length) {
      setGeneratedPalettes(json.palettes);
      setHasChanges(true);
      showToast("Brand palettes generated.");
    } else {
      showToast(json.error?.message ?? "Palette generation failed.");
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
    await saveSnapshot(next, `${palette.name} applied to your store.`);
  }

  async function applyImageToSelectedPage(url: string) {
    if (!draft || !currentPage) return;
    const next: StoreEditorSnapshot = {
      ...draft,
      updatedAt: new Date().toISOString(),
      pages: draft.pages.map((page) =>
        page.pageType === currentPage.pageType
          ? {
              ...page,
              sections: page.sections.map((section) => ({
                ...section,
                items: section.items?.map((item, index) => index === 0 ? { ...item, imageUrl: url } : item),
              })),
            }
          : page,
      ),
    };
    await saveSnapshot(next, "Image applied to selected page.");
  }

  // Ask Rex to update the editable store draft (streaming store-builder).
  async function sendRexPrompt(prompt: string) {
    if (!prompt.trim() || !draft) return;
    if (/(full|complete|entire|all pages|checkout|cart|wishlist|categories|product page)/i.test(prompt)) {
      setRexMessages((prev) => [...prev, { role: "user", content: prompt }]);
      await buildFullEcommerceStore();
      setRexPrompt("");
      return;
    }

    const userMessage = { role: "user" as const, content: prompt };
    setRexMessages((prev) => [...prev, userMessage]);
    setRexBusy(true);

    // Placeholder assistant bubble that streams in
    const placeholderIdx = rexMessages.length + 1;
    setRexMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/ai/store-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...rexMessages, userMessage].map((m) => ({ role: m.role, content: m.content })),
          brandContext: {
            businessDescription: envelope?.store.description,
            category: undefined,
          },
          templateContext: envelope?.template ? {
            templateId: envelope.template.templateId,
            templateName: envelope.template.templateName,
          } : undefined,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("Stream unavailable");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let pendingConfig: StoreConfig | null = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line) as { type: string; content?: unknown };
            if (chunk.type === "token" && typeof chunk.content === "string") {
              assistantText += chunk.content;
              setRexMessages((prev) => prev.map((m, i) => i === placeholderIdx ? { ...m, content: assistantText } : m));
            } else if (chunk.type === "store_config") {
              pendingConfig = chunk.content as StoreConfig;
            } else if (chunk.type === "chips" && Array.isArray(chunk.content)) {
              // chips shown as quick-starts — for now just update message
            }
          } catch { /* partial JSON line */ }
        }
      }

      // Finalize message
      if (!assistantText) {
        setRexMessages((prev) => prev.map((m, i) => i === placeholderIdx ? { ...m, content: "Done! Check the preview for updates." } : m));
      }

      // If Rex returned a store config, apply it to the draft
      if (pendingConfig && draft) {
        const patchRes = await fetch("/api/store/editor", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeConfig: pendingConfig }),
        });
        const patchJson = (await patchRes.json()) as { data?: { draft?: StoreEditorSnapshot | null } };
        if (patchJson.data?.draft) {
          setDraft(patchJson.data.draft);
          setHasChanges(true);
          showToast("Rex updated your store! Review in the preview.");
        }
      }
    } catch {
      setRexMessages((prev) => prev.map((m, i) =>
        i === placeholderIdx
          ? { ...m, content: "Rex had trouble connecting. Check that your AI API keys are configured and try again." }
          : m,
      ));
    } finally {
      setRexBusy(false);
      setRexPrompt("");
    }
  }

  // Publish changes to live store
  async function applyChanges() {
    if (publishing) return;
    setPublishing(true);
    try {
      const response = await fetch("/api/store/editor/publish", { method: "POST" });
      const json = (await response.json()) as { data?: EditorEnvelope; billing?: StoreLaunchPricing; error?: { message?: string } };
      if (response.status === 402 && json.billing) {
        setLaunchPricing(json.billing);
        return;
      }
      if (!response.ok) throw new Error(json.error?.message ?? "Could not publish changes.");
      if (json.data) {
        setEnvelope((prev) => (prev ? { ...prev, published: json.data?.published ?? prev.published } : prev));
        setHasChanges(false);
        const storeSlug = json.data.store?.slug ?? envelope?.store?.slug;
        if (storeSlug) setPublishedStoreUrl(`/s/${storeSlug}`);
        else showToast("Changes applied successfully to your live store!");
      }
    } catch {
      showToast("Error applying changes.");
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
      const asset = { url: json.data.publicUrl, label: file.name.replace(/\.[^.]+$/, "") || "Uploaded asset" };
      setUploadedAssets((prev) => [asset, ...prev].slice(0, 12));
      setGeneratedImages((prev) => [asset, ...prev].slice(0, 12));
      setHasChanges(true);
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
    link.download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "shopinbos-asset"}.png`;
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
              <button type="button" onClick={() => void applyChanges()} disabled={publishing} style={{ ...primaryButtonStyle, opacity: publishing ? 0.6 : 1 }}>
                {publishing ? "Applying..." : "Apply changes"}
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
                    <button type="button" onClick={() => void generateLogo()} style={primaryButtonStyle}>
                      Generate logo concepts
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
                    <div style={{ height: 180, borderRadius: 12, overflow: "hidden", background: "#DCE3EE" }}>
                      <img src={uploadedAssets[0]?.url ?? generatedImages[0]?.url ?? "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=640&q=75"} alt="Image editor preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                    {["Remove background", "Enhance quality", "Remove object", "Resize for store", "Create clean product crop", "Compress for faster loading"].map((action) => (
                      <button key={action} type="button" onClick={() => showToast(`${action} queued for the selected asset.`)} style={secondaryButtonStyle}>
                        {action}
                      </button>
                    ))}
                    <label style={{ ...primaryButtonStyle, textAlign: "center" }}>
                      {uploadingAsset ? "Uploading..." : "Upload or select image"}
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        disabled={uploadingAsset}
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          if (file) void uploadRexAsset(file, "brand");
                        }}
                      />
                    </label>
                  </div>
                )}

                {activeTool === "product-img" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <label>
                      <span style={labelStyle}>Prompt</span>
                      <textarea value={productPrompt} onChange={(e) => setProductPrompt(e.target.value)} placeholder="Describe the product photo you want..." style={{ ...inputStyle, minHeight: 130, resize: "vertical" }} />
                    </label>
                    <label>
                      <span style={labelStyle}>Output format</span>
                      <select value={productFormat} onChange={(e) => setProductFormat(e.target.value)} style={inputStyle}>
                        <option>1:1 Square</option>
                        <option>4:3 Landscape</option>
                        <option>3:4 Portrait</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => void generateProductImage()} style={primaryButtonStyle}>
                      Generate product image
                    </button>
                    <label style={{ ...secondaryButtonStyle, textAlign: "center" }}>
                      {uploadingAsset ? "Uploading..." : "Upload product image"}
                      <input
                        type="file"
                        accept="image/*"
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
                      <input value={bannerHeadline} onChange={(e) => setBannerHeadline(e.target.value)} placeholder="Summer sale - 20% off" style={inputStyle} />
                    </label>
                    <label>
                      <span style={labelStyle}>Placement</span>
                      <select value={bannerFormat} onChange={(e) => setBannerFormat(e.target.value)} style={inputStyle}>
                        <option>WhatsApp flyer</option>
                        <option>Instagram post</option>
                        <option>Store banner</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => showToast("Banner template generated successfully.")} style={primaryButtonStyle}>
                      Create banner
                    </button>
                    <label style={{ ...secondaryButtonStyle, textAlign: "center" }}>
                      {uploadingAsset ? "Uploading..." : "Upload banner image"}
                      <input
                        type="file"
                        accept="image/*"
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
                      <input value={copyProductName} onChange={(e) => setCopyProductName(e.target.value)} placeholder="Brazilian Body Wave 18 inch" style={inputStyle} />
                    </label>
                    <label>
                      <span style={labelStyle}>Copy type</span>
                      <select value={copyType} onChange={(e) => setCopyType(e.target.value)} style={inputStyle}>
                        <option>Product description</option>
                        <option>Short tagline</option>
                        <option>WhatsApp caption</option>
                        <option>SEO meta</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => void sendRexPrompt(`Write ${copyType.toLowerCase()} for ${copyProductName || envelope?.store.name || "this store"}. Use the real store context and make it ready for shoppers.`)}
                      style={primaryButtonStyle}
                    >
                      Write copy
                    </button>
                  </div>
                )}

                {activeTool === "palette" && (
                  <div style={{ display: "grid", gap: 12 }}>
                    <label>
                      <span style={labelStyle}>Brand vibe</span>
                      <input value={paletteVibe} onChange={(e) => setPaletteVibe(e.target.value)} placeholder="Elegant, trusted, premium..." style={inputStyle} />
                    </label>
                    <button type="button" onClick={() => void generatePalette()} style={primaryButtonStyle}>
                      Generate palette
                    </button>
                    {generatedPalettes.length > 0 && (
                      <div style={{ display: "grid", gap: 8 }}>
                        {generatedPalettes.slice(0, 5).map((palette) => (
                          <button
                            key={palette.id}
                            type="button"
                            onClick={() => void applyPalette(palette)}
                            style={{
                              border: "1px solid #E3EAE7",
                              borderRadius: 10,
                              background: "#FFFFFF",
                              padding: 10,
                              textAlign: "left",
                              cursor: "pointer",
                            }}
                          >
                            <div style={{ display: "flex", gap: 5, marginBottom: 7 }}>
                              {Object.values(palette.colors).slice(0, 5).map((color) => (
                                <span key={color} style={{ width: 22, height: 22, borderRadius: 5, background: color, border: "1px solid rgba(0,0,0,.08)" }} />
                              ))}
                            </div>
                            <div style={{ fontWeight: 800, color: "#122033", fontSize: 12 }}>{palette.name}</div>
                            <div style={{ color: "#6B7890", fontSize: 11, marginTop: 2 }}>{palette.personality ?? "Tap to apply this palette."}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={sectionStyle}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#122033", marginBottom: 10 }}>Store context</div>
                {[
                  ["Store", store.name],
                  ["Slug", `${store.slug}.shopinbos.store`],
                  ["Currency", store.currency],
                  ["Products", `${store.storeProducts.length} connected`],
                  ["Pages", `${draft.pages.length} editable drafts`],
                  ["Current page", currentPage?.title ?? selectedPage],
                  ["Template", envelope.template?.templateName ?? draft.templateName],
                  ["Uploaded assets", `${uploadedAssets.length} this session`],
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

              {activeTool === "product-img" && (
                <div style={sectionStyle}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#122033", marginBottom: 12 }}>Generated images</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                    {([...generatedImages, ...uploadedAssets].length ? [...generatedImages, ...uploadedAssets] : [
                      { url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=500&q=75", label: "Lifestyle product card" },
                      { url: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=500&q=75", label: "Studio product detail" },
                      { url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&q=75", label: "Store banner crop" },
                    ]).filter((image, index, array) => array.findIndex((entry) => entry.url === image.url) === index).map((image) => (
                      <div key={image.url} style={{ border: "1px solid #DCE3EE", borderRadius: 12, background: "#FFFFFF", overflow: "hidden", textAlign: "left" }}>
                        <img src={image.url} alt={image.label} style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }} />
                        <div style={{ padding: 10, color: "#122033", fontSize: 12, fontWeight: 700 }}>{image.label}</div>
                        <div style={{ display: "flex", gap: 6, padding: "0 10px 10px" }}>
                          <button type="button" onClick={() => void applyImageToSelectedPage(image.url)} style={{ ...primaryButtonStyle, flex: 1, padding: "7px 8px", fontSize: 11 }}>
                            Apply
                          </button>
                          <button type="button" onClick={() => downloadAsset(image.url, image.label)} style={{ ...secondaryButtonStyle, flex: 1, padding: "7px 8px", fontSize: 11 }}>
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTool !== "logo" && activeTool !== "product-img" && (
                <div style={sectionStyle}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#122033", marginBottom: 12 }}>Output preview</div>
                  <div style={{ border: "1px solid #DCE3EE", borderRadius: 12, overflow: "hidden", background: "#FFFFFF" }}>
                    <div style={{ minHeight: 230, padding: 22, background: activeTool === "palette" ? "linear-gradient(135deg,#081329,#0FA493 48%,#C9A96E)" : "#F8FAFC" }}>
                      {activeTool === "banner" ? (
                        <div style={{ height: "100%", minHeight: 190, display: "grid", alignContent: "center", color: "#0D1830" }}>
                          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "1.4px", color: rexUi.tealDark, fontWeight: 800 }}>{bannerFormat}</div>
                          <div style={{ fontFamily: "var(--serif)", fontSize: 42, lineHeight: 1, fontWeight: 900, maxWidth: 520, marginTop: 10 }}>{bannerHeadline}</div>
                          <button type="button" style={{ ...primaryButtonStyle, width: "fit-content", marginTop: 18 }}>Shop now</button>
                        </div>
                      ) : activeTool === "copy" ? (
                        <div style={{ display: "grid", gap: 12 }}>
                          <div style={{ color: "#0D1830", fontSize: 20, fontWeight: 850 }}>{copyProductName || "Your product"}</div>
                          <p style={{ color: "#52627A", margin: 0, lineHeight: 1.7 }}>
                            A polished {copyType.toLowerCase()} draft will appear here, written for your store tone and ready to paste into a section, product, SEO field, or WhatsApp campaign.
                          </p>
                          <button type="button" onClick={() => handleCopyText(`${copyProductName} - premium quality, carefully selected and ready for fast delivery.`, "Draft copy")} style={{ ...secondaryButtonStyle, width: "fit-content" }}>
                            Copy draft
                          </button>
                        </div>
                      ) : activeTool === "palette" ? (
                        <div style={{ display: "flex", gap: 10, alignItems: "end", minHeight: 190 }}>
                          {["#081329", "#0FA493", "#E8614A", "#C9A96E", "#F8FAFC"].map((code) => (
                            <button key={code} type="button" onClick={() => handleCopyText(code, code)} style={{ flex: 1, height: 150, border: "1px solid rgba(255,255,255,.45)", background: code, borderRadius: 12, cursor: "pointer", color: code === "#F8FAFC" ? "#122033" : "#FFFFFF", fontSize: 11, fontWeight: 800 }}>
                              {code}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: "grid", gap: 10 }}>
                          <div style={{ color: "#0D1830", fontSize: 20, fontWeight: 850 }}>Image actions</div>
                          <p style={{ color: "#52627A", margin: 0, lineHeight: 1.7 }}>Choose an image from your store, run cleanup actions, then apply it back to the selected page or product media.</p>
                        </div>
                      )}
                    </div>
                    <div style={{ padding: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button type="button" onClick={() => showToast("Output saved to your Rex assets.")} style={secondaryButtonStyle}>Save asset</button>
                      <button type="button" onClick={() => showToast("Output applied to the selected store draft.")} style={primaryButtonStyle}>Apply to store</button>
                    </div>
                  </div>
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
            onClick={() => void applyChanges()}
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
            {publishing ? "Applying..." : "Apply Changes"}
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
                    key={idx}
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
                    {msg.content}
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
                    "Build my full ecommerce store with product, cart, checkout, wishlist, categories, filters and FAQ",
                    "Make my store look more premium and conversion ready",
                    "Add a strong product detail page with variations",
                    "Create category, wishlist and checkout pages",
                  ].map((chip) => (
                    <button
                      key={chip}
                      onClick={() => chip.startsWith("Build my full") ? void buildFullEcommerceStore() : void sendRexPrompt(chip)}
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
                Build History
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { title: "Hero section redesigned", time: "Today, 11:32am · Applied" },
                  { title: "4-column product grid added", time: "Yesterday, 3:14pm · Applied" },
                  { title: "Product descriptions rewritten", time: "May 30, 9:05am · Applied" },
                  { title: "Navy colour scheme applied", time: "May 28, 2:41pm · Applied" },
                ].map((hist, idx) => (
                  <div
                    key={idx}
                    onClick={() => showToast(`Restored version from historical checkpoint.`)}
                    style={{
                      background: rexUi.panelRaised,
                      border: `1px solid ${rexUi.border}`,
                      borderRadius: 8,
                      padding: "10px 12px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ color: rexUi.text, fontSize: 11, fontWeight: 500, marginBottom: 2 }}>
                      {hist.title}
                    </div>
                    <div style={{ color: rexUi.muted, fontSize: 10 }}>{hist.time}</div>
                  </div>
                ))}
              </div>
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
          {/* Dynamic AI Sub-tool panel overlay */}
          {activeTool && (
            <div style={{ display: "none", background: "white", borderBottom: "2px solid var(--teal)", flexShrink: 0 }}>
              {/* Logo Builder Form */}
              {activeTool === "logo" && (
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>Logo Builder</div>
                    <button
                      onClick={() => setActiveTool(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--g400)" }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        placeholder="Brand name"
                        value={logoName}
                        onChange={(e) => setLogoName(e.target.value)}
                        style={{ width: "100%", border: "1px solid var(--g200)", borderRadius: 6, padding: "7px 10px", fontSize: 12 }}
                      />
                      <input
                        placeholder="Tagline"
                        value={logoTagline}
                        onChange={(e) => setLogoTagline(e.target.value)}
                        style={{ width: "100%", border: "1px solid var(--g200)", borderRadius: 6, padding: "7px 10px", fontSize: 12 }}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <select
                          value={logoStyle}
                          onChange={(e) => setLogoStyle(e.target.value)}
                          style={{ flex: 1, border: "1px solid var(--g200)", borderRadius: 6, padding: "7px 9px", fontSize: 12, outline: "none" }}
                        >
                          <option>Luxury / High-end</option>
                          <option>Modern / Minimal</option>
                          <option>Bold / Playful</option>
                          <option>Traditional / Classic</option>
                        </select>
                        <button
                          onClick={() => void generateLogo()}
                          style={{
                            background: "var(--teal)",
                            color: "white",
                            border: "none",
                            padding: "7px 16px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Generate
                        </button>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      {(generatedLogos.length ? generatedLogos : [
                        { style: "preview-1", label: "Concept 1", url: "", palette: { primary: "#0D1B35", secondary: "#0E9E85", accent: "#C9A96E" } },
                        { style: "preview-2", label: "Concept 2", url: "", palette: { primary: "#F9FAFB", secondary: "#0E9E85", accent: "#0D1B35" } },
                        { style: "preview-3", label: "Concept 3", url: "", palette: { primary: "#C9A96E", secondary: "#B8860B", accent: "#fff" } },
                      ]).slice(0, 3).map((logo, index) => (
                      <div
                        key={logo.style}
                        onClick={() => logo.url ? void applyLogo(logo.url) : showToast("Generate logo concepts first.")}
                        style={{
                          width: 90,
                          height: 60,
                          background: logo.url ? `url(${logo.url}) center/cover` : index === 1 ? "#F9FAFB" : index === 2 ? "linear-gradient(135deg,#C9A96E,#B8860B)" : "var(--navy)",
                          borderRadius: 8,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          border: index === 0 ? "2px solid var(--teal)" : "1px solid var(--g200)",
                        }}
                      >
                        {!logo.url ? <div style={{ textAlign: "center" }}>
                          <div style={{ fontFamily: "var(--serif)", fontSize: 8, fontWeight: 600, color: "white", letterSpacing: ".5px" }}>
                            {logoName.toUpperCase().split(" ")[0]}
                          </div>
                          <div style={{ width: 40, height: 1, background: "var(--teal)", margin: "3px auto" }} />
                          <div style={{ fontSize: 6, color: "rgba(255,255,255,.5)", letterSpacing: "1px" }}>
                            {logo.label.toUpperCase().slice(0, 15)}
                          </div>
                        </div> : null}
                      </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* AI Image Editor Form */}
              {activeTool === "image" && (
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>AI Image Editor</div>
                    <button
                      onClick={() => setActiveTool(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--g400)" }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 100, height: 80, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                      <img
                        src="https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=200&q=70"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        alt="Preview"
                      />
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {[
                        "Remove background",
                        "Enhance quality",
                        "Remove object",
                        "Resize for store",
                      ].map((action) => (
                        <button
                          key={action}
                          onClick={() => showToast(`Successfully triggers: ${action}!`)}
                          style={{
                            background: "var(--g50)",
                            border: "1px solid var(--g200)",
                            borderRadius: 6,
                            padding: "5px 10px",
                            fontSize: 11,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          {action}
                        </button>
                      ))}
                      <button
                        onClick={() => showToast("Uploading new image asset...")}
                        style={{
                          background: "var(--teal)",
                          color: "white",
                          border: "none",
                          borderRadius: 6,
                          padding: "5px 12px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Upload image
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Product Image AI Form */}
              {activeTool === "product-img" && (
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>Product Image AI</div>
                    <button
                      onClick={() => setActiveTool(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--g400)" }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <textarea
                      value={productPrompt}
                      onChange={(e) => setProductPrompt(e.target.value)}
                      placeholder="Describe the product photo you want..."
                      style={{
                        flex: 1,
                        border: "1px solid var(--g200)",
                        borderRadius: 6,
                        padding: "7px 10px",
                        fontSize: 11,
                        resize: "none",
                        height: 48,
                        fontFamily: "inherit",
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                      <button
                        onClick={() => void generateProductImage()}
                        style={{
                          background: "var(--teal)",
                          color: "white",
                          border: "none",
                          padding: "7px 14px",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          fontFamily: "inherit",
                        }}
                      >
                        Generate image
                      </button>
                      <select
                        value={productFormat}
                        onChange={(e) => setProductFormat(e.target.value)}
                        style={{ border: "1px solid var(--g200)", borderRadius: 6, padding: "5px 8px", fontSize: 11 }}
                      >
                        <option>1:1 Square</option>
                        <option>4:3 Landscape</option>
                        <option>3:4 Portrait</option>
                      </select>
                    </div>
                  </div>
                  {generatedImages.length > 0 ? (
                    <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto" }}>
                      {generatedImages.map((image) => (
                        <button key={image.url} type="button" onClick={() => void applyImageToSelectedPage(image.url)} style={{ width: 74, height: 74, borderRadius: 10, border: "1px solid var(--g200)", overflow: "hidden", padding: 0, cursor: "pointer", flex: "0 0 auto" }}>
                          <img src={image.url} alt={image.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Banner Form */}
              {activeTool === "banner" && (
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>Banner &amp; Ad Maker</div>
                    <button
                      onClick={() => setActiveTool(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--g400)" }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      value={bannerHeadline}
                      onChange={(e) => setBannerHeadline(e.target.value)}
                      placeholder="Banner headline"
                      style={{ flex: 1, border: "1px solid var(--g200)", borderRadius: 6, padding: "7px 10px", fontSize: 12 }}
                    />
                    <select
                      value={bannerFormat}
                      onChange={(e) => setBannerFormat(e.target.value)}
                      style={{ border: "1px solid var(--g200)", borderRadius: 6, padding: "7px 9px", fontSize: 12 }}
                    >
                      <option>WhatsApp flyer</option>
                      <option>Instagram post</option>
                      <option>Store banner</option>
                    </select>
                    <button
                      onClick={() => showToast("Banner template generated successfully!")}
                      style={{
                        background: "var(--teal)",
                        color: "white",
                        border: "none",
                        padding: "7px 14px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        fontFamily: "inherit",
                      }}
                    >
                      Create
                    </button>
                  </div>
                </div>
              )}

              {/* Copy Writer Form */}
              {activeTool === "copy" && (
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>AI Copy Writer</div>
                    <button
                      onClick={() => setActiveTool(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--g400)" }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      value={copyProductName}
                      onChange={(e) => setCopyProductName(e.target.value)}
                      placeholder="Product name"
                      style={{ flex: 1, border: "1px solid var(--g200)", borderRadius: 6, padding: "7px 10px", fontSize: 12 }}
                    />
                    <select
                      value={copyType}
                      onChange={(e) => setCopyType(e.target.value)}
                      style={{ border: "1px solid var(--g200)", borderRadius: 6, padding: "7px 9px", fontSize: 12 }}
                    >
                      <option>Product description</option>
                      <option>Short tagline</option>
                      <option>WhatsApp caption</option>
                      <option>SEO meta</option>
                    </select>
                    <button
                      onClick={() => showToast("AI copy generated! Copy to your store section to apply.")}
                      style={{
                        background: "var(--teal)",
                        color: "white",
                        border: "none",
                        padding: "7px 14px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        fontFamily: "inherit",
                      }}
                    >
                      Write
                    </button>
                  </div>
                </div>
              )}

              {/* Brand Colour Palette Form */}
              {activeTool === "palette" && (
                <div style={{ padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--navy)" }}>Brand Colour Palette</div>
                    <button
                      onClick={() => setActiveTool(null)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--g400)" }}
                    >
                      ✕
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <input
                      value={paletteVibe}
                      onChange={(e) => setPaletteVibe(e.target.value)}
                      placeholder="Describe your brand vibe..."
                      style={{ flex: 1, border: "1px solid var(--g200)", borderRadius: 6, padding: "7px 10px", fontSize: 12 }}
                    />
                    <button
                      onClick={() => showToast("Calculating tailored HSL color variables...")}
                      style={{
                        background: "var(--teal)",
                        color: "white",
                        border: "none",
                        padding: "7px 14px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        fontFamily: "inherit",
                      }}
                    >
                      Generate
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    {[
                      { code: "#0D1B35", name: "Navy" },
                      { code: "#0E9E85", name: "Teal" },
                      { code: "#E8614A", name: "Coral" },
                      { code: "#C9A96E", name: "Gold" },
                      { code: "#F7F0E8", name: "Cream", isLight: true },
                    ].map((col) => (
                      <div
                        key={col.code}
                        onClick={() => handleCopyText(col.code, col.name)}
                        style={{
                          flex: 1,
                          height: 32,
                          background: col.code,
                          borderRadius: 4,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: col.isLight ? "1px solid var(--g200)" : "none",
                        }}
                      >
                        <span style={{ fontSize: 8, color: col.isLight ? "var(--g400)" : "white" }}>
                          {col.code}
                        </span>
                      </div>
                    ))}
                    <button
                      onClick={() => showToast("Tailored theme tokens applied to preview storefront!")}
                      style={{
                        background: "var(--navy)",
                        color: "white",
                        border: "none",
                        padding: "0 12px",
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        fontFamily: "inherit",
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
