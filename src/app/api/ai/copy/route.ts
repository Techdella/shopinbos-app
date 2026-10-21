import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { aiText } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/ai/copy: short, field-specific copy (a product description, a page brief, a tagline, a caption).
// Returns plain text for one field, using the fast model on whichever provider answers.
const BodySchema = z.object({
  /** What the text is for, e.g. "product card description", "About page brief", "WhatsApp caption". */
  field: z.string().trim().min(2).max(120),
  /** Extra instructions: tone, length, format. */
  instructions: z.string().max(2000).optional(),
  /** What the writer should know: store name, product, category, the seller's notes, current text. */
  context: z.record(z.string(), z.union([z.string().max(4000), z.number(), z.boolean(), z.null()])).optional(),
  maxWords: z.number().int().min(3).max(600).optional(),
});

const SYSTEM = `You write short, specific commerce copy for Shopinbos sellers (African online stores).
Write only the requested text: no preamble, no quotes around it, no Markdown headings, no emojis.
Use the seller's real details from the context. Never invent certifications, awards, prices, delivery times or ingredients the context doesn't support; if a detail is needed but unknown, keep the sentence general.
Do not mention AI, Rex, Peggy or Shopinbos in shopper-facing text.`;

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request" } }, { status: 400 });
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: { code: "AI_OFF", message: "AI writing isn't switched on yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to the server." } },
      { status: 503 },
    );
  }
  const limited = await meterAi(user.id, "text", 1, /description|title/i.test(parsed.data.field) ? "product_copy" : /caption|post|ad\b/i.test(parsed.data.field) ? "caption" : undefined);
  if (limited) return limited;

  const { field, instructions, context, maxWords } = parsed.data;
  const contextLines = Object.entries(context ?? {})
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  const prompt = `Write the ${field}.${maxWords ? ` Keep it under ${maxWords} words.` : ""}
${instructions ? `Instructions: ${instructions}\n` : ""}${contextLines ? `Context:\n${contextLines}` : ""}`;

  const result = await aiText({ system: SYSTEM, prompt, fast: true, maxTokens: 4000 });
  if (!result) {
    return NextResponse.json({ error: { code: "AI_FAILED", message: "The AI couldn't write that right now. Try again in a moment." } }, { status: 502 });
  }
  const text = result.text.replace(/^["“]|["”]$/g, "").trim();
  return NextResponse.json({ data: { text, provider: result.provider } });
});
