// The 2026 storefront themes (Afẹ́fẹ́, Dúdú, Jẹ́jẹ́, Adire, Mama Put, Ilé, Plug, Waka and the industry themes Ẹwà, Ṣùkú,
// Aṣọ Ẹbí, Agbada, Ìlẹ̀kẹ̀, Oúnjẹ, Chin Chin, Ọjà, Ọmọ, Ìwé, Owambe, Danfo, Turare, Oko). Ids are the stable English/ASCII
// ones ("breeze", "pantry"…); display names live in theme-library.ts. They are ordinary template manifests (so
// /builder/templates, the editor and Rex can pick them), rendered by the boutique storefront renderer
// (src/components/storefront/boutique). Seeds carry no stock photos and no invented reviews or offers: banners and
// story pictures show the theme's stock photos while the page is drawn, until the seller uploads their own
// (themeStockImages in demo-photos.ts); products only ever show the seller's photos, proof comes from real reviews,
// promises from settings.

import type { StoreTemplateManifest, TemplateBlockNode, TemplatePageSeed, TemplateSectionNode, ThemeTokenSet } from "./types";
import { newStoreBlockSection } from "../../components/storefront/boutique/blocks/block-catalog.ts";

export type BoutiqueThemeId =
  | "breeze" | "noir" | "plain" | "adire" | "pantry" | "ile" | "plug" | "stride"
  | "ewa" | "suku" | "asoebi" | "agbada" | "ileke" | "ounje" | "chinchin" | "oja" | "omo" | "iwe" | "owambe" | "danfo" | "turare" | "oko"
  | "aaro" | "highlife" | "oba" | "gbedu"
  | "omalicha" | "zuma" | "oku" | "ihe" | "kasuwa" | "nkata" | "uwa" | "sarauniya" | "zinariya"
  | "irawo" | "asa" | "mmiri" | "uzo" | "rawa" | "fitila" | "oso" | "shakara"
  | "aga" | "itura" | "gele" | "imani" | "itanna"
  | "littafi" | "itan" | "awo" | "kyau" | "keke"
  | "ahia" | "ado" | "wuta" | "ike" | "ewu"
  | "erin" | "apere" | "bata" | "ogba" | "eso"
  | "osan" | "ijokoo" | "ite" | "kujera" | "tufafi"
  | "rewa" | "igbese" | "ola" | "okunrin" | "salubata"
  | "efo" | "aluko" | "aja" | "dara" | "ife"
  | "irorun";

