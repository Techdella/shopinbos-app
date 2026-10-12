// What the inspector can change for each section, per renderer. Every field here is read by the storefront
// renderer it is listed for (BoutiqueStorefront for the 2026 themes, TemplateStorefrontSurface for the rest),
// so no control in the builder is decorative. Pure data: loaded by tests without a bundler.

import type { TemplateSectionNode } from "@/lib/store-templates";
import type { RendererKind } from "./editor-logic";

export type FieldTarget =
  | { scope: "copy"; key: string }
  | { scope: "settings"; key: string }
  | { scope: "styles"; key: string }
  | { scope: "background"; key: string };

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
}

interface FieldBase {
  id: string;
  label: string;
  help?: string;
  /** Only shown while another setting has one of these values. */
  when?: { key: string; scope: "settings" | "copy"; in: string[]; fallback?: string };
}

export type SchemaField =
  | (FieldBase & { type: "text" | "textarea"; target: FieldTarget; placeholder?: string })
  | (FieldBase & { type: "number"; target: FieldTarget; min: number; max: number; fallback: number })
  | (FieldBase & { type: "segmented" | "select" | "cards"; target: FieldTarget; options: ChoiceOption[]; fallback: string })
  | (FieldBase & { type: "toggle"; target: FieldTarget; fallback: boolean })
  | (FieldBase & { type: "color"; target: FieldTarget; placeholder?: string })
  | (FieldBase & { type: "pages"; target: FieldTarget; options: ChoiceOption[]; fallback: string[] })
  | (FieldBase & { type: "list"; target: FieldTarget; fallback: string[] })
  | (FieldBase & { type: "media"; max: number })
  | (FieldBase & { type: "products" })
  | (FieldBase & { type: "faq" })
  | (FieldBase & { type: "imageBlocks" })
  | (FieldBase & { type: "items" })
  | (FieldBase & { type: "note" });

export interface FieldGroup {
  title?: string;
  fields: SchemaField[];
}

export interface SectionSchema {
  settings: FieldGroup[];
  style: FieldGroup[];
  /** Blocks the "Add block" button can add to this section. */
  addable: Array<{ id: string; label: string }>;
}

const copy = (key: string): FieldTarget => ({ scope: "copy", key });
const setting = (key: string): FieldTarget => ({ scope: "settings", key });

const text = (key: string, label: string, extra: Partial<FieldBase> & { placeholder?: string } = {}): SchemaField => ({ id: key, type: "text", label, target: copy(key), ...extra });
const area = (key: string, label: string, extra: Partial<FieldBase> & { placeholder?: string } = {}): SchemaField => ({ id: key, type: "textarea", label, target: copy(key), ...extra });

export const BOUTIQUE_PAGE_LINKS: ChoiceOption[] = [
  { value: "home", label: "Home" },
  { value: "products", label: "Shop" },
  { value: "about", label: "About" },
  { value: "contact", label: "Contact" },
  { value: "faq", label: "FAQ" },
  { value: "wishlist", label: "Wishlist" },
];

const BUTTON_TARGETS: ChoiceOption[] = [
  { value: "products", label: "Shop" },
  { value: "about", label: "About" },
  { value: "contact", label: "Contact" },
  { value: "faq", label: "FAQ" },
];

const PAYDAY_FIELDS: SchemaField[] = [
  { id: "paydayRule", type: "select", label: "Payday", target: setting("paydayRule"), fallback: "day-of-month", options: [
    { value: "day-of-month", label: "A set day of the month" },
    { value: "last-friday", label: "Last Friday of the month" },
    { value: "last-weekday", label: "Last weekday of the month" },
  ] },
  { id: "paydayDay", type: "number", label: "Day of the month", target: setting("paydayDay"), min: 1, max: 31, fallback: 25, when: { scope: "settings", key: "paydayRule", in: ["day-of-month"], fallback: "day-of-month" } },
  { id: "weekendToFriday", type: "toggle", label: "Move to Friday when payday is a weekend", target: setting("weekendToFriday"), fallback: true, when: { scope: "settings", key: "paydayRule", in: ["day-of-month"], fallback: "day-of-month" } },
  { id: "saleEnds", type: "select", label: "The sale runs", target: setting("saleEnds"), fallback: "sunday", options: [
    { value: "sunday", label: "From payday until Sunday" },
    { value: "days", label: "A number of days" },
  ] },
  { id: "saleDays", type: "number", label: "Days", target: setting("saleDays"), min: 1, max: 14, fallback: 3, when: { scope: "settings", key: "saleEnds", in: ["days"], fallback: "sunday" } },
];

