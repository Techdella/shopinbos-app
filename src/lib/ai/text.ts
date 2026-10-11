import "server-only";
import { getAnthropicClient, getOpenAIClient, PEGGY_CLAUDE_MODEL, PEGGY_OPENAI_MODEL } from "@/lib/ai/client";

/** One short text completion from whichever AI provider is configured; null when none is or both fail. */
export async function generateText(prompt: string, system?: string): Promise<string | null> {
  const openai = getOpenAIClient();
  if (openai) {
    try {
      const response = await openai.responses.create({
        model: PEGGY_OPENAI_MODEL,
        ...(system ? { instructions: system } : {}),
        input: prompt,
      });
      if (response.output_text?.trim()) return response.output_text;
    } catch (error) {
      console.error("[ai/text] OpenAI failed", error);
    }
  }
  const anthropic = getAnthropicClient();
  if (anthropic) {
    try {
      const response = await anthropic.messages.create({
        model: PEGGY_CLAUDE_MODEL,
        max_tokens: 900,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("").trim();
      if (text) return text;
    } catch (error) {
      console.error("[ai/text] Anthropic failed", error);
    }
  }
  return null;
}

/** First {...} object in a model reply, parsed; null when there isn't valid JSON. */
export function firstJsonObject(raw: string | null): Record<string, unknown> | null {
  const match = raw?.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const value = JSON.parse(match[0]);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
