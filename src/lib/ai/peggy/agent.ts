import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { db } from "@/lib/db/client";
import { getAnthropicClient, getOpenAIClient, PEGGY_CLAUDE_MODEL, PEGGY_OPENAI_MODEL, providerOrder } from "@/lib/ai/client";
import { buildSellerSnapshot } from "./context";
import { loadBrandContext } from "@/lib/ai/brand-context.server";
import { brandContextForAi } from "@shared/brand-context";
import { PEGGY_INSTRUCTIONS, peggyContextBlock } from "./prompt";
import {
  issuedConfirmationCodes,
  parseToolInput,
  presentedConfirmationCode,
  providerSchema,
  PEGGY_TOOL_NAMES,
  PEGGY_TOOL_SPECS,
  type PeggyToolName,
  type PeggyTurn,
} from "./pure";
import { isWriteTool, PEGGY_TOOL_RUNNERS, ToolError, type PeggyAction, type PeggyToolContext } from "./tools";

// Peggy's agent loop over Claude (Messages API, manual tool loop) and OpenAI (Responses API, function tools).
// The preferred provider runs first; if it fails or refuses before Peggy has changed anything, the other
// provider gets the whole conversation again.

const MAX_STEPS = 8;
// The chat route allows 120 seconds; stop calling the model in time to answer, and never let one call hang.
const RUN_BUDGET_MS = 100_000;
const CALL_TIMEOUT_MS = 60_000;
const MIN_CALL_MS = 8_000;

export interface PeggyReply {
  text: string;
  actions: PeggyAction[];
  provider?: "anthropic" | "openai";
}

interface RunState {
  ctx: PeggyToolContext | null;
  actions: PeggyAction[];
  wrote: boolean;
  /** Confirmation codes handed out during this request; they only work after the seller's next message. */
  issued: Set<string>;
  deadline: number;
}

class ProviderRefused extends Error {}
class OutOfTime extends Error {}

/** Request options for one model call: what is left of the budget, capped, with one retry at most. */
function callOptions(state: RunState) {
  const left = state.deadline - Date.now();
  if (left < MIN_CALL_MS) throw new OutOfTime();
  return { timeout: Math.min(CALL_TIMEOUT_MS, left), maxRetries: 1 };
}

/** Runs one tool call: validates the input with zod, runs it in the seller's store, never throws. */
async function runTool(state: RunState, name: string, rawInput: unknown): Promise<{ content: string; isError: boolean }> {
  if (!(name in PEGGY_TOOL_SPECS)) return { content: `Unknown tool ${name}.`, isError: true };
  const tool = name as PeggyToolName;
  if (!state.ctx) return { content: "This seller has no shop yet, so there is nothing to look up or change. Point them to /onboarding/rex to set one up.", isError: true };
  const parsed = parseToolInput(tool, rawInput);
  if (!parsed.ok) return { content: parsed.error, isError: true };
  const code = presentedConfirmationCode(parsed.input);
  if (code && state.issued.has(code)) {
    return { content: "Not done. That confirmation code was only just given in this same turn, so the seller hasn't answered yet. Show them what will happen and wait for their reply.", isError: true };
  }
  try {
    const runner = PEGGY_TOOL_RUNNERS[tool] as (ctx: PeggyToolContext, input: unknown) => ReturnType<(typeof PEGGY_TOOL_RUNNERS)[PeggyToolName]>;
    const output = await runner(state.ctx, parsed.input);
    for (const issued of issuedConfirmationCodes(output.content)) state.issued.add(issued);
    if (output.action) {
      state.actions.push({ tool, summary: output.action.summary, ...(output.action.href ? { href: output.action.href } : {}) });
    }
    if (isWriteTool(tool) && output.action) state.wrote = true;
    return { content: output.content, isError: false };
  } catch (error) {
    if (error instanceof ToolError) return { content: error.message, isError: true };
    console.error(`[peggy] tool ${tool} failed`, error);
    return { content: "That didn't work because of a problem on our side. Nothing was changed by this step. Tell the seller to try again shortly.", isError: true };
  }
}

/** What Peggy says if the model stops before writing a reply: the confirmed changes, never a guess. */
function fallbackText(state: RunState, reason: string) {
  if (!state.actions.length) return reason;
  return `Here is what I did:\n${state.actions.map((action) => `- ${action.summary}`).join("\n")}\n\n${reason}`;
}

// ─── Claude ──────────────────────────────────────────────────────────────────

let claudeTools: Anthropic.Tool[] | null = null;
export function anthropicTools(): Anthropic.Tool[] {
  claudeTools ??= PEGGY_TOOL_NAMES.map((name) => ({
    name,
    description: PEGGY_TOOL_SPECS[name].description,
    input_schema: providerSchema(PEGGY_TOOL_SPECS[name].schema) as Anthropic.Tool.InputSchema,
    strict: true,
  }));
  return claudeTools;
}

