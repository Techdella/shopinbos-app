import type {
  TemplatePageSeed,
  TemplateSectionNode,
  TemplateBlockNode,
} from "../types";
import { getNavStructure } from "./nav-structures";

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

function announcement(text: string): TemplateSectionNode {
  return section("announcement", "announcement-bar", "Announcement Bar", [
    block("announcement-copy", "copy", { text }),
  ]);
}

function header(navLinks: string[], logoText?: string): TemplateSectionNode {
  return section("header", "header", "Header", [
    block("header-copy", "copy", {
      navLinks,
      utilityLinks: ["categories", "wishlist", "cart"],
      cartLabel: "Cart",
      ctaLabel: "Shop now",
      logoText: logoText ?? "Store",
    }),
  ]);
}

function footer(summary: string): TemplateSectionNode {
  return section("footer", "footer", "Footer", [
    block("footer-copy", "copy", {
      summary,
      columns: ["Browse", "Support", "Store"],
    }),
  ]);
}

function makeCommon(templateId: string, logoText: string, navLinks: string[], announcementText: string) {
  const ann = announcement(announcementText);
  const hdr = header(navLinks, logoText);
  const ftr = footer(`${logoText} store. Quality products, delivered to your door.`);
  return { ann, hdr, ftr };
}

function buildPage(
  id: string,
  pageType: TemplatePageSeed["pageType"],
  title: string,
  slug: string,
  sections: TemplateSectionNode[],
  metaTitle?: string,
  metaDescription?: string,
): TemplatePageSeed {
  return {
    id,
    pageType,
    title,
    slug,
    sections,
    seo: metaTitle ? { metaTitle, metaDescription: metaDescription ?? "" } : undefined,
  };
}

export function getThemeSeedPages(templateId: string): TemplatePageSeed[] {
  const built = BUILT_SEEDS[templateId];
  if (built) return built;
  return [];
}

function featuredProductsSection(title: string, body: string): TemplateSectionNode {
  return section("featured-products", "featured-products", "Featured Products", [
    block("featured-copy", "copy", { title, body }),
  ], { settings: { allowMapping: true } });
}

function categoryListing(items?: Array<Record<string, unknown>>): TemplateSectionNode {
  return section("category-listing", "category-list", "Categories", [
    block("category-list-copy", "copy", { title: "Shop by category" }),
  ], { items });
}

function filtersToolbar(): TemplateSectionNode {
  return section("filters-toolbar", "filters-toolbar", "Filters & Sort", [
    block("filters-copy", "copy", { title: "Filter & sort" }),
  ], {
    items: [
      { label: "Category", value: "Collection" },
      { label: "Availability", value: "In stock" },
      { label: "Sort", value: "Newest" },
    ],
  });
}

function productDetailSection(
  eyebrow: string,
  title: string,
  body: string,
  priceLabel: string,
  variations?: Array<{ label: string; values: string[] }>,
): TemplateSectionNode {
  return section("product-detail", "product-detail", "Product Detail", [
    block("product-detail-copy", "copy", { eyebrow, title, body, priceLabel }),
  ], {
    items: variations ?? [
      { label: "Colour", values: ["Classic", "Natural", "Statement"] },
      { label: "Size", values: ["S", "M", "L", "XL"] },
      { label: "Delivery", values: ["Standard", "Express"] },
    ],
  });
}

function cartSection(): TemplateSectionNode {
  return section("cart-summary", "cart-summary", "Cart Summary", [
    block("cart-copy", "copy", { title: "Your cart", body: "Review your selections before checkout." }),
  ]);
}

function checkoutSection(): TemplateSectionNode {
  return section("checkout-form", "checkout-form", "Secure Checkout", [
    block("checkout-copy", "copy", { title: "Secure checkout", body: "Complete your order with confidence." }),
  ]);
}

function wishlistSection(): TemplateSectionNode {
  return section("wishlist-grid", "wishlist-grid", "Wishlist", [
    block("wishlist-copy", "copy", { title: "Saved for later", body: "Your curated wishlist." }),
  ]);
}

function blogSection(): TemplateSectionNode {
  return section("blog-index", "blog-index", "Blog Posts", [
    block("blog-copy", "copy", { title: "Latest posts" }),
  ], {
    items: [
      { title: "How to choose quality products", excerpt: "A practical guide that helps shoppers pick the right product.", category: "Guide", readTime: "4 min", color: "#2E7E78" },
      { title: "Inside our store", excerpt: "Our brand story and values.", category: "Story", readTime: "3 min", color: "#C9973A" },
      { title: "Product care tips", excerpt: "Get the most from your purchase.", category: "Tips", readTime: "5 min", color: "#4C6780" },
    ],
  });
}

function newsletterSection(): TemplateSectionNode {
  return section("newsletter", "newsletter", "Newsletter", [
    block("newsletter-copy", "copy", {
      title: "Stay in the know",
      body: "Sign up for exclusive updates, new arrivals, and special offers.",
      buttonLabel: "Subscribe",
    }),
  ]);
}

function faqSection(): TemplateSectionNode {
  return section("faq", "faq", "FAQ", [
    block("faq-copy", "copy", { title: "Common questions" }),
  ], {
    items: [
      { question: "What payment methods do you accept?", answer: "We accept major credit cards, bank transfers, and mobile money." },
      { question: "How long does delivery take?", answer: "Standard delivery takes 3-5 business days. Express delivery is available." },
      { question: "What is your return policy?", answer: "We offer a 7-day return policy on most items in original packaging." },
      { question: "Do you ship nationwide?", answer: "Yes, we deliver to all states. Delivery times may vary by location." },
    ],
  });
}

function contactSection(): TemplateSectionNode {
  return section("contact-form", "contact-form", "Contact Form", [
    block("contact-copy", "copy", {
      title: "Get in touch",
      body: "Have a question about an order, product, or delivery? We're here to help.",
      buttonLabel: "Send message",
    }),
  ]);
}

function storySection(title: string, body: string): TemplateSectionNode {
  return section("story", "story-split", "Our Story", [
    block("story-copy", "copy", { title, body }),
  ], {
    items: [
      { title: "Quality first", body: "Every item is selected for quality and value." },
      { title: "Fast delivery", body: "Trusted logistics partners for safe, timely delivery." },
      { title: "Customer-first", body: "Support that puts you first, every time." },
    ],
  });
}

