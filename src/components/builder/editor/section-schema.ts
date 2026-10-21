// What the inspector can change for each section, per renderer and per layout. Every field here is read by the
// storefront renderer it is listed for (BoutiqueStorefront for the 2026 themes, TemplateStorefrontSurface for the
// rest), so no control in the builder is decorative. The fields shown always match the layout the seller picked:
// a field (or a list's item field) with `when` only shows while that setting has one of the listed values.
// Pure data: loaded by tests without a bundler.

import { MENU_STYLES, MOBILE_MENU_STYLES } from "../../../lib/storefront/menu.ts";
import type { TemplateSectionNode } from "@/lib/store-templates";
import type { RendererKind } from "./editor-logic";
import { classicPdpSchemaGroups, pdpSchemaGroups } from "./pdp-schema.ts";
import { checkoutSchemaGroups, classicCheckoutSchemaGroups } from "./checkout-schema.ts";
import { storeBlockMeta } from "../../storefront/boutique/blocks/block-catalog.ts";
import { LAYOUT_ELEMENTS, LAYOUT_ROW_KIND } from "../../storefront/boutique/blocks/layout-logic.ts";
import { DEFAULT_FAQ_STYLE, FAQ_STYLE_OPTIONS } from "../../storefront/boutique/faq/faq-logic.ts";

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

/** Show a field only while a setting (or copy value) is one of `in`, or none of `notIn`. */
export interface When {
  key: string;
  scope: "settings" | "copy";
  in?: string[];
  notIn?: string[];
  fallback?: string;
}

interface FieldBase {
  id: string;
  label: string;
  help?: string;
  /** One condition, or several that must all hold. */
  when?: When | When[];
  /** Only shown for a section on one of these pages (the shop page's own settings). */
  pages?: string[];
}

/** One field inside each entry of a list (slides, questions, reviews, tiles…). Values live on section.items[i]. */
export type ItemField =
  | { key: string; type: "text" | "textarea"; label: string; placeholder?: string; help?: string; when?: When }
  /** Picture (accept "image") or picture, uploaded video or YouTube link (accept "media"). */
  | { key: string; type: "media"; label: string; accept: "image" | "media"; help?: string; when?: When }
  | { key: string; type: "select" | "segmented"; label: string; options: ChoiceOption[]; fallback: string; help?: string; when?: When }
  | { key: string; type: "color"; label: string; help?: string; when?: When }
  /** A number typed into one entry (pin position, size-chart measurement). Stored as a string. */
  | { key: string; type: "number"; label: string; min: number; max: number; placeholder?: string; help?: string; when?: When }
  /** A page, a product or a web address. */
  | { key: string; type: "link"; label: string; help?: string; when?: When };

export type SchemaField =
  | (FieldBase & { type: "text" | "textarea"; target: FieldTarget; placeholder?: string })
  | (FieldBase & { type: "number"; target: FieldTarget; min: number; max: number; fallback: number })
  /** `thumbs`: the cards picker draws a small picture of each option (FAQ styles, shop page styles). */
  | (FieldBase & { type: "segmented" | "select" | "cards"; target: FieldTarget; options: ChoiceOption[]; fallback: string; thumbs?: "faq" | "shop" | "menu" })
  | (FieldBase & { type: "toggle"; target: FieldTarget; fallback: boolean })
  | (FieldBase & { type: "color"; target: FieldTarget; placeholder?: string })
  | (FieldBase & { type: "datetime"; target: FieldTarget })
  | (FieldBase & { type: "pages"; target: FieldTarget; options: ChoiceOption[]; fallback: string[] })
  | (FieldBase & { type: "list"; target: FieldTarget; fallback: string[] })
  /** The header's menu (copy `menu`): pages, categories, products and own links, with dropdowns. Keeps `navLinks` in step. */
  | (FieldBase & { type: "menu"; target: FieldTarget; fallback: string[] })
  /** The seller's collections (2026 themes). */
  | (FieldBase & { type: "collection"; target: FieldTarget })
  /** One picture (or video) URL stored at `target`, for sections whose items hold something else (ready-made blocks). */
  | (FieldBase & { type: "image"; target: FieldTarget; accept?: "image" | "media" })
  /** Pictures stored on section.items (first `max` are used). */
  | (FieldBase & { type: "media"; max: number; accept?: "image" | "media" })
  /** Store products picked onto section.items (mappedStoreProductId). */
  | (FieldBase & { type: "products"; max?: number })
  /** Ordered on/off list: the value is the shown ids, in order. */
  | (FieldBase & { type: "order"; target: FieldTarget; options: ChoiceOption[]; fallback: string[] })
  | (FieldBase & { type: "faq" })
  | (FieldBase & { type: "imageBlocks" })
  | (FieldBase & { type: "items" })
  /** An editable list of entries on section.items: add, remove and reorder. */
  | (FieldBase & { type: "repeater"; itemName: string; addLabel: string; max: number; fields: ItemField[]; template: Record<string, unknown>; titleKeys: string[] })
  /** The store-wide "Built with Shopinbos" badge switch (saved through /api/app/store/badge, not in the section). */
  | (FieldBase & { type: "badge" })
  /** The store's logo and its version for dark backgrounds (store-wide, saved through /api/app/brand-assets). */
  | (FieldBase & { type: "logo" })
  | (FieldBase & { type: "note" })
  /** Rows, columns and grids: the column preset and each column's elements (layout-row sections). */
  | (FieldBase & { type: "layoutColumns" });

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

/** The header's menu: the WordPress-style editor plus how it looks on computers and phones. */
const MENU_FIELDS = (fallback: string[], styleFallback: string): FieldGroup[] => [
  { title: "Menu", fields: [{ id: "menu", type: "menu", label: "Menu", target: copy("menu"), fallback }] },
  { title: "Menu style", fields: [
    { id: "menuStyle", type: "cards", label: "On computers", target: setting("menuStyle"), fallback: styleFallback, thumbs: "menu", options: MENU_STYLES.map((entry) => ({ value: entry.value, label: entry.label, hint: entry.hint })) },
    { id: "mobileMenu", type: "cards", label: "On phones (the ☰ button)", target: setting("mobileMenu"), fallback: "drawer", thumbs: "menu", options: MOBILE_MENU_STYLES.map((entry) => ({ value: entry.value, label: entry.label, hint: entry.hint })) },
  ] },
  // The phone menu's items: the main menu (default) or its own list (also on Home > Navigation).
  { title: "Phone menu", fields: [
    { id: "mobileMenuSource", type: "segmented", label: "Phone menu items", target: setting("mobileMenuSource"), fallback: "main", options: [{ value: "main", label: "Use the main menu" }, { value: "custom", label: "Own phone menu" }] },
    { id: "mobileMenuItems", type: "menu", label: "Phone menu", target: copy("mobileMenuItems"), fallback: [], when: { scope: "settings", key: "mobileMenuSource", in: ["custom"], fallback: "main" } },
  ] },
];

/** The footer's links (copy `menu`, one level). Until the seller picks some, the footer shows the theme's usual links. */
const FOOTER_LINKS = (fallback: string[]): FieldGroup => ({
  title: "Footer links",
  fields: [{ id: "footerMenu", type: "menu", label: "Footer links", target: copy("menu"), fallback, help: "Until you change them, the footer shows its usual links." }],
});

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

