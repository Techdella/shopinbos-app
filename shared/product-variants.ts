// Product versions ("variants"): options such as Size and Colour, each with values, and one row per combination
// with its own price, "was" price, stock, SKU, photo and on/off. Pure (no imports), shared by the web product form,
// the product API, the storefront product pages, the bag and checkout pricing, the phone product editor, Peggy and
// tests/product-variants.test.mjs.
//
// Stored on StoreProduct:
//   variantOptions  [{ name: "Size", values: ["S", "M", "L"] }, { name: "Colour", values: ["Red", "Black"] }]
//   variants        [{ id, options: { Size: "L", Colour: "Red" }, name: "L / Red", price, compareAtPrice, stock,
//                      sku, imageUrl, enabled, color: "Red", size: "L" }]
// `name`, `color` and `size` are kept on every row so older readers (supplier re-routing, order parts, the
// classic product page) keep working. Rows saved before options existed ({ name, color, size, price, stock… }) are
// read as options Colour / Size, or a single "Option" chosen by name.

export const MAX_OPTIONS = 3;
export const MAX_OPTION_VALUES = 30;
export const MAX_VARIANTS = 100;
export const MAX_PRICE = 100_000_000;
export const MAX_STOCK = 10_000_000;

export interface VariantOption {
  name: string;
  values: string[];
}

export interface ProductVariant {
  id: string;
  /** Option name → value, e.g. { Size: "L", Colour: "Red" }. */
  options: Record<string, string>;
  /** "L / Red": what shoppers, the bag and orders see. */
  name: string;
  /** Null: the product's own price. */
  price: number | null;
  compareAtPrice: number | null;
  /** Null: not counted per version (the product's stock counts). */
  stock: number | null;
  sku: string | null;
  imageUrl: string | null;
  enabled: boolean;
  /** Position in the saved JSON (set when read from storage), so stock changes edit the right row. */
  sourceIndex?: number;
  /** Older extra fields kept as they were. */
  images?: string[];
  customFields?: Array<{ name: string; value: string }>;
}

