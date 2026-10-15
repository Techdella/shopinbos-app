// Packaging designer (/home/labels/packaging): pouches, boxes, jar and bottle labels, stickers, sachets, tube
// labels, soap sleeves and shopping bags, laid out flat at their real size in millimetres with bleed, safe zone,
// cut and fold lines, so the file goes straight to a printer. Styles, product types and the words each type of
// product needs on its pack live here too. Pure and dependency-free, unit-tested in tests/packaging.test.mjs.

export const PACK_FORMATS = ["pouch", "box", "jar_label", "bottle_label", "round_sticker", "sachet", "tube_label", "sleeve", "bag"] as const;
export type PackFormat = (typeof PACK_FORMATS)[number];

/** Millimetres. w × h is the face; d is depth (box, sleeve) or the bottom gusset (pouch). */
export interface PackSize {
  w: number;
  h: number;
  d: number;
}

export const BLEED_MM = 3;
export const SAFE_MM = 4;

export const PACK_FORMAT_INFO: Record<PackFormat, { name: string; hint: string; sizes: Array<PackSize & { label: string }>; usesDepth: boolean; depthLabel?: string }> = {
  pouch: {
    name: "Stand-up pouch",
    hint: "Zip pouch for snacks, nuts, spices, coffee, tea, pet treats. Front and back print side by side, gusset underneath.",
    sizes: [
      { label: "Small · 120 × 200 mm", w: 120, h: 200, d: 70 },
      { label: "Medium · 160 × 230 mm", w: 160, h: 230, d: 80 },
      { label: "Large · 200 × 300 mm", w: 200, h: 300, d: 100 },
    ],
    usesDepth: true,
    depthLabel: "Gusset",
  },
  box: {
    name: "Tuck-end box",
    hint: "Folding carton for cosmetics, perfume, tea, gadgets, candles, gifts. Full flat dieline with tuck flaps and glue flap.",
    sizes: [
      { label: "Small · 60 × 40 × 90 mm", w: 60, h: 90, d: 40 },
      { label: "Medium · 80 × 50 × 120 mm", w: 80, h: 120, d: 50 },
      { label: "Large · 120 × 60 × 180 mm", w: 120, h: 180, d: 60 },
    ],
    usesDepth: true,
    depthLabel: "Depth",
  },
  jar_label: {
    name: "Jar wrap label",
    hint: "Wraps round a jar or tub: shea butter, honey, pepper sauce, body scrub. Info on the left, front in the middle, barcode on the right.",
    sizes: [
      { label: "Small jar · 200 × 60 mm", w: 200, h: 60, d: 0 },
      { label: "Medium jar · 240 × 80 mm", w: 240, h: 80, d: 0 },
      { label: "Large tub · 280 × 100 mm", w: 280, h: 100, d: 0 },
    ],
    usesDepth: false,
  },
  bottle_label: {
    name: "Bottle labels (front + back)",
    hint: "Two labels for juice, zobo, oils, hair oil, perfume, cleaning liquids. Printed on one sheet, cut apart.",
    sizes: [
      { label: "Small · 70 × 90 mm", w: 70, h: 90, d: 0 },
      { label: "Medium · 90 × 120 mm", w: 90, h: 120, d: 0 },
      { label: "Large · 110 × 150 mm", w: 110, h: 150, d: 0 },
    ],
    usesDepth: false,
  },
  round_sticker: {
    name: "Round sticker / lid label",
    hint: "Jar lids, cake boxes, seals and freebies. Round cut.",
    sizes: [
      { label: "40 mm", w: 40, h: 40, d: 0 },
      { label: "50 mm", w: 50, h: 50, d: 0 },
      { label: "75 mm", w: 75, h: 75, d: 0 },
    ],
    usesDepth: false,
  },
  sachet: {
    name: "Sachet",
    hint: "Single-serve sachets: seasoning, powder drinks, samples, face masks. Front and back with seal edges.",
    sizes: [
      { label: "Small · 70 × 100 mm", w: 70, h: 100, d: 0 },
      { label: "Medium · 90 × 130 mm", w: 90, h: 130, d: 0 },
      { label: "Large · 120 × 170 mm", w: 120, h: 170, d: 0 },
    ],
    usesDepth: false,
  },
  tube_label: {
    name: "Tube",
    hint: "Squeeze tubes for creams, lotions, toothpaste, hair gel. Front and back halves, crimp at the top.",
    sizes: [
      { label: "50 ml · 80 × 110 mm", w: 80, h: 110, d: 0 },
      { label: "100 ml · 110 × 150 mm", w: 110, h: 150, d: 0 },
      { label: "200 ml · 140 × 180 mm", w: 140, h: 180, d: 0 },
    ],
    usesDepth: false,
  },
  sleeve: {
    name: "Wrap sleeve",
    hint: "A band round soap bars, chocolate, candles, folded clothes or a box. Front, sides and back.",
    sizes: [
      { label: "Soap bar · 60 × 50, 25 deep", w: 60, h: 50, d: 25 },
      { label: "Bar · 90 × 60, 35 deep", w: 90, h: 60, d: 35 },
      { label: "Box band · 120 × 70, 45 deep", w: 120, h: 70, d: 45 },
    ],
    usesDepth: true,
    depthLabel: "Depth",
  },
  bag: {
    name: "Shopping bag",
    hint: "Paper or laminated bag front for fashion, gifts and boutiques.",
    sizes: [
      { label: "Small · 250 × 330 mm", w: 250, h: 330, d: 0 },
      { label: "Medium · 320 × 420 mm", w: 320, h: 420, d: 0 },
      { label: "Large · 400 × 500 mm", w: 400, h: 500, d: 0 },
    ],
    usesDepth: false,
  },
};

