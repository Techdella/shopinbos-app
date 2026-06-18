import { getTemplateManifest, listTemplateGalleryItems } from "./catalog";
import { getNavStructure, getThemeAIHints } from "./themes";
import {
  applyEditorPatchOps,
  buildBrandSettingsForDraft,
  buildBrandSettingsForPublish,
  buildTemplateSelectionMeta,
  parseEditorState,
  resolveDraftSnapshot,
  resolvePublishedSnapshot,
  snapshotToPublishedPages,
  syncSnapshotFromStoreConfig,
  type StoreBrandSettingsLike,
  type StoreConfigLike,
} from "./editor";
import type {
  StoreEditorPatchOp,
  StoreEditorSnapshot,
  StoreTemplateManifest,
  TemplatePageType,
  TemplateSectionNode,
} from "./types";

export function listTemplatesResponse() {
  return {
    templates: listTemplateGalleryItems(),
  };
}

export function resolveTemplateOrThrow(templateId: string) {
  const manifest = getTemplateManifest(templateId);
  if (!manifest) {
    throw new Error(`Unknown template: ${templateId}`);
  }
  return manifest;
}

export function createSectionFromLibrary(kind: string): TemplateSectionNode {
  const id = `${kind}-${Math.random().toString(36).slice(2, 8)}`;

  if (kind === "about-section") {
    return {
      id,
      kind,
      name: "About Section",
      visible: true,
      blocks: [
        {
          id: `${id}-copy`,
          type: "copy",
          content: {
            title: "About this store",
            body: "Share your story — sourcing, standards, process, values, or what makes you different.",
            cta: "Learn more",
          },
        },
      ],
    };
  }

  if (kind === "delivery-info") {
    return {
      id,
      kind,
      name: "Delivery Info",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "Delivery information", body: "Delivery times and shipping details." } }],
      items: [
        { label: "Processing time", value: "1–2 business days" },
        { label: "Shipping zones", value: "Nationwide delivery" },
        { label: "Delivery window", value: "3–7 business days" },
        { label: "Tracking", value: "Order confirmation with tracking link" },
      ],
    };
  }

  if (kind === "payment-info") {
    return {
      id,
      kind,
      name: "Payment Info",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "Payment methods", body: "Accepted payment options." } }],
      items: [
        { label: "Card payments", value: "Visa, Mastercard, Verve" },
        { label: "Bank transfer", value: "Instant confirmation" },
        { label: "Mobile money", value: "Pay with mobile wallet" },
        { label: "POS", value: "Pay on delivery" },
      ],
    };
  }

  if (kind === "announcement-bar") {
    return {
      id,
      kind,
      name: "Announcement Bar",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { text: "Free delivery on selected orders this week." } }],
    };
  }

  if (kind === "header") {
    return {
      id,
      kind,
      name: "Navigation",
      visible: true,
      blocks: [{
        id: `${id}-copy`,
        type: "copy",
        content: {
          navLinks: ["home", "products", "about", "contact"],
          utilityLinks: ["wishlist", "cart"],
          cartLabel: "Cart",
          logoText: "My Store",
        },
      }],
    };
  }

  if (kind === "hero-split") {
    return {
      id,
      kind,
      name: "Hero Section",
      visible: true,
      blocks: [
        {
          id: `${id}-image`,
          type: "image",
          content: {
            originalSrc: "",
            resolvedSrc: "",
            alt: "Hero image",
            editable: true,
            width: null,
            height: null,
            objectFit: "cover",
          },
        },
        {
          id: `${id}-copy`,
          type: "copy",
          content: {
            eyebrow: "New collection",
            title: "Build a beautiful storefront.",
            body: "Introduce your brand with a strong headline, supporting copy, and a clear call to action.",
            primaryCta: "Shop now",
            secondaryCta: "Learn more",
          },
        },
      ],
    };
  }

  if (kind === "category-grid") {
    return {
      id,
      kind,
      name: "Category Grid",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "Shop by category", body: "Browse our curated collections." } }],
      items: [
        { title: "New arrivals", subtitle: "Fresh drops", color: "#4C6780" },
        { title: "Best sellers", subtitle: "Most loved", color: "#C9973A" },
        { title: "Gift-ready", subtitle: "Easy picks", color: "#2E7E78" },
        { title: "Sale", subtitle: "Limited time", color: "#D94F4F" },
      ],
    };
  }

  if (kind === "story-split") {
    return {
      id,
      kind,
      name: "Story Section",
      visible: true,
      blocks: [
        {
          id: `${id}-copy`,
          type: "copy",
          content: {
            eyebrow: "Our story",
            title: "Tell shoppers what makes this store different.",
            body: "Share your sourcing, process, values, or customer promise in clear language.",
            cta: "Learn more",
          },
        },
      ],
    };
  }

  if (kind === "trust-strip") {
    return {
      id,
      kind,
      name: "Trust Bar",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "Why shoppers trust us" } }],
      items: [
        { label: "Secure checkout", value: "100%" },
        { label: "Fast delivery", value: "24h" },
        { label: "Helpful support", value: "7d" },
      ],
    };
  }

  if (kind === "promo-banner") {
    return {
      id,
      kind,
      name: "Promo Banner",
      visible: true,
      blocks: [
        {
          id: `${id}-copy`,
          type: "copy",
          content: {
            title: "Feature a fresh promotion.",
            body: "Use this section for launch drops, bundles, discounts, or a time-sensitive callout.",
            cta: "Shop the offer",
          },
        },
      ],
    };
  }

  if (kind === "testimonials") {
    return {
      id,
      kind,
      name: "Reviews",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "What customers say" } }],
      items: [
        { quote: "The ordering experience was easy and delivery was quick.", person: "Customer" },
        { quote: "The product quality matched what I saw online.", person: "Customer" },
        { quote: "Support was helpful from checkout to delivery.", person: "Customer" },
      ],
    };
  }

  if (kind === "text-columns") {
    return {
      id,
      kind,
      name: "Text Columns",
      visible: true,
      blocks: [
        {
          id: `${id}-copy`,
          type: "copy",
          content: {
            title: "Add more context here.",
            body: "Use this section for sourcing notes, policy details, brand story, or category guidance.",
          },
        },
      ],
      items: [
        { title: "Column one", body: "Use this for a supporting point." },
        { title: "Column two", body: "Use this for a supporting point." },
        { title: "Column three", body: "Use this for a supporting point." },
      ],
    };
  }

  if (kind === "newsletter") {
    return {
      id,
      kind,
      name: "Newsletter",
      visible: true,
      blocks: [
        {
          id: `${id}-copy`,
          type: "copy",
          content: {
            title: "Invite visitors back.",
            body: "Use this for email updates, launch alerts, or a WhatsApp join prompt.",
            buttonLabel: "Stay in the loop",
          },
        },
      ],
    };
  }

  if (kind === "footer") {
    return {
      id,
      kind,
      name: "Footer",
      visible: true,
      blocks: [{
        id: `${id}-copy`,
        type: "copy",
        content: {
          summary: "Discover curated products, delivered with care.",
        },
      }],
    };
  }

  if (kind === "featured-products") {
    return {
      id,
      kind,
      name: "Product Grid",
      visible: true,
      blocks: [
        {
          id: `${id}-copy`,
          type: "copy",
          content: {
            title: "Featured products",
            body: "Showcase your best products and make it easy for shoppers to buy.",
            cta: "View all",
          },
        },
      ],
      items: [
        { title: "Product one", subtitle: "Best seller", priceLabel: "NGN 0", color: "#0FA493", mappedStoreProductId: null },
        { title: "Product two", subtitle: "New arrival", priceLabel: "NGN 0", color: "#E08C00", mappedStoreProductId: null },
        { title: "Product three", subtitle: "Customer favorite", priceLabel: "NGN 0", color: "#7C5CFF", mappedStoreProductId: null },
      ],
    };
  }

  if (kind === "filters-toolbar") {
    return {
      id,
      kind,
      name: "Filters & Sort",
      visible: true,
      blocks: [
        {
          id: `${id}-copy`,
          type: "copy",
          content: {
            title: "Filter products",
            body: "Help shoppers browse by category, price, availability, and newest arrivals.",
          },
        },
      ],
      items: [
        { label: "Category", value: "All categories" },
        { label: "Price", value: "Any price" },
        { label: "Sort", value: "Newest first" },
      ],
    };
  }

  if (kind === "category-list") {
    return {
      id,
      kind,
      name: "Category List",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "Shop by category", body: "Guide customers into the right collection." } }],
      items: [
        { title: "New arrivals", subtitle: "Freshly added", color: "#0FA493" },
        { title: "Best sellers", subtitle: "Customer favorites", color: "#E08C00" },
        { title: "Gift-ready", subtitle: "Easy picks", color: "#7C5CFF" },
      ],
    };
  }

  if (kind === "product-detail") {
    return {
      id,
      kind,
      name: "Product Detail",
      visible: true,
      blocks: [{
        id: `${id}-copy`,
        type: "copy",
        content: {
          eyebrow: "Product detail",
          title: "Featured product",
          body: "A conversion-ready product detail page with gallery, price, variations, quantity, trust notes, and add-to-cart actions.",
          priceLabel: "NGN 0",
        },
      }],
      items: [
        { label: "Color", values: ["Black", "Brown", "Gold"] },
        { label: "Size", values: ["Small", "Medium", "Large"] },
      ],
    };
  }

  if (kind === "cart-summary") {
    return {
      id,
      kind,
      name: "Cart Summary",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "Your cart", body: "Review items, update quantities, and continue to checkout." } }],
      items: [
        { title: "Cart item", subtitle: "Quantity 1", priceLabel: "NGN 0", color: "#0FA493" },
        { title: "Delivery", subtitle: "Calculated at checkout", priceLabel: "TBD", color: "#E08C00" },
      ],
    };
  }

  if (kind === "checkout-form") {
    return {
      id,
      kind,
      name: "Checkout",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "Secure checkout", body: "Customer details, delivery address, payment summary, and order confirmation are ready." } }],
      items: [
        { label: "Contact", value: "Email and phone" },
        { label: "Delivery", value: "Address and shipping method" },
        { label: "Payment", value: "Card, transfer, or mobile money" },
      ],
    };
  }

  if (kind === "wishlist-grid") {
    return {
      id,
      kind,
      name: "Wishlist",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "Saved for later", body: "Let shoppers return to products they love." } }],
      items: [
        { title: "Saved product", subtitle: "Back in stock alerts", priceLabel: "NGN 0", color: "#0FA493" },
        { title: "Gift idea", subtitle: "Shareable wishlist", priceLabel: "NGN 0", color: "#7C5CFF" },
      ],
    };
  }

  if (kind === "blog-index") {
    return {
      id,
      kind,
      name: "Blog Posts",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "Latest stories", body: "Publish guides, announcements, and product education that help shoppers buy with confidence." } }],
      items: [
        { title: "How to choose the right product", excerpt: "A practical buying guide for new customers.", category: "Guide", readTime: "4 min read", color: "#0FA493" },
        { title: "Behind the brand", excerpt: "Share your process, standards, and what makes the store different.", category: "Story", readTime: "3 min read", color: "#7C5CFF" },
        { title: "Care tips and product ideas", excerpt: "Useful post ideas that support SEO and repeat visits.", category: "Tips", readTime: "5 min read", color: "#E08C00" },
      ],
    };
  }

  if (kind === "contact-form") {
    return {
      id,
      kind,
      name: "Contact Form",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "Get in touch", body: "Have a question about products, delivery, or your order? Send the store a message.", buttonLabel: "Send message" } }],
    };
  }

  if (kind === "faq") {
    return {
      id,
      kind,
      name: "FAQ",
      visible: true,
      blocks: [{ id: `${id}-copy`, type: "copy", content: { title: "Common questions" } }],
      items: [
        { question: "How long does delivery take?", answer: "Delivery time depends on your location and selected shipping method." },
        { question: "Can I return an item?", answer: "Returns are handled according to the store policy shown at checkout." },
        { question: "How do I contact support?", answer: "Use the contact form or reply to your order confirmation email." },
      ],
    };
  }

  return {
    id,
    kind,
    name: "Story Section",
    visible: true,
    blocks: [
      {
        id: `${id}-copy`,
        type: "copy",
        content: {
          title: "Add a new section.",
          body: "Rex or the visual editor can reshape this into a richer content block.",
        },
      },
    ],
    items: [],
  };
}