// Guidance for the seller lives in the input, never in the saved text (shared/placeholder-copy.ts).
const FOOTER_SUMMARY_PLACEHOLDER = "e.g. Handmade leather bags from Lagos, delivered nationwide.";
const ANNOUNCEMENT_PLACEHOLDER = "e.g. Free delivery in Lagos on orders over ₦30,000";
const SHOPINBOS_BADGE: SchemaField = { id: "shopinbosBadge", type: "badge", label: "Built with Shopinbos badge", help: "A small badge at the bottom of every page of your store." };
const STORE_LOGO: SchemaField = { id: "storeLogo", type: "logo", label: "Logo", help: "On a dark header or footer, your logo for dark backgrounds shows instead." };
const FOOTER_SHOW_LOGO: SchemaField = { id: "showLogo", type: "toggle", label: "Show logo", target: setting("showLogo"), fallback: true, help: "Your logo in the footer. Without a logo, your store name shows." };

/** Announcement bar, header and footer are shared by every page (src/lib/store-templates/chrome.ts). */
const sharedNote = (what: string): SchemaField => ({ id: "shared-note", type: "note", label: `The ${what} is the same on every page: changes here apply to your whole store.` });

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

// ─── Shared list fields ──────────────────────────────────────────────────────

/** Mirrors SLIDER_HERO_LAYOUTS in src/lib/store-templates/section-content.ts (tests check they match). */
export const SLIDER_LAYOUTS = ["plain-slides", "slideshow"];

const layoutIs = (values: string[], fallback: string): When => ({ scope: "settings", key: "layout", in: values, fallback });
const layoutNot = (values: string[], fallback: string): When => ({ scope: "settings", key: "layout", notIn: values, fallback });

/** Shop page styles: SHOP_LAYOUTS in src/components/storefront/shopper/shop-browse.ts (tests check they match). */
export const SHOP_LAYOUT_OPTIONS: ChoiceOption[] = [
  { value: "classic", label: "Classic grid", hint: "Your shop as it is: search, sort and category buttons." },
  { value: "filters", label: "Filters column", hint: "Category, price and stock filters beside the products." },
  { value: "tiles", label: "Category tiles", hint: "A picture for each category above the products." },
  { value: "carousels", label: "Category rows", hint: "A row of products for each category." },
  { value: "chips", label: "Category bar", hint: "Category buttons in a bar above the products." },
];

/** Sorts a shopper can pick: SHOP_SORTS in shop-browse.ts. */
export const SHOP_SORT_OPTIONS: ChoiceOption[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
  { value: "rating", label: "Best rated" },
];

const SHOP_FILTER_OPTIONS: ChoiceOption[] = [
  { value: "category", label: "Categories" },
  { value: "price", label: "Price" },
  { value: "instock", label: "In stock" },
  { value: "sale", label: "On sale" },
  { value: "tags", label: "Tags" },
];

const PER_ROW: ChoiceOption[] = [{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }];

/**
 * The shop page style and its settings (ShopBrowser). `gate` is when the section is the shop grid; `pages` limits
 * the fields to the shop page where a renderer has no shop-grid layout of its own. Without a style picked the
 * section is the "Classic grid" it always was.
 */
function shopBrowseFields(gate: When[], pages?: string[]): SchemaField[] {
  const style = (values: string[]): When[] => [...gate, { scope: "settings", key: "shopLayout", in: values, fallback: "classic" }];
  const browse = ["filters", "tiles", "carousels", "chips"];
  const on = pages ? { pages } : {};
  return [
    { id: "shopLayout", type: "cards", label: "Shop page style", target: setting("shopLayout"), fallback: "classic", thumbs: "shop", options: SHOP_LAYOUT_OPTIONS, when: gate, ...on },
    { id: "columns-filters", type: "segmented", label: "Products per row on computers", target: setting("columns"), fallback: "3", options: PER_ROW, when: style(["filters"]), help: "Phones always show two a row.", ...on },
    { id: "columns-browse", type: "segmented", label: "Products per row on computers", target: setting("columns"), fallback: "4", options: PER_ROW, when: style(["tiles", "carousels", "chips"]), help: "Phones always show two a row.", ...on },
    { id: "shopFilters", type: "pages", label: "Filters to show", target: setting("shopFilters"), fallback: ["category", "price", "instock", "sale"], options: SHOP_FILTER_OPTIONS, when: style(["filters"]), help: "On phones, filters open from a Filters button.", ...on },
    { id: "defaultSort", type: "select", label: "Sort products by", target: setting("defaultSort"), fallback: "featured", options: SHOP_SORT_OPTIONS, when: style(browse), help: "Shoppers can pick another order.", ...on },
    { id: "showCounts", type: "toggle", label: "Show how many products each category has", target: setting("showCounts"), fallback: true, when: style(browse), ...on },
    { id: "carouselRows", type: "number", label: "Categories with a row", target: setting("carouselRows"), min: 1, max: 12, fallback: 6, when: style(["carousels"]), help: "Categories with the most products come first.", ...on },
    { id: "carouselProducts", type: "number", label: "Products in each row", target: setting("carouselProducts"), min: 4, max: 16, fallback: 8, when: style(["carousels"]), ...on },
    { id: "pageSize-browse", type: "select", label: "Products shown at first", target: setting("pageSize"), fallback: "24", when: style(browse), options: [
      ...[12, 24, 36, 48].map((size) => ({ value: String(size), label: `${size}, then a Show more button` })),
      { value: "all", label: "All of them" },
    ], ...on },
    ...(pages ? [{ id: "shop-style-note", type: "note", label: "Your page's own filter bar and category sections still show above. Hide them if this style already has what you need.", when: style(browse), pages } satisfies SchemaField] : []),
  ];
}

const TEXT_TONES: ChoiceOption[] = [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }];
const TEXT_POSITIONS: ChoiceOption[] = [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }];

/** The hero's slide list and timing. Every slide carries its own picture or video, words and button. */
function slideFields(fallback: string): SchemaField[] {
  const sliding = layoutIs(SLIDER_LAYOUTS, fallback);
  return [
    {
      id: "slides",
      type: "repeater",
      label: "Slides",
      itemName: "Slide",
      addLabel: "Add slide",
      max: 6,
      help: "Each slide has its own picture or video, words and button. Use the arrows to change the order.",
      template: { imageUrl: "", heading: "", text: "", buttonLabel: "Shop now", link: { type: "page", value: "products" }, textTone: "light", textPosition: "left" },
      titleKeys: ["heading"],
      fields: [
        { key: "media", type: "media", label: "Picture or video", accept: "media", help: "Upload a photo or video, or paste a YouTube link." },
        { key: "heading", type: "text", label: "Heading" },
        { key: "text", type: "textarea", label: "Text" },
        { key: "buttonLabel", type: "text", label: "Button label", help: "Leave empty for no button." },
        { key: "link", type: "link", label: "Button opens" },
        { key: "textTone", type: "segmented", label: "Text colour", options: TEXT_TONES, fallback: "light", help: "Light text suits dark pictures." },
        { key: "textPosition", type: "segmented", label: "Text position", options: TEXT_POSITIONS, fallback: "left" },
      ],
      when: sliding,
    },
    { id: "slideAutoplay", type: "toggle", label: "Change slides by themselves", target: setting("slideAutoplay"), fallback: true, when: sliding, help: "Stops while a shopper points at or taps the banner, and for shoppers who turn off motion." },
    { id: "slideSeconds", type: "number", label: "Seconds per slide", target: setting("slideSeconds"), min: 3, max: 15, fallback: 6, when: [sliding, { scope: "settings", key: "slideAutoplay", notIn: ["false"], fallback: "true" }] },
  ];
}