const PAYDAY_COPY: SchemaField[] = [
  text("eyebrow", "Eyebrow"),
  text("title", "Heading", { help: "Leave empty to show when the sale starts or ends." }),
  text("discountLabel", "Discount", { placeholder: "e.g. 15% off", help: "Only add a discount you will honour at checkout." }),
  area("body", "Text"),
  text("primaryCta", "Button label"),
];

const THEME_STYLE_NOTE: FieldGroup = {
  fields: [{ id: "theme-colours", type: "note", label: "Colours, fonts and buttons are set for the whole theme, so every section stays consistent. Open Theme settings to change them." }],
};

// ─── Reward sections (both renderers, src/components/storefront/gamification) ─

/** Same list as GAME_SECTION_KINDS in src/lib/gamification/logic.ts (this file has no runtime imports; tests check). */
export const REWARD_SECTION_KINDS = ["spin-wheel", "scratch-card", "reward-progress", "loyalty-banner"];

const REWARDS_NOTE = "Prizes, odds, points and on/off are set in Marketing › Rewards, so every place the game shows stays the same.";

function gameSchema(kind: string): SectionSchema {
  const note: SchemaField = { id: "rewards-note", type: "note", label: REWARDS_NOTE };
  if (kind === "spin-wheel" || kind === "scratch-card") {
    return {
      settings: [
        { fields: [
          { id: "display", type: "segmented", label: "Shows as", target: setting("display"), fallback: kind === "spin-wheel" ? "popup" : "inline", options: [{ value: "popup", label: "Pop-up" }, { value: "inline", label: "On the page" }] },
          { id: "trigger", type: "select", label: "Pop-up opens", target: setting("trigger"), fallback: kind === "spin-wheel" ? "delay" : "scroll", when: { scope: "settings", key: "display", in: ["popup"], fallback: kind === "spin-wheel" ? "popup" : "inline" }, options: [
            { value: "entry", label: "As the page opens" },
            { value: "delay", label: "After a few seconds" },
            { value: "scroll", label: "After scrolling" },
            { value: "exit", label: "When they're about to leave" },
          ] },
          { id: "delaySeconds", type: "number", label: "Seconds", target: setting("delaySeconds"), min: 1, max: 120, fallback: 8, when: { scope: "settings", key: "trigger", in: ["delay"], fallback: kind === "spin-wheel" ? "delay" : "scroll" } },
          { id: "scrollPercent", type: "number", label: "Percent of the page", target: setting("scrollPercent"), min: 5, max: 100, fallback: 50, when: { scope: "settings", key: "trigger", in: ["scroll"], fallback: kind === "spin-wheel" ? "delay" : "scroll" } },
        ] },
        { title: "Content", fields: [
          text("title", "Heading", { help: "Leave empty to use the headline from Marketing › Rewards." }),
          area("body", "Text"),
          text("buttonLabel", "Button label", { placeholder: kind === "spin-wheel" ? "Spin the wheel" : "Scratch to reveal" }),
          note,
        ] },
      ],
      style: [THEME_STYLE_NOTE],
      addable: [],
    };
  }
  if (kind === "reward-progress") {
    return { settings: [{ fields: [text("title", "Heading", { help: "Optional. The bar shows free delivery and your reward tiers for the shopper's bag." }), note] }], style: [THEME_STYLE_NOTE], addable: [] };
  }
  return { settings: [{ fields: [text("title", "Heading"), area("body", "Text", { help: "Leave empty to explain your points rate automatically." }), note] }], style: [THEME_STYLE_NOTE], addable: [] };
}

// ─── 2026 themes (BoutiqueStorefront) ────────────────────────────────────────

/** Each 2026 theme's own banner; any theme can borrow another's. Values are BoutiqueStorefront hero layouts. */
export const HERO_LAYOUT_BY_THEME: Record<string, string> = {
  breeze: "breeze-banner",
  noir: "noir-center",
  plain: "plain-slides",
  adire: "adire-banner",
  pantry: "pantry-split",
  ile: "ile-calm",
  plug: "plug-spotlight",
  stride: "stride-loud",
};

const HERO_LAYOUTS: ChoiceOption[] = [
  { value: "breeze-banner", label: "Wide banner", hint: "Photo with the heading at the bottom." },
  { value: "adire-banner", label: "Editorial banner", hint: "Large photo, refined heading." },
  { value: "noir-center", label: "Centred", hint: "Heading in the middle of a dark photo." },
  { value: "plain-slides", label: "Slides", hint: "Up to three photos with slide dots." },
  { value: "pantry-split", label: "Split", hint: "Words on one side, photo on the other." },
  { value: "ile-calm", label: "Calm", hint: "Quiet layout with lots of space." },
  { value: "plug-spotlight", label: "Spotlight", hint: "One product photo on a plain background." },
  { value: "stride-loud", label: "Loud", hint: "Very big heading over the photo." },
];

