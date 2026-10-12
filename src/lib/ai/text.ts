import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import {
  CLAUDE_FAST_MODEL,
  getAnthropicClient,
  getOpenAIClient,
  PEGGY_CLAUDE_MODEL,
  PEGGY_OPENAI_MODEL,
  providerOrder,
} from "@/lib/ai/client";

// Text generation for Rex and Peggy over both providers. Each call tries the preferred provider and falls
// back to the other on a missing key, an error or a refusal, so one working key is enough.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AiTextOptions {
  system?: string;
  /** A single prompt, or a whole conversation (oldest first, ending with the user's turn). */
  prompt?: string;
  messages?: ChatTurn[];
  /** Short, high-volume jobs (copy for a field, a caption): the fast Claude model at low effort. */
  fast?: boolean;
  /** Upper bound on the reply. Claude also spends tokens thinking, so keep this generous. */
  maxTokens?: number;
}

export interface AiTextResult {
  text: string;
  provider: "anthropic" | "openai";
}

// One writing call never holds a request for long: fast jobs get 30 seconds, others a minute, one retry.
const requestOptions = (options: AiTextOptions) => ({ timeout: options.fast ? 30_000 : 60_000, maxRetries: 1 });

function turns(options: AiTextOptions): ChatTurn[] {
  if (options.messages?.length) return options.messages.filter((turn) => turn.content.trim());
  return [{ role: "user", content: options.prompt ?? "" }];
}

async function viaAnthropic(options: AiTextOptions): Promise<string | null> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return null;
  const response = await anthropic.messages.create({
    model: options.fast ? CLAUDE_FAST_MODEL : PEGGY_CLAUDE_MODEL,
    max_tokens: options.maxTokens ?? 16000,
    ...(options.system ? { system: options.system } : {}),
    output_config: { effort: options.fast ? "low" : "medium" },
    messages: turns(options) as Anthropic.MessageParam[],
  }, requestOptions(options));
  if (response.stop_reason === "refusal") return null;
  const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("").trim();
  return text || null;
}

async function viaOpenAI(options: AiTextOptions): Promise<string | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;
  const response = await openai.responses.create({
    model: PEGGY_OPENAI_MODEL,
    ...(options.system ? { instructions: options.system } : {}),
    input: turns(options).map((turn) => ({ role: turn.role, content: turn.content })),
    max_output_tokens: options.maxTokens ?? 4000,
  }, requestOptions(options));
  return response.output_text?.trim() || null;
}

/** Text from the first provider that answers; null when none is configured or all fail. */
export async function aiText(options: AiTextOptions): Promise<AiTextResult | null> {
  for (const provider of providerOrder()) {
    try {
      const text = provider === "anthropic" ? await viaAnthropic(options) : await viaOpenAI(options);
      if (text) return { text, provider };
    } catch (error) {
      console.error(`[ai/text] ${provider} failed`, error);
    }
  }
  return null;
}

/** One short text completion (kept for existing callers). */
export async function generateText(prompt: string, system?: string): Promise<string | null> {
  return (await aiText({ prompt, system, fast: true }))?.text ?? null;
}

/**
 * The first complete {...} object in a model reply, parsed. Scans for a balanced object (respecting
 * strings), so prose or a second object around it doesn't break parsing. Null when there's no valid JSON.
 */
export function firstJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  for (let start = raw.indexOf("{"); start !== -1; start = raw.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < raw.length; i++) {
      const char = raw[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try {
          const value = JSON.parse(raw.slice(start, i + 1));
          if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
        } catch {
          // Not valid JSON from this brace; try the next one.
        }
        break;
      }
    }
  }
  return null;
}

/** Like firstJsonObject, for replies that should be a JSON array. */
export function firstJsonArray(raw: string | null): unknown[] | null {
  if (!raw) return null;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