export type PanelRole = "front" | "info" | "info2" | "side" | "plain";

export interface PackPanel {
  id: string;
  role: PanelRole;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Point = [number, number];

export interface PackLayout {
  /** The flat sheet, trim size (bleed goes round it). */
  width: number;
  height: number;
  panels: PackPanel[];
  /** Closed cut outlines (polygons), and circles for round cuts. */
  cuts: Point[][];
  circles: Array<{ cx: number; cy: number; r: number }>;
  /** Fold / crease lines. */
  folds: Array<[Point, Point]>;
  /** Areas the printer seals or crimps: keep words out. */
  seals: Array<{ x: number; y: number; w: number; h: number }>;
}

const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

export function clampSize(format: PackFormat, size: Partial<PackSize>): PackSize {
  const base = PACK_FORMAT_INFO[format].sizes[1];
  const num = (value: unknown, fallback: number, min: number, max: number) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(Math.min(max, Math.max(min, n)) * 10) / 10 : fallback;
  };
  const w = num(size.w, base.w, 20, 600);
  const h = format === "round_sticker" ? w : num(size.h, base.h, 20, 600);
  const d = PACK_FORMAT_INFO[format].usesDepth ? num(size.d, base.d, 10, 300) : 0;
  return { w, h, d };
}

/** The flat print layout for a format at a size: panels, cut and fold lines, seal zones. */
export function packLayout(format: PackFormat, input: Partial<PackSize>): PackLayout {
  const { w, h, d } = clampSize(format, input);
  switch (format) {
    case "pouch": {
      const width = w * 2;
      const height = h + d;
      return {
        width,
        height,
        panels: [
          { id: "front", role: "front", x: 0, y: 0, w, h },
          { id: "back", role: "info", x: w, y: 0, w, h },
          { id: "gusset", role: "plain", x: 0, y: h, w: width, h: d },
        ],
        cuts: [rect(0, 0, width, height)],
        circles: [],
        folds: [
          [[w, 0], [w, h]],
          [[0, h], [width, h]],
        ],
        // Top heat seal and zip, and the side seals.
        seals: [
          { x: 0, y: 0, w: width, h: 12 },
          { x: 0, y: 0, w: 6, h },
          { x: width - 6, y: 0, w: 6, h },
        ],
      };
    }
    case "box": {
      const tuck = 15;
      const glue = 12;
      const dust = Math.round(d * 0.6);
      const y0 = d + tuck;
      const y1 = y0 + h;
      const a = 0;
      const b = w;
      const c = w + d;
      const e2 = 2 * w + d;
      const e = 2 * w + 2 * d;
      const outline: Point[] = [
        [a, y0],
        [b, y0],
        [b + 3, y0 - dust],
        [c - 3, y0 - dust],
        [c, y0],
        [c, y0 - d],
        [c + 4, y0 - d - tuck],
        [e2 - 4, y0 - d - tuck],
        [e2, y0 - d],
        [e2, y0],
        [e2 + 3, y0 - dust],
        [e - 3, y0 - dust],
        [e, y0],
        [e + glue, y0 + 5],
        [e + glue, y1 - 5],
        [e, y1],
        [e - 3, y1 + dust],
        [e2 + 3, y1 + dust],
        [e2, y1],
        [c, y1],
        [c - 3, y1 + dust],
        [b + 3, y1 + dust],
        [b, y1],
        [b, y1 + d],
        [b - 4, y1 + d + tuck],
        [a + 4, y1 + d + tuck],
        [a, y1 + d],
      ];
      return {
        width: e + glue,
        height: y1 + d + tuck,
        panels: [
          { id: "front", role: "front", x: a, y: y0, w, h },
          { id: "side-left", role: "side", x: b, y: y0, w: d, h },
          { id: "back", role: "info", x: c, y: y0, w, h },
          { id: "side-right", role: "info2", x: e2, y: y0, w: d, h },
          { id: "top", role: "plain", x: c, y: y0 - d, w, h: d },
          { id: "bottom", role: "plain", x: a, y: y1, w, h: d },
        ],
        cuts: [outline],
        circles: [],
        folds: [
          [[b, y0], [b, y1]],
          [[c, y0], [c, y1]],
          [[e2, y0], [e2, y1]],
          [[e, y0], [e, y1]],
          [[b, y0], [c, y0]],
          [[c, y0], [e2, y0]],
          [[e2, y0], [e, y0]],
          [[c, y0 - d], [e2, y0 - d]],
          [[a, y1], [b, y1]],
          [[b, y1], [c, y1]],
          [[e2, y1], [e, y1]],
          [[a, y1 + d], [b, y1 + d]],
        ],
        seals: [{ x: e, y: y0, w: glue, h }],
      };
    }
    case "jar_label": {
      const side = Math.round(w * 0.3);
      const front = w - side * 2;
      return {
        width: w,
        height: h,
        panels: [
          { id: "info", role: "info", x: 0, y: 0, w: side, h },
          { id: "front", role: "front", x: side, y: 0, w: front, h },
          { id: "info2", role: "info2", x: side + front, y: 0, w: side, h },
        ],
        cuts: [rect(0, 0, w, h)],
        circles: [],
        folds: [],
        seals: [{ x: w - 8, y: 0, w: 8, h }],
      };
    }
    case "bottle_label": {
      const gap = 6;
      return {
        width: w * 2 + gap,
        height: h,
        panels: [
          { id: "front", role: "front", x: 0, y: 0, w, h },
          { id: "back", role: "info", x: w + gap, y: 0, w, h },
        ],
        cuts: [rect(0, 0, w, h), rect(w + gap, 0, w, h)],
        circles: [],
        folds: [],
        seals: [],
      };
    }
    case "round_sticker":
      return {
        width: w,
        height: w,
        panels: [{ id: "front", role: "front", x: 0, y: 0, w, h: w }],
        cuts: [],
        circles: [{ cx: w / 2, cy: w / 2, r: w / 2 }],
        folds: [],
        seals: [],
      };
    case "sachet":
    case "tube_label": {
      const crimp = format === "sachet" ? 8 : 10;
      return {
        width: w * 2,
        height: h,
        panels: [
          { id: "front", role: "front", x: 0, y: 0, w, h },
          { id: "back", role: "info", x: w, y: 0, w, h },
        ],
        cuts: [rect(0, 0, w * 2, h)],
        circles: [],
        folds: [[[w, 0], [w, h]]],
        seals: format === "sachet" ? [
          { x: 0, y: 0, w: w * 2, h: crimp },
          { x: 0, y: h - crimp, w: w * 2, h: crimp },
        ] : [{ x: 0, y: 0, w: w * 2, h: crimp }],
      };
    }
    case "sleeve": {
      const overlap = 10;
      return {
        width: 2 * w + 2 * d + overlap,
        height: h,
        panels: [
          { id: "front", role: "front", x: 0, y: 0, w, h },
          { id: "side-left", role: "side", x: w, y: 0, w: d, h },
          { id: "back", role: "info", x: w + d, y: 0, w, h },
          { id: "side-right", role: "info2", x: 2 * w + d, y: 0, w: d, h },
        ],
        cuts: [rect(0, 0, 2 * w + 2 * d + overlap, h)],
        circles: [],
        folds: [
          [[w, 0], [w, h]],
          [[w + d, 0], [w + d, h]],
          [[2 * w + d, 0], [2 * w + d, h]],
          [[2 * w + 2 * d, 0], [2 * w + 2 * d, h]],
        ],
        seals: [{ x: 2 * w + 2 * d, y: 0, w: overlap, h }],
      };
    }
    case "bag":
      return {
        width: w,
        height: h,
        panels: [{ id: "front", role: "front", x: 0, y: 0, w, h }],
        cuts: [rect(0, 0, w, h)],
        circles: [],
        folds: [],
        // Handle holes and the top turn-over.
        seals: [{ x: 0, y: 0, w, h: 40 }],
      };
  }
}

