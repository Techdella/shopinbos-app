import { getThemeSeedPages, getThemeAIHints, getNavStructure, resolveThemeTokens, THEME_DESIGN_PROFILES } from "./themes";
import { TEMPLATE_SOURCE_CATALOG, type TemplateSourceRecord } from "./source-catalog.generated";
import { BOUTIQUE_TEMPLATE_MANIFESTS } from "./boutique-themes";
import type {
  LayoutFamily,
  StoreEditorSnapshot,
  StoreTemplateManifest,
  TemplateBlockNode,
  TemplateCategory,
  TemplateGalleryItem,
  TemplatePageSeed,
  TemplateSectionNode,
  ThemeTokenSet,
} from "./types";

function block(id: string, type: string, content: Record<string, unknown>): TemplateBlockNode {
  return { id, type, content };
}

function section(
  id: string,
  kind: string,
  name: string,
  blocks: TemplateBlockNode[],
  options?: Partial<Pick<TemplateSectionNode, "items" | "settings" | "visible">>,
): TemplateSectionNode {
  return {
    id,
    kind,
    name,
    visible: options?.visible ?? true,
    blocks,
    items: options?.items,
    settings: options?.settings,
  };
}

const FAMILY_THEMES: Record<LayoutFamily, ThemeTokenSet> = {
  "editorial-boutique": {
    heroBg: "#1E1A18",
    heroText: "#F9F6F1",
    accent: "#C9973A",
    ctaBg: "#C9973A",
    ctaText: "#1E1A18",
    paperBg: "#F9F6F1",
    cardBg: "#FFFFFF",
    ink: "#1A1A18",
    muted: "#6F6A63",
    border: "#E7E0D6",
    headingStyle: "serif",
    radius: "soft",
  },
  "fashion-runway": {
    heroBg: "#211329",
    heroText: "#F8F3EF",
    accent: "#E8B85A",
    ctaBg: "#E8B85A",
    ctaText: "#211329",
    paperBg: "#FCF8F3",
    cardBg: "#FFFFFF",
    ink: "#1D1620",
    muted: "#6B6470",
    border: "#E7DEE9",
    headingStyle: "serif",
    radius: "rounded",
  },
  "minimal-showcase": {
    heroBg: "#0E2A38",
    heroText: "#F7F6F2",
    accent: "#73D8C8",
    ctaBg: "#73D8C8",
    ctaText: "#0E2A38",
    paperBg: "#FAF7F1",
    cardBg: "#FFFFFF",
    ink: "#0E2A38",
    muted: "#64727B",
    border: "#DDE4E7",
    headingStyle: "grotesk",
    radius: "rounded",
  },
  "food-market": {
    heroBg: "#28462D",
    heroText: "#FBF8F2",
    accent: "#F2A93B",
    ctaBg: "#F2A93B",
    ctaText: "#28462D",
    paperBg: "#F9F5EC",
    cardBg: "#FFFFFF",
    ink: "#172A18",
    muted: "#667263",
    border: "#E4E3D8",
    headingStyle: "grotesk",
    radius: "rounded",
  },
  "home-living": {
    heroBg: "#54443A",
    heroText: "#FCF7F2",
    accent: "#DDA15E",
    ctaBg: "#DDA15E",
    ctaText: "#2A211C",
    paperBg: "#FAF5EE",
    cardBg: "#FFFFFF",
    ink: "#312724",
    muted: "#766A63",
    border: "#E5DBD0",
    headingStyle: "serif",
    radius: "soft",
  },
  "electronics-grid": {
    heroBg: "#0F1728",
    heroText: "#F7FAFF",
    accent: "#4FD1FF",
    ctaBg: "#4FD1FF",
    ctaText: "#0F1728",
    paperBg: "#F3F7FC",
    cardBg: "#FFFFFF",
    ink: "#10192A",
    muted: "#617187",
    border: "#DBE5F0",
    headingStyle: "grotesk",
    radius: "rounded",
  },
  "book-lifestyle": {
    heroBg: "#31233A",
    heroText: "#FAF6EF",
    accent: "#C8A66A",
    ctaBg: "#C8A66A",
    ctaText: "#31233A",
    paperBg: "#FBF7EF",
    cardBg: "#FFFFFF",
    ink: "#2A2230",
    muted: "#756A77",
    border: "#E7E0E3",
    headingStyle: "serif",
    radius: "soft",
  },
  "pet-lifestyle": {
    heroBg: "#24415B",
    heroText: "#F6FAFE",
    accent: "#F4C95D",
    ctaBg: "#F4C95D",
    ctaText: "#24415B",
    paperBg: "#F8F5EF",
    cardBg: "#FFFFFF",
    ink: "#1C2D3A",
    muted: "#64727D",
    border: "#DEE7EC",
    headingStyle: "grotesk",
    radius: "rounded",
  },
  "marketplace-grid": {
    heroBg: "#182A3C",
    heroText: "#F7F6F2",
    accent: "#F3A83B",
    ctaBg: "#F3A83B",
    ctaText: "#182A3C",
    paperBg: "#F8F5EE",
    cardBg: "#FFFFFF",
    ink: "#122434",
    muted: "#6C7981",
    border: "#E0E6EA",
    headingStyle: "grotesk",
    radius: "rounded",
  },
};

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  fashion: "fashion",
  beauty: "beauty",
  food: "food and grocery",
  furniture: "home and living",
  electronics: "electronics",
  books: "books and lifestyle",
  pets: "pet care",
  general: "general retail",
  minimal: "general retail",
};

