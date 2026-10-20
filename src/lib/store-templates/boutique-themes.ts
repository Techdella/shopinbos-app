// The 2026 storefront themes (Afẹ́fẹ́, Dúdú, Jẹ́jẹ́, Adire, Mama Put, Ilé, Plug, Waka and the industry themes Ẹwà, Ṣùkú,
// Aṣọ Ẹbí, Agbada, Ìlẹ̀kẹ̀, Oúnjẹ, Chin Chin, Ọjà, Ọmọ, Ìwé, Owambe, Danfo, Turare, Oko). Ids are the stable English/ASCII
// ones ("breeze", "pantry"…); display names live in theme-library.ts. They are ordinary template manifests (so
// /builder/templates, the editor and Rex can pick them), rendered by the boutique storefront renderer
// (src/components/storefront/boutique). Seeds carry no stock photos and no invented reviews or offers:
// imagery comes from the seller's products or uploads, proof from real reviews, promises from settings.

import type { StoreTemplateManifest, TemplateBlockNode, TemplatePageSeed, TemplateSectionNode, ThemeTokenSet } from "./types";

export type BoutiqueThemeId =
  | "breeze" | "noir" | "plain" | "adire" | "pantry" | "ile" | "plug" | "stride"
  | "ewa" | "suku" | "asoebi" | "agbada" | "ileke" | "ounje" | "chinchin" | "oja" | "omo" | "iwe" | "owambe" | "danfo" | "turare" | "oko"
  | "aaro" | "highlife" | "oba" | "gbedu";

