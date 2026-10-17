// Product types (preset categories): what kind of thing a product is decides which details the seller is asked for
// (Clothing → Material, Fit, Care…) and which options are suggested for its versions (Size, Colour…). Pure, shared
// by the web product form (src/app/components/ProductForm.tsx), the phone product editor, the storefront product
// pages ("Details" table), Peggy's product assistant and tests/product-variants.test.mjs.
//
// The type is saved on the product (StoreProduct.productType) and the detail values in StoreProduct.productDetails
// ({ fieldKey: value }). A product with no type (every product made before types existed) is "other".
// English labels live here because shoppers see them on the product page; the seller's form translates them with
// the "productTypes" namespace (keys type.<key>, field.<key>, option.<name>, value.<value>).

export const PRODUCT_TYPE_KEYS = [
  "clothing",
  "shoes",
  "bags",
  "jewellery",
  "beauty",
  "hair",
  "food",
  "phones",
  "electronics",
  "home",
  "baby",
  "books",
  "digital",
  "service",
  "other",
] as const;

export type ProductTypeKey = (typeof PRODUCT_TYPE_KEYS)[number];

export type DetailFieldKind = "text" | "longtext" | "select";

export interface DetailField {
  /** Key in StoreProduct.productDetails (and the translation key field.<key>). Unique within a type. */
  key: string;
  /** What shoppers see in the Details table. */
  label: string;
  kind: DetailFieldKind;
  /** Choices for a select (the seller can still type their own). */
  choices?: string[];
  placeholder?: string;
  /** Saved in an existing product column instead of productDetails (the form binds it to that field). */
  column?: "careInstructions" | "warranty";
}

export interface OptionPreset {
  /** The option's name as shoppers see it ("Size", "Colour"). */
  name: string;
  /** Common values offered as quick chips. */
  values: string[];
}

export interface ProductTypeDef {
  key: ProductTypeKey;
  label: string;
  /** Short example of what belongs here, for the type picker. */
  hint: string;
  icon: string;
  /** Suggested options for versions, in the order they are offered. */
  options: OptionPreset[];
  /** Details asked for on the form and shown on the product page. */
  fields: DetailField[];
  /** Whether stock is usually counted per version (false for services and digital products). */
  physical: boolean;
}

const COLOURS = ["Black", "White", "Red", "Blue", "Navy", "Green", "Yellow", "Pink", "Purple", "Brown", "Grey", "Gold", "Cream", "Orange"];
const CONDITION = ["Brand new", "UK used", "Nigerian used", "Refurbished"];
const YES_NO = ["Yes", "No"];

const care: DetailField = { key: "care", label: "Care instructions", kind: "longtext", column: "careInstructions", placeholder: "Hand wash cold. Do not bleach." };
const warranty: DetailField = { key: "warranty", label: "Warranty", kind: "text", column: "warranty", placeholder: "6 months" };
const material: DetailField = { key: "material", label: "Material", kind: "text", placeholder: "100% cotton" };
const nafdac: DetailField = { key: "nafdac", label: "NAFDAC number", kind: "text", placeholder: "A1-1234" };
const ingredients: DetailField = { key: "ingredients", label: "Ingredients", kind: "longtext", placeholder: "Shea butter, coconut oil…" };
const dimensions: DetailField = { key: "dimensions", label: "Size (L × W × H)", kind: "text", placeholder: "30 × 20 × 10 cm" };

