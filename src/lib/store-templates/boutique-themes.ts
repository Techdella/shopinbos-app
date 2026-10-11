// The 2026 storefront themes (Breeze, Noir, Plain, Adire, Pantry, Ilé, Plug, Stride). They are ordinary template manifests (so
// /builder/templates, the editor and Rex can pick them), rendered by the boutique storefront renderer
// (src/components/storefront/boutique). Seeds carry no stock photos and no invented reviews or offers:
// imagery comes from the seller's products or uploads, proof from real reviews, promises from settings.

import type { StoreTemplateManifest, TemplateBlockNode, TemplatePageSeed, TemplateSectionNode, ThemeTokenSet } from "./types";

export type BoutiqueThemeId = "breeze" | "noir" | "plain" | "adire" | "pantry" | "ile" | "plug" | "stride";

export const BOUTIQUE_THEME_IDS: readonly BoutiqueThemeId[] = ["breeze", "noir", "plain", "adire", "pantry", "ile", "plug", "stride"];

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
  adire: {
    heroBg: "#2B1D14",
    heroText: "#FFFFFF",
    accent: "#B8612F",
    ctaBg: "#2B1D14",
    ctaText: "#F3ECE5",
    paperBg: "#F3ECE5",
    cardBg: "#EADFD3",
    ink: "#2B1D14",
    muted: "#76604F",
    border: "#DDCFC1",
    headingStyle: "serif",
    radius: "sharp",
  },
  pantry: {
    heroBg: "#E2541B",
    heroText: "#FFF8EA",
    accent: "#E2541B",
    ctaBg: "#E2541B",
    ctaText: "#FFFFFF",
    paperBg: "#FFF8EA",
    cardBg: "#FFEBC2",
    ink: "#3A1E0B",
    muted: "#7A5B43",
    border: "#EFD9AF",
    headingStyle: "grotesk",
    radius: "rounded",
  },
  ile: {
    heroBg: "#DCE5DE",
    heroText: "#1F2A24",
    accent: "#5E7464",
    ctaBg: "#1F2A24",
    ctaText: "#F4F6F2",
    paperBg: "#F4F6F2",
    cardBg: "#E6EDE8",
    ink: "#1F2A24",
    muted: "#5F6B63",
    border: "#D5DED7",
    headingStyle: "serif",
    radius: "soft",
  },
  plug: {
    heroBg: "#0B0C10",
    heroText: "#F2F4F7",
    accent: "#5B8CFF",
    ctaBg: "#5B8CFF",
    ctaText: "#FFFFFF",
    paperBg: "#111318",
    cardBg: "#1A1D24",
    ink: "#F2F4F7",
    muted: "#9AA1AC",
    border: "#2A2E37",
    headingStyle: "grotesk",
    radius: "sharp",
  },
  stride: {
    heroBg: "#FF4D1F",
    heroText: "#FFFFFF",
    accent: "#FF4D1F",
    ctaBg: "#141414",
    ctaText: "#FFFFFF",
    paperBg: "#FFFFFF",
    cardBg: "#FDE6DA",
    ink: "#141414",
    muted: "#5E5E5E",
    border: "#EDE3DD",
    headingStyle: "grotesk",
    radius: "rounded",
  },
};

const NAV = ["home", "products", "about", "contact"];

function announcement() {
  // Empty text: the storefront derives the bar from shipping zones and payment settings, or hides it.
  return section("announcement", "announcement-bar", "Announcement Bar", { text: "" }, { settings: { source: "store-settings" } });
}

