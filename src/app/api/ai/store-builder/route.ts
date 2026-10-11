import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { withSeller } from "@/lib/auth/middleware";
import {
  CHIP_MODEL,
  DEFAULT_STORE_CONFIG,
  getAnthropicClient,
  getOpenAIClient,
  providerOrder,
  REX_OPENAI_MODEL,
  type StoreConfig,
} from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { storeBuilderSystemPrompt, type BrandContext, type TemplateContext } from "@/lib/ai/rex/prompts";
import { createVisibleTextFilter, parseBuilderReply } from "@/lib/ai/rex/stream-tags";
import { validateStoreConfig } from "@/lib/ai/rex/store-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Rex's streaming store builder. NDJSON events:
//   {type:"status", stage, message}  progress (thinking / writing / design / switching provider)
//   {type:"token", text}             visible reply text (machine blocks never leak into it)
//   {type:"store", data}             the validated StoreConfig
//   {type:"chips", data}             follow-up suggestions
//   {type:"error", code, message}    something went wrong (incl. a design that couldn't be read)
//   {type:"done", provider}

interface ApiChatMessage {
  role: "user" | "assistant";
  content: string;
  imageDataUrls?: string[];
}

type Provider = "anthropic" | "openai";
type AnthropicImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const MAX_TURNS = 24;
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 7_000_000; // ~5 MB of base64
const IMAGE_DATA_URL = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/;

function cleanImages(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.filter((url): url is string => typeof url === "string" && url.length <= MAX_IMAGE_CHARS && IMAGE_DATA_URL.test(url));
}

/** Prior turns plus the new one, trimmed, alternating cleanly and ending with the user's turn. */
function normaliseMessages(messages: unknown, currentImages: string[], docNames: string[]): ApiChatMessage[] {
  const list = Array.isArray(messages) ? messages : [];
  const turns: ApiChatMessage[] = [];
  for (const raw of list.slice(-MAX_TURNS)) {
    if (!raw || typeof raw !== "object") continue;
    const message = raw as Record<string, unknown>;
    const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : null;
    const content = typeof message.content === "string" ? message.content.trim().slice(0, 8000) : "";
    const images = role === "user" ? cleanImages(message.imageDataUrls) : [];
    if (!role || (!content && !images.length)) continue;
    const previous = turns[turns.length - 1];
    if (previous && previous.role === role) {
      previous.content = `${previous.content}\n\n${content}`.trim();
      previous.imageDataUrls = [...(previous.imageDataUrls ?? []), ...images];
    } else {
      turns.push({ role, content, imageDataUrls: images });
    }
  }
  while (turns.length && turns[0].role === "assistant") turns.shift();
  const last = turns[turns.length - 1];
  if (last?.role === "user") {
    if (currentImages.length) last.imageDataUrls = currentImages;
    if (docNames.length) last.content = `${last.content}\n\n[Documents attached: ${docNames.join(", ")}]`;
    if (!last.content) last.content = "Use the attached image(s) for my store.";
  }
  // Only the most recent images are sent; older turns keep their text.
  let budget = MAX_IMAGES;
  for (let i = turns.length - 1; i >= 0; i--) {
    const images = turns[i].imageDataUrls ?? [];
    turns[i].imageDataUrls = images.slice(0, budget);
    budget = Math.max(0, budget - images.length);
  }
  return turns;
}

function toAnthropicMessages(turns: ApiChatMessage[]): Anthropic.MessageParam[] {
  return turns.map((turn) => {
    const images = turn.imageDataUrls ?? [];
    if (!images.length) return { role: turn.role, content: turn.content };
    const parts: Anthropic.ContentBlockParam[] = images.map((dataUrl) => {
      const match = dataUrl.match(IMAGE_DATA_URL)!;
      return { type: "image", source: { type: "base64", media_type: match[1] as AnthropicImageMediaType, data: match[2] } };
    });
    parts.push({ type: "text", text: turn.content });
    return { role: turn.role, content: parts };
  });
}

function toOpenAIInput(turns: ApiChatMessage[]): ResponseInputItem[] {
  return turns.map((turn): ResponseInputItem => {
    const images = turn.imageDataUrls ?? [];
    if (turn.role === "assistant" || !images.length) return { role: turn.role, content: turn.content };
    return {
      role: "user",
      content: [
        { type: "input_text", text: turn.content },
        ...images.map((url) => ({ type: "input_image" as const, image_url: url, detail: "auto" as const })),
      ],
    };
  });
}

class ProviderError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