// ─── Product types: the words a pack needs ───────────────────────────────────

export const PRODUCT_TYPES = ["food", "drinks", "beauty", "hair", "wellness", "fashion", "home", "baby", "pet", "cleaning", "electronics", "other"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const INFO_FIELDS = ["ingredients", "allergens", "nutrition", "directions", "storage", "warnings", "care", "material", "specs"] as const;
export type InfoField = (typeof INFO_FIELDS)[number];

export const PRODUCT_TYPE_INFO: Record<ProductType, { name: string; fields: InfoField[]; regLabel: string; formats: PackFormat[]; claims: string[]; net: string }> = {
  food: { name: "Food & snacks", fields: ["ingredients", "allergens", "nutrition", "storage"], regLabel: "NAFDAC Reg. No.", formats: ["pouch", "jar_label", "box", "sachet", "round_sticker"], claims: ["No preservatives", "Freshly roasted", "Made in Nigeria", "High in protein"], net: "Net wt. 500 g" },
  drinks: { name: "Drinks", fields: ["ingredients", "nutrition", "storage"], regLabel: "NAFDAC Reg. No.", formats: ["bottle_label", "sachet", "round_sticker", "box"], claims: ["100% natural", "No added sugar", "Serve chilled", "Real fruit"], net: "50 cl" },
  beauty: { name: "Skincare & beauty", fields: ["ingredients", "directions", "warnings"], regLabel: "NAFDAC Reg. No.", formats: ["jar_label", "tube_label", "box", "bottle_label", "round_sticker"], claims: ["Paraben free", "For all skin types", "Cruelty free", "Shea & cocoa butter"], net: "250 g" },
  hair: { name: "Hair care", fields: ["ingredients", "directions", "warnings"], regLabel: "NAFDAC Reg. No.", formats: ["bottle_label", "jar_label", "tube_label", "sachet"], claims: ["Strengthens edges", "Sulfate free", "For natural hair", "Moisture lock"], net: "200 ml" },
  wellness: { name: "Supplements & wellness", fields: ["ingredients", "directions", "warnings", "storage"], regLabel: "NAFDAC Reg. No.", formats: ["jar_label", "box", "sachet", "bottle_label"], claims: ["60 capsules", "Plant based", "No fillers", "Daily support"], net: "60 capsules" },
  fashion: { name: "Fashion & accessories", fields: ["material", "care"], regLabel: "", formats: ["bag", "box", "sleeve", "round_sticker"], claims: ["Handmade", "Made in Lagos", "Premium fabric", "Limited edition"], net: "" },
  home: { name: "Home, candles & scents", fields: ["material", "directions", "warnings"], regLabel: "", formats: ["box", "jar_label", "sleeve", "round_sticker"], claims: ["Soy wax", "40 hour burn", "Hand poured", "Natural scent"], net: "200 g" },
  baby: { name: "Baby & kids", fields: ["ingredients", "directions", "warnings"], regLabel: "NAFDAC Reg. No.", formats: ["jar_label", "tube_label", "box", "pouch"], claims: ["Gentle formula", "Tear free", "Dermatologist tested", "Fragrance free"], net: "200 ml" },
  pet: { name: "Pet food & care", fields: ["ingredients", "nutrition", "directions", "storage"], regLabel: "", formats: ["pouch", "box", "jar_label"], claims: ["Real chicken", "Grain free", "Vet approved", "For all breeds"], net: "1 kg" },
  cleaning: { name: "Cleaning & household", fields: ["ingredients", "directions", "warnings"], regLabel: "NAFDAC Reg. No.", formats: ["bottle_label", "sachet", "box", "pouch"], claims: ["Kills 99.9% of germs", "Fresh lemon", "Concentrated", "Safe on surfaces"], net: "1 litre" },
  electronics: { name: "Electronics & gadgets", fields: ["specs", "warnings"], regLabel: "SONCAP No.", formats: ["box", "sleeve", "round_sticker"], claims: ["Fast charging", "1 year warranty", "Universal fit", "Original quality"], net: "" },
  other: { name: "Something else", fields: ["directions", "warnings"], regLabel: "", formats: ["box", "pouch", "jar_label", "bottle_label", "round_sticker", "sachet", "tube_label", "sleeve", "bag"], claims: ["Made with care", "Quality you can trust", "Made in Nigeria"], net: "" },
};

export const INFO_FIELD_LABEL: Record<InfoField, string> = {
  ingredients: "Ingredients",
  allergens: "Allergens",
  nutrition: "Nutrition",
  directions: "How to use",
  storage: "Storage",
  warnings: "Caution",
  care: "Care",
  material: "Material",
  specs: "Specifications",
};

export function isPackFormat(value: unknown): value is PackFormat {
  return typeof value === "string" && (PACK_FORMATS as readonly string[]).includes(value);
}

export function isProductType(value: unknown): value is ProductType {
  return typeof value === "string" && (PRODUCT_TYPES as readonly string[]).includes(value);
}

/** A best guess at the product type from its name, category and description. */
export function guessProductType(text: string): ProductType {
  const t = text.toLowerCase();
  const rules: Array<[ProductType, RegExp]> = [
    ["pet", /\b(dog|cat|pet|puppy|kitten)\b/],
    ["baby", /\b(baby|babies|infant|kids?|toddler|diaper)\b/],
    ["hair", /\b(hair|edges|scalp|braid|wig|shampoo|conditioner)\b/],
    ["beauty", /\b(skin|cream|lotion|serum|soap|shea|body butter|scrub|lip|makeup|perfume|fragrance|face|cosmetic)/],
    ["wellness", /\b(supplement|capsule|vitamin|herbal|tea bag|detox|protein powder|wellness)\b/],
    ["drinks", /\b(drink|juice|zobo|kunu|smoothie|water|wine|coffee|tea|soda|yoghurt|yogurt|chapman)\b/],
    ["cleaning", /\b(detergent|bleach|disinfect|cleaner|soap liquid|dish|laundry|air freshener)\b/],
    ["electronics", /\b(charger|cable|phone|earbud|headphone|power bank|gadget|speaker|usb)\b/],
    ["fashion", /\b(dress|shirt|bag|shoe|ankara|fabric|aso|jewel|watch|cap|hoodie|jean|wear|clothing)\b/],
    ["home", /\b(candle|diffuser|decor|pillow|towel|home|incense|scent)\b/],
    ["food", /\b(nut|chin|plantain|chips|snack|spice|pepper|rice|beans|garri|flour|honey|sauce|cookie|cake|bread|oil|groundnut|cashew|almond|date|food|seasoning|granola|oat)/],
  ];
  return rules.find(([, re]) => re.test(t))?.[0] ?? "other";
}

// ─── The words on the pack ───────────────────────────────────────────────────

export interface NutritionRow {
  label: string;
  value: string;
}

export interface PackContent {
  brand: string;
  name: string;
  variant: string;
  tagline: string;
  claims: string[];
  netContent: string;
  description: string;
  ingredients: string;
  allergens: string;
  nutrition: NutritionRow[];
  servingSize: string;
  directions: string;
  storage: string;
  warnings: string;
  care: string;
  material: string;
  specs: string;
  madeIn: string;
  manufacturer: string;
  regNumber: string;
  batch: string;
  mfgDate: string;
  expiry: string;
  barcode: string;
  qrUrl: string;
  website: string;
  phone: string;
}

export const EMPTY_CONTENT: PackContent = {
  brand: "",
  name: "",
  variant: "",
  tagline: "",
  claims: [],
  netContent: "",
  description: "",
  ingredients: "",
  allergens: "",
  nutrition: [],
  servingSize: "",
  directions: "",
  storage: "",
  warnings: "",
  care: "",
  material: "",
  specs: "",
  madeIn: "Made in Nigeria",
  manufacturer: "",
  regNumber: "",
  batch: "",
  mfgDate: "",
  expiry: "",
  barcode: "",
  qrUrl: "",
  website: "",
  phone: "",
};

const LIMITS: Partial<Record<keyof PackContent, number>> = {
  brand: 40,
  name: 50,
  variant: 40,
  tagline: 90,
  netContent: 30,
  description: 400,
  ingredients: 900,
  allergens: 200,
  servingSize: 40,
  directions: 500,
  storage: 200,
  warnings: 400,
  care: 300,
  material: 200,
  specs: 500,
  madeIn: 60,
  manufacturer: 200,
  regNumber: 40,
  batch: 30,
  mfgDate: 30,
  expiry: 30,
  barcode: 40,
  qrUrl: 300,
  website: 100,
  phone: 30,
};

/** Cleans words from the browser, Peggy or Rex: strings trimmed and capped, claims and nutrition rows limited. */
export function cleanContent(input: unknown): PackContent {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: PackContent = { ...EMPTY_CONTENT };
  for (const [key, max] of Object.entries(LIMITS) as Array<[keyof PackContent, number]>) {
    const value = raw[key];
    if (typeof value === "string") (out as unknown as Record<string, string>)[key] = value.replace(/\s+\n/g, "\n").trim().slice(0, max);
  }
  if (Array.isArray(raw.claims)) out.claims = raw.claims.filter((c): c is string => typeof c === "string" && Boolean(c.trim())).map((c) => c.trim().slice(0, 40)).slice(0, 4);
  if (Array.isArray(raw.nutrition)) {
    out.nutrition = raw.nutrition
      .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : {}))
      .filter((row) => typeof row.label === "string" && row.label.trim())
      .map((row) => ({ label: String(row.label).trim().slice(0, 30), value: typeof row.value === "string" ? row.value.trim().slice(0, 20) : "" }))
      .slice(0, 10);
  }
  if (out.qrUrl && !/^https?:\/\/\S+$/i.test(out.qrUrl)) out.qrUrl = "";
  return out;
}