export const PRODUCT_TYPES: readonly ProductTypeDef[] = [
  {
    key: "clothing",
    label: "Clothing",
    hint: "Dresses, shirts, Ankara, agbada",
    icon: "shop",
    physical: true,
    options: [
      { name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "8", "10", "12", "14", "16", "18", "20"] },
      { name: "Colour", values: COLOURS },
    ],
    fields: [
      material,
      { key: "fit", label: "Fit", kind: "select", choices: ["Slim fit", "Regular fit", "Loose fit", "Oversized"] },
      { key: "gender", label: "For", kind: "select", choices: ["Women", "Men", "Unisex", "Kids"] },
      care,
    ],
  },
  {
    key: "shoes",
    label: "Shoes",
    hint: "Sneakers, heels, slippers, sandals",
    icon: "tag",
    physical: true,
    options: [
      { name: "Size (EU)", values: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"] },
      { name: "Size (UK)", values: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] },
      { name: "Colour", values: COLOURS },
    ],
    fields: [
      { key: "upper", label: "Upper material", kind: "text", placeholder: "Leather" },
      { key: "sole", label: "Sole", kind: "text", placeholder: "Rubber" },
      { key: "heel", label: "Heel height", kind: "text", placeholder: "5 cm" },
      { key: "gender", label: "For", kind: "select", choices: ["Women", "Men", "Unisex", "Kids"] },
    ],
  },
  {
    key: "bags",
    label: "Bags & accessories",
    hint: "Handbags, belts, caps, sunglasses",
    icon: "bag",
    physical: true,
    options: [
      { name: "Colour", values: COLOURS },
      { name: "Size", values: ["Mini", "Small", "Medium", "Large"] },
    ],
    fields: [material, dimensions, { key: "strap", label: "Strap", kind: "text", placeholder: "Adjustable shoulder strap" }, { key: "closure", label: "Closure", kind: "text", placeholder: "Zip" }],
  },
  {
    key: "jewellery",
    label: "Jewellery",
    hint: "Necklaces, rings, beads, watches",
    icon: "star",
    physical: true,
    options: [
      { name: "Colour", values: ["Gold", "Silver", "Rose gold", "Black"] },
      { name: "Size", values: ["5", "6", "7", "8", "9", "10", "16 inch", "18 inch", "20 inch"] },
    ],
    fields: [
      { key: "metal", label: "Metal", kind: "text", placeholder: "Stainless steel" },
      { key: "plating", label: "Plating", kind: "text", placeholder: "18k gold plated" },
      { key: "stone", label: "Stone", kind: "text", placeholder: "Cubic zirconia" },
      { key: "tarnish", label: "Tarnish free", kind: "select", choices: YES_NO },
    ],
  },
  {
    key: "beauty",
    label: "Beauty & skincare",
    hint: "Creams, soaps, perfume, makeup",
    icon: "sparkle",
    physical: true,
    options: [
      { name: "Size", values: ["30ml", "50ml", "100ml", "150ml", "200ml", "250ml", "500ml", "1 litre"] },
      { name: "Shade", values: ["Light", "Medium", "Tan", "Deep", "Dark"] },
      { name: "Scent", values: ["Unscented", "Vanilla", "Rose", "Oud", "Coconut"] },
    ],
    fields: [
      { key: "skinType", label: "Skin type", kind: "select", choices: ["All skin types", "Oily", "Dry", "Combination", "Sensitive"] },
      { key: "volume", label: "Volume", kind: "text", placeholder: "200ml" },
      ingredients,
      { key: "howToUse", label: "How to use", kind: "longtext", placeholder: "Apply morning and night on clean skin." },
      { key: "expiry", label: "Expiry", kind: "text", placeholder: "March 2027" },
      nafdac,
    ],
  },
  {
    key: "hair",
    label: "Hair (wigs, extensions)",
    hint: "Wigs, bundles, closures, braids",
    icon: "wand",
    physical: true,
    options: [
      { name: "Length", values: ["8 inch", "10 inch", "12 inch", "14 inch", "16 inch", "18 inch", "20 inch", "22 inch", "24 inch", "26 inch", "28 inch", "30 inch"] },
      { name: "Texture", values: ["Straight", "Body wave", "Deep wave", "Water wave", "Kinky curly", "Bone straight"] },
      { name: "Colour", values: ["Natural black", "1B", "Brown", "Burgundy", "613 blonde", "Ombre"] },
    ],
    fields: [
      { key: "hairType", label: "Hair type", kind: "select", choices: ["Human hair", "Synthetic", "Human hair blend"] },
      { key: "lace", label: "Lace", kind: "select", choices: ["No lace", "Closure", "Frontal", "Full lace"] },
      { key: "density", label: "Density", kind: "text", placeholder: "180%" },
      { key: "dyeable", label: "Can be dyed", kind: "select", choices: YES_NO },
    ],
  },
  {
    key: "food",
    label: "Food & drinks",
    hint: "Snacks, spices, drinks, foodstuff",
    icon: "leaf",
    physical: true,
    options: [
      { name: "Size", values: ["Small", "Medium", "Large", "250g", "500g", "1kg", "2kg", "5kg", "50cl", "1 litre", "Paint bucket", "Bag"] },
      { name: "Flavour", values: ["Original", "Spicy", "Sweet", "Chocolate", "Vanilla"] },
    ],
    fields: [
      { key: "weight", label: "Weight", kind: "text", placeholder: "1kg" },
      ingredients,
      { key: "bestBefore", label: "Best before", kind: "text", placeholder: "December 2026" },
      { key: "storage", label: "Storage", kind: "text", placeholder: "Keep in a cool, dry place" },
      nafdac,
    ],
  },
  {
    key: "phones",
    label: "Phones & gadgets",
    hint: "Phones, tablets, earbuds, power banks",
    icon: "phone",
    physical: true,
    options: [
      { name: "Storage", values: ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"] },
      { name: "Colour", values: ["Black", "White", "Blue", "Gold", "Silver", "Purple", "Green"] },
      { name: "Condition", values: CONDITION },
    ],
    fields: [
      { key: "model", label: "Model", kind: "text", placeholder: "iPhone 13 Pro" },
      { key: "condition", label: "Condition", kind: "select", choices: CONDITION },
      { key: "ram", label: "RAM", kind: "text", placeholder: "6GB" },
      { key: "battery", label: "Battery health", kind: "text", placeholder: "89%" },
      warranty,
    ],
  },
  {
    key: "electronics",
    label: "Electronics & appliances",
    hint: "TVs, fans, generators, blenders",
    icon: "plug",
    physical: true,
    options: [
      { name: "Size", values: ["32 inch", "43 inch", "50 inch", "55 inch", "65 inch", "1HP", "1.5HP", "2HP"] },
      { name: "Colour", values: ["Black", "White", "Silver", "Grey"] },
    ],
    fields: [
      { key: "brand", label: "Brand", kind: "text", placeholder: "Hisense" },
      { key: "model", label: "Model", kind: "text", placeholder: "HX-200" },
      { key: "condition", label: "Condition", kind: "select", choices: CONDITION },
      { key: "power", label: "Power", kind: "text", placeholder: "220V, 1500W" },
      warranty,
    ],
  },
  {
    key: "home",
    label: "Home & furniture",
    hint: "Chairs, bedding, kitchen, decor",
    icon: "home",
    physical: true,
    options: [
      { name: "Colour", values: COLOURS },
      { name: "Size", values: ["Small", "Medium", "Large", "3 by 6", "4 by 6", "6 by 6", "7 by 7"] },
    ],
    fields: [material, dimensions, { key: "assembly", label: "Needs assembly", kind: "select", choices: YES_NO }, care],
  },
  {
    key: "baby",
    label: "Baby & kids",
    hint: "Baby clothes, toys, diapers",
    icon: "heart",
    physical: true,
    options: [
      { name: "Age", values: ["0-3 months", "3-6 months", "6-12 months", "1-2 years", "2-3 years", "3-4 years", "4-5 years", "5-6 years", "7-8 years", "9-10 years"] },
      { name: "Colour", values: COLOURS },
    ],
    fields: [{ key: "ageRange", label: "Age range", kind: "text", placeholder: "0-12 months" }, material, { key: "safety", label: "Safety notes", kind: "longtext", placeholder: "Not for children under 3 (small parts)." }],
  },
  {
    key: "books",
    label: "Books & stationery",
    hint: "Books, notebooks, school supplies",
    icon: "book",
    physical: true,
    options: [{ name: "Format", values: ["Paperback", "Hardcover", "eBook"] }],
    fields: [
      { key: "author", label: "Author", kind: "text", placeholder: "Chimamanda Ngozi Adichie" },
      { key: "publisher", label: "Publisher", kind: "text", placeholder: "Farafina" },
      { key: "pages", label: "Pages", kind: "text", placeholder: "320" },
      { key: "language", label: "Language", kind: "text", placeholder: "English" },
    ],
  },
  {
    key: "digital",
    label: "Digital product",
    hint: "E-books, courses, templates",
    icon: "download",
    physical: false,
    options: [{ name: "Plan", values: ["Basic", "Standard", "Premium"] }],
    fields: [
      { key: "format", label: "Format", kind: "text", placeholder: "PDF, 45 pages" },
      { key: "delivery", label: "How you get it", kind: "text", placeholder: "Download link sent by email" },
      { key: "access", label: "Access", kind: "text", placeholder: "Lifetime" },
    ],
  },
  {
    key: "service",
    label: "Service",
    hint: "Makeup, tailoring, cleaning, classes",
    icon: "calendar",
    physical: false,
    options: [
      { name: "Package", values: ["Basic", "Standard", "Premium"] },
      { name: "Duration", values: ["30 minutes", "1 hour", "2 hours", "Half day", "Full day"] },
    ],
    fields: [
      { key: "duration", label: "Duration", kind: "text", placeholder: "2 hours" },
      { key: "location", label: "Where", kind: "select", choices: ["At your place", "At our place", "Online"] },
      { key: "included", label: "What's included", kind: "longtext", placeholder: "Full face makeup, lashes, touch-up kit" },
    ],
  },
  {
    key: "other",
    label: "Other",
    hint: "Anything else",
    icon: "box",
    physical: true,
    options: [
      { name: "Size", values: ["Small", "Medium", "Large"] },
      { name: "Colour", values: COLOURS },
    ],
    fields: [],
  },
];

