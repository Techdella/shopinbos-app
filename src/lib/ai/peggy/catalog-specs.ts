// Peggy's catalogue tools: reading one product in full, editing any field on one or many products, and writing
// product content with AI. Input schemas only (pure), merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";
import { CONTENT_FIELDS } from "../../../../shared/product-content.ts";
import { EDIT_MAX_PRODUCTS, EditTargetSchema, ProductChangesSchema } from "../../../../shared/product-bulk-edit.ts";

/** Products Peggy writes content for in one call (the AI writes a few at a time). */
export const DRAFT_MAX_PRODUCTS = 10;
/** Products with their own, different change in one edit_products call. */
export const PER_PRODUCT_MAX = 20;

export const CATALOG_TOOL_SPECS = {
  get_product: {
    write: false,
    description:
      "Everything about one product: price, was-price, description, full description, specs, FAQs, care, delivery, returns, warranty, support, type and details, category, tags, SEO, weight, size, related products, versions, photos and its reviews (average and count). Use before changing or writing content for it.",
    schema: z.object({ product: z.string().trim().min(1).max(160).describe("Product id or name") }).strict(),
  },
  edit_products: {
    write: true,
    description: `Change any product details on one product or many: description, full description, specs, FAQs, care, delivery info, returns, warranty, support, SEO title and description, type and details, category, tags, weight, size, related products and was-price. Either the same change for every product a target matches (by names or ids, or by name words, category, tag or type; at most ${EDIT_MAX_PRODUCTS} per confirmation, use target.batch for more), or perProduct with a different change for each (e.g. what draft_product_content wrote). In a change, null keeps a field. Saving changes the live products, so: call first with confirmCode null to get the before → after preview and a code, show the seller the preview, and only call again with exactly the same input and the code after they say yes.`,
    schema: z
      .object({
        target: EditTargetSchema.nullable().describe("Which products get `changes`; null when using perProduct"),
        changes: ProductChangesSchema.nullable().describe("The change for every target product; null when using perProduct"),
        perProduct: z
          .array(z.object({ product: z.string().trim().min(1).max(160).describe("Product id or exact name"), changes: ProductChangesSchema }).strict())
          .min(1)
          .max(PER_PRODUCT_MAX)
          .nullable(),
        confirmCode: z.string().trim().max(12).nullable().describe("null on the first call; then the code the tool gave, only after the seller says yes"),
      })
      .strict()
      .superRefine((value, ctx) => {
        const bulk = value.target !== null || value.changes !== null;
        if (bulk && value.perProduct) ctx.addIssue({ code: "custom", message: "Use either target + changes, or perProduct, not both" });
        else if (!bulk && !value.perProduct) ctx.addIssue({ code: "custom", message: "Give target + changes, or perProduct" });
        else if (bulk && (!value.target || !value.changes)) ctx.addIssue({ code: "custom", message: "target and changes go together" });
      }),
  },
  draft_product_content: {
    write: false,
    description: `Write product content with AI from each product's name, photo and current details: description, full description, specs, FAQs, SEO title and description, care, tags, category, and type with its details. At most ${DRAFT_MAX_PRODUCTS} products per call. Nothing is saved: it returns the text and a ready perProduct list. Show the seller what was written, then call edit_products with that perProduct (confirmCode null) for the preview and code.`,
    schema: z
      .object({
        target: EditTargetSchema,
        fields: z.array(z.enum(CONTENT_FIELDS)).min(1).max(CONTENT_FIELDS.length).describe("What to write; seo = SEO title and description; productType includes its details"),
        instruction: z.string().trim().max(500).nullable().describe("The seller's wishes, e.g. \"shorter, mention it is made in Aba\""),
        usePhotos: z.boolean().describe("true to let the AI look at each product's first photo"),
      })
      .strict(),
  },
} as const;