export function updateDraftFromOps(
  brandSettings: StoreBrandSettingsLike,
  ops: StoreEditorPatchOp[],
  fallback: StoreEditorSnapshot | null,
) {
  const draft = resolveDraftSnapshot(brandSettings, fallback);
  if (!draft) {
    throw new Error("No draft snapshot found.");
  }

  const updated = applyEditorPatchOps(draft, ops);
  return {
    updated,
    brandSettings: {
      ...brandSettings,
      editor: {
        ...parseEditorState(brandSettings.editor),
        draft: updated,
      },
      themeTokens: updated.themeTokens,
    },
  };
}

export function updateDraftFromSnapshot(
  brandSettings: StoreBrandSettingsLike,
  snapshot: StoreEditorSnapshot,
) {
  return {
    ...brandSettings,
    themeTokens: snapshot.themeTokens,
    editor: {
      ...parseEditorState(brandSettings.editor),
      draft: snapshot,
    },
  };
}

export function hydrateDraftFromStoreConfig(
  brandSettings: StoreBrandSettingsLike,
  storeConfig: StoreConfigLike,
  fallback: StoreEditorSnapshot | null,
) {
  const draft = resolveDraftSnapshot(brandSettings, fallback);
  if (!draft) {
    throw new Error("No draft snapshot found.");
  }

  const updated = syncSnapshotFromStoreConfig(draft, storeConfig);
  return {
    updated,
    brandSettings: {
      ...brandSettings,
      themeTokens: updated.themeTokens,
      editor: {
        ...parseEditorState(brandSettings.editor),
        draft: updated,
      },
    },
  };
}

