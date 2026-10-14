// Peggy's product versions tool: input schema. Pure, merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";
import type { SuggestionInput } from "../../../../shared/product-assistant.ts";

const optionName = z.string().trim().min(1).max(40);
const optionValue = z.string().trim().min(1).max(60);

export const PRODUCTS_TOOL_SPECS = {
  set_product_variants: {
    write: true,
    description:
      "Set a product's versions (variants): its options such as Size and Colour with ALL their values, and the prices and stock for them: one main price, extra (or less) for some values (\"L and XL cost 2000 more\"), or an exact price / stock for one combination. Replaces the product's current options; combinations that already existed keep their stock. Saving changes the live product, so: call first with confirmCode null to get a preview and a code, show the seller the preview, and only call again with the code after they say yes.",
    schema: z
      .object({
        product: z.string().trim().min(1).max(160).describe("Product id from list_products, or its name"),
        options: z
          .array(z.object({ name: optionName.describe("e.g. Size, Colour, Length, Storage"), values: z.array(optionValue).min(1).max(30).describe("Every value, e.g. [\"S\",\"M\",\"L\",\"XL\"]") }).strict())
          .min(1)
          .max(3),
        basePrice: z.number().min(0).max(100_000_000).nullable().describe("The main price in naira, or null to keep the product's price"),
        priceAdjustments: z
          .array(z.object({ option: optionName, value: optionValue, amount: z.number().min(-100_000_000).max(100_000_000).describe("Naira added to the main price for this value (negative: less)") }).strict())
          .max(60)
          .nullable(),
        exactPrices: z
          .array(
            z
              .object({
                values: z.array(optionValue).min(1).max(3).describe("The combination's values, e.g. [\"L\", \"Red\"]"),
                price: z.number().min(0).max(100_000_000).nullable(),
                stock: z.number().int().min(0).max(10_000_000).nullable(),
              })
              .strict(),
          )
          .max(100)
          .nullable(),
        confirmCode: z.string().trim().max(12).nullable().describe("null on the first call; then the code the tool gave, only after the seller says yes"),
      })
      .strict(),
  },
} as const;

/** The tool input as a product-form suggestion (exact prices matched to option names by their values). */
export function variantsSuggestion(input: z.infer<typeof PRODUCTS_TOOL_SPECS.set_product_variants.schema>): SuggestionInput {
  const options = input.options.map((option) => ({ name: option.name, values: [...new Set(option.values)] }));
  const variantPrices = (input.exactPrices ?? []).flatMap((entry) => {
    const match: Record<string, string> = {};
    for (const value of entry.values) {
      const option = options.find((candidate) => candidate.values.some((v) => v.toLowerCase() === value.toLowerCase()) && !(candidate.name in match));
      if (!option) return [];
      match[option.name] = value;
    }
    return [{ options: match, price: entry.price, stock: entry.stock }];
  });
  return {
    message: "",
    productType: null,
    name: null,
    description: null,
    basePrice: input.basePrice,
    options,
    priceAdjustments: input.priceAdjustments,
    variantPrices: variantPrices.length ? variantPrices : null,
    details: null,
    customDetails: null,
  };
}

