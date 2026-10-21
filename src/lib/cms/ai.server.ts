import "server-only";

import { db } from "@/lib/db/client";
import { aiText, firstJsonArray, firstJsonObject } from "@/lib/ai/text";
import { cleanPlan, planWindow, type PlanChannel } from "@/lib/cms/content-plan";
import { fieldsFromTemplate, getTemplate, readFields, validateFields, validateItemData, type CmsField, type TemplateId } from "@/lib/cms/fields";
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

const writerSystem = (storeName: string) =>
  `You write website content for ${storeName}, a small online shop in Nigeria. Warm, clear Nigerian English. Useful to readers first, selling second. No emojis. Never invent facts about the shop (prices, delivery times, materials, awards, reviews) beyond what you are given.`;

async function topProducts(storeId: string) {
  const products = await db.storeProduct.findMany({ where: { storeId, status: "published" }, orderBy: { soldStock: "desc" }, take: 8, select: { name: true } });
  return products.map((product) => product.name);
}

/**
 * Writes an item for a collection without saving it: title, summary, the field values (already cleaned, in the
 * shape the editor and saveItem use) and SEO. Values the model got wrong are dropped, the rest kept.
 */
export async function writeItem(storeId: string, storeName: string, collection: { name: string; itemLabel: string; fields: unknown }, input: { brief: string; title?: string | null }) {
  const fields = readFields(collection.fields);
  const products = await topProducts(storeId);
  const written = await aiText({
    maxTokens: 4000,
    system: writerSystem(storeName),
    prompt: [
      `Collection: ${collection.name} (each item is a ${collection.itemLabel.toLowerCase()}).`,
      `Brief: ${input.brief}`,
      input.title ? `Title: ${input.title}` : "",
      products.length ? `Products the shop sells (mention only where natural): ${products.join(", ")}` : "",
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
  let checked = validateItemData(fields, values, { publishing: false });
  if (!checked.ok) {
    const bad = checked.errors;
    values = Object.fromEntries(Object.entries(values).filter(([key]) => !(key in bad)));
    checked = validateItemData(fields, values, { publishing: false });
  }
  return {
    title: title.slice(0, 200),
    excerpt: typeof json.excerpt === "string" ? json.excerpt.slice(0, 500) : "",
    data: checked.ok ? checked.data : {},
    seo: {
      metaTitle: typeof seo.metaTitle === "string" ? seo.metaTitle.slice(0, 120) : "",
      metaDescription: typeof seo.metaDescription === "string" ? seo.metaDescription.slice(0, 320) : "",
      focusKeyword: typeof seo.focusKeyword === "string" ? seo.focusKeyword.slice(0, 80) : "",
    },
  };
}

export async function draftItem(
  storeId: string,
  storeName: string,
  input: { collection: string; brief: string; title?: string | null },
  createdBy: "peggy" | "rex",
) {
  const collection = await findCollection(storeId, input.collection);
  if (!collection) throw new CmsError(`There's no collection called "${input.collection}". Create it first.`, 404);
  const written = await writeItem(storeId, storeName, collection, input);
  const item = await saveItem(storeId, collection.id, { ...written, status: "draft", author: createdBy === "rex" ? "Rex" : "Peggy" }, { createdBy });
  return { collection, item };
}

export const ASSIST_TASKS = ["write", "continue", "improve", "shorten", "expand"] as const;
export type AssistTask = (typeof ASSIST_TASKS)[number];

/** Rex in the editor: Markdown for a new section, the next part, or a rewrite of the selected text. */
export async function assistWriting(storeId: string, storeName: string, input: { task: AssistTask; instruction: string; selection: string; before: string; title: string; collection: string }) {
  const products = await topProducts(storeId);
  const job: Record<AssistTask, string> = {
    write: "Write a new section for this piece, following the instruction.",
    continue: "Continue the piece from where the text so far stops. Don't repeat what's there.",
    improve: "Rewrite the selected text so it reads better. Keep its meaning and facts.",
    shorten: "Rewrite the selected text shorter. Keep the key points.",
    expand: "Rewrite the selected text with more useful detail.",
  };
  const written = await aiText({
    maxTokens: 2500,
    system: `${writerSystem(storeName)} Reply with the text only, in Markdown (## subheadings, lists, **bold**) where it helps. No preamble, no notes to the seller.`,
    prompt: [
      job[input.task],
      input.instruction ? `Instruction: ${input.instruction}` : "",
      `It is a ${input.collection} item${input.title ? ` titled "${input.title}"` : ""}.`,
      products.length ? `Products the shop sells (mention only where natural): ${products.join(", ")}` : "",
      input.before ? `Text so far (end of it):\n${input.before}` : "",
      input.selection ? `Selected text:\n${input.selection}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  if (!written) throw new CmsError("Rex didn't answer. Try again in a moment.", 503);
  return written.text.trim();
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

/**
 * Rex's content plan: dated ideas for the chosen collections and social channels over the next few weeks. Ideas
 * only; nothing is saved until the seller drafts one.
 */
export async function planContent(
  storeId: string,
  storeName: string,
  input: { goal: string; weeks: number; perWeek: number; collectionIds: string[]; channels: PlanChannel[]; start?: Date },
) {
  const collections = input.collectionIds.length
    ? await db.cmsCollection.findMany({ where: { storeId, id: { in: input.collectionIds } }, select: { id: true, name: true, itemLabel: true, description: true, items: { select: { title: true }, orderBy: { updatedAt: "desc" }, take: 15 } } })
    : [];
  if (!collections.length && !input.channels.length) throw new CmsError("Pick at least one kind of content to plan");
  const { from, to } = planWindow(input.start ?? new Date(), input.weeks);
  const products = await topProducts(storeId);
  const written = await aiText({
    maxTokens: 6000,
    system: `You are Rex, the content planner for ${storeName}, a small online shop in Nigeria. You plan useful, specific content that brings shoppers to the store: practical guides, stories, seasonal moments on the Nigerian calendar, product spotlights. No emojis in titles. Never invent facts about the shop.`,
    prompt: [
      `Plan content from ${from} to ${to} (${input.weeks} week${input.weeks === 1 ? "" : "s"}), about ${input.perWeek} piece${input.perWeek === 1 ? "" : "s"} a week of each kind below.`,
      `Goal: ${input.goal || "grow traffic and sales"}`,
      products.length ? `Products the shop sells: ${products.join(", ")}` : "",
      collections.length
        ? `Website content (kind "cms"), one of these collections:\n${collections.map((c) => `- collectionId "${c.id}": ${c.name} (each item is a ${c.itemLabel.toLowerCase()})${c.description ? `. ${c.description}` : ""}${c.items.length ? `. Already written: ${c.items.map((i) => i.title).join("; ")}` : ""}`).join("\n")}`
        : "",
      input.channels.length ? `Social posts (kind "social") for these channels: ${input.channels.join(", ")}. Write the caption too, fit for the channel, with 2-4 hashtags where the channel uses them.` : "",
      'Return JSON only: {"ideas": [{"date": "YYYY-MM-DD", "kind": "cms" | "social", "collectionId": "..." (cms only), "channel": "..." (social only), "title": "...", "brief": "what it covers, 1-3 sentences", "caption": "..." (social only)}]}',
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  if (!written) throw new CmsError("Rex didn't answer. Try again in a moment.", 503);
  const ideas = cleanPlan(firstJsonObject(written.text) ?? firstJsonArray(written.text), { collectionIds: collections.map((c) => c.id), channels: input.channels, from, to });
  if (!ideas.length) throw new CmsError("Rex's plan came back unreadable. Try again.", 502);
  return { from, to, ideas };
}
