import "server-only";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import {
  applySuggestion,
  assistantSystemPrompt,
  assistantUserPrompt,
  ruleBasedSuggestion,
  withSuggestionDefaults,
  type AssistantFormState,
  type SuggestionInput,
} from "@shared/product-assistant";
import { ProductSuggestionSchema, type ProductAssistantRequest } from "@shared/product-variants-schema";
import { normalizeVariants } from "@shared/product-variants";
import { peggyExampleEn, sizesFit } from "@shared/peggy-opener";

// Peggy's product assistant: the seller's words (and maybe a photo) plus the form as it is now, in; proposed form
// changes out, as structured JSON checked with zod (ProductSuggestionSchema). Nothing is saved here: the form shows
// "Peggy suggests: …" with Apply / Change. Claude or OpenAI through aiText; without either, a small rule-based reader
// still understands "sizes S M L XL, red and black, L and XL cost 2000 more".

export interface AssistantReply {
  message: string;
  suggestion: SuggestionInput | null;
  changes: string[];
  source: "ai" | "rules" | "none";
}

export function formStateFrom(form: ProductAssistantRequest["form"]): AssistantFormState {
  return {
    name: form.name,
    description: form.description,
    productType: form.productType,
    basePrice: form.basePrice,
    options: form.options,
    variants: normalizeVariants(form.variants),
    details: form.details,
    customDetails: [],
  };
}

/** The model's reply as a checked suggestion, or null when it isn't valid. */
export function parseSuggestion(raw: string | null): SuggestionInput | null {
  const json = firstJsonObject(raw);
  if (!json) return null;
  const parsed = ProductSuggestionSchema.safeParse(withSuggestionDefaults(json));
  return parsed.success ? (parsed.data as SuggestionInput) : null;
}

export async function suggestProductChanges(input: ProductAssistantRequest): Promise<AssistantReply> {
  const state = formStateFrom(input.form);
  const photo = input.photoUrl ?? null;
  const result = await aiText({
    system: assistantSystemPrompt(),
    messages: [
      ...input.history.filter((turn) => turn.content.trim()).slice(-8),
      { role: "user", content: assistantUserPrompt(state, photo ? `${input.message}\n(The seller sent a photo of the product: use what you can see, but never guess prices.)` : input.message) },
    ],
    images: photo ? [photo] : undefined,
    fast: !photo,
    maxTokens: 6000,
  }).catch(() => null);

  let suggestion = result ? parseSuggestion(result.text) : null;
  let source: AssistantReply["source"] = suggestion ? "ai" : "none";
  if (!suggestion) {
    suggestion = ruleBasedSuggestion(input.message, state);
    if (suggestion) source = "rules";
  }
  if (!suggestion) {
    return {
      message: result
        ? `I couldn't work that out. Try something like: ${peggyExampleEn(state.productType)}.`
        : sizesFit(state.productType)
          ? "I can't reach my brain just now. Try again in a moment, or tell me sizes and prices like: S, M, L, XL, XL costs ₦2,000 more."
          : "I can't reach my brain just now. Try again in a moment.",
      suggestion: null,
      changes: [],
      source: "none",
    };
  }
  const { changes } = applySuggestion(state, suggestion);
  return { message: suggestion.message, suggestion: changes.length ? suggestion : null, changes, source };
}
