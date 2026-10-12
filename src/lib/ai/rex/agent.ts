import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { db } from "@/lib/db/client";
import { CHIP_MODEL, getAnthropicClient, getOpenAIClient, providerOrder, REX_OPENAI_MODEL } from "@/lib/ai/client";
import { isOwnImageUrl } from "@/lib/ai/images";
import { computeStoreHealth } from "@/lib/store-health";
import { naira } from "@shared/onboarding";
import { isRexWriteTool, parseRexToolInput, providerSchema, REX_TOOL_NAMES, REX_TOOL_SPECS, type RexToolName, type RexTurn } from "./agent-pure";
import type { RexCard, RexReply } from "./cards";
import { loadStudioStore } from "./studio-edit.server";
import { loadHealthFacts, studioDraft, themeNameFor } from "./studio.server";
import { MarketingError, REX_TOOL_RUNNERS, RexToolError, type RexToolContext } from "./tools";

// Rex's agent loop over Claude (Messages API, manual tool loop) and OpenAI (Responses API, function tools),
// shaped like Peggy's (src/lib/ai/peggy/agent.ts). The preferred provider runs first; if it fails or refuses
// before Rex has changed or made anything, the other provider gets the whole conversation again.

const MAX_STEPS = 8;

export const REX_AGENT_INSTRUCTIONS = `You are Rex, the creative studio assistant inside Shopinbos, an AI commerce platform for small businesses in Nigeria and across Africa. You work for one seller and their one online store. You design their store, make pictures, logos and product videos, write their product words and set up their marketing, using your tools.

Your tools:
- Pictures: edit_product_photo (sharper and brighter, white studio background, or a custom edit), remove_background, lifestyle_photo, generate_product_image, generate_logo. Results appear for the seller with buttons (Save to product, Use as logo); you never save them yourself.
- Video: make_product_video prepares a reel from a product's photos with captions and a voiceover; the seller opens it in the video studio to record and save it.
- Store design (DRAFT only, saved as a version with undo): edit_store_section for changes to words, sections, pages, colours and fonts; rebuild_section to redo a section or page from scratch; switch_theme; list_themes to show the themes; open_preview to show the seller their store.
- Words: write_product_copy shows a new product description with an Apply button; nothing changes until the seller applies it.
- Marketing: create_segment, create_campaign (saved as a draft, never sent), create_automation (saved switched off).
- Email design: draft_email_template designs an email (photo, products, discount code, button) saved as a draft template the seller edits in the email builder; improve_email_copy rewrites a saved template into a new draft copy.
- Content (like Wix CMS): cms_create_collection sets up a collection (blog, size guide, recipe book, course, FAQ, lookbook, team, events, or blank with the fields the seller describes); cms_write_item writes an item in one as a draft for the seller to publish in Content (/home/cms).
- Look up: list_products (ids, photos, descriptions), store_health (score and the biggest gaps).

How to work:
- Do what the seller asked with the right tool. If something essential is missing (which product, which photo), ask one short question instead of guessing. Use list_products to find a product before working on its photos or words.
- Photos the seller attached are listed in the context; edit those or the product's own photos only.
- After you change the store, say what changed in one or two sentences and that it is in the preview; shoppers see nothing until they press Publish. Never say you published anything.
- Never say you did something a tool did not confirm. If a tool returns an error, explain it simply and say what the seller can do next.
- Don't invent prices, discounts, reviews, delivery times, materials or awards.
- You cannot change prices, stock, orders, delivery fees, payments or domains. For those, point to /products, /home/orders, /home/settings or Peggy at /home/peggy.

Style: warm, brief and practical, in plain Nigerian English (Pidgin when the seller writes in Pidgin). Short paragraphs; no tables, no emojis, no headings. Don't repeat what the cards already show (image links, full copy); refer to them.`;

function rexContextBlock(context: Record<string, unknown>, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  return `Today is ${today}, Lagos time.\n\nThe store right now:\n${JSON.stringify(context)}`;
}

interface RunState {
  ctx: RexToolContext;
  cards: RexCard[];
  wrote: boolean;
}

class ProviderRefused extends Error {}

async function runTool(state: RunState, name: string, rawInput: unknown): Promise<{ content: string; isError: boolean }> {
  if (!(name in REX_TOOL_SPECS)) return { content: `Unknown tool ${name}.`, isError: true };
  const tool = name as RexToolName;
  const parsed = parseRexToolInput(tool, rawInput);
  if (!parsed.ok) return { content: parsed.error, isError: true };
  try {
    const runner = REX_TOOL_RUNNERS[tool] as (ctx: RexToolContext, input: unknown) => ReturnType<(typeof REX_TOOL_RUNNERS)[RexToolName]>;
    const output = await runner(state.ctx, parsed.input);
    if (output.card) state.cards.push(output.card);
    // Image tools spend the seller's allowance, so a retry on the other provider would make them twice.
    if (isRexWriteTool(tool) || REX_TOOL_SPECS[tool].kind === "image") state.wrote = true;
    return { content: output.content, isError: false };
  } catch (error) {
    if (error instanceof RexToolError || error instanceof MarketingError) return { content: error.message, isError: true };
    console.error(`[rex] tool ${tool} failed`, error);
    return { content: "That didn't work because of a problem on our side. Nothing was changed by this step. Tell the seller to try again shortly.", isError: true };
  }
}

function fallbackText(state: RunState, reason: string) {
  return state.cards.length ? `Here is what I have so far; it's in the cards above.\n\n${reason}` : reason;
}

// ─── Claude ──────────────────────────────────────────────────────────────────