const BY_KEY = new Map<string, ProductTypeDef>(PRODUCT_TYPES.map((type) => [type.key, type]));

export function isProductTypeKey(value: unknown): value is ProductTypeKey {
  return typeof value === "string" && BY_KEY.has(value);
}

/** The type's definition; anything unknown or missing (older products) is "Other". */
export function productTypeDef(key: unknown): ProductTypeDef {
  return BY_KEY.get(typeof key === "string" ? key : "") ?? BY_KEY.get("other")!;
}

/** The product's type key, "other" when none is set. */
export function productTypeKey(key: unknown): ProductTypeKey {
  return productTypeDef(key).key;
}

export const MAX_DETAIL_VALUE = 1000;
export const MAX_CUSTOM_DETAILS = 20;

/** StoreProduct.productDetails as saved: string values only, trimmed, empty ones dropped. */
export function readProductDetails(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) continue;
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const text = String(raw).trim().slice(0, MAX_DETAIL_VALUE);
    if (text) out[key] = text;
  }
  return out;
}

export interface DetailRow {
  label: string;
  value: string;
}

interface DetailSource {
  productType?: unknown;
  productDetails?: unknown;
  /** The seller's own "name: value" details (the existing specifications field). */
  specifications?: unknown;
  careInstructions?: string | null;
  warranty?: string | null;
}