const CARD_STYLES: ChoiceOption[] = [
  { value: "plain", label: "Plain" },
  { value: "soft", label: "Soft" },
  { value: "outline", label: "Outline" },
  { value: "feature", label: "Dark" },
];

const IMAGE_SIDE: ChoiceOption[] = [{ value: "left", label: "Picture left" }, { value: "right", label: "Picture right" }];

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
  // Industry themes: their banner is only offered on their own theme.
  ewa: "ewa-arch",
  suku: "suku-crown",
  asoebi: "asoebi-collage",
  agbada: "agbada-tailored",
  ileke: "ileke-frame",
  ounje: "ounje-menu",
  chinchin: "chinchin-sweet",
  oja: "oja-market",
  omo: "omo-play",
  iwe: "iwe-shelf",
  owambe: "owambe-party",
  danfo: "danfo-garage",
  turare: "turare-glow",
  oko: "oko-field",
  aaro: "aaro-banner",
  highlife: "highlife-ticker",
  oba: "oba-cinema",
  gbedu: "gbedu-impact",
  omalicha: "omalicha-card",
  zuma: "zuma-collage",
  oku: "oku-diagonal",
  ihe: "ihe-gallery",
  kasuwa: "kasuwa-mosaic",
  nkata: "nkata-frame",
  uwa: "uwa-cover",
  sarauniya: "sarauniya-duo",
  zinariya: "zinariya-arch",
  irawo: "irawo-product",
  asa: "asa-stamp",
  mmiri: "mmiri-wave",
  uzo: "uzo-sticky",
  rawa: "rawa-fan",
  fitila: "fitila-room",
  oso: "oso-bento",
  shakara: "shakara-poster",
};

const HERO_LAYOUTS: ChoiceOption[] = [
  { value: "breeze-banner", label: "Wide banner", hint: "Photo with the heading at the bottom." },
  { value: "adire-banner", label: "Editorial banner", hint: "Large photo, refined heading." },
  { value: "noir-center", label: "Centred", hint: "Heading in the middle of a dark photo." },
  { value: "plain-slides", label: "Slides", hint: "Several slides, each with its own photo or video, words and button." },
  { value: "pantry-split", label: "Split", hint: "Words on one side, photo on the other." },
  { value: "ile-calm", label: "Calm", hint: "Quiet layout with lots of space." },
  { value: "plug-spotlight", label: "Spotlight", hint: "One product photo on a plain background." },
  { value: "stride-loud", label: "Loud", hint: "Very big heading over the photo." },
  { value: "aaro-banner", label: "Image banner", hint: "Full-width photo, heading and button in the middle." },
  { value: "omalicha-card", label: "Floating card", hint: "Rounded photo with the words in a white card over it." },
  { value: "nkata-frame", label: "Framed box", hint: "Full-width photo with the words in a framed box in the middle." },
];

/** Hero layouts that use more than one picture (the rest use the first). */
const HERO_PICTURE_COUNT: Record<string, number> = { "asoebi-collage": 3, "iwe-shelf": 4, "zuma-collage": 2, "ihe-gallery": 3, "sarauniya-duo": 2, "uzo-sticky": 3, "rawa-fan": 3, "oso-bento": 3 };
/** Layouts that don't show the eyebrow. */
const HERO_NO_EYEBROW = ["breeze-banner"];

export function heroDefaultLayout(renderer: RendererKind, themeId: string) {
  return renderer === "boutique" ? HERO_LAYOUT_BY_THEME[themeId] ?? "breeze-banner" : "split-editorial";
}

function heroLayoutOptions(themeId: string): ChoiceOption[] {
  const own = HERO_LAYOUT_BY_THEME[themeId];
  if (!own || HERO_LAYOUTS.some((option) => option.value === own)) return HERO_LAYOUTS;
  return [{ value: own, label: "This theme's banner", hint: "The banner designed for this theme." }, ...HERO_LAYOUTS];
}

