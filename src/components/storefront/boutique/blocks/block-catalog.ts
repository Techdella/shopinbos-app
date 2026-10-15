// The ready-made store blocks the seller can insert in the builder (2026 themes): name, one-line description,
// Insert-panel category, icon, starter content and the inspector fields of each. Pure data with no runtime imports
// beyond relative .ts files, so editor-logic.ts, section-schema.ts and the tests load it without a bundler.
// The renderers live next to this file (one per block) and are wired up in registry.tsx.
//
// Starter content follows the theme-seed rules: no stock photos, made-up reviews, sales, press or offers reach
// shoppers. Blocks that need the seller's own pictures or entries show a clearly marked sample in the builder only,
// and stay hidden on the live store until the seller fills them in.

import type { TemplateSectionNode } from "../../../../lib/store-templates/types.ts";
import type { ChoiceOption, FieldGroup, ItemField, SchemaField, When } from "../../../builder/editor/section-schema.ts";

export type BlockCategory = "Banners" | "Products" | "Trust" | "Story" | "Grow" | "Extras";

/** Insert-panel order of the block categories (after the theme's own sections in the same groups). */
export const BLOCK_CATEGORY_ORDER: BlockCategory[] = ["Banners", "Products", "Trust", "Story", "Grow", "Extras"];

/** Icon names from src/components/ui/Icon.tsx (kept as strings so this file stays pure). */
export type BlockIcon =
  | "layers" | "image" | "megaphone" | "play" | "grid" | "cards" | "list" | "pin" | "filter" | "shield" | "flag"
  | "star" | "users" | "bell" | "truck" | "percent" | "user" | "book" | "eye" | "heart" | "target" | "search" | "clock" | "tag";

export interface BlockDefaults {
  copy: Record<string, unknown>;
  settings?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
}

export interface StoreBlockMeta {
  kind: string;
  label: string;
  description: string;
  category: BlockCategory;
  icon: BlockIcon;
  defaults: () => BlockDefaults;
  /** Inspector settings groups (the style tab shows the theme note, like every 2026 section). */
  schema: (themeId: string) => FieldGroup[];
}

// ─── Field helpers ───────────────────────────────────────────────────────────

type Extra = { help?: string; placeholder?: string; when?: When | When[] };
const copy = (key: string) => ({ scope: "copy" as const, key });
const setting = (key: string) => ({ scope: "settings" as const, key });
const text = (key: string, label: string, extra: Extra = {}): SchemaField => ({ id: key, type: "text", label, target: copy(key), ...extra });
const area = (key: string, label: string, extra: Extra = {}): SchemaField => ({ id: key, type: "textarea", label, target: copy(key), ...extra });
const select = (key: string, label: string, options: ChoiceOption[], fallback: string, extra: Extra = {}): SchemaField => ({ id: key, type: "select", label, target: setting(key), options, fallback, ...extra });
const seg = (key: string, label: string, options: ChoiceOption[], fallback: string, extra: Extra = {}): SchemaField => ({ id: key, type: "segmented", label, target: setting(key), options, fallback, ...extra });
const toggle = (key: string, label: string, fallback: boolean, extra: Extra = {}): SchemaField => ({ id: key, type: "toggle", label, target: setting(key), fallback, ...extra });
const number = (key: string, label: string, min: number, max: number, fallback: number, extra: Extra = {}): SchemaField => ({ id: key, type: "number", label, target: setting(key), min, max, fallback, ...extra });
const image = (key: string, label: string, accept: "image" | "media" = "image", extra: Extra = {}): SchemaField => ({ id: key, type: "image", label, target: copy(key), accept, ...extra });
const note = (id: string, label: string, extra: Extra = {}): SchemaField => ({ id, type: "note", label, ...extra });
const settingIs = (key: string, values: string[], fallback: string): When => ({ scope: "settings", key, in: values, fallback });

function repeater(input: { id: string; label: string; itemName: string; addLabel: string; max: number; fields: ItemField[]; template: Record<string, unknown>; titleKeys: string[]; help?: string; when?: When | When[] }): SchemaField {
  return { type: "repeater", ...input };
}

const PAGE_TARGETS: ChoiceOption[] = [
  { value: "products", label: "Shop" },
  { value: "about", label: "About" },
  { value: "contact", label: "Contact" },
  { value: "faq", label: "FAQ" },
  { value: "wishlist", label: "Wishlist" },
  { value: "cart", label: "Bag" },
];
const ALIGN: ChoiceOption[] = [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }];
const VERTICAL: ChoiceOption[] = [{ value: "top", label: "Top" }, { value: "center", label: "Middle" }, { value: "bottom", label: "Bottom" }];
const OVERLAY: ChoiceOption[] = [{ value: "light", label: "Light" }, { value: "medium", label: "Medium" }, { value: "strong", label: "Strong" }];
const HEIGHT: ChoiceOption[] = [{ value: "medium", label: "Medium" }, { value: "large", label: "Large" }, { value: "full", label: "Full screen" }];
const PRODUCT_SOURCES: ChoiceOption[] = [
  { value: "best-sellers", label: "Best sellers" },
  { value: "new", label: "New arrivals" },
  { value: "sale", label: "On sale" },
  { value: "collection", label: "One collection" },
  { value: "picked", label: "Only products I pick" },
];
const TRUST_ICONS: ChoiceOption[] = [
  { value: "truck", label: "Delivery" },
  { value: "card", label: "Payment" },
  { value: "lock", label: "Secure" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "refresh", label: "Returns" },
  { value: "star", label: "Star" },
  { value: "shield", label: "Shield" },
  { value: "clock", label: "Clock" },
  { value: "package", label: "Package" },
  { value: "leaf", label: "Natural" },
  { value: "heart", label: "Heart" },
  { value: "check", label: "Tick" },
];