// ─── Styles (templates) ──────────────────────────────────────────────────────

export const PACK_STYLES = ["midnight", "range", "pop", "split", "kraft", "minimal", "botanical", "ankara", "badge", "clinical", "playful", "luxe"] as const;
export type PackStyle = (typeof PACK_STYLES)[number];

export interface PackColours {
  /** Background. */
  ground: string;
  /** Main text. */
  ink: string;
  /** Highlight: the name's second line, bands, badges. */
  accent: string;
  /** Second highlight. */
  accent2: string;
}

export type FontRole = "condensed" | "heavy" | "serif" | "script" | "round" | "sans";

export const PACK_STYLE_INFO: Record<PackStyle, { name: string; feel: string; best: ProductType[]; colours: PackColours; display: FontRole; body: FontRole; photo: "bowl" | "cutout" | "arch" | "none" }> = {
  midnight: { name: "Midnight crunch", feel: "Dark textured pack, chalky bold letters, a bright band at the bottom. Premium snacks.", best: ["food", "pet", "drinks"], colours: { ground: "#1E1E1E", ink: "#FFFFFF", accent: "#C5D93A", accent2: "#E8E2D0" }, display: "condensed", body: "sans", photo: "bowl" },
  range: { name: "Flavour range", feel: "One bold colour per flavour, big two-tone name, dish photo in the corner. Built for a range of variants.", best: ["food", "drinks", "pet"], colours: { ground: "#E9862D", ink: "#FFFFFF", accent: "#5A2A0C", accent2: "#FFFFFF" }, display: "heavy", body: "sans", photo: "bowl" },
  pop: { name: "Pop duotone", feel: "Two loud colours and a giant playful line. Made for shelves and Instagram.", best: ["food", "drinks", "beauty", "baby"], colours: { ground: "#5B2A9A", ink: "#FFD23F", accent: "#FFFFFF", accent2: "#FFD23F" }, display: "heavy", body: "sans", photo: "cutout" },
  split: { name: "Split field", feel: "Two-tone with a wave, a banner for the flavour and a column of benefit badges.", best: ["food", "wellness", "drinks"], colours: { ground: "#4E6B3A", ink: "#FFFFFF", accent: "#E7D44E", accent2: "#2F4424" }, display: "round", body: "sans", photo: "bowl" },
  kraft: { name: "Kraft & stamp", feel: "Brown kraft paper, ink stamp logo, handwritten notes. Natural and homemade.", best: ["food", "home", "beauty"], colours: { ground: "#C8A27A", ink: "#2B2118", accent: "#2B2118", accent2: "#8C3B23" }, display: "serif", body: "sans", photo: "none" },
  minimal: { name: "Clean minimal", feel: "White space, a small refined name and one thin rule. Calm and expensive.", best: ["beauty", "wellness", "home"], colours: { ground: "#F6F3EE", ink: "#1F1F1F", accent: "#B08D57", accent2: "#E7E0D5" }, display: "serif", body: "sans", photo: "none" },
  botanical: { name: "Botanical arch", feel: "Deep colour with a photo in an arch, gold accents and leaves. Skincare, candles, teas.", best: ["beauty", "home", "wellness", "hair"], colours: { ground: "#1F3B2D", ink: "#F3EBDD", accent: "#C9A25E", accent2: "#2C5240" }, display: "serif", body: "sans", photo: "arch" },
  ankara: { name: "Ankara pattern", feel: "African geometric pattern bands with a bold name in the middle. Proudly Nigerian.", best: ["food", "fashion", "beauty", "drinks"], colours: { ground: "#FFF6E5", ink: "#1C1C1C", accent: "#D9481E", accent2: "#127A6B" }, display: "heavy", body: "sans", photo: "bowl" },
  badge: { name: "Retro badge", feel: "Round emblem with a sunburst, vintage lettering. Sauces, drinks, spices.", best: ["drinks", "food", "home"], colours: { ground: "#F2E3C6", ink: "#3A1F14", accent: "#C1352B", accent2: "#E7B34C" }, display: "condensed", body: "sans", photo: "none" },
  clinical: { name: "Clinical clean", feel: "White with a colour block, a strength or count up front and neat info. Supplements, skincare, cleaning.", best: ["wellness", "beauty", "cleaning", "baby"], colours: { ground: "#FFFFFF", ink: "#13233F", accent: "#2F6BFF", accent2: "#E8F0FF" }, display: "sans", body: "sans", photo: "none" },
  playful: { name: "Playful blobs", feel: "Bright blobs and rounded letters. Kids, pets and fun snacks.", best: ["baby", "pet", "food"], colours: { ground: "#FFE45C", ink: "#2A1B5C", accent: "#FF6B9A", accent2: "#5CD3FF" }, display: "round", body: "round", photo: "cutout" },
  luxe: { name: "Black & gold", feel: "Black, gold lines and a thin serif monogram. Perfume, fashion, gifts.", best: ["fashion", "beauty", "home"], colours: { ground: "#111111", ink: "#E9D7A5", accent: "#C9A84C", accent2: "#2A2A2A" }, display: "serif", body: "serif", photo: "none" },
};