function boutiqueSchema(kind: string, themeId: string): SectionSchema {
  const heroDefault = HERO_LAYOUT_BY_THEME[themeId] ?? "breeze-banner";
  const plain = (settings: FieldGroup[], addable: SectionSchema["addable"] = []): SectionSchema => ({ settings, style: [THEME_STYLE_NOTE], addable });
  switch (kind) {
    case "announcement-bar":
      return plain([{ fields: [area("text", "Message", { help: "Leave empty to show your free-delivery and pay-on-delivery settings automatically." })] }]);
    case "header":
      return plain([
        { fields: [
          text("logoText", "Shop name", { help: "Leave empty to use your store name." }),
          text("cartLabel", "Bag label", { placeholder: "My bag" }),
          { id: "layout", type: "segmented", label: "Logo position", target: setting("layout"), fallback: themeId === "plain" ? "centered" : "split", options: [{ value: "split", label: "Left" }, { value: "centered", label: "Centre" }, { value: "bold", label: "Bold" }] },
        ] },
        { title: "Menu", fields: [{ id: "navLinks", type: "pages", label: "Pages in the menu", target: copy("navLinks"), options: BOUTIQUE_PAGE_LINKS, fallback: ["home", "products", "about", "contact"], help: "Only pages your store has are shown to shoppers." }] },
      ]);
    case "footer":
      return plain([{ fields: [area("summary", "About text", { help: "A line about your store. Contact, delivery and payment details come from your settings." })] }]);
    case "hero-split":
      return plain([
        { fields: [
          { id: "media", type: "media", label: "Images", max: 3, help: "No image yet? Your product photos are used." },
          { id: "layout", type: "cards", label: "Layout", target: setting("layout"), fallback: heroDefault, options: HERO_LAYOUTS },
        ] },
        { title: "Content", fields: [
          text("eyebrow", "Eyebrow", { when: { scope: "settings", key: "layout", in: HERO_LAYOUTS.map((option) => option.value).filter((value) => value !== "breeze-banner"), fallback: heroDefault } }),
          area("title", "Heading"),
          area("body", "Text"),
          text("primaryCta", "Button label"),
          { id: "primaryButtonAction", type: "select", label: "Button opens", target: setting("primaryButtonAction"), fallback: "products", options: BUTTON_TARGETS },
        ] },
      ], [{ id: "image", label: "Image" }]);
    case "payday-countdown":
      return plain([{ fields: PAYDAY_COPY }, { title: "Timing", fields: PAYDAY_FIELDS }]);
    case "featured-products":
      return plain([
        { fields: [
          text("title", "Heading"),
          text("cta", "Link label", { placeholder: "Shop all" }),
          { id: "layout", type: "segmented", label: "Layout", target: setting("layout"), fallback: "carousel", options: [{ value: "carousel", label: "Carousel" }, { value: "tiles", label: "Tiles" }, { value: "grid", label: "Full grid" }] },
        ] },
        { title: "Products", fields: [{ id: "products", type: "products", label: "Picked products", help: "Products you pick show first, then your best sellers." }] },
      ], [{ id: "product", label: "Product" }]);
    case "category-grid":
    case "category-list":
      return plain([{ fields: [
        text("title", "Heading"),
        { id: "layout", type: "segmented", label: "Layout", target: setting("layout"), fallback: themeId === "plug" ? "chips" : "boutique-tiles", options: [{ value: "boutique-tiles", label: "Tiles" }, { value: "chips", label: "Chips" }] },
        { id: "note", type: "note", label: "Tiles come from your collections, or your product categories when you have no collections." },
      ] }]);
    case "testimonials":
      return plain([{ fields: [text("title", "Heading"), { id: "note", type: "note", label: "Only real reviews from customers who ordered are shown. The section stays hidden until you have some." }] }]);
    case "story-split":
    case "about-section":
      return plain([
        { fields: [
          { id: "media", type: "media", label: "Image", max: 1, help: "No image yet? A product photo is used." },
          { id: "layout", type: "segmented", label: "Layout", target: setting("layout"), fallback: themeId === "adire" || themeId === "ile" ? "editorial" : "boutique", options: [{ value: "boutique", label: "Side by side" }, { value: "editorial", label: "Editorial" }] },
        ] },
        { title: "Content", fields: [text("eyebrow", "Eyebrow"), area("title", "Heading"), area("body", "Text", { help: "Leave empty to use your store description." }), text("primaryCta", "Button label")] },
      ]);
    case "faq":
      return plain([{ fields: [text("title", "Heading"), { id: "faq", type: "faq", label: "Questions", help: "Blank delivery and payment answers are filled from your settings." }] }], [{ id: "question", label: "Question" }]);
    case "newsletter":
      return plain([{ fields: [text("title", "Heading"), area("body", "Text"), text("placeholder", "Field hint"), text("buttonLabel", "Button label")] }]);
    case "contact-form":
      return plain([{ fields: [text("title", "Heading"), area("body", "Text"), text("buttonLabel", "Button label"), { id: "note", type: "note", label: "A WhatsApp button shows when you add a WhatsApp number in Chat settings." }] }]);
    case "wishlist-grid":
    case "cart-summary":
      return plain([{ fields: [text("title", "Heading")] }]);
    case "checkout-form":
      return plain([{ fields: [{ id: "note", type: "note", label: "Shoppers pay on the secure checkout page. Payment choices are in Checkout settings." }] }]);
    case "product-detail":
      return plain([{ fields: [{ id: "note", type: "note", label: "Shows the product a shopper opens: photos, price, sizes, delivery and reviews come from the product itself." }] }]);
    default:
      return plain([{ fields: [text("title", "Heading"), area("body", "Text")] }]);
  }
}

