import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured, getAnthropicClient, getOpenAIClient, PEGGY_CLAUDE_MODEL, providerOrder, REX_OPENAI_MODEL } from "@/lib/ai/client";
import { meterAi } from "@/lib/ai/usage";
import { db } from "@/lib/db/client";
import { mergeBrandSettings } from "@/lib/workspace";
import { mergeOnboardingMemory, type StoreOnboardingMemory } from "@/lib/onboarding-memory";
import type { ResponseInputContent } from "openai/resources/responses/responses";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Rex during onboarding: reads the seller's message and uploads, replies, and saves durable memory.
// Tries the preferred provider and falls back to the other one on a missing key, an error or a refusal.
interface RexChatBody {
  message?: string;
  memory?: Partial<StoreOnboardingMemory>;
  documentNames?: string[];
  documentText?: string;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;

async function readRequest(req: NextRequest) {
  if (req.headers.get("content-type")?.includes("multipart/form-data")) {
    const form = await req.formData();
    let memory: Partial<StoreOnboardingMemory> = {};
    try {
      memory = JSON.parse(String(form.get("memory") ?? "{}")) as Partial<StoreOnboardingMemory>;
    } catch {
      memory = {};
    }
    return {
      body: { message: String(form.get("message") ?? ""), memory } satisfies RexChatBody,
      files: form.getAll("files").filter((item): item is File => item instanceof File).slice(0, MAX_FILES),
    };
  }
  return {
    body: (await req.json().catch(() => ({}))) as RexChatBody,
    files: [] as File[],
  };
}

async function filePayload(file: File) {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is larger than 10 MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  return { file, base64: bytes.toString("base64") };
}

function extractJsonObject(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as {
      reply?: string;
      memoryPatch?: Partial<StoreOnboardingMemory>;
      suggestedVibes?: string[];
      nextQuestion?: string;
    };
  } catch {
    return null;
  }
}

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const { body, files } = await readRequest(req);
  const message = body.message?.trim() ?? "";
  if (!message && !body.documentText?.trim() && !files.length) {
    return NextResponse.json({ error: { message: "Message, image, voice note, or document is required." } }, { status: 400 });
  }

  let uploads: Awaited<ReturnType<typeof filePayload>>[];
  try {
    uploads = await Promise.all(files.map(filePayload));
  } catch (error) {
    return NextResponse.json({ error: { message: error instanceof Error ? error.message : "Could not read that upload." } }, { status: 400 });
  }

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, brandSettings: true },
  });

  const currentMemory = mergeOnboardingMemory(
    store?.brandSettings && typeof store.brandSettings === "object"
      ? ((store.brandSettings as Record<string, unknown>).onboardingMemory as StoreOnboardingMemory | undefined)
      : undefined,
    body.memory ?? {},
  );

  const uploadedNames = [...(body.documentNames ?? []), ...files.map((file) => file.name)];
  const docContext = body.documentText?.trim() ? `\n\nDocument excerpt:\n${body.documentText.slice(0, 12000)}` : "";
  const preferredName = user.name.trim().split(/\s+/)[0] || user.name;

  const system = `You are Rex, Shopinbos' live AI onboarding and store builder assistant. The signed-in user's name is ${JSON.stringify(user.name)}; naturally call them ${JSON.stringify(preferredName)} when a name is useful, and never substitute a demo name. Inspect every attached image or document carefully. Extract durable seller memory so the user is not asked twice. Carry their real category, products, audience, location, brand voice, visual references, and brief into your recommendations. Never pretend you inspected an attachment you could not read. Reply specifically and conversationally in 1-3 short sentences. Return JSON only with keys: reply, memoryPatch, suggestedVibes, nextQuestion. memoryPatch may include preferredName, category, businessDescription, storeName, customerProfile.who, customerProfile.vibe, documentNotes, documentNames. Do not invent personal or business data.`;
  const userInput = `Current durable memory:\n${JSON.stringify(currentMemory)}\n\nUser message:\n${message || "Please read my uploads and use them for my store."}${docContext}`;

  async function viaOpenAI(): Promise<string | null> {
    const openai = getOpenAIClient();
    if (!openai) return null;
    const content: ResponseInputContent[] = [{ type: "input_text", text: userInput }];
    for (const upload of uploads) {
      if (upload.file.type.startsWith("image/")) {
        content.push({ type: "input_image", detail: "high", image_url: `data:${upload.file.type};base64,${upload.base64}` });
      } else {
        content.push({ type: "input_file", filename: upload.file.name, file_data: `data:${upload.file.type || "application/octet-stream"};base64,${upload.base64}` });
      }
    }
    const response = await openai.responses.create({
      model: REX_OPENAI_MODEL,
      instructions: system,
      input: [{ role: "user", content }],
    });
    return response.output_text?.trim() || null;
  }

  async function viaAnthropic(): Promise<string | null> {
    const anthropic = getAnthropicClient();
    if (!anthropic) return null;
    const content: ContentBlockParam[] = [{ type: "text", text: userInput }];
    const unsupported: string[] = [];
    for (const upload of uploads) {
      if (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(upload.file.type)) {
        content.push({ type: "image", source: { type: "base64", media_type: upload.file.type as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: upload.base64 } });
      } else if (upload.file.type === "application/pdf") {
        content.push({ type: "document", title: upload.file.name, source: { type: "base64", media_type: "application/pdf", data: upload.base64 } });
      } else if (upload.file.type.startsWith("text/") || /\.(txt|md|csv)$/i.test(upload.file.name)) {
        content.push({ type: "document", title: upload.file.name, source: { type: "text", media_type: "text/plain", data: Buffer.from(upload.base64, "base64").toString("utf8").slice(0, 50000) } });
      } else {
        unsupported.push(upload.file.name);
      }
    }
    if (unsupported.length) {
      content.push({ type: "text", text: `The following files could not be decoded by this provider: ${unsupported.join(", ")}. Be transparent about that and ask for PDF, text, or an image version.` });
    }
    const response = await anthropic.messages.create({
      model: PEGGY_CLAUDE_MODEL,
      // Thinking counts against this too: room for it and a full reply.
      max_tokens: 16000,
      system,
      output_config: { effort: "low" },
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") return null;
    return response.content.map((block) => (block.type === "text" ? block.text : "")).join("").trim() || null;
  }

  if (!aiConfigured()) {
    return NextResponse.json({ error: { code: "AI_OFF", message: "Rex's AI isn't switched on yet (no OPENAI_API_KEY or ANTHROPIC_API_KEY)." } }, { status: 503 });
  }
  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

  let raw = "";
  for (const provider of providerOrder()) {
    try {
      raw = (provider === "openai" ? await viaOpenAI() : await viaAnthropic()) ?? "";
    } catch (error) {
      console.error(`[ai/onboarding-rex] ${provider} failed`, error);
    }
    if (raw) break;
  }
  if (!raw) {
    return NextResponse.json({ error: { code: "AI_FAILED", message: "Rex couldn't reach the AI right now. Try again in a moment." } }, { status: 502 });
  }
  const parsed = extractJsonObject(raw);
  const fallbackReply = raw.replace(/\{[\s\S]*\}/, "").trim() || "Got it. I'll remember that and use it while building your store.";
  const memoryPatch: Partial<StoreOnboardingMemory> = {
    preferredName: user.name,
    ...(parsed?.memoryPatch ?? {}),
    ...(uploadedNames.length ? { documentNames: uploadedNames } : {}),
    updatedAt: new Date().toISOString(),
  };

  if (store) {
    await db.store.update({
      where: { id: store.id },
      data: {
        brandSettings: mergeBrandSettings(store.brandSettings, {
          onboardingMemory: mergeOnboardingMemory(currentMemory, memoryPatch),
        }),
      },
    });
  }

  return NextResponse.json({
    reply: parsed?.reply ?? fallbackReply,
    memoryPatch,
    suggestedVibes: parsed?.suggestedVibes ?? [],
    nextQuestion: parsed?.nextQuestion,
  });
});