async function viaClaude(client: Anthropic, context: string, turns: PeggyTurn[], state: RunState): Promise<string> {
  const messages: Anthropic.MessageParam[] = turns.map((turn) => ({ role: turn.role, content: turn.content }));
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.messages.create({
      model: PEGGY_CLAUDE_MODEL,
      max_tokens: 16000,
      system: [
        { type: "text", text: PEGGY_INSTRUCTIONS, cache_control: { type: "ephemeral" } },
        { type: "text", text: context },
      ],
      tools: anthropicTools(),
      tool_choice: { type: "auto" },
      output_config: { effort: "medium" },
      messages,
    }, callOptions(state));

    if (response.stop_reason === "refusal") {
      if (!state.wrote) throw new ProviderRefused("Claude declined");
      return fallbackText(state, "I couldn't finish the rest of that request.");
    }
    messages.push({ role: "assistant", content: response.content });
    if (response.stop_reason === "pause_turn") continue;

    const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("").trim();
    const uses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (response.stop_reason !== "tool_use" || !uses.length) {
      return text || fallbackText(state, response.stop_reason === "max_tokens" ? "My reply was cut short. Ask me again if you need more." : "Done.");
    }

    // All results for this turn go back in one user message, in order.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const use of uses) {
      const result = await runTool(state, use.name, use.input);
      results.push({ type: "tool_result", tool_use_id: use.id, content: result.content, ...(result.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  return fallbackText(state, "That took more steps than I can do at once. Tell me what to do next.");
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────

let gptTools: OpenAI.Responses.FunctionTool[] | null = null;
export function openaiTools(): OpenAI.Responses.FunctionTool[] {
  gptTools ??= PEGGY_TOOL_NAMES.map((name) => ({
    type: "function",
    name,
    description: PEGGY_TOOL_SPECS[name].description,
    parameters: providerSchema(PEGGY_TOOL_SPECS[name].schema),
    strict: true,
  }));
  return gptTools;
}

async function viaOpenAI(client: OpenAI, context: string, turns: PeggyTurn[], state: RunState): Promise<string> {
  const input: OpenAI.Responses.ResponseInputItem[] = turns.map((turn) => ({ role: turn.role, content: turn.content }));
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.responses.create({
      model: PEGGY_OPENAI_MODEL,
      instructions: `${PEGGY_INSTRUCTIONS}\n\n${context}`,
      input,
      tools: openaiTools(),
      tool_choice: "auto",
      max_output_tokens: 8000,
    }, callOptions(state));

    const calls = response.output.filter((item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call");
    if (!calls.length) {
      const text = response.output_text?.trim() ?? "";
      const refused = response.output.some((item) => item.type === "message" && item.content.some((part) => part.type === "refusal"));
      if (!text && refused && !state.wrote) throw new ProviderRefused("OpenAI declined");
      return text || fallbackText(state, "I couldn't finish the rest of that request.");
    }

    input.push(...(response.output as OpenAI.Responses.ResponseInputItem[]));
    for (const call of calls) {
      const result = await runTool(state, call.name, call.arguments);
      input.push({ type: "function_call_output", call_id: call.call_id, output: result.isError ? `Error: ${result.content}` : result.content });
    }
  }
  return fallbackText(state, "That took more steps than I can do at once. Tell me what to do next.");
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/** Peggy's answer to a conversation (oldest turn first, ending with the seller's message). */
export async function runPeggy(user: { id: string; phone?: string | null }, turns: PeggyTurn[]): Promise<PeggyReply | { error: string }> {
  const anthropic = getAnthropicClient();
  const openai = getOpenAIClient();
  if (!anthropic && !openai) return { error: "Peggy isn't connected yet. Add ANTHROPIC_API_KEY or OPENAI_API_KEY." };

  const [snapshot, store] = await Promise.all([
    buildSellerSnapshot(user.id),
    db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, currency: true } }),
  ]);
  const brand = store ? await loadBrandContext(store.id).catch(() => null) : null;
  const context = peggyContextBlock(snapshot, new Date(), brand ? brandContextForAi(brand) : null);
  const state: RunState = {
    ctx: store ? { userId: user.id, userPhone: user.phone ?? null, store } : null,
    actions: [],
    wrote: false,
    issued: new Set(),
    deadline: Date.now() + RUN_BUDGET_MS,
  };

  for (const provider of providerOrder()) {
    try {
      if (provider === "anthropic" && anthropic) {
        return { text: await viaClaude(anthropic, context, turns, state), actions: state.actions, provider };
      }
      if (provider === "openai" && openai) {
        return { text: await viaOpenAI(openai, context, turns, state), actions: state.actions, provider };
      }
    } catch (error) {
      if (error instanceof OutOfTime) {
        return { text: fallbackText(state, "That took longer than I can wait. Ask me again, or split it into smaller steps."), actions: state.actions, provider };
      }
      console.error(`[peggy] ${provider} failed`, error);
      // Once Peggy has changed something, re-running on another provider could do it twice.
      if (state.wrote) return { text: fallbackText(state, "I lost my connection before I could finish. Check the rest and ask me again if needed."), actions: state.actions, provider };
    }
  }
  return { error: "Peggy couldn't answer just now. Try again in a moment." };
}