// ─── Other templates (TemplateStorefrontSurface) ─────────────────────────────

export const SECTION_VARIATIONS: Record<string, ChoiceOption[]> = {
  "announcement-bar": [
    { value: "ticker", label: "Ticker", hint: "Compact moving-style announcement." },
    { value: "centered", label: "Centered", hint: "Simple centered message." },
    { value: "split", label: "Split", hint: "Announcement with action text." },
  ],
  header: [
    { value: "standard", label: "Standard", hint: "Logo, navigation, wishlist and cart." },
    { value: "centered", label: "Centred logo", hint: "Balanced boutique header." },
    { value: "floating", label: "Floating", hint: "Rounded floating header." },
    { value: "transparent", label: "Transparent", hint: "Soft transparent header over visual sections." },
  ],
  "hero-split": [
    { value: "split-editorial", label: "Editorial split", hint: "Large copy with supporting product visuals." },
    { value: "full-bleed", label: "Full bleed", hint: "Immersive image-led banner." },
    { value: "video-background", label: "Video background", hint: "Uploaded video or image behind the copy." },
    { value: "video-split", label: "Video split", hint: "Copy beside an uploaded video or image." },
    { value: "minimal-center", label: "Minimal centre", hint: "Centred headline and button." },
    { value: "category-portal", label: "Category portal", hint: "Banner with live category cards." },
    { value: "product-spotlight", label: "Product spotlight", hint: "Feature one product with a buy button." },
    { value: "editorial-mosaic", label: "Editorial mosaic", hint: "Magazine-style lead and supporting tiles." },
    { value: "beauty-split", label: "Beauty split", hint: "Soft lifestyle split with a feature card." },
    { value: "carousel-cards", label: "Carousel cards", hint: "Banner with stacked collection cards." },
    { value: "text-overlay", label: "Text overlay", hint: "Strong copy over visual media." },
  ],
  "trust-strip": [
    { value: "icon-row", label: "Icon row", hint: "Shipping, payment and support icons." },
    { value: "metric-cards", label: "Metric cards", hint: "Store proof in cards." },
    { value: "compact-badges", label: "Compact badges", hint: "Small customer-facing badges." },
    { value: "ingredients-strip", label: "Ticker strip", hint: "Repeating ticker style." },
  ],
  "category-list": [
    { value: "image-grid", label: "Image grid", hint: "Large image cards." },
    { value: "icon-row", label: "Icon row", hint: "Horizontal category chips." },
    { value: "sidebar", label: "Sidebar", hint: "Category sidebar with content panels." },
    { value: "beauty-pills", label: "Pills", hint: "Soft category pills and rounded cards." },
    { value: "masonry", label: "Masonry", hint: "Mixed card heights." },
    { value: "circle-icons", label: "Circles", hint: "Round image or icon buttons." },
    { value: "banner-grid", label: "Banner grid", hint: "Wide category banners." },
    { value: "minimal-list", label: "Minimal list", hint: "Text-first list with counts." },
  ],
  "lookbook-grid": [
    { value: "image-grid", label: "Image grid", hint: "Large image cards." },
    { value: "editorial-mosaic", label: "Editorial mosaic", hint: "Magazine-like visual tiles." },
    { value: "beauty-pills", label: "Soft cards", hint: "Rounded image-led cards." },
  ],
  "filters-toolbar": [
    { value: "compact", label: "Compact", hint: "Search and filters in one row." },
    { value: "chips", label: "Filter chips", hint: "Category chips with compact sorting." },
    { value: "sidebar", label: "Sidebar", hint: "Side filter panel for larger catalogues." },
    { value: "drawer", label: "Filter drawer", hint: "Mobile-first filter drawer." },
    { value: "topbar", label: "Shop topbar", hint: "Search, count, category and sort controls." },
  ],
  "featured-products": [
    { value: "grid", label: "Product grid", hint: "Balanced standard grid." },
    { value: "premium-product-cards", label: "Luxury cards", hint: "Premium editorial product cards." },
    { value: "beauty-rounded", label: "Rounded", hint: "Soft rounded product cards." },
    { value: "editorial-rows", label: "Editorial rows", hint: "Wide product rows for storytelling." },
  ],
  "product-detail": [
    { value: "gallery-left", label: "Gallery left", hint: "Thumbnails and main media." },
    { value: "split", label: "Split", hint: "Product image and buying panel." },
    { value: "minimal", label: "Minimal", hint: "Simple product detail." },
    { value: "sticky-summary", label: "Sticky summary", hint: "Buying controls stay visible." },
  ],
  "cart-summary": [
    { value: "shopify", label: "Side by side", hint: "Items and order summary side by side." },
    { value: "floating", label: "Mini floating cart", hint: "Compact floating cart summary." },
    { value: "minimal", label: "Minimal", hint: "Slim checkout-focused cart." },
  ],
  "wishlist-grid": [
    { value: "page", label: "Wishlist page", hint: "Saved products page." },
    { value: "drawer", label: "Wishlist drawer", hint: "Saved products with drawer preview." },
    { value: "floating", label: "Floating wishlist", hint: "Compact saved-items summary." },
  ],
  "checkout-form": [
    { value: "single-page", label: "Single page", hint: "All checkout fields on one page." },
    { value: "multi-step", label: "Multi step", hint: "Contact, delivery, payment steps." },
    { value: "minimal", label: "Minimal", hint: "Fast mobile-friendly checkout." },
  ],
  "promo-banner": [
    { value: "gradient-sale", label: "Gradient sale", hint: "Strong offer banner." },
    { value: "split-offer", label: "Split offer", hint: "Copy and product image." },
    { value: "minimal-strip", label: "Minimal strip", hint: "Slim offer strip." },
    { value: "countdown", label: "Countdown", hint: "Urgency-focused sale panel." },
  ],
  "story-split": [
    { value: "image-collage", label: "Image collage", hint: "Story with layered images." },
    { value: "text-first", label: "Text first", hint: "Copy-led brand story." },
    { value: "ritual-steps", label: "Steps", hint: "Step-by-step education." },
    { value: "ingredients-feature", label: "Feature split", hint: "Image and benefit cards." },
  ],
  "text-columns": [
    { value: "cards", label: "Cards", hint: "Reusable info cards." },
    { value: "minimal-columns", label: "Minimal columns", hint: "Simple text columns." },
    { value: "ritual-steps", label: "Steps", hint: "Numbered steps." },
    { value: "ingredients-feature", label: "Feature split", hint: "Image and detail cards." },
  ],
  faq: [
    { value: "accordion", label: "Accordion", hint: "Expandable rows." },
    { value: "cards", label: "Cards", hint: "Questions in separate cards." },
    { value: "sidebar", label: "Sidebar", hint: "Help-centre layout." },
    { value: "two-column", label: "Two columns", hint: "Questions in two columns." },
    { value: "support-center", label: "Support centre", hint: "Questions with a contact prompt." },
  ],
  "contact-form": [
    { value: "split-card", label: "Split card", hint: "Contact details beside the form." },
    { value: "minimal", label: "Minimal", hint: "Simple contact form." },
    { value: "support-panel", label: "Support panel", hint: "Support details with form." },
    { value: "map-card", label: "Map card", hint: "Location and contact form." },
    { value: "whatsapp-first", label: "WhatsApp first", hint: "Chat-led contact." },
  ],
  newsletter: [
    { value: "dark-panel", label: "Dark panel", hint: "High-contrast signup band." },
    { value: "inline", label: "Inline", hint: "Compact inline signup." },
    { value: "split", label: "Split", hint: "Copy and form side by side." },
    { value: "minimal", label: "Minimal", hint: "Quiet signup." },
  ],
  "blog-index": [
    { value: "grid", label: "Grid", hint: "Blog home grid." },
    { value: "magazine", label: "Magazine", hint: "Editorial magazine layout." },
    { value: "minimal", label: "Minimal", hint: "Simple two-column list." },
    { value: "single-preview", label: "Single post preview", hint: "Preview one article." },
    { value: "article-split", label: "Article split", hint: "Single post with image and reading panel." },
    { value: "longform-editorial", label: "Longform editorial", hint: "Large article type with pull quote." },
    { value: "press-list", label: "Press list", hint: "Compact publication-style entries." },
    { value: "resource-hub", label: "Resource hub", hint: "Guide categories and featured articles." },
    { value: "lookbook-journal", label: "Lookbook journal", hint: "Visual article cards." },
    { value: "story-stack", label: "Story stack", hint: "Stacked articles with rich excerpts." },
  ],
  footer: [
    { value: "standard-footer", label: "Standard", hint: "Brand, browse, store details." },
    { value: "mega-footer", label: "Mega footer", hint: "Adds legal and policy links." },
    { value: "minimal-footer", label: "Minimal", hint: "Small footer with key links only." },
  ],
  testimonials: [
    { value: "cards", label: "Cards", hint: "Review cards in a grid." },
    { value: "featured", label: "Featured quote", hint: "One large quote with supporting reviews." },
    { value: "masonry", label: "Masonry", hint: "Staggered review cards." },
    { value: "slider", label: "Slider", hint: "Horizontal carousel." },
  ],
  "about-section": [
    { value: "split", label: "Split", hint: "Image and store story." },
    { value: "centered", label: "Centred", hint: "Centred brand statement." },
    { value: "timeline", label: "Timeline", hint: "Brand milestones." },
    { value: "founder-note", label: "Founder note", hint: "Personal introduction." },
    { value: "values-grid", label: "Values grid", hint: "Brand values with proof cards." },
    { value: "studio-story", label: "Studio story", hint: "Image-led story." },
    { value: "team-grid", label: "Team grid", hint: "People behind the store." },
    { value: "mission-split", label: "Mission split", hint: "Mission copy with proof cards." },
  ],
  "delivery-info": [
    { value: "cards", label: "Cards", hint: "Delivery promise cards." },
    { value: "timeline", label: "Timeline", hint: "Order to delivery steps." },
    { value: "compact-strip", label: "Compact strip", hint: "Small delivery badges." },
  ],
  "payment-info": [
    { value: "badges", label: "Badges", hint: "Accepted payment badges." },
    { value: "security-card", label: "Security card", hint: "Trust and payment details." },
    { value: "compact-strip", label: "Compact strip", hint: "Small payment strip." },
  ],
};
SECTION_VARIATIONS["category-grid"] = SECTION_VARIATIONS["category-list"]!;