function text(value: unknown, max = 60) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function money(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function count(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export const isColourOption = (name: string) => /colou?r|shade/i.test(name);
export const isSizeOption = (name: string) => /size|length|storage|age/i.test(name);

function slug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

/** A stable id for a combination ("v-l-red"). */
export function variantIdFor(values: string[]) {
  return `v-${slug(values.join(" ")) || "option"}`;
}

/** "L / Red": the values in option order. */
export function variantLabel(options: Record<string, string>, order?: string[]) {
  const names = order?.length ? order.filter((name) => options[name]) : Object.keys(options);
  const extra = Object.keys(options).filter((name) => !names.includes(name));
  return [...names, ...extra].map((name) => options[name]).filter(Boolean).join(" / ");
}

/** A combination's identity, ignoring case and spacing: "colour=red|size=l". */
export function combinationKey(options: Record<string, string>) {
  return Object.keys(options)
    .map((name) => [name.trim().toLowerCase(), (options[name] ?? "").trim().toLowerCase()] as const)
    .filter(([, value]) => value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}=${value}`)
    .join("|");
}

function readOptionsMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    const key = text(name, 40);
    const val = text(raw);
    if (key && val) out[key] = val;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The product's versions in the current shape, whatever was saved: new rows as they are, older rows with their
 * colour / size read as options (or their name as the one "Option"). Unreadable entries are skipped.
 */
export function normalizeVariants(raw: unknown): ProductVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductVariant[] = [];
  const ids = new Set<string>();
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const row = entry as Record<string, unknown>;
    let options = readOptionsMap(row.options);
    if (!options) {
      const colour = text(row.color);
      const size = text(row.size);
      const name = text(row.name, 100) || text(row.sku);
      if (colour || size) options = { ...(colour ? { Colour: colour } : {}), ...(size ? { Size: size } : {}) };
      else if (name) options = { Option: name };
      else return;
    }
    let id = text(row.id, 80) || `legacy-${index}`;
    while (ids.has(id)) id = `${id}-${index}`;
    ids.add(id);
    const label = variantLabel(options);
    const images = Array.isArray(row.images) ? row.images.filter((src): src is string => typeof src === "string" && Boolean(src)) : [];
    const customFields = Array.isArray(row.customFields)
      ? row.customFields.flatMap((field) => {
          if (!field || typeof field !== "object") return [];
          const { name, value } = field as { name?: unknown; value?: unknown };
          return typeof name === "string" && typeof value === "string" && name.trim() ? [{ name: name.trim(), value }] : [];
        })
      : [];
    const legacyName = row.options ? "" : text(row.name, 100);
    out.push({
      id,
      options,
      // Older rows keep the name they were sold under (the bag and old orders use it).
      name: legacyName && !text(row.color) && !text(row.size) ? legacyName : label,
      price: money(row.price),
      compareAtPrice: money(row.compareAtPrice),
      stock: count(row.stock),
      sku: text(row.sku) || null,
      imageUrl: text(row.imageUrl, 2000) || images[0] || null,
      enabled: row.enabled !== false,
      sourceIndex: index,
      ...(images.length ? { images } : {}),
      ...(customFields.length ? { customFields } : {}),
    });
  });
  return out;
}

/**
 * The options as saved (in their order), else worked out from the versions. Every value a version uses is
 * included; unused values are dropped.
 */
export function readVariantOptions(rawOptions: unknown, variants: ProductVariant[]): VariantOption[] {
  const used = new Map<string, string[]>();
  for (const variant of variants) {
    for (const [name, value] of Object.entries(variant.options)) {
      const values = used.get(name) ?? [];
      if (!values.includes(value)) values.push(value);
      used.set(name, values);
    }
  }
  const saved: VariantOption[] = [];
  if (Array.isArray(rawOptions)) {
    for (const entry of rawOptions) {
      if (!entry || typeof entry !== "object") continue;
      const name = text((entry as { name?: unknown }).name, 40);
      const values = Array.isArray((entry as { values?: unknown }).values) ? ((entry as { values: unknown[] }).values.map((v) => text(v)).filter(Boolean)) : [];
      if (!name || saved.some((option) => option.name === name)) continue;
      saved.push({ name, values: [...new Set(values)] });
    }
  }
  if (!variants.length) return saved.filter((option) => option.values.length);
  const out: VariantOption[] = [];
  for (const option of saved) {
    const inUse = used.get(option.name);
    if (!inUse) continue;
    out.push({ name: option.name, values: [...option.values.filter((value) => inUse.includes(value)), ...inUse.filter((value) => !option.values.includes(value))] });
  }
  for (const [name, values] of used) if (!out.some((option) => option.name === name)) out.push({ name, values });
  return out;
}

/** Every combination of the options' values, in order (first option slowest). */
export function combinations(options: VariantOption[]): Array<Record<string, string>> {
  const usable = options.filter((option) => option.name.trim() && option.values.length);
  if (!usable.length) return [];
  let out: Array<Record<string, string>> = [{}];
  for (const option of usable) {
    const next: Array<Record<string, string>> = [];
    for (const combo of out) for (const value of option.values) next.push({ ...combo, [option.name]: value });
    out = next;
    if (out.length > MAX_VARIANTS * 10) break;
  }
  return out;
}

export function combinationCount(options: VariantOption[]) {
  const usable = options.filter((option) => option.name.trim() && option.values.length);
  return usable.length ? usable.reduce((total, option) => total * option.values.length, 1) : 0;
}

/**
 * One row per combination of the options. A combination that already had a row keeps it (price, stock, SKU, photo,
 * on/off); a new one starts at the product price, or at the price of an existing row it extends (adding Colour to
 * sizes keeps each size's price). Null when there would be more than MAX_VARIANTS rows.
 */
export function generateVariants(options: VariantOption[], existing: ProductVariant[], basePrice: number | null): ProductVariant[] | null {
  if (combinationCount(options) > MAX_VARIANTS) return null;
  const order = options.map((option) => option.name);
  const byKey = new Map(existing.map((variant) => [combinationKey(variant.options), variant]));
  const used = new Set<string>();
  return combinations(options).map((combo) => {
    const key = combinationKey(combo);
    const same = byKey.get(key);
    const name = variantLabel(combo, order);
    if (same) return { ...same, options: combo, name };
    // A row whose options are all part of this combination (an option was added).
    const parent = existing.find((variant) => {
      const entries = Object.entries(variant.options);
      return entries.length > 0 && entries.every(([n, v]) => combo[n]?.toLowerCase() === v.toLowerCase());
    });
    let id = variantIdFor(order.map((n) => combo[n]).filter(Boolean));
    while (used.has(id)) id = `${id}-x`;
    used.add(id);
    return {
      id,
      options: combo,
      name,
      price: parent?.price ?? (basePrice !== null && Number.isFinite(basePrice) ? basePrice : null),
      compareAtPrice: parent?.compareAtPrice ?? null,
      stock: null,
      sku: null,
      imageUrl: parent?.imageUrl ?? null,
      enabled: true,
    };
  });
}

/** "Set all prices": every row gets this price. */
export function setAllPrices(variants: ProductVariant[], price: number): ProductVariant[] {
  return variants.map((variant) => ({ ...variant, price }));
}

/** "+₦2,000 for XL": adds `delta` to every row with that option value (never below zero). */
export function adjustPrices(variants: ProductVariant[], optionName: string, value: string, delta: number, basePrice: number): ProductVariant[] {
  return variants.map((variant) =>
    variant.options[optionName]?.toLowerCase() === value.toLowerCase()
      ? { ...variant, price: Math.max(0, Math.round(((variant.price ?? basePrice) + delta) * 100) / 100) }
      : variant,
  );
}

/** What one unit of this version costs: its own price, else the product's. */
export function variantPrice(variant: Pick<ProductVariant, "price"> | null | undefined, basePrice: number) {
  return variant && variant.price !== null && Number.isFinite(variant.price) ? variant.price : basePrice;
}

/** The crossed-out price for this version, only when it's above what the shopper pays. */
export function variantCompareAt(variant: Pick<ProductVariant, "price" | "compareAtPrice"> | null, product: { retailPrice: number; compareAtPrice?: number | null }) {
  const price = variantPrice(variant, product.retailPrice);
  const was = variant?.compareAtPrice ?? product.compareAtPrice ?? null;
  return was !== null && was > price ? was : null;
}

export const stockTracked = (variant: Pick<ProductVariant, "stock">) => variant.stock !== null;

/** On and (when counted) with stock left. */
export function variantAvailable(variant: Pick<ProductVariant, "enabled" | "stock">) {
  return variant.enabled && (variant.stock === null || variant.stock > 0);
}

/** Total stock across counted, switched-on versions; null when no version is counted. */
export function totalVariantStock(variants: ProductVariant[]): number | null {
  const counted = variants.filter((variant) => variant.enabled && variant.stock !== null);
  return counted.length ? counted.reduce((sum, variant) => sum + (variant.stock ?? 0), 0) : null;
}

/** Labels a bag line may carry for this version (current label, older "name / colour / size" forms, SKU, id). */
export function variantMatchLabels(variant: ProductVariant) {
  const values = Object.values(variant.options);
  const colour = Object.entries(variant.options).find(([name]) => isColourOption(name))?.[1] ?? "";
  const size = Object.entries(variant.options).find(([name]) => isSizeOption(name))?.[1] ?? "";
  return [
    variant.name,
    variant.id,
    variant.sku ?? "",
    values.join(" / "),
    [colour, size].filter(Boolean).join(" / "),
    [...values].reverse().join(" / "),
  ].filter(Boolean).map((label) => label.toLowerCase());
}

/** The version a bag line names (by id, else by label); null when it isn't one of them. */
export function findProductVariant(variants: ProductVariant[], choice: { variantId?: string | null; label?: string | null }): ProductVariant | null {
  if (choice.variantId) {
    const byId = variants.find((variant) => variant.id === choice.variantId);
    if (byId) return byId;
  }
  const wanted = choice.label?.trim().toLowerCase();
  if (!wanted) return null;
  return variants.find((variant) => variantMatchLabels(variant).includes(wanted)) ?? null;
}

export type VariantChoice =
  | { ok: true; variant: ProductVariant | null; price: number }
  | { ok: false; reason: "choose" | "unknown" | "off" };

/**
 * What a bag line buys, priced on the server: a product without versions sells at its price; one with versions
 * needs a version that exists and is switched on (a single switched-on version is chosen for the shopper).
 */
export function resolveLineVariant(product: { retailPrice: number; variants: unknown }, choice: { variantId?: string | null; label?: string | null }): VariantChoice {
  const variants = normalizeVariants(product.variants);
  if (!variants.length) return { ok: true, variant: null, price: product.retailPrice };
  if (!choice.variantId && !choice.label?.trim()) {
    const on = variants.filter((variant) => variant.enabled);
    if (on.length === 1) return { ok: true, variant: on[0], price: variantPrice(on[0], product.retailPrice) };
    return { ok: false, reason: "choose" };
  }
  const variant = findProductVariant(variants, choice);
  if (!variant) return { ok: false, reason: "unknown" };
  if (!variant.enabled) return { ok: false, reason: "off" };
  return { ok: true, variant, price: variantPrice(variant, product.retailPrice) };
}

// ─── Picking on the product page ──────────────────────────────────────────────

/** The version matching every chosen option exactly (switched-off versions never match). */
export function matchSelection(variants: ProductVariant[], selection: Record<string, string>, optionNames: string[]) {
  if (optionNames.some((name) => !selection[name])) return null;
  return variants.find((variant) => variant.enabled && optionNames.every((name) => variant.options[name] === selection[name])) ?? null;
}

/**
 * Whether choosing `value` for `optionName` (keeping the other choices made so far) leads to a version that is on
 * and in stock. Used to grey out sizes or colours that can't be bought.
 */
export function valueAvailable(variants: ProductVariant[], selection: Record<string, string>, optionName: string, value: string) {
  return variants.some(
    (variant) =>
      variantAvailable(variant) &&
      variant.options[optionName] === value &&
      Object.entries(selection).every(([name, chosen]) => name === optionName || !chosen || variant.options[name] === chosen),
  );
}

/** The first version a shopper can buy (else the first switched-on one), as a starting selection. */
export function initialSelection(variants: ProductVariant[]): Record<string, string> {
  const first = variants.find(variantAvailable) ?? variants.find((variant) => variant.enabled);
  return first ? { ...first.options } : {};
}

/**
 * After choosing `value` for `optionName`: keep the other choices when that combination exists, otherwise move
 * the other options to the nearest version that can be bought.
 */
export function choose(variants: ProductVariant[], selection: Record<string, string>, optionName: string, value: string, optionNames: string[]) {
  const next = { ...selection, [optionName]: value };
  if (matchSelection(variants, next, optionNames)) return next;
  const fit = variants.find((variant) => variantAvailable(variant) && variant.options[optionName] === value) ?? variants.find((variant) => variant.enabled && variant.options[optionName] === value);
  return fit ? { ...fit.options } : next;
}

// ─── Saving ───────────────────────────────────────────────────────────────────

/**
 * Rows as stored: the canonical label as name, colour / size copied for older readers, and ids made unique.
 */
export function serializeVariants(variants: ProductVariant[], options: VariantOption[]) {
  const order = options.map((option) => option.name);
  const ids = new Set<string>();
  return variants.map((variant) => {
    let id = variant.id || variantIdFor(Object.values(variant.options));
    while (ids.has(id)) id = `${id}-x`;
    ids.add(id);
    const colour = Object.entries(variant.options).find(([name]) => isColourOption(name))?.[1];
    const size = Object.entries(variant.options).find(([name]) => /size/i.test(name))?.[1] ?? Object.entries(variant.options).find(([name]) => isSizeOption(name))?.[1];
    const legacyOnly = Object.keys(variant.options).length === 1 && "Option" in variant.options;
    return {
      id,
      options: variant.options,
      name: legacyOnly ? variant.name : variantLabel(variant.options, order),
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      stock: variant.stock,
      sku: variant.sku,
      imageUrl: variant.imageUrl,
      enabled: variant.enabled,
      ...(colour ? { color: colour } : {}),
      ...(size ? { size } : {}),
      ...(variant.images?.length ? { images: variant.images } : {}),
      ...(variant.customFields?.length ? { customFields: variant.customFields } : {}),
    };
  });
}

/**
 * Problems with a set of options and versions, in plain words; null when it can be saved. Checks the limits, that
 * every version uses the options, and that no combination appears twice.
 */
export function variantSetProblem(options: VariantOption[], variants: ProductVariant[]): string | null {
  if (options.length > MAX_OPTIONS) return `Use at most ${MAX_OPTIONS} options (for example Size, Colour and one more).`;
  const names = new Set<string>();
  for (const option of options) {
    const lower = option.name.trim().toLowerCase();
    if (!lower) return "Every option needs a name, like Size or Colour.";
    if (names.has(lower)) return `The option "${option.name}" is there twice.`;
    names.add(lower);
    if (option.values.length > MAX_OPTION_VALUES) return `"${option.name}" has more than ${MAX_OPTION_VALUES} choices.`;
    if (new Set(option.values.map((value) => value.toLowerCase())).size !== option.values.length) return `"${option.name}" has the same choice twice.`;
  }
  if (variants.length > MAX_VARIANTS) return `That makes ${variants.length} versions. The most is ${MAX_VARIANTS}: remove some choices.`;
  const keys = new Set<string>();
  for (const variant of variants) {
    if (options.length) {
      for (const name of Object.keys(variant.options)) {
        if (!options.some((option) => option.name === name)) return `"${variant.name}" uses an option that isn't in the list ("${name}").`;
      }
    }
    if (variant.price !== null && (variant.price < 0 || variant.price > MAX_PRICE)) return `Check the price of "${variant.name}".`;
    if (variant.compareAtPrice !== null && (variant.compareAtPrice < 0 || variant.compareAtPrice > MAX_PRICE)) return `Check the "was" price of "${variant.name}".`;
    if (variant.stock !== null && (variant.stock < 0 || variant.stock > MAX_STOCK)) return `Check the stock of "${variant.name}".`;
    const key = combinationKey(variant.options);
    if (keys.has(key)) return `"${variant.name}" is there twice. Each combination can only be listed once.`;
    keys.add(key);
  }
  return null;
}