export function applyTemplateToDraft(
  brandSettings: StoreBrandSettingsLike,
  manifest: StoreTemplateManifest,
  draft: StoreEditorSnapshot,
) {
  return buildBrandSettingsForDraft(brandSettings, manifest, draft);
}

export function publishDraftState(
  brandSettings: StoreBrandSettingsLike,
  manifest: StoreTemplateManifest,
  draft: StoreEditorSnapshot,
) {
  return {
    brandSettings: buildBrandSettingsForPublish(brandSettings, manifest, draft),
    pages: snapshotToPublishedPages(draft),
  };
}

export function buildEditorEnvelope(
  brandSettings: StoreBrandSettingsLike,
  fallbackDraft: StoreEditorSnapshot | null = null,
) {
  const draft = resolveDraftSnapshot(brandSettings, fallbackDraft);
  const published = resolvePublishedSnapshot(brandSettings, null);
  const template = brandSettings.template ?? parseEditorState(brandSettings.editor).template ?? null;
  return {
    template,
    draft,
    published,
  };
}

export function guessPageType(input: string): TemplatePageType {
  if (
    input === "products" ||
    input === "product" ||
    input === "categories" ||
    input === "cart" ||
    input === "checkout" ||
    input === "wishlist" ||
    input === "blog" ||
    input === "about" ||
    input === "contact" ||
    input === "faq"
  ) {
    return input;
  }
  return "home";
}