export const BLOCK_VARIATIONS: Record<string, ChoiceOption[]> = {
  card: [
    { value: "plain", label: "Plain", hint: "Clean card." },
    { value: "soft", label: "Soft", hint: "Tinted background." },
    { value: "outline", label: "Outline", hint: "Border-first card." },
    { value: "feature", label: "Feature", hint: "Larger highlight card." },
  ],
  product: [
    { value: "classic", label: "Classic", hint: "Image, title and price." },
    { value: "overlay", label: "Overlay", hint: "Button overlays image." },
    { value: "editorial", label: "Editorial", hint: "Large visual product card." },
    { value: "compact", label: "Compact", hint: "Dense shopping card." },
  ],
  faq: [
    { value: "accordion", label: "Accordion", hint: "Expandable row." },
    { value: "card", label: "Card", hint: "Question card." },
    { value: "numbered", label: "Numbered", hint: "Numbered answer." },
  ],
  review: [
    { value: "stars", label: "Stars", hint: "Star review card." },
    { value: "quote", label: "Quote", hint: "Typography-led quote." },
    { value: "compact", label: "Compact", hint: "Small testimonial." },
  ],
  category: [
    { value: "image", label: "Image", hint: "Image-led category." },
    { value: "pill", label: "Pill", hint: "Small rounded pill." },
    { value: "icon", label: "Icon", hint: "Icon category." },
    { value: "editorial", label: "Editorial", hint: "Large category tile." },
  ],
  option: [
    { value: "pill", label: "Pill", hint: "Rounded option buttons." },
    { value: "swatch", label: "Swatch", hint: "Colour or size swatches." },
    { value: "list", label: "List", hint: "Stacked options." },
  ],
};

