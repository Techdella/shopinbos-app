import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { meterAi } from "@/lib/ai/usage";
import { checkConfirmationCode, confirmationCode } from "@/lib/marketing/brand";
import { categoryNamesFor, findCategoryByName, findOrCreateCategory } from "@/lib/products/categories.server";
import { contentCallCount, suggestProductContent } from "@/lib/products/content-ai.server";
import { loadReviews } from "@/lib/reviews/server";
import { summarizeReviews } from "@/lib/reviews/pure";
import { markCatalogDirty } from "@/lib/whatsapp-catalog/dirty";
import { naira } from "@shared/onboarding";
import {
  applyProductChanges,
  editConfirmationParts,
  editPreview,
  hasChanges,
  matchOne,
  selectProducts,
  suggestionToChanges,
  type EditableProduct,
  type ProductChanges,
  type ResolvedRefs,
} from "@shared/product-bulk-edit";
import { readCustomDetails, readProductDetails, productTypeDef } from "@shared/product-types";
import { normalizeVariants } from "@shared/product-variants";
import { DRAFT_MAX_PRODUCTS } from "./catalog-specs";
import type { PeggyToolInput } from "./pure";
import { ToolError, recordActivity, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy reading and changing everything about the seller's products from the chat ("add specs to the Smart Lamp",
// "set warranty to 12 months on every kitchen product", "write better descriptions for all lamps"). Products are
// only ever loaded from the seller's own store, so a name or id from another shop matches nothing. Changes preview
// first (before → after) and save only with the confirmation code, after the seller says yes. Written content
// (draft_product_content) saves nothing: it goes through edit_products like any other change.

const PRODUCT_FIELDS = {
  id: true,
  name: true,
  status: true,
  retailPrice: true,
  compareAtPrice: true,
  description: true,
  longDescription: true,
  specifications: true,
  faqs: true,
  careInstructions: true,
  shippingInfo: true,
  returnPolicy: true,
  warranty: true,
  supportInfo: true,
  seoTitle: true,
  seoDescription: true,
  productType: true,
  productDetails: true,
  categoryId: true,
  category: { select: { name: true } },
  tags: true,
  weight: true,
  weightUnit: true,
  dimensions: true,
  relatedProductIds: true,
  images: true,
  variants: true,
  currentStock: true,
  trackStock: true,
} satisfies Prisma.StoreProductSelect;

type LoadedProduct = EditableProduct & { status: string; images: string[]; variants: unknown; currentStock: number; trackStock: boolean };

/** Every product of the seller's store that isn't archived, with what Peggy can read and change. */
async function shopProducts(ctx: PeggyToolContext): Promise<LoadedProduct[]> {
  const rows = await db.storeProduct.findMany({
    where: { storeId: ctx.store.id, status: { not: "archived" } },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: PRODUCT_FIELDS,
  });
  return rows.map((row) => ({
    ...row,
    // Rows from older imports may miss these.
    tags: row.tags ?? [],
    relatedProductIds: row.relatedProductIds ?? [],
    images: row.images ?? [],
    categoryName: row.category?.name ?? null,
    weightUnit: row.weightUnit ?? "kg",
  })) as LoadedProduct[];
}

function pick(products: LoadedProduct[], ref: string) {
  const found = matchOne(products, ref);
  if (!found.length) throw new ToolError(`No product matches "${ref}". Use list_products to find it.`);
  if (found.length > 1) throw new ToolError(`"${ref}" matches ${found.length} products: ${found.slice(0, 6).map((p) => `${p.name} (id ${p.id})`).join("; ")}. Ask the seller which one, or use the id.`);
  return found[0]!;
}

// ─── get_product ──────────────────────────────────────────────────────────────

async function getProduct(ctx: PeggyToolContext, input: PeggyToolInput<"get_product">): Promise<ToolOutput> {
  const products = await shopProducts(ctx);
  const product = pick(products, input.product);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const reviews = summarizeReviews(await Promise.resolve(loadReviews(ctx.store.id, { productId: product.id })).catch(() => []));
  const type = productTypeDef(product.productType);
  const details = readProductDetails(product.productDetails);
  const variants = normalizeVariants(product.variants);
  return {
    content: JSON.stringify({
      id: product.id,
      name: product.name,
      status: product.status,
      price: naira(product.retailPrice),
      wasPrice: product.compareAtPrice ? naira(product.compareAtPrice) : null,
      stock: product.trackStock ? product.currentStock : "not counted",
      description: product.description ?? "",
      longDescription: (product.longDescription ?? "").slice(0, 3000),
      specifications: readCustomDetails(product.specifications).map((row) => ({ name: row.label, value: row.value })),
      faqs: Array.isArray(product.faqs) ? product.faqs : [],
      care: product.careInstructions ?? "",
      deliveryInfo: product.shippingInfo ?? "",
      returns: product.returnPolicy ?? "",
      warranty: product.warranty ?? "",
      support: product.supportInfo ?? "",
      type: type.key,
      typeDetails: Object.fromEntries(type.fields.filter((field) => !field.column).map((field) => [field.key, details[field.key] ?? ""])),
      category: product.categoryName ?? null,
      tags: product.tags,
      seoTitle: product.seoTitle ?? "",
      seoDescription: product.seoDescription ?? "",
      weight: product.weight ? `${product.weight} ${product.weightUnit ?? "kg"}` : null,
      dimensions: product.dimensions ?? null,
      relatedProducts: product.relatedProductIds.map((id) => names.get(id) ?? null).filter(Boolean),
      versions: variants.length,
      photos: product.images.length,
      firstPhoto: product.images[0] ?? null,
      reviews: { count: reviews.count, average: reviews.average, needsReply: reviews.needsReply },
      link: `/products/${product.id}`,
    }),
  };
}

// ─── edit_products ───────────────────────────────────────────────────────────

/** The category and related products a change names, looked up in the seller's shop (nothing is created here). */
async function resolveRefs(products: LoadedProduct[], changes: ProductChanges): Promise<ResolvedRefs> {
  const refs: ResolvedRefs = { names: new Map(products.map((p) => [p.id, p.name])) };
  if (changes.category !== null) {
    if (!changes.category) refs.category = { id: null, name: null };
    else {
      const existing = await findCategoryByName(changes.category);
      refs.category = existing ? { id: existing.id, name: existing.name } : { id: `new:${changes.category.toLowerCase()}`, name: `${changes.category} (new category)` };
    }
  }
  if (changes.relatedProducts !== null) refs.related = changes.relatedProducts.map((ref) => pick(products, ref)).map((p) => ({ id: p.id, name: p.name }));
  return refs;
}

async function editProducts(ctx: PeggyToolContext, input: PeggyToolInput<"edit_products">): Promise<ToolOutput> {
  const products = await shopProducts(ctx);
  let plan: Array<{ product: LoadedProduct; changes: ProductChanges }>;
  let note = "";
  if (input.perProduct) {
    const seen = new Set<string>();
    plan = input.perProduct.map((entry) => {
      const product = pick(products, entry.product);
      if (seen.has(product.id)) throw new ToolError(`${product.name} is listed twice. Give each product once.`);
      seen.add(product.id);
      return { product, changes: entry.changes };
    });
  } else {
    if (!input.target || !input.changes) throw new ToolError("Give target and changes, or perProduct.");
    const selected = selectProducts(products, input.target);
    if (!selected.ok) throw new ToolError(selected.error);
    plan = selected.products.map((product) => ({ product, changes: input.changes! }));
    if (selected.batches > 1) note = ` ${selected.total} products match; this is group ${selected.batch} of ${selected.batches} (${selected.products.length} products). After saving, call again with target.batch ${selected.batch + 1 <= selected.batches ? selected.batch + 1 : selected.batch} for the next group.`;
  }
  if (plan.every((entry) => !hasChanges(entry.changes))) throw new ToolError("Say what to change: every field in the change is null.");

  const edits = [];
  const problems: string[] = [];
  for (const entry of plan) {
    const refs = await resolveRefs(products, entry.changes);
    const applied = applyProductChanges(entry.product, entry.changes, refs);
    problems.push(...applied.problems);
    edits.push({ ...entry, ...applied });
  }
  const changing = edits.filter((edit) => edit.diff.length);
  if (!changing.length) return { content: `Nothing to change: ${plan.length === 1 ? `${plan[0]!.product.name} already has` : `the ${plan.length} products already have`} those values.${problems.length ? ` ${problems.join(". ")}.` : ""}` };

  const preview = editPreview(changing.map((edit) => ({ name: edit.product.name, diff: edit.diff })));
  const { confirmCode: _code, ...rest } = input;
  void _code;
  const parts = editConfirmationParts(ctx.store.id, changing.map((edit) => edit.product.id), rest);
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    return {
      content: `NOT SAVED YET. Show the seller this before → after and ask them to confirm:\n${preview}\n${changing.length} product${changing.length === 1 ? "" : "s"} would change${changing.length < plan.length ? ` (${plan.length - changing.length} already had these values)` : ""}.${problems.length ? ` Left out: ${problems.join(". ")}.` : ""}${note} Confirmation code: ${confirmationCode(parts)}. Only call edit_products again, with exactly the same input and this code, after they clearly say yes.${input.confirmCode ? " (The code given was wrong or expired, or the products or changes are different.)" : ""}`,
    };
  }

  // Confirmed: a new category is made now, once per name.
  const categories = new Map<string, string | null>();
  const writes = [];
  for (const edit of changing) {
    const data = { ...edit.data } as Prisma.StoreProductUncheckedUpdateInput;
    if (typeof data.categoryId === "string" && data.categoryId.startsWith("new:")) {
      const made = await findOrCreateCategory(edit.changes.category ?? "", categories);
      if (made) data.categoryId = made.id;
      else delete data.categoryId;
    }
    if (data.specifications !== undefined) data.specifications = data.specifications as Prisma.InputJsonValue;
    if (data.faqs !== undefined) data.faqs = data.faqs as Prisma.InputJsonValue;
    if (data.productDetails !== undefined) data.productDetails = data.productDetails as Prisma.InputJsonValue;
    if (data.dimensions !== undefined) data.dimensions = data.dimensions as Prisma.InputJsonValue;
    writes.push(db.storeProduct.update({ where: { id: edit.product.id }, data }));
  }
  await db.$transaction(writes);
  await Promise.resolve(markCatalogDirty(ctx.store.id)).catch(() => undefined);

  const fields = [...new Set(changing.flatMap((edit) => edit.diff.map((d) => d.field.toLowerCase())))];
  const who = changing.length === 1 ? changing[0]!.product.name : `${changing.length} products`;
  const summary = `Updated ${who}: ${fields.join(", ")}.${problems.length ? ` Left out: ${problems.join(". ")}.` : ""}`;
  const href = changing.length === 1 ? `/products/${changing[0]!.product.id}` : "/products";
  await recordActivity(ctx, { type: "product", title: `Peggy updated ${who}`, description: summary, tool: "edit_products", link: href, data: { productIds: changing.map((edit) => edit.product.id).slice(0, 50) } });
  return { content: `${summary}${note ? `${note}` : ""}`, action: { summary, href } };
}

