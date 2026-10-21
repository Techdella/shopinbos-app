import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  COLLECTION_TEMPLATES,
  fieldsFromTemplate,
  getTemplate,
  legacyPostToItem,
  liveItemWhere,
  mainRichField,
  readFields,
  readLegacyPosts,
  slugError,
  slugify,
  uniqueSlug,
  validateFields,
  validateItemData,
  type CmsField,
  type RichValue,
  type TemplateId,
} from "@/lib/cms/fields";
import { summarize } from "@/lib/cms/richtext";
import { ITEM_LAYOUTS, ITEM_LAYOUT_KEY, LIST_LAYOUTS, isItemLayout, isListLayout } from "@/lib/cms/layouts";
import { cleanSeo } from "@/lib/seo/fields";

// CMS collections on the server: the seller's collections and items (always scoped to their own store),
// copying old blog posts into a Blog collection, and what the storefront reads. Pure rules live in ./fields.

export class CmsError extends Error {
  constructor(message: string, readonly status = 400, readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const json = (value: unknown) => value as Prisma.InputJsonValue;

export async function sellerStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, slug: true, name: true, currency: true, customDomain: true, status: true } });
}

export function collectionSettings(raw: unknown) {
  const r = rec(raw);
  return {
    layout: isListLayout(r.layout) ? r.layout : ("grid" as const),
    itemLayout: isItemLayout(r.itemLayout) ? r.itemLayout : ("classic" as const),
    sort: (["newest", "oldest", "title", "manual"] as const).includes(r.sort as "newest") ? (r.sort as "newest" | "oldest" | "title" | "manual") : ("newest" as const),
    legacyImported: Array.isArray(r.legacyImported) ? r.legacyImported.map(String) : [],
  };
}

// ─── Old blog posts → Blog collection ────────────────────────────────────────

/**
 * Copies blog posts saved before collections existed (StorePage "blog".content.posts) into the store's Blog
 * collection. The old posts stay in the page JSON untouched (only a "cmsImported" list of copied ids is
 * added next to them). Each post is copied once, so a post the seller later deletes doesn't come back.
 */
export async function ensureLegacyBlogImported(storeId: string) {
  const page = await db.storePage.findUnique({ where: { storeId_slug: { storeId, slug: "blog" } }, select: { id: true, content: true } }).catch(() => null);
  // Ids already copied are also noted on the old page itself, so deleting the Blog collection doesn't bring
  // the old posts back.
  const copied = new Set(Array.isArray(rec(page?.content).cmsImported) ? (rec(page?.content).cmsImported as unknown[]).map(String) : []);
  const posts = readLegacyPosts(page?.content).filter((post) => !copied.has(post.id));
  if (!page || !posts.length) return null;

  let collection = await db.cmsCollection.findFirst({ where: { storeId, template: "blog" }, orderBy: { createdAt: "asc" } });
  if (!collection) collection = await createCollection(storeId, { template: "blog" });
  const settings = collectionSettings(collection.settings);
  const pending = posts.filter((post) => !settings.legacyImported.includes(post.id));
  if (!pending.length) return collection;

  const existing = await db.cmsItem.findMany({ where: { collectionId: collection.id }, select: { slug: true, legacyId: true } });
  const taken = new Set(existing.map((item) => item.slug));
  const already = new Set(existing.map((item) => item.legacyId).filter(Boolean));
  const rows = [];
  for (const post of pending) {
    if (already.has(post.id)) continue;
    const item = legacyPostToItem(post, taken);
    if (taken.has(item.slug)) item.slug = uniqueSlug(item.slug, taken);
    taken.add(item.slug);
    rows.push({
      storeId,
      collectionId: collection.id,
      title: item.title,
      slug: item.slug,
      status: item.status,
      excerpt: item.excerpt,
      data: json(item.data),
      seo: json(item.seo),
      legacyId: item.legacyId,
      createdBy: "import",
      createdAt: item.createdAt,
      publishedAt: item.publishedAt,
    });
  }
  if (rows.length) await db.cmsItem.createMany({ data: rows, skipDuplicates: true });
  await db.storePage.update({ where: { id: page.id }, data: { content: json({ ...rec(page.content), cmsImported: [...copied, ...pending.map((post) => post.id)] }) } });
  return db.cmsCollection.update({
    where: { id: collection.id },
    data: { settings: json({ ...rec(collection.settings), legacyImported: [...settings.legacyImported, ...pending.map((post) => post.id)] }) },
  });
}