function withAccent(base: ThemeTokenSet, accent: string): ThemeTokenSet {
  return { ...base, accent, ctaBg: accent };
}

function resolveTheme(source: TemplateSourceRecord): ThemeTokenSet {
  if (THEME_DESIGN_PROFILES[source.id]) return resolveThemeTokens(source.id);

  const base = FAMILY_THEMES[source.layoutFamily];

  switch (source.id) {
    case "shopinbos-boutique":
      return withAccent({ ...base, heroBg: "#1A1A18", paperBg: "#FCF8F2" }, "#C9973A");
    case "happy-box":
      return withAccent({ ...base, heroBg: "#6B456B", paperBg: "#FFF8FB" }, "#FF8BB8");
    case "foodmart":
      return withAccent({ ...base, heroBg: "#2E5B31" }, "#F9B64D");
    case "fruitables":
      return withAccent({ ...base, heroBg: "#2F6E3A", paperBg: "#F7FBF0" }, "#F2A93B");
    case "electro":
      return withAccent({ ...base, heroBg: "#121A2E" }, "#58C7FF");
    case "kaira":
      return withAccent({ ...base, heroBg: "#1E1423" }, "#E4B55A");
    case "waggy":
      return withAccent({ ...base, heroBg: "#2B5578", paperBg: "#FAF7F0" }, "#F4C95D");
    default:
      return base;
  }
}

