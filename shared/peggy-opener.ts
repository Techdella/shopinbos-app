// What Peggy says first on the product page, built from the form as it is: the product's type decides what she
// asks for (brand, model and warranty for electronics; storage and condition for phones; sizes and colours for
// clothes) and only what's still empty is asked. Pure, so tests/peggy-opener.test.mjs runs it with a fake t().
// Used by src/app/components/product-form/ProductPeggy.tsx; the words live in the "productTypes" namespace (option
// names have no translation keys, so they show as the seller sees them on the form: "storage", "colour").

import type { AssistantFormState } from "./product-assistant.ts";
import { productTypeDef } from "./product-types.ts";
import productTypesEn from "./i18n/messages/productTypes/en.ts";

type T = (key: string, vars?: Record<string, string | number>) => string;

export interface PeggyOpener {
  greeting: string;
  /** Tap-to-fill examples, at most 2. */
  examples: string[];
  placeholder: string;
  /** English context for voice typing ("Electronics & appliances: brand, model, condition, price"). */
  voiceContext: string;
}

/** Types whose versions aren't what a seller thinks of first (a TV's "Size" is its screen): ask for details only. */
const DETAILS_FIRST = new Set(["electronics", "books", "digital", "service"]);
const MAX_THINGS = 3;

const filled = (value: unknown) => (typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined);

/** "Brand" → "brand", but "RAM" and "NAFDAC number" keep their capitals. */
function lower(label: string) {
  return label.length > 1 && label[1] === label[1].toUpperCase() && label[1] !== label[1].toLowerCase() ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

function list(items: string[], t: T) {
  if (items.length < 2) return items[0] ?? "";
  return t("peggy.list", { rest: items.slice(0, -1).join(", "), last: items[items.length - 1] });
}

/** What's still worth asking for, most useful first: the type's empty details, then the price, then versions. */
export function missingThings(state: AssistantFormState): Array<{ kind: "field" | "option"; key: string } | { kind: "price" }> {
  if (!state.productType) return [];
  const def = productTypeDef(state.productType);
  const things: Array<{ kind: "field" | "option"; key: string } | { kind: "price" }> = def.fields
    .filter((field) => !filled(state.details[field.key]))
    .slice(0, MAX_THINGS)
    .map((field) => ({ kind: "field" as const, key: field.key }));
  if (state.basePrice === null || state.basePrice <= 0) things.push({ kind: "price" });
  const hasVersions = state.options.some((option) => option.name.trim() && option.values.length);
  if (!hasVersions && !DETAILS_FIRST.has(def.key) && things.length < MAX_THINGS) {
    for (const option of def.options.slice(0, MAX_THINGS - things.length)) things.push({ kind: "option", key: option.name });
  }
  return things.slice(0, MAX_THINGS + 1);
}

export function peggyOpener(state: AssistantFormState, t: T): PeggyOpener {
  const describe = filled(state.description) ? t("peggy.exampleImprove") : t("peggy.example2");
  if (!state.productType) {
    return {
      greeting: t("peggy.greetNone"),
      examples: [t("peggy.example.none"), describe],
      placeholder: t("peggy.placeholderAny"),
      voiceContext: "what a product is, its price and the versions it comes in",
    };
  }
  const def = productTypeDef(state.productType);
  const things = missingThings(state);
  const words = things.map((thing) => (thing.kind === "price" ? t("peggy.price") : lower(thing.kind === "field" ? t(`field.${thing.key}`) : thing.key)));
  const english = things.map((thing) => (thing.kind === "price" ? "price" : thing.kind === "field" ? def.fields.find((field) => field.key === thing.key)?.label ?? thing.key : thing.key));
  return {
    greeting: words.length ? t("peggy.greetType", { things: list(words, t) }) : t("peggy.greetDone"),
    examples: [t(`peggy.example.${def.key}`), describe],
    placeholder: words.length ? t("peggy.placeholderFor", { things: words.slice(0, 2).join(", ") }) : t("peggy.placeholderAny"),
    voiceContext: `${def.label}: ${(english.length ? english : def.fields.map((field) => field.label)).join(", ")}`,
  };
}

/** Peggy's "try something like …" for this type, in English (the product assistant's replies are English). */
export function peggyExampleEn(productType: string | null) {
  const messages = productTypesEn as Record<string, string>;
  return messages[`peggy.example.${productType ? productTypeDef(productType).key : "none"}`];
}

/** Types whose versions the no-AI reader understands (sizes, colours and prices). */
export function sizesFit(productType: string | null) {
  return !productType || !DETAILS_FIRST.has(productTypeDef(productType).key);
}
