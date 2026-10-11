import "server-only";

import { db } from "@/lib/db/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { fieldsFromTemplate, getTemplate, readFields, validateFields, type CmsField, type TemplateId } from "@/lib/cms/fields";
import { aiValues, extraFieldsFrom, fieldGuide, pickTemplate } from "@/lib/cms/plan";
import { CmsError, createCollection, saveItem } from "@/lib/cms/server";

// Rex and Peggy setting up collections and drafting items. Items are always saved as drafts for the seller
// to review and publish; nothing here publishes.

export async function findCollection(storeId: string, ref: string) {
  const wanted = ref.trim();
  return db.cmsCollection.findFirst({
    where: { storeId, OR: [{ id: wanted }, { slug: wanted.toLowerCase() }, { name: { equals: wanted, mode: "insensitive" } }] },
  });
}

export async function setupCollection(
  storeId: string,
  input: { description: string; name?: string | null; template?: TemplateId | null; extraFields?: Array<{ label: string; type: string; options?: string[] | null }> | null },
) {
  const templateId = input.template ?? pickTemplate(`${input.name ?? ""} ${input.description}`);
  const template = getTemplate(templateId);
  let fields: CmsField[] = fieldsFromTemplate(template);
  const extra = extraFieldsFrom(input.extraFields);
  if (extra.length) {
    const merged = validateFields([...fields, ...extra.filter((field) => !fields.some((existing) => existing.label.toLowerCase() === field.label.toLowerCase()))]);
    if (!merged.ok) throw new CmsError(merged.error);
    fields = merged.fields;
  }
  return createCollection(storeId, { template: template.id, name: input.name?.trim() || template.name, fields, description: input.description.slice(0, 500) });
}

export async function draftItem(
  storeId: string,
  storeName: string,
  input: { collection: string; brief: string; title?: string | null },
  createdBy: "peggy" | "rex",
) {
  const collection = await findCollection(storeId, input.collection);
  if (!collection) throw new CmsError(`There's no collection called "${input.collection}". Create it first.`, 404);
  const fields = readFields(collection.fields);
  const products = await db.storeProduct.findMany({ where: { storeId, status: "published" }, orderBy: { soldStock: "desc" }, take: 8, select: { name: true } });
  const written = await aiText({
    maxTokens: 4000,
    system: `You write website content for ${storeName}, a small online shop in Nigeria. Warm, clear Nigerian English. Useful to readers first, selling second. No emojis. Never invent facts about the shop (prices, delivery times, materials, awards, reviews) beyond what you are given.`,
    prompt: [
      `Collection: ${collection.name} (each item is a ${collection.itemLabel.toLowerCase()}).`,
      `Brief: ${input.brief}`,
      input.title ? `Title: ${input.title}` : "",
      products.length ? `Products the shop sells (mention only where natural): ${products.map((p) => p.name).join(", ")}` : "",
      "Fields to fill (leave out any you have nothing true to put in):",
      fieldGuide(fields),
      'Return JSON only: {"title": "...", "excerpt": "1-2 sentences, under 200 characters", "values": {"<field key>": <value>}, "seo": {"metaTitle": "under 60 characters", "metaDescription": "under 155 characters", "focusKeyword": "2-4 word search phrase"}}',
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (!written) throw new CmsError("The writer didn't answer. Try again in a moment.", 503);
  const json = firstJsonObject(written.text);
  if (!json) throw new CmsError("The writer's draft came back unreadable. Try again.", 502);
  const title = (typeof json.title === "string" && json.title.trim()) || input.title?.trim() || input.brief.slice(0, 80);
  const seo = json.seo && typeof json.seo === "object" ? (json.seo as Record<string, unknown>) : {};
  let values = aiValues(fields, json.values);
  const base = { title: title.slice(0, 200), status: "draft" as const, author: createdBy === "rex" ? "Rex" : "Peggy", excerpt: typeof json.excerpt === "string" ? json.excerpt.slice(0, 500) : undefined, seo };
  try {
    return { collection, item: await saveItem(storeId, collection.id, { ...base, data: values }, { createdBy }) };
  } catch (error) {
    // Drop values the model got wrong (a malformed table, an option that doesn't exist) and keep the rest.
    if (error instanceof CmsError && error.fieldErrors) {
      values = Object.fromEntries(Object.entries(values).filter(([key]) => !(key in error.fieldErrors!)));
      return { collection, item: await saveItem(storeId, collection.id, { ...base, data: values }, { createdBy }) };
    }
    throw error;
  }
}

export async function listForAssistant(storeId: string, collectionRef: string | null) {
  if (!collectionRef) {
    const collections = await db.cmsCollection.findMany({ where: { storeId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, slug: true, template: true, _count: { select: { items: true } } } });
    return { collections: collections.map((c) => ({ name: c.name, path: `/${c.slug}`, template: c.template, items: c._count.items, manage: `/home/cms/${c.id}` })) };
  }
  const collection = await findCollection(storeId, collectionRef);
  if (!collection) throw new CmsError(`There's no collection called "${collectionRef}".`, 404);
  const items = await db.cmsItem.findMany({ where: { collectionId: collection.id }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, slug: true, status: true, publishAt: true, updatedAt: true, createdBy: true } });
  return {
    collection: collection.name,
    items: items.map((item) => ({ title: item.title, path: `/${collection.slug}/${item.slug}`, status: item.status, publishAt: item.publishAt?.toISOString() ?? null, updated: item.updatedAt.toISOString().slice(0, 10), writtenBy: item.createdBy, edit: `/home/cms/${collection.id}/${item.id}` })),
  };
}
