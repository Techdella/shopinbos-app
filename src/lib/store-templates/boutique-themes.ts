// Breeze, Noir and Plain: the 2026 storefront themes. They are ordinary template manifests (so
// /builder/templates, the editor and Rex can pick them), rendered by the boutique storefront renderer
// (src/components/storefront/boutique). Seeds carry no stock photos and no invented reviews or offers:
// imagery comes from the seller's products or uploads, proof from real reviews, promises from settings.

import type { StoreTemplateManifest, TemplateBlockNode, TemplatePageSeed, TemplateSectionNode, ThemeTokenSet } from "./types";

export type BoutiqueThemeId = "breeze" | "noir" | "plain";

export const BOUTIQUE_THEME_IDS: readonly BoutiqueThemeId[] = ["breeze", "noir", "plain"];

export function isBoutiqueTheme(templateId: string | null | undefined): templateId is BoutiqueThemeId {
  return typeof templateId === "string" && (BOUTIQUE_THEME_IDS as readonly string[]).includes(templateId);
}

function block(id: string, type: string, content: Record<string, unknown>): TemplateBlockNode {
  return { id, type, content };
}

function section(
  id: string,
  kind: string,
  name: string,
  copy: Record<string, unknown>,
  options?: Partial<Pick<TemplateSectionNode, "items" | "settings" | "visible">>,
): TemplateSectionNode {
  return { id, kind, name, visible: options?.visible ?? true, blocks: [block(`${id}-copy`, "copy", copy)], items: options?.items, settings: options?.settings };
}

export const BOUTIQUE_THEME_TOKENS: Record<BoutiqueThemeId, ThemeTokenSet> = {
  breeze: {
    heroBg: "#1D2327",
    heroText: "#FFFFFF",
    accent: "#1FC6D6",
    ctaBg: "#1FC6D6",
    ctaText: "#FFFFFF",
    paperBg: "#FFFFFF",
    cardBg: "#EEF6F7",
    ink: "#1A1D21",
    muted: "#5F6670",
    border: "#E3E7EA",
    headingStyle: "grotesk",
    radius: "rounded",
  },
  noir: {
    heroBg: "#0A0A0A",
    heroText: "#FFFFFF",
    accent: "#C8A96A",
    ctaBg: "#FFFFFF",
    ctaText: "#0A0A0A",
    paperBg: "#121212",
    cardBg: "#1C1B1A",
    ink: "#F5F2EA",
    muted: "#A9A49A",
    border: "#2C2B29",
    headingStyle: "serif",
    radius: "sharp",
  },
  plain: {
    heroBg: "#111111",
    heroText: "#FFFFFF",
    accent: "#111111",
    ctaBg: "#111111",
    ctaText: "#FFFFFF",
    paperBg: "#FFFFFF",
    cardBg: "#F3F3F3",
    ink: "#111111",
    muted: "#6B6B6B",
    border: "#E4E4E4",
    headingStyle: "grotesk",
    radius: "sharp",
  },
};

const NAV = ["home", "products", "about", "contact"];

function announcement() {
  // Empty text: the storefront derives the bar from shipping zones and payment settings, or hides it.
  return section("announcement", "announcement-bar", "Announcement Bar", { text: "" }, { settings: { source: "store-settings" } });
}

function header(layout: "split" | "centered") {
  return section("header", "header", "Header", { navLinks: NAV, utilityLinks: ["wishlist", "cart"], cartLabel: "My bag" }, { settings: { layout, search: true, wishlist: true, cart: true } });
}

function footer() {
  return section("footer", "footer", "Footer", { summary: "" }, { settings: { layout: "boutique", showPayments: true } });
}

function newsletter() {
  return section("newsletter", "newsletter", "Newsletter", {
    title: "Subscribe to new drops",
    body: "Be first to hear about new pieces. No spam.",
    buttonLabel: "Subscribe",
    placeholder: "WhatsApp number or email",
  });
}