export function isPackStyle(value: unknown): value is PackStyle {
  return typeof value === "string" && (PACK_STYLES as readonly string[]).includes(value);
}

/** Styles that suit a product type first, then the rest. */
export function stylesFor(type: ProductType): PackStyle[] {
  const best = PACK_STYLES.filter((style) => PACK_STYLE_INFO[style].best.includes(type));
  return [...best, ...PACK_STYLES.filter((style) => !best.includes(style))];
}

// ─── The whole design, as saved ──────────────────────────────────────────────

export interface PackImage {
  url: string;
  /** How the picture sits on the front. */
  fit: "bowl" | "cutout" | "arch" | "full" | "none";
}

export interface PackDesign {
  version: 1;
  format: PackFormat;
  size: PackSize;
  style: PackStyle;
  productType: ProductType;
  productId: string | null;
  colours: PackColours;
  content: PackContent;
  image: PackImage | null;
  logoUrl: string | null;
  showLogo: boolean;
  finish: "matte" | "gloss" | "kraft" | "foil";
}

const HEX = /^#[0-9a-f]{6}$/i;

export function cleanColours(input: unknown, fallback: PackColours): PackColours {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const pick = (key: keyof PackColours) => (typeof raw[key] === "string" && HEX.test(raw[key] as string) ? (raw[key] as string).toUpperCase() : fallback[key]);
  return { ground: pick("ground"), ink: pick("ink"), accent: pick("accent"), accent2: pick("accent2") };
}