export function blockVariationsFor(sectionKind: string, item: Record<string, unknown>) {
  if ("question" in item) return BLOCK_VARIATIONS.faq!;
  if ("quote" in item || "person" in item) return BLOCK_VARIATIONS.review!;
  if ("mappedStoreProductId" in item || "priceLabel" in item) return BLOCK_VARIATIONS.product!;
  if (sectionKind === "category-list" || sectionKind === "category-grid" || sectionKind === "lookbook-grid") return BLOCK_VARIATIONS.category!;
  if ("values" in item) return BLOCK_VARIATIONS.option!;
  return BLOCK_VARIATIONS.card!;
}

const BUTTON_ACTIONS: ChoiceOption[] = [
  { value: "products", label: "Products" },
  { value: "product", label: "Product page" },
  { value: "categories", label: "Categories" },
  { value: "cart", label: "Cart" },
  { value: "checkout", label: "Checkout" },
  { value: "wishlist", label: "Wishlist" },
  { value: "contact", label: "Contact" },
  { value: "whatsapp", label: "WhatsApp order" },
  { value: "about", label: "About page" },
  { value: "blog", label: "Blog" },
  { value: "external", label: "Another website" },
];

const BUTTON_VARIANTS: ChoiceOption[] = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "outline", label: "Outline" },
  { value: "ghost", label: "Ghost" },
  { value: "text", label: "Text" },
  { value: "gradient", label: "Gradient" },
  { value: "floating", label: "Floating" },
  { value: "sticky", label: "Sticky" },
];