function bestSellers(layout: "carousel" | "grid") {
  return section("featured-products", "featured-products", "Best Sellers", { title: "Best sellers", cta: "Shop all" }, { settings: { layout, source: "best-sellers", allowMapping: true } });
}

function hero(theme: BoutiqueThemeId): TemplateSectionNode {
  if (theme === "noir") {
    return section("hero", "hero-split", "Hero", { eyebrow: "", title: "The new edit", body: "", primaryCta: "Shop the edit" }, { settings: { layout: "noir-center", primaryButtonAction: "products" }, items: [] });
  }
  if (theme === "plain") {
    return section("hero", "hero-split", "Hero", { eyebrow: "New season", title: "The new edit", body: "", primaryCta: "Shop now" }, { settings: { layout: "plain-slides", primaryButtonAction: "products" }, items: [] });
  }
  return section("hero", "hero-split", "Hero", { eyebrow: "", title: "New season, made for the heat", body: "", primaryCta: "Shop new arrivals" }, { settings: { layout: "breeze-banner", primaryButtonAction: "products" }, items: [] });
}

function categories(theme: BoutiqueThemeId) {
  return section("categories", "category-grid", "Shop by Category", { title: "Shop by category" }, { settings: { layout: theme === "breeze" ? "boutique-tiles" : "boutique-circles", source: "store-categories" } });
}

function reviews() {
  return section("testimonials", "testimonials", "Customer Reviews", { title: "What customers say" }, { settings: { source: "product-reviews" }, items: [] });
}

function payday() {
  return section(
    "payday",
    "payday-countdown",
    "Payday Countdown",
    { eyebrow: "Payday edit", title: "", discountLabel: "", body: "", primaryCta: "Shop the edit" },
    { settings: { paydayRule: "day-of-month", paydayDay: 25, weekendToFriday: true, saleEnds: "sunday", saleDays: 3 } },
  );
}

function story(theme: BoutiqueThemeId) {
  return section(
    "story",
    "story-split",
    "Our Story",
    { eyebrow: "Our studio", title: "Made with care", body: "", primaryCta: "Our story" },
    { settings: { layout: theme === "noir" ? "noir-split" : "boutique" }, items: [] },
  );
}

function faq() {
  return section(
    "faq",
    "faq",
    "Questions",
    { title: "Questions" },
    {
      items: [
        // Answers left blank are filled from the store's own delivery and payment settings.
        { question: "How fast is delivery?", answer: "", answerSource: "delivery" },
        { question: "Can I pay on delivery?", answer: "", answerSource: "payment" },
        { question: "What if it does not fit?", answer: "", answerSource: "returns" },
      ],
    },
  );
}

function page(theme: BoutiqueThemeId, pageType: TemplatePageSeed["pageType"], title: string, slug: string, body: TemplateSectionNode[], themeName: string): TemplatePageSeed {
  return {
    id: `${theme}-${pageType}`,
    pageType,
    title,
    slug,
    sections: [announcement(), header(theme === "plain" ? "centered" : "split"), ...body, footer()],
    seo: { metaTitle: title === "Home" ? themeName : title, metaDescription: "" },
  };
}

function homeSections(theme: BoutiqueThemeId): TemplateSectionNode[] {
  if (theme === "noir") return [hero("noir"), payday(), bestSellers("carousel"), story("noir")];
  if (theme === "plain") return [hero("plain"), bestSellers("carousel"), faq(), newsletter()];
  return [hero("breeze"), categories("breeze"), bestSellers("carousel"), reviews(), newsletter()];
}