export const BOUTIQUE_THEME_IDS: readonly BoutiqueThemeId[] = [
  "breeze", "noir", "plain", "adire", "pantry", "ile", "plug", "stride",
  "ewa", "suku", "asoebi", "agbada", "ileke", "ounje", "chinchin", "oja", "omo", "iwe", "owambe", "danfo", "turare", "oko",
  "aaro", "highlife", "oba", "gbedu",
];

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
  ewa: { heroBg: "#F6DCD3", heroText: "#3B1F1A", accent: "#C2566B", ctaBg: "#3B1F1A", ctaText: "#FFF6F2", paperBg: "#FFF8F5", cardBg: "#F9E7E1", ink: "#3B1F1A", muted: "#85625A", border: "#F0D9D1", headingStyle: "serif", radius: "soft" },
  suku: { heroBg: "#2A1630", heroText: "#FBEFF7", accent: "#E0679E", ctaBg: "#E0679E", ctaText: "#FFFFFF", paperBg: "#FFFAFC", cardBg: "#F6E7F0", ink: "#2A1630", muted: "#7A5F73", border: "#EFDCE7", headingStyle: "grotesk", radius: "rounded" },
  asoebi: { heroBg: "#4A1D5C", heroText: "#FFF5E1", accent: "#D4A13A", ctaBg: "#4A1D5C", ctaText: "#FFF5E1", paperBg: "#FFFBF3", cardBg: "#F5EBDD", ink: "#2B1530", muted: "#77617A", border: "#EADCC8", headingStyle: "serif", radius: "sharp" },
  agbada: { heroBg: "#1E2B26", heroText: "#F2EEE4", accent: "#B08D57", ctaBg: "#1E2B26", ctaText: "#F2EEE4", paperBg: "#F7F5F0", cardBg: "#ECE8DF", ink: "#1A1F1C", muted: "#66695F", border: "#DDD8CC", headingStyle: "serif", radius: "sharp" },
  ileke: { heroBg: "#FBF3EA", heroText: "#2E1B12", accent: "#C8462C", ctaBg: "#2E1B12", ctaText: "#FBF3EA", paperBg: "#FFFCF7", cardBg: "#F6EBDD", ink: "#2E1B12", muted: "#7D6656", border: "#EADBC8", headingStyle: "serif", radius: "soft" },
  ounje: { heroBg: "#14532D", heroText: "#FFFBEB", accent: "#F59E0B", ctaBg: "#F59E0B", ctaText: "#1C1917", paperBg: "#FFFBEB", cardBg: "#FEF3C7", ink: "#1C1917", muted: "#6B5E4B", border: "#F1E3B8", headingStyle: "grotesk", radius: "rounded" },
  chinchin: { heroBg: "#F9D8E2", heroText: "#4A2511", accent: "#D9467A", ctaBg: "#4A2511", ctaText: "#FFF7EE", paperBg: "#FFF7EE", cardBg: "#FBE7D9", ink: "#4A2511", muted: "#8A6450", border: "#F2DCCB", headingStyle: "serif", radius: "rounded" },
  oja: { heroBg: "#0F7A3D", heroText: "#FFFFFF", accent: "#0F7A3D", ctaBg: "#0F7A3D", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F1F6F2", ink: "#14231A", muted: "#5B6B60", border: "#E1E9E3", headingStyle: "grotesk", radius: "rounded" },
  omo: { heroBg: "#FFD54A", heroText: "#1F2A44", accent: "#3D7BF7", ctaBg: "#3D7BF7", ctaText: "#FFFFFF", paperBg: "#FFFDF6", cardBg: "#EAF2FF", ink: "#1F2A44", muted: "#5E6780", border: "#E7EAF2", headingStyle: "grotesk", radius: "rounded" },
  iwe: { heroBg: "#F1E9DA", heroText: "#1E2235", accent: "#B4432F", ctaBg: "#1E2235", ctaText: "#F8F4EC", paperBg: "#FBF8F2", cardBg: "#F1E9DA", ink: "#1E2235", muted: "#646779", border: "#E4DCCB", headingStyle: "serif", radius: "sharp" },
  owambe: { heroBg: "#2D0B3A", heroText: "#FFF4D6", accent: "#F2B705", ctaBg: "#F2B705", ctaText: "#2D0B3A", paperBg: "#FFFAF0", cardBg: "#F8ECF3", ink: "#2D0B3A", muted: "#76607C", border: "#EEDDE8", headingStyle: "serif", radius: "rounded" },
  danfo: { heroBg: "#111111", heroText: "#FFFFFF", accent: "#FFC400", ctaBg: "#FFC400", ctaText: "#111111", paperBg: "#F5F5F2", cardBg: "#FFFFFF", ink: "#111111", muted: "#5C5C57", border: "#E2E2DC", headingStyle: "grotesk", radius: "sharp" },
  turare: { heroBg: "#1B1420", heroText: "#F7EFE3", accent: "#C9A46A", ctaBg: "#C9A46A", ctaText: "#1B1420", paperBg: "#FBF7F1", cardBg: "#F1E8DC", ink: "#1B1420", muted: "#6E6170", border: "#E5DACB", headingStyle: "serif", radius: "soft" },
  oko: { heroBg: "#2F5D2A", heroText: "#FFFBEF", accent: "#E0A526", ctaBg: "#2F5D2A", ctaText: "#FFFBEF", paperBg: "#FBF8EF", cardBg: "#EEF0DD", ink: "#1F2B1A", muted: "#5E6650", border: "#E0E2CB", headingStyle: "grotesk", radius: "rounded" },
  // Themes after the big storefront theme stores' best sellers: a photo-first minimal one (basic), a retro one
  // with a ticker (premium), quiet luxury and a loud dark one (platinum).
  aaro: { heroBg: "#121212", heroText: "#FFFFFF", accent: "#121212", ctaBg: "#121212", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F3F3F3", ink: "#121212", muted: "#5C5C5C", border: "#E5E5E5", headingStyle: "grotesk", radius: "sharp" },
  highlife: { heroBg: "#2B2D7C", heroText: "#FFF6E5", accent: "#E4572E", ctaBg: "#E4572E", ctaText: "#FFFFFF", paperBg: "#F6EFE3", cardBg: "#EDE3D1", ink: "#1E1B4B", muted: "#5D5873", border: "#E0D3BC", headingStyle: "grotesk", radius: "rounded" },
  oba: { heroBg: "#1C1C1C", heroText: "#FBF9F6", accent: "#9C7C4F", ctaBg: "#1C1C1C", ctaText: "#FBF9F6", paperBg: "#FBF9F6", cardBg: "#F1EDE6", ink: "#1C1C1C", muted: "#737068", border: "#E5DFD5", headingStyle: "serif", radius: "sharp" },
  gbedu: { heroBg: "#0B0B0F", heroText: "#F5F5F7", accent: "#8B5CF6", ctaBg: "#F5F5F7", ctaText: "#0B0B0F", paperBg: "#0B0B0F", cardBg: "#17171F", ink: "#F5F5F7", muted: "#A1A1AA", border: "#26262E", headingStyle: "grotesk", radius: "soft" },
};

const NAV = ["home", "products", "about", "contact"];

type HeaderLayout = "split" | "centered" | "bold";

function announcement() {
  // Empty text: the storefront derives the bar from shipping zones and payment settings, or hides it.
  return section("announcement", "announcement-bar", "Announcement Bar", { text: "" }, { settings: { source: "store-settings" } });
}

function header(layout: HeaderLayout, cartLabel = "My bag") {
  return section("header", "header", "Header", { navLinks: NAV, utilityLinks: ["wishlist", "cart"], cartLabel }, { settings: { layout, search: true, wishlist: true, cart: true } });
}

function footer() {
  return section("footer", "footer", "Footer", { summary: "" }, { settings: { layout: "boutique", showPayments: true } });
}

function newsletter(copy: { title?: string; body?: string } = {}) {
  return section("newsletter", "newsletter", "Newsletter", {
    title: copy.title ?? "Subscribe to new drops",
    body: copy.body ?? "Be first to hear about new pieces. No spam.",
    buttonLabel: "Subscribe",
    placeholder: "WhatsApp number or email",
  });
}

/** Product rows on the home page: a carousel, a 4-up grid, a dense 6-up catalogue (Ọjà, Danfo) or a menu list (Oúnjẹ). */
type RailLayout = "carousel" | "tiles" | "dense" | "menu";

function bestSellers(layout: RailLayout, title = "Best sellers", cta = "Shop all") {
  return section("featured-products", "featured-products", "Best Sellers", { title, cta }, { settings: { layout, source: "best-sellers", allowMapping: true } });
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
  ewa: { layout: "ewa-arch", eyebrow: "Skin first", title: "Glow that feels like you", primaryCta: "Shop skincare" },
  suku: { layout: "suku-crown", eyebrow: "New units", title: "Your crown, your way", primaryCta: "Shop hair" },
  asoebi: { layout: "asoebi-collage", eyebrow: "Owambe ready", title: "Fabrics for the big day", primaryCta: "Shop fabrics" },
  agbada: { layout: "agbada-tailored", eyebrow: "Made to measure", title: "Dressed for every occasion", primaryCta: "Shop the collection" },
  ileke: { layout: "ileke-frame", eyebrow: "Handmade", title: "Beads with a story", primaryCta: "Shop jewellery" },
  ounje: { layout: "ounje-menu", eyebrow: "Hot and fresh", title: "Today's menu is ready", primaryCta: "See the menu" },
  chinchin: { layout: "chinchin-sweet", eyebrow: "Baked fresh", title: "Something sweet for everyone", primaryCta: "Order treats" },
  oja: { layout: "oja-market", eyebrow: "", title: "Everything for your home, one cart", primaryCta: "Start shopping" },
  omo: { layout: "omo-play", eyebrow: "For little ones", title: "Made for play, made to last", primaryCta: "Shop kids" },
  iwe: { layout: "iwe-shelf", eyebrow: "New on the shelf", title: "Find your next good read", primaryCta: "Browse books" },
  owambe: { layout: "owambe-party", eyebrow: "Party time", title: "Everything for your owambe", primaryCta: "Plan your party" },
  danfo: { layout: "danfo-garage", eyebrow: "Parts and accessories", title: "Keep your car moving", primaryCta: "Find a part" },
  turare: { layout: "turare-glow", eyebrow: "Signature scents", title: "A scent people remember", primaryCta: "Shop fragrance" },
  oko: { layout: "oko-field", eyebrow: "Fresh from the farm", title: "Straight from our farm to you", primaryCta: "Shop produce" },
  aaro: { layout: "aaro-banner", eyebrow: "", title: "Browse our latest products", primaryCta: "Shop all" },
  highlife: { layout: "highlife-ticker", eyebrow: "Fresh drop", title: "Good vibes, made to wear", primaryCta: "Shop the drop" },
  oba: { layout: "oba-cinema", eyebrow: "New collection", title: "Crafted to be kept", primaryCta: "Discover" },
  gbedu: { layout: "gbedu-impact", eyebrow: "Just dropped", title: "Turn it all the way up", primaryCta: "Shop now" },
};

function hero(theme: BoutiqueThemeId): TemplateSectionNode {
  const seed = HERO_SEEDS[theme];
  return section("hero", "hero-split", "Hero", { eyebrow: seed.eyebrow, title: seed.title, body: "", primaryCta: seed.primaryCta }, { settings: { layout: seed.layout, primaryButtonAction: "products" }, items: [] });
}

/** Category row look: round picks, wide tiles or compact chips (dense catalogues and menus). */
const CATEGORY_LAYOUT: Record<BoutiqueThemeId, "chips" | "boutique-tiles" | "boutique-circles"> = {
  breeze: "boutique-tiles", noir: "boutique-circles", plain: "boutique-circles", adire: "boutique-circles", pantry: "boutique-circles",
  ile: "boutique-tiles", plug: "chips", stride: "boutique-tiles",
  ewa: "boutique-circles", suku: "boutique-tiles", asoebi: "boutique-tiles", agbada: "boutique-tiles", ileke: "boutique-circles",
  ounje: "chips", chinchin: "boutique-circles", oja: "chips", omo: "boutique-circles", iwe: "chips", owambe: "boutique-tiles",
  danfo: "chips", turare: "boutique-circles", oko: "boutique-tiles",
  aaro: "boutique-tiles", highlife: "boutique-circles", oba: "boutique-tiles", gbedu: "boutique-tiles",
};

function categories(theme: BoutiqueThemeId, title = "Shop by category") {
  return section("categories", "category-grid", "Shop by Category", { title }, { settings: { layout: CATEGORY_LAYOUT[theme], source: "store-categories" } });
}

function reviews(title = "What customers say") {
  return section("testimonials", "testimonials", "Customer Reviews", { title }, { settings: { source: "product-reviews" }, items: [] });
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

const STORY_LAYOUT: Partial<Record<BoutiqueThemeId, string>> = {
  noir: "noir-split", adire: "editorial", ile: "editorial", ewa: "editorial", asoebi: "editorial", agbada: "editorial", ileke: "editorial",
  iwe: "editorial", turare: "noir-split", oko: "editorial",
  highlife: "banner", oba: "editorial", gbedu: "noir-split",
};

const STORY_COPY: Partial<Record<BoutiqueThemeId, { eyebrow: string; title: string }>> = {
  ewa: { eyebrow: "What goes in", title: "Kind to your skin" },
  asoebi: { eyebrow: "Our fabrics", title: "Chosen bale by bale" },
  agbada: { eyebrow: "The workshop", title: "Cut and sewn by hand" },
  ileke: { eyebrow: "The studio", title: "Strung one bead at a time" },
  iwe: { eyebrow: "Our shop", title: "Books we love to share" },
  turare: { eyebrow: "The house", title: "Scents made to linger" },
  oko: { eyebrow: "Our farm", title: "Grown with care" },
  highlife: { eyebrow: "Our story", title: "Made for the good times" },
  oba: { eyebrow: "The house", title: "Made slowly, by hand" },
  gbedu: { eyebrow: "The sound", title: "Built loud, made to last" },
};

function story(theme: BoutiqueThemeId) {
  const copy = STORY_COPY[theme] ?? { eyebrow: "Our studio", title: "Made with care" };
  return section(
    "story",
    "story-split",
    "Our Story",
    { eyebrow: copy.eyebrow, title: copy.title, body: "", primaryCta: "Our story" },
    { settings: { layout: STORY_LAYOUT[theme] ?? "boutique" }, items: [] },
  );
}

type FaqKind = "fit" | "food" | "auto" | "rental" | "general";

const FAQ_KIND: Partial<Record<BoutiqueThemeId, FaqKind>> = {
  // The first eight themes keep their original questions, so drafts made on them still compare equal to their seeds.
  ounje: "food", chinchin: "food", oja: "general", oko: "food", danfo: "auto", owambe: "rental", iwe: "general",
  ewa: "general", turare: "general", ileke: "general",
  aaro: "general", highlife: "general", oba: "general", gbedu: "general",
};

function faq(theme?: BoutiqueThemeId) {
  const kind = (theme && FAQ_KIND[theme]) ?? "fit";
  const third =
    kind === "food"
      ? { question: "Can I order for a party or event?", answer: "" }
      : kind === "auto"
        ? { question: "Will this part fit my car?", answer: "" }
        : kind === "rental"
          ? { question: "How does hiring work?", answer: "" }
          : kind === "general"
            ? { question: "Can I return an item?", answer: "", answerSource: "returns" }
            : { question: "What if it does not fit?", answer: "", answerSource: "returns" };
  return section(
    "faq",
    "faq",
    "Questions",
    { title: "Questions" },
    {
      items: [
        // Answers left blank are filled from the store's own delivery and payment settings; the rest stay
        // hidden from shoppers until the seller writes them.
        { question: "How fast is delivery?", answer: "", answerSource: "delivery" },
        { question: "Can I pay on delivery?", answer: "", answerSource: "payment" },
        third,
      ],
    },
  );
}

const HEADER_LAYOUT: Record<BoutiqueThemeId, HeaderLayout> = {
  breeze: "split", noir: "split", plain: "centered", adire: "split", pantry: "split", ile: "centered", plug: "split", stride: "bold",
  ewa: "centered", suku: "split", asoebi: "centered", agbada: "centered", ileke: "centered", ounje: "split", chinchin: "centered",
  oja: "split", omo: "split", iwe: "centered", owambe: "centered", danfo: "bold", turare: "centered", oko: "split",
  aaro: "split", highlife: "bold", oba: "centered", gbedu: "split",
};

const CART_LABEL: Partial<Record<BoutiqueThemeId, string>> = { ounje: "My order", chinchin: "My order", oja: "My basket", oko: "My basket" };

function page(theme: BoutiqueThemeId, pageType: TemplatePageSeed["pageType"], title: string, slug: string, body: TemplateSectionNode[], themeName: string): TemplatePageSeed {
  return {
    id: `${theme}-${pageType}`,
    pageType,
    title,
    slug,
    sections: [announcement(), header(HEADER_LAYOUT[theme], CART_LABEL[theme]), ...body, footer()],
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
      return [hero("pantry"), categories("pantry", "What are you craving?"), bestSellers("tiles", "Popular right now"), faq("pantry"), newsletter()];
    case "ile":
      return [hero("ile"), categories("ile", "Shop by room"), bestSellers("tiles", "New in"), story("ile"), newsletter()];
    case "plug":
      return [hero("plug"), categories("plug"), bestSellers("carousel", "Top picks"), faq("plug"), newsletter()];
    case "stride":
      return [hero("stride"), bestSellers("carousel", "Best sellers"), categories("stride", "Shop by style"), reviews(), newsletter()];
    case "ewa":
      return [hero("ewa"), categories("ewa", "Shop by need"), bestSellers("carousel", "Bestsellers"), story("ewa"), reviews("Real results, real customers"), faq("ewa"), newsletter({ title: "Skin notes, once a month", body: "New launches and how to use them. No spam." })];
    case "suku":
      return [hero("suku"), bestSellers("carousel", "Trending units"), categories("suku", "Shop by style"), reviews(), faq("suku"), newsletter({ title: "First dibs on new units", body: "Restocks and new lengths, straight to you." })];
    case "asoebi":
      return [hero("asoebi"), categories("asoebi", "Shop by fabric"), bestSellers("tiles", "Fresh bales", "See all fabrics"), story("asoebi"), faq("asoebi"), newsletter({ title: "Planning an aso-ebi?", body: "Get new colours and bulk updates first." })];
    case "agbada":
      return [hero("agbada"), bestSellers("tiles", "The collection"), story("agbada"), categories("agbada", "Shop by occasion"), faq("agbada"), newsletter({ title: "New styles, first", body: "Fresh cuts and fabrics, a few times a month." })];
    case "ileke":
      return [hero("ileke"), categories("ileke", "Shop by piece"), bestSellers("carousel", "Loved pieces"), story("ileke"), newsletter({ title: "New pieces, first", body: "Small batches sell out. We'll tell you when they drop." })];
    case "ounje":
      return [hero("ounje"), categories("ounje", "Menu"), bestSellers("menu", "Today's menu", "Full menu"), faq("ounje"), newsletter({ title: "Get the weekly menu", body: "Specials and new dishes, once a week." })];
    case "chinchin":
      return [hero("chinchin"), bestSellers("tiles", "Fresh from the oven"), categories("chinchin", "Treats"), reviews("Sweet words"), faq("chinchin"), newsletter({ title: "Sweet news", body: "New flavours and festive boxes, first." })];
    case "oja":
      return [hero("oja"), categories("oja", "Shop by aisle"), bestSellers("dense", "Everyday essentials", "See everything"), faq("oja"), newsletter({ title: "Restock reminders", body: "Weekly deals and restocks, by WhatsApp or email." })];
    case "omo":
      return [hero("omo"), categories("omo", "Shop by category"), bestSellers("carousel", "Little favourites"), reviews("From other parents"), faq("omo"), newsletter({ title: "For busy parents", body: "New arrivals and back-to-school picks." })];
    case "iwe":
      return [hero("iwe"), bestSellers("carousel", "New on the shelf"), categories("iwe", "Browse by genre"), story("iwe"), newsletter({ title: "The reading list", body: "New arrivals and staff picks, once a month." })];
    case "owambe":
      return [hero("owambe"), categories("owambe", "Plan your party"), bestSellers("tiles", "For hire and for sale"), faq("owambe"), newsletter({ title: "Planning an owambe?", body: "Packages and new rentals, first." })];
    case "danfo":
      return [hero("danfo"), categories("danfo", "Shop by part"), bestSellers("dense", "In stock now", "All parts"), faq("danfo"), newsletter({ title: "Restock alerts", body: "Hard-to-find parts back in stock, first." })];
    case "turare":
      return [hero("turare"), bestSellers("carousel", "Signature scents"), story("turare"), categories("turare", "Shop by family"), reviews(), newsletter({ title: "New scents, first", body: "Launches and restocks of the favourites." })];
    case "oko":
      return [hero("oko"), categories("oko", "From the farm"), bestSellers("tiles", "Fresh this week"), story("oko"), faq("oko"), newsletter({ title: "What's fresh this week", body: "Harvest updates and bulk prices, weekly." })];
    case "aaro":
      return [hero("aaro"), bestSellers("tiles", "Featured products", "View all"), categories("aaro", "Collections"), story("aaro"), faq("aaro"), newsletter({ title: "Subscribe to our emails", body: "Be the first to know about new collections and offers." })];
    case "highlife":
      return [hero("highlife"), categories("highlife", "Shop by vibe"), bestSellers("carousel", "Hot right now"), story("highlife"), reviews("Love notes"), faq("highlife"), newsletter({ title: "Join the club", body: "Drops, restocks and members-only deals." })];
    case "oba":
      return [hero("oba"), bestSellers("carousel", "The collection", "Discover all"), story("oba"), categories("oba", "Explore"), reviews("In their words"), newsletter({ title: "Private previews", body: "New collections, before anyone else." })];
    case "gbedu":
      return [hero("gbedu"), bestSellers("carousel", "Turn it up"), categories("gbedu", "Shop the range"), story("gbedu"), reviews("Heard it here"), faq("gbedu"), newsletter({ title: "Get on the list", body: "Drops sell out fast. Hear first." })];
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
  ewa: "boutique-gallery",
  suku: "wide-gallery",
  asoebi: "editorial-gallery",
  agbada: "editorial-gallery",
  ileke: "editorial-gallery",
  ounje: "stacked",
  chinchin: "stacked",
  oja: "boutique-gallery",
  omo: "boutique-gallery",
  iwe: "editorial-gallery",
  owambe: "wide-gallery",
  danfo: "spec-sheet",
  turare: "editorial-gallery",
  oko: "stacked",
  aaro: "boutique-gallery",
  highlife: "wide-gallery",
  oba: "editorial-gallery",
  gbedu: "wide-gallery",
};

const RELATED_TITLE: Partial<Record<BoutiqueThemeId, string>> = {
  pantry: "Goes well with", ounje: "Add to your order", chinchin: "Goes well with", oja: "You may also need", danfo: "Often bought with",
  iwe: "Readers also picked", owambe: "Complete the setup", ewa: "Complete the routine", oko: "Also fresh",
  aaro: "You may also like", oba: "Complete the look", gbedu: "Pairs well with",
};

/**
 * The first eight themes were seeded with English names; their seeds keep them (as the home page's default meta
 * title) so a store's existing draft still matches its seed and theme switching can tell defaults from the
 * seller's own words. Display names come from theme-library.ts.
 */
const SEED_NAME: Partial<Record<BoutiqueThemeId, string>> = {
  breeze: "Breeze", noir: "Noir", plain: "Plain", pantry: "Pantry", stride: "Stride",
};

function buildPages(theme: BoutiqueThemeId, displayName: string): TemplatePageSeed[] {
  const themeName = SEED_NAME[theme] ?? displayName;
  return [
    page(theme, "home", "Home", "home", homeSections(theme), themeName),
    page(theme, "products", "Shop", "shop", [
      section("shop-grid", "featured-products", "All Products", { title: theme === "ounje" ? "Full menu" : "Shop all" }, { settings: { layout: "grid", source: "all", filters: true } }),
    ], themeName),
    page(theme, "product", "Product", "product", [
      section("product-detail", "product-detail", "Product Detail", { title: "" }, { settings: { layout: PRODUCT_LAYOUT[theme] } }),
      section("related", "featured-products", "Explore", { title: RELATED_TITLE[theme] ?? "Explore" }, { settings: { layout: "carousel", source: "related" } }),
    ], themeName),
    page(theme, "wishlist", "Wishlist", "wishlist", [section("wishlist", "wishlist-grid", "Wishlist", { title: "Your wishlist" })], themeName),
    page(theme, "cart", "Bag", "cart", [section("cart", "cart-summary", "Bag", { title: "Your bag" }, { settings: { drawerVariation: "right-drawer" } })], themeName),
    page(theme, "checkout", "Checkout", "checkout", [section("checkout", "checkout-form", "Checkout", { title: "Checkout" })], themeName),
    page(theme, "about", "About", "about", [story(theme)], themeName),
    page(theme, "contact", "Contact", "contact", [
      section("contact", "contact-form", "Contact", { title: "Get in touch", body: "Questions about an order or a size? Send us a message.", buttonLabel: "Send message" }),
    ], themeName),
    page(theme, "faq", "FAQ", "faq", [faq(theme)], themeName),
  ];
}

const DEFINITIONS: Array<{ id: BoutiqueThemeId; name: string; description: string; tags: string[]; aiHints: string[] }> = [
  {
    id: "breeze",
    name: "Afẹ́fẹ́",
    description: "Light and airy: italic serif logo, wide photo banner, category tiles, best sellers with wishlist hearts, real customer reviews and a WhatsApp-friendly product page.",
    tags: ["fashion", "light", "mobile-first", "reviews", "whatsapp", "breeze", "2026"],
    aiHints: [
      "Afẹ́fẹ́ (id breeze, Yoruba for breeze): white page, turquoise accent, italic serif shop name, rounded cards",
      "Home order: hero banner with headline and 'Shop new arrivals', shop by category tiles, best sellers carousel, customer reviews, newsletter",
      "Keep hero copy short (under 8 words); never invent reviews, offers or delivery promises",
    ],
  },
  {
    id: "noir",
    name: "Dúdú",
    description: "Black and gold boutique with a payday countdown banner: a centred headline, a live countdown to (or through) payday week, best sellers and a studio story.",
    tags: ["fashion", "dark", "premium", "payday", "countdown", "noir", "2026"],
    aiHints: [
      "Dúdú (id noir, Yoruba for black): near-black page, antique gold accent, uppercase serif headings, square outlined buttons",
      "Home order: centred hero, payday countdown strip (payday defaults to the 25th, moved to Friday at weekends), best sellers, studio story split",
      "Only mention a discount when the seller gives one; otherwise call it the payday edit",
    ],
  },
  {
    id: "plain",
    name: "Jẹ́jẹ́",
    description: "Quiet and minimal with a centred logo: a full-width hero with slide dots, best sellers, questions answered from your delivery and payment settings, and a newsletter.",
    tags: ["minimal", "centred logo", "clean", "faq", "plain", "2026"],
    aiHints: [
      "Jẹ́jẹ́ (id plain, Yoruba for gentle): white page, black type and buttons, centred logo header, square product cards",
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
    name: "Mama Put",
    description: "Warm and bold for food and drinks: a big split banner in tomato and cream, round category picks, a popular-now grid and delivery answers from your settings.",
    tags: ["food", "drinks", "warm", "bold", "pantry", "2026"],
    aiHints: [
      "Mama Put (id pantry, Naija for the neighbourhood food seller): cream page, tomato accent, heavy sans headings, rounded cards and pill buttons",
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
      "Ilé (Yoruba for home): soft sage page, deep green ink, serif headings, generous spacing, soft corners",
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
      "Plug (Naija slang for the person who can get it for you): near-black page, electric blue accent, sharp corners, mono labels for specs",
      "Home order: spotlight hero (text left, product right), category chips, top picks carousel, questions, newsletter",
      "Be specific and factual: model, storage, warranty only when the seller provides it",
    ],
  },
  {
    id: "stride",
    name: "Waka",
    description: "Loud and sporty for shoes: a huge uppercase headline over the photo, best sellers up front, style tiles, real reviews and a big product gallery.",
    tags: ["shoes", "sneakers", "sport", "loud", "stride", "2026"],
    aiHints: [
      "Waka (id stride, Pidgin for walk): white page, blaze orange accent, heavy italic uppercase headings, black pill buttons",
      "Home order: loud hero, best sellers carousel, shop by style tiles, customer reviews, newsletter",
      "Short punchy headlines (2 to 4 words)",
    ],
  },
  {
    id: "ewa",
    name: "Ẹwà",
    description: "Soft and glowing for beauty and skincare: a blush arch banner, round 'shop by need' picks, a bestsellers carousel, an ingredients story, real reviews and answers from your settings.",
    tags: ["beauty", "skincare", "cosmetics", "soft", "serif", "2026"],
    aiHints: [
      "Ẹwà (Yoruba for beauty): blush page, rose accent, cocoa ink, italic serif headings, soft corners, arch-shaped hero photo",
      "Home order: arch hero (headline left, photo in an arch), shop by need circles, bestsellers carousel, ingredients story, reviews, questions, newsletter",
      "Talk about skin feel and ingredients the seller lists; never make medical claims or invent results",
    ],
  },
  {
    id: "suku",
    name: "Ṣùkú",
    description: "Bold and glam for hair and wigs: a deep plum banner with the unit in a crown frame, trending units first, style tiles, real reviews and a big product gallery for lengths and textures.",
    tags: ["hair", "wigs", "braids", "glam", "bold", "2026"],
    aiHints: [
      "Ṣùkú (Yoruba crown braid style): plum hero, hot pink accent, grotesk headings, rounded cards",
      "Home order: crown hero (photo in a tall oval), trending units carousel, shop by style tiles, reviews, questions, newsletter",
      "Name lengths, textures and lace types only as the seller lists them",
    ],
  },
  {
    id: "asoebi",
    name: "Aṣọ Ẹbí",
    description: "Rich and regal for fabrics, lace and ankara: a three-photo collage banner on royal purple, fabric tiles, fresh bales in a grid, an editorial story and bulk-order questions.",
    tags: ["fabrics", "lace", "ankara", "aso-ebi", "regal", "serif", "2026"],
    aiHints: [
      "Aṣọ Ẹbí (Yoruba for family cloth): ivory page, royal purple and gold, serif headings, sharp corners, a three-photo collage hero",
      "Home order: collage hero, shop by fabric tiles, fresh bales grid, our fabrics story, questions, newsletter",
      "Mention yards, colours and bulk prices only when the seller gives them",
    ],
  },
  {
    id: "agbada",
    name: "Agbada",
    description: "Sharp and tailored for menswear: a split banner with a ruled headline on deep green, the collection as a grid, a workshop story, occasion tiles and fitting questions.",
    tags: ["menswear", "tailoring", "native wear", "agbada", "kaftan", "2026"],
    aiHints: [
      "Agbada (the flowing Yoruba robe): warm stone page, deep green hero, bronze accent, serif headings, square buttons",
      "Home order: tailored split hero, the collection grid, workshop story, shop by occasion tiles, questions, newsletter",
      "Talk about cut, fabric and fit; offer made-to-measure only when the seller does",
    ],
  },
  {
    id: "ileke",
    name: "Ìlẹ̀kẹ̀",
    description: "Delicate and close-up for jewellery and beads: a framed product on cream with a large serif headline, round piece picks, a loved pieces carousel and a studio story.",
    tags: ["jewellery", "beads", "coral", "handmade", "serif", "2026"],
    aiHints: [
      "Ìlẹ̀kẹ̀ (Yoruba for beads): cream page, coral accent, italic serif headings, soft corners, framed hero photo",
      "Home order: framed hero, shop by piece circles, loved pieces carousel, studio story, newsletter",
      "Describe materials (coral, brass, glass beads) only as the seller lists them",
    ],
  },
  {
    id: "ounje",
    name: "Oúnjẹ",
    description: "A menu, not a catalogue: a deep green banner with Order on WhatsApp up front (when you've added your number), menu chips, today's menu as a list with prices, and food questions.",
    tags: ["restaurant", "food delivery", "menu", "whatsapp", "2026"],
    aiHints: [
      "Oúnjẹ (Yoruba for food): cream page, deep green hero, amber accent, grotesk headings, rounded cards",
      "Home order: menu hero with Order on WhatsApp (only when the store has a WhatsApp number), menu chips, today's menu list, questions, newsletter",
      "Name dishes plainly with what's in them; never promise delivery times the seller hasn't set",
    ],
  },
  {
    id: "chinchin",
    name: "Chin Chin",
    description: "Sweet and playful for bakeries, cakes and snacks: a pink scalloped banner, fresh-from-the-oven grid, round treat picks, real reviews and party-order questions.",
    tags: ["bakery", "cakes", "pastries", "snacks", "sweet", "2026"],
    aiHints: [
      "Chin Chin (Naija's favourite crunchy snack): cream page, pink hero, raspberry accent, chocolate ink, serif headings, rounded cards",
      "Home order: scalloped sweet hero, fresh from the oven grid, treat circles, reviews, questions, newsletter",
      "Talk about flavour and occasions; mention custom cakes only when the seller offers them",
    ],
  },
  {
    id: "oja",
    name: "Ọjà",
    description: "Dense and quick for groceries and general stores: a compact green banner with search, aisles as chips straight after, and a six-across catalogue of everyday essentials.",
    tags: ["groceries", "supermarket", "general store", "dense", "search", "2026"],
    aiHints: [
      "Ọjà (Yoruba for market): white page, market green, grotesk headings, compact square tiles",
      "Home order: compact search hero, shop by aisle chips, dense essentials grid (6 across on desktop), questions, newsletter",
      "Lead with categories and prices; keep headlines practical",
    ],
  },
  {
    id: "omo",
    name: "Ọmọ",
    description: "Bright and friendly for kids and baby: a sunshine banner with the photo in a tilted card, round category picks, little favourites, real reviews from parents and questions.",
    tags: ["kids", "baby", "toys", "bright", "friendly", "2026"],
    aiHints: [
      "Ọmọ (Yoruba for child): warm white page, sunshine hero, sky blue accent, rounded grotesk headings, big rounded corners",
      "Home order: play hero (tilted photo card), category circles, little favourites carousel, reviews from parents, questions, newsletter",
      "Mention ages and safety details only as the seller gives them",
    ],
  },
  {
    id: "iwe",
    name: "Ìwé",
    description: "Quiet and literary for books and stationery: a headline beside a shelf of real covers, new on the shelf, genre chips, a shop story and a reading-list newsletter.",
    tags: ["books", "bookshop", "stationery", "literary", "serif", "2026"],
    aiHints: [
      "Ìwé (Yoruba for book): paper page, ink navy, brick accent, serif headings, sharp corners, tall 2:3 cover tiles",
      "Home order: shelf hero (covers from the seller's products), new on the shelf carousel, genre chips, shop story, newsletter",
      "Use real titles and authors from the catalogue; never invent blurbs or quotes",
    ],
  },
  {
    id: "owambe",
    name: "Owambe",
    description: "Festive and gold for events, party supplies and rentals: a confetti banner on deep plum, plan-your-party tiles, hire-and-buy grid and questions about how hiring works.",
    tags: ["events", "party supplies", "rentals", "festive", "gold", "2026"],
    aiHints: [
      "Owambe (Naija for a big, joyful party): deep plum hero with gold confetti, gold buttons, italic serif headings",
      "Home order: party hero, plan your party tiles, for hire and for sale grid, questions, newsletter",
      "Say hire or buy plainly; mention packages and deposits only when the seller sets them",
    ],
  },
  {
    id: "danfo",
    name: "Danfo",
    description: "Yellow, black and search-first for auto parts: a hazard-stripe banner with part search, parts as chips, a dense in-stock grid with spec-style product pages and fitment questions.",
    tags: ["auto parts", "car accessories", "search", "dense", "bold", "2026"],
    aiHints: [
      "Danfo (Lagos' yellow bus): light grey page, black hero with danfo-yellow stripes, yellow buttons, sharp corners, mono labels",
      "Home order: search hero, shop by part chips, dense in-stock grid, questions, newsletter",
      "Always name the car makes, models and years the seller lists; never guess fitment",
    ],
  },
  {
    id: "turare",
    name: "Turare",
    description: "Moody and elegant for perfume: a dark banner with the bottle on a warm glow, signature scents, a house story, scent-family circles and real reviews.",
    tags: ["perfume", "fragrance", "oud", "elegant", "dark hero", "2026"],
    aiHints: [
      "Turare (Hausa for perfume): ivory page, aubergine-black hero, gold accent, serif headings, soft corners",
      "Home order: glow hero (bottle on a warm glow), signature scents carousel, house story, scent family circles, reviews, newsletter",
      "Describe notes (top, heart, base) only as the seller lists them",
    ],
  },
  {
    id: "oko",
    name: "Oko",
    description: "Earthy and fresh for farm produce and agro: a field banner with a fresh-from-the-farm label, farm tiles, fresh-this-week grid, a farm story and bulk-order questions.",
    tags: ["farm", "agro", "produce", "poultry", "fresh", "2026"],
    aiHints: [
      "Oko (Yoruba for farm): cream page, leaf green hero, harvest gold accent, grotesk headings, rounded cards",
      "Home order: field hero, from the farm tiles, fresh this week grid, farm story, questions, newsletter",
      "Mention weights, crates and bulk prices only as the seller sets them",
    ],
  },
  {
    id: "aaro",
    name: "Àárọ̀",
    description: "Clean and photo-first: a full-width picture banner with a centred headline, featured products in a tidy grid, collection tiles, a short story and simple questions. Free with every store.",
    tags: ["minimal", "any", "clean", "photo-first", "basic", "2026"],
    aiHints: [
      "Àárọ̀ (id aaro, Yoruba for morning): white page, black ink, plain sans headings, square buttons, lots of white space",
      "Home order: full-width image banner (centred headline and button), featured products grid, collections, story, questions, newsletter",
      "Let the photos do the work: keep headlines short and plain",
    ],
  },
  {
    id: "highlife",
    name: "Highlife",
    description: "Retro and colourful: a split banner with a sticker badge and a scrolling ticker, round category picks, a hot-right-now carousel, a colour-block story and real reviews.",
    tags: ["retro", "colourful", "lifestyle", "ticker", "streetwear", "premium", "2026"],
    aiHints: [
      "Highlife (the West African dance music): warm cream page, indigo ink, vermilion accent, bold grotesk headings, pill buttons",
      "Home order: ticker banner (headline beside a framed photo, then a scrolling ribbon), shop by vibe circles, hot right now carousel, colour-block story, reviews, questions, newsletter",
      "Playful, upbeat copy; the ticker repeats the eyebrow, so keep it to two or three words",
    ],
  },
  {
    id: "oba",
    name: "Ọba",
    description: "Quiet luxury: a full-screen photo with a fine serif headline and an underlined link, the collection in a slow carousel, an editorial house story, collection tiles and reviews.",
    tags: ["luxury", "premium", "editorial", "serif", "fashion", "jewellery", "platinum", "2026"],
    aiHints: [
      "Ọba (id oba, Yoruba for king): ivory page, near-black ink, bronze accent, light serif headings, letter-spaced uppercase menu, square corners",
      "Home order: full-screen cinema hero (headline low and centred, underlined 'Discover' link), collection carousel, house story, explore tiles, reviews, private previews newsletter",
      "Say less: short, calm headlines; never use exclamation marks or discount talk in the hero",
    ],
  },
  {
    id: "gbedu",
    name: "Gbẹ̀du",
    description: "Dark and loud: a giant uppercase headline with a glowing gradient over the photo, a scrolling marquee, a turn-it-up carousel, range tiles, a split story and reviews.",
    tags: ["dark", "bold", "tech", "audio", "streetwear", "gradient", "marquee", "platinum", "2026"],
    aiHints: [
      "Gbẹ̀du (id gbedu, the Yoruba royal drum; Naija for a hard-hitting beat): near-black page, violet-to-pink gradient accent, heavy uppercase grotesk headings, white pill buttons",
      "Home order: impact hero (huge headline, gradient glow, marquee strip), turn it up carousel, shop the range tiles, split story, reviews, questions, newsletter",
      "Short, punchy headlines of 2 to 5 words read best at this size",
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
  ewa: { category: "beauty", layoutFamily: "editorial-boutique" },
  suku: { category: "beauty", layoutFamily: "fashion-runway" },
  asoebi: { category: "fashion", layoutFamily: "editorial-boutique" },
  agbada: { category: "fashion", layoutFamily: "editorial-boutique" },
  ileke: { category: "fashion", layoutFamily: "editorial-boutique" },
  ounje: { category: "food", layoutFamily: "food-market" },
  chinchin: { category: "food", layoutFamily: "food-market" },
  oja: { category: "general", layoutFamily: "marketplace-grid" },
  omo: { category: "general", layoutFamily: "minimal-showcase" },
  iwe: { category: "books", layoutFamily: "book-lifestyle" },
  owambe: { category: "general", layoutFamily: "marketplace-grid" },
  danfo: { category: "general", layoutFamily: "electronics-grid" },
  turare: { category: "beauty", layoutFamily: "editorial-boutique" },
  oko: { category: "food", layoutFamily: "food-market" },
  aaro: { category: "minimal", layoutFamily: "minimal-showcase" },
  highlife: { category: "fashion", layoutFamily: "fashion-runway" },
  oba: { category: "fashion", layoutFamily: "editorial-boutique" },
  gbedu: { category: "electronics", layoutFamily: "electronics-grid" },
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

/** Hero layout each theme ships with (the renderer falls back to this when a draft has none). */
export function boutiqueHeroLayout(theme: BoutiqueThemeId) {
  return HERO_SEEDS[theme].layout;
}
