import "server-only";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import {
  CONTENT_BATCH,
  CONTENT_BATCH_WITH_PHOTOS,
  contentSystemPrompt,
  contentUserPrompt,
  parseContentReply,
  pickFields,
  ruleBasedContent,
  withRuleFallback,
  type ContentField,
  type ContentSource,
  type ContentSuggestion,
} from "@shared/product-content";

// Peggy writing product content for a batch of products: one AI call per few products (with their photos when
// asked), every reply checked by shared/product-content. Products the AI didn't answer for, or every product when
// no AI is configured, get the rule-based suggestion. Callers meter AI use before calling (one unit per call).

export interface ContentResult {
  suggestions: ContentSuggestion[];
  /** "ai" when at least one product got AI content; "rules" when everything came from the rules. */
  source: "ai" | "rules";
  aiCalls: number;
}

/** How many AI calls a batch of products needs. */
export function contentCallCount(items: ContentSource[], usePhotos: boolean) {
  const size = usePhotos && items.some((item) => item.imageUrl) ? CONTENT_BATCH_WITH_PHOTOS : CONTENT_BATCH;
  return Math.ceil(items.length / size);
}

export async function suggestProductContent(
  items: ContentSource[],
  opts: { storeName: string; fields: readonly ContentField[]; categories?: string[]; instruction?: string | null; usePhotos?: boolean; useAi?: boolean },
): Promise<ContentResult> {
  const rules = items.map((item) => ruleBasedContent(item, opts.fields));
  if (opts.useAi === false || !aiConfigured() || !items.length) return { suggestions: rules, source: "rules", aiCalls: 0 };

  const usePhotos = Boolean(opts.usePhotos);
  const size = usePhotos && items.some((item) => item.imageUrl) ? CONTENT_BATCH_WITH_PHOTOS : CONTENT_BATCH;
  const out: ContentSuggestion[] = [...rules];
  let aiCalls = 0;
  let anyAi = false;
  for (let start = 0; start < items.length; start += size) {
    const batch = items.slice(start, start + size).map((item) => ({ ...item, hasPhoto: usePhotos && Boolean(item.imageUrl && /^https:\/\//.test(item.imageUrl)) }));
    const images = batch.filter((item) => item.hasPhoto).map((item) => item.imageUrl!);
    aiCalls++;
    const result = await aiText({
      system: contentSystemPrompt(opts.storeName),
      prompt: contentUserPrompt(batch, opts.fields, { categories: opts.categories, instruction: opts.instruction }),
      images: images.length ? images : undefined,
      fast: !images.length,
      maxTokens: 8000,
    }).catch(() => null);
    const parsed = parseContentReply(firstJsonObject(result?.text ?? null), batch.length);
    parsed.forEach((suggestion, i) => {
      if (!suggestion) return;
      anyAi = true;
      out[start + i] = withRuleFallback(pickFields(suggestion, opts.fields), rules[start + i]!);
    });
  }
  return { suggestions: out, source: anyAi ? "ai" : "rules", aiCalls };
}
