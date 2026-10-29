// What Rex may change inside a section: exactly the fields the builder's inspector shows for it
// (src/components/builder/editor/section-schema.ts), so Rex can do whatever a seller can do by hand and nothing
// else. Every value is checked against the field: an option from its list, a number in range, a hex colour, an
// https picture, a list of known page ids. Anything else is dropped, never forced. Pure, unit-tested in
// tests/rex-section-fields.test.mjs.

import { allFields, fieldVisible, sectionSchema, type ChoiceOption, type ItemField, type SchemaField } from "../../../components/builder/editor/section-schema.ts";
import type { RendererKind } from "../../../components/builder/editor/editor-logic.ts";
import type { TemplateSectionNode } from "../../store-templates/types.ts";

const HEX = /^#[0-9a-fA-F]{6}$/;
const HTTPS_URL = /^https:\/\/\S+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
/** Field types Rex can set. The rest need the seller's own pick (products, collections, the menu editor, the logo). */
const SETTABLE = new Set(["text", "textarea", "number", "segmented", "select", "cards", "toggle", "color", "datetime", "pages", "list", "image", "media", "order", "repeater"]);
const MAX_TEXT = 1500;

type Field = SchemaField & { target?: { scope: "copy" | "settings" | "styles" | "background"; key: string } };

/** The fields of a section Rex may set, by id (style tab included: e.g. spacing). */
export function rexFields(section: Pick<TemplateSectionNode, "kind">, renderer: RendererKind, themeId: string): Field[] {
  const seen = new Set<string>();
  return (allFields(sectionSchema(section.kind, renderer, themeId)) as Field[]).filter((field) => {
    if (!SETTABLE.has(field.type) || seen.has(field.id)) return false;
    seen.add(field.id);
    return true;
  });
}

const optionList = (options: ChoiceOption[]) => options.map((option) => option.value);

function itemFieldHint(field: ItemField) {
  if (field.type === "select" || field.type === "segmented") return `${field.key}: ${optionList(field.options).join("|")}`;
  if (field.type === "media") return `${field.key}: https picture`;
  if (field.type === "number") return `${field.key}: ${field.min}-${field.max}`;
  return field.key;
}

/** One line per field for Rex's prompt: id, what it takes, and the value now (when set). */
export function describeRexFields(section: TemplateSectionNode, renderer: RendererKind, themeId: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Only what the panel shows for the section as it is now; after a layout change the new layout's fields show.
  for (const field of rexFields(section, renderer, themeId).filter((entry) => fieldVisible(section, entry))) {
    let hint: string;
    switch (field.type) {
      case "segmented":
      case "select":
      case "cards":
        hint = optionList(field.options).join("|");
        break;
      case "number":
        hint = `number ${field.min}-${field.max}`;
        break;
      case "toggle":
        hint = "true|false";
        break;
      case "color":
        hint = "#RRGGBB";
        break;
      case "image":
        hint = "https picture";
        break;
      case "media":
        hint = `up to ${field.max} https pictures`;
        break;
      case "pages":
      case "order":
        hint = `list of ${optionList(field.options).join("|")}`;
        break;
      case "list":
        hint = "list of words";
        break;
      case "repeater":
        hint = `up to ${field.max} items {${field.fields.map(itemFieldHint).join(", ")}}`;
        break;
      case "datetime":
        hint = "ISO date";
        break;
      default:
        hint = "text";
    }
    // Words already show in the section's "copy", so text fields only name themselves.
    const now = field.target && field.type !== "text" && field.type !== "textarea" ? currentValue(section, field.target) : undefined;
    out[field.id] = now === undefined || now === "" ? hint : `${hint} (now ${JSON.stringify(now).slice(0, 60)})`;
  }
  return out;
}

function currentValue(section: TemplateSectionNode, target: NonNullable<Field["target"]>): unknown {
  if (target.scope === "copy") return (section.blocks.find((block) => block.type === "copy")?.content ?? {})[target.key];
  if (target.scope === "settings") return section.settings?.[target.key];
  if (target.scope === "styles") return section.styles?.[target.key];
  return (section.background as Record<string, unknown> | undefined)?.[target.key];
}