function boutiqueSchema(kind: string, themeId: string): SectionSchema {
  const heroDefault = heroDefaultLayout("boutique", themeId);
  const plain = (settings: FieldGroup[], addable: SectionSchema["addable"] = []): SectionSchema => ({ settings, style: [THEME_STYLE_NOTE], addable });
  // Ready-made blocks carry their own fields (blocks/block-catalog.ts).
  const block = storeBlockMeta(kind);
  if (block) return plain(block.schema(themeId));
  switch (kind) {
    case LAYOUT_ROW_KIND:
      return plain([
        { fields: [{ id: "columns", type: "layoutColumns", label: "Columns" }] },
        { title: "Row layout", fields: [
          { id: "gap", type: "segmented", label: "Space between columns", target: setting("gap"), fallback: "medium", options: [{ value: "none", label: "None" }, { value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }] },
          { id: "align", type: "select", label: "Line up columns", target: setting("align"), fallback: "top", options: [{ value: "top", label: "Top" }, { value: "center", label: "Middle" }, { value: "bottom", label: "Bottom" }, { value: "stretch", label: "Same height" }] },
          { id: "stackOnMobile", type: "toggle", label: "Stack columns on phones", target: setting("stackOnMobile"), fallback: true, help: "Off keeps two columns side by side on phones." },
          { id: "background", type: "select", label: "Background", target: setting("background"), fallback: "none", options: [{ value: "none", label: "None" }, { value: "paper", label: "Page colour" }, { value: "card", label: "Card colour" }, { value: "accent", label: "Accent tint" }, { value: "dark", label: "Dark" }] },
          { id: "padding", type: "segmented", label: "Space above and below", target: setting("padding"), fallback: "medium", options: [{ value: "none", label: "None" }, { value: "small", label: "Small" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }] },
        ] },
      ], LAYOUT_ELEMENTS.map((element) => ({ id: `element:${element.type}`, label: element.label })));
    case "announcement-bar":
      return plain([{ fields: [area("text", "Message", { placeholder: ANNOUNCEMENT_PLACEHOLDER, help: "Leave empty to show your free-delivery and pay-on-delivery settings automatically." }), sharedNote("announcement bar")] }]);
    case "header":
      return plain([
        { fields: [
          sharedNote("header"),
          text("logoText", "Shop name", { help: "Leave empty to use your store name." }),
          text("cartLabel", "Bag label", { placeholder: "My bag" }),
          { id: "layout", type: "segmented", label: "Logo position", target: setting("layout"), fallback: themeId === "plain" ? "centered" : "split", options: [{ value: "split", label: "Left" }, { value: "centered", label: "Centre" }, { value: "bold", label: "Bold" }] },
        ] },
        ...MENU_FIELDS(["home", "products", "about", "contact"], "classic"),
        { fields: [STORE_LOGO] },
      ]);
    case "footer":
      return plain([
        { fields: [sharedNote("footer"), area("summary", "About text", { placeholder: FOOTER_SUMMARY_PLACEHOLDER, help: "A line about your store. Contact, delivery and payment details come from your settings." })] },
        FOOTER_LINKS(["products", "faq", "about", "contact"]),
        { fields: [FOOTER_SHOW_LOGO, STORE_LOGO] },
        { fields: [SHOPINBOS_BADGE] },
      ]);
    case "hero-split": {
      const single = Object.keys(HERO_PICTURE_COUNT);
      const singleLayouts = [...SLIDER_LAYOUTS, ...single];
      return plain([
        { fields: [{ id: "layout", type: "cards", label: "Layout", target: setting("layout"), fallback: heroDefault, options: heroLayoutOptions(themeId) }] },
        { fields: [
          { id: "media", type: "media", label: "Image", max: 1, help: "No image yet? A product photo is used.", when: layoutNot(singleLayouts, heroDefault) },
          ...single.map((layout): SchemaField => ({ id: `media-${layout}`, type: "media", label: "Images", max: HERO_PICTURE_COUNT[layout]!, help: "Empty spaces are filled with your product photos.", when: layoutIs([layout], heroDefault) })),
          ...slideFields(heroDefault),
        ] },
        { title: "Content", fields: [
          text("eyebrow", "Eyebrow", { when: layoutNot([...HERO_NO_EYEBROW, ...SLIDER_LAYOUTS], heroDefault) }),
          area("title", "Heading", { when: layoutNot(SLIDER_LAYOUTS, heroDefault) }),
          area("body", "Text", { when: layoutNot(SLIDER_LAYOUTS, heroDefault) }),
          text("primaryCta", "Button label", { when: layoutNot(SLIDER_LAYOUTS, heroDefault) }),
          { id: "primaryButtonAction", type: "select", label: "Button opens", target: setting("primaryButtonAction"), fallback: "products", options: BUTTON_TARGETS, when: layoutNot(SLIDER_LAYOUTS, heroDefault) },
          { id: "slides-note", type: "note", label: "Each slide has its own heading, text and button above.", when: layoutIs(SLIDER_LAYOUTS, heroDefault) },
        ] },
      ], [{ id: "image", label: "Image" }]);
    }
    case "payday-countdown":
      return plain([{ fields: PAYDAY_COPY }, { title: "Timing", fields: PAYDAY_FIELDS }]);
    case "featured-products": {
      const layoutFallback = themeId === "ounje" ? "menu" : "carousel";
      // The full shop grid shows every product, so the product choices only apply to the other layouts.
      const source = (values: string[]): When[] => [layoutNot(["grid"], layoutFallback), { scope: "settings", key: "source", in: values, fallback: "best-sellers" }];
      // The classic shop grid's own settings; the other shop page styles have theirs (shopBrowseFields).
      const classicShop: When[] = [layoutIs(["grid"], layoutFallback), { scope: "settings", key: "shopLayout", in: ["classic"], fallback: "classic" }];
      const shopView = (values: string[]): When[] => [...classicShop, { scope: "settings", key: "shopView", in: values, fallback: "grid" }];
      return plain([
        { fields: [
          { id: "layout", type: "select", label: "Layout", target: setting("layout"), fallback: layoutFallback, options: [
            { value: "carousel", label: "Carousel" },
            { value: "tiles", label: "Tiles" },
            { value: "dense", label: "Compact grid" },
            { value: "menu", label: "Menu list" },
            { value: "spotlight", label: "Spotlight (one big, four small)" },
            { value: "lookbook", label: "Lookbook (big alternating rows)" },
            { value: "grid", label: "Full shop grid" },
          ] },
          text("title", "Heading"),
          text("cta", "Link label", { placeholder: "Shop all", when: layoutNot(["grid"], layoutFallback) }),
          { id: "grid-note", type: "note", label: "The full shop grid shows every product with search, sorting and filters.", when: layoutIs(["grid"], layoutFallback) },
        ] },
        { title: "Shop layout", fields: [
          ...shopBrowseFields([layoutIs(["grid"], layoutFallback)]),
          { id: "shopView", type: "cards", label: "Products as", target: setting("shopView"), fallback: "grid", when: classicShop, options: [
            { value: "grid", label: "Grid", hint: "Product cards in rows." },
            { value: "list", label: "List", hint: "Photo, name, description and price in a row." },
            { value: "large", label: "Large cards", hint: "Two big cards a row, editorial." },
          ] },
          { id: "columns", type: "segmented", label: "Products per row on computers", target: setting("columns"), fallback: "auto", when: shopView(["grid"]), options: [
            { value: "auto", label: "Theme" }, { value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }, { value: "5", label: "5" },
          ], help: "Phones always show two a row." },
          { id: "filterPlacement", type: "segmented", label: "Search and filters", target: setting("filterPlacement"), fallback: "top", when: classicShop, options: [
            { value: "top", label: "Above" }, { value: "sidebar", label: "Side column" }, { value: "none", label: "Hidden" },
          ], help: "On phones the side column sits above the products." },
          { id: "pageSize", type: "select", label: "Products shown at first", target: setting("pageSize"), fallback: "all", when: classicShop, options: [
            { value: "all", label: "All of them" },
            ...[8, 12, 16, 24, 36, 48].map((size) => ({ value: String(size), label: `${size}, then a Show more button` })),
          ] },
        ] },
        { title: "Products", fields: [
          { id: "source", type: "select", label: "Show", target: setting("source"), fallback: "best-sellers", when: layoutNot(["grid"], layoutFallback), options: [
            { value: "best-sellers", label: "Best sellers" },
            { value: "collection", label: "One collection" },
            { value: "picked", label: "Only products I pick" },
          ] },
          { id: "collectionId", type: "collection", label: "Collection", target: setting("collectionId"), when: source(["collection"]) },
          { id: "products", type: "products", label: "Show these first", help: "Products you pick show first, then your best sellers.", when: source(["best-sellers"]) },
          { id: "products-picked", type: "products", label: "Products to show", help: "Only these show, in this order.", when: source(["picked"]) },
          // Same setting; the compact grid starts at 12, the other layouts at 8 (what the renderer shows unset).
          { id: "limit", type: "number", label: "How many products", target: setting("limit"), min: 2, max: 16, fallback: 8, when: layoutNot(["grid", "dense"], layoutFallback), help: "Only as many as your store has are shown." },
          { id: "limit-dense", type: "number", label: "How many products", target: setting("limit"), min: 2, max: 24, fallback: 12, when: layoutIs(["dense"], layoutFallback), help: "Only as many as your store has are shown." },
        ] },
        { title: "Product cards", fields: [
          { id: "showRating", type: "toggle", label: "Star rating", target: setting("showRating"), fallback: false, when: layoutNot(["menu"], layoutFallback), help: "Only products with real reviews show stars." },
          { id: "quickAdd", type: "toggle", label: "Add to bag button", target: setting("quickAdd"), fallback: false, when: layoutNot(["menu"], layoutFallback), help: "Products with sizes or colours open their page to choose one." },
          { id: "hoverImage", type: "toggle", label: "Second photo on hover", target: setting("hoverImage"), fallback: false, when: [layoutNot(["menu"], layoutFallback), { scope: "settings", key: "shopView", notIn: ["list"], fallback: "grid" }], help: "On computers, pointing at a product shows its next photo." },
        ] },
      ], [{ id: "product", label: "Product" }]);
    }
    case "category-grid":
    case "category-list":
      return plain([{ fields: [
        text("title", "Heading"),
        { id: "layout", type: "select", label: "Layout", target: setting("layout"), fallback: themeId === "plug" ? "chips" : "boutique-tiles", options: [{ value: "boutique-tiles", label: "Tiles" }, { value: "boutique-circles", label: "Circles" }, { value: "chips", label: "Chips" }, { value: "boutique-stack", label: "Banners" }, { value: "boutique-mosaic", label: "Mosaic" }] },
        { id: "note", type: "note", label: "Tiles come from your collections, or your product categories when you have no collections." },
      ] }]);
    case "testimonials":
      return plain([{ fields: [
        text("title", "Heading"),
        { id: "layout", type: "segmented", label: "Layout", target: setting("layout"), fallback: "grid", options: [{ value: "grid", label: "Grid" }, { value: "carousel", label: "Carousel" }] },
        { id: "limit", type: "number", label: "How many reviews", target: setting("limit"), min: 1, max: 6, fallback: 3, help: "Your newest good reviews show, up to six." },
        { id: "note", type: "note", label: "Only real reviews from customers who ordered are shown. The section stays hidden until you have some." },
      ] }]);
    case "story-split":
    case "about-section": {
      const storyFallback = themeId === "adire" || themeId === "ile" ? "editorial" : "boutique";
      return plain([
        { fields: [
          { id: "layout", type: "cards", label: "Layout", target: setting("layout"), fallback: storyFallback, options: [
            { value: "boutique", label: "Side by side", hint: "Picture and words share the width." },
            { value: "editorial", label: "Editorial", hint: "Tall picture, large heading." },
            { value: "banner", label: "Wide picture", hint: "Picture across the page, words below." },
            { value: "centered", label: "Words only", hint: "A centred statement, no picture." },
            { value: "overlap", label: "Overlap", hint: "Wide picture with the words on a card over its edge." },
          ] },
          { id: "imagePosition", type: "segmented", label: "Picture side", target: setting("imagePosition"), fallback: "left", options: IMAGE_SIDE, help: "On phones the picture is always on top.", when: layoutIs(["boutique", "editorial", "overlap"], storyFallback) },
          { id: "media", type: "media", label: "Image", max: 1, help: "No image yet? A product photo is used.", when: layoutNot(["centered"], storyFallback) },
        ] },
        { title: "Content", fields: [text("eyebrow", "Eyebrow"), area("title", "Heading"), area("body", "Text", { help: "Leave empty to use your store description." }), text("primaryCta", "Button label")] },
      ]);
    }
    case "faq":
      return plain([
        { fields: [
          { id: "layout", type: "segmented", label: "Layout", target: setting("layout"), fallback: "accordion", options: [{ value: "accordion", label: "Accordion" }, { value: "two-column", label: "Two columns" }, { value: "cards", label: "Open cards" }] },
          { id: "faqStyle", type: "cards", label: "FAQ style", target: setting("faqStyle"), fallback: DEFAULT_FAQ_STYLE, options: FAQ_STYLE_OPTIONS, thumbs: "faq", help: "Your product pages use the same style unless you pick another in the Product page settings.", when: { scope: "settings", key: "layout", notIn: ["cards"], fallback: "accordion" } },
          text("title", "Heading"),
          { id: "faq", type: "faq", label: "Questions", help: "Blank delivery and payment answers are filled from your settings." },
        ] },
        { title: "Search", fields: [
          { id: "searchable", type: "toggle", label: "Search box", target: setting("searchable"), fallback: false, help: "Lets shoppers type to find an answer. Handy for long lists." },
          text("searchPlaceholder", "Search hint", { placeholder: "Search questions", when: { scope: "settings", key: "searchable", in: ["true"], fallback: "false" } }),
        ] },
      ], [{ id: "question", label: "Question" }]);
    case "newsletter":
      return plain([{ fields: [text("title", "Heading"), area("body", "Text"), text("placeholder", "Field hint"), text("buttonLabel", "Button label")] }]);
    case "contact-form":
      return plain([{ fields: [
        { id: "layout", type: "segmented", label: "Layout", target: setting("layout"), fallback: "centered", options: [{ value: "centered", label: "Simple" }, { value: "split", label: "Side by side" }, { value: "card", label: "Card" }] },
        text("title", "Heading"), area("body", "Text"), text("buttonLabel", "Button label"),
        { id: "note", type: "note", label: "A WhatsApp button shows when you add a WhatsApp number in Chat settings." },
      ] }]);
    case "wishlist-grid":
    case "cart-summary":
      return plain([{ fields: [text("title", "Heading")] }]);
    case "checkout-form":
      return plain(checkoutSchemaGroups(themeId));
    case "product-detail":
      return plain(pdpSchemaGroups(themeId));
    default:
      return plain([{ fields: [text("title", "Heading"), area("body", "Text")] }]);
  }
}

