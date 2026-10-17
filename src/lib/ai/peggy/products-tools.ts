import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { checkConfirmationCode, confirmationCode } from "@/lib/marketing/brand";
import { productFieldsData } from "@/lib/products/save-fields.server";
import { naira } from "@shared/onboarding";
import { applySuggestion, priceSummary } from "@shared/product-assistant";
import { productTypeKey } from "@shared/product-types";
import { MAX_VARIANTS, combinationCount, normalizeVariants, readVariantOptions, serializeVariants } from "@shared/product-variants";
import type { PeggyToolInput } from "./pure";
import { variantsSuggestion } from "./products-specs";
import { ToolError, findProduct, recordActivity, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy setting a product's sizes, colours and other options from anywhere in the app ("my Ankara dress comes in
// S M L XL, red and black, XL is 2000 more"). Same rules as the product form (shared/product-assistant.ts turns the
// request into rows, the product API's checks save them). Saving changes the live product, so it previews first
// and saves only with the confirmation code, after the seller says yes.

async function setProductVariants(ctx: PeggyToolContext, input: PeggyToolInput<"set_product_variants">): Promise<ToolOutput> {
  const match = await findProduct(ctx, input.product);
  const product = await db.storeProduct.findUnique({
    where: { id: match.id },
    select: { id: true, name: true, retailPrice: true, costPrice: true, variants: true, variantOptions: true, inventoryType: true, productType: true },
  });
  if (!product) throw new ToolError(`No product matches "${input.product}". Use list_products to find it.`);

  const variants = normalizeVariants(product.variants);
  const state = {
    name: product.name,
    description: "",
    productType: productTypeKey(product.productType),
    basePrice: product.retailPrice,
    options: readVariantOptions(product.variantOptions, variants),
    variants,
    details: {},
    customDetails: [],
  };
  const suggestion = variantsSuggestion(input);
  if (combinationCount(suggestion.options ?? []) > MAX_VARIANTS) {
    throw new ToolError(`Those options make ${combinationCount(suggestion.options ?? [])} combinations; the most is ${MAX_VARIANTS}. Ask the seller to use fewer values.`);
  }
  const { state: next, changes } = applySuggestion(state, suggestion);
  const base = next.basePrice ?? product.retailPrice;
  const preview = `${product.name}: ${next.variants.length} version${next.variants.length === 1 ? "" : "s"} (${next.options.map((option) => `${option.name}: ${option.values.join(", ")}`).join("; ")}). Prices: ${priceSummary(next.variants, base)}.${changes.length ? ` Changes: ${changes.join("; ")}.` : ""}`;

  const { confirmCode: _code, ...rest } = input;
  void _code;
  const parts = [ctx.store.id, "variants", product.id, JSON.stringify(rest)];
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    return {
      content: `NOT SAVED YET. Show the seller this and ask them to confirm: ${preview} It replaces the product's current options${variants.length ? ` (${variants.length} now)` : ""}. Confirmation code: ${confirmationCode(parts)}. Only call set_product_variants again, with the same options and prices and this code, after they clearly say yes.${input.confirmCode ? " (The code given was wrong or expired, or the options changed.)" : ""}`,
    };
  }

  const options = next.options;
  const fields = await productFieldsData(
    ctx.store.id,
    { variants: serializeVariants(next.variants, options), variantOptions: options },
    { id: product.id, variants: product.variants, variantOptions: product.variantOptions, inventoryType: product.inventoryType },
  );
  if (!fields.ok) throw new ToolError(fields.error);
  const data: Prisma.StoreProductUncheckedUpdateInput = { ...fields.data };
  if (next.basePrice !== null && next.basePrice !== product.retailPrice && next.basePrice > 0) {
    data.retailPrice = next.basePrice;
    if (product.costPrice != null) data.margin = parseFloat((((next.basePrice - product.costPrice) / next.basePrice) * 100).toFixed(2));
  }
  await db.storeProduct.update({ where: { id: product.id }, data });

  const href = `/products/${product.id}`;
  const summary = `Saved ${next.variants.length} version${next.variants.length === 1 ? "" : "s"} of ${product.name}. Prices: ${priceSummary(next.variants, base)}${next.basePrice !== null && next.basePrice !== product.retailPrice ? ` (main price ${naira(product.retailPrice)} → ${naira(next.basePrice)})` : ""}.`;
  await recordActivity(ctx, { type: "product", title: `Peggy set the options of ${product.name}`, description: summary, tool: "set_product_variants", link: href, data: { productId: product.id } });
  return { content: summary, action: { summary, href } };
}

export const PRODUCTS_TOOL_RUNNERS = {
  set_product_variants: setProductVariants,
};