// ─── Collections ─────────────────────────────────────────────────────────────

export const CollectionCreateSchema = z.object({
  template: z.enum(COLLECTION_TEMPLATES.map((template) => template.id) as [TemplateId, ...TemplateId[]]).default("blank"),
  name: z.string().trim().min(1).max(80).optional(),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  itemLabel: z.string().trim().min(1).max(40).optional(),
  fields: z.array(z.unknown()).max(40).optional(),
});

export const CollectionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  itemLabel: z.string().trim().min(1).max(40).optional(),
  fields: z.array(z.unknown()).max(40).optional(),
  layout: z.enum(LIST_LAYOUTS).optional(),
  itemLayout: z.enum(ITEM_LAYOUTS).optional(),
  sort: z.enum(["newest", "oldest", "title", "manual"]).optional(),
  isPublished: z.boolean().optional(),
  seo: z.record(z.string(), z.unknown()).optional(),
});

async function takenCollectionSlugs(storeId: string, exceptId?: string) {
  const rows = await db.cmsCollection.findMany({ where: { storeId, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { slug: true } });
  return new Set(rows.map((row) => row.slug));
}

export async function createCollection(storeId: string, input: z.input<typeof CollectionCreateSchema>) {
  const parsed = CollectionCreateSchema.parse(input);
  const template = getTemplate(parsed.template);
  const taken = await takenCollectionSlugs(storeId);
  const name = parsed.name || template.name;
  let slug = parsed.slug ? slugify(parsed.slug, 80) : "";
  if (slug) {
    const problem = slugError(slug, "collection");
    if (problem) throw new CmsError(problem);
    if (taken.has(slug)) throw new CmsError(`Another collection already uses /${slug}`, 409);
  } else {
    slug = uniqueSlug(parsed.name ? slugify(parsed.name) || template.slug : template.slug, taken);
    if (slugError(slug, "collection")) slug = uniqueSlug(`${slug}-content`, taken);
  }
  let fields: CmsField[] = fieldsFromTemplate(template);
  if (parsed.fields) {
    const result = validateFields(parsed.fields);
    if (!result.ok) throw new CmsError(result.error);
    fields = result.fields;
  }
  const count = await db.cmsCollection.count({ where: { storeId } });
  return db.cmsCollection.create({
    data: {
      storeId,
      name,
      slug,
      template: template.id,
      description: parsed.description ?? template.blurb,
      itemLabel: parsed.itemLabel ?? template.itemLabel,
      fields: json(fields),
      settings: json({ layout: template.layout, sort: template.id === "course" ? "manual" : "newest" }),
      sortOrder: count,
    },
  });
}

export async function updateCollection(storeId: string, id: string, input: z.input<typeof CollectionUpdateSchema>) {
  const parsed = CollectionUpdateSchema.parse(input);
  const collection = await db.cmsCollection.findFirst({ where: { id, storeId } });
  if (!collection) throw new CmsError("Collection not found", 404);
  const data: Prisma.CmsCollectionUpdateInput = {};
  if (parsed.name !== undefined) data.name = parsed.name;
  if (parsed.description !== undefined) data.description = parsed.description;
  if (parsed.itemLabel !== undefined) data.itemLabel = parsed.itemLabel;
  if (parsed.isPublished !== undefined) data.isPublished = parsed.isPublished;
  if (parsed.seo !== undefined) data.seo = json(cleanSeo(parsed.seo));
  if (parsed.slug !== undefined && parsed.slug !== collection.slug) {
    const slug = slugify(parsed.slug, 80);
    const problem = slugError(slug, "collection");
    if (problem) throw new CmsError(problem);
    if ((await takenCollectionSlugs(storeId, id)).has(slug)) throw new CmsError(`Another collection already uses /${slug}`, 409);
    data.slug = slug;
  }
  if (parsed.fields !== undefined) {
    const result = validateFields(parsed.fields);
    if (!result.ok) throw new CmsError(result.error);
    data.fields = json(result.fields);
  }
  if (parsed.layout !== undefined || parsed.itemLayout !== undefined || parsed.sort !== undefined) {
    data.settings = json({
      ...rec(collection.settings),
      ...(parsed.layout ? { layout: parsed.layout } : {}),
      ...(parsed.itemLayout ? { itemLayout: parsed.itemLayout } : {}),
      ...(parsed.sort ? { sort: parsed.sort } : {}),
    });
  }
  return db.cmsCollection.update({ where: { id }, data });
}

export async function listCollections(storeId: string) {
  await ensureLegacyBlogImported(storeId).catch((error) => console.error("[cms] blog import failed", error));
  const [collections, counts, live] = await Promise.all([
    db.cmsCollection.findMany({ where: { storeId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.cmsItem.groupBy({ by: ["collectionId"], where: { storeId }, _count: { _all: true } }),
    db.cmsItem.groupBy({ by: ["collectionId"], where: { storeId, ...liveItemWhere() }, _count: { _all: true } }),
  ]);
  const total = new Map(counts.map((row) => [row.collectionId, row._count._all]));
  const liveCount = new Map(live.map((row) => [row.collectionId, row._count._all]));
  return collections.map((collection) => ({ ...collection, itemCount: total.get(collection.id) ?? 0, liveCount: liveCount.get(collection.id) ?? 0 }));
}

export async function getCollection(storeId: string, id: string) {
  return db.cmsCollection.findFirst({ where: { id, storeId } });
}

// ─── Items ───────────────────────────────────────────────────────────────────

export const ItemSaveSchema = z.object({
  title: z.string().trim().min(1, "Add a title").max(200),
  slug: z.string().trim().max(80).optional(),
  status: z.enum(["draft", "published", "scheduled"]).default("draft"),
  publishAt: z.string().datetime({ offset: true }).nullable().optional(),
  author: z.string().trim().max(80).optional(),
  featuredImage: z.string().trim().max(2000).nullable().optional(),
  excerpt: z.string().trim().max(500).optional(),
  data: z.record(z.string(), z.unknown()).default({}),
  seo: z.record(z.string(), z.unknown()).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  // This item's page layout; "default" follows the collection, leaving it out keeps what the item had.
  layout: z.enum([...ITEM_LAYOUTS, "default"]).optional(),
});

export type ItemSaveInput = z.input<typeof ItemSaveSchema>;

export async function saveItem(
  storeId: string,
  collectionId: string,
  input: ItemSaveInput,
  options: { itemId?: string | null; createdBy?: "seller" | "peggy" | "rex" } = {},
) {
  const parsed = ItemSaveSchema.safeParse(input);
  if (!parsed.success) throw new CmsError(parsed.error.issues[0]?.message ?? "Check the item and try again");
  const body = parsed.data;
  const collection = await db.cmsCollection.findFirst({ where: { id: collectionId, storeId } });
  if (!collection) throw new CmsError("Collection not found", 404);
  const existing = options.itemId ? await db.cmsItem.findFirst({ where: { id: options.itemId, collectionId } }) : null;
  if (options.itemId && !existing) throw new CmsError("Item not found", 404);

  const fields = readFields(collection.fields);
  const publishing = body.status !== "draft";
  const values = validateItemData(fields, body.data, { publishing });
  if (!values.ok) throw new CmsError(Object.values(values.errors)[0] ?? "Check the fields", 422, values.errors);

  let publishAt: Date | null = body.publishAt ? new Date(body.publishAt) : null;
  if (body.status === "scheduled" && !publishAt) throw new CmsError("Pick a date and time to publish", 422, { publishAt: "Pick a date and time" });
  if (body.status === "published") publishAt = null;

  const siblings = await db.cmsItem.findMany({ where: { collectionId, ...(existing ? { id: { not: existing.id } } : {}) }, select: { slug: true } });
  const taken = new Set(siblings.map((row) => row.slug));
  let slug = body.slug ? slugify(body.slug, 80) : "";
  if (slug) {
    const problem = slugError(slug);
    if (problem) throw new CmsError(problem, 422, { slug: problem });
    if (taken.has(slug)) throw new CmsError(`Another ${collection.itemLabel.toLowerCase()} already uses /${slug}`, 409, { slug: "Already used" });
  } else slug = uniqueSlug(body.title, taken);

  const main = mainRichField(fields);
  const mainValue = main ? (values.data[main.key] as RichValue | undefined) : undefined;
  const excerpt = body.excerpt !== undefined && body.excerpt !== "" ? body.excerpt : mainValue ? summarize(mainValue.json, 200) : (existing?.excerpt ?? "");
  const featuredImage = body.featuredImage === undefined ? existing?.featuredImage ?? null : body.featuredImage ? body.featuredImage : null;
  if (featuredImage && !/^https?:\/\//.test(featuredImage)) throw new CmsError("The featured image must be an uploaded picture", 422, { featuredImage: "Upload a picture" });

  const data = {
    title: body.title,
    slug,
    status: body.status,
    publishAt,
    publishedAt: body.status === "published" ? existing?.publishedAt ?? new Date() : existing?.publishedAt ?? null,
    author: body.author ?? existing?.author ?? "",
    featuredImage,
    excerpt,
    data: json(withItemLayout(values.data, body.layout, existing?.data)),
    seo: json(cleanSeo(body.seo ?? existing?.seo ?? {})),
    ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
  };
  if (existing) return db.cmsItem.update({ where: { id: existing.id }, data });
  const count = await db.cmsItem.count({ where: { collectionId } });
  return db.cmsItem.create({ data: { ...data, storeId, collectionId, createdBy: options.createdBy ?? "seller", sortOrder: body.sortOrder ?? count } });
}

function withItemLayout(values: Record<string, unknown>, layout: string | undefined, previous: unknown) {
  const chosen = layout === undefined ? rec(previous)[ITEM_LAYOUT_KEY] : layout;
  return isItemLayout(chosen) ? { ...values, [ITEM_LAYOUT_KEY]: chosen } : values;
}

export async function getItem(storeId: string, id: string) {
  return db.cmsItem.findFirst({ where: { id, storeId }, include: { collection: true } });
}

export function itemOrderBy(sort: string): Prisma.CmsItemOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest": return [{ createdAt: "asc" }];
    case "title": return [{ title: "asc" }];
    case "manual": return [{ sortOrder: "asc" }, { createdAt: "asc" }];
    default: return [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
  }
}

// ─── Storefront ──────────────────────────────────────────────────────────────

const storeSelect = { id: true, name: true, slug: true, description: true, logoUrl: true, currency: true, customDomain: true, brandSettings: true, status: true } as const;

async function publicStore(storeSlug: string) {
  const store = await db.store.findUnique({ where: { slug: storeSlug }, select: storeSelect });
  return store && store.status === "active" ? store : null;
}

export type PublicStore = NonNullable<Awaited<ReturnType<typeof publicStore>>>;

export async function loadStorefrontCollection(storeSlug: string, collectionSlug: string) {
  const store = await publicStore(storeSlug);
  if (!store) return null;
  if (collectionSlug === "blog") await ensureLegacyBlogImported(store.id).catch(() => null);
  const collection = await db.cmsCollection.findUnique({ where: { storeId_slug: { storeId: store.id, slug: collectionSlug } } });
  if (!collection || !collection.isPublished) return null;
  const settings = collectionSettings(collection.settings);
  const items = await db.cmsItem.findMany({ where: { collectionId: collection.id, ...liveItemWhere() }, orderBy: itemOrderBy(settings.sort), take: 200 });
  return { store, collection, items, fields: readFields(collection.fields), settings };
}

export async function loadStorefrontItem(storeSlug: string, collectionSlug: string, itemSlug: string) {
  const store = await publicStore(storeSlug);
  if (!store) return null;
  if (collectionSlug === "blog") await ensureLegacyBlogImported(store.id).catch(() => null);
  const collection = await db.cmsCollection.findUnique({ where: { storeId_slug: { storeId: store.id, slug: collectionSlug } } });
  if (!collection || !collection.isPublished) return null;
  const item = await db.cmsItem.findFirst({ where: { collectionId: collection.id, slug: itemSlug, ...liveItemWhere() } });
  if (!item) return null;
  const fields = readFields(collection.fields);
  const settings = collectionSettings(collection.settings);
  const siblings = await db.cmsItem.findMany({
    where: { collectionId: collection.id, id: { not: item.id }, ...liveItemWhere() },
    orderBy: itemOrderBy(settings.sort),
    take: 6,
    select: { id: true, title: true, slug: true, excerpt: true, featuredImage: true, publishedAt: true, createdAt: true },
  });
  return { store, collection, item, fields, settings, siblings };
}

/** Products and items referenced by an item's fields and rich text, loaded once for rendering. */
export async function loadReferences(storeId: string, productIds: string[], itemIds: string[]) {
  const [products, items] = await Promise.all([
    productIds.length
      ? db.storeProduct.findMany({ where: { id: { in: productIds.slice(0, 100) }, storeId, status: "published" }, select: { id: true, name: true, images: true, retailPrice: true, currency: true } })
      : Promise.resolve([]),
    itemIds.length
      ? db.cmsItem.findMany({ where: { id: { in: itemIds.slice(0, 100) }, storeId, ...liveItemWhere() }, select: { id: true, title: true, slug: true, featuredImage: true, collection: { select: { slug: true, isPublished: true } } } })
      : Promise.resolve([]),
  ]);
  return { products, items: items.filter((item) => item.collection.isPublished) };
}

/** Forms the store has (agent A's StoreForm); used by the Form field. */
export async function loadStoreForm(storeId: string, formId: string) {
  return db.storeForm.findFirst({ where: { id: formId, storeId, active: true } }).catch(() => null);
}

// ─── SEO for products and product collections ───────────────────────────────

export async function readSeoMeta(storeId: string, resourceType: "product" | "collection", resourceId: string) {
  const row = await db.seoMeta.findUnique({ where: { storeId_resourceType_resourceId: { storeId, resourceType, resourceId } } }).catch(() => null);
  return cleanSeo(row?.data ?? {});
}

export async function writeSeoMeta(storeId: string, resourceType: "product" | "collection", resourceId: string, raw: unknown) {
  const seo = cleanSeo(raw);
  await db.seoMeta.upsert({
    where: { storeId_resourceType_resourceId: { storeId, resourceType, resourceId } },
    create: { storeId, resourceType, resourceId, data: json(seo) },
    update: { data: json(seo) },
  });
  return seo;
}

// ─── Blog helpers (Peggy, the old /api/store/blog-posts route) ───────────────

/** The store's Blog collection (old posts copied in), created from the Blog template when missing. */
export async function blogCollection(storeId: string) {
  const imported = await ensureLegacyBlogImported(storeId);
  if (imported) return imported;
  return (await db.cmsCollection.findFirst({ where: { storeId, template: "blog" }, orderBy: { createdAt: "asc" } })) ?? createCollection(storeId, { template: "blog" });
}

/** A blog post written in Markdown (Peggy's drafts, the old blog API), saved in the Blog collection. */
export async function saveMarkdownPost(
  storeId: string,
  post: { id?: string | null; title: string; slug?: string; excerpt?: string; bodyMarkdown: string; metaTitle?: string; metaDescription?: string; keywords?: string[]; status: "draft" | "published" },
  createdBy: "seller" | "peggy" | "rex" = "seller",
) {
  const collection = await blogCollection(storeId);
  const fields = readFields(collection.fields);
  const bodyKey = mainRichField(fields)?.key ?? "body";
  const existing = post.id ? await db.cmsItem.findFirst({ where: { collectionId: collection.id, OR: [{ id: post.id }, { legacyId: post.id }] } }) : null;
  const tagsField = fields.find((field) => field.type === "tags");
  const data: Record<string, unknown> = { ...rec(existing?.data), [bodyKey]: post.bodyMarkdown };
  if (tagsField && post.keywords?.length) data[tagsField.key] = post.keywords;
  return saveItem(
    storeId,
    collection.id,
    {
      title: post.title,
      slug: post.slug || existing?.slug,
      excerpt: post.excerpt,
      status: post.status,
      data,
      seo: { ...rec(existing?.seo), metaTitle: post.metaTitle ?? "", metaDescription: post.metaDescription ?? "", focusKeyword: post.keywords?.[0] ?? rec(existing?.seo).focusKeyword ?? "" },
    },
    { itemId: existing?.id ?? null, createdBy },
  );
}