const COMMERCE_BUTTON_KINDS = ["hero-split", "promo-banner", "featured-products", "product-detail", "cart-summary", "checkout-form", "contact-form", "newsletter"];

export function buttonCopyKey(kind: string) {
  if (kind === "hero-split") return "primaryCta";
  if (kind === "newsletter" || kind === "contact-form") return "buttonLabel";
  return "cta";
}

const CLASSIC_ADDABLE: Record<string, Array<{ id: string; label: string }>> = {
  "story-split": [{ id: "text-point", label: "Text point" }, { id: "cta", label: "Button" }],
  "text-columns": [{ id: "text-point", label: "Text point" }],
  "category-list": [{ id: "image-tile", label: "Image tile" }],
  "lookbook-grid": [{ id: "image-tile", label: "Image tile" }],
  "featured-products": [{ id: "product-card", label: "Product card" }],
  "cart-summary": [{ id: "product-card", label: "Product card" }],
  "wishlist-grid": [{ id: "product-card", label: "Product card" }],
  testimonials: [{ id: "review", label: "Review" }],
  faq: [{ id: "faq", label: "Question" }],
  "filters-toolbar": [{ id: "filter", label: "Filter" }],
  "product-detail": [{ id: "option", label: "Product option" }],
  "hero-split": [{ id: "cta", label: "Button" }],
  "promo-banner": [{ id: "cta", label: "Button" }],
  newsletter: [{ id: "cta", label: "Button" }],
  "contact-form": [{ id: "cta", label: "Button" }, { id: "whatsapp-cta", label: "WhatsApp button" }],
  footer: [{ id: "whatsapp-cta", label: "WhatsApp button" }],
};

