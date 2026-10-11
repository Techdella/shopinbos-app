// schema.org JSON-LD for CMS pages, picked by the collection's template: BlogPosting, Recipe, Course,
// FAQPage, Event, else Article; and CollectionPage/ItemList (or one FAQPage) for list pages. Pure.

import type { CmsField, PriceValue, RichValue, StatValue } from "./fields.ts";
import { plainText, type RichDoc, type RichNode } from "./richtext.ts";

export interface JsonLdItem {
  title: string;
  excerpt: string;
  featuredImage: string | null;
  author: string;
  publishedAt: Date | string | null;
  updatedAt: Date | string;
  data: Record<string, unknown>;
}

export interface JsonLdContext {
  template: string;
  url: string;
  storeName: string;
  storeUrl: string;
  logo: string | null;
  fields: CmsField[];
}

const iso = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString() : undefined);
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const minutes = (value: unknown) => (num(value) ? `PT${Math.round(num(value)!)}M` : undefined);

function rich(data: Record<string, unknown>, key: string): RichDoc | null {
  const value = data[key] as RichValue | undefined;
  return value?.json ?? null;
}

function firstRich(ctx: JsonLdContext, data: Record<string, unknown>) {
  const field = ctx.fields.find((entry) => entry.type === "richText");
  return field ? rich(data, field.key) : null;
}

/** Lines of a rich text field: list items if it has lists, else its paragraphs. */
export function richLines(doc: RichDoc | null): string[] {
  if (!doc) return [];
  const items: string[] = [];
  const walk = (node: RichNode) => {
    if (node.type === "listItem") {
      items.push(plainText(node).replace(/\s+/g, " ").trim());
      return;
    }
    (node.content ?? []).forEach(walk);
  };
  doc.content.forEach(walk);
  if (items.length) return items.filter(Boolean);
  return doc.content.filter((node) => node.type === "paragraph").map((node) => plainText(node).trim()).filter(Boolean);
}

export function itemJsonLd(item: JsonLdItem, ctx: JsonLdContext): Record<string, unknown> {
  const image = item.featuredImage ?? undefined;
  const author = item.author ? { "@type": "Person", name: item.author } : { "@type": "Organization", name: ctx.storeName };
  const publisher = { "@type": "Organization", name: ctx.storeName, url: ctx.storeUrl, ...(ctx.logo ? { logo: { "@type": "ImageObject", url: ctx.logo } } : {}) };
  const description = item.excerpt || undefined;
  const base = { "@context": "https://schema.org", url: ctx.url, mainEntityOfPage: ctx.url };
  const d = item.data;
  switch (ctx.template) {
    case "blog":
      return { ...base, "@type": "BlogPosting", headline: item.title.slice(0, 110), description, image, datePublished: iso(item.publishedAt), dateModified: iso(item.updatedAt), author, publisher, keywords: Array.isArray(d.tags) ? (d.tags as string[]).join(", ") : undefined };
    case "recipe": {
      const nutrition = Array.isArray(d.nutrition) ? (d.nutrition as StatValue[]) : [];
      const calories = nutrition.find((stat) => /calor|kcal/i.test(stat.label));
      const prep = num(d.prepMinutes);
      const cook = num(d.cookMinutes);
      return {
        ...base,
        "@type": "Recipe",
        name: item.title,
        description: description ?? (typeof d.summary === "string" ? d.summary : undefined),
        image,
        author,
        datePublished: iso(item.publishedAt),
        prepTime: minutes(prep),
        cookTime: minutes(cook),
        totalTime: prep || cook ? minutes((prep ?? 0) + (cook ?? 0)) : undefined,
        recipeYield: num(d.servings) ? `${num(d.servings)} servings` : undefined,
        recipeIngredient: richLines(rich(d, "ingredients")),
        recipeInstructions: richLines(rich(d, "method")).map((text) => ({ "@type": "HowToStep", text })),
        nutrition: calories ? { "@type": "NutritionInformation", calories: calories.value } : undefined,
      };
    }
    case "course":
      return { ...base, "@type": "Course", name: item.title, description: description ?? item.title, image, provider: publisher, timeRequired: minutes(d.durationMinutes), isAccessibleForFree: d.freePreview === true ? true : undefined };
    case "faq": {
      const answer = firstRich(ctx, d);
      return { ...base, "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: item.title, acceptedAnswer: { "@type": "Answer", text: answer ? plainText(answer).trim() : description ?? "" } }] };
    }
    case "events": {
      const price = d.price as PriceValue | undefined;
      const date = typeof d.date === "string" ? d.date : undefined;
      return {
        ...base,
        "@type": "Event",
        name: item.title,
        description,
        image,
        startDate: date,
        eventStatus: "https://schema.org/EventScheduled",
        location: typeof d.location === "string" && d.location ? { "@type": "Place", name: d.location, address: d.location } : undefined,
        organizer: { "@type": "Organization", name: ctx.storeName, url: ctx.storeUrl },
        offers: price ? { "@type": "Offer", price: price.amount, priceCurrency: price.currency, url: ctx.url } : undefined,
      };
    }
    default:
      return { ...base, "@type": "Article", headline: item.title.slice(0, 110), description, image, datePublished: iso(item.publishedAt), dateModified: iso(item.updatedAt), author, publisher };
  }
}

export function listJsonLd(
  collection: { name: string; description: string },
  items: Array<JsonLdItem & { slug: string }>,
  ctx: JsonLdContext,
): Record<string, unknown> {
  if (ctx.template === "faq") {
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      url: ctx.url,
      mainEntity: items.map((item) => {
        const answer = firstRich(ctx, item.data);
        return { "@type": "Question", name: item.title, acceptedAnswer: { "@type": "Answer", text: answer ? plainText(answer).trim() : item.excerpt } };
      }),
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: collection.name,
    description: collection.description || undefined,
    url: ctx.url,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: items.slice(0, 50).map((item, index) => ({ "@type": "ListItem", position: index + 1, url: `${ctx.url.replace(/\/$/, "")}/${item.slug}`, name: item.title })),
    },
  };
}

/** Safe to put inside <script type="application/ld+json">: no "</script>" can close the tag early. */
export function jsonLdString(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}