// ─── draft_product_content ───────────────────────────────────────────────────

async function draftProductContent(ctx: PeggyToolContext, input: PeggyToolInput<"draft_product_content">): Promise<ToolOutput> {
  const products = await shopProducts(ctx);
  const selected = selectProducts(products, { ...input.target, batch: null });
  if (!selected.ok) throw new ToolError(selected.error);
  const all = [...selected.products];
  // selectProducts caps at its own group size; Peggy writes fewer at a time and names the rest.
  const chosen = all.slice(0, DRAFT_MAX_PRODUCTS);
  const rest = selected.total - chosen.length;

  const items = chosen.map((product) => ({
    name: product.name,
    description: product.description,
    category: product.categoryName,
    productType: product.productType,
    price: product.retailPrice,
    tags: product.tags,
    specifications: readCustomDetails(product.specifications).map((row) => ({ name: row.label, value: row.value })),
    imageUrl: product.images[0] ?? null,
  }));
  const calls = contentCallCount(items, input.usePhotos);
  if (await meterAi(ctx.userId, "text", calls)) throw new ToolError("The seller is out of AI credits (or hit today's safety cap). Tell them to top up, or write a short version yourself.");
  const categories = input.fields.includes("category") ? await categoryNamesFor(ctx.store.id) : [];
  const result = await suggestProductContent(items, { storeName: ctx.store.name, fields: input.fields, categories, instruction: input.instruction, usePhotos: input.usePhotos });

  const perProduct = chosen.map((product, i) => ({ product: product.id, changes: suggestionToChanges(result.suggestions[i] ?? {}) })).filter((entry) => hasChanges(entry.changes));
  if (!perProduct.length) throw new ToolError("Couldn't write anything for those products just now. Tell the seller to try again shortly.");
  const shown = chosen.map((product, i) => ({ product: product.name, written: result.suggestions[i] ?? {} }));
  return {
    content: [
      `Written${result.source === "rules" ? " from the products' own details (AI wasn't available, so it is basic)" : ""}; NOTHING IS SAVED. Show the seller what was written for each product (in full for one or two products, the key points for more).`,
      JSON.stringify(shown),
      `To save, call edit_products with confirmCode null and perProduct exactly: ${JSON.stringify(perProduct)}`,
      rest > 0 ? `${rest} more product${rest === 1 ? "" : "s"} match: ${all.slice(DRAFT_MAX_PRODUCTS, DRAFT_MAX_PRODUCTS + 40).map((p) => p.name).join(", ")}${selected.total > all.length ? ", …" : ""}. Do these first, then call again with target.products set to the next ones.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export const CATALOG_TOOL_RUNNERS = {
  get_product: getProduct,
  edit_products: editProducts,
  draft_product_content: draftProductContent,
};