function heroSection(
  eyebrow: string,
  title: string,
  body: string,
  primaryCta: string,
  secondaryCta?: string,
): TemplateSectionNode {
  return section("hero", "hero-split", "Hero", [
    block("hero-copy", "copy", { eyebrow, title, body, primaryCta, secondaryCta: secondaryCta ?? "Learn more" }),
  ], {
    items: [
      { label: "Hero image", title: "Featured product", subtitle: "New arrival", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
      { label: "Hero accent", title: "Best seller", subtitle: "Top rated", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
    ],
  });
}

function trustSection(items?: Array<Record<string, unknown>>): TemplateSectionNode {
  return section("trust", "trust-strip", "Trust Strip", [
    block("trust-copy", "copy", { title: "Why shop with us" }),
  ], {
    items: items ?? [
      { label: "Products", value: "200+" },
      { label: "Happy customers", value: "1,000+" },
      { label: "Fast delivery", value: "3-5 days" },
    ],
  });
}

function categoryGridSection(items?: Array<Record<string, unknown>>): TemplateSectionNode {
  return section("categories", "category-grid", "Category Grid", [
    block("categories-copy", "copy", {
      title: "Shop by category",
      body: "Browse our curated collections.",
    }),
  ], {
    items: items ?? [
      { title: "New arrivals", subtitle: "Fresh drops", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
      { title: "Best sellers", subtitle: "Most loved", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
      { title: "Sale", subtitle: "Great deals", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
    ],
  });
}

function promoSection(): TemplateSectionNode {
  return section("promo", "promo-banner", "Promo Banner", [
    block("promo-copy", "copy", {
      title: "Seasonal sale — up to 30% off selected items",
      body: "Limited time offer on our curated selection of seasonal favorites.",
      cta: "Shop the sale",
    }),
  ]);
}

function testimonialsSection(): TemplateSectionNode {
  return section("testimonials", "testimonials", "Testimonials", [
    block("testimonials-copy", "copy", { title: "What our customers say" }),
  ], {
    items: [
      { quote: "The quality exceeded my expectations. Fast delivery and beautiful packaging.", person: "Chioma O." },
      { quote: "I've been a loyal customer for months. The variety and service keep me coming back.", person: "Emeka N." },
      { quote: "Found exactly what I needed at a great price. Will definitely shop here again.", person: "Amina S." },
    ],
  });
}

function lookbookSection(): TemplateSectionNode {
  return section("lookbook", "lookbook-grid", "Lookbook Grid", [
    block("lookbook-copy", "copy", {
      title: "Featured moments",
      body: "Explore our curated looks and style inspiration.",
    }),
  ], {
    items: [
      { title: "New season edit", subtitle: "Fresh arrivals", color: "#B07C52", imageUrl: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=600&h=600&fit=crop" },
      { title: "Best of the week", subtitle: "Top picks", color: "#4B6482", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
      { title: "Curated for you", subtitle: "Staff favorites", color: "#D89A46", imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=600&fit=crop" },
    ],
  });
}

// ============================================================
// Theme-specific seed page builders
// Using a generic builder pattern that adapts to each theme
// ============================================================

const BUILT_SEEDS: Record<string, TemplatePageSeed[]> = {};

function registerLumiBeautyTheme() {
  const nav = getNavStructure("lumi-beauty");
  const ann = announcement("Free skincare consultation on orders over NGN 30,000");
  const hdr = header(nav.navLinks, nav.logoText);
  hdr.blocks = hdr.blocks.map((entry) => entry.type === "copy"
    ? { ...entry, content: { ...entry.content, utilityLinks: nav.utilityLinks, ctaLabel: nav.ctaLabel, logoText: nav.logoText } }
    : entry);
  const ftr = footer("Natural skincare rituals for daily glow, gentle care, and confident routines.");
  const hero = section("hero", "hero-split", "Soft Split Hero", [
    block("hero-copy", "copy", {
      eyebrow: "Botanical skincare",
      title: "Glow naturally,\ncare intentionally",
      body: "Clean routines, botanical ingredients, and soft-touch formulas made for everyday Nigerian beauty.",
      primaryCta: "Shop rituals",
      secondaryCta: "Take skin quiz",
    }),
  ], {
    settings: { layout: "beauty-split" },
    items: [
      { title: "Hydrating serum", subtitle: "Customer favorite", color: "#5C7A62", imageUrl: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=900&h=1200&fit=crop" },
      { title: "Botanical cream", subtitle: "Soft barrier care", color: "#E8D4CA", imageUrl: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=900&h=1200&fit=crop" },
    ],
  });
  const ingredients = trustSection([
    { label: "Aloe vera", value: "Hydrates" },
    { label: "Shea butter", value: "Nourishes" },
    { label: "Green tea", value: "Calms" },
    { label: "Niacinamide", value: "Brightens" },
  ]);
  ingredients.settings = { ...(ingredients.settings ?? {}), layout: "ingredients-strip" };
  const rituals = section("ritual", "text-columns", "Ritual Steps", [
    block("ritual-copy", "copy", { title: "Build your daily ritual", body: "Simple steps for a routine that feels calm, useful, and easy to repeat." }),
  ], {
    settings: { layout: "ritual-steps" },
    items: [
      { title: "Cleanse", body: "Start with a gentle wash that keeps the skin barrier comfortable." },
      { title: "Treat", body: "Layer a serum for hydration, tone, or texture support." },
      { title: "Seal", body: "Lock in moisture with cream or oil suited to your skin." },
      { title: "Protect", body: "Finish with sunscreen in the morning and repair care at night." },
    ],
  });
  const categories = categoryGridSection([
    { title: "Cleansers", subtitle: "Gentle daily wash", color: "#5C7A62", imageUrl: "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=700&h=900&fit=crop" },
    { title: "Serums", subtitle: "Targeted treatments", color: "#D4B5A8", imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=700&h=900&fit=crop" },
    { title: "Moisturisers", subtitle: "Barrier comfort", color: "#8B6355", imageUrl: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=700&h=900&fit=crop" },
    { title: "Bundles", subtitle: "Complete rituals", color: "#C8D8CA", imageUrl: "https://images.unsplash.com/photo-1612817288484-6f916006741a?w=700&h=900&fit=crop" },
  ]);
  categories.settings = { ...(categories.settings ?? {}), layout: "beauty-pills" };
  const products = featuredProductsSection("Shop the ritual", "Rounded product cards with real products, reviews, prices, and add-to-cart actions.");
  products.settings = { ...(products.settings ?? {}), layout: "beauty-rounded", allowMapping: true };
  products.items = [
    { id: "lumi-product-1", title: "Dew Serum", subtitle: "Hydration support", priceLabel: "NGN 18,000", color: "#5C7A62", imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "lumi-product-2", title: "Cloud Cleanser", subtitle: "Gentle wash", priceLabel: "NGN 12,500", color: "#D4B5A8", imageUrl: "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "lumi-product-3", title: "Barrier Cream", subtitle: "Daily moisture", priceLabel: "NGN 16,000", color: "#8B6355", imageUrl: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "lumi-product-4", title: "Glow Ritual Set", subtitle: "Complete routine", priceLabel: "NGN 45,000", color: "#C8D8CA", imageUrl: "https://images.unsplash.com/photo-1612817288484-6f916006741a?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ];
  const ingredientFeature = storySection("Ingredient-led care", "Explore formulas made with soothing botanicals, skin-loving oils, and clear product education.");
  ingredientFeature.settings = { ...(ingredientFeature.settings ?? {}), layout: "ingredients-feature" };
  ingredientFeature.items = [
    { title: "Aloe vera", body: "Light hydration for everyday comfort." },
    { title: "Shea butter", body: "Rich nourishment for dry areas." },
    { title: "Green tea", body: "A calming antioxidant note." },
    { title: "Niacinamide", body: "Brightening support for uneven tone." },
  ];
  const homeSections = [ann, hdr, hero, ingredients, categories, products, rituals, ingredientFeature, testimonialsSection(), faqSection(), newsletterSection(), ftr];
  const productsSections = [ann, hdr, section("products-hero", "text-columns", "Shop Rituals", [block("products-copy", "copy", { title: "Shop skincare", body: "Browse cleansers, serums, moisturisers, bundles, and routine essentials." })], { settings: { layout: "ritual-steps" } }), filtersToolbar(), products, ftr];
  const productSections = [ann, hdr, productDetailSection("LUMI", "Dew Serum", "Hydrating botanical serum with a soft finish.", "NGN 18,000", [{ label: "Skin need", values: ["Hydration", "Glow", "Barrier"] }, { label: "Size", values: ["30ml", "50ml"] }]), ftr];
  const basePages = [
    buildPage("lumi-home", "home", "Home", "home", homeSections, "LUMI Skincare", "Natural skincare rituals and botanical beauty."),
    buildPage("lumi-products", "products", "Products", "products", productsSections, "Shop LUMI", "Browse skincare products and rituals."),
    buildPage("lumi-product", "product", "Product Detail", "product", productSections, "LUMI Product", "View skincare product details."),
    buildPage("lumi-cart", "cart", "Cart", "cart", [ann, hdr, cartSection(), ftr], "LUMI Cart", "Review your cart."),
    buildPage("lumi-checkout", "checkout", "Checkout", "checkout", [ann, hdr, checkoutSection(), ftr], "LUMI Checkout", "Complete checkout."),
    buildPage("lumi-blog", "blog", "Blog", "blog", [ann, hdr, blogSection(), newsletterSection(), ftr], "LUMI Journal", "Skincare guides and product education."),
    buildPage("lumi-about", "about", "About", "about", [ann, hdr, ingredientFeature, rituals, ftr], "About LUMI", "Learn about LUMI."),
    buildPage("lumi-contact", "contact", "Contact", "contact", [ann, hdr, contactSection(), ftr], "Contact LUMI", "Contact LUMI."),
    buildPage("lumi-faq", "faq", "FAQ", "faq", [ann, hdr, faqSection(), ftr], "LUMI FAQ", "Frequently asked questions."),
  ];
  BUILT_SEEDS["lumi-beauty"] = basePages;
}

// ─── Helper to register a theme ──────────────────────────
function registerTheme(
  id: string,
  logoText: string,
  navLinks: string[],
  announcementText: string,
  heroEyebrow: string,
  heroTitle: string,
  heroBody: string,
  heroCTA: string,
  heroSecondaryCTA: string,
  footerSummary: string,
  homeExtraSections: TemplateSectionNode[],
  categoryItems?: Array<Record<string, unknown>>,
  trustItems?: Array<Record<string, unknown>>,
) {
  const nav = getNavStructure(id);
  const { ann, hdr, ftr } = makeCommon(id, nav.logoText || logoText, nav.navLinks.length > 0 ? nav.navLinks : navLinks, announcementText);
  hdr.blocks = hdr.blocks.map((entry) => entry.type === "copy"
    ? {
        ...entry,
        content: {
          ...entry.content,
          utilityLinks: nav.utilityLinks,
          ctaLabel: nav.ctaLabel,
          logoText: nav.logoText || logoText,
        },
      }
    : entry);
  const hero = heroSection(heroEyebrow, heroTitle, heroBody, heroCTA, heroSecondaryCTA);
  const cats = categoryGridSection(categoryItems);
  const trust = trustSection(trustItems);
  const feat = featuredProductsSection("Featured collection", "Our best-selling products, handpicked for you.");
  const promo = promoSection();
  const story = storySection("Our story", "Quality products and service you can count on.");
  const testimonials = testimonialsSection();
  const faq = faqSection();
  const newsletter = newsletterSection();

  // Pages that every theme gets
  const homeSections = [ann, hdr, hero, trust, cats, feat, promo, story, ...homeExtraSections, testimonials, faq, newsletter, ftr];
  const productsSections = [ann, hdr,
    section("products-hero", "text-columns", "All Products", [
      block("products-intro-copy", "copy", { title: "All products", body: "Browse our complete collection." }),
    ]),
    filtersToolbar(),
    categoryListing(categoryItems),
    feat,
    ftr,
  ];
  const productSections = [ann, hdr,
    productDetailSection("Featured", "Premium product", "A conversion-ready product detail layout.", "NGN 0"),
    feat,
    ftr,
  ];
  const cartSections = [ann, hdr, cartSection(), ftr];
  const checkoutSections = [ann, hdr, checkoutSection(), ftr];
  const wishlistSections = [ann, hdr, wishlistSection(), ftr];
  const blogSections = [ann, hdr,
    section("blog-hero", "text-columns", "Blog", [
      block("blog-intro-copy", "copy", { title: "Stories, guides, and updates", body: "Read our latest posts." }),
    ]),
    blogSection(),
    newsletter,
    ftr,
  ];
  const aboutSections = [ann, hdr,
    storySection("Our story", "Quality products, exceptional service. That's our promise."),
    testimonials,
    ftr,
  ];
  const contactSections = [ann, hdr, contactSection(), ftr];
  const faqOnlySections = [ann, hdr, faq, ftr];
  const categorySections = [ann, hdr,
    categoryListing(categoryItems),
    feat,
    ftr,
  ];

  BUILT_SEEDS[id] = [
    buildPage(`${id}-home`, "home", "Home", "home", homeSections, `${logoText} — Online Store`, `Shop at ${logoText} for quality products.`),
    buildPage(`${id}-products`, "products", "Products", "products", productsSections, `${logoText} Products`, `Browse our full collection at ${logoText}.`),
    buildPage(`${id}-product`, "product", "Product Detail", "product", productSections, `${logoText} Product Detail`, `Shop products at ${logoText}.`),
    buildPage(`${id}-categories`, "categories", "Categories", "categories", categorySections, `${logoText} Categories`, `Browse categories at ${logoText}.`),
    buildPage(`${id}-cart`, "cart", "Cart", "cart", cartSections, `${logoText} Cart`, `Review your cart at ${logoText}.`),
    buildPage(`${id}-checkout`, "checkout", "Checkout", "checkout", checkoutSections, `${logoText} Checkout`, `Complete your order at ${logoText}.`),
    buildPage(`${id}-wishlist`, "wishlist", "Wishlist", "wishlist", wishlistSections, `${logoText} Wishlist`, `Your saved items at ${logoText}.`),
    buildPage(`${id}-blog`, "blog", "Blog", "blog", blogSections, `${logoText} Blog`, `Read articles from ${logoText}.`),
    buildPage(`${id}-about`, "about", "About", "about", aboutSections, `About ${logoText}`, `Learn about ${logoText}.`),
    buildPage(`${id}-contact`, "contact", "Contact", "contact", contactSections, `Contact ${logoText}`, `Get in touch with ${logoText}.`),
    buildPage(`${id}-faq`, "faq", "FAQ", "faq", faqOnlySections, `${logoText} FAQ`, `Frequently asked questions at ${logoText}.`),
  ];
}

// ─── Register all themes ─────────────────────────────────
registerLumiBeautyTheme();

registerTheme(
  "velour-premium", "VELOUR", ["home", "products", "about", "blog", "faq", "contact"],
  "Free express shipping on orders over ₦50,000 — limited time",
  "New Season", "Timeless luxury,\ncrafted for you",
  "Discover our curated collection of premium essentials.",
  "Explore the collection", "Our story",
  "Premium essentials, delivered to your door. Shop with confidence at Velour.",
  [lookbookSection()],
  [
    { title: "New Arrivals", subtitle: "This season", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
    { title: "Signature Edit", subtitle: "Curated", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Finish the look", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

function tuneVelourPremiumSeed() {
  const pages = BUILT_SEEDS["velour-premium"];
  if (!pages) return;

  BUILT_SEEDS["velour-premium"] = pages.map((page) => ({
    ...page,
    sections: page.sections.map((entry) => {
      if (entry.kind === "announcement-bar") {
        return {
          ...entry,
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    text: "FREE EXPRESS SHIPPING ON ORDERS OVER NGN 50,000 - LIMITED TIME",
                  },
                }
              : blockEntry,
          ),
          settings: { ...entry.settings, tone: "black-bar" },
        };
      }

      if (entry.kind === "header") {
        return {
          ...entry,
          settings: {
            ...entry.settings,
            layout: "editorial-centered",
            logoMark: "CO",
            editableLogo: true,
          },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    navLinks: ["home", "products", "about", "blog", "faq", "contact"],
                    utilityLinks: ["categories", "wishlist", "cart"],
                    logoText: "VELOUR",
                    logoMark: "CO",
                  },
                }
              : blockEntry,
          ),
        };
      }

      if (entry.kind === "hero-split") {
        return {
          ...entry,
          settings: {
            ...entry.settings,
            layout: "full-bleed-split",
            imageTreatment: "rounded-editorial-cards",
            rexMemory: "Velour hero: full-width black and ivory split, oversized serif headline, two editorial product cards on the right.",
          },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    eyebrow: "NEW SEASON",
                    title: "Timeless luxury,\ncrafted for you",
                    body: "Discover premium essentials, curated edits, and elevated pieces for everyday confidence.",
                    primaryCta: "Shop the collection",
                    secondaryCta: "Explore Velour",
                  },
                }
              : blockEntry,
          ),
          items: [
            {
              label: "Hero image",
              title: "Featured product",
              subtitle: "New arrival",
              color: "#C9973A",
              imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=900&h=1100&fit=crop",
            },
            {
              label: "Hero card",
              title: "Signature edit",
              subtitle: "Curated pieces",
              color: "#1E1A18",
              imageUrl: "https://images.unsplash.com/photo-1532453288672-3a27e9be9efd?w=700&h=820&fit=crop",
            },
            {
              label: "Hero card",
              title: "Fresh arrivals",
              subtitle: "Seasonal edit",
              color: "#C9973A",
              imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=700&h=820&fit=crop",
            },
          ],
        };
      }

      if (entry.kind === "featured-products") {
        return {
          ...entry,
          settings: {
            ...entry.settings,
            allowMapping: true,
            editableProducts: true,
            rexMemory: "Velour products: editorial cards with premium fashion copy, mapped to live Shopinbos products when available.",
          },
          items: [
            {
              id: "velour-product-1",
              title: "Tailored linen set",
              subtitle: "Quiet luxury essential",
              priceLabel: "NGN 58,000",
              color: "#1E1A18",
              imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=700&h=820&fit=crop",
              mappedStoreProductId: null,
            },
            {
              id: "velour-product-2",
              title: "Soft knit dress",
              subtitle: "New season favorite",
              priceLabel: "NGN 46,000",
              color: "#C9973A",
              imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=700&h=820&fit=crop",
              mappedStoreProductId: null,
            },
            {
              id: "velour-product-3",
              title: "Minimal leather tote",
              subtitle: "Everyday carry",
              priceLabel: "NGN 39,500",
              color: "#6F6A63",
              imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=700&h=820&fit=crop",
              mappedStoreProductId: null,
            },
          ],
        };
      }

      return entry;
    }),
  }));
}

tuneVelourPremiumSeed();

type PremiumCommerceSeed = {
  id: string;
  logoText: string;
  logoMark: string;
  announcement: string;
  eyebrow: string;
  title: string;
  body: string;
  primaryCta: string;
  secondaryCta: string;
  categories: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  heroImages: Array<Record<string, unknown>>;
  story: { title: string; body: string };
  contact: { phone: string; email: string; address: string };
};

function tunePremiumCommerceSeed(config: PremiumCommerceSeed) {
  const pages = BUILT_SEEDS[config.id];
  if (!pages) return;

  const blogItems = [
    { title: `How to choose ${config.logoText} best sellers`, excerpt: "A practical buying guide for shoppers who want quality, fit, delivery clarity, and confidence.", category: "Guide", readTime: "4 min read", color: "#2E7E78" },
    { title: `Inside ${config.logoText}`, excerpt: "A story-led article about the people, standards, and sourcing behind the store.", category: "Behind the brand", readTime: "6 min read", color: "#C9973A" },
    { title: "Care, styling, and product tips", excerpt: "Useful post-purchase advice that improves product satisfaction and repeat buying.", category: "Tips", readTime: "5 min read", color: "#4C6780" },
  ];

  BUILT_SEEDS[config.id] = pages.map((page) => ({
    ...page,
    sections: page.sections.map((entry) => {
      if (entry.kind === "announcement-bar") {
        return {
          ...entry,
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? { ...blockEntry, content: { ...blockEntry.content, text: config.announcement } }
              : blockEntry,
          ),
          settings: { ...entry.settings, tone: "premium-black" },
        };
      }

      if (entry.kind === "header") {
        return {
          ...entry,
          settings: {
            ...entry.settings,
            layout: "premium-commerce",
            logoMark: config.logoMark,
            editableLogo: true,
            rexMemory: "Premium ecommerce header: announcement above, centered uppercase nav, editable logo text and logo mark, wishlist/cart actions.",
          },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    navLinks: ["home", "products", "about", "blog", "contact"],
                    utilityLinks: ["categories", "wishlist", "cart"],
                    logoText: config.logoText,
                    logoMark: config.logoMark,
                  },
                }
              : blockEntry,
          ),
        };
      }

      if (entry.kind === "hero-split") {
        return {
          ...entry,
          settings: {
            ...entry.settings,
            layout: "editorial-mosaic",
            editableImages: true,
            rexMemory: "Premium ecommerce hero: left full-height editorial image with overlay copy, right image mosaic, uppercase CTAs, strong product imagery.",
          },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    eyebrow: config.eyebrow,
                    title: config.title,
                    body: config.body,
                    primaryCta: config.primaryCta,
                    secondaryCta: config.secondaryCta,
                  },
                }
              : blockEntry,
          ),
          items: config.heroImages,
        };
      }

      if (entry.kind === "trust-strip") {
        return {
          ...entry,
          settings: { ...entry.settings, tone: "premium-retail", editableItems: true },
          items: [
            { icon: "truck", label: "Free shipping", value: "On qualifying orders" },
            { icon: "card", label: "All payments accepted", value: "Cards, transfer, USSD" },
            { icon: "package", label: "Easy returns", value: "Simple exchange support" },
          ],
        };
      }

      if (entry.kind === "category-grid" || entry.kind === "category-list" || entry.kind === "lookbook-grid") {
        return {
          ...entry,
          settings: {
            ...entry.settings,
            layout: entry.kind === "lookbook-grid" ? "premium-lookbook" : "premium-collection-grid",
            editableImages: true,
          },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    title: entry.kind === "lookbook-grid" ? "Shop the look" : "Curated collections",
                    body: "A visual path into the products shoppers care about most.",
                  },
                }
              : blockEntry,
          ),
          items: config.categories,
        };
      }

      if (entry.kind === "featured-products" || entry.kind === "cart-summary" || entry.kind === "wishlist-grid") {
        return {
          ...entry,
          settings: {
            ...entry.settings,
            allowMapping: true,
            editableProducts: true,
            dataSource: "storeProducts",
            layout: "premium-product-cards",
            rexMemory: "Product cards map to live Shopinbos products, keep premium image-led cards, wishlist, add-to-cart, reviews, and prices.",
          },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    title: entry.kind === "featured-products" ? "Best sellers" : blockEntry.content.title,
                    body: "Shop customer favorites, new arrivals, and curated picks.",
                  },
                }
              : blockEntry,
          ),
          items: config.products,
        };
      }

      if (entry.kind === "product-detail") {
        const leadProduct = config.products[0] ?? {};
        return {
          ...entry,
          settings: {
            ...entry.settings,
            layout: "premium-product-detail",
            dataSource: "selectedProduct",
            rexMemory: "Product detail is not a nav page; it opens when a shopper selects a product and uses live product data.",
          },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    eyebrow: "Product detail",
                    title: leadProduct.title ?? "Signature product",
                    body: "Gallery, variations, quantity, product description, reviews, delivery details, wishlist, and add-to-cart are connected to the store.",
                    priceLabel: leadProduct.priceLabel ?? "NGN 0",
                  },
                }
              : blockEntry,
          ),
          items: [
            { label: "Colour", values: ["Black", "Cream", "Gold", "Natural"] },
            { label: "Size", values: ["XS", "S", "M", "L", "XL"] },
            { label: "Delivery", values: ["Standard", "Express", "Pickup"] },
          ],
        };
      }

      if (entry.kind === "story-split" || entry.kind === "text-columns") {
        return {
          ...entry,
          settings: { ...entry.settings, layout: "premium-story" },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    title: config.story.title,
                    body: config.story.body,
                  },
                }
              : blockEntry,
          ),
          items: [
            { title: "Curated with care", body: "Every product is selected for quality, fit, and everyday use." },
            { title: "Fast delivery", body: "Clear shipping options help shoppers receive orders with confidence." },
            { title: "Customer-first support", body: "Helpful contact and return details are easy to find." },
          ],
        };
      }

      if (entry.kind === "testimonials") {
        return {
          ...entry,
          settings: { ...entry.settings, dataSource: "storeReviews" },
          items: [
            { quote: "The product quality, delivery updates, and packaging all felt premium.", person: "Ada W." },
            { quote: "The store was easy to shop and checkout was smooth from start to finish.", person: "Kemi A." },
            { quote: "I found the right item quickly and support replied within hours.", person: "Tolu B." },
          ],
        };
      }

      if (entry.kind === "blog-index") {
        return {
          ...entry,
          settings: { ...entry.settings, dataSource: "storeBlogPosts" },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? { ...blockEntry, content: { ...blockEntry.content, title: "Journal", body: "SEO-friendly guides, launches, and brand stories." } }
              : blockEntry,
          ),
          items: blogItems,
        };
      }

      if (entry.kind === "newsletter") {
        return {
          ...entry,
          settings: { ...entry.settings, formType: "newsletter", editableCopy: true },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    title: "Join the private list",
                    body: "Capture emails for new arrivals, offers, and launch updates.",
                    buttonLabel: "Subscribe",
                  },
                }
              : blockEntry,
          ),
        };
      }

      if (entry.kind === "contact-form") {
        return {
          ...entry,
          settings: { ...entry.settings, formType: "contact", editableCopy: true },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    title: "We would love to hear from you",
                    body: "Questions about an order, product, delivery, styling, or partnership? Send a message and the store team will reply.",
                    buttonLabel: "Send message",
                    phone: config.contact.phone,
                    email: config.contact.email,
                    address: config.contact.address,
                  },
                }
              : blockEntry,
          ),
        };
      }

      if (entry.kind === "footer") {
        return {
          ...entry,
          settings: {
            ...entry.settings,
            layout: "premium-footer",
            columns: ["Shop", "Help", "Company", "Legal"],
            paymentBadges: ["Cards", "Bank transfer", "USSD", "Mobile money"],
          },
          blocks: entry.blocks.map((blockEntry) =>
            blockEntry.type === "copy"
              ? {
                  ...blockEntry,
                  content: {
                    ...blockEntry.content,
                    summary: `${config.logoText} curates products, helpful service, and secure checkout for everyday shoppers.`,
                    columns: ["Shop", "Help", "Company", "Legal"],
                  },
                }
              : blockEntry,
          ),
        };
      }

      return entry;
    }),
  }));
}