// ─── Other templates (TemplateStorefrontSurface) ─────────────────────────────

export const SECTION_VARIATIONS: Record<string, ChoiceOption[]> = {
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

export function buttonCopyKey(kind: string) {
  if (kind === "hero-split") return "primaryCta";
  if (kind === "newsletter" || kind === "contact-form") return "buttonLabel";
  return "cta";
}

const CLASSIC_ADDABLE: Record<string, Array<{ id: string; label: string }>> = {
  "story-split": [{ id: "text-point", label: "Text point" }],
  "text-columns": [{ id: "text-point", label: "Text point" }],
  "category-list": [{ id: "image-tile", label: "Image tile" }],
  "category-grid": [{ id: "image-tile", label: "Image tile" }],
  "lookbook-grid": [{ id: "image-tile", label: "Image tile" }],
  "cart-summary": [{ id: "product-card", label: "Product card" }],
  "wishlist-grid": [{ id: "product-card", label: "Product card" }],
  testimonials: [{ id: "review", label: "Review" }],
  faq: [{ id: "faq", label: "Question" }],
  "filters-toolbar": [{ id: "filter", label: "Filter" }],
  "product-detail": [{ id: "option", label: "Product option" }],
  "contact-form": [{ id: "whatsapp-cta", label: "WhatsApp button" }],
  footer: [{ id: "whatsapp-cta", label: "WhatsApp button" }],
};

/** A list of short entries with a title and a line of text (trust badges, delivery steps, payment methods…). */
function labelValueList(id: string, label: string, itemName: string, extra: ItemField[] = [], valueWhen?: When): SchemaField {
  return {
    id,
    type: "repeater",
    label,
    itemName,
    addLabel: `Add ${itemName.toLowerCase()}`,
    max: 8,
    template: { label: `New ${itemName.toLowerCase()}`, value: "" },
    titleKeys: ["label"],
    fields: [{ key: "label", type: "text", label: "Title" }, { key: "value", type: "text", label: "Detail", when: valueWhen }, ...extra],
  };
}

const titleBodyList = (id: string, label: string, itemName: string, max: number, extra: ItemField[] = []): SchemaField => ({
  id,
  type: "repeater",
  label,
  itemName,
  addLabel: `Add ${itemName.toLowerCase()}`,
  max,
  template: { title: `New ${itemName.toLowerCase()}`, body: "" },
  titleKeys: ["title", "label"],
  fields: [{ key: "title", type: "text", label: "Title" }, { key: "body", type: "textarea", label: "Text" }, ...extra],
});

/** Content and lists for each older-template section, per layout. Layout comes first so the rest adapts to it. */
function classicContent(kind: string, fallback: string): FieldGroup[] {
  const on = (values: string[]) => layoutIs(values, fallback);
  const off = (values: string[]) => layoutNot(values, fallback);
  const cardStyle = (when?: When): ItemField => ({ key: "variant", type: "select", label: "Card style", options: CARD_STYLES, fallback: "plain", when });
  const heading = (extra: Partial<FieldBase> = {}) => area("title", "Heading", extra);
  switch (kind) {
    case "announcement-bar":
      return [{ fields: [area("text", "Message", { placeholder: ANNOUNCEMENT_PLACEHOLDER, help: "Leave empty to show your free-delivery and pay-on-delivery settings automatically." }), sharedNote("announcement bar")] }];
    case "header":
      return [{ title: "Header", fields: [
        sharedNote("header"),
        text("logoText", "Logo text"),
        text("cartLabel", "Cart label"),
        { id: "categoryNavLayout", type: "select", label: "Category menu", target: setting("categoryNavLayout"), fallback: "simple", options: [
          { value: "simple", label: "Simple menu" }, { value: "bar", label: "Category bar" }, { value: "mega", label: "Mega menu" }, { value: "drawer", label: "Category drawer" },
        ] },
        { id: "search", type: "toggle", label: "Search", target: setting("search"), fallback: true },
        { id: "wishlist", type: "toggle", label: "Wishlist", target: setting("wishlist"), fallback: true },
        { id: "cart", type: "toggle", label: "Cart", target: setting("cart"), fallback: true },
        { id: "utilityLinks", type: "pages", label: "Extra links after the menu", target: copy("utilityLinks"), fallback: ["categories", "wishlist", "cart"], options: [{ value: "categories", label: "Categories" }, { value: "wishlist", label: "Wishlist" }, { value: "cart", label: "Cart" }] },
      ] }, ...MENU_FIELDS(["home", "products", "about", "blog", "faq", "contact"], "caps"), { fields: [STORE_LOGO] }];
    case "footer":
      return [{ title: "Footer", fields: [
        sharedNote("footer"),
        area("summary", "Footer summary", { placeholder: FOOTER_SUMMARY_PLACEHOLDER, help: "Leave empty to show your store description." }),
        { id: "showPayments", type: "toggle", label: "Show payment methods", target: setting("showPayments"), fallback: true },
        { id: "showDelivery", type: "toggle", label: "Show delivery note", target: setting("showDelivery"), fallback: true },
        text("email", "Contact email"),
        text("phone", "Contact phone"),
        text("whatsappLabel", "WhatsApp button label"),
      ] }, FOOTER_LINKS(["home", "products", "about", "blog", "faq", "contact"]), { fields: [FOOTER_SHOW_LOGO, STORE_LOGO] }, { fields: [SHOPINBOS_BADGE] }];
    case "hero-split": {
      const mosaic = ["editorial-mosaic", "carousel-cards"];
      const split = ["split-editorial", "full-bleed", "text-overlay"];
      const noSecond = [...SLIDER_LAYOUTS, "minimal-center", "category-portal"];
      return [
        { fields: slideFields(fallback) },
        { title: "Content", fields: [
          text("eyebrow", "Eyebrow", { when: off(SLIDER_LAYOUTS) }),
          heading({ when: off(SLIDER_LAYOUTS) }),
          area("body", "Text", { when: off(SLIDER_LAYOUTS) }),
          text("primaryCta", "Button label", { when: off([...SLIDER_LAYOUTS, "category-portal"]) }),
          text("secondaryCta", "Second button label", { when: off(noSecond) }),
        ] },
        { title: "Pictures", fields: [
          { id: "media-video", type: "media", label: "Video or picture", max: 1, accept: "media", help: "Upload a video or photo, or paste a YouTube link.", when: on(["video-background", "video-split"]) },
          { id: "products-spotlight", type: "products", label: "Product to feature", max: 1, help: "No product picked? Your first product is shown.", when: on(["product-spotlight"]) },
          { id: "imageBlocks", type: "imageBlocks", label: "Main picture", when: on([...split, ...mosaic]) },
          {
            id: "tiles", type: "repeater", label: "Tiles", itemName: "Tile", addLabel: "Add tile", max: 4, when: on(mosaic),
            help: "The first picture is the big one (unless a main picture is set above). Tiles 2 to 4 sit beside it.",
            template: { title: "New tile", imageUrl: "" }, titleKeys: ["title"],
            fields: [{ key: "media", type: "media", label: "Picture", accept: "media" }, { key: "title", type: "text", label: "Label" }],
          },
          {
            // The text-over-picture banner shows one picture (the main one, else the first card's).
            id: "cards", type: "repeater", label: "Picture cards", itemName: "Card", addLabel: "Add card", max: 2, when: on(["split-editorial", "full-bleed"]),
            help: "The first card's picture is also the big picture when no main picture is set.",
            template: { title: "New card", subtitle: "", imageUrl: "" }, titleKeys: ["title"],
            fields: [{ key: "media", type: "media", label: "Picture", accept: "media" }, { key: "title", type: "text", label: "Title" }, { key: "subtitle", type: "text", label: "Text" }],
          },
          {
            id: "feature", type: "repeater", label: "Picture", itemName: "Picture", addLabel: "Add picture", max: 1, when: on(["beauty-split", "text-overlay"]),
            template: { title: "", imageUrl: "" }, titleKeys: ["title"],
            fields: [{ key: "media", type: "media", label: "Picture", accept: "media" }, { key: "title", type: "text", label: "Card label" }],
          },
          { id: "portal-note", type: "note", label: "The cards come from your product categories.", when: on(["category-portal"]) },
        ] },
        { title: "Buttons", fields: [
          { id: "primaryButtonAction", type: "select", label: "Main button opens", target: setting("primaryButtonAction"), fallback: "products", options: BUTTON_ACTIONS, when: off([...SLIDER_LAYOUTS, "category-portal"]) },
          { id: "primaryButtonUrl", type: "text", label: "Link", target: setting("primaryButtonUrl"), placeholder: "https://", when: [off([...SLIDER_LAYOUTS, "category-portal"]), { scope: "settings", key: "primaryButtonAction", in: ["external"] }] },
          { id: "primaryButtonVariant", type: "select", label: "Main button style", target: setting("primaryButtonVariant"), fallback: "primary", options: BUTTON_VARIANTS, when: off(["category-portal"]) },
          { id: "secondaryButtonAction", type: "select", label: "Second button opens", target: setting("secondaryButtonAction"), fallback: "about", options: BUTTON_ACTIONS, when: off(noSecond) },
          { id: "secondaryButtonUrl", type: "text", label: "Second link", target: setting("secondaryButtonUrl"), placeholder: "https://", when: [off(noSecond), { scope: "settings", key: "secondaryButtonAction", in: ["external"] }] },
          { id: "secondaryButtonVariant", type: "select", label: "Second button style", target: setting("secondaryButtonVariant"), fallback: "outline", options: BUTTON_VARIANTS, when: off(noSecond) },
          { id: "buttonSize", type: "segmented", label: "Size", target: setting("buttonSize"), fallback: "lg", options: [{ value: "sm", label: "S" }, { value: "md", label: "M" }, { value: "lg", label: "L" }, { value: "xl", label: "XL" }], when: off([...mosaic, "category-portal"]) },
          { id: "buttonShape", type: "segmented", label: "Shape", target: setting("buttonShape"), fallback: "pill", options: [{ value: "square", label: "Square" }, { value: "rounded", label: "Rounded" }, { value: "pill", label: "Pill" }], when: off([...mosaic, "category-portal"]) },
          { id: "stickyMobileCta", type: "toggle", label: "Sticky button on phones", target: setting("stickyMobileCta"), fallback: false },
        ] },
      ];
    }
    case "trust-strip":
      return [{ fields: [labelValueList("items", "Badges", "Badge", [
        { key: "icon", type: "select", label: "Icon", options: [{ value: "truck", label: "Delivery" }, { value: "card", label: "Payment" }, { value: "package", label: "Parcel" }], fallback: "truck", when: on(["icon-row"]) },
        cardStyle(on(["metric-cards", "compact-badges"])),
      ], off(["compact-badges"]))] }];
    case "category-list":
    case "category-grid":
    case "lookbook-grid": {
      const lookbook = kind === "lookbook-grid";
      return [
        { fields: [heading(), area("body", "Text")] },
        { fields: [
          {
            id: "items", type: "repeater", label: lookbook ? "Pictures" : "Tiles", itemName: lookbook ? "Picture" : "Tile", addLabel: lookbook ? "Add picture" : "Add tile", max: 12,
            help: lookbook ? undefined : "When your products have categories, tiles show them by name. Pictures here replace the category photos, in order.",
            template: { title: lookbook ? "New picture" : "New tile", subtitle: "", imageUrl: "" }, titleKeys: ["title", "label"],
            fields: [
              { key: "media", type: "media", label: "Picture", accept: "image", when: off(["icon-row"]) },
              { key: "title", type: "text", label: "Title" },
              { key: "subtitle", type: "text", label: "Text", when: off(["circle-icons"]) },
              { key: "color", type: "color", label: "Colour behind the picture" },
            ],
          },
        ] },
      ];
    }
    case "featured-products":
      return [
        { fields: [heading(), area("body", "Text")] },
        { title: "Products", fields: [
          { id: "products", type: "products", label: "Products to show", help: "Pick products in the order you want. With none picked, your newest products show." },
          { id: "limit", type: "number", label: "How many products", target: setting("limit"), min: 1, max: 24, fallback: 8 },
          { id: "columns", type: "segmented", label: "Products per row on computers", target: setting("columns"), fallback: "3", options: [{ value: "2", label: "2" }, { value: "3", label: "3" }, { value: "4", label: "4" }], when: [on(["grid", "premium-product-cards", "beauty-rounded"]), { scope: "settings", key: "shopLayout", in: ["classic"], fallback: "classic" }] },
        ] },
        // On the shop page the section can be one of the shop page styles instead (ShopBrowser).
        { title: "Shop layout", fields: shopBrowseFields([], ["products"]) },
      ];
    case "story-split":
      return [
        { fields: [
          text("eyebrow", "Eyebrow"), heading(), area("body", "Text"),
          { id: "imagePosition", type: "segmented", label: "Picture side", target: setting("imagePosition"), fallback: "right", options: IMAGE_SIDE, help: "On phones the picture is always below the words.", when: on(["image-collage", "text-first"]) },
          { id: "imagePosition-feature", type: "segmented", label: "Picture side", target: setting("imagePosition"), fallback: "left", options: IMAGE_SIDE, help: "On phones the picture is always above the words.", when: on(["ingredients-feature"]) },
          { id: "photos-note", type: "note", label: "The pictures come from your product photos.", when: on(["image-collage", "text-first"]) },
        ] },
        { fields: [titleBodyList("items", "Points", "Point", 4, [
          { key: "media", type: "media", label: "Picture", accept: "image", help: "The first point's picture shows large.", when: on(["ingredients-feature"]) },
          cardStyle(on(["image-collage", "text-first", "ingredients-feature"])),
        ])] },
      ];
    case "text-columns":
      return [
        { fields: [
          text("eyebrow", "Eyebrow"), heading(), area("body", "Text"),
          { id: "imagePosition", type: "segmented", label: "Picture side", target: setting("imagePosition"), fallback: "left", options: IMAGE_SIDE, help: "On phones the picture is always above the words.", when: on(["ingredients-feature"]) },
        ] },
        { fields: [titleBodyList("items", "Columns", "Column", 6, [
          { key: "media", type: "media", label: "Picture", accept: "image", help: "The first column's picture shows large.", when: on(["ingredients-feature"]) },
          cardStyle(on(["cards", "ingredients-feature"])),
        ])] },
      ];
    case "testimonials":
      return [
        { fields: [text("eyebrow", "Eyebrow", { when: off(["featured"]) }), heading({ when: off(["featured"]) })] },
        { fields: [{
          id: "items", type: "repeater", label: "Reviews", itemName: "Review", addLabel: "Add review", max: 12,
          help: "Only add reviews real customers gave you.",
          template: { quote: "", person: "" }, titleKeys: ["person", "quote"],
          fields: [{ key: "quote", type: "textarea", label: "What they said" }, { key: "person", type: "text", label: "Customer name" }, cardStyle()],
        }] },
      ];
    case "faq":
      return [
        { fields: [
          heading(),
          { id: "faqStyle", type: "cards", label: "FAQ style", target: setting("faqStyle"), fallback: "", options: [{ value: "", label: "Template style", hint: "The look of the layout you picked." }, ...FAQ_STYLE_OPTIONS], thumbs: "faq", help: "Your product pages use the same style unless you pick another in the Product page settings." },
        ] },
        { fields: [{
          id: "items", type: "repeater", label: "Questions", itemName: "Question", addLabel: "Add question", max: 20,
          template: { question: "New question", answer: "" }, titleKeys: ["question"],
          fields: [
            { key: "question", type: "text", label: "Question" },
            { key: "answer", type: "textarea", label: "Answer" },
            { key: "variant", type: "select", label: "Row style", options: [{ value: "accordion", label: "Line" }, { value: "card", label: "Card" }], fallback: "accordion", when: on(["accordion"]) },
            cardStyle(on(["cards", "sidebar"])),
          ],
        }] },
      ];
    case "promo-banner":
      return [
        { fields: [
          heading(),
          area("body", "Text", { when: off(["minimal-strip"]) }),
          text("cta", "Button label"),
          { id: "primaryButtonAction", type: "select", label: "Button opens", target: setting("primaryButtonAction"), fallback: "products", options: BUTTON_ACTIONS },
          { id: "primaryButtonUrl", type: "text", label: "Link", target: setting("primaryButtonUrl"), placeholder: "https://", when: { scope: "settings", key: "primaryButtonAction", in: ["external"] } },
          { id: "endsAt", type: "datetime", label: "Offer ends", target: setting("endsAt"), help: "The timer counts down to this time and hides after it.", when: on(["countdown"]) },
          { id: "media", type: "media", label: "Picture", max: 1, help: "No picture? A product photo is used.", when: on(["split-offer", "countdown"]) },
        ] },
      ];
    case "newsletter":
      return [{ fields: [heading(), area("body", "Text", { when: off(["inline", "minimal"]) }), text("buttonLabel", "Button label")] }];
    case "contact-form":
      return [
        { fields: [heading(), area("body", "Text"), text("buttonLabel", "Button label")] },
        { title: "Contact details", fields: [text("address", "Address"), text("email", "Contact email", { when: off(["whatsapp-first", "map-card"]) }), text("phone", "Contact phone", { when: off(["whatsapp-first", "map-card"]) })] },
      ];
    case "about-section": {
      const withPicture = ["split", "founder-note", "studio-story"];
      const withPoints = ["team-grid", "mission-split", "values-grid", "centered", "timeline"];
      return [
        { fields: [
          text("eyebrow", "Eyebrow", { when: on(["split", "centered", "timeline"]) }),
          heading(), area("body", "Text"),
          text("cta", "Button label", { when: on(["split"]) }),
          { id: "media", type: "media", label: "Picture", max: 1, when: on(withPicture) },
        ] },
        { fields: [{ ...titleBodyList("items", "Points", "Point", 6, [cardStyle(on(["values-grid"]))]), when: on(withPoints) }] },
      ];
    }
    case "delivery-info":
      return [{ fields: [heading({ when: off(["compact-strip"]) }), labelValueList("items", "Delivery steps", "Step", [cardStyle(on(["cards"]))])] }];
    case "payment-info":
      return [{ fields: [heading({ when: off(["compact-strip"]) }), labelValueList("items", "Payment methods", "Method", [cardStyle(off(["compact-strip"]))])] }];
    case "blog-index":
      return [
        { fields: [heading({ when: off(["resource-hub"]) }), area("body", "Text", { when: off(["resource-hub"]) })] },
        { fields: [{
          id: "items", type: "repeater", label: "Posts", itemName: "Post", addLabel: "Add post", max: 12,
          template: { title: "New post", excerpt: "", category: "", readTime: "", imageUrl: "" }, titleKeys: ["title"],
          fields: [
            { key: "media", type: "media", label: "Picture", accept: "image", when: off(["press-list", "resource-hub"]) },
            { key: "title", type: "text", label: "Title" },
            { key: "excerpt", type: "textarea", label: "Short summary" },
            { key: "category", type: "text", label: "Topic" },
            { key: "readTime", type: "text", label: "Reading time", placeholder: "e.g. 4 min read", when: off(["resource-hub"]) },
          ],
        }] },
      ];
    case "cart-summary":
      return [
        { fields: [heading(), area("body", "Text")] },
        { fields: [{ id: "drawerVariation", type: "select", label: "Cart drawer", target: setting("drawerVariation"), fallback: "right-drawer", options: [
          { value: "right-drawer", label: "Right drawer" }, { value: "left-drawer", label: "Left drawer" }, { value: "modal", label: "Modal cart" }, { value: "floating", label: "Mini floating cart" }, { value: "minimal", label: "Minimal cart" },
        ] }] },
      ];
    case "payday-countdown":
      return [{ fields: [text("eyebrow", "Eyebrow"), heading(), area("body", "Text"), text("cta", "Button label")] }, { title: "Timing", fields: [text("discountLabel", "Discount", { placeholder: "e.g. 15% off" }), ...PAYDAY_FIELDS] }];
    default:
      return [
        { fields: [heading(), area("body", "Text")] },
        { fields: [{ id: "imageBlocks", type: "imageBlocks", label: "Images" }, { id: "items", type: "items", label: "Blocks" }] },
      ];
  }
}

function classicSchema(kind: string): SectionSchema {
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
  // Classic product pages render the shared product page (ClassicPdp), so they get its settings. The old layout
  // cards are gone: a saved classic layout now only sets the starting layout (classic-pdp.ts).
  if (kind === "product-detail") return { settings: classicPdpSchemaGroups(), style, addable: [] };
  // Classic checkout pages render the shared checkout layouts (checkout-layout.ts); a saved classic layout only sets
  // the starting layout.
  if (kind === "checkout-form") return { settings: classicCheckoutSchemaGroups(), style, addable: [] };

  const variations = kind === "hero-split" ? [...SECTION_VARIATIONS[kind]!, CLASSIC_SLIDESHOW] : SECTION_VARIATIONS[kind];
  const fallback = variations?.[0]?.value ?? "";
  const groups: FieldGroup[] = [];
  if (variations?.length) {
    groups.push({ title: "Layout", fields: [{ id: "layout", type: "cards", label: "Style", target: setting("layout"), fallback, options: variations }] });
  }
  groups.push(...classicContent(kind, fallback));
  return { settings: groups, style, addable: CLASSIC_ADDABLE[kind] ?? [] };
}

const CLASSIC_SLIDESHOW: ChoiceOption = { value: "slideshow", label: "Slideshow", hint: "Several slides, each with its own photo or video, words and button." };

export function sectionSchema(kind: string, renderer: RendererKind, themeId = ""): SectionSchema {
  if (REWARD_SECTION_KINDS.includes(kind)) return gameSchema(kind);
  return renderer === "boutique" ? boutiqueSchema(kind, themeId) : classicSchema(kind);
}

/** Every field a schema can show, including the ones hidden for other layouts. */
export function allFields(schema: SectionSchema) {
  return [...schema.settings, ...schema.style].flatMap((group) => group.fields);
}

export function readTarget(section: TemplateSectionNode, target: FieldTarget): unknown {
  if (target.scope === "copy") return (section.blocks.find((block) => block.type === "copy")?.content ?? {})[target.key];
  if (target.scope === "settings") return section.settings?.[target.key];
  if (target.scope === "styles") return section.styles?.[target.key];
  return (section.background as Record<string, unknown> | undefined)?.[target.key];
}

function conditionHolds(section: TemplateSectionNode, when: When) {
  const raw = when.scope === "settings" ? section.settings?.[when.key] : readTarget(section, { scope: "copy", key: when.key });
  const value = typeof raw === "boolean" || typeof raw === "number" ? String(raw) : typeof raw === "string" && raw ? raw : when.fallback ?? "";
  if (when.in && !when.in.includes(value)) return false;
  if (when.notIn && when.notIn.includes(value)) return false;
  return true;
}

export function whenHolds(section: TemplateSectionNode, when: When | When[] | undefined) {
  if (!when) return true;
  return (Array.isArray(when) ? when : [when]).every((condition) => conditionHolds(section, condition));
}

/** `pageType`: the page the section is on; fields for other pages are hidden (left out, every page's fields show). */
export function fieldVisible(section: TemplateSectionNode, field: SchemaField | ItemField, pageType?: string) {
  if (pageType && "pages" in field && field.pages && !field.pages.includes(pageType)) return false;
  return whenHolds(section, field.when);
}

/** The fields shown for a section as it is now: what the panel draws. */
export function visibleFields(section: TemplateSectionNode, renderer: RendererKind, themeId = "", tab: "settings" | "style" = "settings", pageType?: string) {
  const schema = sectionSchema(section.kind, renderer, themeId);
  return (tab === "settings" ? schema.settings : schema.style).flatMap((group) => group.fields).filter((field) => fieldVisible(section, field, pageType));
}