function cleanItem(raw: unknown, fields: ItemField[]): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = input[field.key];
    if (value === undefined || value === null) continue;
    if (field.type === "select" || field.type === "segmented") {
      if (typeof value === "string" && optionList(field.options).includes(value)) out[field.key] = value;
    } else if (field.type === "media") {
      if (typeof value === "string" && HTTPS_URL.test(value.trim())) out[field.key] = value.trim().slice(0, 2000);
    } else if (field.type === "color") {
      if (typeof value === "string" && HEX.test(value.trim())) out[field.key] = value.trim();
    } else if (field.type === "number") {
      const number = Number(value);
      if (Number.isFinite(number)) out[field.key] = String(Math.min(field.max, Math.max(field.min, number)));
    } else if (field.type === "link") {
      if (typeof value === "string" && (HTTPS_URL.test(value.trim()) || /^[a-z][a-z0-9-]{0,40}$/.test(value.trim()))) out[field.key] = value.trim().slice(0, 500);
    } else if (typeof value === "string" || typeof value === "number") {
      out[field.key] = String(value).trim().slice(0, 800);
    }
  }
  return Object.keys(out).length ? out : null;
}

/** A value checked against its field, or undefined when it doesn't fit. */
function cleanValue(field: Field, value: unknown): unknown {
  switch (field.type) {
    case "text":
    case "textarea":
      return typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, MAX_TEXT) : undefined;
    case "number": {
      const number = Number(value);
      return Number.isFinite(number) ? Math.min(field.max, Math.max(field.min, number)) : undefined;
    }
    case "segmented":
    case "select":
    case "cards":
      return typeof value === "string" && optionList(field.options).includes(value) ? value : undefined;
    case "toggle":
      return typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : undefined;
    case "color":
      return typeof value === "string" && (HEX.test(value.trim()) || value.trim() === "") ? value.trim() : undefined;
    case "datetime":
      return typeof value === "string" && ISO_DATE.test(value.trim()) ? value.trim() : undefined;
    case "image":
      return typeof value === "string" && (HTTPS_URL.test(value.trim()) || value.trim() === "") ? value.trim().slice(0, 2000) : undefined;
    case "pages":
    case "order": {
      if (!Array.isArray(value)) return undefined;
      const allowed = optionList(field.options);
      return Array.from(new Set(value.filter((entry): entry is string => typeof entry === "string" && allowed.includes(entry))));
    }
    case "list":
      return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim().slice(0, 80)).slice(0, 20) : undefined;
    case "media":
      return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && HTTPS_URL.test(entry.trim())).map((entry) => entry.trim()).slice(0, field.max) : undefined;
    case "repeater":
      return Array.isArray(value) ? value.map((entry) => cleanItem(entry, field.fields)).filter((entry): entry is Record<string, unknown> => entry !== null).slice(0, field.max) : undefined;
    default:
      return undefined;
  }
}

function writeValue(section: TemplateSectionNode, target: NonNullable<Field["target"]>, value: unknown) {
  if (target.scope === "copy") {
    let block = section.blocks.find((entry) => entry.type === "copy");
    if (!block) {
      block = { id: `${section.id}-copy`, type: "copy", content: {} };
      section.blocks = [block, ...section.blocks];
    }
    block.content = { ...block.content, [target.key]: value };
  } else if (target.scope === "settings") {
    section.settings = { ...(section.settings ?? {}), [target.key]: value };
  } else if (target.scope === "styles") {
    section.styles = { ...(section.styles ?? {}), [target.key]: value } as TemplateSectionNode["styles"];
  } else {
    section.background = { ...((section.background as Record<string, unknown> | undefined) ?? {}), [target.key]: value } as TemplateSectionNode["background"];
  }
}

/**
 * Applies `changes` ({fieldId: value}) to `section` in place. Returns the ids actually changed. Pictures for a
 * `media` field go on section.items[i].imageUrl (keeping each entry's other words); a repeater replaces the items.
 */
export function applyRexFieldChanges(section: TemplateSectionNode, changes: Record<string, unknown>, renderer: RendererKind, themeId: string): string[] {
  const fields = new Map(rexFields(section, renderer, themeId).map((field) => [field.id, field]));
  const changed: string[] = [];
  for (const [id, raw] of Object.entries(changes)) {
    const field = fields.get(id);
    if (!field) continue;
    const value = cleanValue(field, raw);
    if (value === undefined) continue;
    const before = JSON.stringify(section);
    if (field.type === "media") {
      const urls = value as string[];
      const items = [...(section.items ?? [])];
      urls.forEach((url, index) => {
        items[index] = { ...(items[index] ?? {}), imageUrl: url };
      });
      section.items = items;
    } else if (field.type === "repeater") {
      section.items = value as Array<Record<string, unknown>>;
    } else if (field.target) {
      writeValue(section, field.target, value);
    } else {
      continue;
    }
    if (JSON.stringify(section) !== before) changed.push(id);
  }
  return changed;
}
