// CMS collections, pure parts: the field types a seller can add, the starter templates (Blog, Size guide,
// Recipe book, Course…), slug rules, and validation of a collection's fields and an item's values. No server
// imports, so it is unit-tested in tests/behaviour.test.mjs and shared by the editor, the API and Rex.

import { markdownToDoc } from "./markdown.ts";
import { EMPTY_DOC, renderDoc, safeImageUrl, safeLinkUrl, sanitizeDoc, vimeoEmbedUrl, youtubeEmbedUrl, type RichDoc } from "./richtext.ts";

export const FIELD_TYPES = [
  "richText", "text", "number", "stats", "image", "gallery", "video", "file", "date", "boolean",
  "choice", "tags", "link", "products", "items", "callout", "table", "form", "price",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_INFO: Record<FieldType, { label: string; hint: string }> = {
  richText: { label: "Rich text", hint: "Formatted writing with headings, images, tables and more" },
  text: { label: "Plain text", hint: "A line or short paragraph" },
  number: { label: "Number", hint: "Servings, minutes, a size" },
  stats: { label: "Stats", hint: "Label and value pairs, like Calories · 420" },
  image: { label: "Image", hint: "One picture with a description" },
  gallery: { label: "Gallery", hint: "Several pictures" },
  video: { label: "Video", hint: "Upload a video or paste a YouTube or Vimeo link" },
  file: { label: "File", hint: "A PDF or picture people can download" },
  date: { label: "Date", hint: "An event or release date" },
  boolean: { label: "Yes / no", hint: "A switch, like Free preview" },
  choice: { label: "Choice", hint: "Pick from options you set" },
  tags: { label: "Tags", hint: "Free labels people can browse by" },
  link: { label: "Link", hint: "A web address with button text" },
  products: { label: "Products", hint: "Products from your store" },
  items: { label: "Items from a collection", hint: "Link to items in another collection" },
  callout: { label: "Info box", hint: "A highlighted tip, note or warning" },
  table: { label: "Table", hint: "Rows and columns, like a size chart" },
  form: { label: "Form", hint: "One of your forms, or a simple contact form" },
  price: { label: "Price", hint: "An amount in naira" },
};

export interface CmsField {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  /** Choice options. */
  options?: string[];
  /** Choice: allow several. */
  multiple?: boolean;
  /** Items from a collection: which collection. */
  collectionId?: string | null;
}

export const TEMPLATE_IDS = ["blog", "size_guide", "recipe", "course", "faq", "lookbook", "team", "events", "blank"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export interface CollectionTemplate {
  id: TemplateId;
  name: string;
  slug: string;
  itemLabel: string;
  blurb: string;
  layout: "grid" | "list";
  fields: Array<Omit<CmsField, "id">>;
}

const f = (key: string, label: string, type: FieldType, extra: Partial<CmsField> = {}): Omit<CmsField, "id"> => ({ key, label, type, ...extra });

export const COLLECTION_TEMPLATES: CollectionTemplate[] = [
  {
    id: "blog", name: "Blog", slug: "blog", itemLabel: "Post", layout: "grid",
    blurb: "Articles, news and guides that bring shoppers in from Google.",
    fields: [f("body", "Post", "richText", { required: true }), f("tags", "Tags", "tags"), f("products", "Products in this post", "products")],
  },
  {
    id: "size_guide", name: "Size guide", slug: "size-guide", itemLabel: "Guide", layout: "list",
    blurb: "Size charts and how to measure, one per product type.",
    fields: [
      f("intro", "Introduction", "text"),
      f("sizes", "Size chart", "table", { required: true }),
      f("howToMeasure", "How to measure", "callout"),
      f("diagram", "Measuring diagram", "image"),
      f("products", "Applies to", "products"),
    ],
  },
  {
    id: "recipe", name: "Recipe book", slug: "recipes", itemLabel: "Recipe", layout: "grid",
    blurb: "Recipes with ingredients, method, cooking time and the products to buy.",
    fields: [
      f("summary", "Short description", "text"),
      f("prepMinutes", "Prep time (minutes)", "number"),
      f("cookMinutes", "Cook time (minutes)", "number"),
      f("servings", "Serves", "number"),
      f("ingredients", "Ingredients", "richText", { required: true }),
      f("method", "Method", "richText", { required: true }),
      f("nutrition", "Nutrition", "stats"),
      f("video", "Video", "video"),
      f("products", "Shop the ingredients", "products"),
    ],
  },
  {
    id: "course", name: "Course", slug: "course", itemLabel: "Lesson", layout: "list",
    blurb: "Lessons in order, with video, notes and downloads.",
    fields: [
      f("lessonNumber", "Lesson number", "number"),
      f("video", "Lesson video", "video"),
      f("lesson", "Lesson notes", "richText", { required: true }),
      f("durationMinutes", "Length (minutes)", "number"),
      f("worksheet", "Worksheet", "file"),
      f("freePreview", "Free preview", "boolean"),
    ],
  },
  {
    id: "faq", name: "FAQ", slug: "faq", itemLabel: "Question", layout: "list",
    blurb: "Questions and answers, shown as an FAQ page Google understands.",
    fields: [f("answer", "Answer", "richText", { required: true }), f("category", "Topic", "choice", { options: ["Orders", "Delivery", "Returns", "Payments", "Products"] })],
  },
  {
    id: "lookbook", name: "Lookbook", slug: "lookbook", itemLabel: "Look", layout: "grid",
    blurb: "Styled photos with the products in each look.",
    fields: [f("looks", "Photos", "gallery", { required: true }), f("story", "Story", "richText"), f("products", "Shop the look", "products")],
  },
  {
    id: "team", name: "Team", slug: "team", itemLabel: "Person", layout: "grid",
    blurb: "The people behind the shop.",
    fields: [f("photo", "Photo", "image"), f("role", "Role", "text"), f("bio", "Bio", "richText"), f("social", "Profile link", "link")],
  },
  {
    id: "events", name: "Events", slug: "events", itemLabel: "Event", layout: "list",
    blurb: "Pop-ups, launches and classes with dates, tickets and sign-up.",
    fields: [
      f("date", "Date", "date", { required: true }),
      f("location", "Location", "text"),
      f("price", "Ticket price", "price"),
      f("tickets", "Tickets link", "link"),
      f("details", "Details", "richText"),
      f("rsvp", "Sign-up form", "form"),
    ],
  },
  {
    id: "blank", name: "Blank collection", slug: "content", itemLabel: "Item", layout: "grid",
    blurb: "Start from nothing and add your own fields.",
    fields: [f("body", "Content", "richText")],
  },
];

export function getTemplate(id: string): CollectionTemplate {
  return COLLECTION_TEMPLATES.find((template) => template.id === id) ?? COLLECTION_TEMPLATES[COLLECTION_TEMPLATES.length - 1];
}

// ─── Slugs ───────────────────────────────────────────────────────────────────

/** Paths under /s/[slug]/ that belong to the store itself, so no collection may use them. */
export const RESERVED_COLLECTION_SLUGS = [
  "api", "cart", "checkout", "wishlist", "order", "orders", "product", "products", "preview", "join", "review", "reviews",
  "collections", "c", "search", "account", "login", "signup", "s", "admin", "static", "_next", "favicon.ico", "robots.txt", "sitemap.xml", "policies",
] as const;

export function slugify(input: string, max = 72) {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** null when the slug is fine, else what's wrong in plain words. */
export function slugError(slug: string, kind: "collection" | "item" = "item"): string | null {
  if (!slug) return "Add a web address";
  if (slug.length > 80) return "Keep the web address under 80 characters";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "Use lowercase letters, numbers and single dashes only";
  if (kind === "collection" && (RESERVED_COLLECTION_SLUGS as readonly string[]).includes(slug)) return `"${slug}" is already used by your store; pick another`;
  return null;
}

/** First free slug: base, base-2, base-3… */
export function uniqueSlug(base: string, taken: Iterable<string>) {
  const used = new Set(taken);
  const root = slugify(base) || "item";
  if (!used.has(root)) return root;
  for (let n = 2; n < 10000; n++) {
    const candidate = `${root.slice(0, 72)}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${root.slice(0, 60)}-${Date.now().toString(36)}`;
}

// ─── Collection fields ─────────────────────────────────────────────────────────

export const BUILT_IN_KEYS = ["title", "slug", "status", "author", "excerpt", "featuredImage", "publishAt", "seo"] as const;
export const MAX_FIELDS = 40;

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export function fieldKey(label: string) {
  const words = label.normalize("NFKD").replace(/[^A-Za-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean);
  const key = words.map((word, index) => (index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())).join("");
  return /^[a-z]/.test(key) ? key.slice(0, 40) : `field${key}`.slice(0, 40);
}

let idCounter = 0;
export function newFieldId() {
  idCounter = (idCounter + 1) % 1e6;
  return `f_${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Cleans a collection's field list from the editor: known types, unique keys that don't clash with the
 * built-in item fields, trimmed labels and options. Returns the fields or the first problem.
 */
export function validateFields(raw: unknown): { ok: true; fields: CmsField[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Fields must be a list" };
  if (raw.length > MAX_FIELDS) return { ok: false, error: `A collection can have up to ${MAX_FIELDS} fields` };
  const fields: CmsField[] = [];
  const keys = new Set<string>();
  const ids = new Set<string>();
  for (const entry of raw) {
    const r = rec(entry);
    const type = str(r.type, 20) as FieldType;
    if (!(FIELD_TYPES as readonly string[]).includes(type)) return { ok: false, error: `Unknown field type "${str(r.type, 20)}"` };
    const label = str(r.label, 60);
    if (!label) return { ok: false, error: "Every field needs a name" };
    const key = str(r.key, 40) || fieldKey(label);
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) return { ok: false, error: `"${label}" needs a key made of letters and numbers` };
    if ((BUILT_IN_KEYS as readonly string[]).includes(key)) return { ok: false, error: `"${label}" clashes with a built-in field; rename it` };
    if (keys.has(key)) return { ok: false, error: `Two fields are called "${label}"; give them different names` };
    keys.add(key);
    let id = str(r.id, 40) || newFieldId();
    if (ids.has(id)) id = newFieldId();
    ids.add(id);
    const field: CmsField = { id, key, label, type };
    if (r.required === true) field.required = true;
    const help = str(r.help, 200);
    if (help) field.help = help;
    if (type === "choice") {
      const options = Array.isArray(r.options) ? [...new Set(r.options.map((option) => str(option, 60)).filter(Boolean))].slice(0, 50) : [];
      if (!options.length) return { ok: false, error: `Add at least one option to "${label}"` };
      field.options = options;
      if (r.multiple === true) field.multiple = true;
    }
    if (type === "items") field.collectionId = str(r.collectionId, 40) || null;
    fields.push(field);
  }
  return { ok: true, fields };
}

export function fieldsFromTemplate(template: CollectionTemplate): CmsField[] {
  return template.fields.map((field, index) => ({ ...field, id: `f_${template.id}_${index}` }));
}

export function readFields(raw: unknown): CmsField[] {
  const result = validateFields(raw);
  return result.ok ? result.fields : [];
}

// ─── Item values ─────────────────────────────────────────────────────────────

export interface RichValue {
  json: RichDoc;
  html: string;
}
export interface MediaValue {
  url: string;
  alt: string;
}
export interface FileValue {
  url: string;
  name: string;
}
export interface VideoValue {
  url: string;
  /** youtube | vimeo | file */
  kind: "youtube" | "vimeo" | "file";
  embedUrl: string;
}
export interface LinkValue {
  url: string;
  label: string;
}
export interface StatValue {
  label: string;
  value: string;
}
export interface CalloutValue {
  tone: "info" | "tip" | "success" | "warning";
  title: string;
  body: string;
}
export interface TableValue {
  header: boolean;
  rows: string[][];
}
export interface FormValue {
  formId: string | null;
  heading: string;
}
export interface PriceValue {
  amount: number;
  currency: string;
}

export function richValue(raw: unknown): RichValue {
  const r = rec(raw);
  // Old posts and AI drafts arrive as Markdown.
  if (typeof raw === "string") {
    const json = sanitizeDoc(markdownToDoc(raw));
    return { json, html: renderDoc(json) };
  }
  if (typeof r.markdown === "string" && !r.json) {
    const json = sanitizeDoc(markdownToDoc(r.markdown));
    return { json, html: renderDoc(json) };
  }
  const json = sanitizeDoc(r.json ?? r);
  return { json, html: renderDoc(json) };
}

export function isEmptyValue(type: FieldType, value: unknown): boolean {
  if (value === null || value === undefined) return true;
  switch (type) {
    case "richText": {
      const doc = (value as RichValue).json;
      return !doc || doc.content.every((node) => node.type === "paragraph" && !node.content?.length);
    }
    case "text": case "date": return !String(value).trim();
    case "number": return typeof value !== "number";
    case "boolean": return false;
    case "image": case "video": case "file": case "link": return !(value as { url?: string }).url;
    case "gallery": case "stats": case "tags": case "products": case "items": return !(value as unknown[]).length;
    case "choice": return Array.isArray(value) ? !value.length : !value;
    case "callout": return !(value as CalloutValue).body && !(value as CalloutValue).title;
    case "table": return !(value as TableValue).rows.some((row) => row.some((cell) => cell.trim()));
    case "form": return false;
    case "price": return typeof (value as PriceValue).amount !== "number";
  }
}

function media(raw: unknown): MediaValue | null {
  const r = typeof raw === "string" ? { url: raw } : rec(raw);
  const url = safeImageUrl(r.url);
  return url ? { url, alt: str(r.alt, 300) } : null;
}

export function videoValue(raw: unknown): VideoValue | null {
  const r = typeof raw === "string" ? { url: raw } : rec(raw);
  const url = str(r.url, 2000);
  if (!url) return null;
  const youtube = youtubeEmbedUrl(url);
  if (youtube) return { url, kind: "youtube", embedUrl: youtube };
  const vimeo = vimeoEmbedUrl(url);
  if (vimeo) return { url, kind: "vimeo", embedUrl: vimeo };
  const file = safeImageUrl(url);
  return file && /^https?:/.test(file) ? { url: file, kind: "file", embedUrl: file } : null;
}

/** Cleans one field's value. Returns undefined for "not set"; throws a message string for a bad value. */
export function cleanValue(field: CmsField, raw: unknown): unknown {
  if (raw === null || raw === undefined || raw === "") return undefined;
  switch (field.type) {
    case "richText": return richValue(raw);
    case "text": return str(raw, 5000) || undefined;
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
      if (!Number.isFinite(n)) throw `${field.label} must be a number`;
      return Math.round(n * 1000) / 1000;
    }
    case "stats": {
      if (!Array.isArray(raw)) throw `${field.label} must be a list`;
      const stats = raw.map((entry) => ({ label: str(rec(entry).label, 60), value: str(rec(entry).value, 60) })).filter((stat) => stat.label || stat.value).slice(0, 24);
      return stats.length ? stats : undefined;
    }
    case "image": {
      const value = media(raw);
      if (!value) throw `${field.label} needs an uploaded picture or an https link`;
      return value;
    }
    case "gallery": {
      if (!Array.isArray(raw)) throw `${field.label} must be a list of pictures`;
      const pictures = raw.map(media).filter((value): value is MediaValue => Boolean(value)).slice(0, 60);
      return pictures.length ? pictures : undefined;
    }
    case "video": {
      const value = videoValue(raw);
      if (!value) throw `${field.label} needs an uploaded video or a YouTube or Vimeo link`;
      return value;
    }
    case "file": {
      const r = typeof raw === "string" ? { url: raw } : rec(raw);
      const url = safeImageUrl(r.url);
      if (!url) throw `${field.label} needs an uploaded file`;
      return { url, name: str(r.name, 120) || url.split("/").pop() || "Download" };
    }
    case "date": {
      const value = str(raw, 30);
      if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(value) || Number.isNaN(Date.parse(value))) throw `${field.label} must be a date`;
      return value;
    }
    case "boolean": return raw === true || raw === "true";
    case "choice": {
      const options = field.options ?? [];
      const picked = (Array.isArray(raw) ? raw : [raw]).map((value) => str(value, 60)).filter(Boolean);
      const bad = picked.find((value) => !options.includes(value));
      if (bad) throw `"${bad}" isn't one of the options for ${field.label}`;
      if (!picked.length) return undefined;
      return field.multiple ? [...new Set(picked)] : picked[0];
    }
    case "tags": {
      const list = (Array.isArray(raw) ? raw : String(raw).split(",")).map((tag) => str(tag, 40)).filter(Boolean);
      const tags = [...new Set(list)].slice(0, 30);
      return tags.length ? tags : undefined;
    }
    case "link": {
      const r = typeof raw === "string" ? { url: raw } : rec(raw);
      const url = safeLinkUrl(r.url);
      if (!url) throw `${field.label} must be a web address starting with https://`;
      return { url, label: str(r.label, 80) };
    }
    case "products":
    case "items": {
      if (!Array.isArray(raw)) throw `${field.label} must be a list`;
      const ids = [...new Set(raw.map((id) => str(id, 64)).filter((id) => /^[\w-]{1,64}$/.test(id)))].slice(0, 50);
      return ids.length ? ids : undefined;
    }
    case "callout": {
      const r = rec(raw);
      const tone = ["info", "tip", "success", "warning"].includes(str(r.tone, 10)) ? (str(r.tone, 10) as CalloutValue["tone"]) : "info";
      const value = { tone, title: str(r.title, 120), body: str(r.body, 3000) };
      return value.title || value.body ? value : undefined;
    }
    case "table": {
      const r = rec(raw);
      if (!Array.isArray(r.rows)) throw `${field.label} must be a table`;
      const rows = r.rows.slice(0, 100).map((row) => (Array.isArray(row) ? row.slice(0, 20).map((cell) => str(cell, 300)) : []));
      const width = Math.max(1, ...rows.map((row) => row.length));
      const padded = rows.map((row) => [...row, ...Array(width - row.length).fill("")]);
      return padded.some((row) => row.some(Boolean)) ? { header: r.header !== false, rows: padded } : undefined;
    }
    case "form": {
      const r = rec(raw);
      const formId = str(r.formId, 64);
      return { formId: /^[\w-]{1,64}$/.test(formId) ? formId : null, heading: str(r.heading, 120) };
    }
    case "price": {
      const r = typeof raw === "number" ? { amount: raw } : rec(raw);
      const amount = Number(r.amount);
      if (!Number.isFinite(amount) || amount < 0) throw `${field.label} must be an amount`;
      return { amount: Math.round(amount * 100) / 100, currency: /^[A-Z]{3}$/.test(str(r.currency, 3)) ? str(r.currency, 3) : "NGN" };
    }
  }
}

/**
 * Cleans an item's values against the collection's fields. Unknown keys are dropped. Required fields are
 * enforced only when publishing (drafts can be half-written).
 */
export function validateItemData(fields: CmsField[], raw: unknown, options: { publishing: boolean }): { ok: true; data: Record<string, unknown> } | { ok: false; errors: Record<string, string> } {
  const input = rec(raw);
  const data: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    try {
      const value = cleanValue(field, input[field.key]);
      if (value !== undefined) data[field.key] = value;
      if (options.publishing && field.required && (value === undefined || isEmptyValue(field.type, value))) errors[field.key] = `${field.label} is needed before you publish`;
    } catch (message) {
      errors[field.key] = typeof message === "string" ? message : `${field.label} isn't valid`;
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

// ─── Item status ─────────────────────────────────────────────────────────────

export const ITEM_STATUSES = ["draft", "published", "scheduled"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Shoppers see published items, and scheduled ones once their time has come. */
export function isItemLive(item: { status: string; publishAt: Date | string | null }, now = new Date()) {
  if (item.status === "published") return true;
  if (item.status === "scheduled" && item.publishAt) return new Date(item.publishAt).getTime() <= now.getTime();
  return false;
}

/** Prisma-style where clause for live items (kept here so the rule lives in one place). */
export function liveItemWhere(now = new Date()) {
  return { OR: [{ status: "published" }, { status: "scheduled", publishAt: { lte: now } }] };
}

/** The rich text fields of an item, first one first (the "main" body for SEO checks and excerpts). */
export function mainRichField(fields: CmsField[]) {
  return fields.find((field) => field.type === "richText") ?? null;
}

export function emptyRich(): RichValue {
  return { json: EMPTY_DOC, html: "" };
}

// ─── Legacy blog posts ───────────────────────────────────────────────────────

export interface LegacyBlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  status: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Posts stored in StorePage(slug "blog").content.posts before collections existed. */
export function readLegacyPosts(content: unknown): LegacyBlogPost[] {
  const posts = rec(content).posts;
  if (!Array.isArray(posts)) return [];
  return posts
    .filter((post) => post && typeof post === "object" && typeof (post as LegacyBlogPost).title === "string")
    .map((post) => {
      const p = post as Partial<LegacyBlogPost>;
      return {
        id: String(p.id ?? ""),
        title: String(p.title ?? "").trim() || "Untitled post",
        slug: String(p.slug ?? ""),
        excerpt: String(p.excerpt ?? ""),
        bodyMarkdown: String(p.bodyMarkdown ?? ""),
        metaTitle: String(p.metaTitle ?? ""),
        metaDescription: String(p.metaDescription ?? ""),
        keywords: Array.isArray(p.keywords) ? p.keywords.map(String) : [],
        status: p.status === "published" ? "published" : "draft",
        wordCount: Number(p.wordCount) || 0,
        createdAt: String(p.createdAt ?? ""),
        updatedAt: String(p.updatedAt ?? ""),
      };
    })
    .filter((post) => post.id);
}

/** The CMS item a legacy post becomes (everything kept: body, summary, search details, keywords, dates). */
export function legacyPostToItem(post: LegacyBlogPost, takenSlugs: Iterable<string>) {
  const slug = !slugError(post.slug) ? post.slug : uniqueSlug(post.title, takenSlugs);
  const created = Date.parse(post.createdAt);
  const updated = Date.parse(post.updatedAt);
  return {
    legacyId: post.id,
    title: post.title.slice(0, 200),
    slug,
    status: post.status === "published" ? "published" : "draft",
    excerpt: post.excerpt.slice(0, 500),
    data: { body: richValue(post.bodyMarkdown), ...(post.keywords.length ? { tags: post.keywords.slice(0, 30) } : {}) },
    seo: { metaTitle: post.metaTitle.slice(0, 70), metaDescription: post.metaDescription.slice(0, 320), focusKeyword: post.keywords[0] ?? "" },
    createdAt: Number.isFinite(created) ? new Date(created) : new Date(),
    publishedAt: post.status === "published" ? new Date(Number.isFinite(updated) ? updated : Date.now()) : null,
  };
}

// ─── JSON-LD type by template ────────────────────────────────────────────────

export function schemaTypeFor(template: string) {
  switch (template) {
    case "blog": return "BlogPosting";
    case "recipe": return "Recipe";
    case "course": return "Course";
    case "faq": return "FAQPage";
    case "events": return "Event";
    case "team": return "ProfilePage";
    default: return "Article";
  }
}