function classicSchema(kind: string): SectionSchema {
  const content: SchemaField[] = [];
  if (kind === "announcement-bar") {
    content.push(area("text", "Message"));
  } else {
    content.push(text("eyebrow", "Eyebrow"), area("title", "Heading"), area("body", "Text"));
  }
  const groups: FieldGroup[] = [{ fields: content }];

  if (kind === "header") {
    groups.push({ title: "Header", fields: [
      text("logoText", "Logo text"),
      text("cartLabel", "Cart label"),
      { id: "categoryNavLayout", type: "select", label: "Category menu", target: setting("categoryNavLayout"), fallback: "simple", options: [
        { value: "simple", label: "Simple menu" }, { value: "bar", label: "Category bar" }, { value: "mega", label: "Mega menu" }, { value: "drawer", label: "Category drawer" },
      ] },
      { id: "search", type: "toggle", label: "Search", target: setting("search"), fallback: true },
      { id: "wishlist", type: "toggle", label: "Wishlist", target: setting("wishlist"), fallback: true },
      { id: "cart", type: "toggle", label: "Cart", target: setting("cart"), fallback: true },
      { id: "navLinks", type: "list", label: "Menu links", target: copy("navLinks"), fallback: ["home", "products", "about", "contact"], help: "Page names separated by commas." },
      { id: "utilityLinks", type: "list", label: "Utility links", target: copy("utilityLinks"), fallback: ["wishlist", "cart"] },
    ] });
  }
  if (kind === "cart-summary") {
    groups.push({ fields: [{ id: "drawerVariation", type: "select", label: "Cart drawer", target: setting("drawerVariation"), fallback: "right-drawer", options: [
      { value: "right-drawer", label: "Right drawer" }, { value: "left-drawer", label: "Left drawer" }, { value: "modal", label: "Modal cart" }, { value: "floating", label: "Mini floating cart" }, { value: "minimal", label: "Minimal cart" },
    ] }] });
  }
  if (kind === "payday-countdown") groups.push({ title: "Timing", fields: [text("discountLabel", "Discount", { placeholder: "e.g. 15% off" }), ...PAYDAY_FIELDS] });
  if (kind === "footer") {
    groups.push({ title: "Footer", fields: [
      area("summary", "Footer summary"),
      { id: "showPayments", type: "toggle", label: "Show payment methods", target: setting("showPayments"), fallback: true },
      { id: "showDelivery", type: "toggle", label: "Show delivery note", target: setting("showDelivery"), fallback: true },
      text("email", "Contact email"),
      text("phone", "Contact phone"),
      text("whatsappLabel", "WhatsApp button label"),
    ] });
  }
  if (kind === "contact-form") groups.push({ title: "Contact details", fields: [text("address", "Address"), text("email", "Contact email"), text("phone", "Contact phone")] });
  if (!["announcement-bar", "header", "footer"].includes(kind)) {
    groups[0]!.fields.push(text(buttonCopyKey(kind), "Button label"));
  }
  if (SECTION_VARIATIONS[kind]?.length) {
    groups.push({ title: "Layout", fields: [{ id: "layout", type: "cards", label: "Style", target: setting("layout"), fallback: SECTION_VARIATIONS[kind]![0]!.value, options: SECTION_VARIATIONS[kind]! }] });
  }
  if (COMMERCE_BUTTON_KINDS.includes(kind)) {
    groups.push({ title: "Buttons", fields: [
      { id: "primaryButtonAction", type: "select", label: "Main button opens", target: setting("primaryButtonAction"), fallback: "products", options: BUTTON_ACTIONS },
      { id: "primaryButtonUrl", type: "text", label: "Link", target: setting("primaryButtonUrl"), placeholder: "https://", when: { scope: "settings", key: "primaryButtonAction", in: ["external"] } },
      { id: "primaryButtonVariant", type: "select", label: "Main button style", target: setting("primaryButtonVariant"), fallback: "primary", options: BUTTON_VARIANTS },
      { id: "secondaryButtonAction", type: "select", label: "Second button opens", target: setting("secondaryButtonAction"), fallback: "about", options: BUTTON_ACTIONS },
      { id: "secondaryButtonVariant", type: "select", label: "Second button style", target: setting("secondaryButtonVariant"), fallback: "outline", options: BUTTON_VARIANTS },
      { id: "buttonSize", type: "segmented", label: "Size", target: setting("buttonSize"), fallback: "lg", options: [{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }] },
      { id: "buttonShape", type: "segmented", label: "Shape", target: setting("buttonShape"), fallback: "pill", options: [{ value: "square", label: "Square" }, { value: "rounded", label: "Rounded" }, { value: "pill", label: "Pill" }] },
      { id: "stickyMobileCta", type: "toggle", label: "Sticky button on phones", target: setting("stickyMobileCta"), fallback: false },
    ] });
  }
  groups.push({ fields: [{ id: "imageBlocks", type: "imageBlocks", label: "Images" }, { id: "items", type: "items", label: "Blocks" }] });

  const style: FieldGroup[] = [
    { title: "Background", fields: [
      { id: "bgColor", type: "color", label: "Colour", target: { scope: "background", key: "color" }, placeholder: "#ffffff" },
      { id: "bgGradient", type: "text", label: "Gradient", target: { scope: "background", key: "gradient" }, placeholder: "linear-gradient(135deg, #667eea, #764ba2)" },
    ] },
    { title: "Spacing", fields: [
      { id: "padding", type: "text", label: "Padding", target: { scope: "styles", key: "padding" }, placeholder: "e.g. 40px 20px" },
      { id: "margin", type: "text", label: "Margin", target: { scope: "styles", key: "margin" }, placeholder: "e.g. 0 0 20px" },
      { id: "maxWidth", type: "text", label: "Max width", target: { scope: "styles", key: "maxWidth" }, placeholder: "e.g. 1240px" },
    ] },
  ];
  return { settings: groups, style, addable: CLASSIC_ADDABLE[kind] ?? [] };
}

export function sectionSchema(kind: string, renderer: RendererKind, themeId = ""): SectionSchema {
  if (REWARD_SECTION_KINDS.includes(kind)) return gameSchema(kind);
  return renderer === "boutique" ? boutiqueSchema(kind, themeId) : classicSchema(kind);
}

export function readTarget(section: TemplateSectionNode, target: FieldTarget): unknown {
  if (target.scope === "copy") return (section.blocks.find((block) => block.type === "copy")?.content ?? {})[target.key];
  if (target.scope === "settings") return section.settings?.[target.key];
  if (target.scope === "styles") return section.styles?.[target.key];
  return (section.background as Record<string, unknown> | undefined)?.[target.key];
}

export function fieldVisible(section: TemplateSectionNode, field: SchemaField) {
  if (!field.when) return true;
  const raw = field.when.scope === "settings" ? section.settings?.[field.when.key] : readTarget(section, { scope: "copy", key: field.when.key });
  const value = typeof raw === "string" && raw ? raw : field.when.fallback ?? "";
  return field.when.in.includes(value);
}