const OWN_URL = /^https:\/\/[^\s"'<>]+$/i;

/** Validates a saved or posted design; anything odd falls back to safe defaults. */
export function cleanDesign(input: unknown): PackDesign {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const format = isPackFormat(raw.format) ? raw.format : "pouch";
  const style = isPackStyle(raw.style) ? raw.style : "midnight";
  const productType = isProductType(raw.productType) ? raw.productType : "food";
  const imageRaw = (raw.image && typeof raw.image === "object" ? raw.image : null) as Record<string, unknown> | null;
  const fits = ["bowl", "cutout", "arch", "full", "none"] as const;
  return {
    version: 1,
    format,
    size: clampSize(format, (raw.size ?? {}) as Partial<PackSize>),
    style,
    productType,
    productId: typeof raw.productId === "string" && raw.productId.length < 64 ? raw.productId : null,
    colours: cleanColours(raw.colours, PACK_STYLE_INFO[style].colours),
    content: cleanContent(raw.content),
    image: imageRaw && typeof imageRaw.url === "string" && OWN_URL.test(imageRaw.url) ? { url: imageRaw.url, fit: fits.includes(imageRaw.fit as (typeof fits)[number]) ? (imageRaw.fit as PackImage["fit"]) : "bowl" } : null,
    logoUrl: typeof raw.logoUrl === "string" && OWN_URL.test(raw.logoUrl) ? raw.logoUrl : null,
    showLogo: raw.showLogo !== false,
    finish: raw.finish === "gloss" || raw.finish === "kraft" || raw.finish === "foil" ? raw.finish : "matte",
  };
}

/** A fresh design for a product: style defaults, the product type's claims and net content as starters. */
export function newDesign(opts: { format?: PackFormat; style?: PackStyle; productType?: ProductType; brand: string; name?: string; productId?: string | null; image?: string | null; logoUrl?: string | null; website?: string; barcode?: string; qrUrl?: string }): PackDesign {
  const productType = opts.productType ?? "food";
  const format = opts.format ?? PRODUCT_TYPE_INFO[productType].formats[0];
  const style = opts.style ?? stylesFor(productType)[0];
  const info = PACK_STYLE_INFO[style];
  return cleanDesign({
    format,
    style,
    productType,
    productId: opts.productId ?? null,
    size: PACK_FORMAT_INFO[format].sizes[1],
    colours: info.colours,
    content: {
      ...EMPTY_CONTENT,
      brand: opts.brand,
      name: opts.name ?? "",
      claims: PRODUCT_TYPE_INFO[productType].claims.slice(0, 3),
      netContent: PRODUCT_TYPE_INFO[productType].net,
      website: opts.website ?? "",
      barcode: opts.barcode ?? "",
      qrUrl: opts.qrUrl ?? "",
    },
    image: opts.image ? { url: opts.image, fit: info.photo === "none" ? "bowl" : info.photo } : null,
    logoUrl: opts.logoUrl ?? null,
    showLogo: true,
  });
}

// ─── Text fitting (no DOM: character-width estimates per font role) ─────────

/** Average character width as a share of the font size. */
export const CHAR_WIDTH: Record<FontRole, number> = { condensed: 0.46, heavy: 0.66, serif: 0.54, script: 0.46, round: 0.6, sans: 0.55 };

/** The largest font size (mm) at which `text` fits `maxWidth` on one line, capped at `maxSize`. */
export function fitFontSize(text: string, maxWidth: number, maxSize: number, role: FontRole, minSize = 1.2) {
  const length = Math.max(1, text.trim().length);
  return Math.max(minSize, Math.min(maxSize, maxWidth / (length * CHAR_WIDTH[role])));
}

/** Greedy word wrap to lines of at most `maxChars` characters (long words are cut). */
export function wrapText(text: string, maxChars: number): string[] {
  const limit = Math.max(4, Math.floor(maxChars));
  const lines: string[] = [];
  for (const paragraph of text.split(/\n+/)) {
    let line = "";
    for (const rawWord of paragraph.split(/\s+/).filter(Boolean)) {
      let word = rawWord;
      while (word.length > limit) {
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(word.slice(0, limit));
        word = word.slice(limit);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= limit) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export interface InfoBlock {
  heading?: string;
  text: string;
  bold?: boolean;
}

export interface InfoLine {
  text: string;
  y: number;
  heading: boolean;
  bold: boolean;
}

/**
 * Lays out the back-of-pack words in a box: the biggest font size (mm, between 1.4 and `maxSize`) at which every block
 * fits the height. Returns lines with their baseline y. When even the smallest size overflows, the last lines are
 * dropped and `overflow` is true so the designer can warn.
 */
export function layoutInfo(blocks: InfoBlock[], width: number, height: number, role: FontRole = "sans", maxSize = 3): { size: number; lines: InfoLine[]; overflow: boolean } {
  const usable = blocks.filter((block) => block.text.trim());
  for (let size = Math.max(1.4, maxSize); size >= 1.4; size -= 0.1) {
    const lines = place(usable, width, size, role);
    const bottom = lines.length ? lines[lines.length - 1].y + size * 0.3 : 0;
    if (bottom <= height) return { size: Math.round(size * 100) / 100, lines, overflow: false };
  }
  const size = 1.4;
  const lines = place(usable, width, size, role).filter((line) => line.y <= height);
  return { size, lines, overflow: true };
}

function place(blocks: InfoBlock[], width: number, size: number, role: FontRole) {
  const lineHeight = size * 1.28;
  const maxChars = width / (size * CHAR_WIDTH[role]);
  const lines: InfoLine[] = [];
  let y = size;
  blocks.forEach((block, index) => {
    if (index > 0) y += size * 0.55;
    if (block.heading) {
      lines.push({ text: block.heading.toUpperCase(), y, heading: true, bold: true });
      y += lineHeight;
    }
    for (const text of wrapText(block.text, maxChars)) {
      lines.push({ text, y, heading: false, bold: Boolean(block.bold) });
      y += lineHeight;
    }
  });
  return lines;
}

/** The back-of-pack blocks for a product type, in reading order. */
export function infoBlocks(content: PackContent, type: ProductType): InfoBlock[] {
  const fields = PRODUCT_TYPE_INFO[type].fields;
  const blocks: InfoBlock[] = [];
  if (content.description) blocks.push({ text: content.description });
  for (const field of fields) {
    if (field === "nutrition") continue;
    const text = (content as unknown as Record<string, string>)[field];
    if (text) blocks.push({ heading: INFO_FIELD_LABEL[field], text, bold: field === "allergens" });
  }
  return blocks;
}

// ─── Colour ──────────────────────────────────────────────────────────────────

/** Naive RGB → CMYK percentages, for the printer's spec sheet. A proof from the printer is still the truth. */
export function hexToCmyk(hex: string): [number, number, number, number] {
  const value = HEX.test(hex) ? hex.slice(1) : "000000";
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);
  return [c, m, y, k].map((n) => Math.round(n * 100)) as [number, number, number, number];
}

/** Relative luminance 0–1, to pick readable text on a colour. */
export function luminance(hex: string) {
  const value = HEX.test(hex) ? hex.slice(1) : "000000";
  const channel = (i: number) => {
    const c = parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

export function readableOn(hex: string, dark = "#111111", light = "#FFFFFF") {
  return luminance(hex) > 0.42 ? dark : light;
}

// ─── Printer's spec sheet ────────────────────────────────────────────────────

export function specSheet(design: PackDesign, title: string): string[] {
  const layout = packLayout(design.format, design.size);
  const info = PACK_FORMAT_INFO[design.format];
  const colour = (label: string, hex: string) => {
    const [c, m, y, k] = hexToCmyk(hex);
    return `${label}: ${hex}  ~ C${c} M${m} Y${y} K${k}`;
  };
  const dims = design.format === "round_sticker" ? `${design.size.w} mm diameter` : `${design.size.w} x ${design.size.h} mm${info.usesDepth ? `, ${info.depthLabel?.toLowerCase()} ${design.size.d} mm` : ""}`;
  return [
    title,
    "",
    `Format: ${info.name}`,
    `Face size: ${dims}`,
    `Flat sheet (trim): ${round1(layout.width)} x ${round1(layout.height)} mm`,
    `With bleed: ${round1(layout.width + BLEED_MM * 2)} x ${round1(layout.height + BLEED_MM * 2)} mm (${BLEED_MM} mm bleed all round)`,
    `Safe zone: keep words ${SAFE_MM} mm inside the trim and out of seal / glue areas`,
    `Artwork: 300 dpi, RGB. Convert to your press profile and send a colour proof before the run.`,
    `Dieline: spot colour "CutContour" (cut, solid) and "Crease" (fold, dashed), set to overprint.`,
    `Finish asked for: ${design.finish}`,
    "",
    "Colours",
    colour("Background", design.colours.ground),
    colour("Text", design.colours.ink),
    colour("Accent", design.colours.accent),
    colour("Accent 2", design.colours.accent2),
    "",
    design.content.barcode ? `Barcode: ${design.content.barcode} (print at 100%, dark bars on a light ground)` : "Barcode: none",
    design.content.regNumber ? `${PRODUCT_TYPE_INFO[design.productType].regLabel || "Reg. No."} ${design.content.regNumber}` : "",
    design.content.netContent ? `Net content on pack: ${design.content.netContent}` : "",
    design.content.batch || design.content.expiry ? "Batch / expiry: leave the box clear for an inkjet or stamp on the line." : "",
  ].filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== ""));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
