// Zod schemas for product types, details, versions and related products (the product API, StoreProductCreateSchema
// in src/lib/schemas) and for Peggy's product suggestions (/api/app/products/assistant, the set_product_variants
// tool). Kept apart from the pure helpers in ./product-variants.ts so the phone app needn't load zod.

import { z } from "zod";
import { PRODUCT_TYPE_KEYS, MAX_CUSTOM_DETAILS, MAX_DETAIL_VALUE } from "./product-types.ts";
import { MAX_OPTIONS, MAX_OPTION_VALUES, MAX_PRICE, MAX_STOCK, MAX_VARIANTS, combinationKey } from "./product-variants.ts";

export const MAX_RELATED = 8;

const optionName = z.string().trim().min(1, "Every option needs a name, like Size or Colour.").max(40);
const optionValue = z.string().trim().min(1).max(60);
const price = z.number().min(0, "Prices can't be below ₦0.").max(MAX_PRICE);

export const VariantOptionSchema = z.object({
  name: optionName,
  values: z.array(optionValue).min(1, "Give each option at least one choice.").max(MAX_OPTION_VALUES),
});

/** One version as the form (or an older client) sends it. Older rows without `options` are still accepted. */
export const VariantRowSchema = z.object({
  id: z.string().trim().max(80).optional(),
  options: z.record(optionName, optionValue).optional(),
  name: z.string().trim().max(200).optional(),
  sku: z.string().trim().max(60).nullable().optional(),
  price: price.nullable().optional(),
  compareAtPrice: price.nullable().optional(),
  stock: z.number().int().min(0).max(MAX_STOCK).nullable().optional(),
  imageUrl: z.string().max(2000).nullable().optional(),
  enabled: z.boolean().optional(),
  color: z.string().max(60).optional(),
  size: z.string().max(60).optional(),
  images: z.array(z.string().max(2000)).max(20).optional(),
  customFields: z.array(z.object({ name: z.string().min(1).max(80), value: z.string().max(500) })).max(20).optional(),
});

export const VariantRowsSchema = z
  .array(VariantRowSchema)
  .max(MAX_VARIANTS, `The most is ${MAX_VARIANTS} versions. Remove some choices.`)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const options = row.options ?? { ...(row.color ? { Colour: row.color } : {}), ...(row.size ? { Size: row.size } : {}), ...(!row.color && !row.size && row.name ? { Option: row.name } : {}) };
      const key = combinationKey(options);
      if (!key) {
        ctx.addIssue({ code: "custom", message: "Every version needs its option values (like Size L).", path: [index] });
        return;
      }
      if (seen.has(key)) ctx.addIssue({ code: "custom", message: `"${row.name || Object.values(options).join(" / ")}" is there twice. Each combination can only be listed once.`, path: [index] });
      seen.add(key);
    });
  });

export const VariantOptionsSchema = z
  .array(VariantOptionSchema)
  .max(MAX_OPTIONS, `Use at most ${MAX_OPTIONS} options (for example Size, Colour and one more).`)
  .superRefine((options, ctx) => {
    const names = new Set<string>();
    options.forEach((option, index) => {
      const lower = option.name.toLowerCase();
      if (names.has(lower)) ctx.addIssue({ code: "custom", message: `The option "${option.name}" is there twice.`, path: [index] });
      names.add(lower);
    });
  });

export const ProductTypeSchema = z.enum(PRODUCT_TYPE_KEYS);

export const ProductDetailsSchema = z
  .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/), z.string().max(MAX_DETAIL_VALUE))
  .refine((value) => Object.keys(value).length <= 40, "Too many details.");

export const RelatedProductIdsSchema = z.array(z.string().trim().min(1).max(64)).max(MAX_RELATED, `Pick up to ${MAX_RELATED} related products.`);

// ─── Peggy's suggestion ───────────────────────────────────────────────────────

const nullableText = (max: number) => z.string().trim().max(max).nullable();

/**
 * What Peggy proposes for the product form. Every part is optional (null = leave it): a type, options, prices
 * (one base price, "+₦X for this value" adjustments, or exact prices per version), stock per version, details,
 * the seller's own details, a name and a description.
 */
export const ProductSuggestionSchema = z.object({
  message: z.string().trim().min(1).max(1200).describe("What Peggy says to the seller, 1-3 short sentences"),
  productType: ProductTypeSchema.nullable(),
  name: nullableText(200),
  description: nullableText(5000),
  basePrice: price.nullable().describe("The main price in naira, or null to keep"),
  options: z.array(VariantOptionSchema).max(MAX_OPTIONS).nullable().describe("All options with all their values, or null to keep"),
  priceAdjustments: z
    .array(z.object({ option: optionName, value: optionValue, amount: z.number().min(-MAX_PRICE).max(MAX_PRICE).describe("Naira added (negative: taken off) for this value") }))
    .max(60)
    .nullable(),
  variantPrices: z
    .array(z.object({ options: z.record(optionName, optionValue), price: price.nullable(), stock: z.number().int().min(0).max(MAX_STOCK).nullable() }))
    .max(MAX_VARIANTS)
    .nullable()
    .describe("Exact price or stock for particular combinations, or null"),
  details: z.record(z.string().max(40), z.string().max(MAX_DETAIL_VALUE)).nullable().describe("Detail field key → value, for the product type's fields"),
  customDetails: z.array(z.object({ name: z.string().trim().min(1).max(80), value: z.string().trim().min(1).max(500) })).max(MAX_CUSTOM_DETAILS).nullable(),
});

export type ProductSuggestion = z.infer<typeof ProductSuggestionSchema>;

/** The form as Peggy sees it when asked to help. */
export const ProductAssistantRequestSchema = z.object({
  message: z.string().trim().min(1, "Tell Peggy what to change.").max(2000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(12).default([]),
  photoUrl: z.string().url().max(2000).nullable().optional(),
  productId: z.string().max(64).nullable().optional(),
  form: z.object({
    name: z.string().max(200).default(""),
    description: z.string().max(5000).default(""),
    productType: ProductTypeSchema.nullable().default(null),
    basePrice: z.number().min(0).max(MAX_PRICE).nullable().default(null),
    options: z.array(VariantOptionSchema).max(MAX_OPTIONS).default([]),
    variants: z
      .array(z.object({ options: z.record(z.string(), z.string()), price: z.number().nullable(), stock: z.number().nullable(), enabled: z.boolean() }))
      .max(MAX_VARIANTS)
      .default([]),
    details: z.record(z.string(), z.string()).default({}),
  }),
});

export type ProductAssistantRequest = z.infer<typeof ProductAssistantRequestSchema>;