let claudeTools: Anthropic.Tool[] | null = null;
function anthropicTools(): Anthropic.Tool[] {
  claudeTools ??= REX_TOOL_NAMES.map((name) => ({
    name,
    description: REX_TOOL_SPECS[name].description,
    input_schema: providerSchema(REX_TOOL_SPECS[name].schema) as Anthropic.Tool.InputSchema,
    strict: true,
  }));
  return claudeTools;
}

async function viaClaude(client: Anthropic, context: string, turns: RexTurn[], photos: string[], state: RunState): Promise<string> {
  const messages: Anthropic.MessageParam[] = turns.map((turn, index) => {
    const last = index === turns.length - 1;
    if (!last || !photos.length) return { role: turn.role, content: turn.content };
    return {
      role: turn.role,
      content: [...photos.map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })), { type: "text" as const, text: turn.content }],
    };
  });
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.messages.create({
      model: CHIP_MODEL,
      max_tokens: 16000,
      system: [
        { type: "text", text: REX_AGENT_INSTRUCTIONS, cache_control: { type: "ephemeral" } },
        { type: "text", text: context },
      ],
      tools: anthropicTools(),
      tool_choice: { type: "auto" },
      output_config: { effort: "medium" },
      messages,
    });

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
function openaiTools(): OpenAI.Responses.FunctionTool[] {
  gptTools ??= REX_TOOL_NAMES.map((name) => ({
    type: "function",
    name,
    description: REX_TOOL_SPECS[name].description,
    parameters: providerSchema(REX_TOOL_SPECS[name].schema),
    strict: true,
  }));
  return gptTools;
}

async function viaOpenAI(client: OpenAI, context: string, turns: RexTurn[], photos: string[], state: RunState): Promise<string> {
  const input: OpenAI.Responses.ResponseInputItem[] = turns.map((turn, index) => {
    const last = index === turns.length - 1;
    if (!last || !photos.length || turn.role !== "user") return { role: turn.role, content: turn.content };
    return {
      role: "user",
      content: [...photos.map((url) => ({ type: "input_image" as const, image_url: url, detail: "auto" as const })), { type: "input_text" as const, text: turn.content }],
    };
  });
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await client.responses.create({
      model: REX_OPENAI_MODEL,
      instructions: `${REX_AGENT_INSTRUCTIONS}\n\n${context}`,
      input,
      tools: openaiTools(),
      tool_choice: "auto",
      max_output_tokens: 8000,
    });

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

const URL_PATTERN = /https:\/\/[^\s)\]"',]+/g;

/** Rex's answer to a conversation (oldest turn first, ending with the seller's message). */
export async function runRex(userId: string, turns: RexTurn[], imageUrls: string[]): Promise<RexReply | { error: string; status?: number }> {
  const anthropic = getAnthropicClient();
  const openai = getOpenAIClient();
  if (!anthropic && !openai) return { error: "Rex's AI isn't switched on yet. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to the server.", status: 503 };

  const store = await loadStudioStore(userId);
  if (!store) return { error: "Set up your store first.", status: 404 };
  const newPhotos = imageUrls.filter(isOwnImageUrl);
  // Photos the seller attached earlier travel inside the conversation text; only our own storage counts.
  const earlier = turns.flatMap((turn) => turn.content.match(URL_PATTERN) ?? []).filter(isOwnImageUrl);
  const attachments = Array.from(new Set([...newPhotos, ...earlier]));

  const { draft, saved } = studioDraft(store);
  const [facts, products] = await Promise.all([
    loadHealthFacts(store, draft),
    db.storeProduct.findMany({
      where: { storeId: store.id, status: { not: "archived" } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, name: true, retailPrice: true, images: true, status: true },
    }),
  ]);
  const health = computeStoreHealth(facts);
  const context = rexContextBlock({
    store: { name: store.name, location: [store.city, store.country].filter(Boolean).join(", "), description: store.description?.slice(0, 400) ?? null, hasLogo: Boolean(store.logoUrl) },
    design: { theme: themeNameFor(draft.templateId, draft.templateName), designed: saved, pages: draft.pages.map((page) => page.title) },
    health: { score: health.score, topGaps: health.missing.slice(0, 4).map((item) => item.label) },
    products: { published: facts.products, newest: products.map((p) => ({ id: p.id, name: p.name, price: naira(p.retailPrice), status: p.status, photos: p.images.filter(Boolean).length })) },
    attachedPhotosThisMessage: newPhotos,
    photosAttachedEarlier: attachments.filter((url) => !newPhotos.includes(url)),
  });

  const history = turns.slice(0, -1).map((turn) => ({ role: turn.role, content: turn.content.slice(0, 4000) }));
  const ctx: RexToolContext = { userId, storeId: store.id, storeName: store.name, attachments, newPhotos, history, draft: null, versions: null };
  const state: RunState = { ctx, cards: [], wrote: false };
  const reply = (text: string): RexReply => ({ text, cards: state.cards, draft: ctx.draft, versions: ctx.versions });

  for (const provider of providerOrder()) {
    // Seeing the photos helps; if the provider can't fetch them, try once more with their links only.
    for (const photos of newPhotos.length ? [newPhotos, []] : [[]]) {
      try {
        if (provider === "anthropic" && anthropic) return reply(await viaClaude(anthropic, context, turns, photos, state));
        if (provider === "openai" && openai) return reply(await viaOpenAI(openai, context, turns, photos, state));
        break;
      } catch (error) {
        console.error(`[rex] ${provider} failed${photos.length ? " (with photos)" : ""}`, error);
        // Once Rex has changed or made something, re-running could do it twice.
        if (state.wrote) return reply(fallbackText(state, "I lost my connection before I could finish. Check the cards above and ask me again if needed."));
        if (error instanceof ProviderRefused) break;
      }
    }
  }
  return { error: "Rex couldn't answer just now. Nothing was changed; try again in a moment.", status: 503 };
}