function buildPages(theme: BoutiqueThemeId, themeName: string): TemplatePageSeed[] {
  return [
    page(theme, "home", "Home", "home", homeSections(theme), themeName),
    page(theme, "products", "Shop", "shop", [
      section("shop-grid", "featured-products", "All Products", { title: "Shop all" }, { settings: { layout: "grid", source: "all", filters: true } }),
    ], themeName),
    page(theme, "product", "Product", "product", [
      section("product-detail", "product-detail", "Product Detail", { title: "" }, { settings: { layout: "boutique-gallery" } }),
      section("related", "featured-products", "Explore", { title: "Explore" }, { settings: { layout: "carousel", source: "related" } }),
    ], themeName),
    page(theme, "wishlist", "Wishlist", "wishlist", [section("wishlist", "wishlist-grid", "Wishlist", { title: "Your wishlist" })], themeName),
    page(theme, "cart", "Bag", "cart", [section("cart", "cart-summary", "Bag", { title: "Your bag" }, { settings: { drawerVariation: "right-drawer" } })], themeName),
    page(theme, "checkout", "Checkout", "checkout", [section("checkout", "checkout-form", "Checkout", { title: "Checkout" })], themeName),
    page(theme, "about", "About", "about", [story(theme)], themeName),
    page(theme, "contact", "Contact", "contact", [
      section("contact", "contact-form", "Contact", { title: "Get in touch", body: "Questions about an order or a size? Send us a message.", buttonLabel: "Send message" }),
    ], themeName),
    page(theme, "faq", "FAQ", "faq", [faq()], themeName),
  ];
}

const DEFINITIONS: Array<{ id: BoutiqueThemeId; name: string; description: string; tags: string[]; aiHints: string[] }> = [
  {
    id: "breeze",
    name: "Breeze",
    description: "Light and airy: italic serif logo, wide photo banner, category tiles, best sellers with wishlist hearts, real customer reviews and a WhatsApp-friendly product page.",
    tags: ["fashion", "light", "mobile-first", "reviews", "whatsapp", "2026"],
    aiHints: [
      "Breeze: white page, turquoise accent, italic serif shop name, rounded cards",
      "Home order: hero banner with headline and 'Shop new arrivals', shop by category tiles, best sellers carousel, customer reviews, newsletter",
      "Keep hero copy short (under 8 words); never invent reviews, offers or delivery promises",
    ],
  },
  {
    id: "noir",
    name: "Noir",
    description: "Black and gold boutique with a payday countdown banner: a centred headline, a live countdown to (or through) payday week, best sellers and a studio story.",
    tags: ["fashion", "dark", "premium", "payday", "countdown", "2026"],
    aiHints: [
      "Noir: near-black page, antique gold accent, uppercase serif headings, square outlined buttons",
      "Home order: centred hero, payday countdown strip (payday defaults to the 25th, moved to Friday at weekends), best sellers, studio story split",
      "Only mention a discount when the seller gives one; otherwise call it the payday edit",
    ],
  },
  {
    id: "plain",
    name: "Plain",
    description: "Quiet and minimal with a centred logo: a full-width hero with slide dots, best sellers, questions answered from your delivery and payment settings, and a newsletter.",
    tags: ["minimal", "centred logo", "clean", "faq", "2026"],
    aiHints: [
      "Plain: white page, black type and buttons, centred logo header, square product cards",
      "Home order: full-width hero with eyebrow and title, best sellers carousel, questions accordion, newsletter",
      "FAQ answers about delivery and pay on delivery come from the store's own settings",
    ],
  },
];

export const BOUTIQUE_TEMPLATE_MANIFESTS: StoreTemplateManifest[] = DEFINITIONS.map((definition) => ({
  id: definition.id,
  name: definition.name,
  sourcePack: "Shopinbos 2026 storefront themes",
  sourcePath: `/store-templates/native/${definition.id}`,
  sourceType: "next-template",
  category: definition.id === "plain" ? "minimal" : "fashion",
  description: definition.description,
  layoutFamily: definition.id === "noir" ? "editorial-boutique" : "minimal-showcase",
  themeTokens: BOUTIQUE_THEME_TOKENS[definition.id],
  supportedPages: ["home", "products", "product", "cart", "checkout", "wishlist", "about", "contact", "faq"],
  seedPages: buildPages(definition.id, definition.name),
  demoAssets: [],
  demoContentMode: "starter-demo",
  tags: definition.tags,
  aiHints: [...definition.aiHints, "Native Shopinbos 2026 theme; products, categories, reviews and delivery details bind to live store data."],
}));