export function summarizeTemplateForAi(templateId: string) {
  const manifest = getTemplateManifest(templateId);
  if (!manifest) return null;
  const ai = getThemeAIHints(templateId);
  const nav = getNavStructure(templateId);
  return {
    id: manifest.id,
    name: manifest.name,
    category: manifest.category,
    layoutFamily: manifest.layoutFamily,
    description: manifest.description,
    aiHints: manifest.aiHints,
    designProfile: {
      palette: ai.palette,
      vibe: ai.vibe,
      layout: ai.layout,
      keySections: ai.keySections,
      dynamicBindings: ai.dynamicBindings,
      rexPrompt: ai.rexPrompt,
    },
    nav,
    supportedPages: manifest.supportedPages,
    pageBlueprints: manifest.seedPages.map((page) => ({
      pageType: page.pageType,
      title: page.title,
      slug: page.slug,
      sections: page.sections.map((section) => ({
        id: section.id,
        kind: section.kind,
        name: section.name,
        copyKeys: section.blocks
          .filter((block) => block.type === "copy")
          .flatMap((block) => Object.keys(block.content)),
        itemCount: section.items?.length ?? 0,
        itemKeys: Array.from(new Set((section.items ?? []).flatMap((item) => Object.keys(item)))),
      })),
    })),
    themeTokens: manifest.themeTokens,
  };
}

export function getCurrentTemplateMeta(brandSettings: StoreBrandSettingsLike) {
  return brandSettings.template ?? parseEditorState(brandSettings.editor).template ?? null;
}

export function attachTemplateMeta(
  brandSettings: StoreBrandSettingsLike,
  manifest: StoreTemplateManifest,
) {
  return {
    ...brandSettings,
    template: buildTemplateSelectionMeta(manifest),
  };
}