/** Products picked onto section.items: one "Show these first" list or one "Only these" list, never both at once. */
function productPickers(fallback: string): SchemaField[] {
  return [
    { id: "collectionId", type: "collection", label: "Collection", target: setting("collectionId"), when: settingIs("source", ["collection"], fallback) },
    { id: "products", type: "products", label: "Show these first", help: "Products you pick show first, then the rest.", when: settingIs("source", ["best-sellers", "new", "sale", "collection"], fallback) },
    { id: "products-picked", type: "products", label: "Products to show", help: "Only these show, in this order.", when: settingIs("source", ["picked"], fallback) },
  ];
}

const TONES: ChoiceOption[] = [{ value: "dark", label: "Dark" }, { value: "accent", label: "Accent" }, { value: "light", label: "Light" }];

/** The countdown fields of the campaign sections: inside a campaign the timer follows the campaign's end. */
const CAMPAIGN_TIMER_FIELDS: SchemaField[] = [
  seg("timer", "Counts down to", [{ value: "campaign", label: "The campaign's end" }, { value: "custom", label: "A set time" }], "campaign", { help: "Outside a seasonal campaign, pick a set time." }),
  { id: "endsAt", type: "datetime", label: "Ends at", target: setting("endsAt"), when: settingIs("timer", ["custom"], "campaign") },
  seg("expiry", "When the time is up", [{ value: "hide", label: "Hide it" }, { value: "message", label: "Show a message" }], "hide"),
  { id: "endedText", type: "text", label: "Message", target: copy("endedText"), placeholder: "This offer has ended", when: settingIs("expiry", ["message"], "hide") },
];

// ─── The blocks ──────────────────────────────────────────────────────────────

