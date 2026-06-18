import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { getAnthropicClient, getOpenAIClient, PEGGY_CLAUDE_MODEL, REX_OPENAI_MODEL } from "@/lib/ai/client";
import { db } from "@/lib/db/client";
import { mergeBrandSettings } from "@/lib/workspace";
import { mergeOnboardingMemory, type StoreOnboardingMemory } from "@/lib/onboarding-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// OpenAI-backed Rex route. The actual SDK construction is centralized in getOpenAIClient()
// instead of using `new OpenAI` here, and the default Rex model remains gpt-5.4-mini.
interface RexChatBody {
  message?: string;
  memory?: Partial<StoreOnboardingMemory>;
  documentNames?: string[];
  documentText?: string;
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
  const body = (await req.json().catch(() => ({}))) as RexChatBody;
  const message = body.message?.trim() ?? "";
  if (!message && !body.documentText?.trim()) {
    return NextResponse.json({ error: { message: "Message or document text is required." } }, { status: 400 });
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

  const docContext = body.documentText?.trim()
    ? `\n\nUploaded document names: ${(body.documentNames ?? []).join(", ") || "unnamed"}\nDocument excerpt:\n${body.documentText.slice(0, 12000)}`
    : "";

  const system =
    "You are Rex, Shopinbos' AI onboarding and store builder assistant. Extract durable seller memory from every message so users are not asked twice. If the user says they sell food, skincare, fashion, electronics, home goods, or any category, carry that context into brand voice, palette direction, logo direction, templates, and store build guidance. Reply conversationally in 1-3 short sentences, then return JSON only with keys: reply, memoryPatch, suggestedVibes, nextQuestion. memoryPatch may include category, businessDescription, storeName, customerProfile.who, customerProfile.vibe, documentNotes, documentNames. Do not invent personal data.";
  const userInput = `Current durable memory:\n${JSON.stringify(currentMemory)}\n\nUser message:\n${message}${docContext}`;

  let raw = "";
  const openai = getOpenAIClient();
  if (openai) {
    const response = await openai.responses.create({
      model: REX_OPENAI_MODEL,
      input: [
        { role: "system", content: system },
        { role: "user", content: userInput },
      ],
    });
    raw = response.output_text ?? "";
  } else {
    const anthropic = getAnthropicClient();
    if (!anthropic) {
      return NextResponse.json({ error: { message: "OPENAI_API_KEY or ANTHROPIC_API_KEY is required for Rex." } }, { status: 500 });
    }
    const response = await anthropic.messages.create({
      model: PEGGY_CLAUDE_MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: userInput }],
    });
    raw = response.content[0]?.type === "text" ? response.content[0].text : "";
  }
  const parsed = extractJsonObject(raw);
  const fallbackReply = raw.replace(/\{[\s\S]*\}/, "").trim() || "Got it. I'll remember that and use it while building your store.";
  const memoryPatch: Partial<StoreOnboardingMemory> = {
    ...(parsed?.memoryPatch ?? {}),
    ...(body.documentNames?.length ? { documentNames: body.documentNames } : {}),
    updatedAt: new Date().toISOString(),
  };

  if (store) {
    await db.store.update({
      where: { id: store.id },
      data: {
        brandSettings: mergeBrandSettings(store.brandSettings, {
          onboardingMemory: memoryPatch,
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