export const BOUTIQUE_THEME_IDS: readonly BoutiqueThemeId[] = [
  "breeze", "noir", "plain", "adire", "pantry", "ile", "plug", "stride",
  "ewa", "suku", "asoebi", "agbada", "ileke", "ounje", "chinchin", "oja", "omo", "iwe", "owambe", "danfo", "turare", "oko",
  "aaro", "highlife", "oba", "gbedu",
  "omalicha", "zuma", "oku", "ihe", "kasuwa", "nkata", "uwa", "sarauniya", "zinariya",
  "irawo", "asa", "mmiri", "uzo", "rawa", "fitila", "oso", "shakara",
  "aga", "itura", "gele", "imani", "itanna",
  "littafi", "itan", "awo", "kyau", "keke",
  "ahia", "ado", "wuta", "ike", "ewu",
  "erin", "apere", "bata", "ogba", "eso",
  "osan", "ijokoo", "ite", "kujera", "tufafi",
  "rewa", "igbese", "ola", "okunrin", "salubata",
  "efo", "aluko", "aja", "dara", "ife",
  "irorun",
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
  // Igbo and Hausa named themes, after more of the theme stores' favourites: soft beauty, handmade craft, sport,
  // gallery, big catalogue, classic, magazine, two-picture fashion and gold jewellery. Each designs its inner
  // pages too (INNER_PAGES below): shop layout, product page extras, about, contact, questions, bag and wishlist.
  omalicha: { heroBg: "#F3E3F0", heroText: "#3A2341", accent: "#B3477D", ctaBg: "#3A2341", ctaText: "#FFFFFF", paperBg: "#FFFBFD", cardBg: "#F7ECF4", ink: "#3A2341", muted: "#7A6280", border: "#EEDDEA", headingStyle: "grotesk", radius: "rounded" },
  zuma: { heroBg: "#EFE4D2", heroText: "#3B2A1A", accent: "#B8792C", ctaBg: "#3B2A1A", ctaText: "#FBF6EE", paperBg: "#FBF6EE", cardBg: "#F2E8D8", ink: "#3B2A1A", muted: "#7C6650", border: "#E6D8C3", headingStyle: "serif", radius: "soft" },
  oku: { heroBg: "#0F0F0F", heroText: "#FFFFFF", accent: "#D4FF3A", ctaBg: "#0F0F0F", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F1F1EE", ink: "#0F0F0F", muted: "#5E5E5A", border: "#E4E4DF", headingStyle: "grotesk", radius: "sharp" },
  ihe: { heroBg: "#F5F3EF", heroText: "#1A1A1A", accent: "#C2410C", ctaBg: "#1A1A1A", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F5F3EF", ink: "#1A1A1A", muted: "#71706B", border: "#E7E4DE", headingStyle: "serif", radius: "sharp" },
  kasuwa: { heroBg: "#0B3B8C", heroText: "#FFFFFF", accent: "#FFB800", ctaBg: "#0B3B8C", ctaText: "#FFFFFF", paperBg: "#F4F6FA", cardBg: "#FFFFFF", ink: "#0F1B33", muted: "#566179", border: "#DDE3EE", headingStyle: "grotesk", radius: "soft" },
  nkata: { heroBg: "#2F3E46", heroText: "#FFFFFF", accent: "#A3684A", ctaBg: "#2F3E46", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F4F1EC", ink: "#22292F", muted: "#66707A", border: "#E3DFD8", headingStyle: "serif", radius: "sharp" },
  uwa: { heroBg: "#F4EFE6", heroText: "#111111", accent: "#D7263D", ctaBg: "#111111", ctaText: "#FFFFFF", paperBg: "#FAF7F2", cardBg: "#F0EBE1", ink: "#111111", muted: "#5F5B54", border: "#E2DCD0", headingStyle: "serif", radius: "sharp" },
  sarauniya: { heroBg: "#1A1A1A", heroText: "#FFFFFF", accent: "#C9A27E", ctaBg: "#1A1A1A", ctaText: "#FFFFFF", paperBg: "#F7F4F0", cardBg: "#EDE7DF", ink: "#1A1A1A", muted: "#6D6862", border: "#E0D9CF", headingStyle: "serif", radius: "sharp" },
  zinariya: { heroBg: "#0F2E26", heroText: "#F5ECD7", accent: "#C9A24A", ctaBg: "#0F2E26", ctaText: "#F5ECD7", paperBg: "#FBF8F1", cardBg: "#F2EBDD", ink: "#14231E", muted: "#5F6B63", border: "#E5DCC8", headingStyle: "serif", radius: "soft" },
  // Product-led and editorial themes: one-product brands, heritage, drinks, a sticky split, a fanned-card party,
  // a room with product pins, a bento grid and a street poster.
  irawo: { heroBg: "#FFE8D6", heroText: "#2B1B17", accent: "#FF5A36", ctaBg: "#FF5A36", ctaText: "#FFFFFF", paperBg: "#FFFAF5", cardBg: "#FFF0E3", ink: "#2B1B17", muted: "#7A5F57", border: "#F3DDCB", headingStyle: "grotesk", radius: "rounded" },
  asa: { heroBg: "#F4E9D8", heroText: "#2E2A1F", accent: "#9E3B22", ctaBg: "#2E2A1F", ctaText: "#FAF4EA", paperBg: "#FAF4EA", cardBg: "#EFE3CF", ink: "#2E2A1F", muted: "#6E6553", border: "#E3D5BD", headingStyle: "serif", radius: "soft" },
  mmiri: { heroBg: "#0B6BCB", heroText: "#FFFFFF", accent: "#FFD23F", ctaBg: "#FFD23F", ctaText: "#0B2545", paperBg: "#F2F8FF", cardBg: "#DCEBFF", ink: "#0B2545", muted: "#4A6283", border: "#CFE0F5", headingStyle: "grotesk", radius: "rounded" },
  uzo: { heroBg: "#1C1B18", heroText: "#F6F5F1", accent: "#3D5A40", ctaBg: "#1C1B18", ctaText: "#F6F5F1", paperBg: "#F6F5F1", cardBg: "#ECEAE3", ink: "#1C1B18", muted: "#6F6C64", border: "#DEDBD2", headingStyle: "grotesk", radius: "soft" },
  rawa: { heroBg: "#FF3D7F", heroText: "#FFFFFF", accent: "#FFE14D", ctaBg: "#151515", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#FFF0F5", ink: "#151515", muted: "#5C5C5C", border: "#F5DCE6", headingStyle: "grotesk", radius: "rounded" },
  fitila: { heroBg: "#2A2420", heroText: "#F5EFE6", accent: "#E8A33D", ctaBg: "#2A2420", ctaText: "#F5EFE6", paperBg: "#FAF7F2", cardBg: "#F0E9DE", ink: "#2A2420", muted: "#776B5E", border: "#E4DACB", headingStyle: "serif", radius: "soft" },
  oso: { heroBg: "#F2EDE6", heroText: "#141414", accent: "#B23A48", ctaBg: "#141414", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F2EDE6", ink: "#141414", muted: "#6B6B6B", border: "#E6E0D8", headingStyle: "serif", radius: "sharp" },
  shakara: { heroBg: "#0A0A0A", heroText: "#F1F1EC", accent: "#FF4F00", ctaBg: "#FF4F00", ctaText: "#0A0A0A", paperBg: "#F1F1EC", cardBg: "#E4E4DD", ink: "#0A0A0A", muted: "#5A5A55", border: "#D6D6CE", headingStyle: "grotesk", radius: "sharp" },
  // From the seller's own inspiration templates (batch 1): a sidebar furniture store, a pale-aqua cut-out store, a
  // fashion mosaic, a department store with a category bar and a minimal sneaker store.
  aga: { heroBg: "#F5F7FA", heroText: "#131212", accent: "#FBB710", ctaBg: "#FBB710", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F5F7FA", ink: "#131212", muted: "#6D6D6D", border: "#EBEBEB", headingStyle: "grotesk", radius: "sharp" },
  itura: { heroBg: "#ECFDFF", heroText: "#222222", accent: "#FF3368", ctaBg: "#FF3368", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F6FBFC", ink: "#222222", muted: "#707070", border: "#EEEEEE", headingStyle: "grotesk", radius: "rounded" },
  gele: { heroBg: "#FDE8E2", heroText: "#111111", accent: "#CA1515", ctaBg: "#CA1515", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F4F4F4", ink: "#111111", muted: "#666666", border: "#EBEBEB", headingStyle: "serif", radius: "sharp" },
  imani: { heroBg: "#3B2E5A", heroText: "#FFFFFF", accent: "#4FC1E9", ctaBg: "#4FC1E9", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F5F5F5", ink: "#222222", muted: "#666666", border: "#E5E5E5", headingStyle: "grotesk", radius: "sharp" },
  itanna: { heroBg: "#FFFBEB", heroText: "#262626", accent: "#F59E0B", ctaBg: "#F59E0B", ctaText: "#111111", paperBg: "#FFFFFF", cardBg: "#FAFAFA", ink: "#262626", muted: "#6B7280", border: "#E5E7EB", headingStyle: "grotesk", radius: "rounded" },
  // Inspiration batch 2: a pastel bookshop, a literary beige bookshop, a red fashion store, a periwinkle fashion
  // store and a slanted bicycle store.
  littafi: { heroBg: "#FCE7EF", heroText: "#1F1F1F", accent: "#F86D72", ctaBg: "#F86D72", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F7F7F7", ink: "#1F1F1F", muted: "#6B6B6B", border: "#EAEAEA", headingStyle: "grotesk", radius: "rounded" },
  itan: { heroBg: "#EFEEE8", heroText: "#2F2F2F", accent: "#9C7A54", ctaBg: "#2F2F2F", ctaText: "#F3F2EC", paperBg: "#F3F2EC", cardBg: "#E9E7DE", ink: "#2F2F2F", muted: "#74706A", border: "#E0DDD3", headingStyle: "serif", radius: "sharp" },
  awo: { heroBg: "#F4F4F4", heroText: "#1E1E27", accent: "#FE4C50", ctaBg: "#FE4C50", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F7F7F7", ink: "#1E1E27", muted: "#6E6E73", border: "#EBEBEB", headingStyle: "grotesk", radius: "sharp" },
  kyau: { heroBg: "#E9ECF2", heroText: "#222222", accent: "#717FE0", ctaBg: "#717FE0", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F3F3F3", ink: "#222222", muted: "#808080", border: "#E6E6E6", headingStyle: "grotesk", radius: "rounded" },
  // Inspiration batch 3: a yellow market, a green menswear store, an orange gadget store, a red-and-navy electronics
  // store and a lavender family fashion store.
  ahia: { heroBg: "#F9C21B", heroText: "#1F1F1F", accent: "#E8590C", ctaBg: "#262626", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F7F7F7", ink: "#262626", muted: "#666666", border: "#ECECEC", headingStyle: "grotesk", radius: "soft" },
  ado: { heroBg: "#2A4F9E", heroText: "#FFFFFF", accent: "#71CD14", ctaBg: "#71CD14", ctaText: "#14250A", paperBg: "#FFFFFF", cardBg: "#F2F2F2", ink: "#222222", muted: "#6F6F6F", border: "#EEEEEE", headingStyle: "grotesk", radius: "sharp" },
  wuta: { heroBg: "#F4F4F4", heroText: "#222222", accent: "#F28B00", ctaBg: "#F28B00", ctaText: "#1A1A1A", paperBg: "#FFFFFF", cardBg: "#F5F5F5", ink: "#222222", muted: "#6E6E6E", border: "#E6E6E6", headingStyle: "grotesk", radius: "rounded" },
  ike: { heroBg: "#E4E7ED", heroText: "#2B2D42", accent: "#D10024", ctaBg: "#D10024", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F6F7F9", ink: "#2B2D42", muted: "#6B7488", border: "#E4E7ED", headingStyle: "grotesk", radius: "soft" },
  ewu: { heroBg: "#EDF1FF", heroText: "#1C1C1C", accent: "#D19C97", ctaBg: "#D19C97", ctaText: "#1C1C1C", paperBg: "#FFFFFF", cardBg: "#EDF1FF", ink: "#1C1C1C", muted: "#6C757D", border: "#E3E7F5", headingStyle: "grotesk", radius: "sharp" },
  // Inspiration batch 4: a red-and-navy fashion store, a grocery store, a calm shoe store, an olive produce market
  // and a green-and-orange fruit store.
  erin: { heroBg: "#E9E6E6", heroText: "#002C3E", accent: "#F7444E", ctaBg: "#E2323C", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F5F5F5", ink: "#002C3E", muted: "#5E6B73", border: "#EAEAEA", headingStyle: "serif", radius: "sharp" },
  apere: { heroBg: "#E6F3FB", heroText: "#222222", accent: "#F2A900", ctaBg: "#222222", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F9F9F9", ink: "#222222", muted: "#6E6E6E", border: "#EFEFEF", headingStyle: "grotesk", radius: "rounded" },
  bata: { heroBg: "#F2F2F2", heroText: "#222222", accent: "#5FAE9F", ctaBg: "#616161", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F7F7F7", ink: "#222222", muted: "#6B6B6B", border: "#E6E6E6", headingStyle: "serif", radius: "sharp" },
  ogba: { heroBg: "#1E1E1E", heroText: "#FFFFFF", accent: "#B0B435", ctaBg: "#B0B435", ctaText: "#111111", paperBg: "#FFFFFF", cardBg: "#F5F5F5", ink: "#111111", muted: "#666666", border: "#E5E5E5", headingStyle: "grotesk", radius: "sharp" },
  eso: { heroBg: "#F4F8EC", heroText: "#45595B", accent: "#81C408", ctaBg: "#81C408", ctaText: "#1E2A0A", paperBg: "#FFFFFF", cardBg: "#F4F6F8", ink: "#3B4D4F", muted: "#66777A", border: "#ECEFF1", headingStyle: "grotesk", radius: "rounded" },
  // Inspiration batch 5: a dark-slate fruit shop, a light furniture showroom, a deep green interior studio, a black
  // and copper furniture store and a monochrome family fashion store.
  osan: { heroBg: "#051922", heroText: "#FFFFFF", accent: "#F28123", ctaBg: "#F28123", ctaText: "#1A1A1A", paperBg: "#FFFFFF", cardBg: "#F5F5F5", ink: "#051922", muted: "#555F66", border: "#EEEEEE", headingStyle: "grotesk", radius: "rounded" },
  ijokoo: { heroBg: "#F6F7FB", heroText: "#2B2B2B", accent: "#E6A23C", ctaBg: "#E6A23C", ctaText: "#1F1F1F", paperBg: "#FFFFFF", cardBg: "#F6F7FB", ink: "#2B2B2B", muted: "#6F6F6F", border: "#ECEDF2", headingStyle: "grotesk", radius: "sharp" },
  ite: { heroBg: "#3B5D50", heroText: "#FFFFFF", accent: "#F9BF29", ctaBg: "#F9BF29", ctaText: "#2F2F2F", paperBg: "#EFF2F1", cardBg: "#DCE5E4", ink: "#2F2F2F", muted: "#5F6664", border: "#DCE5E4", headingStyle: "grotesk", radius: "rounded" },
  kujera: { heroBg: "#F3F1EE", heroText: "#111111", accent: "#B86A22", ctaBg: "#111111", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#EEECEA", ink: "#111111", muted: "#6B6B6B", border: "#E8E6E3", headingStyle: "grotesk", radius: "sharp" },
  tufafi: { heroBg: "#2A2A2A", heroText: "#FFFFFF", accent: "#2A2A2A", ctaBg: "#2A2A2A", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F7F7F7", ink: "#2A2A2A", muted: "#757575", border: "#EEEEEE", headingStyle: "grotesk", radius: "sharp" },
  // Inspiration batch 6: a pink-accent fashion house, an orange sneaker store, a refined fashion editorial, a cream
  // menswear store and a khaki shoe shop.
  rewa: { heroBg: "#2B2B2B", heroText: "#FFFFFF", accent: "#E8074A", ctaBg: "#E8074A", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F5F5F5", ink: "#232323", muted: "#6B6B6B", border: "#EBEBEB", headingStyle: "grotesk", radius: "sharp" },
  igbese: { heroBg: "#FFFFFF", heroText: "#222222", accent: "#FF7A00", ctaBg: "#FF7A00", ctaText: "#1A1A1A", paperBg: "#FFFFFF", cardBg: "#F3F4F8", ink: "#222222", muted: "#6F6F78", border: "#EAEAF0", headingStyle: "grotesk", radius: "rounded" },
  ola: { heroBg: "#F4F4F4", heroText: "#222222", accent: "#C9741C", ctaBg: "#222222", ctaText: "#FFFFFF", paperBg: "#F4F4F4", cardBg: "#FFFFFF", ink: "#222222", muted: "#6B6B6B", border: "#E7E7E7", headingStyle: "grotesk", radius: "sharp" },
  okunrin: { heroBg: "#F3F2EE", heroText: "#111111", accent: "#E53637", ctaBg: "#111111", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F3F2EE", ink: "#111111", muted: "#6F6F6F", border: "#EBEBEB", headingStyle: "grotesk", radius: "sharp" },
  salubata: { heroBg: "#DBCC8F", heroText: "#111111", accent: "#7A6A28", ctaBg: "#111111", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F8F9FA", ink: "#111111", muted: "#666666", border: "#EEEEEE", headingStyle: "grotesk", radius: "sharp" },
  // Inspiration batch 7: a green vegetable market, a slate-blue lookbook store, a cream pet shop, a bright split
  // fashion store and a serif boutique in taupe.
  efo: { heroBg: "#1E2A12", heroText: "#FFFFFF", accent: "#82AE46", ctaBg: "#82AE46", ctaText: "#14200A", paperBg: "#FFFFFF", cardBg: "#F7F6F2", ink: "#1E1E1E", muted: "#6B6B6B", border: "#ECECEC", headingStyle: "grotesk", radius: "rounded" },
  aluko: { heroBg: "#2E2E2E", heroText: "#FFFFFF", accent: "#6F8BA4", ctaBg: "#2E2E2E", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#EEF4F8", ink: "#1D1D1D", muted: "#6E6E6E", border: "#E6E6E6", headingStyle: "grotesk", radius: "rounded" },
  aja: { heroBg: "#F9F3EC", heroText: "#41403E", accent: "#C88A3E", ctaBg: "#41403E", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F9F3EC", ink: "#41403E", muted: "#7A7672", border: "#ECE6DF", headingStyle: "grotesk", radius: "soft" },
  dara: { heroBg: "#FFFFFF", heroText: "#111111", accent: "#F96D00", ctaBg: "#F96D00", ctaText: "#1A1A1A", paperBg: "#FFFFFF", cardBg: "#F8F9FA", ink: "#111111", muted: "#6B6B6B", border: "#EEEEEE", headingStyle: "grotesk", radius: "rounded" },
  ife: { heroBg: "#2A2522", heroText: "#FFFFFF", accent: "#8E7363", ctaBg: "#2F2A27", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F5F1EE", ink: "#2A2522", muted: "#6E6560", border: "#E6DED8", headingStyle: "serif", radius: "sharp" },
  // Inspiration batch 8: clean casual wear with heavy black headlines.
  irorun: { heroBg: "#ECECEC", heroText: "#111111", accent: "#4F8DAA", ctaBg: "#111111", ctaText: "#FFFFFF", paperBg: "#FFFFFF", cardBg: "#F7F7F7", ink: "#111111", muted: "#6B6B6B", border: "#EAEAEA", headingStyle: "grotesk", radius: "sharp" },
  keke: { heroBg: "#2B5061", heroText: "#FFFFFF", accent: "#F7BE74", ctaBg: "#F7BE74", ctaText: "#1B2B33", paperBg: "#FFFFFF", cardBg: "#F2F5F6", ink: "#1B2B33", muted: "#5F6F77", border: "#E1E6E8", headingStyle: "grotesk", radius: "sharp" },
  gbedu: { heroBg: "#0B0B0F", heroText: "#F5F5F7", accent: "#8B5CF6", ctaBg: "#F5F5F7", ctaText: "#0B0B0F", paperBg: "#0B0B0F", cardBg: "#17171F", ink: "#F5F5F7", muted: "#A1A1AA", border: "#26262E", headingStyle: "grotesk", radius: "soft" },
};

const NAV = ["home", "products", "about", "contact"];

type HeaderLayout = "split" | "centered" | "bold" | "sidebar" | "market" | "market-dark";

function announcement() {
  // Empty text: the storefront derives the bar from shipping zones and payment settings, or hides it.
  return section("announcement", "announcement-bar", "Announcement Bar", { text: "" }, { settings: { source: "store-settings" } });
}

function header(layout: HeaderLayout, cartLabel = "My bag", categoryBar = false) {
  return section("header", "header", "Header", { navLinks: NAV, utilityLinks: ["wishlist", "cart"], cartLabel }, { settings: { layout, search: true, wishlist: true, cart: true, ...(categoryBar ? { categoryBar: true } : {}) } });
}

function footer() {
  return section("footer", "footer", "Footer", { summary: "" }, { settings: { layout: "boutique", showPayments: true } });
}

function newsletter(copy: { title?: string; body?: string; layout?: "split" | "photo" } = {}) {
  return section("newsletter", "newsletter", "Newsletter", {
    title: copy.title ?? "Subscribe to new drops",
    body: copy.body ?? "Be first to hear about new pieces. No spam.",
    buttonLabel: "Subscribe",
    placeholder: "WhatsApp number or email",
  }, copy.layout ? { settings: { layout: copy.layout } } : undefined);
}

/**
 * Product rows on the home page: a carousel, a 4-up grid, a dense 6-up catalogue (Ọjà, Danfo), a menu list (Oúnjẹ),
 * one big product beside four (spotlight) or big alternating rows (lookbook).
 */
type RailLayout = "carousel" | "tiles" | "dense" | "menu" | "spotlight" | "lookbook" | "category-tabs" | "lists" | "feature" | "showcase" | "by-category" | "mini" | "intro" | "per-category" | "overlay" | "deal";

/** `extra`: card options (quickAdd, showRating, hoverImage) or layout options (listColumns). */
function bestSellers(layout: RailLayout, title = "Best sellers", cta = "Shop all", id = "featured-products", extra: Record<string, unknown> = {}) {
  return section(id, "featured-products", "Best Sellers", { title, cta }, { settings: { layout, source: "best-sellers", allowMapping: true, ...extra } });
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
  omalicha: { layout: "omalicha-card", eyebrow: "Self-care, simplified", title: "Feel good in your own skin", primaryCta: "Shop the range" },
  zuma: { layout: "zuma-collage", eyebrow: "Handmade in small batches", title: "Made by hand, made to last", primaryCta: "Shop the makers" },
  oku: { layout: "oku-diagonal", eyebrow: "New season", title: "Go further, go faster", primaryCta: "Shop the gear" },
  ihe: { layout: "ihe-gallery", eyebrow: "New works", title: "Pieces worth a second look", primaryCta: "View the collection" },
  kasuwa: { layout: "kasuwa-mosaic", eyebrow: "This week's picks", title: "Everything you need, in one store", primaryCta: "Start shopping" },
  nkata: { layout: "nkata-frame", eyebrow: "New arrivals", title: "Timeless pieces for every day", primaryCta: "Shop new arrivals" },
  uwa: { layout: "uwa-cover", eyebrow: "The new issue", title: "The season, edited", primaryCta: "Shop the edit" },
  sarauniya: { layout: "sarauniya-duo", eyebrow: "The new collection", title: "Dressed like royalty", primaryCta: "Shop the collection" },
  zinariya: { layout: "zinariya-arch", eyebrow: "Fine jewellery", title: "Gold that tells your story", primaryCta: "Discover jewellery" },
  irawo: { layout: "irawo-product", eyebrow: "Our best seller", title: "The one everyone's talking about", primaryCta: "Get yours" },
  asa: { layout: "asa-stamp", eyebrow: "Made the old way", title: "Flavours passed down, made fresh", primaryCta: "Shop the range" },
  mmiri: { layout: "mmiri-wave", eyebrow: "Ice cold", title: "Refreshment, bottled", primaryCta: "Pick your flavour" },
  uzo: { layout: "uzo-sticky", eyebrow: "The collection", title: "Made for the road ahead", primaryCta: "Explore the collection" },
  rawa: { layout: "rawa-fan", eyebrow: "New drop", title: "Dress loud, dance louder", primaryCta: "Shop the drop" },
  fitila: { layout: "fitila-room", eyebrow: "Shop the room", title: "Light that makes a house a home", primaryCta: "Shop lighting" },
  oso: { layout: "oso-bento", eyebrow: "The new season", title: "Dressed in the details", primaryCta: "Shop new in" },
  shakara: { layout: "shakara-poster", eyebrow: "Drop 01", title: "No dulling", primaryCta: "Cop the drop" },
  aga: { layout: "aga-masonry", eyebrow: "New this week", title: "Pieces for every room", primaryCta: "Shop all" },
  itura: { layout: "itura-cutout", eyebrow: "", title: "Comfort you can see", primaryCta: "Buy now" },
  gele: { layout: "gele-mosaic", eyebrow: "", title: "Women's fashion", primaryCta: "Shop now" },
  imani: { layout: "imani-split", eyebrow: "New collection", title: "Fashion for everyone", primaryCta: "Shop now" },
  itanna: { layout: "itanna-centered", eyebrow: "", title: "Step into style", primaryCta: "Shop the collection" },
  littafi: { layout: "littafi-gradient", eyebrow: "New this month", title: "The book collection", primaryCta: "Shop collection" },
  itan: { layout: "itan-cover", eyebrow: "", title: "Stories worth staying up for", primaryCta: "Read more" },
  awo: { layout: "awo-banner", eyebrow: "New season", title: "New arrivals are here", primaryCta: "Shop now" },
  kyau: { layout: "kyau-season", eyebrow: "The new collection", title: "New season", primaryCta: "Shop now" },
  keke: { layout: "keke-slant", eyebrow: "Best seller", title: "Ride further, ride better", primaryCta: "Shop now" },
  ahia: { layout: "ahia-yellow", eyebrow: "", title: "Get started on your favourite shopping", primaryCta: "Buy now" },
  ado: { layout: "ado-model", eyebrow: "New collection", title: "Show your personal style", primaryCta: "View collection" },
  wuta: { layout: "wuta-deal", eyebrow: "This week's pick", title: "The latest gadgets, delivered", primaryCta: "Shop now" },
  ike: { layout: "ike-deal", eyebrow: "New this week", title: "Fresh stock just landed", primaryCta: "Shop now" },
  ewu: { layout: "ewu-menu", eyebrow: "New collection", title: "Fashionable dresses", primaryCta: "Shop now" },
  erin: { layout: "erin-split", eyebrow: "", title: "New styles for everyone", primaryCta: "Shop now" },
  apere: { layout: "apere-trio", eyebrow: "This week", title: "Fresh juice and summer smoothies", primaryCta: "Shop now" },
  bata: { layout: "bata-full", eyebrow: "New season", title: "Shoes for every step", primaryCta: "Shop now" },
  ogba: { layout: "ogba-slides", eyebrow: "", title: "Fresh from the farm", primaryCta: "Shop new" },
  osan: { layout: "osan-center", eyebrow: "Fresh and organic", title: "Delicious seasonal fruits", primaryCta: "Fruit collection" },
  ijokoo: { layout: "ijokoo-cutout", eyebrow: "Great design collection", title: "Furniture made to be lived with", primaryCta: "Shop now" },
  ite: { layout: "ite-green", eyebrow: "", title: "Modern interior design studio", primaryCta: "Shop now" },
  kujera: { layout: "kujera-slides", eyebrow: "New in", title: "Comfort for every room", primaryCta: "View details" },
  tufafi: { layout: "tufafi-mosaic", eyebrow: "", title: "Style for the whole family", primaryCta: "Shop now" },
  rewa: { layout: "rewa-trends", eyebrow: "New this season", title: "Fashion trends", primaryCta: "Shop now" },
  igbese: { layout: "igbese-stripes", eyebrow: "Just landed", title: "The new collection", primaryCta: "Shop now" },
  ola: { layout: "ola-duo", eyebrow: "With an outstanding style, only for you", title: "Exclusively designed for you", primaryCta: "Shop now" },
  okunrin: { layout: "okunrin-circle", eyebrow: "New collection", title: "Fall and winter collection", primaryCta: "Shop now" },
  salubata: { layout: "salubata-cutout", eyebrow: "New arrival", title: "New shoes, winter collection", primaryCta: "Discover now" },
  efo: { layout: "efo-full", eyebrow: "We deliver organic vegetables and fruits", title: "Fresh and organic foods", primaryCta: "View details" },
  aluko: { layout: "aluko-lookbook", eyebrow: "This season", title: "The lookbook", primaryCta: "See more" },
  aja: { layout: "aja-circle", eyebrow: "Save on pet essentials", title: "The best place for your pets", primaryCta: "Shop now" },
  dara: { layout: "dara-split", eyebrow: "Online fashion store", title: "Thoroughly modern style", primaryCta: "Shop now" },
  ife: { layout: "ife-split", eyebrow: "New in", title: "New collection", primaryCta: "Shop now" },
  irorun: { layout: "irorun-bold", eyebrow: "", title: "Summer collection", primaryCta: "Shop it now" },
  eso: { layout: "eso-search", eyebrow: "Fresh produce", title: "Fresh veggies and fruit, delivered", primaryCta: "Search" },
};

function hero(theme: BoutiqueThemeId): TemplateSectionNode {
  const seed = HERO_SEEDS[theme];
  return section("hero", "hero-split", "Hero", { eyebrow: seed.eyebrow, title: seed.title, body: "", primaryCta: seed.primaryCta }, { settings: { layout: seed.layout, primaryButtonAction: "products" }, items: [] });
}

/** Category row look: round picks, wide tiles, compact chips (dense catalogues and menus), full-width banners or a mosaic. */
type CategoryLayout = "chips" | "boutique-tiles" | "boutique-circles" | "boutique-stack" | "boutique-mosaic" | "boutique-cards" | "boutique-words" | "boutique-labels" | "boutique-bordered" | "boutique-diagonal" | "boutique-counts" | "boutique-promo" | "boutique-duo" | "boutique-captioned" | "boutique-trio" | "boutique-halves" | "boutique-exclusive" | "boutique-staggered" | "boutique-panels" | "boutique-center" | "boutique-lookbook" | "boutique-overlap" | "boutique-shopbar" | "boutique-bold";

const CATEGORY_LAYOUT: Record<BoutiqueThemeId, CategoryLayout> = {
  breeze: "boutique-tiles", noir: "boutique-circles", plain: "boutique-circles", adire: "boutique-circles", pantry: "boutique-circles",
  ile: "boutique-tiles", plug: "chips", stride: "boutique-tiles",
  ewa: "boutique-circles", suku: "boutique-tiles", asoebi: "boutique-tiles", agbada: "boutique-tiles", ileke: "boutique-circles",
  ounje: "chips", chinchin: "boutique-circles", oja: "chips", omo: "boutique-circles", iwe: "chips", owambe: "boutique-tiles",
  danfo: "chips", turare: "boutique-circles", oko: "boutique-tiles",
  aaro: "boutique-tiles", highlife: "boutique-circles", oba: "boutique-tiles", gbedu: "boutique-tiles",
  omalicha: "boutique-circles", zuma: "boutique-circles", oku: "boutique-tiles", ihe: "chips", kasuwa: "chips", nkata: "boutique-tiles",
  uwa: "chips", sarauniya: "boutique-tiles", zinariya: "boutique-circles",
  irawo: "boutique-circles", asa: "boutique-stack", mmiri: "boutique-mosaic", uzo: "boutique-mosaic", rawa: "boutique-circles",
  fitila: "boutique-stack", oso: "boutique-mosaic", shakara: "boutique-stack",
  aga: "chips", itura: "boutique-cards", gele: "boutique-mosaic", imani: "boutique-words", itanna: "chips",
  littafi: "boutique-tiles", itan: "chips", awo: "boutique-labels", kyau: "boutique-bordered", keke: "boutique-cards",
  ahia: "boutique-circles", ado: "boutique-tiles", wuta: "boutique-promo", ike: "boutique-diagonal", ewu: "boutique-counts",
  erin: "boutique-tiles", apere: "boutique-cards", bata: "boutique-duo", ogba: "boutique-captioned", eso: "boutique-labels",
  osan: "boutique-circles", ijokoo: "boutique-trio", ite: "boutique-tiles", kujera: "boutique-tiles", tufafi: "boutique-labels",
  rewa: "boutique-halves", igbese: "boutique-mosaic", ola: "boutique-exclusive", okunrin: "boutique-staggered", salubata: "boutique-panels",
  efo: "boutique-center", aluko: "boutique-lookbook", aja: "chips", dara: "boutique-overlap", ife: "boutique-shopbar",
  irorun: "boutique-bold",
};

function categories(theme: BoutiqueThemeId, title = "Shop by category", id = "categories", layout: CategoryLayout = CATEGORY_LAYOUT[theme]) {
  return section(id, "category-grid", "Shop by Category", { title }, { settings: { layout, source: "store-categories" } });
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
  omalicha: "centered", zuma: "editorial", oku: "banner", ihe: "centered", nkata: "editorial", uwa: "banner", sarauniya: "editorial", zinariya: "noir-split",
  irawo: "overlap", asa: "editorial", mmiri: "centered", uzo: "overlap", rawa: "banner", fitila: "overlap", oso: "overlap", shakara: "banner",
  aga: "boutique", itura: "overlap", gele: "banner", imani: "banner", itanna: "centered",
  littafi: "centered", itan: "quote", awo: "editorial", kyau: "framed", keke: "banner",
  ahia: "centered", ado: "promo", wuta: "promo", ike: "banner", ewu: "editorial",
  erin: "editorial", apere: "editorial", bata: "centered", ogba: "banner", eso: "band",
  osan: "editorial", ijokoo: "panel", ite: "collage", kujera: "centered", tufafi: "collage",
  rewa: "panel", igbese: "promo", ola: "banner", okunrin: "editorial", salubata: "framed",
  efo: "editorial", aluko: "word", aja: "promo", dara: "editorial", ife: "quote",
  irorun: "editorial",
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
  omalicha: { eyebrow: "Our promise", title: "Gentle on skin, kind to you" },
  zuma: { eyebrow: "The makers", title: "Made slowly, by hand" },
  oku: { eyebrow: "Built for motion", title: "Gear that keeps up with you" },
  ihe: { eyebrow: "The studio", title: "Every piece, chosen with care" },
  kasuwa: { eyebrow: "Why shop with us", title: "One store for everything" },
  nkata: { eyebrow: "Our story", title: "Made to be worn for years" },
  uwa: { eyebrow: "Editor's letter", title: "What we're loving this season" },
  sarauniya: { eyebrow: "The house", title: "For the woman who leads" },
  zinariya: { eyebrow: "The workshop", title: "Crafted by our goldsmiths" },
  irawo: { eyebrow: "Why we made it", title: "One product, made properly" },
  asa: { eyebrow: "Our heritage", title: "Recipes we grew up on" },
  mmiri: { eyebrow: "What's inside", title: "Real fruit, nothing to hide" },
  uzo: { eyebrow: "The journey", title: "Built slowly, made to travel" },
  rawa: { eyebrow: "The vibe", title: "Made for the dance floor" },
  fitila: { eyebrow: "The studio", title: "Made to glow for years" },
  oso: { eyebrow: "The atelier", title: "Every stitch, considered" },
  shakara: { eyebrow: "Who we are", title: "Made on the street, for the street" },
  aga: { eyebrow: "Our workshop", title: "Furniture made to be lived with" },
  itura: { eyebrow: "Why we do it", title: "Comfort, made to last" },
  gele: { eyebrow: "The collection", title: "Wrapped in colour" },
  imani: { eyebrow: "Our promise", title: "Something for everyone" },
  itanna: { eyebrow: "Why us", title: "Comfort in every step" },
  littafi: { eyebrow: "Our shop", title: "Books for every reader" },
  itan: { eyebrow: "Quote of the day", title: "" },
  awo: { eyebrow: "Our story", title: "Colour for every day" },
  kyau: { eyebrow: "Our story", title: "Made with care, worn with pride" },
  keke: { eyebrow: "About our store", title: "Bikes for every road" },
  ahia: { eyebrow: "About us", title: "Everything you need, one market" },
  ado: { eyebrow: "The new season", title: "Dress the part" },
  wuta: { eyebrow: "Why shop with us", title: "Genuine gadgets, honest prices" },
  ike: { eyebrow: "Our promise", title: "Tech that keeps up with you" },
  ewu: { eyebrow: "Our story", title: "Clothes for the whole family" },
  erin: { eyebrow: "#NewArrivals", title: "Fresh styles every week" },
  apere: { eyebrow: "Our store", title: "Fresh groceries, delivered" },
  bata: { eyebrow: "", title: "It started with a simple idea: shoes we wanted to wear ourselves" },
  ogba: { eyebrow: "About us", title: "From the farm to your table" },
  eso: { eyebrow: "In our store", title: "Fresh exotic fruits" },
  osan: { eyebrow: "About us", title: "Fresh fruit, picked for you" },
  ijokoo: { eyebrow: "Collection", title: "Dining tables for every home" },
  ite: { eyebrow: "Our studio", title: "We help you make a modern home" },
  kujera: { eyebrow: "", title: "Made for the way you live and work" },
  tufafi: { eyebrow: "Explore", title: "Something for everyone in the family" },
  rewa: { eyebrow: "Just in", title: "The everyday edit" },
  igbese: { eyebrow: "New season", title: "Built to move" },
  ola: { eyebrow: "Collection", title: "Urban stories" },
  okunrin: { eyebrow: "Our story", title: "Clothes for the modern man" },
  salubata: { eyebrow: "Our story", title: "Shoes for every walk of life" },
  efo: { eyebrow: "Our farm", title: "Grown fresh, delivered fresh" },
  aluko: { eyebrow: "fashion", title: "The lookbook" },
  aja: { eyebrow: "For happy pets", title: "Everything your pet needs" },
  dara: { eyebrow: "About us", title: "A better way to shop for clothes" },
  ife: { eyebrow: "Our promise", title: "" },
  irorun: { eyebrow: "About us", title: "Easy clothes for every day" },
};

/** Story pictures on the right (the rest keep the picture left). */
const STORY_PICTURE_RIGHT: Partial<Record<BoutiqueThemeId, true>> = { sarauniya: true, uzo: true, oso: true, rewa: true };

function story(theme: BoutiqueThemeId, own?: { id: string; eyebrow: string; title: string; pictureRight?: boolean }) {
  const copy = own ?? STORY_COPY[theme] ?? { eyebrow: "Our studio", title: "Made with care" };
  return section(
    own?.id ?? "story",
    "story-split",
    "Our Story",
    // Promo panels and colour bands open the shop.
    { eyebrow: copy.eyebrow, title: copy.title, body: "", primaryCta: (STORY_LAYOUT[theme] === "promo" || STORY_LAYOUT[theme] === "band") && !own ? "Shop now" : "Our story" },
    { settings: { layout: STORY_LAYOUT[theme] ?? "boutique", ...(STORY_PICTURE_RIGHT[theme] || own?.pictureRight ? { imagePosition: "right" } : {}) }, items: [] },
  );
}

/**
 * A ready-made block (blocks/block-catalog.ts) with its starter content, plus this theme's words and settings.
 * Starter content follows the seed rules: nothing invented reaches shoppers until the seller fills it in.
 */
function readyBlock(kind: string, id: string, overrides: { copy?: Record<string, unknown>; settings?: Record<string, unknown> } = {}): TemplateSectionNode {
  const base = newStoreBlockSection(kind, id);
  if (!base) throw new Error(`Unknown block ${kind}`);
  if (overrides.copy) base.blocks[0] = { ...base.blocks[0], content: { ...base.blocks[0].content, ...overrides.copy } };
  if (overrides.settings) base.settings = { ...base.settings, ...overrides.settings };
  return base;
}

type FaqKind = "fit" | "food" | "auto" | "rental" | "general";

const FAQ_KIND: Partial<Record<BoutiqueThemeId, FaqKind>> = {
  // The first eight themes keep their original questions, so drafts made on them still compare equal to their seeds.
  ounje: "food", chinchin: "food", oja: "general", oko: "food", danfo: "auto", owambe: "rental", iwe: "general",
  ewa: "general", turare: "general", ileke: "general",
  aaro: "general", highlife: "general", oba: "general", gbedu: "general",
  omalicha: "general", zuma: "general", oku: "general", ihe: "general", kasuwa: "general", nkata: "general", uwa: "general", sarauniya: "general", zinariya: "general",
  irawo: "general", asa: "food", mmiri: "food", uzo: "general", rawa: "general", fitila: "general", oso: "fit", shakara: "fit",
  aga: "general", itura: "general", gele: "fit", imani: "general", itanna: "fit",
  littafi: "general", itan: "general", awo: "fit", kyau: "fit", keke: "general",
  ahia: "general", ado: "fit", wuta: "general", ike: "general", ewu: "fit",
  erin: "fit", apere: "food", bata: "fit", ogba: "food", eso: "food",
  osan: "food", ijokoo: "general", ite: "general", kujera: "general", tufafi: "fit",
  rewa: "fit", igbese: "fit", ola: "fit", okunrin: "fit", salubata: "fit",
  efo: "food", aluko: "fit", aja: "general", dara: "fit", ife: "fit",
  irorun: "fit",
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
  omalicha: "centered", zuma: "centered", oku: "bold", ihe: "split", kasuwa: "split", nkata: "centered", uwa: "centered", sarauniya: "split", zinariya: "centered",
  irawo: "split", asa: "centered", mmiri: "split", uzo: "split", rawa: "bold", fitila: "centered", oso: "centered", shakara: "bold",
  aga: "sidebar", itura: "split", gele: "split", imani: "split", itanna: "split",
  littafi: "split", itan: "centered", awo: "split", kyau: "split", keke: "split",
  ahia: "market-dark", ado: "split", wuta: "market", ike: "market-dark", ewu: "market",
  erin: "split", apere: "market", bata: "split", ogba: "centered", eso: "split",
  osan: "split", ijokoo: "split", ite: "split", kujera: "split", tufafi: "split",
  rewa: "centered", igbese: "split", ola: "split", okunrin: "split", salubata: "split",
  efo: "split", aluko: "split", aja: "market", dara: "split", ife: "centered",
  irorun: "split",
};

/** Themes with a dark strip of categories under the header (Imani, Wuta). */
const CATEGORY_BAR: Partial<Record<BoutiqueThemeId, true>> = { imani: true, wuta: true };

const CART_LABEL: Partial<Record<BoutiqueThemeId, string>> = { ounje: "My order", chinchin: "My order", oja: "My basket", oko: "My basket", kasuwa: "My cart", nkata: "My basket", apere: "My basket", ogba: "My basket", eso: "My basket", osan: "My basket", efo: "My basket" };

function page(theme: BoutiqueThemeId, pageType: TemplatePageSeed["pageType"], title: string, slug: string, body: TemplateSectionNode[], themeName: string): TemplatePageSeed {
  return {
    id: `${theme}-${pageType}`,
    pageType,
    title,
    slug,
    sections: [announcement(), header(HEADER_LAYOUT[theme], CART_LABEL[theme], CATEGORY_BAR[theme] === true), ...body, footer()],
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
    case "omalicha":
      return [
        hero("omalicha"),
        readyBlock("trust-badges", "trust", { settings: { style: "row" } }),
        categories("omalicha", "Shop by concern"),
        bestSellers("carousel", "Customer favourites"),
        story("omalicha"),
        reviews("Real skin, real results"),
        faq("omalicha"),
        newsletter({ title: "Glow notes", body: "Routines, launches and restocks. No spam." }),
      ];
    case "zuma":
      return [
        hero("zuma"),
        bestSellers("tiles", "Made by hand", "See everything"),
        readyBlock("founder-story", "founder", { copy: { eyebrow: "A note from the maker", title: "Why we make things by hand" } }),
        categories("zuma", "Browse the workshop"),
        readyBlock("trust-badges", "trust", { settings: { style: "cards" } }),
        newsletter({ title: "From the workshop", body: "New pieces and small-batch drops, first." }),
      ];
    case "oku":
      return [
        readyBlock("ticker-bar", "ticker", { settings: { tone: "accent", speed: "fast" } }),
        hero("oku"),
        readyBlock("tabbed-products", "tabs", { copy: { title: "Gear up" } }),
        readyBlock("collection-grid", "collections", { copy: { title: "Shop by sport" }, settings: { shape: "landscape", columns: 3, labels: "overlay", hover: "zoom" } }),
        bestSellers("carousel", "Trending now"),
        story("oku"),
        reviews("From the crew"),
        newsletter({ title: "Join the crew", body: "Drops, restocks and race-day deals." }),
      ];
    case "ihe":
      return [
        hero("ihe"),
        bestSellers("tiles", "Latest works", "View all works"),
        story("ihe"),
        readyBlock("collection-grid", "collections", { copy: { title: "Collections" }, settings: { shape: "portrait", columns: 3, labels: "below", hover: "lift" } }),
        newsletter({ title: "Studio notes", body: "New works and exhibitions, a few times a year." }),
      ];
    case "kasuwa":
      return [
        hero("kasuwa"),
        readyBlock("trust-badges", "trust", { settings: { style: "row" } }),
        categories("kasuwa", "Shop by department"),
        readyBlock("tabbed-products", "tabs", { copy: { title: "Top picks", bestLabel: "Best sellers", newLabel: "Just in", saleLabel: "Deals" } }),
        bestSellers("dense", "Everyday essentials", "See everything"),
        readyBlock("collection-grid", "collections", { copy: { title: "Popular collections" }, settings: { shape: "square", columns: 5, labels: "below", hover: "lift" } }),
        faq("kasuwa"),
        newsletter({ title: "Deals in your inbox", body: "Weekly deals and restocks, by WhatsApp or email." }),
      ];
    case "nkata":
      return [
        hero("nkata"),
        readyBlock("collection-grid", "collections", { copy: { title: "Shop by collection" }, settings: { shape: "square", columns: 3, labels: "overlay", hover: "zoom" } }),
        bestSellers("carousel", "New arrivals"),
        story("nkata"),
        reviews("What customers say"),
        readyBlock("trust-badges", "trust", { settings: { style: "row" } }),
        newsletter({ title: "Stay in the loop", body: "New arrivals and stories from the studio." }),
      ];
    case "uwa":
      return [
        hero("uwa"),
        bestSellers("tiles", "In this issue", "Shop the issue"),
        readyBlock("shoppable-story", "journal", { copy: { eyebrow: "From the journal", title: "How to wear it now" } }),
        story("uwa"),
        categories("uwa", "Sections"),
        newsletter({ title: "Get the next issue", body: "The edit, once a month, in your inbox." }),
      ];
    case "sarauniya":
      return [
        hero("sarauniya"),
        bestSellers("carousel", "New in"),
        readyBlock("collection-grid", "collections", { copy: { title: "Shop the edit" }, settings: { shape: "portrait", columns: 2, labels: "overlay", hover: "zoom" } }),
        story("sarauniya"),
        reviews("Worn and loved"),
        newsletter({ title: "The inner circle", body: "Private previews and first access to new pieces." }),
      ];
    case "zinariya":
      return [
        hero("zinariya"),
        categories("zinariya", "Shop by piece"),
        bestSellers("carousel", "Signature pieces"),
        readyBlock("founder-story", "founder", { copy: { eyebrow: "From our goldsmith", title: "Every piece starts at the bench" } }),
        readyBlock("trust-badges", "trust", { settings: { style: "cards" } }),
        reviews("Treasured by our customers"),
        newsletter({ title: "First to see new pieces", body: "Small batches, announced here first." }),
      ];
    case "irawo":
      return [
        hero("irawo"),
        readyBlock("trust-badges", "trust", { settings: { style: "row" } }),
        bestSellers("spotlight", "The line-up"),
        story("irawo"),
        reviews("People love it"),
        faq("irawo"),
        newsletter({ title: "Be first for restocks", body: "It sells out. We'll tell you when it's back." }),
      ];
    case "asa":
      return [
        hero("asa"),
        categories("asa", "Our range"),
        bestSellers("tiles", "Fresh from our kitchen"),
        story("asa"),
        readyBlock("founder-story", "founder", { copy: { eyebrow: "From our family", title: "Why we still do it the old way" } }),
        faq("asa"),
        newsletter({ title: "From our kitchen", body: "New batches and seasonal specials, first." }),
      ];
    case "mmiri":
      return [
        hero("mmiri"),
        bestSellers("carousel", "Pick your flavour"),
        categories("mmiri", "Find your favourite"),
        story("mmiri"),
        reviews("Thirsty customers say"),
        faq("mmiri"),
        newsletter({ title: "Stay refreshed", body: "New flavours and bulk deals for parties and offices." }),
      ];
    case "uzo":
      return [
        hero("uzo"),
        bestSellers("lookbook", "The journey"),
        categories("uzo", "Explore"),
        story("uzo"),
        reviews("Along the way"),
        newsletter({ title: "Notes from the road", body: "New pieces and stories, a few times a month." }),
      ];
    case "rawa":
      return [
        hero("rawa"),
        bestSellers("spotlight", "Hot drops"),
        categories("rawa", "Shop the vibe"),
        readyBlock("tabbed-products", "tabs", { copy: { title: "On repeat" } }),
        reviews("The crowd says"),
        newsletter({ title: "Get on the list", body: "Drops and party-season deals, first." }),
      ];
    case "fitila":
      return [
        hero("fitila"),
        categories("fitila", "Shop by room"),
        bestSellers("tiles", "New in"),
        story("fitila"),
        readyBlock("trust-badges", "trust", { settings: { style: "cards" } }),
        newsletter({ title: "Home notes", body: "New pieces and styling ideas, monthly." }),
      ];
    case "oso":
      return [
        hero("oso"),
        bestSellers("carousel", "Just landed"),
        categories("oso", "Shop the edit"),
        bestSellers("lookbook", "Editorial", "Shop all", "editorial-products"),
        reviews("Worn by you"),
        newsletter({ title: "First look", body: "New collections, before they go live." }),
      ];
    case "shakara":
      return [
        readyBlock("ticker-bar", "ticker", { settings: { tone: "accent", speed: "fast" } }),
        hero("shakara"),
        bestSellers("spotlight", "The drop"),
        categories("shakara", "Shop the range"),
        story("shakara"),
        reviews("Seen on the street"),
        newsletter({ title: "No dulling", body: "Drops go fast. Get the alert." }),
      ];
    case "aga":
      return [
        hero("aga"),
        categories("aga", "Shop by room"),
        bestSellers("tiles", "New this week", "Shop all", "featured-products", { hoverImage: true }),
        story("aga"),
        newsletter({ title: "Subscribe for first dibs", body: "New pieces and restocks, before anyone else." }),
      ];
    case "itura":
      return [
        hero("itura"),
        categories("itura", "Featured categories"),
        bestSellers("tiles", "Awesome picks", "Shop all", "featured-products", { quickAdd: true }),
        payday(),
        bestSellers("carousel", "Best sellers", "Shop all", "best-sellers"),
        story("itura"),
        newsletter({ title: "Join our newsletter", body: "Weekly picks and payday deals." }),
      ];
    case "gele":
      return [
        hero("gele"),
        bestSellers("category-tabs", "New products", "Shop all", "featured-products", { showRating: true }),
        story("gele"),
        bestSellers("lists", "Shop the lists", "Shop all", "product-lists"),
        payday(),
        readyBlock("trust-badges", "trust", { settings: { style: "row" } }),
        readyBlock("ugc-grid", "ugc", { copy: { title: "Seen on you", body: "Tag us in your gèlè to be featured." }, settings: { columns: 6 } }),
        newsletter({ title: "Join the list", body: "New arrivals and payday deals, first." }),
      ];
    case "imani":
      return [
        hero("imani"),
        categories("imani", "Shop by category"),
        readyBlock("tabbed-products", "tabs", { copy: { title: "Our products", bestLabel: "Featured", newLabel: "New arrivals", saleLabel: "On sale" } }),
        story("imani"),
        bestSellers("tiles", "Trending now"),
        readyBlock("press-logos", "brands", { copy: { title: "Brands we stock" } }),
        newsletter({ title: "Subscribe for offers", body: "Deals and new arrivals, every week." }),
      ];
    case "itanna":
      return [
        hero("itanna"),
        bestSellers("tiles", "Latest drops", "Shop all", "featured-products", { quickAdd: true, showRating: true, hoverImage: true }),
        readyBlock("trust-badges", "trust", { settings: { style: "cards" } }),
        reviews("Happy feet"),
        newsletter({ title: "Get first dibs", body: "New releases and restocks, straight to you." }),
      ];
    case "littafi":
      return [
        hero("littafi"),
        readyBlock("trust-badges", "trust", { settings: { style: "row" } }),
        bestSellers("carousel", "Best selling books", "View all", "featured-products", { showRating: true }),
        payday(),
        bestSellers("lists", "Browse the lists", "View all", "product-lists", { listColumns: 4 }),
        categories("littafi", "Categories"),
        reviews("Readers say"),
        newsletter({ title: "Join our reading list", body: "New releases and offers, once a week." }),
      ];
    case "itan":
      return [
        hero("itan"),
        readyBlock("press-logos", "publishers", { copy: { title: "Publishers we stock" } }),
        bestSellers("tiles", "Featured books", "View all products"),
        bestSellers("feature", "Best selling book", "Shop it now", "best-seller"),
        bestSellers("category-tabs", "Popular books", "View all", "popular-books"),
        story("itan"),
        bestSellers("carousel", "Books with offer", "View all", "offers"),
        newsletter({ title: "Subscribe to our newsletter", body: "New arrivals, reading lists and offers." }),
      ];
    case "awo":
      return [
        hero("awo"),
        categories("awo", "Shop by category"),
        bestSellers("category-tabs", "New arrivals"),
        payday(),
        bestSellers("carousel", "Best sellers", "Shop all", "best-sellers"),
        readyBlock("trust-badges", "trust", { settings: { style: "row" } }),
        newsletter({ title: "Newsletter", body: "Subscribe for new arrivals and offers." }),
      ];
    case "kyau":
      return [
        hero("kyau"),
        categories("kyau", "Shop by category"),
        bestSellers("category-tabs", "Product overview", "Shop all", "featured-products", { hoverImage: true }),
        newsletter({ title: "Stay in style", body: "New arrivals and members-only offers." }),
      ];
    case "keke":
      return [
        hero("keke"),
        bestSellers("showcase", "Our range"),
        story("keke"),
        reviews("What riders say"),
        newsletter({ title: "Ride with us", body: "New models and service tips, monthly." }),
      ];
    case "ahia":
      return [
        hero("ahia"),
        bestSellers("by-category", "Shop the market", "See more"),
        trustRow(),
        bestSellers("tiles", "Today's picks", "Shop all", "todays-picks"),
        newsletter({ title: "Hear about new stock first", body: "New arrivals and offers, once a week." }),
      ];
    case "ado":
      return [
        hero("ado"),
        trustCards(),
        bestSellers("tiles", "Featured products", "Shop all"),
        story("ado"),
        bestSellers("spotlight", "New products", "Shop all", "new-products"),
        bestSellers("tiles", "Inspired products", "Shop all", "inspired", { limit: 8 }),
        reviews("What customers say"),
        newsletter({ title: "Newsletter", body: "New arrivals and members-only offers." }),
      ];
    case "wuta":
      return [
        hero("wuta"),
        trustRow(),
        categories("wuta", "Shop by category"),
        bestSellers("category-tabs", "Our products"),
        bestSellers("mini", "Best sellers", "Shop all", "best-sellers"),
        reviews("What customers say"),
        newsletter({ title: "Get the latest deals", body: "New gadgets and restocks in your inbox." }),
      ];
    case "ike":
      return [
        hero("ike"),
        categories("ike", "Collections"),
        bestSellers("category-tabs", "New products"),
        payday(),
        bestSellers("lists", "Top selling", "View all", "top-selling"),
        newsletter({ title: "Sign up for the newsletter", body: "New stock, price drops and restocks." }),
      ];
    case "ewu":
      return [
        hero("ewu"),
        trustCards(),
        categories("ewu", "Shop by category"),
        categories("ewu", "Collections", "collections", "boutique-promo"),
        bestSellers("tiles", "Trendy products"),
        newsletter({ title: "Stay updated", body: "New arrivals for the whole family, once a week." }),
        bestSellers("tiles", "Just arrived", "Shop all", "just-arrived"),
      ];
    case "erin":
      return [
        hero("erin"),
        trustTiles("dark", "Why shop with us"),
        story("erin"),
        bestSellers("tiles", "Our products", "View all products", "featured-products", { limit: 12 }),
        newsletter({ title: "Subscribe for our offers", body: "New arrivals and members-only offers in your inbox." }),
        reviews("What customers say"),
      ];
    case "apere":
      return [
        hero("apere"),
        categories("apere", "Category"),
        bestSellers("category-tabs", "Trending products", "View all", "featured-products", { quickAdd: true }),
        categories("apere", "Collections", "collections", "boutique-promo"),
        bestSellers("carousel", "Best selling products", "View all", "best-selling", { quickAdd: true }),
        newsletter({ title: "Get first pick of fresh stock", body: "New arrivals and weekly offers, straight to you.", layout: "split" }),
        bestSellers("carousel", "Just arrived", "View all", "just-arrived", { quickAdd: true }),
      ];
    case "bata":
      return [
        hero("bata"),
        story("bata"),
        categories("bata", "Shop the collections"),
        bestSellers("tiles", "Best sellers", "Shop all products", "featured-products", { limit: 8 }),
        readyBlock("press-logos", "brands", { copy: { title: "Brands we stock" } }),
        newsletter({ title: "Join the club", body: "New styles and restocks, once a week." }),
      ];
    case "ogba":
      return [
        hero("ogba"),
        categories("ogba", "Shop by category"),
        categories("ogba", "This week", "collections", "boutique-promo"),
        bestSellers("category-tabs", "Fruits and vegetables"),
        story("ogba"),
        newsletter({ title: "Fresh news", body: "What's in season, every week." }),
      ];
    case "eso":
      return [
        hero("eso"),
        trustTiles("tiles"),
        bestSellers("category-tabs", "Our organic products", "View all", "featured-products", { quickAdd: true }),
        categories("eso", "Shop by category"),
        story("eso"),
        bestSellers("mini", "Bestseller products", "View all", "best-sellers", { round: true }),
        reviews("What customers say"),
        newsletter({ title: "Fresh deals every week", body: "Seasonal fruit and vegetables, straight to you." }),
      ];
    case "osan":
      return [
        hero("osan"),
        trustRow(),
        bestSellers("tiles", "Our products", "View all", "featured-products", { quickAdd: true }),
        story("osan"),
        reviews("What customers say"),
        newsletter({ title: "Fresh news", body: "What's in season and new arrivals, once a week." }),
      ];
    case "ijokoo":
      return [
        hero("ijokoo"),
        categories("ijokoo", "Shop by category"),
        bestSellers("tiles", "New arrivals"),
        story("ijokoo"),
        bestSellers("tiles", "Featured products", "Shop all", "featured", { showRating: true }),
        readyBlock("press-logos", "brands", { copy: { title: "Brands we stock" } }),
        newsletter({ title: "Newsletter", body: "New pieces and restocks, once a month." }),
      ];
    case "ite":
      return [
        hero("ite"),
        bestSellers("intro", "Crafted with excellent material", "Explore"),
        trustTiles("tiles", "Why choose us"),
        story("ite"),
        bestSellers("mini", "Popular picks", "Shop all", "popular"),
        reviews("Testimonials"),
        newsletter({ title: "Subscribe to our newsletter", body: "New pieces and design ideas, once a month." }),
      ];
    case "kujera":
      return [
        hero("kujera"),
        bestSellers("carousel", "Our favourite collection", "Shop all"),
        story("kujera"),
        categories("kujera", "Shop by room"),
        reviews("What customers say"),
        newsletter({ title: "Stay in the loop", body: "New arrivals and offers in your inbox." }),
      ];
    case "tufafi":
      return [
        hero("tufafi"),
        bestSellers("per-category", "Latest"),
        story("tufafi"),
        readyBlock("ugc-grid", "ugc", { copy: { title: "Social media", body: "Tag us to be featured." } }),
        newsletter({ title: "Subscribe to our newsletter", body: "New arrivals for the whole family." }),
      ];
    case "rewa":
      return [
        hero("rewa"),
        trustStrip(),
        categories("rewa", "Collections"),
        bestSellers("category-tabs", "New arrivals"),
        story("rewa"),
        reviews("Testimonials"),
        newsletter({ title: "Subscribe to our newsletter", body: "New arrivals and offers, once a week." }),
      ];
    case "igbese":
      return [
        hero("igbese"),
        trustCards(),
        categories("igbese", "Shop by category"),
        bestSellers("tiles", "Latest products", "Shop all", "featured-products", { quickAdd: true }),
        deal("Exclusive hot deal"),
        bestSellers("lists", "Deals of the week", "Shop all", "lists"),
        newsletter({ title: "Newsletter", body: "New drops and restocks, straight to you." }),
      ];
    case "ola":
      return [
        hero("ola"),
        bestSellers("tiles", "Best deals", "View all"),
        categories("ola", "Be exclusive"),
        bestSellers("overlay", "Check out new arrivals", "View all", "new-arrivals"),
        bestSellers("category-tabs", "Shop by category", "View all", "by-category"),
        story("ola"),
        bestSellers("carousel", "Best sellers", "View all", "best-sellers"),
        newsletter({ title: "Join the list", body: "New collections and private offers." }),
      ];
    case "okunrin":
      return [
        hero("okunrin"),
        categories("okunrin", "Collections"),
        bestSellers("category-tabs", "Best sellers"),
        deal("Deal of the week"),
        story("okunrin"),
        readyBlock("ugc-grid", "ugc", { copy: { title: "Instagram", body: "Tag us to be featured." } }),
        newsletter({ title: "Newsletter", body: "Be the first to know about new arrivals and offers." }),
      ];
    case "salubata":
      return [
        hero("salubata"),
        trustTiles("tiles"),
        bestSellers("tiles", "New shoes arrival"),
        categories("salubata", "Collections"),
        deal("Deal of the month"),
        reviews("Our satisfied customers say"),
        readyBlock("ugc-grid", "ugc", { copy: { title: "Follow us on Instagram", body: "Tag us in your pair." } }),
      ];
    case "efo":
      return [
        hero("efo"),
        trustTiles("tiles"),
        categories("efo", "Shop by category"),
        bestSellers("tiles", "Our products", "View all", "featured-products", { quickAdd: true }),
        deal("Deal of the day"),
        reviews("Our satisfied customers say"),
        newsletter({ title: "Subscribe to our newsletter", body: "Weekly updates on fresh stock and special offers.", layout: "split" }),
      ];
    case "aluko":
      return [
        hero("aluko"),
        trustRow(),
        categories("aluko", "Collections"),
        bestSellers("category-tabs", "Latest products"),
        story("aluko"),
        readyBlock("press-logos", "brands", { copy: { title: "Brands we stock" } }),
        newsletter({ title: "Subscribe to our newsletter", body: "New arrivals and the lookbook, once a month." }),
      ];
    case "aja":
      return [
        hero("aja"),
        categories("aja", "Shop by pet"),
        bestSellers("tiles", "Popular picks", "Shop now", "featured-products", { quickAdd: true }),
        story("aja"),
        bestSellers("category-tabs", "Shop by category", "Shop now", "by-category"),
        reviews("What pet parents say"),
        newsletter({ title: "Join the pack", body: "Pet care tips and offers, once a month." }),
      ];
    case "dara":
      return [
        hero("dara"),
        story("dara"),
        bestSellers("tiles", "Best sellers", "Shop all", "featured-products", { showRating: true }),
        categories("dara", "Collections"),
        bestSellers("tiles", "Products", "Shop all", "products", { limit: 8 }),
        reviews("Our satisfied customers say"),
        newsletter({ title: "Subscribe to our newsletter", body: "New arrivals and offers in your inbox." }),
      ];
    case "ife":
      return [
        hero("ife"),
        categories("ife", "Shop the edit"),
        bestSellers("tiles", "New arrivals", "View all", "featured-products", { quickAdd: true }),
        readyBlock("ugc-grid", "ugc", { copy: { title: "#wish", body: "Tag us to be featured." } }),
        story("ife"),
        newsletter({ title: "Subscribe for news and offers", body: "First look at new collections.", layout: "photo" }),
      ];
    case "irorun":
      return [
        hero("irorun"),
        bestSellers("carousel", "Featured products", "View all products"),
        categories("irorun", "Collections"),
        newsletter({ title: "Get first pick of new drops", body: "New arrivals and members-only offers, straight to your inbox.", layout: "split" }),
        bestSellers("category-tabs", "Best selling products", "View all", "best-selling"),
        reviews("What customers say"),
        readyBlock("ugc-grid", "ugc", { copy: { title: "Shop our Instagram", body: "Tag us to be featured." } }),
      ];
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
  omalicha: "boutique-gallery",
  zuma: "editorial-gallery",
  oku: "wide-gallery",
  ihe: "editorial-gallery",
  kasuwa: "spec-sheet",
  nkata: "boutique-gallery",
  uwa: "editorial-gallery",
  sarauniya: "wide-gallery",
  zinariya: "editorial-gallery",
  irawo: "wide-gallery",
  asa: "stacked",
  mmiri: "stacked",
  uzo: "editorial-gallery",
  rawa: "wide-gallery",
  fitila: "editorial-gallery",
  oso: "editorial-gallery",
  shakara: "wide-gallery",
  aga: "boutique-gallery",
  itura: "boutique-gallery",
  gele: "editorial-gallery",
  imani: "boutique-gallery",
  itanna: "boutique-gallery",
  littafi: "boutique-gallery",
  itan: "editorial-gallery",
  awo: "boutique-gallery",
  kyau: "boutique-gallery",
  keke: "wide-gallery",
  ahia: "boutique-gallery",
  ado: "boutique-gallery",
  wuta: "boutique-gallery",
  ike: "boutique-gallery",
  ewu: "boutique-gallery",
  erin: "boutique-gallery",
  apere: "boutique-gallery",
  bata: "boutique-gallery",
  ogba: "boutique-gallery",
  eso: "boutique-gallery",
  osan: "boutique-gallery",
  ijokoo: "boutique-gallery",
  ite: "boutique-gallery",
  kujera: "boutique-gallery",
  tufafi: "boutique-gallery",
  rewa: "boutique-gallery",
  igbese: "boutique-gallery",
  ola: "boutique-gallery",
  okunrin: "boutique-gallery",
  salubata: "boutique-gallery",
  efo: "boutique-gallery",
  aluko: "boutique-gallery",
  aja: "boutique-gallery",
  dara: "boutique-gallery",
  ife: "editorial-gallery",
  irorun: "boutique-gallery",
};

const RELATED_TITLE: Partial<Record<BoutiqueThemeId, string>> = {
  pantry: "Goes well with", ounje: "Add to your order", chinchin: "Goes well with", oja: "You may also need", danfo: "Often bought with",
  iwe: "Readers also picked", owambe: "Complete the setup", ewa: "Complete the routine", oko: "Also fresh",
  aaro: "You may also like", oba: "Complete the look", gbedu: "Pairs well with",
  omalicha: "Complete your routine", zuma: "More from the makers", oku: "Gear up with", ihe: "More works", kasuwa: "Customers also bought",
  nkata: "You may also like", uwa: "Also in this issue", sarauniya: "Complete the look", zinariya: "Pairs beautifully with",
  irawo: "Goes well with", asa: "Goes well with", mmiri: "Mix and match", uzo: "Continue the journey", rawa: "On repeat",
  fitila: "Light up the room", oso: "Complete the look", shakara: "Complete the fit",
  aga: "You may also like", itura: "Best sellers", gele: "Related products", imani: "Related products", itanna: "You might also like",
  littafi: "Readers also bought", itan: "You may also like", awo: "Related products", kyau: "Related products", keke: "More bikes",
  ahia: "See more like this", ado: "Related products", wuta: "Related products", ike: "Related products", ewu: "You may also like",
  erin: "Related products", apere: "Related products", bata: "Related products", ogba: "Related products", eso: "Related products",
  osan: "Related products", ijokoo: "Related products", ite: "Related products", kujera: "Related products", tufafi: "Related products",
  rewa: "Related products", igbese: "Related products", ola: "Related products", okunrin: "Related products", salubata: "Related products",
  efo: "Related products", aluko: "Related products", aja: "Related products", dara: "Related products", ife: "Related products",
  irorun: "Related products",
};

/**
 * How a theme designs its inner pages. Themes without an entry keep the pages they were seeded with (their saved
 * drafts compare equal to those seeds when switching theme).
 */
interface InnerPages {
  /** Settings for the shop page's product grid: a browse layout (filters column, category tiles or rows, chips) or the classic grid's view. */
  shop: Record<string, unknown>;
  /** Extra sections under the product page's related products. */
  product?: TemplateSectionNode[];
  /** The about page's sections (the story is always one of them). */
  about: TemplateSectionNode[];
  contactLayout?: "split" | "card";
  faq: { layout?: "cards" | "two-column"; faqStyle?: "plus" | "chevron" | "cards" | "numbered" | "split" | "boxed"; searchable?: boolean };
  cart?: TemplateSectionNode[];
  wishlist?: TemplateSectionNode[];
  /** A title banner ("Shop", "About" with a Home / page trail) at the top of the shop, about, contact, FAQ and bag pages. */
  pageHeader?: "tinted" | "photo" | "simple";
}

function pageHeader(style: InnerPages["pageHeader"]): TemplateSectionNode[] {
  return style ? [section("page-header", "page-header", "Page title banner", { title: "", body: "" }, { settings: { layout: style }, items: [] })] : [];
}

const trustRow = () => readyBlock("trust-badges", "trust", { settings: { style: "row" } });
const trustCards = () => readyBlock("trust-badges", "trust", { settings: { style: "cards" } });
/** The seller's sale window (Payday countdown settings) for "deal" product sections. */
const DEAL_WINDOW = { paydayRule: "day-of-month", paydayDay: 25, weekendToFriday: true, saleEnds: "sunday", saleDays: 3 };
const deal = (title: string) => bestSellers("deal", title, "Shop now", "deal", DEAL_WINDOW);
/** Three coloured blocks under the header with the store's promises (Rẹ̀wà). */
const trustStrip = () => readyBlock("trust-badges", "trust", { settings: { style: "strip" } });

/** Centred badges with the icon above: "dark" on the ink colour (Ẹ̀rín), "tiles" on light panels (Èso). */
const trustTiles = (style: "dark" | "tiles", title = "") => readyBlock("trust-badges", "trust", { copy: { title }, settings: { style } });
const alsoLike = (title = "You may also like") => readyBlock("also-like", "also-like", { copy: { title } });
const recentlyViewed = (title = "Recently viewed") => readyBlock("recently-viewed", "recently-viewed", { copy: { title } });

const INNER_PAGES: Partial<Record<BoutiqueThemeId, () => InnerPages>> = {
  irorun: () => ({
    pageHeader: "simple",
    shop: { filterPlacement: "sidebar", columns: "4" },
    product: [alsoLike("You may also like"), recentlyViewed()],
    about: [story("irorun"), trustCards(), reviews("What customers say")],
    contactLayout: "split",
    faq: { faqStyle: "plus", searchable: true },
    cart: [alsoLike("Complete the look")],
  }),
  efo: () => ({
    pageHeader: "photo",
    shop: { shopLayout: "chips", columns: "4" },
    product: [trustRow(), alsoLike("Related products")],
    about: [story("efo"), trustTiles("tiles"), reviews("Our satisfied customers say")],
    contactLayout: "split",
    faq: { faqStyle: "plus", searchable: true },
    cart: [alsoLike("Add something fresh")],
  }),
  aluko: () => ({
    pageHeader: "photo",
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [alsoLike("You may also like"), recentlyViewed()],
    about: [story("aluko"), trustRow()],
    contactLayout: "split",
    faq: { faqStyle: "chevron" },
    cart: [alsoLike("Complete the look")],
  }),
  aja: () => ({
    pageHeader: "tinted",
    shop: { filterPlacement: "sidebar", columns: "4" },
    product: [trustRow(), alsoLike("Your pet may also like")],
    about: [story("aja"), trustCards(), reviews("What pet parents say")],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "chevron", searchable: true },
    cart: [alsoLike("Add a treat")],
  }),
  dara: () => ({
    pageHeader: "tinted",
    shop: { filterPlacement: "top", columns: "4" },
    product: [alsoLike("You may also like")],
    about: [story("dara"), trustCards()],
    contactLayout: "split",
    faq: { faqStyle: "plus" },
    cart: [alsoLike("Complete the look")],
  }),
  ife: () => ({
    pageHeader: "photo",
    shop: { shopLayout: "chips", columns: "3" },
    product: [alsoLike("You may also like"), recentlyViewed()],
    about: [story("ife", { id: "about-story", eyebrow: "Our story", title: "Made to be loved" }), trustCards()],
    contactLayout: "split",
    faq: { faqStyle: "numbered" },
    cart: [alsoLike("Complete the look")],
  }),
  rewa: () => ({
    pageHeader: "photo",
    shop: { filterPlacement: "top", columns: "3" },
    product: [trustRow(), alsoLike("You may also like")],
    about: [story("rewa"), trustStrip(), reviews("Testimonials")],
    contactLayout: "split",
    faq: { faqStyle: "plus" },
    cart: [alsoLike("Complete the look")],
  }),
  igbese: () => ({
    pageHeader: "tinted",
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [trustRow(), alsoLike("You may also like"), recentlyViewed()],
    about: [story("igbese"), trustCards()],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "chevron", searchable: true },
    cart: [alsoLike("Add socks or laces")],
  }),
  ola: () => ({
    pageHeader: "simple",
    shop: { shopLayout: "chips", columns: "4" },
    product: [alsoLike("You may also like"), recentlyViewed()],
    about: [story("ola"), trustCards()],
    contactLayout: "split",
    faq: { faqStyle: "numbered" },
    cart: [alsoLike("Complete the look")],
  }),
  okunrin: () => ({
    pageHeader: "tinted",
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [alsoLike("You may also like")],
    about: [story("okunrin"), trustCards()],
    contactLayout: "split",
    faq: { faqStyle: "chevron", searchable: true },
    cart: [alsoLike("Complete the look")],
  }),
  salubata: () => ({
    pageHeader: "tinted",
    shop: { filterPlacement: "sidebar", columns: "4" },
    product: [trustRow(), alsoLike("You may also like")],
    about: [story("salubata"), trustTiles("tiles"), reviews("Our satisfied customers say")],
    contactLayout: "split",
    faq: { faqStyle: "plus" },
    cart: [alsoLike("Add another pair")],
  }),
  osan: () => ({
    pageHeader: "photo",
    shop: { filterPlacement: "top", columns: "3" },
    product: [trustRow(), alsoLike("You may also like")],
    about: [story("osan"), trustCards(), reviews("What customers say")],
    contactLayout: "split",
    faq: { faqStyle: "plus", searchable: true },
    cart: [alsoLike("Add more fruit")],
  }),
  ijokoo: () => ({
    pageHeader: "tinted",
    shop: { filterPlacement: "sidebar", columns: "4" },
    product: [alsoLike("You may also like"), recentlyViewed()],
    about: [story("ijokoo"), readyBlock("press-logos", "brands", { copy: { title: "Brands we stock" } })],
    contactLayout: "split",
    faq: { faqStyle: "chevron" },
    cart: [alsoLike("Complete the room")],
  }),
  ite: () => ({
    pageHeader: "tinted",
    shop: { shopLayout: "chips", columns: "3" },
    product: [trustRow(), alsoLike("You may also like")],
    about: [story("ite"), trustTiles("tiles", "Why choose us"), reviews("Testimonials")],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "plus" },
    cart: [alsoLike("Complete the room")],
  }),
  kujera: () => ({
    pageHeader: "simple",
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [alsoLike("You may also like"), recentlyViewed()],
    about: [story("kujera"), trustCards()],
    contactLayout: "split",
    faq: { faqStyle: "numbered" },
    cart: [alsoLike("You may also like")],
  }),
  tufafi: () => ({
    pageHeader: "photo",
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [alsoLike("You may also like")],
    about: [story("tufafi"), trustCards()],
    contactLayout: "split",
    faq: { faqStyle: "chevron", searchable: true },
    cart: [alsoLike("Complete the look")],
  }),
  erin: () => ({
    pageHeader: "tinted",
    shop: { filterPlacement: "top", columns: "3" },
    product: [alsoLike("More to love")],
    about: [story("erin"), trustTiles("dark", "Why shop with us")],
    contactLayout: "split",
    faq: { faqStyle: "plus" },
    cart: [alsoLike("You may also like")],
  }),
  apere: () => ({
    pageHeader: "simple",
    shop: { shopLayout: "filters", columns: "4" },
    product: [trustRow(), alsoLike("Customers also bought")],
    about: [story("apere"), trustCards()],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "chevron", searchable: true },
    cart: [alsoLike("Don't forget")],
  }),
  bata: () => ({
    pageHeader: "photo",
    shop: { filterPlacement: "sidebar", columns: "4" },
    product: [alsoLike("You might also like"), recentlyViewed()],
    about: [story("bata"), trustCards()],
    contactLayout: "split",
    faq: { faqStyle: "chevron" },
    cart: [alsoLike("Complete the look")],
  }),
  ogba: () => ({
    pageHeader: "photo",
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [trustRow(), alsoLike("Fresh picks")],
    about: [story("ogba"), trustCards()],
    contactLayout: "split",
    faq: { faqStyle: "numbered", searchable: true },
    cart: [alsoLike("Add something fresh")],
  }),
  eso: () => ({
    pageHeader: "tinted",
    shop: { shopLayout: "chips", columns: "4" },
    product: [trustRow(), alsoLike("You may also like")],
    about: [story("eso"), trustTiles("tiles"), reviews("What customers say")],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "plus" },
    cart: [alsoLike("Add more fruit")],
  }),
  ahia: () => ({
    pageHeader: "tinted",
    shop: { filterPlacement: "top", columns: "3" },
    product: [alsoLike("See more like this"), recentlyViewed()],
    about: [story("ahia"), trustCards()],
    contactLayout: "split",
    faq: { faqStyle: "chevron", searchable: true },
    cart: [alsoLike("Add to your basket")],
  }),
  ado: () => ({
    pageHeader: "photo",
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [trustRow(), alsoLike("You may also like")],
    about: [story("ado", { id: "about-story", eyebrow: "Our story", title: "Style made simple" }), trustCards()],
    contactLayout: "split",
    faq: { faqStyle: "plus" },
    cart: [alsoLike("You may also like")],
  }),
  wuta: () => ({
    pageHeader: "tinted",
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [trustRow(), alsoLike("Customers also viewed"), recentlyViewed()],
    about: [story("wuta"), trustCards()],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "chevron", searchable: true },
    cart: [alsoLike("Customers also bought")],
  }),
  ike: () => ({
    pageHeader: "simple",
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [trustRow(), recentlyViewed()],
    about: [story("ike"), trustRow()],
    contactLayout: "split",
    faq: { faqStyle: "numbered" },
    cart: [alsoLike("You may also need")],
  }),
  ewu: () => ({
    pageHeader: "tinted",
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [alsoLike("You may also like")],
    about: [story("ewu"), trustCards()],
    contactLayout: "split",
    faq: { faqStyle: "chevron" },
    cart: [alsoLike("You may also like")],
  }),
  littafi: () => ({
    pageHeader: "simple",
    shop: { shopLayout: "filters", columns: "3" },
    product: [alsoLike("Readers also bought"), recentlyViewed()],
    about: [story("littafi"), readyBlock("trust-badges", "trust", { settings: { style: "cards" } })],
    contactLayout: "split",
    faq: { faqStyle: "chevron", searchable: true },
    cart: [alsoLike("Add another book")],
  }),
  itan: () => ({
    pageHeader: "simple",
    shop: { filterPlacement: "sidebar", columns: "4" },
    product: [alsoLike("You may also like")],
    about: [story("itan", { id: "about-story", eyebrow: "Our shop", title: "A bookshop for slow reading" }), story("itan")],
    contactLayout: "split",
    faq: { faqStyle: "numbered" },
    cart: [alsoLike("One more chapter")],
  }),
  awo: () => ({
    pageHeader: "simple",
    shop: { filterPlacement: "sidebar", columns: "4" },
    product: [trustRow(), alsoLike("You may also like")],
    about: [story("awo"), trustRow()],
    contactLayout: "split",
    faq: { faqStyle: "plus" },
    cart: [alsoLike("You may also like")],
  }),
  kyau: () => ({
    pageHeader: "photo",
    shop: { shopLayout: "chips", columns: "4", hoverImage: true },
    product: [alsoLike("You may also like")],
    about: [story("kyau"), story("kyau", { id: "mission", eyebrow: "Our mission", title: "Good clothes, fairly priced", pictureRight: true })],
    contactLayout: "split",
    faq: { faqStyle: "chevron" },
    cart: [alsoLike("You may also like")],
  }),
  keke: () => ({
    pageHeader: "tinted",
    shop: { columns: "3", filterPlacement: "top" },
    product: [trustRow(), alsoLike("More bikes")],
    about: [story("keke"), trustCards(), reviews("What riders say")],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "chevron" },
    cart: [alsoLike("Add accessories")],
  }),
  aga: () => ({
    shop: { shopLayout: "filters", columns: "2" },
    product: [alsoLike()],
    about: [story("aga"), trustRow()],
    contactLayout: "split",
    faq: { faqStyle: "plus" },
    cart: [alsoLike("Complete the room")],
  }),
  itura: () => ({
    pageHeader: "tinted",
    shop: { filterPlacement: "sidebar", columns: "3", quickAdd: true },
    product: [readyBlock("review-carousel", "review-carousel"), alsoLike("Best sellers")],
    about: [story("itura"), categories("itura", "Featured categories")],
    contactLayout: "split",
    faq: { faqStyle: "chevron" },
    cart: [alsoLike("Best sellers")],
  }),
  gele: () => ({
    pageHeader: "simple",
    shop: { filterPlacement: "sidebar", columns: "3", showRating: true },
    product: [alsoLike("You may also like"), readyBlock("ugc-grid", "ugc", { copy: { title: "Seen on you", body: "Tag us in your gèlè to be featured." }, settings: { columns: 6 } })],
    about: [story("gele"), readyBlock("trust-badges", "trust", { settings: { style: "row" } })],
    contactLayout: "split",
    faq: { faqStyle: "plus" },
    cart: [alsoLike("You may also like")],
  }),
  imani: () => ({
    pageHeader: "photo",
    shop: { filterPlacement: "sidebar", columns: "4" },
    product: [readyBlock("tabbed-products", "tabs", { copy: { title: "More to love", bestLabel: "Featured", newLabel: "New arrivals", saleLabel: "On sale" } })],
    about: [story("imani"), readyBlock("press-logos", "brands", { copy: { title: "Brands we stock" } })],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "chevron" },
    cart: [alsoLike("Customers also bought")],
  }),
  itanna: () => ({
    shop: { shopLayout: "chips", columns: "4" },
    product: [trustCards(), alsoLike("You might also like")],
    about: [story("itanna"), trustCards()],
    contactLayout: "card",
    faq: { faqStyle: "cards" },
    cart: [alsoLike("You might also like")],
  }),
  irawo: () => ({
    shop: { shopLayout: "chips", columns: "3" },
    product: [trustRow(), alsoLike("Goes well with")],
    about: [story("irawo"), trustCards(), reviews("People love it")],
    contactLayout: "card",
    faq: { layout: "cards" },
    cart: [alsoLike("Add one more")],
  }),
  asa: () => ({
    shop: { shopLayout: "tiles", columns: "3" },
    product: [trustRow()],
    about: [readyBlock("founder-story", "founder", { copy: { eyebrow: "From our family", title: "Why we still do it the old way" } }), story("asa"), categories("asa", "Our range")],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "numbered" },
    cart: [alsoLike("Goes well with")],
  }),
  mmiri: () => ({
    shop: { columns: "3", filterPlacement: "top" },
    product: [alsoLike("Mix and match")],
    about: [story("mmiri"), trustCards()],
    contactLayout: "card",
    faq: { faqStyle: "chevron", searchable: true },
    cart: [readyBlock("shipping-progress", "free-delivery"), alsoLike("Add a few more")],
  }),
  uzo: () => ({
    shop: { shopLayout: "filters", columns: "3" },
    product: [recentlyViewed()],
    about: [story("uzo"), readyBlock("founder-story", "founder")],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "chevron" },
    cart: [alsoLike("Continue the journey")],
  }),
  rawa: () => ({
    shop: { shopLayout: "carousels" },
    product: [alsoLike("On repeat")],
    about: [story("rawa"), readyBlock("ugc-grid", "ugc", { copy: { title: "On the dance floor", body: "Tag us to be featured." } })],
    faq: { layout: "cards" },
    cart: [alsoLike("Don't forget")],
    wishlist: [recentlyViewed()],
  }),
  fitila: () => ({
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [trustCards(), alsoLike("Light up the room")],
    about: [story("fitila"), readyBlock("collection-grid", "collections", { copy: { title: "Shop by room" }, settings: { shape: "landscape", columns: 3, labels: "overlay", hover: "zoom" } })],
    contactLayout: "split",
    faq: { faqStyle: "numbered" },
    cart: [alsoLike("Complete the room")],
  }),
  oso: () => ({
    shop: { shopView: "large", filterPlacement: "top" },
    product: [alsoLike("Complete the look"), recentlyViewed()],
    about: [story("oso"), readyBlock("collection-grid", "collections", { copy: { title: "Shop the edit" }, settings: { shape: "portrait", columns: 3, labels: "below", hover: "lift" } })],
    contactLayout: "card",
    faq: { faqStyle: "split" },
    cart: [recentlyViewed()],
    wishlist: [alsoLike()],
  }),
  shakara: () => ({
    shop: { shopLayout: "chips", columns: "4" },
    product: [alsoLike("Complete the fit")],
    about: [story("shakara"), readyBlock("ugc-grid", "ugc", { copy: { title: "Seen on the street", body: "Tag us in your fit to be featured." } })],
    contactLayout: "split",
    faq: { layout: "cards" },
    cart: [alsoLike("Complete the fit")],
  }),
  omalicha: () => ({
    shop: { shopView: "list", filterPlacement: "top" },
    product: [trustRow(), recentlyViewed()],
    about: [story("omalicha"), trustCards(), reviews("Real skin, real results")],
    contactLayout: "card",
    faq: { faqStyle: "chevron", searchable: true },
    cart: [alsoLike("Add to your routine")],
    wishlist: [recentlyViewed()],
  }),
  zuma: () => ({
    shop: { shopLayout: "tiles", columns: "3" },
    product: [trustCards()],
    about: [readyBlock("founder-story", "founder", { copy: { eyebrow: "A note from the maker", title: "Why we make things by hand" } }), story("zuma"), categories("zuma", "Browse the workshop")],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "plus" },
    cart: [alsoLike("More from the makers")],
  }),
  oku: () => ({
    shop: { shopLayout: "filters", columns: "3" },
    product: [alsoLike("Gear up with")],
    about: [story("oku"), trustRow(), readyBlock("tabbed-products", "tabs", { copy: { title: "Gear up" } })],
    contactLayout: "split",
    faq: { layout: "cards" },
    cart: [alsoLike("Don't forget")],
    wishlist: [recentlyViewed()],
  }),
  ihe: () => ({
    shop: { shopView: "large", filterPlacement: "none" },
    about: [story("ihe"), readyBlock("founder-story", "founder", { copy: { eyebrow: "From the studio", title: "Why we collect" } })],
    faq: { faqStyle: "numbered" },
  }),
  kasuwa: () => ({
    shop: { shopLayout: "filters", columns: "4", showCounts: true },
    product: [trustRow(), recentlyViewed("You looked at")],
    about: [story("kasuwa"), trustCards(), faq("kasuwa")],
    contactLayout: "split",
    faq: { layout: "two-column", faqStyle: "boxed", searchable: true },
    cart: [readyBlock("shipping-progress", "free-delivery"), alsoLike("Customers also bought")],
    wishlist: [recentlyViewed("You looked at")],
  }),
  nkata: () => ({
    shop: { filterPlacement: "sidebar", columns: "3" },
    product: [trustRow()],
    about: [story("nkata"), readyBlock("founder-story", "founder"), trustRow()],
    contactLayout: "card",
    faq: { layout: "two-column", faqStyle: "chevron" },
    cart: [alsoLike()],
  }),
  uwa: () => ({
    shop: { shopLayout: "carousels" },
    product: [recentlyViewed("Recently read")],
    about: [readyBlock("founder-story", "founder", { copy: { eyebrow: "Editor's letter", title: "Why we started the edit", role: "Editor" } }), story("uwa")],
    faq: { faqStyle: "numbered" },
    cart: [alsoLike("Also in this issue")],
  }),
  sarauniya: () => ({
    shop: { shopView: "grid", columns: "2", filterPlacement: "top" },
    product: [alsoLike("Complete the look")],
    about: [story("sarauniya"), readyBlock("collection-grid", "collections", { copy: { title: "Shop the edit" }, settings: { shape: "portrait", columns: 2, labels: "overlay", hover: "zoom" } }), reviews("Worn and loved")],
    contactLayout: "split",
    faq: { faqStyle: "split" },
    cart: [recentlyViewed()],
    wishlist: [alsoLike()],
  }),
  zinariya: () => ({
    shop: { shopLayout: "chips", columns: "3" },
    product: [trustCards()],
    about: [readyBlock("founder-story", "founder", { copy: { eyebrow: "From our goldsmith", title: "Every piece starts at the bench" } }), story("zinariya"), trustCards()],
    contactLayout: "card",
    faq: { layout: "cards" },
    cart: [alsoLike("Pairs beautifully with")],
  }),
};

function faqFor(theme: BoutiqueThemeId, inner: InnerPages | null, onFaqPage: boolean) {
  const base = faq(theme);
  if (!inner) return base;
  const { layout, faqStyle, searchable } = inner.faq;
  base.settings = { ...base.settings, ...(faqStyle ? { faqStyle } : {}), ...(searchable ? { searchable: true } : {}), ...(onFaqPage && layout ? { layout } : {}) };
  return base;
}

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
  const inner = INNER_PAGES[theme]?.() ?? null;
  const home = homeSections(theme).map((entry) => (entry.kind === "faq" ? faqFor(theme, inner, false) : entry));
  return [
    page(theme, "home", "Home", "home", home, themeName),
    page(theme, "products", "Shop", "shop", [
      ...pageHeader(inner?.pageHeader),
      section("shop-grid", "featured-products", "All Products", { title: theme === "ounje" ? "Full menu" : "Shop all" }, { settings: { layout: "grid", source: "all", filters: true, ...inner?.shop } }),
    ], themeName),
    page(theme, "product", "Product", "product", [
      section("product-detail", "product-detail", "Product Detail", { title: "" }, { settings: { layout: PRODUCT_LAYOUT[theme] } }),
      section("related", "featured-products", "Explore", { title: RELATED_TITLE[theme] ?? "Explore" }, { settings: { layout: "carousel", source: "related" } }),
      ...(inner?.product ?? []),
    ], themeName),
    page(theme, "wishlist", "Wishlist", "wishlist", [section("wishlist", "wishlist-grid", "Wishlist", { title: "Your wishlist" }), ...(inner?.wishlist ?? [])], themeName),
    page(theme, "cart", "Bag", "cart", [...pageHeader(inner?.pageHeader), section("cart", "cart-summary", "Bag", { title: CART_LABEL[theme] === "My cart" ? "Your cart" : "Your bag" }, { settings: { drawerVariation: "right-drawer" } }), ...(inner?.cart ?? [])], themeName),
    page(theme, "checkout", "Checkout", "checkout", [section("checkout", "checkout-form", "Checkout", { title: "Checkout" })], themeName),
    page(theme, "about", "About", "about", [...pageHeader(inner?.pageHeader), ...(inner?.about ?? [story(theme)])], themeName),
    page(theme, "contact", "Contact", "contact", [
      ...pageHeader(inner?.pageHeader),
      section("contact", "contact-form", "Contact", { title: "Get in touch", body: "Questions about an order or a size? Send us a message.", buttonLabel: "Send message" }, inner?.contactLayout ? { settings: { layout: inner.contactLayout } } : undefined),
    ], themeName),
    page(theme, "faq", "FAQ", "faq", [...pageHeader(inner?.pageHeader), faqFor(theme, inner, true)], themeName),
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
  {
    id: "omalicha",
    name: "Ọmalịcha",
    description: "Soft and caring for beauty and wellness: a pastel banner with the headline in a floating card, trust badges, shop-by-concern circles, a centred promise, reviews and a searchable FAQ. Shop page in rows with descriptions.",
    tags: ["beauty", "skincare", "wellness", "pastel", "soft", "basic", "2026"],
    aiHints: [
      "Ọmalịcha (id omalicha, Igbo for beautiful): blush-white page, lilac banner, plum ink, rounded cards, pill buttons",
      "Home order: card hero (photo with the headline in a white floating card), trust badges, shop by concern, favourites carousel, promise, reviews, questions, newsletter",
      "Shop page shows products as rows with their description, so write short, clear descriptions",
    ],
  },
  {
    id: "zuma",
    name: "Zuma",
    description: "Warm and handmade: an overlapping two-picture collage, made-by-hand tiles, a maker's letter, workshop circles and trust cards. Shop page opens on category tiles.",
    tags: ["handmade", "craft", "artisan", "home", "warm", "basic", "2026"],
    aiHints: [
      "Zuma (Hausa for honey): cream page, honey accent, serif headings, soft corners",
      "Home order: collage hero, made by hand tiles, maker's letter, workshop circles, trust cards, newsletter",
      "Talk about materials and process; let the maker's letter carry the seller's own voice",
    ],
  },
  {
    id: "oku",
    name: "Ọkụ",
    description: "Fast and sporty: a scrolling ticker, a slanted black-and-lime banner, tabbed best sellers and new arrivals, sport tiles and a wide story. Shop page with a filters column.",
    tags: ["sport", "activewear", "fitness", "bold", "basic", "2026"],
    aiHints: [
      "Ọkụ (id oku, Igbo for fire): white page, black banner, electric lime accent, italic uppercase grotesk headings, square buttons",
      "Home order: ticker, slanted hero, tabbed products, shop by sport tiles, wide story, reviews, newsletter",
      "Short, energetic headlines of 2 to 5 words",
    ],
  },
  {
    id: "ihe",
    name: "Ìhè",
    description: "Quiet gallery for art, prints and objects: a short intro beside a wall of three works, latest works, a centred studio note and tall collection tiles. Shop page shows two large works a row.",
    tags: ["art", "prints", "gallery", "minimal", "objects", "basic", "2026"],
    aiHints: [
      "Ìhè (id ihe, Igbo for light): white page, warm grey panels, terracotta dot accent, light serif headings, lots of space",
      "Home order: gallery hero (three works hung side by side), latest works, studio note, collections, newsletter",
      "Name each work like a gallery label: title, then size or medium in the description",
    ],
  },
  {
    id: "kasuwa",
    name: "Kasuwa",
    description: "A big catalogue store: a promo mosaic, trust badges, departments, tabbed top picks, a dense essentials grid, collections five across and searchable questions. Shop page with a full filters column and counts; free-delivery bar in the cart.",
    tags: ["catalogue", "supermarket", "electronics", "general store", "dense", "premium", "2026"],
    aiHints: [
      "Kasuwa (Hausa for market): cool grey page, royal blue banner, sunshine yellow accent, grotesk headings",
      "Home order: promo mosaic (one big tile and two side tiles), trust badges, departments, tabbed top picks, essentials grid, collections, questions, newsletter",
      "Built for many products: clear names with size or model, and categories for every department",
    ],
  },
  {
    id: "nkata",
    name: "Nkata",
    description: "Classic and balanced: a framed banner with the words in a white box, square collection tiles, new arrivals, an editorial story and reviews. Shop page with a side column of filters.",
    tags: ["classic", "fashion", "homeware", "balanced", "premium", "2026"],
    aiHints: [
      "Nkata (Igbo for basket, and for a good conversation): white page, slate banner, clay accent, serif headings, square corners",
      "Home order: framed hero, collection tiles, new arrivals carousel, editorial story, reviews, trust badges, newsletter",
      "Calm, confident copy; nothing shouty",
    ],
  },
  {
    id: "uwa",
    name: "Ụwa",
    description: "A magazine: a cover banner with a masthead and an 'in this issue' list, products as the issue, a shoppable journal story, an editor's letter and section chips. Shop page in category rows.",
    tags: ["editorial", "magazine", "fashion", "lifestyle", "journal", "premium", "2026"],
    aiHints: [
      "Ụwa (id uwa, Igbo for world): newsprint page, black ink, masthead red accent, serif headings, square corners",
      "Home order: cover hero (masthead, headline and an 'in this issue' list of three products), the issue grid, shoppable story, editor's letter, sections, newsletter",
      "Write like an editor: short standfirsts, products as features",
    ],
  },
  {
    id: "sarauniya",
    name: "Sarauniya",
    description: "Fashion house with two pictures side by side: a split-screen banner with the headline across the seam, new in, a two-up edit, an editorial story and reviews. Shop page two large looks a row.",
    tags: ["fashion", "womenswear", "editorial", "luxury", "split screen", "platinum", "2026"],
    aiHints: [
      "Sarauniya (Hausa for queen): warm ivory page, black ink, champagne accent, serif headings, square corners",
      "Home order: duo hero (two photos side by side, headline centred across them), new in carousel, two-up edit, editorial story, reviews, inner circle newsletter",
      "Two strong photos make the banner: upload a pair from the same shoot",
    ],
  },
  {
    id: "zinariya",
    name: "Zinariya",
    description: "Gold on deep emerald for fine jewellery: an arched picture framed in gold lines, piece circles, signature pieces, a goldsmith's letter, trust cards and reviews. Shop page with chips and three across.",
    tags: ["jewellery", "gold", "luxury", "emerald", "arch", "platinum", "2026"],
    aiHints: [
      "Zinariya (Hausa for gold): ivory page, deep emerald banner, gold accent and hairlines, serif headings, soft corners",
      "Home order: arch hero, shop by piece circles, signature pieces carousel, goldsmith's letter, trust cards, reviews, newsletter",
      "Give metal, stone and size in every product's description",
    ],
  },
  {
    id: "irawo",
    name: "Ìràwọ̀",
    description: "For one hero product: the product big on a glowing circle with its real name and price, a spotlight grid, an overlapping story, reviews and questions in cards.",
    tags: ["single product", "product-led", "brand", "bright", "basic", "2026"],
    aiHints: [
      "Ìràwọ̀ (id irawo, Yoruba for star): peach page, coral accent, bold grotesk headings, rounded cards, pill buttons",
      "Home order: product hero (the best seller big on a circle, its name and price), trust badges, spotlight grid, overlap story, reviews, questions, newsletter",
      "Best for a brand with one or a few products: lead with the benefit of the star product",
    ],
  },
  {
    id: "asa",
    name: "Àṣà",
    description: "Heritage food and craft: a round stamp beside a framed picture, big range banners, kitchen tiles, an editorial story and a family letter.",
    tags: ["heritage", "food", "spices", "traditional", "warm", "basic", "2026"],
    aiHints: [
      "Àṣà (id asa, Yoruba for culture and tradition): parchment page, brick red accent, serif headings, soft corners",
      "Home order: stamp hero, range banners, fresh from our kitchen tiles, editorial story, family letter, questions, newsletter",
      "Tell where the recipe or craft comes from; keep it warm and specific",
    ],
  },
  {
    id: "mmiri",
    name: "Mmiri",
    description: "Cool and fresh for drinks: a blue banner with a wave edge and the bottle on a sunny circle, a flavour carousel, a category mosaic and a free-delivery bar in the cart.",
    tags: ["drinks", "juice", "water", "beverages", "fresh", "basic", "2026"],
    aiHints: [
      "Mmiri (Igbo for water): pale blue page, ocean blue banner, sunshine yellow accent, rounded grotesk",
      "Home order: wave hero, flavour carousel, category mosaic, what's inside, reviews, questions, newsletter",
      "Name flavours and sizes clearly (50cl, 1L, packs of 12)",
    ],
  },
  {
    id: "uzo",
    name: "Ụzọ",
    description: "A journey: words pinned on the left while tall pictures scroll on the right, a lookbook of big alternating rows, a category mosaic and an overlapping story.",
    tags: ["editorial", "travel", "outdoor", "fashion", "sticky", "premium", "2026"],
    aiHints: [
      "Ụzọ (id uzo, Igbo for road or path): stone page, charcoal banner, olive accent, grotesk headings",
      "Home order: sticky split hero, lookbook rows, explore mosaic, overlap story, reviews, newsletter",
      "Each lookbook row shows a product's description, so make those count",
    ],
  },
  {
    id: "rawa",
    name: "Rawa",
    description: "Party colour: a hot pink banner with three photo cards fanned out, a scrolling ticker, a spotlight grid, round vibe picks and tabbed favourites. Shop page in category rows.",
    tags: ["party", "fashion", "accessories", "colourful", "playful", "premium", "2026"],
    aiHints: [
      "Rawa (Hausa for dance): white page, hot pink banner, lemon accent, heavy rounded grotesk, pill buttons",
      "Home order: fanned-card hero with ticker, spotlight grid, vibe circles, tabbed favourites, reviews, newsletter",
      "Fun, short copy; the ticker repeats the eyebrow",
    ],
  },
  {
    id: "fitila",
    name: "Fitila",
    description: "A room you can shop: a full-width room photo with glowing pins on products, room banners, new-in tiles, an overlapping story and trust cards. Shop page with side filters.",
    tags: ["home", "lighting", "furniture", "interiors", "hotspots", "premium", "2026"],
    aiHints: [
      "Fitila (Hausa for lamp): warm ivory page, dark walnut banner, lamp-glow amber accent, serif headings",
      "Home order: room hero with product pins, shop by room banners, new in tiles, overlap story, trust cards, newsletter",
      "Upload a room photo with your pieces in it for the banner; the pins link to your products",
    ],
  },
  {
    id: "oso",
    name: "Ọ̀ṣọ́",
    description: "Fashion bento: a grid of three pictures and a wine-red headline tile, a just-landed carousel, an edit mosaic, an editorial lookbook and reviews. Shop page in large cards.",
    tags: ["fashion", "bento", "editorial", "luxury", "grid", "platinum", "2026"],
    aiHints: [
      "Ọ̀ṣọ́ (id oso, Yoruba for adornment): white page, ivory panels, wine accent, serif headings, square corners",
      "Home order: bento hero, just landed carousel, edit mosaic, lookbook, reviews, newsletter",
      "Three strong photos fill the bento: one full look, two details",
    ],
  },
  {
    id: "shakara",
    name: "Shakara",
    description: "A street poster: black banner with the store name running up the side, a cut-out picture on an orange block, a ticker, a spotlight drop, range banners and a wide story.",
    tags: ["streetwear", "poster", "bold", "drops", "urban", "platinum", "2026"],
    aiHints: [
      "Shakara (Naija for swagger and showing off): concrete grey page, black banner, safety orange accent, heavy grotesk, square corners",
      "Home order: ticker, poster hero, spotlight drop, range banners, wide story, reviews, newsletter",
      "Number your drops (Drop 01, Drop 02) and keep headlines to two or three words",
    ],
  },
  {
    id: "aga",
    name: "Àga",
    description: "Furniture with a sidebar: the logo, menu and shop links run down a column on the left, the home page is a masonry wall of products with their name and price, and the shop page has a full filters column.",
    tags: ["furniture", "home", "sidebar", "masonry", "minimal", "platinum", "2026"],
    aiHints: [
      "Àga (Yoruba for chair): white page, pale grey panels, sunflower yellow accent, clean grotesk, square corners, a sidebar menu on computers",
      "Home order: masonry product wall, shop by room chips, new this week grid, story, newsletter",
      "The masonry wall shows every product's name and price, so name them clearly",
    ],
  },
  {
    id: "itura",
    name: "Ìtura",
    description: "Pale aqua and calm: a banner with a cut-out product and arrows to flip through, tinted category cards, a grid with add-to-bag buttons, a weekly countdown and title banners on every inner page.",
    tags: ["furniture", "home", "lifestyle", "pastel", "cut-out", "basic", "2026"],
    aiHints: [
      "Ìtura (Yoruba for comfort and relief): white page, pale aqua banner, hot pink accent, grotesk headings, rounded cards",
      "Home order: cut-out hero with arrows, featured category cards, awesome picks grid with add to bag, payday countdown, best sellers carousel, story, newsletter",
      "Product photos on plain backgrounds look best in the banner",
    ],
  },
  {
    id: "gele",
    name: "Gèlè",
    description: "Fashion mosaic: one big banner beside four category tiles with item counts, new products with category tabs, three short lists (hot, best sellers, on sale), a countdown, trust icons and a photo strip.",
    tags: ["fashion", "womenswear", "mosaic", "tabs", "colourful", "premium", "2026"],
    aiHints: [
      "Gèlè (Yoruba for the headtie): white page, blush banner, signal red accent, serif headings, square corners",
      "Home order: mosaic hero, new products with category tabs, collection banner, three lists, payday countdown, trust icons, photo strip, newsletter",
      "Give every product a category so the tabs and tiles fill up",
    ],
  },
  {
    id: "imani",
    name: "Imani",
    description: "A department store: a dark category bar under the header, a his-and-hers split banner, big-word category banners, tabbed products, a wide story, brand logos and photo title banners on inner pages.",
    tags: ["department store", "fashion", "multi-category", "category bar", "premium", "2026"],
    aiHints: [
      "Imani (Hausa for faith): white page, deep purple banner, sky blue accent, grotesk headings, square corners, a dark category bar under the header",
      "Home order: split hero (two halves, each with its own link), big-word category banners, tabbed products, wide story, brands, newsletter",
      "Works best with several categories (men, women, accessories)",
    ],
  },
  {
    id: "itanna",
    name: "Ìtànná",
    description: "Minimal and product-first: a centred headline on a soft glow, then straight into product cards that lift on hover with quick add and ratings, trust cards and reviews.",
    tags: ["sneakers", "minimal", "product grid", "quick add", "clean", "basic", "2026"],
    aiHints: [
      "Ìtànná (Yoruba for flower, a bloom): white page, warm amber accent, Inter-like grotesk, very rounded cards",
      "Home order: centred headline, latest drops grid with quick add, trust cards, reviews, newsletter",
      "Keep the headline to three or four words; the products do the talking",
    ],
  },
  {
    id: "littafi",
    name: "Littafi",
    description: "A pastel bookshop: a pink-to-mint banner with the book cover and arrows, service icons, best sellers with ratings, a countdown band, four product lists, category tiles and reviews.",
    tags: ["books", "bookshop", "pastel", "gradient", "lists", "basic", "2026"],
    aiHints: [
      "Littafi (Hausa for book): white page, pink-to-mint pastel banners, coral accent, rounded grotesk",
      "Home order: gradient hero with arrows, service icons, best selling books carousel, countdown, four lists, categories, reviews, newsletter",
      "Book covers on plain backgrounds look best; put the author in the description",
    ],
  },
  {
    id: "itan",
    name: "Ìtàn",
    description: "A literary bookshop in warm beige: a serif banner with the cover framed, publisher logos, featured books, one best seller shown large, popular books with genre tabs, a quote of the day and books on offer.",
    tags: ["books", "literary", "serif", "beige", "quote", "platinum", "2026"],
    aiHints: [
      "Ìtàn (Yoruba for story and history): warm beige page, deep tan accent, serif headings, square corners",
      "Home order: cover hero with arrows, publishers, featured books, best selling book feature, popular books by genre, quote of the day, books with offer, newsletter",
      "The quote of the day uses the story text; its heading is who said it",
    ],
  },
  {
    id: "awo",
    name: "Àwọ̀",
    description: "Clean fashion in red: a full-width photo banner, category photos with a white label in the middle, new arrivals with category tabs, a deal-of-the-week countdown, best sellers and a service bar.",
    tags: ["fashion", "red", "clean", "labels", "tabs", "basic", "2026"],
    aiHints: [
      "Àwọ̀ (Yoruba for colour): white page, grey panels, bright red accent, grotesk headings, square corners",
      "Home order: photo hero, labelled category photos, new arrivals with tabs, countdown, best sellers, service bar, newsletter",
      "Only mention a discount in the hero when you are running one",
    ],
  },
  {
    id: "kyau",
    name: "Kyau",
    description: "Soft periwinkle fashion: a full photo banner with a serif headline, bordered category cards that tint on hover, a product overview with category tabs, photo title banners and an about page with framed pictures.",
    tags: ["fashion", "clean", "periwinkle", "bordered", "framed", "premium", "2026"],
    aiHints: [
      "Kyau (Hausa for beauty and goodness): white page, periwinkle accent, Poppins-like grotesk, serif hero headline, pill buttons",
      "Home order: season hero, bordered category cards, product overview with tabs, newsletter",
      "The about page shows two framed stories: our story and our mission",
    ],
  },
  {
    id: "keke",
    name: "Keke",
    description: "A bike shop with a slant: the product beside a slanted slate panel with a BEST badge, products as alternating rows on angled orange panels with numbers and prices, a wide story and reviews.",
    tags: ["bicycles", "sport", "slanted", "showcase", "slate", "premium", "2026"],
    aiHints: [
      "Keke (Hausa for bicycle): white page, slate blue banner, warm orange accent, grotesk headings, square corners",
      "Home order: slant hero, showcase rows, wide story, reviews, newsletter",
      "Product photos on white backgrounds look best on the angled panels",
    ],
  },
  {
    id: "ahia",
    name: "Ahịa",
    description: "A bright market: a search-first header in black, a yellow-washed photo banner with a big centred headline, then each category as its own row of product cards with the price on top, a service bar and today's picks.",
    tags: ["marketplace", "general", "yellow", "search", "by-category", "basic", "2026"],
    aiHints: [
      "Ahịa (Igbo for market): white page, sunflower yellow banner, black header with a wide search bar, orange accent",
      "Home order: yellow hero, a row of products per category, service bar, today's picks, newsletter",
      "Works best with three or more product categories; each gets its own row",
    ],
  },
  {
    id: "ado",
    name: "Àdó",
    description: "Sharp menswear in green: a full photo banner with the first word of the headline in green, service cards, featured products on grey, a promo panel, new products with one shown large, and a wide grid.",
    tags: ["fashion", "menswear", "green", "promo", "spotlight", "premium", "2026"],
    aiHints: [
      "Àdó (Hausa for adornment): white page, grey product panels, bright green accent, grotesk headings, square corners",
      "Home order: model hero, service cards, featured products, promo panel, new products spotlight, more products, reviews, newsletter",
      "The promo panel uses the story text; only mention a discount when you are running one",
    ],
  },
  {
    id: "wuta",
    name: "Wuta",
    description: "An orange gadget store: a search header with a category strip, a banner beside a product card, a service bar, category promo cards, products with category tabs and compact best-seller cards.",
    tags: ["electronics", "gadgets", "orange", "search", "mini cards", "basic", "2026"],
    aiHints: [
      "Wuta (Hausa for fire and power): white page, bright orange accent, rounded cards, search bar in the header",
      "Home order: banner with product card, service bar, category cards, products with tabs, best sellers, reviews, newsletter",
      "Product photos on white backgrounds look best",
    ],
  },
  {
    id: "ike",
    name: "Ike",
    description: "Electronics in navy and red: a dark search header, a grey deal banner with pictures at both ends, collection tiles with a red diagonal, new products with tabs, a payday countdown and top-selling lists.",
    tags: ["electronics", "gadgets", "navy", "red", "diagonal", "platinum", "2026"],
    aiHints: [
      "Ike (Igbo for strength and power): white page, deep navy header, signal red accent, grotesk headings",
      "Home order: deal banner, diagonal collection tiles, new products with tabs, payday countdown, top-selling lists, newsletter",
      "Collection tiles come from your categories; the first three show",
    ],
  },
  {
    id: "ewu",
    name: "Ẹ̀wù",
    description: "Family fashion in lavender and dusty pink: a category menu beside the banner, service boxes, category cards with product counts, two collection panels, trendy products and just-arrived.",
    tags: ["fashion", "family", "kids", "lavender", "categories", "premium", "2026"],
    aiHints: [
      "Ẹ̀wù (Yoruba for garment): white page, lavender panels, dusty pink accent, search bar in the header",
      "Home order: category menu with banner, service boxes, category cards, collection panels, trendy products, newsletter, just arrived",
      "Category cards show how many products each has",
    ],
  },
  {
    id: "erin",
    name: "Ẹ̀rín",
    description: "Bright, friendly fashion in red and navy: a split photo banner with the first words in red, navy service cards, a new-arrivals story, a big product grid, a grey newsletter band and reviews.",
    tags: ["fashion", "red", "navy", "serif", "friendly", "basic", "2026"],
    aiHints: [
      "Ẹ̀rín (Yoruba for laughter): white page, warm grey banner, coral red accent, navy ink, serif headings",
      "Home order: split hero, navy service cards, new arrivals story, product grid, newsletter, reviews",
      "The first two words of the headline turn red; keep them short",
    ],
  },
  {
    id: "apere",
    name: "Apẹ̀rẹ̀",
    description: "A tidy grocery store: a search header, a big banner beside two category cards, category cards, trending products with tabs and quick add, collection panels, best sellers and a split newsletter box.",
    tags: ["groceries", "food", "supermarket", "quick add", "search", "premium", "2026"],
    aiHints: [
      "Apẹ̀rẹ̀ (Yoruba for basket): white page, sky blue banner, honey accent, rounded cards, search bar in the header",
      "Home order: banner trio, categories, trending products with tabs, collection panels, best sellers, newsletter, just arrived",
      "The two small banner cards come from your first two categories",
    ],
  },
  {
    id: "bata",
    name: "Bàtà",
    description: "A calm shoe store: a full photo banner, a centred one-line story, two large collection photos with serif captions, a bordered best-seller grid and the brands you stock.",
    tags: ["shoes", "footwear", "minimal", "serif", "collections", "basic", "2026"],
    aiHints: [
      "Bàtà (Yoruba for shoes): white page, soft grey, sea green accent, serif headings, square corners",
      "Home order: full banner, one-line story, two collection photos, best sellers, brands, newsletter",
      "The story heading is one sentence about why you started",
    ],
  },
  {
    id: "ogba",
    name: "Ọgbà",
    description: "A produce market in olive and black: a full photo slider with square arrows, category photos with an olive caption bar, offer panels, fruit and vegetables with tabs, and a wide story.",
    tags: ["groceries", "fresh produce", "farm", "olive", "slider", "premium", "2026"],
    aiHints: [
      "Ọgbà (Yoruba for garden): white page, black banner, olive accent, grotesk headings, square corners",
      "Home order: photo slider, captioned categories, offer panels, products with tabs, story, newsletter",
      "Close-up photos of produce make the slider work",
    ],
  },
  {
    id: "eso",
    name: "Èso",
    description: "A fresh fruit store in green and orange: a banner with a big search box and a photo card, service tiles with round icons, organic products with tabs, labelled category photos, an orange story band and best sellers with round photos.",
    tags: ["groceries", "fruit", "organic", "green", "orange", "platinum", "2026"],
    aiHints: [
      "Èso (Yoruba for fruit): white page, leaf green accent, orange bands, rounded cards",
      "Home order: search hero, service tiles, products with tabs, category photos, story band, round best sellers, reviews, newsletter",
      "The story band's eyebrow sits in a round badge on the picture; keep it to two or three words",
    ],
  },
  {
    id: "osan",
    name: "Ọsàn",
    description: "A fruit shop in dark slate and orange: a full photo banner with two buttons, a service bar, product cards with quick add, a story with a picture and reviews.",
    tags: ["groceries", "fruit", "orange", "slate", "quick add", "basic", "2026"],
    aiHints: [
      "Ọsàn (Yoruba for orange): white page, dark slate banner, bright orange accent, rounded cards",
      "Home order: centred photo hero, service bar, products with quick add, story, reviews, newsletter",
      "A close-up photo of fruit makes the banner",
    ],
  },
  {
    id: "ijokoo",
    name: "Ìjókòó",
    description: "A calm furniture showroom: a pale banner with a cut-out piece and slide dots, three category cards with the middle one wide, new arrivals, a photo with a dark side panel, featured products and the brands you stock.",
    tags: ["furniture", "home", "showroom", "minimal", "panel", "premium", "2026"],
    aiHints: [
      "Ìjókòó (Yoruba for seat): white page, pale lavender grey panels, warm amber accent, square corners",
      "Home order: cut-out hero, category trio, new arrivals, panel story, featured products, brands, newsletter",
      "Product photos on plain light backgrounds suit the cut-out banner",
    ],
  },
  {
    id: "ite",
    name: "Ìtẹ́",
    description: "A deep green interior studio: a green banner with the sofa breaking out of it, an intro beside three products, service tiles, a photo collage story, popular picks and testimonials.",
    tags: ["furniture", "interior", "green", "yellow", "collage", "platinum", "2026"],
    aiHints: [
      "Ìtẹ́ (Yoruba for nest): soft sage page, deep green banner, sunflower yellow buttons, rounded cards",
      "Home order: green hero, intro with three products, service tiles, collage story, popular picks, testimonials, newsletter",
      "A cut-out sofa or chair on a plain background looks best in the banner",
    ],
  },
  {
    id: "kujera",
    name: "Kujera",
    description: "Black and copper furniture: a product slider banner with the piece large beside its price, a favourite-collection carousel on warm grey cards, a centred story and room tiles.",
    tags: ["furniture", "black", "copper", "product slider", "minimal", "basic", "2026"],
    aiHints: [
      "Kujera (Hausa for chair): white page, warm grey panels, black buttons, copper accent, square corners",
      "Home order: product slider, favourite collection, centred story, rooms, reviews, newsletter",
      "The banner shows your first three products; photos on plain backgrounds work best",
    ],
  },
  {
    id: "tufafi",
    name: "Tufafi",
    description: "Monochrome family fashion: a big photo beside four category tiles, the latest products for each category, a collage story and a social photo grid.",
    tags: ["fashion", "family", "monochrome", "mosaic", "categories", "premium", "2026"],
    aiHints: [
      "Tufafi (Hausa for clothes): white page, charcoal, clean grotesk, square corners",
      "Home order: mosaic hero with category tiles, latest per category, collage story, social grid, newsletter",
      "Works best with three or four categories such as women, men, kids and accessories",
    ],
  },
  {
    id: "rewa",
    name: "Rẹ̀wà",
    description: "Bold fashion in charcoal and hot pink: a spaced centred logo, three colour blocks with your promises, a full photo banner, two half-width collection photos with huge words, new arrivals with tabs and a photo with a side panel.",
    tags: ["fashion", "pink", "bold", "halves", "panel", "premium", "2026"],
    aiHints: [
      "Rẹ̀wà (Yoruba for to be beautiful): white page, charcoal, hot pink accent, square corners, centred logo",
      "Home order: photo hero, promise strip, two half-width collections, new arrivals with tabs, side-panel story, testimonials, newsletter",
      "Collection names show very large; keep them to one or two words",
    ],
  },
  {
    id: "igbese",
    name: "Ìgbésẹ̀",
    description: "A sneaker store in orange: a banner with diagonal orange stripes and the shoe large, service cards, a photo mosaic of categories, latest products with quick add, a deal with your sale countdown and deal lists.",
    tags: ["shoes", "sneakers", "orange", "stripes", "deal", "basic", "2026"],
    aiHints: [
      "Ìgbésẹ̀ (Yoruba for step): white page, orange stripes, rounded cards, grotesk headings",
      "Home order: stripe hero, service cards, category mosaic, latest products, deal countdown, deal lists, newsletter",
      "Sneaker photos on plain backgrounds work best in the banner",
    ],
  },
  {
    id: "ola",
    name: "Ọlá",
    description: "A refined fashion editorial on soft grey: a centred heading over For her and For him photos, best deals, an exclusive collection block, tall new-arrival tiles with words on the photo, shop by category tabs and a wide story.",
    tags: ["fashion", "editorial", "grey", "overlay", "exclusive", "platinum", "2026"],
    aiHints: [
      "Ọlá (Yoruba for honour and wealth): soft grey page, white cards, charcoal buttons, amber prices, square corners",
      "Home order: duo hero, best deals, exclusive block, new arrivals on photos, category tabs, wide story, best sellers, newsletter",
      "The two hero photos come from your first two categories (for example women and men)",
    ],
  },
  {
    id: "okunrin",
    name: "Ọkùnrin",
    description: "Cream menswear: the model in a soft pink circle with dot patterns, staggered collection blocks, best sellers with tabs, a deal of the week with your sale countdown and an Instagram grid.",
    tags: ["fashion", "menswear", "cream", "staggered", "deal", "premium", "2026"],
    aiHints: [
      "Ọkùnrin (Yoruba for man): white page, warm cream panels, black buttons, red accent, square corners",
      "Home order: circle hero, staggered collections, best sellers with tabs, deal of the week, story, Instagram, newsletter",
      "A portrait photo of one model works best in the circle",
    ],
  },
  {
    id: "salubata",
    name: "Sálúbàtà",
    description: "A khaki shoe shop: the shoe large on a khaki banner with a black New arrival tag, service tiles, new shoes, colour-block collection panels, a deal of the month band with your sale countdown, reviews and an Instagram strip.",
    tags: ["shoes", "khaki", "colour blocks", "deal", "minimal", "basic", "2026"],
    aiHints: [
      "Sálúbàtà (Yoruba for sandals and slippers): white page, khaki banner and deal band, black buttons, square corners",
      "Home order: cut-out hero, service tiles, new shoes, collection panels, deal of the month, reviews, Instagram",
      "Shoe photos on plain backgrounds suit the banner and the deal",
    ],
  },
  {
    id: "efo",
    name: "Ẹ̀fọ́",
    description: "A green vegetable market: a full photo banner of fresh produce, service tiles, a category grid around a centre column, product cards with quick add, a deal of the day with your sale countdown and a split newsletter.",
    tags: ["groceries", "vegetables", "green", "deal", "organic", "basic", "2026"],
    aiHints: [
      "Ẹ̀fọ́ (Yoruba for vegetables): white page, leaf green accent, rounded cards, grotesk headings",
      "Home order: produce hero, service tiles, centre-column categories, products, deal of the day, reviews, newsletter",
      "A wide, colourful produce photo makes the banner",
    ],
  },
  {
    id: "aluko",
    name: "Àlùkò",
    description: "A lookbook fashion store in slate blue: a full photo banner with arrows, service row, a lookbook block of collections in pale blue cards, latest products with tabs and a story with a giant word across the photo.",
    tags: ["fashion", "lookbook", "slate", "pale blue", "editorial", "premium", "2026"],
    aiHints: [
      "Àlùkò (Yoruba for the violet plantain-eater bird): white page, pale blue cards, slate buttons, rounded corners",
      "Home order: lookbook hero, service row, lookbook collections, latest products, word story, brands, newsletter",
      "The story's eyebrow shows as the giant word on the photo; keep it to one word",
    ],
  },
  {
    id: "aja",
    name: "Ajá",
    description: "A cream pet shop: a dog in a soft circle beside the headline, pet categories as chips, pet clothing and foods with quick add and tabs, a clearance panel, reviews and best sellers.",
    tags: ["pets", "pet shop", "cream", "chips", "friendly", "premium", "2026"],
    aiHints: [
      "Ajá (Yoruba for dog): white page, warm cream panels, caramel accent, charcoal buttons, soft corners",
      "Home order: circle hero, pet chips, pet clothing, pet foods with tabs, clearance panel, reviews, best sellers, newsletter",
      "A cut-out photo of a pet on a plain background works best in the circle",
    ],
  },
  {
    id: "dara",
    name: "Dára",
    description: "Bright fashion with an orange accent: a split banner with words on white beside a tall photo, a story with a video-style photo, best sellers, women's and men's collections in overlapping rows and a product grid.",
    tags: ["fashion", "orange", "split", "overlap", "clean", "basic", "2026"],
    aiHints: [
      "Dára (Yoruba for good and beautiful): white page, light grey panels, orange accent, rounded buttons",
      "Home order: split hero, story, best sellers, overlapping collections, products, reviews, newsletter",
      "Two collections such as Women and Men suit the overlapping rows",
    ],
  },
  {
    id: "ife",
    name: "Ìfẹ́",
    description: "A serif boutique in taupe: a two-photo banner with label boxes, photo cards with a dark Shop now bar, new arrivals with quick add, an Instagram grid, a quote of the day and a newsletter over a photo.",
    tags: ["fashion", "boutique", "serif", "taupe", "editorial", "platinum", "2026"],
    aiHints: [
      "Ìfẹ́ (Yoruba for love): white page, warm taupe accent, near-black buttons, serif uppercase headings, square corners",
      "Home order: two-photo hero, shop-bar collections, new arrivals, Instagram, quote, photo newsletter",
      "The quote uses the story text; its heading is who said it",
    ],
  },
  {
    id: "irorun",
    name: "Ìrọ̀rùn",
    description: "Clean casual wear: a light photo banner with a huge black headline, featured products, collections with big bold names, a newsletter strip, best sellers with tabs and a quote review.",
    tags: ["fashion", "casual", "streetwear", "bold", "clean", "basic", "2026"],
    aiHints: [
      "Ìrọ̀rùn (Yoruba for ease and comfort): white page, light grey banner, heavy black grotesk headings, square corners",
      "Home order: bold hero, featured products, bold-name collections, newsletter, best sellers with tabs, reviews, Instagram",
      "Collection names show very large with a full stop; keep them to one or two words",
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
  omalicha: { category: "beauty", layoutFamily: "minimal-showcase" },
  zuma: { category: "general", layoutFamily: "home-living" },
  oku: { category: "fashion", layoutFamily: "fashion-runway" },
  ihe: { category: "minimal", layoutFamily: "minimal-showcase" },
  kasuwa: { category: "general", layoutFamily: "marketplace-grid" },
  nkata: { category: "fashion", layoutFamily: "editorial-boutique" },
  uwa: { category: "fashion", layoutFamily: "editorial-boutique" },
  sarauniya: { category: "fashion", layoutFamily: "fashion-runway" },
  zinariya: { category: "fashion", layoutFamily: "editorial-boutique" },
  irawo: { category: "minimal", layoutFamily: "minimal-showcase" },
  asa: { category: "food", layoutFamily: "food-market" },
  mmiri: { category: "food", layoutFamily: "food-market" },
  uzo: { category: "fashion", layoutFamily: "editorial-boutique" },
  rawa: { category: "fashion", layoutFamily: "fashion-runway" },
  fitila: { category: "furniture", layoutFamily: "home-living" },
  oso: { category: "fashion", layoutFamily: "editorial-boutique" },
  shakara: { category: "fashion", layoutFamily: "fashion-runway" },
  aga: { category: "furniture", layoutFamily: "home-living" },
  itura: { category: "furniture", layoutFamily: "home-living" },
  gele: { category: "fashion", layoutFamily: "fashion-runway" },
  imani: { category: "general", layoutFamily: "marketplace-grid" },
  itanna: { category: "fashion", layoutFamily: "minimal-showcase" },
  littafi: { category: "books", layoutFamily: "book-lifestyle" },
  itan: { category: "books", layoutFamily: "book-lifestyle" },
  awo: { category: "fashion", layoutFamily: "fashion-runway" },
  kyau: { category: "fashion", layoutFamily: "minimal-showcase" },
  keke: { category: "general", layoutFamily: "electronics-grid" },
  ahia: { category: "general", layoutFamily: "marketplace-grid" },
  ado: { category: "fashion", layoutFamily: "fashion-runway" },
  wuta: { category: "electronics", layoutFamily: "electronics-grid" },
  ike: { category: "electronics", layoutFamily: "electronics-grid" },
  ewu: { category: "fashion", layoutFamily: "marketplace-grid" },
  erin: { category: "fashion", layoutFamily: "fashion-runway" },
  apere: { category: "food", layoutFamily: "food-market" },
  bata: { category: "fashion", layoutFamily: "minimal-showcase" },
  ogba: { category: "food", layoutFamily: "food-market" },
  eso: { category: "food", layoutFamily: "food-market" },
  osan: { category: "food", layoutFamily: "food-market" },
  ijokoo: { category: "furniture", layoutFamily: "home-living" },
  ite: { category: "furniture", layoutFamily: "home-living" },
  kujera: { category: "furniture", layoutFamily: "home-living" },
  tufafi: { category: "fashion", layoutFamily: "marketplace-grid" },
  rewa: { category: "fashion", layoutFamily: "fashion-runway" },
  igbese: { category: "fashion", layoutFamily: "fashion-runway" },
  ola: { category: "fashion", layoutFamily: "editorial-boutique" },
  okunrin: { category: "fashion", layoutFamily: "minimal-showcase" },
  salubata: { category: "fashion", layoutFamily: "minimal-showcase" },
  efo: { category: "food", layoutFamily: "food-market" },
  aluko: { category: "fashion", layoutFamily: "fashion-runway" },
  aja: { category: "general", layoutFamily: "marketplace-grid" },
  dara: { category: "fashion", layoutFamily: "fashion-runway" },
  ife: { category: "fashion", layoutFamily: "editorial-boutique" },
  irorun: { category: "fashion", layoutFamily: "fashion-runway" },
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