function header(layout: "split" | "centered" | "bold") {
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

function bestSellers(layout: "carousel" | "tiles", title = "Best sellers") {
  return section("featured-products", "featured-products", "Best Sellers", { title, cta: "Shop all" }, { settings: { layout, source: "best-sellers", allowMapping: true } });
}

const HERO_SEEDS: Record<BoutiqueThemeId, { layout: string; eyebrow: string; title: string; primaryCta: string }> = {
  breeze: { layout: "breeze-banner", eyebrow: "", title: "New season, made for the heat", primaryCta: "Shop new arrivals" },
  noir: { layout: "noir-center", eyebrow: "", title: "The new edit", primaryCta: "Shop the edit" },
  plain: { layout: "plain-slides", eyebrow: "New season", title: "The new edit", primaryCta: "Shop now" },
  adire: { layout: "adire-banner", eyebrow: "", title: "The new collection", primaryCta: "Shop new arrivals" },
  pantry: { layout: "pantry-split", eyebrow: "Fresh this week", title: "Made to be enjoyed", primaryCta: "Order now" },
  ile: { layout: "ile-calm", eyebrow: "Home and living", title: "Pieces for a calm home", primaryCta: "Shop the collection" },
  plug: { layout: "plug-spotlight", eyebrow: "New in", title: "The latest tech, sorted", primaryCta: "Shop now" },
  stride: { layout: "stride-loud", eyebrow: "New drop", title: "Built to move", primaryCta: "Shop the drop" },
};

function hero(theme: BoutiqueThemeId): TemplateSectionNode {
  const seed = HERO_SEEDS[theme];
  return section("hero", "hero-split", "Hero", { eyebrow: seed.eyebrow, title: seed.title, body: "", primaryCta: seed.primaryCta }, { settings: { layout: seed.layout, primaryButtonAction: "products" }, items: [] });
}

function categories(theme: BoutiqueThemeId, title = "Shop by category") {
  const layout = theme === "plug" ? "chips" : theme === "breeze" || theme === "ile" || theme === "stride" ? "boutique-tiles" : "boutique-circles";
  return section("categories", "category-grid", "Shop by Category", { title }, { settings: { layout, source: "store-categories" } });
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
    { settings: { layout: theme === "noir" ? "noir-split" : theme === "adire" || theme === "ile" ? "editorial" : "boutique" }, items: [] },
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
    sections: [announcement(), header(theme === "plain" || theme === "ile" ? "centered" : theme === "stride" ? "bold" : "split"), ...body, footer()],
    seo: { metaTitle: title === "Home" ? themeName : title, metaDescription: "" },
  };
}

function homeSections(theme: BoutiqueThemeId): TemplateSectionNode[] {
  switch (theme) {
    case "noir":
      return [hero("noir"), payday(), bestSellers("carousel"), story("noir")];
    case "plain":
      return [hero("plain"), bestSellers("carousel"), faq(), newsletter()];
    case "adire":
      return [hero("adire"), bestSellers("carousel"), story("adire"), categories("adire", "Shop the collection"), newsletter()];
    case "pantry":
      return [hero("pantry"), categories("pantry", "What are you craving?"), bestSellers("tiles", "Popular right now"), faq(), newsletter()];
    case "ile":
      return [hero("ile"), categories("ile", "Shop by room"), bestSellers("tiles", "New in"), story("ile"), newsletter()];
    case "plug":
      return [hero("plug"), categories("plug"), bestSellers("carousel", "Top picks"), faq(), newsletter()];
    case "stride":
      return [hero("stride"), bestSellers("carousel", "Best sellers"), categories("stride", "Shop by style"), reviews(), newsletter()];
    default:
      return [hero("breeze"), categories("breeze"), bestSellers("carousel"), reviews(), newsletter()];
  }
}

const PRODUCT_LAYOUT: Record<BoutiqueThemeId, string> = {
  breeze: "boutique-gallery",
  noir: "boutique-gallery",
  plain: "boutique-gallery",
  adire: "editorial-gallery",
  pantry: "stacked",
  ile: "editorial-gallery",
  plug: "spec-sheet",
  stride: "wide-gallery",
};

