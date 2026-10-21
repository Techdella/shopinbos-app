import "server-only";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import { getAnthropicClient, getOpenAIClient, PEGGY_CLAUDE_MODEL, providerOrder, REX_OPENAI_MODEL } from "@/lib/ai/client";
import { firstJsonObject } from "@/lib/ai/text";
import { normalizeExtracted, type ExtractedReview } from "./pure";

// Reads a customer review off a screenshot (a WhatsApp chat, an Instagram comment, a marketplace review)
// with whichever vision model is configured. The seller checks and edits the result before it is saved.

const PROMPT = `This is a screenshot of a customer's message or review about a small shop.
Read it and return JSON only: {"authorName": string (the customer's name or handle as shown, "" if not visible), "rating": integer 1-5 or null (only if stars or a score are visible), "text": string (the customer's words exactly as written, without the shop's replies, timestamps or UI labels), "date": string ISO date or "" if not visible, "source": one of "whatsapp","instagram","facebook","tiktok","x","google","marketplace","other"}.
Never invent words, names or ratings that are not in the image. If there are several customer messages, join only that customer's messages with a newline.`;

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export async function extractReviewFromImage(image: { base64: string; mediaType: ImageMediaType }): Promise<{ draft: ExtractedReview; read: boolean }> {
  for (const provider of providerOrder()) {
    try {
      let raw = "";
      if (provider === "openai") {
        const openai = getOpenAIClient();
        if (!openai) continue;
        const content: ResponseInputContent[] = [
          { type: "input_text", text: PROMPT },
          { type: "input_image", detail: "high", image_url: `data:${image.mediaType};base64,${image.base64}` },
        ];
        const response = await openai.responses.create({ model: REX_OPENAI_MODEL, input: [{ role: "user", content }] });
        raw = response.output_text ?? "";
      } else {
        const anthropic = getAnthropicClient();
        if (!anthropic) continue;
        const content: ContentBlockParam[] = [
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.base64 } },
          { type: "text", text: PROMPT },
        ];
        const response = await anthropic.messages.create({ model: PEGGY_CLAUDE_MODEL, max_tokens: 2000, messages: [{ role: "user", content }] });
        raw = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
      }
      const parsed = firstJsonObject(raw);
      if (parsed) return { draft: normalizeExtracted(parsed), read: true };
    } catch (error) {
      console.error(`[reviews] screenshot reading via ${provider} failed`, error);
    }
  }
  return { draft: normalizeExtracted(null), read: false };
}