function demoProducts(source: TemplateSourceRecord) {
  if (source.category === "food") {
    return [
      { title: "Signature Market Box", subtitle: "Freshly curated", priceLabel: "NGN 18,500", color: "#D5852F", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=600&fit=crop" },
      { title: "Weekly Essentials", subtitle: "Pantry staples", priceLabel: "NGN 9,200", color: "#3A6A3F", imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=600&fit=crop" },
      { title: "Weekend Treat Pack", subtitle: "Ready to gift", priceLabel: "NGN 12,800", color: "#B44D2D", imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop" },
    ];
  }

  if (source.category === "electronics") {
    return [
      { title: "Wireless Earbuds Pro", subtitle: "48-hour battery", priceLabel: "NGN 44,000", color: "#283A73", imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop" },
      { title: "Fast Charger Dock", subtitle: "Smart charging", priceLabel: "NGN 19,500", color: "#194D6E", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
      { title: "Portable Speaker", subtitle: "Travel ready", priceLabel: "NGN 27,000", color: "#4B5D7A", imageUrl: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&h=600&fit=crop" },
    ];
  }

  if (source.category === "furniture") {
    return [
      { title: "Oak Lounge Chair", subtitle: "Soft woven finish", priceLabel: "NGN 165,000", color: "#8F6D4E", imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=600&fit=crop" },
      { title: "Studio Side Table", subtitle: "Compact profile", priceLabel: "NGN 84,000", color: "#5C4338", imageUrl: "https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=600&h=600&fit=crop" },
      { title: "Textured Throw Set", subtitle: "Layered comfort", priceLabel: "NGN 29,500", color: "#B07C52", imageUrl: "https://images.unsplash.com/photo-1567016432779-094069958ea5?w=600&h=600&fit=crop" },
    ];
  }

  if (source.category === "books") {
    return [
      { title: "Weekend Reads Edit", subtitle: "Curated fiction", priceLabel: "NGN 13,500", color: "#5C4C7F", imageUrl: "https://images.unsplash.com/photo-1495440635901-15270af7d7e1?w=600&h=600&fit=crop" },
      { title: "Quiet Desk Bundle", subtitle: "Stationery set", priceLabel: "NGN 21,000", color: "#8B6B45", imageUrl: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&h=600&fit=crop" },
      { title: "Collector Notebook", subtitle: "Softbound edition", priceLabel: "NGN 8,500", color: "#37485E", imageUrl: "https://images.unsplash.com/photo-1544716278-ca5f3f4b60f0?w=600&h=600&fit=crop" },
    ];
  }

  if (source.category === "pets") {
    return [
      { title: "Daily Care Bundle", subtitle: "Pet essentials", priceLabel: "NGN 15,000", color: "#4A86A8", imageUrl: "https://images.unsplash.com/photo-1583512603805-3cc6b41f3edb?w=600&h=600&fit=crop" },
      { title: "Treat Jar Refill", subtitle: "Training favorites", priceLabel: "NGN 7,500", color: "#D99841", imageUrl: "https://images.unsplash.com/photo-1601758228041-f3f279d5e03d?w=600&h=600&fit=crop" },
      { title: "Walk Time Set", subtitle: "Lead and harness", priceLabel: "NGN 12,000", color: "#3E5C73", imageUrl: "https://images.unsplash.com/photo-1574158622682-40c1e4d5c0e0?w=600&h=600&fit=crop" },
    ];
  }

  if (source.category === "beauty") {
    return [
      { title: "Radiance Serum", subtitle: "Daily glow", priceLabel: "NGN 32,000", color: "#C47A7A", imageUrl: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&h=600&fit=crop" },
      { title: "Lip Collection", subtitle: "New shades", priceLabel: "NGN 14,500", color: "#A05252", imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&h=600&fit=crop" },
      { title: "Body Ritual Set", subtitle: "Self-care edit", priceLabel: "NGN 45,000", color: "#8B6F5E", imageUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=600&h=600&fit=crop" },
    ];
  }

  if (source.category === "fashion") {
    return [
      { title: "Tailored Blazer", subtitle: "Structured fit", priceLabel: "NGN 58,000", color: "#2A303C", imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600&h=600&fit=crop" },
      { title: "Weekend Sneaker", subtitle: "Clean silhouette", priceLabel: "NGN 38,000", color: "#C4B8A0", imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&h=600&fit=crop" },
      { title: "Canvas Tote", subtitle: "Everyday carry", priceLabel: "NGN 22,000", color: "#8B7D6B", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&h=600&fit=crop" },
    ];
  }

  return [
    { title: "Signature Drop One", subtitle: "New season release", priceLabel: "NGN 38,500", color: "#8A5A3A", imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&h=600&fit=crop" },
    { title: "Everyday Favorite", subtitle: "Best seller", priceLabel: "NGN 22,000", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop" },
    { title: "Editors' Pick", subtitle: "Curated for now", priceLabel: "NGN 28,500", color: "#466378", imageUrl: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=600&h=600&fit=crop" },
  ];
}

function buildAnnouncementSection(source: TemplateSourceRecord): TemplateSectionNode {
  return section("announcement", "announcement-bar", "Announcement Bar", [
    block("announcement-copy", "copy", {
      text: source.category === "food"
        ? "Free delivery on orders over NGN 25,000 — limited time"
        : "New season collection now live — free shipping on orders over NGN 30,000",
    }),
  ]);
}

function buildHeaderSection(source: TemplateSourceRecord): TemplateSectionNode {
  const nav = getNavStructure(source.id);
  return section("header", "header", "Header", [
    block("header-copy", "copy", {
      navLinks: nav.navLinks,
      utilityLinks: nav.utilityLinks,
      cartLabel: "Cart",
      ctaLabel: nav.ctaLabel || (source.category === "food" ? "Shop groceries" : "Shop now"),
      logoText: nav.logoText,
    }),
  ]);
}

function buildHeroSection(source: TemplateSourceRecord): TemplateSectionNode {
  const categoryLabel = CATEGORY_LABELS[source.category];
  const items = demoProducts(source);

  return section(
    "hero",
    "hero-split",
    "Hero",
    [
      block("hero-copy", "copy", {
        eyebrow: source.name,
        title: source.category === "food"
          ? "Fresh from the\nfarm to your door"
          : source.category === "electronics"
            ? "Power your life\nwith the latest tech"
            : `Discover curated\n${categoryLabel}, crafted for you`,
        body: `Shop our carefully selected range of premium ${categoryLabel}. Quality you can trust, delivered to your doorstep.`,
        primaryCta: "Shop the collection",
        secondaryCta: "View the story",
      }),
    ],
    {
      items: [
        { label: "Lead card", title: items[0]?.title, subtitle: items[0]?.subtitle, color: items[0]?.color, imageUrl: items[0]?.imageUrl },
        { label: "Support card", title: items[1]?.title, subtitle: items[1]?.subtitle, color: items[1]?.color, imageUrl: items[1]?.imageUrl },
      ],
    },
  );
}

function buildTrustSection(source: TemplateSourceRecord): TemplateSectionNode {
  return section(
    "trust",
    "trust-strip",
    "Trust Strip",
    [block("trust-copy", "copy", { title: "Trust markers" })],
    {
      items: [
        { label: "Products available", value: "100+" },
        { label: "Happy customers", value: "500+" },
        { label: source.category === "food" ? "Same-day delivery" : "Fast shipping", value: source.category === "food" ? "Lagos only" : "3-5 days" },
      ],
    },
  );
}

function buildCategorySection(source: TemplateSourceRecord): TemplateSectionNode {
  return section(
    "categories",
    "category-grid",
    "Category Grid",
    [
      block("categories-copy", "copy", {
        title: source.category === "food" ? "Shop by aisle" : "Browse by collection",
        body: "Explore our curated categories — from fresh arrivals to customer favorites.",
      }),
    ],
    {
      items: [
        { title: "New arrivals", subtitle: "Current focus", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
        { title: source.category === "food" ? "Gift boxes" : "Signature edit", subtitle: "Top picks", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
        { title: source.category === "electronics" ? "Accessories" : "Daily favorites", subtitle: "Fast movers", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=600&fit=crop" },
        { title: source.category === "furniture" ? "Room styling" : "Weekend drop", subtitle: "Story-led browse", color: "#8A5A3A", imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=600&fit=crop" },
      ],
    },
  );
}

function buildFeaturedProductsSection(source: TemplateSourceRecord): TemplateSectionNode {
  return section(
    "featured-products",
    "featured-products",
    "Featured Products",
    [
      block("featured-copy", "copy", {
        title: source.category === "food" ? "Popular right now" : "Featured collection",
        body: "Our best-selling products, handpicked just for you.",
      }),
    ],
    {
      items: demoProducts(source).map((item, index) => ({
        id: `${source.id}-demo-${index + 1}`,
        title: item.title,
        subtitle: item.subtitle,
        priceLabel: item.priceLabel,
        color: item.color,
        imageUrl: item.imageUrl,
        mappedStoreProductId: null,
      })),
      settings: { allowMapping: true },
    },
  );
}

function buildPromoSection(source: TemplateSourceRecord): TemplateSectionNode {
  return section("promo", "promo-banner", "Promo Banner", [
    block("promo-copy", "copy", {
      title: source.category === "food" ? "Weekend bundles — save up to 25%" : "Seasonal sale — up to 30% off selected items",
      body: "Limited time offer. Shop our curated selection of seasonal favorites at special prices.",
      cta: "Shop the sale",
    }),
  ]);
}

function buildStorySection(source: TemplateSourceRecord): TemplateSectionNode {
  return section(
    "story",
    "story-split",
    "Story Section",
    [
      block("story-copy", "copy", {
        title: source.category === "furniture"
          ? "Designed for living, built to last"
          : "Our story — quality you can trust",
        body: "We believe in products that bring joy and comfort to everyday life. Every item in our collection is carefully selected for quality, durability, and style.",
      }),
    ],
    {
      items: [
        { title: "Curated with care", body: "Every product is selected for quality and value, so you can shop with confidence." },
        { title: "Fast & reliable delivery", body: "We partner with trusted logistics partners to ensure your order arrives safely and on time." },
        { title: "Customer-first support", body: "Questions? Our team is here to help with orders, returns, and everything in between." },
      ],
    },
  );
}

function buildLookbookSection(source: TemplateSourceRecord): TemplateSectionNode {
  return section(
    "lookbook",
    source.category === "food" ? "text-columns" : "lookbook-grid",
    source.category === "food" ? "Offer Highlights" : "Lookbook Grid",
    [
      block("lookbook-copy", "copy", {
        title: source.category === "food" ? "Weekly highlights" : "Featured moments",
        body: source.category === "food"
          ? "Discover our weekly specials and seasonal offerings — perfect for every occasion."
          : "Explore our curated looks and style inspiration, handpicked for the season.",
      }),
    ],
    {
      items: [
        { title: "New season edit", subtitle: "Fresh arrivals", color: "#B07C52", imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=600&fit=crop" },
        { title: "Best of the week", subtitle: "Top picks", color: "#4B6482", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
        { title: "Curated for you", subtitle: "Staff favorites", color: "#D89A46", imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=600&fit=crop" },
      ],
    },
  );
}

function buildTestimonialsSection(): TemplateSectionNode {
  return section(
    "testimonials",
    "testimonials",
    "Testimonials",
    [block("testimonials-copy", "copy", { title: "Customer proof" })],
    {
      items: [
        { quote: "The quality exceeded my expectations. Fast delivery and beautiful packaging.", person: "Chioma O." },
        { quote: "I've been a loyal customer for months. The variety and service keep me coming back.", person: "Emeka N." },
        { quote: "Found exactly what I needed at a great price. Will definitely shop here again.", person: "Amina S." },
      ],
    },
  );
}

function buildFaqSection(source: TemplateSourceRecord): TemplateSectionNode {
  return section(
    "faq",
    "faq",
    "FAQ",
    [block("faq-copy", "copy", { title: "Common questions" })],
    {
      items: [
        { question: "What payment methods do you accept?", answer: "We accept major credit cards, bank transfers, and mobile money. All payments are processed securely." },
        { question: "How long does delivery take?", answer: source.category === "food" ? "Same-day delivery within Lagos. Other locations receive orders within 24-48 hours." : "Standard delivery takes 3-5 business days. Express delivery is available for an additional fee." },
        { question: "What is your return policy?", answer: "We offer a 7-day return policy on most items. Products must be unused and in original packaging. Contact our support team to initiate a return." },
      ],
    },
  );
}

function buildNewsletterSection(source: TemplateSourceRecord): TemplateSectionNode {
  return section("newsletter", "newsletter", "Newsletter", [
    block("newsletter-copy", "copy", {
      title: source.category === "food" ? "Stay updated on weekly specials" : "Be the first to know about new arrivals",
      body: "Sign up for our newsletter and get exclusive access to new products, special offers, and more.",
      buttonLabel: "Subscribe",
    }),
  ]);
}

function buildFooterSection(source: TemplateSourceRecord): TemplateSectionNode {
  return section("footer", "footer", "Footer", [
    block("footer-copy", "copy", {
      summary: `Quality ${CATEGORY_LABELS[source.category]} delivered to your door. Shop with confidence at ${source.name}.`,
      columns: ["Browse", "Support", "Store"],
    }),
  ]);
}

function buildFiltersToolbarSection(source: TemplateSourceRecord): TemplateSectionNode {
  return section(
    "filters-toolbar",
    "filters-toolbar",
    "Filters & Sort",
    [block("filters-copy", "copy", { title: "Shop with filters", body: "Category, price, availability, and sort controls are ready for product discovery." })],
    {
      items: [
        { label: "Category", value: source.category === "food" ? "Aisle" : "Collection" },
        { label: "Availability", value: "In stock" },
        { label: "Sort", value: "Newest first" },
      ],
    },
  );
}

function buildCategoryListingSection(source: TemplateSourceRecord): TemplateSectionNode {
  return section(
    "category-listing",
    "category-list",
    "Categories",
    [block("category-list-copy", "copy", { title: "Shop by category", body: "Give shoppers fast paths into the right collection." })],
    {
      items: [
        { title: "New arrivals", subtitle: "Fresh drops", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
        { title: source.category === "food" ? "Pantry" : "Best sellers", subtitle: "Most loved", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
        { title: source.category === "electronics" ? "Accessories" : "Gift-ready", subtitle: "Easy picks", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
      ],
    },
  );
}

function buildProductsPage(source: TemplateSourceRecord): TemplatePageSeed {
  return {
    id: `${source.id}-products`,
    pageType: "products",
    title: "Products",
    slug: "products",
    sections: [
      buildAnnouncementSection(source),
      buildHeaderSection(source),
      section("products-hero", "text-columns", "Products Intro", [
        block("products-intro-copy", "copy", {
          title: "All products",
          body: "Browse our complete collection. Quality products, fair prices, delivered to your door.",
        }),
      ]),
      buildFiltersToolbarSection(source),
      buildCategoryListingSection(source),
      buildFeaturedProductsSection(source),
      buildFooterSection(source),
    ],
    seo: {
      metaTitle: `${source.name} products`,
      metaDescription: `Browse our full collection of ${CATEGORY_LABELS[source.category]} at ${source.name}. Quality products, great prices, fast delivery.`,
    },
  };
}

function buildProductPage(source: TemplateSourceRecord): TemplatePageSeed {
  const product = demoProducts(source)[0];
  return {
    id: `${source.id}-product`,
    pageType: "product",
    title: "Product Detail",
    slug: "product",
    sections: [
      buildAnnouncementSection(source),
      buildHeaderSection(source),
      section("product-detail", "product-detail", "Product Detail", [
        block("product-detail-copy", "copy", {
          eyebrow: "Product detail",
          title: product?.title ?? "Signature product",
          body: "A conversion-ready product detail layout with gallery, variations, quantity selector, trust notes, and add-to-cart actions.",
          priceLabel: product?.priceLabel ?? "NGN 0",
        }),
      ], {
        items: [
          { label: "Colour", values: ["Classic", "Natural", "Statement"] },
          { label: "Size", values: ["Small", "Medium", "Large"] },
          { label: "Delivery", values: ["Standard", "Express"] },
        ],
      }),
      buildFeaturedProductsSection(source),
      buildFooterSection(source),
    ],
    seo: {
      metaTitle: `${source.name} Product Detail`,
      metaDescription: `Shop a product at ${source.name} with variations, secure checkout, and delivery details.`,
    },
  };
}

function buildCategoriesPage(source: TemplateSourceRecord): TemplatePageSeed {
  return {
    id: `${source.id}-categories`,
    pageType: "categories",
    title: "Categories",
    slug: "categories",
    sections: [
      buildAnnouncementSection(source),
      buildHeaderSection(source),
      buildCategoryListingSection(source),
      buildFeaturedProductsSection(source),
      buildFooterSection(source),
    ],
    seo: {
      metaTitle: `${source.name} Categories`,
      metaDescription: `Browse ${source.name} by category, collection, and product type.`,
    },
  };
}

function buildCartPage(source: TemplateSourceRecord): TemplatePageSeed {
  return {
    id: `${source.id}-cart`,
    pageType: "cart",
    title: "Cart",
    slug: "cart",
    sections: [
      buildAnnouncementSection(source),
      buildHeaderSection(source),
      section("cart-summary", "cart-summary", "Cart Summary", [
        block("cart-copy", "copy", { title: "Your cart", body: "Review selected items, quantities, delivery estimate, and subtotal before checkout." }),
      ], {
        items: demoProducts(source).slice(0, 2).map((item) => ({ title: item.title, subtitle: "Qty 1", priceLabel: item.priceLabel, color: item.color, imageUrl: item.imageUrl })),
      }),
      buildFooterSection(source),
    ],
    seo: {
      metaTitle: `${source.name} Cart`,
      metaDescription: `Review your ${source.name} cart and continue to secure checkout.`,
    },
  };
}

function buildCheckoutPage(source: TemplateSourceRecord): TemplatePageSeed {
  return {
    id: `${source.id}-checkout`,
    pageType: "checkout",
    title: "Checkout",
    slug: "checkout",
    sections: [
      buildAnnouncementSection(source),
      buildHeaderSection(source),
      section("checkout-form", "checkout-form", "Checkout Form", [
        block("checkout-copy", "copy", { title: "Secure checkout", body: "Collect customer contact, delivery address, order notes, and payment details with a clean summary." }),
      ]),
      buildFooterSection(source),
    ],
    seo: {
      metaTitle: `${source.name} Checkout`,
      metaDescription: `Complete your order securely at ${source.name}.`,
    },
  };
}

function buildWishlistPage(source: TemplateSourceRecord): TemplatePageSeed {
  return {
    id: `${source.id}-wishlist`,
    pageType: "wishlist",
    title: "Wishlist",
    slug: "wishlist",
    sections: [
      buildAnnouncementSection(source),
      buildHeaderSection(source),
      section("wishlist-grid", "wishlist-grid", "Wishlist Grid", [
        block("wishlist-copy", "copy", { title: "Saved for later", body: "A polished saved-items page for returning shoppers and gift planning." }),
      ], {
        items: demoProducts(source).slice(0, 3).map((item) => ({ ...item, subtitle: "Saved item" })),
      }),
      buildFooterSection(source),
    ],
    seo: {
      metaTitle: `${source.name} Wishlist`,
      metaDescription: `Save and revisit favorite products from ${source.name}.`,
    },
  };
}

function buildBlogPage(source: TemplateSourceRecord): TemplatePageSeed {
  return {
    id: `${source.id}-blog`,
    pageType: "blog",
    title: "Blog",
    slug: "blog",
    sections: [
      buildAnnouncementSection(source),
      buildHeaderSection(source),
      section("blog-hero", "text-columns", "Blog Intro", [
        block("blog-intro-copy", "copy", {
          title: "Stories, guides, and updates",
          body: `Read useful ideas from ${source.name}, from buying guides to product care and launch notes.`,
        }),
      ]),
      section("blog-index", "blog-index", "Blog Posts", [
        block("blog-copy", "copy", {
          title: "Latest from the store",
          body: "Publish SEO-friendly posts, customer education, and launch updates from the same editor.",
        }),
      ], {
        items: [
          { title: `How to choose ${CATEGORY_LABELS[source.category]}`, excerpt: "A practical guide that helps shoppers pick the right product with confidence.", category: "Guide", readTime: "4 min read", color: "#2E7E78" },
          { title: `Inside ${source.name}`, excerpt: "Share the brand story, sourcing standards, and the care behind every order.", category: "Story", readTime: "3 min read", color: "#C9973A" },
          { title: "Product care and delivery tips", excerpt: "Help customers get more from their purchase and understand delivery options.", category: "Tips", readTime: "5 min read", color: "#4C6780" },
        ],
      }),
      buildNewsletterSection(source),
      buildFooterSection(source),
    ],
    seo: {
      metaTitle: `${source.name} Blog`,
      metaDescription: `Read guides, updates, and product stories from ${source.name}.`,
    },
  };
}

function buildAboutPage(source: TemplateSourceRecord): TemplatePageSeed {
  return {
    id: `${source.id}-about`,
    pageType: "about",
    title: "About",
    slug: "about",
    sections: [
      buildAnnouncementSection(source),
      buildHeaderSection(source),
      buildStorySection(source),
      section("about-columns", "text-columns", "About Columns", [
        block("about-copy", "copy", {
          title: "Our story",
          body: "We're on a mission to bring you the best products at the best prices, with service you can count on.",
        }),
      ], {
        items: [
          { title: "Our beginning", body: "Founded with a simple idea: make quality products accessible and shopping effortless." },
          { title: "Our approach", body: "We partner with trusted suppliers and brands to bring you carefully curated collections." },
          { title: "Our promise", body: "Quality guaranteed. Fast delivery. Support that puts you first — every time." },
        ],
      }),
      buildFooterSection(source),
    ],
    seo: {
      metaTitle: `About ${source.name}`,
      metaDescription: `Learn about ${source.name} — our story, values, and commitment to quality ${CATEGORY_LABELS[source.category]}.`,
    },
  };
}

function buildContactPage(source: TemplateSourceRecord): TemplatePageSeed {
  return {
    id: `${source.id}-contact`,
    pageType: "contact",
    title: "Contact",
    slug: "contact",
    sections: [
      buildAnnouncementSection(source),
      buildHeaderSection(source),
      section("contact-form", "contact-form", "Contact Form", [
        block("contact-copy", "copy", {
          title: "Get in touch",
          body: "Have a question about an order, product, or delivery? We're here to help.",
          buttonLabel: "Send message",
        }),
      ]),
      buildFooterSection(source),
    ],
    seo: {
      metaTitle: `Contact ${source.name}`,
      metaDescription: `Get in touch with ${source.name}. We're here to help with orders, products, and delivery questions.`,
    },
  };
}

function buildFaqPage(source: TemplateSourceRecord): TemplatePageSeed {
  return {
    id: `${source.id}-faq`,
    pageType: "faq",
    title: "FAQ",
    slug: "faq",
    sections: [
      buildAnnouncementSection(source),
      buildHeaderSection(source),
      buildFaqSection(source),
      buildFooterSection(source),
    ],
    seo: {
      metaTitle: `${source.name} FAQ`,
      metaDescription: `Find answers to common questions about ordering, delivery, returns, and more at ${source.name}.`,
    },
  };
}

function buildHomePage(source: TemplateSourceRecord): TemplatePageSeed {
  return {
    id: `${source.id}-home`,
    pageType: "home",
    title: "Home",
    slug: "home",
    sections: [
      buildAnnouncementSection(source),
      buildHeaderSection(source),
      buildHeroSection(source),
      buildTrustSection(source),
      buildCategorySection(source),
      buildFeaturedProductsSection(source),
      buildPromoSection(source),
      buildStorySection(source),
      buildLookbookSection(source),
      buildTestimonialsSection(),
      buildFaqSection(source),
      buildNewsletterSection(source),
      buildFooterSection(source),
    ],
    seo: {
      metaTitle: `${source.name} — ${CATEGORY_LABELS[source.category].charAt(0).toUpperCase() + CATEGORY_LABELS[source.category].slice(1)} Store`,
      metaDescription: source.description,
    },
  };
}

function buildPages(source: TemplateSourceRecord): TemplatePageSeed[] {
  return [
    buildHomePage(source),
    buildProductsPage(source),
    buildProductPage(source),
    buildCategoriesPage(source),
    buildCartPage(source),
    buildCheckoutPage(source),
    buildWishlistPage(source),
    buildBlogPage(source),
    buildAboutPage(source),
    buildContactPage(source),
    buildFaqPage(source),
  ];
}

function createManifest(source: TemplateSourceRecord): StoreTemplateManifest {
  const themeTokens = resolveTheme(source);
  const themeSeeds = getThemeSeedPages(source.id);
  const seedPages = themeSeeds.length > 0 ? themeSeeds : buildPages(source);
  const themeAI = getThemeAIHints(source.id);
  const aiHints = [
    ...source.aiHints,
    `Native Shopinbos template rebuilt from ${source.sourcePack}; use source HTML only as visual reference.`,
    ...(themeAI.rexPrompt ? [`Rex build prompt: ${themeAI.rexPrompt}`] : []),
    ...(themeAI.palette ? [`Palette: ${themeAI.palette}`] : []),
    ...(themeAI.vibe ? [`Vibe: ${themeAI.vibe}`] : []),
    ...(themeAI.layout ? [`Layout: ${themeAI.layout}`] : []),
  ];

  return {
    id: source.id,
    name: source.name,
    sourcePack: source.sourcePack,
    sourcePath: source.sourcePath,
    sourceType: "next-template",
    category: source.category,
    description: source.description,
    licenseLabel: source.licenseLabel,
    previewImage: source.previewImage,
    layoutFamily: source.layoutFamily,
    themeTokens,
    supportedPages: ["home", "products", "product", "categories", "cart", "checkout", "wishlist", "blog", "about", "contact", "faq"],
    seedPages,
    demoAssets: [],
    demoContentMode: "starter-demo",
    tags: source.tags,
    aiHints,
  };
}

// The 2026 themes (Breeze, Noir, Plain, Adire, Pantry, Ilé, Plug, Stride) come after the source catalog so existing defaults are unchanged.
export const STORE_TEMPLATE_MANIFESTS = [...TEMPLATE_SOURCE_CATALOG.map(createManifest), ...BOUTIQUE_TEMPLATE_MANIFESTS];

export function getTemplateManifest(templateId: string) {
  return STORE_TEMPLATE_MANIFESTS.find((item) => item.id === templateId) ?? null;
}

export function listTemplateGalleryItems(): TemplateGalleryItem[] {
  return STORE_TEMPLATE_MANIFESTS.map((manifest) => ({
    id: manifest.id,
    name: manifest.name,
    category: manifest.category,
    description: manifest.description,
    previewImage: manifest.previewImage,
    sourcePack: manifest.sourcePack,
    sourcePath: manifest.sourcePath,
    sourceType: manifest.sourceType,
    layoutFamily: manifest.layoutFamily,
    themeTokens: manifest.themeTokens,
    supportedPages: manifest.supportedPages,
    tags: manifest.tags,
    aiHints: manifest.aiHints,
  }));
}

export function createSnapshotFromTemplate(manifest: StoreTemplateManifest): StoreEditorSnapshot {
  return {
    templateId: manifest.id,
    templateName: manifest.name,
    sourcePack: manifest.sourcePack,
    sourcePath: manifest.sourcePath,
    sourceType: manifest.sourceType,
    layoutFamily: manifest.layoutFamily,
    themeTokens: manifest.themeTokens,
    pages: JSON.parse(JSON.stringify(manifest.seedPages)) as TemplatePageSeed[],
    updatedAt: new Date().toISOString(),
  };
}
