import "server-only";

import {
  CHIP_MODEL,
  CLAUDE_FAST_MODEL,
  getAnthropicClient,
  getOpenAIClient,
  OPENAI_IMAGE_MODEL,
  withImageModel,
  PEGGY_CLAUDE_MODEL,
  PEGGY_OPENAI_MODEL,
  providerOrder,
  REX_OPENAI_MODEL,
} from "@/lib/ai/client";
import { anthropicTools as peggyClaudeTools, openaiTools as peggyOpenAITools } from "@/lib/ai/peggy/agent";
import { anthropicTools as rexClaudeTools, openaiTools as rexOpenAITools } from "@/lib/ai/rex/agent";

// Admin → Settings → "Check AI": one small real call per job, shaped exactly like Rex's and Peggy's own calls
// (same models, the full tool lists, asked to use a tool), so a wrong key, a model the account can't use or a
// tool the provider rejects shows up here instead of in a seller's chat. Costs a fraction of a cent; the
// optional picture check makes one small low-quality image (about 1 US cent) and throws it away.

export type AiCheckRow = {
  id: string;
  provider: "anthropic" | "openai";
  label: string;
  model: string;
  status: "ok" | "failed" | "skipped";
  detail: string;
  ms?: number;
};

const OPTIONS = { timeout: 45_000, maxRetries: 0 };
const PROMPT = "Health check from the Shopinbos admin. Call the tool now.";

/** A provider error in words an owner can act on. */
export function explainAiError(error: unknown, model: string): string {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : 0;
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.replace(/\s+/g, " ").slice(0, 300);
  if (status === 401) return "The key was rejected. Copy it again from the provider's dashboard into Vercel and redeploy.";
  if (status === 403) return `This key isn't allowed to use ${model}. Check the key's project permissions. (${message})`;
  if (status === 404) return `This account can't use the model ${model}. Change the model setting in Vercel or ask the provider for access. (${message})`;
  if (status === 429) return `Out of credit or over the rate limit. Add credit or raise the limit on the provider's billing page. (${message})`;
  if (status === 400) return `The provider refused the request: ${message}`;
  if (status >= 500) return `The provider had a problem on their side. Try again in a minute. (${message})`;
  return message || "No answer.";
}

async function timed(row: Omit<AiCheckRow, "status" | "detail" | "ms">, run: () => Promise<string>): Promise<AiCheckRow> {
  const started = Date.now();
  try {
    return { ...row, status: "ok", detail: await run(), ms: Date.now() - started };
  } catch (error) {
    return { ...row, status: "failed", detail: explainAiError(error, row.model), ms: Date.now() - started };
  }
}

const skipped = (row: Omit<AiCheckRow, "status" | "detail">, detail: string): AiCheckRow => ({ ...row, status: "skipped", detail });

export async function runAiCheck({ images = false }: { images?: boolean } = {}): Promise<{ order: Array<"anthropic" | "openai">; rows: AiCheckRow[] }> {
  const anthropic = getAnthropicClient();
  const openai = getOpenAIClient();
  const jobs: Array<Promise<AiCheckRow>> = [];

  const claudeTool = (id: string, label: string, model: string, tools: ReturnType<typeof rexClaudeTools>, tool: string) => {
    const row = { id, provider: "anthropic" as const, label, model };
    if (!anthropic) return Promise.resolve(skipped(row, "No ANTHROPIC_API_KEY."));
    return timed(row, async () => {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 4000,
        system: `${PROMPT} Call ${tool}.`,
        tools,
        // Exactly like Rex and Peggy: this model doesn't allow forcing a tool, so it chooses.
        tool_choice: { type: "auto" },
        output_config: { effort: "medium" },
        messages: [{ role: "user", content: `${PROMPT} Call ${tool}.` }],
      }, OPTIONS);
      const used = response.content.some((block) => block.type === "tool_use");
      return `Works: ${tools.length} tools accepted${used ? " and it used one" : ""}.`;
    });
  };
  const gptTool = (id: string, label: string, model: string, tools: ReturnType<typeof rexOpenAITools>, tool: string) => {
    const row = { id, provider: "openai" as const, label, model };
    if (!openai) return Promise.resolve(skipped(row, "No OPENAI_API_KEY."));
    return timed(row, async () => {
      const response = await openai.responses.create({
        model,
        instructions: PROMPT,
        input: PROMPT,
        tools,
        tool_choice: { type: "function", name: tool },
        max_output_tokens: 1024,
      }, OPTIONS);
      if (!response.output.some((item) => item.type === "function_call")) throw new Error("Answered without using a tool.");
      return `Works: ${tools.length} tools accepted.`;
    });
  };

  jobs.push(claudeTool("rex-claude", "Rex on Claude", CHIP_MODEL, rexClaudeTools(), "store_health"));
  jobs.push(claudeTool("peggy-claude", "Peggy on Claude", PEGGY_CLAUDE_MODEL, peggyClaudeTools(), "setup_status"));
  {
    const row = { id: "writing-claude", provider: "anthropic" as const, label: "Quick writing on Claude", model: CLAUDE_FAST_MODEL };
    jobs.push(
      anthropic
        ? timed(row, async () => {
            const response = await anthropic.messages.create({
              model: CLAUDE_FAST_MODEL,
              max_tokens: 200,
              output_config: { effort: "low" },
              messages: [{ role: "user", content: "Reply with the single word: ready" }],
            }, OPTIONS);
            const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("").trim();
            if (!text) throw new Error("Empty reply.");
            return "Works.";
          })
        : Promise.resolve(skipped(row, "No ANTHROPIC_API_KEY.")),
    );
  }
  jobs.push(gptTool("rex-openai", "Rex on OpenAI", REX_OPENAI_MODEL, rexOpenAITools(), "store_health"));
  jobs.push(gptTool("peggy-openai", "Peggy on OpenAI", PEGGY_OPENAI_MODEL, peggyOpenAITools(), "setup_status"));
  {
    const row = { id: "images-openai", provider: "openai" as const, label: "Pictures and logos (OpenAI only)", model: OPENAI_IMAGE_MODEL };
    if (!openai) jobs.push(Promise.resolve(skipped(row, "No OPENAI_API_KEY, so Rex can't make pictures or logos. Everything else still works on Claude.")));
    else if (!images) jobs.push(Promise.resolve(skipped(row, "Tick \"Test pictures too\" to make one small test picture (about 1 US cent).")));
    else
      jobs.push(
        timed(row, async () => {
          let used = OPENAI_IMAGE_MODEL;
          const result = await withImageModel((model) => {
            used = model;
            return openai.images.generate({ model, prompt: "A plain mint-green circle on a white background.", size: "1024x1024", n: 1 }, { timeout: 90_000, maxRetries: 0 });
          });
          if (!result.data?.[0]?.b64_json && !result.data?.[0]?.url) throw new Error("No picture came back.");
          return used === OPENAI_IMAGE_MODEL ? "Works." : `Works on ${used}. ${OPENAI_IMAGE_MODEL} isn't available: change OPENAI_IMAGE_MODEL in Vercel.`;
        }),
      );
  }

  return { order: providerOrder(), rows: await Promise.all(jobs) };
}