async function streamAnthropic(system: string, turns: ApiChatMessage[], onDelta: (text: string) => void) {
  const client = getAnthropicClient();
  if (!client) throw new ProviderError("Claude isn't configured", "NOT_CONFIGURED");
  const stream = client.messages.stream({
    model: CHIP_MODEL,
    max_tokens: 16000,
    system,
    output_config: { effort: "medium" },
    messages: toAnthropicMessages(turns),
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") onDelta(event.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new ProviderError("Claude declined this request.", "REFUSAL");
  if (final.stop_reason === "max_tokens") throw new ProviderError("Claude ran out of room before finishing.", "TRUNCATED");
}

async function streamOpenAI(system: string, turns: ApiChatMessage[], onDelta: (text: string) => void) {
  const openai = getOpenAIClient();
  if (!openai) throw new ProviderError("OpenAI isn't configured", "NOT_CONFIGURED");
  const stream = await openai.responses.create({
    model: REX_OPENAI_MODEL,
    instructions: system,
    input: toOpenAIInput(turns),
    max_output_tokens: 8000,
    stream: true,
  });
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") onDelta(event.delta);
    else if (event.type === "response.refusal.delta") throw new ProviderError("OpenAI declined this request.", "REFUSAL");
    else if (event.type === "response.failed") throw new ProviderError(event.response.error?.message ?? "OpenAI failed", "FAILED");
    else if (event.type === "error") throw new ProviderError(event.message ?? "OpenAI stream error", "FAILED");
    else if (event.type === "response.incomplete") throw new ProviderError("OpenAI stopped before finishing.", "TRUNCATED");
  }
}

function available(): Provider[] {
  return providerOrder().filter((provider) => (provider === "anthropic" ? getAnthropicClient() : getOpenAIClient()));
}

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => null)) as {
    messages?: unknown;
    store?: StoreConfig;
    brandContext?: BrandContext | null;
    templateContext?: TemplateContext | null;
    currentImageDataUrls?: unknown;
    currentDocNames?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Send the conversation as JSON." } }, { status: 400 });

  const docNames = Array.isArray(body.currentDocNames)
    ? body.currentDocNames.filter((name): name is string => typeof name === "string").map((name) => name.slice(0, 120)).slice(0, 10)
    : [];
  const turns = normaliseMessages(body.messages, cleanImages(body.currentImageDataUrls).slice(0, MAX_IMAGES), docNames);
  if (!turns.length) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: "Tell Rex what to build first." } }, { status: 400 });
  }

  const providers = available();
  if (!providers.length) {
    return NextResponse.json(
      { error: { code: "AI_OFF", message: "Rex's AI isn't switched on yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to the server, then try again." } },
      { status: 503 },
    );
  }

  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

  const baseStore = validateStoreConfig(body.store ?? DEFAULT_STORE_CONFIG, DEFAULT_STORE_CONFIG);
  const currentStore = baseStore.ok ? baseStore.config : DEFAULT_STORE_CONFIG;
  const system = storeBuilderSystemPrompt({
    brandContext: body.brandContext,
    templateContext: body.templateContext,
    currentStore,
    docNames,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      let lastError: unknown = null;

      for (const [index, provider] of providers.entries()) {
        const filter = createVisibleTextFilter();
        let sentText = false;
        let sentDesignStatus = false;
        send({ type: "status", stage: "thinking", provider, message: index === 0 ? "Rex is thinking" : "Switching to the backup AI" });
        try {
          const onDelta = (delta: string) => {
            const visible = filter.push(delta);
            if (visible) {
              if (!sentText) send({ type: "status", stage: "writing", provider, message: "Rex is replying" });
              sentText = true;
              send({ type: "token", text: visible });
            } else if (!sentDesignStatus && filter.fullText.includes("<store_config")) {
              sentDesignStatus = true;
              send({ type: "status", stage: "design", provider, message: "Rex is laying out your store" });
            }
          };
          if (provider === "anthropic") await streamAnthropic(system, turns, onDelta);
          else await streamOpenAI(system, turns, onDelta);

          const tail = filter.flush();
          if (tail.trim()) send({ type: "token", text: tail });

          const reply = parseBuilderReply(filter.fullText);
          if (reply.config) {
            const validated = validateStoreConfig(reply.config, currentStore);
            if (validated.ok) send({ type: "store", data: validated.config });
            else send({ type: "error", code: "CONFIG_INVALID", message: `${validated.error} Ask Rex to try again.` });
          } else if (reply.configError) {
            send({ type: "error", code: "CONFIG_PARSE", message: `${reply.configError} Ask Rex to try again.` });
          }
          send({ type: "chips", data: reply.chips ?? ["Refine hero text", "Adjust colors", "Add a product", "Looks good"] });
          send({ type: "done", provider });
          controller.close();
          return;
        } catch (error) {
          lastError = error;
          console.error(`[ai/store-builder] ${provider} failed`, error);
          // Once text has reached the seller, switching providers would repeat it; report instead.
          if (sentText) break;
        }
      }

      const message = lastError instanceof ProviderError && lastError.code === "TRUNCATED"
        ? "Rex's reply was cut off before the store design finished. Try a shorter request."
        : "Rex couldn't reach the AI right now. Please try again in a moment.";
      send({ type: "error", code: "AI_FAILED", message });
      send({ type: "done" });
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
});