tunePremiumCommerceSeed({
  id: "velour-premium",
  logoText: "VELOUR",
  logoMark: "VL",
  announcement: "FREE EXPRESS SHIPPING ON ORDERS OVER NGN 50,000 - LIMITED TIME",
  eyebrow: "NEW SEASON",
  title: "Timeless luxury,\ncrafted for you",
  body: "Premium fashion curated for modern shoppers. Quality, style, and service without compromise.",
  primaryCta: "Shop new arrivals",
  secondaryCta: "Our story",
  categories: [
    { title: "Dresses", subtitle: "Evening and daywear", color: "#1E1A18", imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&h=1100&fit=crop&crop=top" },
    { title: "Sets", subtitle: "Tailored essentials", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1551232864-3f0987b1e3cb?w=800&h=1100&fit=crop" },
    { title: "Jewellery", subtitle: "Finishing touches", color: "#6F6A63", imageUrl: "https://images.unsplash.com/photo-1599643478589-d4c9fe3671ed?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "velour-product-1", title: "Silk wrap midi dress", subtitle: "VELOUR", priceLabel: "NGN 45,000", color: "#1E1A18", imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=700&h=900&fit=crop&crop=top", mappedStoreProductId: null },
    { id: "velour-product-2", title: "Linen blazer set", subtitle: "VELOUR", priceLabel: "NGN 62,000", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1551232864-3f0987b1e3cb?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "velour-product-3", title: "Leather tote bag", subtitle: "VELOUR", priceLabel: "NGN 38,000", color: "#6F6A63", imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "velour-product-4", title: "Gold pendant necklace", subtitle: "Amara Gold", priceLabel: "NGN 18,500", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "New season edit", subtitle: "Premium fashion", color: "#1E1A18", imageUrl: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1000&h=1300&fit=crop&crop=top" },
    { title: "New arrivals", subtitle: "Shop now", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=1000&h=800&fit=crop" },
    { title: "Dresses", subtitle: "Signature", color: "#6F6A63", imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=800&h=800&fit=crop&crop=top" },
    { title: "Accessories", subtitle: "Finishing touches", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1599643478589-d4c9fe3671ed?w=800&h=800&fit=crop" },
  ],
  story: {
    title: "Designed for daily confidence",
    body: "A premium storefront with visual merchandising, helpful product details, trusted reviews, easy checkout, and clear contact options.",
  },
  contact: {
    phone: "+234 801 234 5678",
    email: "hello@velour.ng",
    address: "Victoria Island, Lagos",
  },
});

registerTheme(
  "kaira", "KAIRA", ["home", "products", "about", "blog", "faq", "contact"],
  "Free delivery on orders over ₦25,000 — limited time",
  "New Collection", "Elevate your\nstyle this season",
  "Discover curated fashion pieces that blend timeless elegance with modern edge.",
  "Shop the collection", "Explore",
  "Quality fashion delivered to your door. Shop with confidence at Kaira.",
  [lookbookSection()],
  [
    { title: "New Arrivals", subtitle: "This season", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
    { title: "Signature Edit", subtitle: "Curated", color: "#8C907E", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Finish the look", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

tunePremiumCommerceSeed({
  id: "kaira",
  logoText: "KAIRA",
  logoMark: "KA",
  announcement: "NEW COLLECTION LIVE - FREE DELIVERY ON ORDERS OVER NGN 25,000",
  eyebrow: "RUNWAY EDIT",
  title: "Elevated style,\nready to wear",
  body: "A fashion storefront with editorial merchandising, dynamic product cards, reviews, and checkout-ready shopping flows.",
  primaryCta: "Shop the edit",
  secondaryCta: "View lookbook",
  categories: [
    { title: "New arrivals", subtitle: "This season", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800&h=1100&fit=crop" },
    { title: "Signature edit", subtitle: "Runway inspired", color: "#8C907E", imageUrl: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=800&h=1100&fit=crop" },
    { title: "Accessories", subtitle: "Complete the look", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "kaira-product-1", title: "Structured satin dress", subtitle: "KAIRA", priceLabel: "NGN 54,000", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "kaira-product-2", title: "Oversized blazer", subtitle: "KAIRA", priceLabel: "NGN 68,000", color: "#8C907E", imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "kaira-product-3", title: "Minimal shoulder bag", subtitle: "KAIRA", priceLabel: "NGN 32,000", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Runway edit", subtitle: "Fashion", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1000&h=1300&fit=crop" },
    { title: "New arrivals", subtitle: "Shop", color: "#8C907E", imageUrl: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=1000&h=800&fit=crop" },
    { title: "Dresses", subtitle: "Evening", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&h=800&fit=crop" },
    { title: "Accessories", subtitle: "Daily", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&h=800&fit=crop" },
  ],
  story: {
    title: "Fashion-led, commerce-ready",
    body: "Kaira is rebuilt as editable native sections so sellers can replace every image, product, form, review, and detail while keeping the runway-style layout.",
  },
  contact: { phone: "+234 802 555 0188", email: "hello@kaira.store", address: "Lekki Phase 1, Lagos" },
});

registerTheme(
  "famms", "Famms", ["home", "products", "about", "blog", "contact"],
  "Free shipping on orders over ₦30,000 — shop now",
  "Sale 20% Off", "On Everything\nThis Season",
  "Discover amazing deals on our latest collection. Quality fashion at unbeatable prices.",
  "Shop Now", "Learn More",
  "Quality fashion at great prices. Shop with confidence at Famms.",
  [],
  [
    { title: "New arrivals", subtitle: "This season", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
    { title: "Best sellers", subtitle: "Most loved", color: "#f7444e", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
    { title: "Sale items", subtitle: "Up to 50% off", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Complete the look", color: "#D89A46", imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=600&fit=crop" },
  ],
);

tunePremiumCommerceSeed({
  id: "famms",
  logoText: "FAMMS",
  logoMark: "FM",
  announcement: "SALE SEASON - NEW ARRIVALS AND BEST SELLERS UPDATED DAILY",
  eyebrow: "SALE EDIT",
  title: "Bold fashion,\nstrong offers",
  body: "A conversion-friendly fashion store with promotion-led product sections and a full ecommerce journey.",
  primaryCta: "Shop sale",
  secondaryCta: "New arrivals",
  categories: [
    { title: "Sale", subtitle: "Limited offers", color: "#f7444e", imageUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800&h=1100&fit=crop" },
    { title: "New arrivals", subtitle: "Fresh drops", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&h=1100&fit=crop" },
    { title: "Accessories", subtitle: "Add-ons", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "famms-product-1", title: "Sale wrap dress", subtitle: "FAMMS", priceLabel: "NGN 31,500", color: "#f7444e", imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=700&h=900&fit=crop&crop=top", mappedStoreProductId: null },
    { id: "famms-product-2", title: "Everyday denim jacket", subtitle: "FAMMS", priceLabel: "NGN 29,000", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1551232864-3f0987b1e3cb?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "famms-product-3", title: "Classic sneaker", subtitle: "FAMMS", priceLabel: "NGN 24,500", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Sale edit", subtitle: "Up to 30%", color: "#f7444e", imageUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1000&h=1300&fit=crop" },
    { title: "New arrivals", subtitle: "Shop", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=1000&h=800&fit=crop" },
    { title: "Streetwear", subtitle: "Daily", color: "#f7444e", imageUrl: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=800&h=800&fit=crop" },
    { title: "Sneakers", subtitle: "Fresh", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=800&fit=crop" },
  ],
  story: {
    title: "Promotion-led ecommerce",
    body: "Famms keeps offers visible while every product, image, price, and checkout step remains native and synced to Shopinbos.",
  },
  contact: { phone: "+234 803 200 9011", email: "support@famms.store", address: "Ikeja, Lagos" },
});

registerTheme(
  "furni", "Furni.", ["home", "shop", "about", "services", "blog", "contact"],
  "Free shipping on orders over ₦50,000 — limited time",
  "Modern Interior", "Modern Interior\nDesign Studio",
  "Donec vitae odio quis nisl dapibus malesuada. Nullam ac aliquet velit.",
  "Shop Now", "Explore",
  "Premium furniture for modern living. Furni.",
  [lookbookSection()],
  [
    { title: "Chairs", subtitle: "Seating", color: "#3b5d50", imageUrl: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=600&h=600&fit=crop" },
    { title: "Tables", subtitle: "Dining & work", color: "#f9bf29", imageUrl: "https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=600&h=600&fit=crop" },
    { title: "Lighting", subtitle: "Ambiance", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057ab6fe?w=600&h=600&fit=crop" },
    { title: "Decor", subtitle: "Accents", color: "#D89A46", imageUrl: "https://images.unsplash.com/photo-1567016432779-094069958ea5?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "hexashop", "HexaShop", ["home", "men", "women", "kids", "about", "contact"],
  "Free shipping on orders over ₦30,000",
  "We Are Hexashop", "Awesome, clean &\ncreative store",
  "Discover our latest collection with amazing deals.",
  "Purchase Now!", "Discover More",
  "Your fashion destination. HexaShop.",
  [],
  [
    { title: "Women", subtitle: "Best Clothes For Women", color: "#e2613f", imageUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&h=600&fit=crop" },
    { title: "Men", subtitle: "Best Clothes For Men", color: "#2a2a2a", imageUrl: "https://images.unsplash.com/photo-1492447277322-b5f1d0b049fc?w=600&h=600&fit=crop" },
    { title: "Kids", subtitle: "Best Clothes For Kids", color: "#6f91ff", imageUrl: "https://images.unsplash.com/photo-1519451241324-20b4ea2c4220?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Best Accessories", color: "#ffb017", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "minishop", "MiniShop", ["home", "shop", "about", "blog", "contact"],
  "3-5 Business days delivery & Free Returns",
  "#New Arrival", "Shoes Collection\n2025",
  "Discover our latest collection of shoes and accessories.",
  "Discover Now", "Shop Now",
  "Quality products delivered worldwide. MiniShop.",
  [],
  [
    { title: "Shoes", subtitle: "New collection", color: "#c49b63", imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&h=600&fit=crop" },
    { title: "Bags", subtitle: "Accessories", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Trending", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
  [
    { label: "Free Shipping", value: "Worldwide" },
    { label: "Support Customer", value: "24/7" },
    { label: "Secure Payments", value: "100%" },
  ],
);

registerTheme(
  "freshshop", "FreshShop", ["home", "shop", "about", "blog", "contact"],
  "Free delivery on orders over ₦20,000",
  "Fresh & Organic", "Farm-fresh produce\ndelivered to your door",
  "Discover the freshest fruits, vegetables, and organic products.",
  "Shop now", "Learn more",
  "Fresh produce delivered daily. FreshShop.",
  [],
  [
    { title: "Fruits", subtitle: "Fresh picks", color: "#b0b435", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=600&fit=crop" },
    { title: "Vegetables", subtitle: "Farm fresh", color: "#4A7C59", imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=600&fit=crop" },
    { title: "Organic", subtitle: "Pure & natural", color: "#7A5A3A", imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop" },
    { title: "Beverages", subtitle: "Refresh", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&h=600&fit=crop" },
  ],
  [
    { label: "Fresh produce", value: "Daily" },
    { label: "Happy customers", value: "5,000+" },
    { label: "Same-day delivery", value: "Lagos" },
  ],
);

registerTheme(
  "footwear", "Footwear", ["home", "men", "women", "about", "blog", "contact"],
  "Free shipping on orders over ₦25,000",
  "New Collection", "Step into style\nthis season",
  "Discover the latest footwear trends. Quality shoes at great prices.",
  "Shop now", "Explore",
  "Step in style. Footwear.",
  [],
  [
    { title: "Sneakers", subtitle: "Casual comfort", color: "#88c8bc", imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&h=600&fit=crop" },
    { title: "Formal", subtitle: "Professional", color: "#616161", imageUrl: "https://images.unsplash.com/photo-1614252235316-8c8578f0aace?w=600&h=600&fit=crop" },
    { title: "Sandals", subtitle: "Summer ready", color: "#D89A46", imageUrl: "https://images.unsplash.com/photo-1603487742131-4e4b0c5e7a5d?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "malefashion", "MALE-FASHION", ["home", "shop", "blog", "about", "contact"],
  "Free shipping on orders over ₦30,000",
  "New Collection", "Men's Fashion\n2025",
  "Discover the latest in men's fashion. Quality pieces for the modern gentleman.",
  "Shop now", "Explore",
  "Modern menswear for the discerning gentleman.",
  [],
  [
    { title: "Tops", subtitle: "Shirts & tees", color: "#111", imageUrl: "https://images.unsplash.com/photo-1492447277322-b5f1d0b049fc?w=600&h=600&fit=crop" },
    { title: "Bottoms", subtitle: "Pants & shorts", color: "#e53637", imageUrl: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Complete the look", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
    { title: "Footwear", subtitle: "Shoes & boots", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "ogani", "Ogani", ["home", "shop", "blog", "contact"],
  "Free delivery on orders over ₦15,000",
  "Fresh Organic", "Farm-fresh produce\nfor healthy living",
  "Get the freshest fruits, vegetables, and organic products delivered.",
  "Shop now", "View categories",
  "Fresh organic produce delivered to your door. Ogani.",
  [],
  [
    { title: "Fruits", subtitle: "Fresh", color: "#7fad39", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=600&fit=crop" },
    { title: "Vegetables", subtitle: "Organic", color: "#4A7C59", imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=600&fit=crop" },
    { title: "Pantry", subtitle: "Essentials", color: "#7A5A3A", imageUrl: "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=600&h=600&fit=crop" },
    { title: "Beverages", subtitle: "Refresh", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "karma", "Karma", ["home", "shop", "blog", "contact"],
  "Free shipping on orders over ₦25,000",
  "New Collection", "Discover your\nstyle this season",
  "Shop the latest trends at amazing prices.",
  "Shop now", "Learn more",
  "Quality products for everyday life. Karma.",
  [],
  [
    { title: "New arrivals", subtitle: "Fresh", color: "#ffba00", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
    { title: "Best sellers", subtitle: "Popular", color: "#4cd3e3", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
    { title: "Sale", subtitle: "Up to 50%", color: "#f44a40", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "eflyer", "Eflyer", ["home", "electronics", "fashion", "jewellery", "contact"],
  "Free shipping on orders over ₦20,000",
  "Tech Deals", "Latest gadgets\nat best prices",
  "Discover amazing deals on electronics, fashion, and more.",
  "Shop now", "Browse categories",
  "Best deals on electronics and more. Eflyer.",
  [],
  [
    { title: "Electronics", subtitle: "Gadgets & tech", color: "#f26522", imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop" },
    { title: "Fashion", subtitle: "Style & wear", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&h=600&fit=crop" },
    { title: "Jewellery", subtitle: "Accessories", color: "#D89A46", imageUrl: "https://images.unsplash.com/photo-1515562141589-6773d0d8ceaa?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "shopinbos-boutique", "BOUTIQUE", ["home", "products", "about", "blog", "faq", "contact"],
  "Free express shipping on orders over ₦50,000",
  "New Season", "Curated elegance\nfor every moment",
  "Discover our edit of premium essentials. Quality you can feel.",
  "Explore the collection", "Our story",
  "Curated essentials for the discerning. Boutique House.",
  [lookbookSection()],
);

tunePremiumCommerceSeed({
  id: "shopinbos-boutique",
  logoText: "BOUTIQUE",
  logoMark: "BH",
  announcement: "FREE EXPRESS SHIPPING ON ORDERS OVER NGN 50,000",
  eyebrow: "BOUTIQUE EDIT",
  title: "Curated elegance,\nready to sell",
  body: "A native Shopinbos boutique that keeps the premium look while syncing products, reviews, forms, cart, and checkout.",
  primaryCta: "Explore collection",
  secondaryCta: "Our story",
  categories: [
    { title: "New arrivals", subtitle: "Fresh edit", color: "#1A1A18", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&h=1100&fit=crop" },
    { title: "Premium staples", subtitle: "Daily luxury", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&h=1100&fit=crop" },
    { title: "Accessories", subtitle: "Finish the look", color: "#6F6A63", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "boutique-product-1", title: "Structured blazer", subtitle: "BOUTIQUE", priceLabel: "NGN 58,000", color: "#1A1A18", imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "boutique-product-2", title: "Silk midi dress", subtitle: "BOUTIQUE", priceLabel: "NGN 48,000", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=700&h=900&fit=crop&crop=top", mappedStoreProductId: null },
    { id: "boutique-product-3", title: "Leather everyday tote", subtitle: "BOUTIQUE", priceLabel: "NGN 36,000", color: "#6F6A63", imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Boutique edit", subtitle: "Premium", color: "#1A1A18", imageUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=1000&h=1300&fit=crop" },
    { title: "New arrivals", subtitle: "Shop", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=1000&h=800&fit=crop" },
    { title: "Tailoring", subtitle: "Essentials", color: "#1A1A18", imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=800&h=800&fit=crop" },
    { title: "Bags", subtitle: "Accessories", color: "#6F6A63", imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&h=800&fit=crop" },
  ],
  story: { title: "Boutique shopping, made personal", body: "Boutique House gives customers a polished path from first look to product detail, checkout, support, and repeat visits." },
  contact: { phone: "+234 801 000 2025", email: "hello@boutique.store", address: "Victoria Island, Lagos" },
});

registerTheme(
  "noir-atelier", "NOIR", ["home", "products", "about", "blog", "contact"],
  "Private client edit now open",
  "Atelier Notes", "Quiet luxury,\nmade shoppable",
  "A premium editorial commerce system for curated fashion houses.",
  "Shop edit", "Book styling",
  "Premium fashion with native Shopinbos commerce.",
  [lookbookSection()],
);

tunePremiumCommerceSeed({
  id: "noir-atelier",
  logoText: "NOIR",
  logoMark: "NA",
  announcement: "PRIVATE CLIENT EDIT OPEN - LIMITED PIECES AVAILABLE",
  eyebrow: "ATELIER NOTES",
  title: "Quiet luxury,\nmade shoppable",
  body: "A refined black-and-gold native ecommerce template for boutiques, stylists, and premium fashion sellers.",
  primaryCta: "Shop the atelier",
  secondaryCta: "View journal",
  categories: [
    { title: "Atelier pieces", subtitle: "Limited run", color: "#0B0B0B", imageUrl: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=800&h=1100&fit=crop" },
    { title: "Occasionwear", subtitle: "Evening edit", color: "#B9975B", imageUrl: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800&h=1100&fit=crop" },
    { title: "Leather goods", subtitle: "Daily carry", color: "#706A61", imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "noir-product-1", title: "Atelier silk dress", subtitle: "NOIR", priceLabel: "NGN 85,000", color: "#0B0B0B", imageUrl: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "noir-product-2", title: "Cashmere evening wrap", subtitle: "NOIR", priceLabel: "NGN 72,000", color: "#B9975B", imageUrl: "https://images.unsplash.com/photo-1532453288672-3a27e9be9efd?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "noir-product-3", title: "Minimal leather clutch", subtitle: "NOIR", priceLabel: "NGN 42,000", color: "#706A61", imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Atelier edit", subtitle: "Limited", color: "#0B0B0B", imageUrl: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=1000&h=1300&fit=crop" },
    { title: "New pieces", subtitle: "Shop", color: "#B9975B", imageUrl: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=1000&h=800&fit=crop" },
    { title: "Wraps", subtitle: "Soft goods", color: "#706A61", imageUrl: "https://images.unsplash.com/photo-1532453288672-3a27e9be9efd?w=800&h=800&fit=crop" },
    { title: "Bags", subtitle: "Leather", color: "#0B0B0B", imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&h=800&fit=crop" },
  ],
  story: { title: "An atelier that sells", body: "Noir Atelier combines editorial luxury with complete ecommerce operations: products, wishlist, cart, checkout, forms, reviews, blog, and contact." },
  contact: { phone: "+234 804 444 9090", email: "clients@noiratelier.store", address: "Ikoyi, Lagos" },
});

registerTheme(
  "glow-ritual", "GLOW", ["home", "products", "about", "blog", "faq", "contact"],
  "Free samples with every routine",
  "Skin Rituals", "Clean rituals,\nradiant skin",
  "A warm beauty commerce template for routines, education, and replenishment.",
  "Shop routine", "Learn more",
  "Beauty routines powered by Shopinbos.",
  [],
);

tunePremiumCommerceSeed({
  id: "glow-ritual",
  logoText: "GLOW",
  logoMark: "GR",
  announcement: "FREE SAMPLES WITH EVERY ROUTINE - SKINCARE THAT SHIPS FAST",
  eyebrow: "SKIN RITUALS",
  title: "Clean rituals,\nradiant skin",
  body: "A beauty storefront for routines, product education, reviews, replenishment, cart, checkout, and connected contact forms.",
  primaryCta: "Shop routine",
  secondaryCta: "Skin guide",
  categories: [
    { title: "Cleanse", subtitle: "Start fresh", color: "#D9917A", imageUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=800&h=1100&fit=crop" },
    { title: "Treat", subtitle: "Targeted care", color: "#32231F", imageUrl: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&h=1100&fit=crop" },
    { title: "Glow", subtitle: "Daily finish", color: "#C97B7B", imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "glow-product-1", title: "Radiance serum", subtitle: "GLOW", priceLabel: "NGN 32,000", color: "#D9917A", imageUrl: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "glow-product-2", title: "Daily cream cleanser", subtitle: "GLOW", priceLabel: "NGN 18,500", color: "#32231F", imageUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "glow-product-3", title: "Body ritual oil", subtitle: "GLOW", priceLabel: "NGN 27,000", color: "#C97B7B", imageUrl: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Skin rituals", subtitle: "Beauty", color: "#32231F", imageUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=1000&h=1300&fit=crop" },
    { title: "Serums", subtitle: "Treat", color: "#D9917A", imageUrl: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&h=800&fit=crop" },
    { title: "Lips", subtitle: "Color", color: "#C97B7B", imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&h=800&fit=crop" },
    { title: "Body", subtitle: "Ritual", color: "#32231F", imageUrl: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=800&h=800&fit=crop" },
  ],
  story: { title: "Education-led beauty commerce", body: "Glow Ritual pairs routines, benefits, reviews, forms, blog posts, and checkout into one editable native storefront." },
  contact: { phone: "+234 805 700 1111", email: "care@glowritual.store", address: "Abuja, Nigeria" },
});

registerTheme(
  "terra-home", "TERRA", ["home", "products", "about", "blog", "contact"],
  "Free styling guide with every room order",
  "Home Edit", "Warm rooms,\ncrafted details",
  "A tactile home commerce template for furniture, decor, and room-led merchandising.",
  "Shop home", "View rooms",
  "Home and furniture commerce powered by Shopinbos.",
  [lookbookSection()],
);

tunePremiumCommerceSeed({
  id: "terra-home",
  logoText: "TERRA",
  logoMark: "TH",
  announcement: "FREE STYLING GUIDE WITH EVERY ROOM ORDER",
  eyebrow: "HOME EDIT",
  title: "Warm rooms,\ncrafted details",
  body: "A furniture and home template with room-led imagery, dynamic products, reviews, forms, cart, checkout, and blog.",
  primaryCta: "Shop home",
  secondaryCta: "View rooms",
  categories: [
    { title: "Living room", subtitle: "Soft seating", color: "#3E332B", imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=1100&fit=crop" },
    { title: "Dining", subtitle: "Gathering pieces", color: "#C28A55", imageUrl: "https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=800&h=1100&fit=crop" },
    { title: "Decor", subtitle: "Finishing touches", color: "#75695F", imageUrl: "https://images.unsplash.com/photo-1567016432779-094069958ea5?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "terra-product-1", title: "Oak lounge chair", subtitle: "TERRA", priceLabel: "NGN 165,000", color: "#3E332B", imageUrl: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "terra-product-2", title: "Studio side table", subtitle: "TERRA", priceLabel: "NGN 84,000", color: "#C28A55", imageUrl: "https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "terra-product-3", title: "Textured throw set", subtitle: "TERRA", priceLabel: "NGN 29,500", color: "#75695F", imageUrl: "https://images.unsplash.com/photo-1567016432779-094069958ea5?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Living room", subtitle: "Home", color: "#3E332B", imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1000&h=1300&fit=crop" },
    { title: "Dining", subtitle: "Rooms", color: "#C28A55", imageUrl: "https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=1000&h=800&fit=crop" },
    { title: "Seating", subtitle: "Comfort", color: "#3E332B", imageUrl: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&h=800&fit=crop" },
    { title: "Decor", subtitle: "Details", color: "#75695F", imageUrl: "https://images.unsplash.com/photo-1567016432779-094069958ea5?w=800&h=800&fit=crop" },
  ],
  story: { title: "Room-led ecommerce", body: "Terra Home turns furniture and decor into a complete dynamic store with products, collections, reviews, forms, cart, checkout, and blog." },
  contact: { phone: "+234 806 300 2222", email: "hello@terrahome.store", address: "Port Harcourt, Nigeria" },
});

registerTheme(
  "nova-tech", "NOVA", ["home", "products", "categories", "blog", "contact"],
  "New devices, bundles, and accessories now live",
  "Tech Drop", "Smarter gear,\nfaster checkout",
  "A sleek electronics store for gadgets, bundles, specs, and support.",
  "Shop tech", "Compare devices",
  "Gadgets and electronics powered by Shopinbos.",
  [],
);

tunePremiumCommerceSeed({
  id: "nova-tech",
  logoText: "NOVA",
  logoMark: "NT",
  announcement: "NEW DEVICES, BUNDLES, AND ACCESSORIES NOW LIVE",
  eyebrow: "TECH DROP",
  title: "Smarter gear,\nfaster checkout",
  body: "A sleek electronics store with specs, bundles, product reviews, support forms, wishlist, cart, and checkout.",
  primaryCta: "Shop tech",
  secondaryCta: "Compare devices",
  categories: [
    { title: "Audio", subtitle: "Wireless sound", color: "#4FD1FF", imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&h=1100&fit=crop" },
    { title: "Smart devices", subtitle: "Connected life", color: "#0A1020", imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&h=1100&fit=crop" },
    { title: "Accessories", subtitle: "Power and cases", color: "#617187", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "nova-product-1", title: "Wireless earbuds pro", subtitle: "NOVA", priceLabel: "NGN 44,000", color: "#4FD1FF", imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "nova-product-2", title: "Fast charger dock", subtitle: "NOVA", priceLabel: "NGN 19,500", color: "#0A1020", imageUrl: "https://images.unsplash.com/photo-1601524909162-ae8725290836?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "nova-product-3", title: "Portable speaker", subtitle: "NOVA", priceLabel: "NGN 27,000", color: "#617187", imageUrl: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Smart devices", subtitle: "Tech", color: "#0A1020", imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1000&h=1300&fit=crop" },
    { title: "Audio", subtitle: "Wireless", color: "#4FD1FF", imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1000&h=800&fit=crop" },
    { title: "Power", subtitle: "Chargers", color: "#617187", imageUrl: "https://images.unsplash.com/photo-1601524909162-ae8725290836?w=800&h=800&fit=crop" },
    { title: "Speakers", subtitle: "Portable", color: "#4FD1FF", imageUrl: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=800&h=800&fit=crop" },
  ],
  story: { title: "Spec-led commerce", body: "Nova Tech makes electronics easy to compare, buy, review, and support with native Shopinbos commerce flows." },
  contact: { phone: "+234 808 404 2020", email: "support@novatech.store", address: "Computer Village, Lagos" },
});

registerTheme(
  "fresh-basket", "FRESH", ["home", "products", "categories", "about", "contact"],
  "Same-day grocery delivery in selected cities",
  "Market Fresh", "Fresh groceries,\ndelivered daily",
  "A food and grocery template for aisles, bundles, delivery trust, and checkout.",
  "Shop groceries", "View aisles",
  "Fresh groceries powered by Shopinbos.",
  [],
);

tunePremiumCommerceSeed({
  id: "fresh-basket",
  logoText: "FRESH",
  logoMark: "FB",
  announcement: "SAME-DAY GROCERY DELIVERY IN SELECTED CITIES",
  eyebrow: "MARKET FRESH",
  title: "Fresh groceries,\ndelivered daily",
  body: "A grocery storefront for aisles, weekly bundles, delivery trust, cart, checkout, newsletter, and contact forms.",
  primaryCta: "Shop groceries",
  secondaryCta: "View aisles",
  categories: [
    { title: "Fruits", subtitle: "Fresh picks", color: "#F4B63F", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=1100&fit=crop" },
    { title: "Vegetables", subtitle: "Farm fresh", color: "#214D2B", imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&h=1100&fit=crop" },
    { title: "Pantry", subtitle: "Essentials", color: "#B44D2D", imageUrl: "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "fresh-product-1", title: "Weekly market box", subtitle: "FRESH", priceLabel: "NGN 18,500", color: "#F4B63F", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "fresh-product-2", title: "Pantry essentials", subtitle: "FRESH", priceLabel: "NGN 9,200", color: "#214D2B", imageUrl: "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "fresh-product-3", title: "Weekend fruit pack", subtitle: "FRESH", priceLabel: "NGN 12,800", color: "#B44D2D", imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Fresh market", subtitle: "Groceries", color: "#214D2B", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=1000&h=1300&fit=crop" },
    { title: "Fruits", subtitle: "Daily", color: "#F4B63F", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1000&h=800&fit=crop" },
    { title: "Vegetables", subtitle: "Farm", color: "#214D2B", imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=800&h=800&fit=crop" },
    { title: "Pantry", subtitle: "Essentials", color: "#B44D2D", imageUrl: "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=800&h=800&fit=crop" },
  ],
  story: { title: "Fresh food, clean operations", body: "Fresh Basket connects grocery products, aisles, forms, delivery trust, cart, checkout, blog, and customer follow-up." },
  contact: { phone: "+234 809 555 3030", email: "orders@freshbasket.store", address: "Lagos, Nigeria" },
});

registerTheme(
  "chapter-house", "CHAPTER", ["home", "products", "about", "blog", "contact"],
  "Curated shelves, stationery, and new releases",
  "Reading List", "Stories worth\nbringing home",
  "A bookstore template for curated shelves, stationery, reviews, and checkout.",
  "Browse books", "Read journal",
  "Books and stationery powered by Shopinbos.",
  [lookbookSection()],
);

tunePremiumCommerceSeed({
  id: "chapter-house",
  logoText: "CHAPTER",
  logoMark: "CH",
  announcement: "CURATED SHELVES, STATIONERY, AND NEW RELEASES",
  eyebrow: "READING LIST",
  title: "Stories worth\nbringing home",
  body: "A bookstore storefront for curated shelves, stationery, wishlists, reviews, blog posts, cart, and checkout.",
  primaryCta: "Browse books",
  secondaryCta: "Read journal",
  categories: [
    { title: "Fiction", subtitle: "Weekend reads", color: "#302238", imageUrl: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=800&h=1100&fit=crop" },
    { title: "Stationery", subtitle: "Desk tools", color: "#C8A66A", imageUrl: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800&h=1100&fit=crop" },
    { title: "Culture", subtitle: "Essays and guides", color: "#756A77", imageUrl: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "chapter-product-1", title: "Weekend reads edit", subtitle: "CHAPTER", priceLabel: "NGN 13,500", color: "#302238", imageUrl: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "chapter-product-2", title: "Quiet desk bundle", subtitle: "CHAPTER", priceLabel: "NGN 21,000", color: "#C8A66A", imageUrl: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "chapter-product-3", title: "Collector notebook", subtitle: "CHAPTER", priceLabel: "NGN 8,500", color: "#756A77", imageUrl: "https://images.unsplash.com/photo-1544716278-ca5f3f4b60f0?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Reading list", subtitle: "Books", color: "#302238", imageUrl: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=1000&h=1300&fit=crop" },
    { title: "New releases", subtitle: "Browse", color: "#C8A66A", imageUrl: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=1000&h=800&fit=crop" },
    { title: "Stationery", subtitle: "Desk", color: "#756A77", imageUrl: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800&h=800&fit=crop" },
    { title: "Journals", subtitle: "Notes", color: "#302238", imageUrl: "https://images.unsplash.com/photo-1544716278-ca5f3f4b60f0?w=800&h=800&fit=crop" },
  ],
  story: { title: "Editorial commerce for readers", body: "Chapter House turns shelves, stationery, reviews, newsletters, blogs, cart, and checkout into editable native blocks." },
  contact: { phone: "+234 810 222 9090", email: "hello@chapterhouse.store", address: "Yaba, Lagos" },
});

registerTheme(
  "pawhaven", "PAWHAVEN", ["home", "products", "about", "blog", "contact"],
  "Bundles for food, toys, and grooming",
  "Care Edit", "Everything pets\nneed daily",
  "A pet-care template for food, toys, grooming, bundles, and checkout.",
  "Shop care", "View bundles",
  "Pet care powered by Shopinbos.",
  [],
);

tunePremiumCommerceSeed({
  id: "pawhaven",
  logoText: "PAWHAVEN",
  logoMark: "PH",
  announcement: "BUNDLES FOR FOOD, TOYS, AND GROOMING",
  eyebrow: "CARE EDIT",
  title: "Everything pets\nneed daily",
  body: "A friendly pet store for food, toys, grooming, bundles, reviews, cart, checkout, blog, and contact.",
  primaryCta: "Shop care",
  secondaryCta: "View bundles",
  categories: [
    { title: "Food", subtitle: "Daily nutrition", color: "#F4C95D", imageUrl: "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=800&h=1100&fit=crop" },
    { title: "Toys", subtitle: "Play time", color: "#24415B", imageUrl: "https://images.unsplash.com/photo-1601758228041-f3f279d5e03d?w=800&h=1100&fit=crop" },
    { title: "Grooming", subtitle: "Care essentials", color: "#64727D", imageUrl: "https://images.unsplash.com/photo-1583512603805-3cc6b41f3edb?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "paw-product-1", title: "Daily care bundle", subtitle: "PAWHAVEN", priceLabel: "NGN 15,000", color: "#F4C95D", imageUrl: "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "paw-product-2", title: "Training treat jar", subtitle: "PAWHAVEN", priceLabel: "NGN 7,500", color: "#24415B", imageUrl: "https://images.unsplash.com/photo-1601758228041-f3f279d5e03d?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "paw-product-3", title: "Walk time set", subtitle: "PAWHAVEN", priceLabel: "NGN 12,000", color: "#64727D", imageUrl: "https://images.unsplash.com/photo-1574158622682-40c1e4d5c0e0?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Pet care", subtitle: "Daily", color: "#24415B", imageUrl: "https://images.unsplash.com/photo-1583512603805-3cc6b41f3edb?w=1000&h=1300&fit=crop" },
    { title: "Food", subtitle: "Nutrition", color: "#F4C95D", imageUrl: "https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=1000&h=800&fit=crop" },
    { title: "Toys", subtitle: "Play", color: "#24415B", imageUrl: "https://images.unsplash.com/photo-1601758228041-f3f279d5e03d?w=800&h=800&fit=crop" },
    { title: "Walks", subtitle: "Outdoor", color: "#64727D", imageUrl: "https://images.unsplash.com/photo-1574158622682-40c1e4d5c0e0?w=800&h=800&fit=crop" },
  ],
  story: { title: "Pet care that feels easy", body: "Pawhaven keeps pet products, bundles, support, forms, reviews, wishlist, cart, checkout, and blog connected." },
  contact: { phone: "+234 811 700 2323", email: "care@pawhaven.store", address: "Abuja, Nigeria" },
});

registerTheme(
  "street-mode", "STREET", ["home", "products", "categories", "blog", "contact"],
  "Limited drops and sneaker releases",
  "Drop Culture", "Streetwear drops,\nbuilt to move",
  "A streetwear template for drops, sneakers, categories, wishlist, and checkout.",
  "Shop drop", "View lookbook",
  "Streetwear commerce powered by Shopinbos.",
  [lookbookSection()],
);

tunePremiumCommerceSeed({
  id: "street-mode",
  logoText: "STREET",
  logoMark: "SM",
  announcement: "LIMITED DROPS AND SNEAKER RELEASES",
  eyebrow: "DROP CULTURE",
  title: "Streetwear drops,\nbuilt to move",
  body: "A bold streetwear store for drops, sneakers, collections, wishlist, reviews, cart, checkout, and blog.",
  primaryCta: "Shop drop",
  secondaryCta: "View lookbook",
  categories: [
    { title: "Sneakers", subtitle: "Fresh pairs", color: "#E83F3F", imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&h=1100&fit=crop" },
    { title: "Hoodies", subtitle: "Heavyweight", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1523398002811-999ca8dec234?w=800&h=1100&fit=crop" },
    { title: "Accessories", subtitle: "Caps and bags", color: "#666666", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "street-product-1", title: "Drop hoodie", subtitle: "STREET", priceLabel: "NGN 42,000", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1523398002811-999ca8dec234?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "street-product-2", title: "Court sneaker", subtitle: "STREET", priceLabel: "NGN 58,000", color: "#E83F3F", imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "street-product-3", title: "Canvas sling bag", subtitle: "STREET", priceLabel: "NGN 22,000", color: "#666666", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Street drop", subtitle: "Fashion", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=1000&h=1300&fit=crop" },
    { title: "Sneakers", subtitle: "Drop", color: "#E83F3F", imageUrl: "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=1000&h=800&fit=crop" },
    { title: "Hoodies", subtitle: "Layer", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1523398002811-999ca8dec234?w=800&h=800&fit=crop" },
    { title: "Bags", subtitle: "Carry", color: "#666666", imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&h=800&fit=crop" },
  ],
  story: { title: "Drop-led commerce", body: "Street Mode makes limited releases, categories, products, reviews, wishlist, cart, checkout, and blog editable and dynamic." },
  contact: { phone: "+234 812 808 4444", email: "drops@streetmode.store", address: "Lagos Island, Lagos" },
});

registerTheme(
  "aurum-jewels", "AURUM", ["home", "products", "about", "blog", "contact"],
  "Fine pieces, secure delivery, and gift packaging",
  "Fine Jewelry", "Small details,\nlasting shine",
  "A jewelry template for collections, product detail, reviews, gifting, and checkout.",
  "Shop jewels", "View guide",
  "Jewelry commerce powered by Shopinbos.",
  [lookbookSection()],
);

tunePremiumCommerceSeed({
  id: "aurum-jewels",
  logoText: "AURUM",
  logoMark: "AJ",
  announcement: "FINE PIECES, SECURE DELIVERY, AND GIFT PACKAGING",
  eyebrow: "FINE JEWELRY",
  title: "Small details,\nlasting shine",
  body: "A luxury jewelry storefront for collections, product detail, gifting, reviews, wishlist, cart, checkout, and contact.",
  primaryCta: "Shop jewels",
  secondaryCta: "View guide",
  categories: [
    { title: "Rings", subtitle: "Everyday shine", color: "#D6B56D", imageUrl: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&h=1100&fit=crop" },
    { title: "Necklaces", subtitle: "Layered pieces", color: "#15110D", imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800&h=1100&fit=crop" },
    { title: "Earrings", subtitle: "Finishing touch", color: "#766C61", imageUrl: "https://images.unsplash.com/photo-1599643478589-d4c9fe3671ed?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "aurum-product-1", title: "Gold hoop earrings", subtitle: "AURUM", priceLabel: "NGN 28,000", color: "#D6B56D", imageUrl: "https://images.unsplash.com/photo-1599643478589-d4c9fe3671ed?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "aurum-product-2", title: "Pendant necklace", subtitle: "AURUM", priceLabel: "NGN 36,000", color: "#15110D", imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "aurum-product-3", title: "Classic ring set", subtitle: "AURUM", priceLabel: "NGN 42,500", color: "#766C61", imageUrl: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Fine jewelry", subtitle: "Luxury", color: "#15110D", imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=1000&h=1300&fit=crop" },
    { title: "Rings", subtitle: "Gold", color: "#D6B56D", imageUrl: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=1000&h=800&fit=crop" },
    { title: "Earrings", subtitle: "Shine", color: "#766C61", imageUrl: "https://images.unsplash.com/photo-1599643478589-d4c9fe3671ed?w=800&h=800&fit=crop" },
    { title: "Gifts", subtitle: "Boxed", color: "#D6B56D", imageUrl: "https://images.unsplash.com/photo-1617038220319-276d3cfab638?w=800&h=800&fit=crop" },
  ],
  story: { title: "Luxury jewelry, native commerce", body: "Aurum Jewels keeps refined imagery, product detail, reviews, gifting support, wishlist, cart, checkout, blog, and contact editable." },
  contact: { phone: "+234 813 909 7070", email: "concierge@aurumjewels.store", address: "Victoria Island, Lagos" },
});

registerTheme(
  "solene-skincare", "SOLENE", ["home", "products", "about", "blog", "faq", "contact"],
  "Free samples with every order",
  "Gentle Care", "Clean beauty,\nradiant results",
  "Discover skincare that nurtures your skin naturally.",
  "Shop the routine", "Our story",
  "Clean beauty for radiant skin. Solene.",
  [],
  [
    { title: "Cleansers", subtitle: "Daily cleanse", color: "#C97B7B", imageUrl: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&h=600&fit=crop" },
    { title: "Moisturizers", subtitle: "Hydrate & glow", color: "#F5EDE3", imageUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=600&h=600&fit=crop" },
    { title: "Treatments", subtitle: "Targeted care", color: "#A05252", imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&h=600&fit=crop" },
  ],
);

tunePremiumCommerceSeed({
  id: "solene-skincare",
  logoText: "SOLENE",
  logoMark: "SO",
  announcement: "FREE SAMPLES WITH EVERY ORDER - ROUTINES SHIP NATIONWIDE",
  eyebrow: "GENTLE CARE",
  title: "Clean beauty,\nradiant results",
  body: "A calm skincare store with dynamic routines, product education, reviews, forms, cart, checkout, and blog.",
  primaryCta: "Shop routine",
  secondaryCta: "Skin guide",
  categories: [
    { title: "Cleansers", subtitle: "Daily reset", color: "#C97B7B", imageUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=800&h=1100&fit=crop" },
    { title: "Treatments", subtitle: "Targeted care", color: "#A05252", imageUrl: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&h=1100&fit=crop" },
    { title: "Moisture", subtitle: "Barrier support", color: "#F5EDE3", imageUrl: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=800&h=1100&fit=crop" },
  ],
  products: [
    { id: "solene-product-1", title: "Barrier repair cream", subtitle: "SOLENE", priceLabel: "NGN 24,000", color: "#C97B7B", imageUrl: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "solene-product-2", title: "Gentle gel cleanser", subtitle: "SOLENE", priceLabel: "NGN 16,500", color: "#F5EDE3", imageUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=700&h=900&fit=crop", mappedStoreProductId: null },
    { id: "solene-product-3", title: "Brightening serum", subtitle: "SOLENE", priceLabel: "NGN 31,000", color: "#A05252", imageUrl: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=700&h=900&fit=crop", mappedStoreProductId: null },
  ],
  heroImages: [
    { title: "Clean beauty", subtitle: "Skincare", color: "#C97B7B", imageUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=1000&h=1300&fit=crop" },
    { title: "Treatments", subtitle: "Serums", color: "#A05252", imageUrl: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=1000&h=800&fit=crop" },
    { title: "Moisture", subtitle: "Creams", color: "#F5EDE3", imageUrl: "https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=800&h=800&fit=crop" },
    { title: "Color", subtitle: "Beauty", color: "#C97B7B", imageUrl: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=800&h=800&fit=crop" },
  ],
  story: { title: "Skincare that teaches and sells", body: "Solene blends product education, routines, reviews, newsletter, contact, cart, and checkout into a calm beauty shopping experience." },
  contact: { phone: "+234 807 900 1212", email: "hello@solene.store", address: "Lagos, Nigeria" },
});

registerTheme(
  "the-plaza", "The Plaza", ["home", "shop", "categories", "contact"],
  "Free shipping on orders over ₦40,000",
  "Home & Living", "Beautiful spaces\nfor modern living",
  "Discover curated homeware and furniture collections.",
  "Shop Now", "Browse",
  "Beautiful homes start here. The Plaza.",
  [],
  [
    { title: "Living Room", subtitle: "Comfort & style", color: "#414141", imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=600&fit=crop" },
    { title: "Bedroom", subtitle: "Peaceful retreat", color: "#b09d81", imageUrl: "https://images.unsplash.com/photo-1567016432779-094069958ea5?w=600&h=600&fit=crop" },
    { title: "Lighting", subtitle: "Set the mood", color: "#D89A46", imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057ab6fe?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "foodmart", "FoodMart", ["home", "products", "about", "contact"],
  "Free delivery on orders over ₦15,000",
  "Fresh Groceries", "Fresh food\nfor every table",
  "Shop quality groceries at affordable prices. Freshness guaranteed.",
  "Shop now", "View deals",
  "Fresh groceries delivered. FoodMart.",
  [],
  [
    { title: "Fruits", subtitle: "Fresh picks", color: "#F9B64D", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=600&fit=crop" },
    { title: "Vegetables", subtitle: "Farm fresh", color: "#2E5B31", imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=600&fit=crop" },
    { title: "Pantry", subtitle: "Essentials", color: "#B44D2D", imageUrl: "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=600&h=600&fit=crop" },
    { title: "Beverages", subtitle: "Refresh", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&h=600&fit=crop" },
  ],
  [
    { label: "Fresh daily", value: "100% quality" },
    { label: "Customers", value: "3,000+" },
    { label: "Delivery", value: "Same day" },
  ],
);

registerTheme(
  "fruitables", "Fruitables", ["home", "shop", "about", "blog", "contact"],
  "Free delivery on orders over ₦20,000",
  "Fresh & Natural", "Nature's best,\ndelivered fresh",
  "Farm-fresh fruits and vegetables straight to your kitchen.",
  "Shop now", "Learn more",
  "Fresh from nature. Fruitables.",
  [],
  [
    { title: "Fruits", subtitle: "Sweet & fresh", color: "#F2A93B", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=600&fit=crop" },
    { title: "Vegetables", subtitle: "Green & clean", color: "#2F6E3A", imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=600&fit=crop" },
    { title: "Organic", subtitle: "Pure goodness", color: "#7A5A3A", imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop" },
  ],
  [
    { label: "Farm fresh", value: "Daily" },
    { label: "Organic", value: "100%" },
    { label: "Delivery", value: "Same day" },
  ],
);

registerTheme(
  "organic", "Organic", ["home", "shop", "about", "contact"],
  "Free delivery on orders over ₦20,000",
  "Pure & Natural", "Organic goodness\nfor healthy living",
  "Shop certified organic products for a healthier lifestyle.",
  "Shop now", "Learn more",
  "Pure organic products. Organic.",
  [],
  [
    { title: "Fruits", subtitle: "Organic", color: "#4A7C59", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=600&fit=crop" },
    { title: "Vegetables", subtitle: "Natural", color: "#6B8F6B", imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=600&fit=crop" },
    { title: "Pantry", subtitle: "Essentials", color: "#8B6B45", imageUrl: "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=600&h=600&fit=crop" },
  ],
  [
    { label: "Organic", value: "Certified" },
    { label: "Customers", value: "2,000+" },
    { label: "Delivery", value: "Nationwide" },
  ],
);

registerTheme(
  "booksaw", "Booksaw", ["home", "shop", "about", "blog", "contact"],
  "Free shipping on orders over ₦20,000",
  "New Arrivals", "Discover your\nnext great read",
  "Browse our curated collection of books for every reader.",
  "Browse now", "Our story",
  "Your next great read awaits. Booksaw.",
  [],
  [
    { title: "Fiction", subtitle: "Bestsellers", color: "#3A2D3A", imageUrl: "https://images.unsplash.com/photo-1495440635901-15270af7d7e1?w=600&h=600&fit=crop" },
    { title: "Non-Fiction", subtitle: "Learn & grow", color: "#C8A66A", imageUrl: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=600&h=600&fit=crop" },
    { title: "Stationery", subtitle: "Write & create", color: "#756A77", imageUrl: "https://images.unsplash.com/photo-1544716278-ca5f3f4b60f0?w=600&h=600&fit=crop" },
  ],
  [
    { label: "Books", value: "1,000+" },
    { label: "Readers", value: "5,000+" },
    { label: "Delivery", value: "3-5 days" },
  ],
);

registerTheme(
  "bookly", "Bookly", ["home", "shop", "about", "contact"],
  "Free shipping on orders over ₦15,000",
  "Discover", "Find your\nnext favourite book",
  "Curated books and stationery for culture lovers.",
  "Shop now", "Browse",
  "Books & stationery for culture lovers. Bookly.",
  [],
  [
    { title: "Fiction", subtitle: "Stories", color: "#5C4C7F", imageUrl: "https://images.unsplash.com/photo-1495440635901-15270af7d7e1?w=600&h=600&fit=crop" },
    { title: "Stationery", subtitle: "Create", color: "#D4A85A", imageUrl: "https://images.unsplash.com/photo-1544716278-ca5f3f4b60f0?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "waggy", "Waggy", ["home", "shop", "about", "blog", "contact"],
  "Free shipping on orders over ₦15,000",
  "Pet Care", "Everything your\npet deserves",
  "Quality pet supplies, food, and accessories for happy pets.",
  "Shop now", "Our story",
  "Happy pets, happy home. Waggy.",
  [],
  [
    { title: "Food", subtitle: "Nutrition", color: "#F4C95D", imageUrl: "https://images.unsplash.com/photo-1583512603805-3cc6b41f3edb?w=600&h=600&fit=crop" },
    { title: "Toys", subtitle: "Playtime", color: "#2B5578", imageUrl: "https://images.unsplash.com/photo-1601758228041-f3f279d5e03d?w=600&h=600&fit=crop" },
    { title: "Health", subtitle: "Wellness", color: "#4A86A8", imageUrl: "https://images.unsplash.com/photo-1574158622682-40c1e4d5c0e0?w=600&h=600&fit=crop" },
  ],
  [
    { label: "Products", value: "500+" },
    { label: "Happy pets", value: "2,000+" },
    { label: "Delivery", value: "2-4 days" },
  ],
);

registerTheme(
  "electro", "Electro", ["home", "products", "about", "blog", "contact"],
  "Free shipping on orders over ₦30,000",
  "Tech Deals", "Power your life\nwith the latest tech",
  "Discover cutting-edge electronics and gadgets at great prices.",
  "Shop now", "Learn more",
  "Your tech destination. Electro.",
  [],
  [
    { title: "Phones", subtitle: "Smartphones", color: "#121A2E", imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop" },
    { title: "Laptops", subtitle: "Work & play", color: "#58C7FF", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Gear up", color: "#283A73", imageUrl: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&h=600&fit=crop" },
  ],
  [
    { label: "Products", value: "800+" },
    { label: "Customers", value: "10,000+" },
    { label: "Warranty", value: "1 year" },
  ],
);

registerTheme(
  "furnish", "Furnish", ["home", "products", "about", "contact"],
  "Free delivery on orders over ₦50,000",
  "Home & Living", "Create spaces\nyou'll love",
  "Beautiful furniture and decor for every room in your home.",
  "Shop now", "Explore",
  "Beautiful spaces, beautifully furnished. Furnish.",
  [],
  [
    { title: "Sofas", subtitle: "Comfort", color: "#2C2C2C", imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=600&fit=crop" },
    { title: "Tables", subtitle: "Dining", color: "#C8A27A", imageUrl: "https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=600&h=600&fit=crop" },
    { title: "Lighting", subtitle: "Ambiance", color: "#D89A46", imageUrl: "https://images.unsplash.com/photo-1507473885765-e6ed057ab6fe?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "caraft", "Caraft", ["home", "products", "about", "contact"],
  "Free shipping on orders over ₦30,000",
  "Handcrafted", "Artisan quality\nfor your home",
  "Discover handcrafted home goods made with care and passion.",
  "Shop now", "Our story",
  "Handcrafted with love. Caraft.",
  [],
  [
    { title: "Home Decor", subtitle: "Accents", color: "#D4956A", imageUrl: "https://images.unsplash.com/photo-1567016432779-094069958ea5?w=600&h=600&fit=crop" },
    { title: "Kitchen", subtitle: "Essentials", color: "#F5F0EB", imageUrl: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=600&fit=crop" },
    { title: "Gifts", subtitle: "For loved ones", color: "#2C2C2C", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "mellow", "Mellow", ["home", "shop", "about", "blog", "contact"],
  "Free shipping on orders over ₦25,000",
  "Mindful Living", "Slow down,\nenjoy the moment",
  "Curated lifestyle products for a calmer, more intentional life.",
  "Explore", "Our story",
  "Mindful living, curated for you. Mellow.",
  [],
  [
    { title: "Home", subtitle: "Cozy spaces", color: "#B8A08A", imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=600&fit=crop" },
    { title: "Self Care", subtitle: "Wellness", color: "#F5F0EB", imageUrl: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=600&h=600&fit=crop" },
    { title: "Stationery", subtitle: "Journal", color: "#8A7A72", imageUrl: "https://images.unsplash.com/photo-1544716278-ca5f3f4b60f0?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "cycle", "Cycle", ["home", "shop", "about", "news", "contact"],
  "Free shipping on orders over ₦50,000",
  "Ride Ready", "Gear up for\nthe ride ahead",
  "Premium cycling gear, bikes, and accessories for every rider.",
  "Shop now", "Explore",
  "Your cycling destination. Cycle.",
  [],
  [
    { title: "Bikes", subtitle: "New models", color: "#1A2A3A", imageUrl: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&h=600&fit=crop" },
    { title: "Gear", subtitle: "Safety first", color: "#E86A4F", imageUrl: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Essentials", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "ultras", "Ultras", ["home", "products", "about", "contact"],
  "Free shipping on orders over ₦25,000",
  "New Season", "Fashion that\nmakes a statement",
  "Bold fashion for those who dare to stand out.",
  "Shop now", "Explore",
  "Bold fashion for bold people. Ultras.",
  [],
  [
    { title: "Tops", subtitle: "Statement", color: "#1A1A2E", imageUrl: "https://images.unsplash.com/photo-1492447277322-b5f1d0b049fc?w=600&h=600&fit=crop" },
    { title: "Bottoms", subtitle: "Style", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Finish it", color: "#7A7A7A", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "aj", "AJ", ["home", "shop", "about", "blog", "contact"],
  "Free shipping on orders over ₦25,000",
  "Style Edit", "Curated fashion\nfor every occasion",
  "Discover trendy pieces that elevate your everyday style.",
  "Shop now", "Explore",
  "Style curated for you. AJ.",
  [],
  [
    { title: "New in", subtitle: "Fresh arrivals", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
    { title: "Trending", subtitle: "Most popular", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
    { title: "Sale", subtitle: "Best deals", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "happy-box", "Happy Box", ["home", "shop", "about", "contact"],
  "Free gift wrapping on all orders",
  "Gift Joy", "Sweet surprises\nfor every occasion",
  "Find the perfect gift. Beautifully packaged, ready to give.",
  "Shop gifts", "Our story",
  "Joyfully packaged. Happy Box.",
  [],
  [
    { title: "Gift Boxes", subtitle: "Curated", color: "#6B456B", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=600&fit=crop" },
    { title: "Treats", subtitle: "Sweet", color: "#FF8BB8", imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "foodee-restaurant", "Foodee", ["home", "menu", "about", "reservation", "contact"],
  "Reserve your table today",
  "Fine Dining", "Exceptional food,\nunforgettable moments",
  "Experience culinary excellence in every dish.",
  "View Menu", "Reserve",
  "Exceptional dining experiences. Foodee.",
  [],
  [
    { title: "Starters", subtitle: "Begin", color: "#D4954A", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=600&fit=crop" },
    { title: "Mains", subtitle: "Signature", color: "#2C1810", imageUrl: "https://images.unsplash.com/photo-1551218808-94e220e084d2?w=600&h=600&fit=crop" },
    { title: "Desserts", subtitle: "Sweet end", color: "#8B5A3A", imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "tasty-restaurant", "Tasty", ["home", "menu", "about", "gallery", "contact"],
  "Book your table — walk-ins welcome",
  "Flavor Journey", "Taste the\ndifference",
  "Where every dish tells a story of flavor and tradition.",
  "View Menu", "Reserve",
  "Flavor you'll remember. Tasty.",
  [],
  [
    { title: "Appetizers", subtitle: "Start fresh", color: "#E8A840", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&h=600&fit=crop" },
    { title: "Main Course", subtitle: "Chef's special", color: "#1A1A2E", imageUrl: "https://images.unsplash.com/photo-1551218808-94e220e084d2?w=600&h=600&fit=crop" },
    { title: "Desserts", subtitle: "Sweet treats", color: "#D4954A", imageUrl: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "metronic-shop-ui", "Metronic", ["home", "shop", "product", "cart", "checkout", "contact", "faq"],
  "Free shipping on orders over ₦30,000",
  "Shop Smart", "Complete ecommerce\nsolution",
  "Everything you need in one place. Quality products, great prices.",
  "Shop now", "View all",
  "Complete ecommerce. Metronic Shop.",
  [],
  [
    { title: "Electronics", subtitle: "Tech", color: "#182A3C", imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=600&fit=crop" },
    { title: "Fashion", subtitle: "Style", color: "#F3A83B", imageUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&h=600&fit=crop" },
    { title: "Home", subtitle: "Living", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Extras", color: "#6C7981", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "bicycling-gear", "BikeGear", ["home", "shop", "about", "blog", "contact"],
  "Free shipping on orders over ₦50,000",
  "Ride Ready", "Gear up for\nthe road ahead",
  "Premium cycling gear, bikes, and accessories.",
  "Shop now", "Explore",
  "Your cycling destination. BikeGear.",
  [],
  [
    { title: "Bikes", subtitle: "Performance", color: "#1A2A3A", imageUrl: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=600&h=600&fit=crop" },
    { title: "Helmets", subtitle: "Safety", color: "#E86A4F", imageUrl: "https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=600&h=600&fit=crop" },
    { title: "Apparel", subtitle: "Ride style", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1511556824380-db5d2f800e6d?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "hats-fashion", "HATS", ["home", "shop", "about", "blog", "contact"],
  "Free shipping on orders over ₦20,000",
  "Top Style", "Crown your look\nwith confidence",
  "Discover our curated collection of premium hats and headwear.",
  "Shop the collection", "Our story",
  "Crown your style. HATS.",
  [lookbookSection()],
  [
    { title: "Classic", subtitle: "Timeless", color: "#1A1A1A", imageUrl: "https://images.unsplash.com/photo-1534030347209-467a5b9ad3e6?w=600&h=600&fit=crop" },
    { title: "Casual", subtitle: "Everyday", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1575428652377-a2d80e2277fc?w=600&h=600&fit=crop" },
    { title: "Premium", subtitle: "Statement", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1514326005837-fb4791d0e1e4?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "atelier-market", "ATELIER", ["home", "products", "about", "blog", "faq", "contact"],
  "Free shipping on orders over ₦30,000",
  "Market Finds", "Discover curated\nproducts you'll love",
  "A thoughtfully curated marketplace of quality products.",
  "Explore now", "Our story",
  "Curated marketplace. ATELIER.",
  [],
  [
    { title: "Featured", subtitle: "Editors' pick", color: "#182A3C", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
    { title: "New arrivals", subtitle: "Just dropped", color: "#F3A83B", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
    { title: "Sale", subtitle: "Best deals", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "ministore", "MiniStore", ["home", "shop", "about", "blog", "contact"],
  "Free shipping on orders over ₦25,000",
  "Mini Deals", "Big savings on\neveryday essentials",
  "Quality products at mini prices. Shop smart, save big.",
  "Shop now", "Explore",
  "Big savings, mini prices. MiniStore.",
  [],
  [
    { title: "Featured", subtitle: "Top picks", color: "#ff8c00", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
    { title: "Sale", subtitle: "Best deals", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
    { title: "New", subtitle: "Arrivals", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "bloom", "Bloom", ["home", "shop", "about", "contact"],
  "Free delivery on orders over ₦20,000",
  "Bloom", "Fresh blooms\ndelivered with love",
  "Beautiful flowers and plants for every occasion.",
  "Shop now", "Our story",
  "Fresh blooms, delivered with love. Bloom.",
  [],
  [
    { title: "Roses", subtitle: "Classic beauty", color: "#4A7C59", imageUrl: "https://images.unsplash.com/photo-1563241527-3004b7be0ffd?w=600&h=600&fit=crop" },
    { title: "Plants", subtitle: "Green living", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600&h=600&fit=crop" },
    { title: "Arrangements", subtitle: "Designed", color: "#D89A46", imageUrl: "https://images.unsplash.com/photo-1567696153798-9111f9cd3d0d?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "stylish", "Stylish", ["home", "products", "about", "blog", "faq", "contact"],
  "Free shipping on orders over ₦30,000 — limited time",
  "Style Edit", "Refined style\nfor every moment",
  "Discover our curated collection of fashion and beauty essentials.",
  "Shop the collection", "Our story",
  "Refined style, delivered. Stylish.",
  [lookbookSection()],
  [
    { title: "New Arrivals", subtitle: "This season", color: "#D4A373", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
    { title: "Fashion", subtitle: "Curated", color: "#2A2A2A", imageUrl: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&h=600&fit=crop" },
    { title: "Beauty", subtitle: "Glow", color: "#C97B7B", imageUrl: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Finish the look", color: "#8A8A8A", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

registerTheme(
  "shionhouse", "SHION", ["home", "products", "about", "blog", "faq", "contact"],
  "Free express shipping on orders over ₦50,000",
  "Premium Edit", "Curated elegance\nfor the discerning",
  "Discover our premium collection of boutique fashion and lifestyle pieces.",
  "Explore the edit", "Our story",
  "Premium boutique fashion. SHION.",
  [lookbookSection()],
  [
    { title: "New Collection", subtitle: "This season", color: "#4C6780", imageUrl: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=600&h=600&fit=crop" },
    { title: "Signature Edit", subtitle: "Curated", color: "#C9973A", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=600&fit=crop" },
    { title: "Accessories", subtitle: "Finish the look", color: "#2E7E78", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&h=600&fit=crop" },
  ],
);

function tuneDynamicVariationTheme(
  id: string,
  layouts: {
    header?: string;
    hero?: string;
    trust?: string;
    categories?: string;
    filters?: string;
    products?: string;
    promo?: string;
    story?: string;
    testimonials?: string;
    faq?: string;
    newsletter?: string;
    footer?: string;
    blog?: string;
    about?: string;
    delivery?: string;
    payment?: string;
    checkout?: string;
    wishlist?: string;
  },
) {
  const pages = BUILT_SEEDS[id];
  if (!pages) return;

  BUILT_SEEDS[id] = pages.map((page) => ({
    ...page,
    sections: page.sections.map((entry) => {
      const nextSettings = { ...(entry.settings ?? {}) };
      if (entry.kind === "header" && layouts.header) {
        nextSettings.layout = layouts.header;
        nextSettings.categoryNavLayout = layouts.categories === "icon-row" ? "bar" : layouts.categories === "sidebar" ? "mega" : "simple";
      }
      if (entry.kind === "hero-split" && layouts.hero) nextSettings.layout = layouts.hero;
      if (entry.kind === "trust-strip" && layouts.trust) nextSettings.layout = layouts.trust;
      if ((entry.kind === "category-list" || entry.kind === "category-grid" || entry.kind === "lookbook-grid") && layouts.categories) nextSettings.layout = layouts.categories;
      if (entry.kind === "filters-toolbar" && layouts.filters) nextSettings.layout = layouts.filters;
      if (entry.kind === "featured-products" && layouts.products) nextSettings.layout = layouts.products;
      if (entry.kind === "promo-banner" && layouts.promo) nextSettings.layout = layouts.promo;
      if ((entry.kind === "story-split" || entry.kind === "text-columns") && layouts.story) nextSettings.layout = layouts.story;
      if (entry.kind === "testimonials" && layouts.testimonials) nextSettings.layout = layouts.testimonials;
      if (entry.kind === "faq" && layouts.faq) nextSettings.layout = layouts.faq;
      if (entry.kind === "newsletter" && layouts.newsletter) nextSettings.layout = layouts.newsletter;
      if (entry.kind === "footer" && layouts.footer) nextSettings.layout = layouts.footer;
      if (entry.kind === "blog-index" && layouts.blog) nextSettings.layout = layouts.blog;
      if (entry.kind === "about-section" && layouts.about) nextSettings.layout = layouts.about;
      if (entry.kind === "delivery-info" && layouts.delivery) nextSettings.layout = layouts.delivery;
      if (entry.kind === "payment-info" && layouts.payment) nextSettings.layout = layouts.payment;
      if (entry.kind === "checkout-form" && layouts.checkout) nextSettings.layout = layouts.checkout;
      if (entry.kind === "wishlist-grid" && layouts.wishlist) nextSettings.layout = layouts.wishlist;
      return { ...entry, settings: nextSettings };
    }),
  }));
}

registerTheme(
  "mono-studio", "MONO", ["home", "products", "about", "blog", "faq", "contact"],
  "Free shipping on orders over ₦30,000",
  "Studio Edit", "Quiet products,\nclear choices",
  "A minimal storefront for curated essentials, clean browsing, and confident checkout.",
  "Shop the edit", "Read the journal",
  "Monochrome retail studio with curated products and clear service.",
  [],
  [
    { title: "Objects", subtitle: "Daily essentials", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700&h=900&fit=crop" },
    { title: "Wardrobe", subtitle: "Clean layers", color: "#77746D", imageUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=700&h=900&fit=crop" },
    { title: "Home", subtitle: "Quiet living", color: "#C7BFB2", imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=700&h=900&fit=crop" },
  ],
);
tuneDynamicVariationTheme("mono-studio", {
  header: "centered",
  hero: "minimal-center",
  trust: "compact-badges",
  categories: "minimal-list",
  filters: "topbar",
  products: "editorial-rows",
  story: "minimal-columns",
  testimonials: "slider",
  faq: "accordion",
  newsletter: "inline",
  footer: "minimal-footer",
  blog: "press-list",
  about: "founder-note",
  checkout: "minimal",
});

registerTheme(
  "saffron-market", "SAFFRON", ["home", "products", "categories", "blog", "faq", "contact"],
  "Fresh delivery options available today",
  "Market Fresh", "Everyday provisions\nwith warm service",
  "A colorful market storefront for groceries, bundles, pantry goods, and daily essentials.",
  "Shop groceries", "See categories",
  "Fresh products, easy shopping, and clear delivery.",
  [trustSection([{ label: "Shipping", value: "Nationwide" }, { label: "Payments", value: "Cards, transfer, USSD" }, { label: "Support", value: "Fast replies" }])],
  [
    { title: "Fresh produce", subtitle: "Daily picks", color: "#315238", imageUrl: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=700&h=900&fit=crop" },
    { title: "Pantry", subtitle: "Staples", color: "#E49A2E", imageUrl: "https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=700&h=900&fit=crop" },
    { title: "Ready packs", subtitle: "Bundles", color: "#A94F2B", imageUrl: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=700&h=900&fit=crop" },
  ],
);
tuneDynamicVariationTheme("saffron-market", {
  header: "standard",
  hero: "category-portal",
  trust: "icon-row",
  categories: "circle-icons",
  filters: "chips",
  products: "grid",
  promo: "split-offer",
  story: "cards",
  testimonials: "cards",
  faq: "cards",
  newsletter: "split",
  footer: "mega-footer",
  blog: "resource-hub",
  about: "values-grid",
  delivery: "compact-strip",
  payment: "compact-strip",
  checkout: "single-page",
});

registerTheme(
  "linen-luxe", "LINEN", ["home", "products", "about", "blog", "wishlist", "contact"],
  "Complimentary shipping on selected edits",
  "Linen Edit", "Soft luxury,\nmade wearable",
  "A refined fashion storefront for lookbooks, curated collections, and premium checkout.",
  "Shop linen", "View story",
  "Refined fashion and lifestyle retail with editorial detail.",
  [lookbookSection()],
  [
    { title: "New neutrals", subtitle: "Season edit", color: "#9D6F45", imageUrl: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=700&h=900&fit=crop" },
    { title: "Soft tailoring", subtitle: "Premium fit", color: "#C4A78A", imageUrl: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=700&h=900&fit=crop" },
    { title: "Accessories", subtitle: "Finish the look", color: "#6E5748", imageUrl: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?w=700&h=900&fit=crop" },
  ],
);
tuneDynamicVariationTheme("linen-luxe", {
  header: "floating",
  hero: "video-split",
  trust: "compact-badges",
  categories: "masonry",
  filters: "sidebar",
  products: "premium-product-cards",
  promo: "minimal-strip",
  story: "ingredients-feature",
  testimonials: "featured",
  faq: "sidebar",
  newsletter: "dark-panel",
  footer: "standard-footer",
  blog: "lookbook-journal",
  about: "mission-split",
  wishlist: "drawer",
  checkout: "multi-step",
});

registerTheme(
  "pop-street", "POP", ["home", "products", "categories", "about", "blog", "contact"],
  "New drops every week",
  "Drop Zone", "Graphic pieces\nfor loud wardrobes",
  "A high-contrast storefront for launches, collections, product drops, and fast checkout.",
  "Shop drops", "Read the drop notes",
  "Bold retail for new drops, quick browsing, and confident checkout.",
  [promoSection()],
  [
    { title: "Drops", subtitle: "Limited", color: "#F24C3D", imageUrl: "https://images.unsplash.com/photo-1523398002811-999ca8dec234?w=700&h=900&fit=crop" },
    { title: "Sneakers", subtitle: "Fresh pairs", color: "#F5D547", imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=700&h=900&fit=crop" },
    { title: "Accessories", subtitle: "Complete it", color: "#111111", imageUrl: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=700&h=900&fit=crop" },
  ],
);
tuneDynamicVariationTheme("pop-street", {
  header: "transparent",
  hero: "video-background",
  trust: "compact-badges",
  categories: "banner-grid",
  filters: "drawer",
  products: "editorial-rows",
  promo: "countdown",
  story: "ritual-steps",
  testimonials: "masonry",
  faq: "support-center",
  newsletter: "inline",
  footer: "mega-footer",
  blog: "longform-editorial",
  about: "team-grid",
  checkout: "minimal",
});