/** Price and stock changes from the phone (by version id); unknown ids are ignored. */
export function applyVariantUpdates(raw: unknown, updates: Array<{ id: string; price?: number | null; stock?: number | null; enabled?: boolean }>): ProductVariant[] {
  const variants = normalizeVariants(raw);
  const byId = new Map(updates.map((update) => [update.id, update]));
  return variants.map((variant) => {
    const update = byId.get(variant.id);
    if (!update) return variant;
    return {
      ...variant,
      ...(update.price !== undefined ? { price: update.price === null ? null : money(update.price) } : {}),
      ...(update.stock !== undefined ? { stock: update.stock === null ? null : count(update.stock) } : {}),
      ...(update.enabled !== undefined ? { enabled: update.enabled } : {}),
    };
  });
}

/** Lowest and highest price across switched-on versions ("From ₦12,000"). */
export function priceRange(variants: ProductVariant[], basePrice: number) {
  const prices = variants.filter((variant) => variant.enabled).map((variant) => variantPrice(variant, basePrice));
  if (!prices.length) return { min: basePrice, max: basePrice };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/**
 * What the product API saves for versions, from what the client sent (full rows and options, or the phone's
 * price/stock updates) and the product as stored. Rows are normalized and serialized; when stock is counted per
 * version the product's own stock becomes their total, so lists, alerts and checkout agree.
 */
export function prepareVariantSave(
  sent: { variants?: unknown; variantOptions?: unknown; variantUpdates?: Array<{ id: string; price?: number | null; stock?: number | null; enabled?: boolean }> },
  stored: { variants?: unknown; variantOptions?: unknown; inventoryType?: string | null },
): { ok: true; data: { variants?: ReturnType<typeof serializeVariants>; variantOptions?: VariantOption[]; currentStock?: number } } | { ok: false; error: string } {
  if (sent.variants === undefined && sent.variantOptions === undefined && !sent.variantUpdates?.length) return { ok: true, data: {} };
  const rows = sent.variantUpdates?.length && sent.variants === undefined ? applyVariantUpdates(stored.variants, sent.variantUpdates) : normalizeVariants(sent.variants !== undefined ? sent.variants : stored.variants);
  const options = readVariantOptions(sent.variantOptions !== undefined ? sent.variantOptions : stored.variantOptions, rows);
  const problem = variantSetProblem(options, rows);
  if (problem) return { ok: false, error: problem };
  const total = totalVariantStock(rows);
  const countsStock = !stored.inventoryType || stored.inventoryType === "seller";
  return {
    ok: true,
    data: {
      variants: serializeVariants(rows, options),
      variantOptions: options,
      ...(total !== null && countsStock ? { currentStock: total } : {}),
    },
  };
}

/**
 * The saved versions JSON with stock taken (negative delta) or given back (positive) for counted versions, by id.
 * Versions that aren't counted per version are left alone. Fails with the version's name when one hasn't enough.
 */
export function adjustVariantStock(raw: unknown, changes: Array<{ id: string; delta: number }>): { ok: true; variants: unknown[] } | { ok: false; name: string } {
  const list = Array.isArray(raw) ? [...raw] : [];
  const variants = normalizeVariants(list);
  for (const change of changes) {
    const variant = variants.find((entry) => entry.id === change.id);
    if (!variant || variant.sourceIndex === undefined || variant.stock === null) continue;
    const next = variant.stock + change.delta;
    if (next < 0) return { ok: false, name: variant.name };
    variant.stock = next;
    const row = list[variant.sourceIndex] as Record<string, unknown>;
    list[variant.sourceIndex] = { ...row, id: variant.id, stock: next };
  }
  return { ok: true, variants: list };
}