export const STORE_BLOCKS: StoreBlockMeta[] = [
  // Banners (hero & header)
  {
    kind: "split-hero",
    label: "Split hero",
    description: "Picture on one side, headline and two buttons on the other.",
    category: "Banners",
    icon: "layers",
    defaults: () => ({
      copy: { eyebrow: "New collection", title: "Made for the way you live", body: "Discover our latest pieces, delivered to your door.", primaryCta: "Shop now", secondaryCta: "Our story", mediaUrl: "" },
      settings: { imageSide: "right", primaryAction: "products", secondaryAction: "about" },
    }),
    schema: () => [
      { fields: [
        image("mediaUrl", "Picture or video", "media", { help: "No picture yet? Your first product photo is used." }),
        seg("imageSide", "Picture side", [{ value: "left", label: "Left" }, { value: "right", label: "Right" }], "right", { help: "On phones the picture is always on top." }),
      ] },
      { title: "Content", fields: [
        text("eyebrow", "Eyebrow"),
        area("title", "Heading"),
        area("body", "Text"),
        text("primaryCta", "First button"),
        select("primaryAction", "First button opens", PAGE_TARGETS, "products"),
        text("secondaryCta", "Second button", { help: "Leave empty for one button." }),
        select("secondaryAction", "Second button opens", PAGE_TARGETS, "about"),
      ] },
    ],
  },
  {
    kind: "parallax-banner",
    label: "Full-width banner",
    description: "Edge-to-edge picture with words, a badge and a gentle parallax scroll.",
    category: "Banners",
    icon: "image",
    defaults: () => ({
      copy: { badge: "New in", title: "The new season is here", body: "", cta: "Shop the collection", mediaUrl: "" },
      settings: { textAlign: "center", textVertical: "center", overlay: "medium", parallax: true, height: "large", action: "products" },
    }),
    schema: () => [
      { fields: [
        image("mediaUrl", "Picture", "image", { help: "No picture yet? A product photo is used." }),
        seg("height", "Height", HEIGHT, "large"),
        toggle("parallax", "Parallax scroll", true, { help: "The picture moves a little slower than the page on computers. Off for shoppers who turn off motion." }),
      ] },
      { title: "Content", fields: [
        text("badge", "Badge", { help: "A short label such as New in or Limited. Leave empty for none." }),
        area("title", "Heading"),
        area("body", "Text"),
        text("cta", "Button label", { help: "Leave empty for no button." }),
        select("action", "Button opens", PAGE_TARGETS, "products"),
      ] },
      { title: "Text position", fields: [
        seg("textAlign", "Across", ALIGN, "center"),
        seg("textVertical", "Up and down", VERTICAL, "center"),
        seg("overlay", "Darken the picture", OVERLAY, "medium", { help: "Stronger keeps white words readable on bright pictures." }),
      ] },
    ],
  },
  {
    kind: "ticker-bar",
    label: "Announcement ticker",
    description: "Messages that scroll across a slim strip.",
    category: "Banners",
    icon: "megaphone",
    defaults: () => ({
      copy: {},
      settings: { speed: "normal", tone: "dark" },
      items: [{ text: "Welcome to {store}", link: { type: "url", value: "" } }, { text: "", source: "delivery", link: { type: "url", value: "" } }, { text: "", source: "payment", link: { type: "url", value: "" } }],
    }),
    schema: () => [
      { fields: [
        repeater({
          id: "messages",
          label: "Messages",
          itemName: "Message",
          addLabel: "Add message",
          max: 8,
          help: "{store} shows your store name. Empty delivery and payment messages are filled from your settings.",
          template: { text: "", link: { type: "url", value: "" } },
          titleKeys: ["text"],
          fields: [
            { key: "text", type: "text", label: "Message" },
            { key: "link", type: "link", label: "Opens when tapped", help: "Optional. Leave the web address empty for plain text." },
          ],
        }),
      ] },
      { title: "Look", fields: [
        seg("speed", "Speed", [{ value: "slow", label: "Slow" }, { value: "normal", label: "Normal" }, { value: "fast", label: "Fast" }], "normal", { help: "Stops while a shopper points at it, and stays still for shoppers who turn off motion." }),
        seg("tone", "Colour", [{ value: "dark", label: "Dark" }, { value: "accent", label: "Accent" }, { value: "light", label: "Light" }], "dark"),
      ] },
    ],
  },
  {
    kind: "video-hero",
    label: "Video hero",
    description: "A looping video behind your headline and button.",
    category: "Banners",
    icon: "play",
    defaults: () => ({
      copy: { title: "See it in motion", body: "", cta: "Shop now", videoUrl: "", posterUrl: "" },
      settings: { overlay: "medium", textAlign: "center", height: "large", action: "products" },
    }),
    schema: () => [
      { fields: [
        image("videoUrl", "Video", "media", { help: "Upload a short video or paste a YouTube link. It plays muted and on repeat." }),
        image("posterUrl", "Cover picture", "image", { help: "Shows while the video loads, and instead of it for shoppers who turn off motion." }),
        seg("height", "Height", HEIGHT, "large"),
      ] },
      { title: "Content", fields: [
        area("title", "Heading"),
        area("body", "Text"),
        text("cta", "Button label", { help: "Leave empty for no button." }),
        select("action", "Button opens", PAGE_TARGETS, "products"),
        seg("textAlign", "Text position", ALIGN, "center"),
        seg("overlay", "Darken the video", OVERLAY, "medium"),
      ] },
    ],
  },

  // Products (discovery)
  {
    kind: "collection-grid",
    label: "Collection grid",
    description: "Picture tiles for your collections or categories, 2 to 5 across.",
    category: "Products",
    icon: "grid",
    defaults: () => ({
      copy: { title: "Shop by collection" },
      settings: { source: "auto", columns: 4, limit: 8, hover: "zoom", labels: "overlay", shape: "portrait" },
    }),
    schema: () => [
      { fields: [
        text("title", "Heading"),
        select("source", "Tiles", [
          { value: "auto", label: "Collections, or categories when you have none" },
          { value: "collections", label: "Collections" },
          { value: "categories", label: "Product categories" },
        ], "auto"),
        number("columns", "Tiles across on computers", 2, 5, 4, { help: "Phones show two across." }),
        number("limit", "How many tiles", 2, 15, 8),
      ] },
      { title: "Look", fields: [
        seg("shape", "Tile shape", [{ value: "square", label: "Square" }, { value: "portrait", label: "Tall" }, { value: "landscape", label: "Wide" }], "portrait"),
        seg("labels", "Names", [{ value: "overlay", label: "On the picture" }, { value: "below", label: "Below" }], "overlay"),
        seg("hover", "When pointed at", [{ value: "zoom", label: "Zoom" }, { value: "lift", label: "Lift" }, { value: "none", label: "Nothing" }], "zoom"),
      ] },
    ],
  },
  {
    kind: "product-carousel",
    label: "Product carousel",
    description: "A sliding row of products with arrows, swipe, ratings and quick add.",
    category: "Products",
    icon: "cards",
    defaults: () => ({
      copy: { title: "Featured products", cta: "Shop all" },
      settings: { source: "best-sellers", limit: 10, showRating: true, quickAdd: true },
      items: [],
    }),
    schema: () => [
      { fields: [text("title", "Heading"), text("cta", "Link label", { placeholder: "Shop all", help: "Leave empty to hide the link." })] },
      { title: "Products", fields: [
        select("source", "Show", PRODUCT_SOURCES, "best-sellers"),
        ...productPickers("best-sellers"),
        number("limit", "How many products", 3, 20, 10),
      ] },
      { title: "Cards", fields: [
        toggle("showRating", "Star rating", true, { help: "Only shows on products with real reviews." }),
        toggle("quickAdd", "Quick add button", true, { help: "Products with sizes or colours open their page instead." }),
      ] },
    ],
  },
  {
    kind: "tabbed-products",
    label: "Tabbed products",
    description: "Best sellers, new arrivals and sale items behind tabs.",
    category: "Products",
    icon: "list",
    defaults: () => ({
      copy: { title: "Shop our favourites", bestLabel: "Best sellers", newLabel: "New arrivals", saleLabel: "On sale" },
      settings: { showBest: true, showNew: true, showSale: true, limit: 8 },
    }),
    schema: () => [
      { fields: [text("title", "Heading"), number("limit", "Products per tab", 2, 16, 8)] },
      { title: "Tabs", fields: [
        toggle("showBest", "Best sellers", true),
        text("bestLabel", "Best sellers tab name", { when: settingIs("showBest", ["true"], "true") }),
        toggle("showNew", "New arrivals", true),
        text("newLabel", "New arrivals tab name", { when: settingIs("showNew", ["true"], "true") }),
        toggle("showSale", "On sale", true, { help: "Shows products with a was-price. Hidden when nothing is on sale." }),
        text("saleLabel", "On sale tab name", { when: settingIs("showSale", ["true"], "true") }),
      ] },
    ],
  },
  {
    kind: "shop-the-look",
    label: "Shop the look",
    description: "A photo with tappable pins on the products in it.",
    category: "Products",
    icon: "pin",
    defaults: () => ({
      copy: { title: "Shop the look", body: "", buttonLabel: "Add all to bag", imageUrl: "" },
      settings: { imageSide: "left" },
      items: [],
    }),
    schema: () => [
      { fields: [
        image("imageUrl", "Photo", "image", { help: "A styled photo with several of your products in it." }),
        seg("imageSide", "Photo side", [{ value: "left", label: "Left" }, { value: "right", label: "Right" }], "left"),
      ] },
      { title: "Content", fields: [text("title", "Heading"), area("body", "Text"), text("buttonLabel", "Add all button", { help: "Leave empty to hide it." })] },
      { title: "Pins", fields: [
        repeater({
          id: "pins",
          label: "Pins",
          itemName: "Pin",
          addLabel: "Add pin",
          max: 8,
          help: "Pick the product and where the pin sits: across from the left edge and down from the top, in percent.",
          template: { link: { type: "product", value: "" }, x: "50", y: "50", label: "" },
          titleKeys: ["label"],
          fields: [
            { key: "link", type: "link", label: "Product", help: "Choose Product, then pick it." },
            { key: "x", type: "number", label: "Across (%)", min: 0, max: 100, placeholder: "50" },
            { key: "y", type: "number", label: "Down (%)", min: 0, max: 100, placeholder: "50" },
            { key: "label", type: "text", label: "Name in the list", help: "Optional. The product name shows when empty." },
          ],
        }),
      ] },
    ],
  },
  {
    kind: "compare-table",
    label: "Comparison table",
    description: "Two to four products side by side, row by row.",
    category: "Products",
    icon: "filter",
    defaults: () => ({ copy: { title: "Compare", body: "", rows: [] }, settings: { showPrice: true, showRating: true, showButton: true }, items: [] }),
    schema: () => [
      { fields: [
        text("title", "Heading"),
        area("body", "Text"),
        { id: "products", type: "products", label: "Products to compare", max: 4, help: "Pick two to four products." },
      ] },
      { title: "Rows", fields: [
        toggle("showPrice", "Price", true),
        toggle("showRating", "Rating", true),
        { id: "rows", type: "list", label: "Details to compare", target: copy("rows"), fallback: [], help: "Detail names from your products, separated by commas (e.g. Material, Size). Leave empty to show every detail they have." },
        toggle("showButton", "Add to bag buttons", true),
      ] },
    ],
  },

  // Trust & social proof
  {
    kind: "trust-badges",
    label: "Trust badges",
    description: "A row of icons with your delivery, payment and support promises.",
    category: "Trust",
    icon: "shield",
    defaults: () => ({
      copy: { title: "" },
      settings: { style: "row" },
      items: [
        { icon: "truck", title: "Delivery", text: "", source: "delivery" },
        { icon: "card", title: "Pay your way", text: "", source: "payment" },
        { icon: "whatsapp", title: "Chat with us", text: "", source: "whatsapp" },
        { icon: "lock", title: "Secure checkout", text: "Your payment details are protected." },
      ],
    }),
    schema: () => [
      { fields: [text("title", "Heading", { help: "Optional." }), seg("style", "Style", [{ value: "row", label: "Row" }, { value: "cards", label: "Cards" }], "row")] },
      { title: "Badges", fields: [
        repeater({
          id: "badges",
          label: "Badges",
          itemName: "Badge",
          addLabel: "Add badge",
          max: 6,
          help: "Empty delivery, payment and chat texts are filled from your settings, and hidden when that isn't set up.",
          template: { icon: "check", title: "", text: "" },
          titleKeys: ["title"],
          fields: [
            { key: "icon", type: "select", label: "Icon", options: TRUST_ICONS, fallback: "check" },
            { key: "title", type: "text", label: "Title" },
            { key: "text", type: "text", label: "Text" },
          ],
        }),
      ] },
    ],
  },
  {
    kind: "press-logos",
    label: "As seen in",
    description: "Logos of the press, shows or shops that featured you.",
    category: "Trust",
    icon: "flag",
    defaults: () => ({ copy: { title: "As seen in" }, settings: { grayscale: true }, items: [] }),
    schema: () => [
      { fields: [text("title", "Heading"), toggle("grayscale", "Grey logos", true, { help: "Logos show in colour when pointed at." })] },
      { title: "Logos", fields: [
        repeater({
          id: "logos",
          label: "Logos",
          itemName: "Logo",
          addLabel: "Add logo",
          max: 10,
          help: "Only add places that really featured you. Hidden from shoppers until you add one.",
          template: { imageUrl: "", name: "", link: { type: "url", value: "" } },
          titleKeys: ["name"],
          fields: [
            { key: "media", type: "media", label: "Logo", accept: "image" },
            { key: "name", type: "text", label: "Name", help: "Shown when there is no logo, and read out to screen readers." },
            { key: "link", type: "link", label: "Link", help: "Optional: the article or feature." },
          ],
        }),
      ] },
    ],
  },
  {
    kind: "review-carousel",
    label: "Review carousel",
    description: "Your real product reviews in a sliding row.",
    category: "Trust",
    icon: "star",
    defaults: () => ({ copy: { title: "Loved by our customers" }, settings: { limit: 8, useTestimonials: true, autoplay: false }, items: [] }),
    schema: () => [
      { fields: [
        text("title", "Heading"),
        number("limit", "How many reviews", 2, 12, 8),
        toggle("autoplay", "Move by itself", false, { help: "Stops while a shopper points at it, and for shoppers who turn off motion." }),
        note("reviews-note", "Approved reviews from customers who ordered show first."),
      ] },
      { title: "Your testimonials", fields: [
        toggle("useTestimonials", "Show my testimonials until reviews come in", true),
        repeater({
          id: "testimonials",
          label: "Testimonials",
          itemName: "Testimonial",
          addLabel: "Add testimonial",
          max: 8,
          help: "Words real customers sent you (WhatsApp, DM, email). Only shown while you have no product reviews.",
          template: { quote: "", person: "", city: "", rating: "5" },
          titleKeys: ["person", "quote"],
          fields: [
            { key: "quote", type: "textarea", label: "What they said" },
            { key: "person", type: "text", label: "First name" },
            { key: "city", type: "text", label: "City" },
            { key: "rating", type: "segmented", label: "Stars", options: [{ value: "5", label: "5" }, { value: "4", label: "4" }, { value: "3", label: "3" }], fallback: "5" },
          ],
          when: settingIs("useTestimonials", ["true"], "true"),
        }),
      ] },
    ],
  },
  {
    kind: "ugc-grid",
    label: "Customer photo grid",
    description: "Photos from your customers, each can link to a product or post.",
    category: "Trust",
    icon: "users",
    defaults: () => ({ copy: { title: "As worn by you", body: "Tag us in your photos to be featured." }, settings: { columns: 4 }, items: [] }),
    schema: () => [
      { fields: [text("title", "Heading"), area("body", "Text"), number("columns", "Photos across on computers", 3, 6, 4, { help: "Phones show two or three across." })] },
      { title: "Photos", fields: [
        repeater({
          id: "photos",
          label: "Photos",
          itemName: "Photo",
          addLabel: "Add photo",
          max: 12,
          help: "Use photos customers allowed you to share. Hidden from shoppers until you add one.",
          template: { imageUrl: "", label: "", link: { type: "url", value: "" } },
          titleKeys: ["label"],
          fields: [
            { key: "media", type: "media", label: "Photo", accept: "image" },
            { key: "label", type: "text", label: "Caption", placeholder: "@handle" },
            { key: "link", type: "link", label: "Opens when tapped", help: "A product, a page or the original post." },
          ],
        }),
      ] },
    ],
  },
  {
    kind: "sales-pop",
    label: "Recent sales pop-up",
    description: "A small note in the corner: someone in Lagos just bought…",
    category: "Trust",
    icon: "bell",
    defaults: () => ({ copy: {}, settings: { consent: false, delaySeconds: 8, intervalSeconds: 15, position: "left" }, items: [] }),
    schema: () => [
      { fields: [
        toggle("consent", "These are real orders and buyers agreed", false, { help: "Shoppers only see it once this is on. Only a first name and city are ever shown." }),
        number("delaySeconds", "First note after (seconds)", 3, 60, 8),
        number("intervalSeconds", "Seconds between notes", 8, 120, 15),
        seg("position", "Corner", [{ value: "left", label: "Bottom left" }, { value: "right", label: "Bottom right" }], "left"),
      ] },
      { title: "Sales", fields: [
        repeater({
          id: "sales",
          label: "Sales",
          itemName: "Sale",
          addLabel: "Add sale",
          max: 12,
          help: "Copy a few recent orders. Surnames, phone numbers and addresses are never shown.",
          template: { name: "", city: "", link: { type: "product", value: "" }, when: "" },
          titleKeys: ["name", "city"],
          fields: [
            { key: "name", type: "text", label: "First name", help: "Optional. Shows as Someone when empty." },
            { key: "city", type: "text", label: "City" },
            { key: "link", type: "link", label: "Product they bought", help: "Choose Product, then pick it." },
            { key: "when", type: "text", label: "When", placeholder: "2 hours ago" },
          ],
        }),
      ] },
    ],
  },

  // Story (content)
  {
    kind: "founder-story",
    label: "Founder's letter",
    description: "Your portrait, a personal note, signature and an optional video.",
    category: "Story",
    icon: "user",
    defaults: () => ({
      copy: { eyebrow: "A note from our founder", title: "Why we started", body: "", signatureName: "", role: "Founder", portraitUrl: "", signatureUrl: "", videoUrl: "" },
      settings: { imageSide: "left" },
    }),
    schema: () => [
      { fields: [
        image("portraitUrl", "Portrait", "image", { help: "No portrait yet? Your logo or a product photo is used." }),
        seg("imageSide", "Portrait side", [{ value: "left", label: "Left" }, { value: "right", label: "Right" }], "left"),
        image("videoUrl", "Video", "media", { help: "Optional. Upload a short video or paste a YouTube link; shoppers press play." }),
      ] },
      { title: "Letter", fields: [
        text("eyebrow", "Eyebrow"),
        area("title", "Heading"),
        area("body", "Letter", { help: "Leave empty to use your store description. Press Enter twice for a new paragraph." }),
        text("signatureName", "Your name", { help: "Shown in handwriting style under the letter." }),
        text("role", "Role", { placeholder: "Founder" }),
        image("signatureUrl", "Signature picture", "image", { help: "Optional: a photo of your real signature. Replaces the handwriting style." }),
      ] },
    ],
  },
  {
    kind: "shoppable-story",
    label: "Shoppable story",
    description: "A short article with product cards between the paragraphs.",
    category: "Story",
    icon: "book",
    defaults: () => ({ copy: { eyebrow: "From the journal", title: "How to style it", imageUrl: "" }, items: [] }),
    schema: () => [
      { fields: [image("imageUrl", "Cover picture", "image", { help: "Optional." }), text("eyebrow", "Eyebrow"), area("title", "Heading")] },
      { title: "Story", fields: [
        repeater({
          id: "paragraphs",
          label: "Paragraphs",
          itemName: "Paragraph",
          addLabel: "Add paragraph",
          max: 12,
          help: "Pick a product under any paragraph to show it right there with an add to bag button.",
          template: { heading: "", text: "", link: { type: "product", value: "" } },
          titleKeys: ["heading", "text"],
          fields: [
            { key: "heading", type: "text", label: "Subheading", help: "Optional." },
            { key: "text", type: "textarea", label: "Text" },
            { key: "link", type: "link", label: "Product card", help: "Choose Product to show a card after this paragraph." },
          ],
        }),
      ] },
    ],
  },
  {
    kind: "recently-viewed",
    label: "Recently viewed",
    description: "Products this shopper looked at, remembered on their phone.",
    category: "Story",
    icon: "eye",
    defaults: () => ({ copy: { title: "Recently viewed" }, settings: { limit: 8 } }),
    schema: () => [
      { fields: [
        text("title", "Heading"),
        number("limit", "How many products", 2, 12, 8),
        note("rv-note", "Each shopper sees their own list, kept on their device. Hidden until they have looked at a product."),
      ] },
    ],
  },
  {
    kind: "also-like",
    label: "You may also like",
    description: "Recommendations based on what the shopper viewed or added.",
    category: "Story",
    icon: "heart",
    defaults: () => ({ copy: { title: "You may also like" }, settings: { limit: 8, fallbackBest: true } }),
    schema: () => [
      { fields: [
        text("title", "Heading"),
        number("limit", "How many products", 2, 12, 8),
        toggle("fallbackBest", "Show best sellers for new visitors", true),
        note("al-note", "Picks products in the same category or type, or with the same tags, as the ones in the shopper's bag or recently viewed."),
      ] },
    ],
  },

  // Grow (conversion)
  {
    kind: "shipping-progress",
    label: "Free-delivery bar",
    description: "Shows how much more the bag needs for free delivery.",
    category: "Grow",
    icon: "truck",
    defaults: () => ({
      copy: { emptyText: "Free delivery on orders over {amount}", progressText: "You're {amount} away from free delivery", doneText: "You've unlocked free delivery", amount: "" },
    }),
    schema: () => [
      { fields: [
        text("amount", "Free delivery from", { placeholder: "e.g. 50000", help: "Only used when your delivery settings have no free-delivery amount. Your delivery settings decide what checkout charges." }),
        text("emptyText", "Empty bag message", { help: "{amount} shows the free-delivery amount." }),
        text("progressText", "Message while filling", { help: "{amount} shows what's left to spend." }),
        text("doneText", "Message when reached"),
      ] },
    ],
  },
  {
    kind: "promo-popup",
    label: "Sign-up pop-up",
    description: "Collects emails or WhatsApp numbers, with an optional discount code.",
    category: "Grow",
    icon: "percent",
    defaults: () => ({
      copy: { title: "Join our list", body: "Be the first to hear about new drops and offers.", buttonLabel: "Sign me up", discountCode: "", successText: "You're in. Here's your code:", imageUrl: "" },
      settings: { field: "either", trigger: "exit", delaySeconds: 10, frequencyDays: 7 },
    }),
    schema: () => [
      { title: "When it opens", fields: [
        seg("trigger", "On computers", [{ value: "exit", label: "About to leave" }, { value: "delay", label: "After a delay" }], "exit"),
        number("delaySeconds", "Seconds (and on phones)", 3, 120, 10, { help: "Phones have no about-to-leave signal, so they always wait this long." }),
        number("frequencyDays", "Show again after (days)", 1, 60, 7, { help: "Never again after someone signs up." }),
      ] },
      { title: "Content", fields: [
        image("imageUrl", "Picture", "image", { help: "Optional." }),
        area("title", "Heading"),
        area("body", "Text"),
        seg("field", "Ask for", [{ value: "either", label: "Email or WhatsApp" }, { value: "email", label: "Email" }, { value: "phone", label: "WhatsApp" }], "either"),
        text("buttonLabel", "Button label"),
        text("discountCode", "Discount code", { help: "Optional. Create the code in Marketing › Discounts first, so it works at checkout." }),
        text("successText", "Thank-you text"),
      ] },
    ],
  },

  // Seasonal campaign sections (also usable on their own). Inside a running campaign their timers follow the
  // campaign's dates and the promo strip shows the campaign's discount code (src/lib/store-campaigns).
  {
    kind: "campaign-countdown-hero",
    label: "Countdown banner",
    description: "A big banner with a live countdown to the end of your sale.",
    category: "Banners",
    icon: "clock",
    defaults: () => ({
      copy: { eyebrow: "", title: "The sale is on", body: "", primaryCta: "Shop the sale", mediaUrl: "", endedText: "" },
      settings: { timer: "campaign", endsAt: "", expiry: "hide", tone: "dark", height: "medium", action: "products" },
    }),
    schema: () => [
      { fields: [...CAMPAIGN_TIMER_FIELDS] },
      { title: "Content", fields: [
        image("mediaUrl", "Picture or video", "media", { help: "Optional. Words sit on the campaign colour when there is no picture." }),
        text("eyebrow", "Eyebrow"),
        area("title", "Heading"),
        area("body", "Text"),
        text("primaryCta", "Button label", { help: "Leave empty for no button." }),
        select("action", "Button opens", PAGE_TARGETS, "products"),
      ] },
      { title: "Look", fields: [
        seg("tone", "Colour", TONES, "dark"),
        seg("height", "Height", HEIGHT, "medium"),
      ] },
    ],
  },
  {
    kind: "campaign-promo-strip",
    label: "Promo code strip",
    description: "A slim band with your discount code and a copy button.",
    category: "Banners",
    icon: "tag",
    defaults: () => ({
      copy: { text: "Use this code at checkout", code: "" },
      settings: { tone: "accent" },
    }),
    schema: () => [
      { fields: [
        area("text", "Text"),
        text("code", "Discount code", { help: "Leave empty to use the code of the discount linked to the campaign. Create codes in Marketing › Discounts first, so they work at checkout." }),
        seg("tone", "Colour", TONES, "accent"),
      ] },
    ],
  },
  {
    kind: "campaign-deal-grid",
    label: "Deal grid",
    description: "Sale products with was and now prices and their badges.",
    category: "Products",
    icon: "percent",
    defaults: () => ({
      copy: { title: "Deals", cta: "Shop all" },
      settings: { source: "sale", limit: 8, showBadges: true },
    }),
    schema: () => [
      { fields: [
        text("title", "Heading"),
        text("cta", "Link label", { help: "Leave empty for no link." }),
        select("source", "Products", PRODUCT_SOURCES, "sale", { help: "On sale shows products with a compare-at price." }),
        ...productPickers("sale"),
        number("limit", "How many", 2, 24, 8),
        toggle("showBadges", "Show campaign badges", true),
      ] },
    ],
  },
  {
    kind: "campaign-featured-deal",
    label: "Featured deal",
    description: "One product in the spotlight, with a countdown and add to bag.",
    category: "Products",
    icon: "star",
    defaults: () => ({
      copy: { eyebrow: "Deal of the day", title: "", body: "", cta: "Add to bag", endedText: "" },
      settings: { timer: "campaign", endsAt: "", expiry: "hide" },
      items: [],
    }),
    schema: () => [
      { fields: [
        { id: "products", type: "products", label: "Product", max: 1, help: "No product picked? The one with the biggest discount is shown." },
        text("eyebrow", "Eyebrow"),
        area("title", "Heading", { help: "Leave empty to use the product name." }),
        area("body", "Text"),
        text("cta", "Button label"),
      ] },
      { title: "Countdown", fields: [...CAMPAIGN_TIMER_FIELDS] },
    ],
  },
  {
    kind: "campaign-gift-guide",
    label: "Gift guide",
    description: "Tiles that send shoppers to gift ideas, like For him or Under ₦20,000.",
    category: "Products",
    icon: "heart",
    defaults: () => ({
      copy: { title: "Gift guide", body: "" },
      settings: { columns: "4" },
      items: [],
    }),
    schema: () => [
      { fields: [
        text("title", "Heading"),
        area("body", "Text"),
        seg("columns", "Tiles per row on computers", [{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }], "4"),
        repeater({
          id: "tiles",
          label: "Tiles",
          itemName: "Tile",
          addLabel: "Add tile",
          max: 8,
          help: "No tiles yet? Your collections show here.",
          template: { label: "", link: { type: "url", value: "" }, imageUrl: "" },
          titleKeys: ["label"],
          fields: [
            { key: "label", type: "text", label: "Label", placeholder: "For him" },
            { key: "link", type: "link", label: "Opens when tapped" },
            { key: "imageUrl", type: "media", label: "Picture", accept: "image" },
          ],
        }),
      ] },
    ],
  },

  // Extras (niche)
  {
    kind: "size-finder",
    label: "Size finder",
    description: "Two quick questions that recommend a size from your size chart.",
    category: "Extras",
    icon: "target",
    defaults: () => ({
      copy: { title: "Find your size", body: "Tell us two measurements and we'll suggest a size.", label1: "Bust", label2: "Waist", unit: "cm", buttonLabel: "Find my size", footnote: "" },
      items: [
        { size: "S (8)", min1: "80", max1: "84", min2: "62", max2: "66" },
        { size: "M (10)", min1: "85", max1: "89", min2: "67", max2: "71" },
        { size: "L (12)", min1: "90", max1: "94", min2: "72", max2: "76" },
        { size: "XL (14)", min1: "95", max1: "99", min2: "77", max2: "81" },
        { size: "XXL (16)", min1: "100", max1: "105", min2: "82", max2: "87" },
      ],
    }),
    schema: () => [
      { fields: [
        text("title", "Heading"),
        area("body", "Text"),
        text("label1", "First measurement", { placeholder: "Bust" }),
        text("label2", "Second measurement", { placeholder: "Waist", help: "Leave empty to ask for one measurement only." }),
        text("unit", "Unit", { placeholder: "cm" }),
        text("buttonLabel", "Button label"),
        text("footnote", "Note under the result", { help: "Optional, e.g. Between sizes? Choose the larger one." }),
      ] },
      { title: "Size chart", fields: [
        repeater({
          id: "sizes",
          label: "Sizes",
          itemName: "Size",
          addLabel: "Add size",
          max: 12,
          help: "The starter chart is a common women's chart: replace it with your own measurements.",
          template: { size: "", min1: "", max1: "", min2: "", max2: "" },
          titleKeys: ["size"],
          fields: [
            { key: "size", type: "text", label: "Size name" },
            { key: "min1", type: "number", label: "First from", min: 0, max: 400 },
            { key: "max1", type: "number", label: "First up to", min: 0, max: 400 },
            { key: "min2", type: "number", label: "Second from", min: 0, max: 400 },
            { key: "max2", type: "number", label: "Second up to", min: 0, max: 400 },
          ],
        }),
      ] },
    ],
  },
];

export const STORE_BLOCK_KINDS = STORE_BLOCKS.map((block) => block.kind);

export function storeBlockMeta(kind: string): StoreBlockMeta | undefined {
  return STORE_BLOCKS.find((block) => block.kind === kind);
}

export function isStoreBlock(kind: string) {
  return STORE_BLOCK_KINDS.includes(kind);
}

/** A new section for a block, with its starter content (deep-copied so sections never share arrays). */
export function newStoreBlockSection(kind: string, id: string): TemplateSectionNode | null {
  const meta = storeBlockMeta(kind);
  if (!meta) return null;
  const defaults = JSON.parse(JSON.stringify(meta.defaults())) as BlockDefaults;
  return {
    id,
    kind,
    name: meta.label,
    visible: true,
    blocks: [{ id: `${id}-copy`, type: "copy", content: defaults.copy }],
    ...(defaults.settings ? { settings: defaults.settings } : {}),
    ...(defaults.items ? { items: defaults.items } : {}),
  };
}
