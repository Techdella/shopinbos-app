// What Rex and Peggy need to set up collections and draft items, pure parts: picking a template from a
// description, the field guide the writer model fills in, and turning its JSON into item values. The model
// only writes words (text, rich text, numbers, tables, stats, tags, info boxes); pictures, videos, links,
// products and forms are left for the seller so nothing is invented.

import { COLLECTION_TEMPLATES, FIELD_TYPES, type CmsField, type FieldType, type TemplateId } from "./fields.ts";

const KEYWORDS: Array<[TemplateId, RegExp]> = [
  ["size_guide", /\bsiz(e|ing)\b|measure|fit guide|size chart/i],
  ["recipe", /recipe|cook|dish|meal|ingredient|kitchen|food/i],
  ["course", /course|lesson|class|tutorial|training|module|academy|learn/i],
  ["faq", /\bfaqs?\b|question|q ?& ?a|help cent(er|re)/i],
  ["lookbook", /lookbook|look ?book|outfit|styl(e|ing)|collection shoot|editorial/i],
  ["team", /\bteam\b|staff|people|founder|about us|our crew/i],
  ["events", /event|pop-?up|launch party|workshop|meet-?up|exhibition|class schedule/i],
  ["blog", /blog|article|post|news|journal|stories|guide/i],
];

/** The closest starter template for a description like "a recipe book for my spices". */
export function pickTemplate(description: string): TemplateId {
  for (const [template, pattern] of KEYWORDS) if (pattern.test(description)) return template;
  return "blank";
}

/** Field types a writer model may fill; the rest need the seller (uploads, real links, products, forms). */
export const AI_WRITABLE: ReadonlySet<FieldType> = new Set<FieldType>(["richText", "text", "number", "stats", "date", "boolean", "choice", "tags", "callout", "table"]);

const SHAPES: Partial<Record<FieldType, string>> = {
  richText: "Markdown string (## subheadings, lists, **bold**, | tables |)",
  text: "plain string",
  number: "number",
  stats: '[{"label": "...", "value": "..."}]',
  date: '"YYYY-MM-DD"',
  boolean: "true or false",
  tags: '["tag", ...]',
  callout: '{"tone": "info" | "tip" | "success" | "warning", "title": "...", "body": "..."}',
  table: '{"header": true, "rows": [["Size", "Bust (cm)"], ["S", "84"]]}',
};

/** Lines describing each writable field, for the writer's prompt. */
export function fieldGuide(fields: CmsField[]) {
  return fields
    .filter((field) => AI_WRITABLE.has(field.type))
    .map((field) => {
      const shape = field.type === "choice" ? `${field.multiple ? "array of" : "one of"}: ${(field.options ?? []).map((option) => JSON.stringify(option)).join(", ")}` : SHAPES[field.type];
      return `- "${field.key}" (${field.label}${field.required ? ", required" : ""}): ${shape}${field.help ? `. ${field.help}` : ""}`;
    })
    .join("\n");
}

/** Keeps only values for writable fields that exist on the collection. */
export function aiValues(fields: CmsField[], raw: unknown): Record<string, unknown> {
  const values = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (!AI_WRITABLE.has(field.type) || !(field.key in values)) continue;
    out[field.key] = values[field.key];
  }
  return out;
}

/** Extra fields the assistant asks for on top of a template ("add a difficulty level"). */
export function extraFieldsFrom(raw: Array<{ label: string; type: string; options?: string[] | null }> | null | undefined) {
  return (raw ?? [])
    .filter((field) => (FIELD_TYPES as readonly string[]).includes(field.type))
    .slice(0, 12)
    .map((field) => ({ label: field.label, type: field.type as FieldType, ...(field.options?.length ? { options: field.options } : {}) }));
}

export const TEMPLATE_CHOICES = COLLECTION_TEMPLATES.map((template) => template.id);