/** The seller's own details ("Origin: Aba"), from the specifications field. */
export function readCustomDetails(value: unknown): DetailRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { name, value: text } = entry as { name?: unknown; value?: unknown };
    if (typeof name !== "string" || typeof text !== "string" || !name.trim() || !text.trim()) return [];
    return [{ label: name.trim(), value: text.trim() }];
  });
}

/**
 * The product page's Details table: the type's details that are filled in (in the type's order), then the seller's
 * own details. Details saved under another type (the seller changed type) still show, after the current type's.
 */
export function productDetailRows(product: DetailSource, options: { includeColumns?: boolean } = {}): DetailRow[] {
  const type = productTypeDef(product.productType);
  const details = readProductDetails(product.productDetails);
  const rows: DetailRow[] = [];
  const used = new Set<string>();
  for (const field of type.fields) {
    const value = field.column ? (options.includeColumns ? (product[field.column] ?? "").trim() : "") : details[field.key];
    used.add(field.key);
    if (value) rows.push({ label: field.label, value });
  }
  for (const [key, value] of Object.entries(details)) {
    if (used.has(key)) continue;
    const label = PRODUCT_TYPES.flatMap((entry) => entry.fields).find((field) => field.key === key)?.label;
    if (label) rows.push({ label, value });
  }
  const seen = new Set(rows.map((row) => row.label.toLowerCase()));
  for (const row of readCustomDetails(product.specifications)) {
    if (seen.has(row.label.toLowerCase())) continue;
    seen.add(row.label.toLowerCase());
    rows.push(row);
  }
  return rows;
}

/** Guess a type from a category or product name, for a sensible default on new products. */
export function guessProductType(text: string | null | undefined): ProductTypeKey | null {
  const value = (text ?? "").toLowerCase();
  if (!value.trim()) return null;
  const rules: Array<[ProductTypeKey, RegExp]> = [
    ["hair", /\b(wig|wigs|hair|bundle|bundles|frontal|closure|braid|weave|extension)/],
    ["shoes", /\b(shoe|shoes|sneaker|heel|heels|slipper|slippers|sandal|sandals|boot|boots|loafer|palm)/],
    ["phones", /\b(phone|iphone|samsung|tecno|infinix|tablet|ipad|earbud|airpod|power ?bank|charger|gadget)/],
    ["electronics", /\b(tv|television|fan|generator|blender|fridge|freezer|ac|air condition|inverter|speaker|electronic|appliance)/],
    ["beauty", /\b(cream|soap|lotion|serum|perfume|makeup|lipstick|skin|beauty|body butter|shea)/],
    ["food", /\b(food|snack|spice|rice|beans|garri|drink|juice|zobo|chin ?chin|plantain|pepper|honey|palm oil|foodstuff)/],
    ["jewellery", /\b(necklace|ring|rings|earring|bracelet|bead|beads|jewel|watch|anklet)/],
    ["bags", /\b(bag|handbag|purse|tote|backpack|belt|cap|sunglass|wallet|accessor)/],
    ["baby", /\b(baby|kids|toddler|diaper|toy|toys|children)/],
    ["books", /\b(book|novel|notebook|stationery|pen|diary)/],
    ["home", /\b(chair|table|bed|bedsheet|duvet|pillow|curtain|kitchen|pot|plate|decor|furniture|rug)/],
    ["digital", /\b(e-?book|course|template|pdf|download|digital)/],
    ["service", /\b(service|booking|class|session|tailoring|cleaning|makeup artist|consult)/],
    ["clothing", /\b(dress|shirt|t-shirt|tee|gown|ankara|agbada|kaftan|trouser|jean|jeans|skirt|blouse|top|hoodie|jacket|abaya|senator|wear|cloth|clothing|fashion|lace|aso)/],
  ];
  for (const [key, pattern] of rules) if (pattern.test(value)) return key;
  return null;
}