function buildPages(theme: BoutiqueThemeId, themeName: string): TemplatePageSeed[] {
  return [
    page(theme, "home", "Home", "home", homeSections(theme), themeName),
    page(theme, "products", "Shop", "shop", [
      section("shop-grid", "featured-products", "All Products", { title: "Shop all" }, { settings: { layout: "grid", source: "all", filters: true } }),
    ], themeName),
    page(theme, "product", "Product", "product", [
      section("product-detail", "product-detail", "Product Detail", { title: "" }, { settings: { layout: PRODUCT_LAYOUT[theme] } }),
      section("related", "featured-products", "Explore", { title: theme === "pantry" ? "Goes well with" : "Explore" }, { settings: { layout: "carousel", source: "related" } }),
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
  {
    id: "adire",
    name: "Adire",
    description: "Editorial and photo-led on warm sand: a dark announcement bar, italic serif shop name, a big image banner, a best sellers carousel and an image-with-text story.",
    tags: ["fashion", "editorial", "serif", "photo-led", "2026"],
    aiHints: [
      "Adire: sand page, cocoa ink, rust accent, italic serif shop name, serif headings, outlined pill buttons on photos",
      "Home order: full-width image banner with a centred serif headline, best sellers carousel with arrows, image with text, collection tiles, newsletter",
      "Write like a fashion editor: short, sensory headlines (under 7 words)",
    ],
  },
  {
    id: "pantry",
    name: "Pantry",
    description: "Warm and bold for food and drinks: a big split banner in tomato and cream, round category picks, a popular-now grid and delivery answers from your settings.",
    tags: ["food", "drinks", "warm", "bold", "2026"],
    aiHints: [
      "Pantry: cream page, tomato accent, heavy sans headings, rounded cards and pill buttons",
      "Home order: split hero (bold headline on colour, photo beside it), round category picks, popular products grid, questions, newsletter",
      "Talk about taste and freshness; never promise delivery times the seller hasn't set",
    ],
  },
  {
    id: "ile",
    name: "Ilé",
    description: "Calm and roomy for home and decor: a centred logo, lots of white space, a quiet headline over a wide photo, rooms as tiles and an editorial story.",
    tags: ["home", "decor", "furniture", "calm", "2026"],
    aiHints: [
      "Ilé: soft sage page, deep green ink, serif headings, generous spacing, soft corners",
      "Home order: calm hero (headline then wide photo), shop by room tiles, new in grid, image with text, newsletter",
      "Keep copy quiet and short; let the photos breathe",
    ],
  },
  {
    id: "plug",
    name: "Plug",
    description: "Dark and sharp for gadgets: a spotlight banner with the product on a glow, category chips, a top picks carousel and plain answers about delivery and payment.",
    tags: ["gadgets", "electronics", "dark", "tech", "2026"],
    aiHints: [
      "Plug: near-black page, electric blue accent, sharp corners, mono labels for specs",
      "Home order: spotlight hero (text left, product right), category chips, top picks carousel, questions, newsletter",
      "Be specific and factual: model, storage, warranty only when the seller provides it",
    ],
  },
  {
    id: "stride",
    name: "Stride",
    description: "Loud and sporty for shoes: a huge uppercase headline over the photo, best sellers up front, style tiles, real reviews and a big product gallery.",
    tags: ["shoes", "sneakers", "sport", "loud", "2026"],
    aiHints: [
      "Stride: white page, blaze orange accent, heavy italic uppercase headings, black pill buttons",
      "Home order: loud hero, best sellers carousel, shop by style tiles, customer reviews, newsletter",
      "Short punchy headlines (2 to 4 words)",
    ],
  },
];

const MANIFEST_SHAPE: Record<BoutiqueThemeId, Pick<StoreTemplateManifest, "category" | "layoutFamily">> = {
  breeze: { category: "fashion", layoutFamily: "minimal-showcase" },
  noir: { category: "fashion", layoutFamily: "editorial-boutique" },
  plain: { category: "minimal", layoutFamily: "minimal-showcase" },
  adire: { category: "fashion", layoutFamily: "editorial-boutique" },
  pantry: { category: "food", layoutFamily: "food-market" },
  ile: { category: "furniture", layoutFamily: "home-living" },
  plug: { category: "electronics", layoutFamily: "electronics-grid" },
  stride: { category: "fashion", layoutFamily: "fashion-runway" },
};

export const BOUTIQUE_TEMPLATE_MANIFESTS: StoreTemplateManifest[] = DEFINITIONS.map((definition) => ({
  id: definition.id,
  name: definition.name,
  sourcePack: "Shopinbos 2026 storefront themes",
  sourcePath: `/store-templates/native/${definition.id}`,
  sourceType: "next-template",
  category: MANIFEST_SHAPE[definition.id].category,
  description: definition.description,
  layoutFamily: MANIFEST_SHAPE[definition.id].layoutFamily,
  themeTokens: BOUTIQUE_THEME_TOKENS[definition.id],
  supportedPages: ["home", "products", "product", "cart", "checkout", "wishlist", "about", "contact", "faq"],
  seedPages: buildPages(definition.id, definition.name),
  demoAssets: [],
  demoContentMode: "starter-demo",
  tags: definition.tags,
  aiHints: [...definition.aiHints, "Native Shopinbos 2026 theme; products, categories, reviews and delivery details bind to live store data."],
}));
