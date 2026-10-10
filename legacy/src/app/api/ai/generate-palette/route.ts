import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { getAnthropicClient, getOpenAIClient, REX_OPENAI_MODEL } from "@/lib/ai/client";

export const runtime = "nodejs";
export const maxDuration = 30;

export const POST = withSeller(async (req: NextRequest) => {
  const openai = getOpenAIClient();
  const anthropic = getAnthropicClient();
  if (!openai && !anthropic) {
    return NextResponse.json({ error: { message: "AI not configured" } }, { status: 500 });
  }

  const body = await req.json().catch(() => ({})) as {
    businessName?: string;
    description?: string;
    feeling?: string;
    customers?: string;
    colorPreferences?: string;
  };

  const { businessName = "an online store", description = "products", feeling = "professional", customers = "general shoppers", colorPreferences = "no preference" } = body;

  const prompt = `You are a professional brand color designer specializing in African e-commerce.

Create 5 distinct color palette options for this store:

Business: "${businessName}"
What they sell: "${description}"
Desired store feeling: "${feeling}"
Target customers: "${customers}"
Color preferences / notes: "${colorPreferences}"

Return a JSON array of exactly 5 palette objects. Each object must have:
- "id": kebab-case slug (e.g. "warm-earth-glow")
- "name": evocative 2–3 word name (e.g. "Lagos Sunset", "Cool Slate Premium")
- "personality": one sentence — the brand feeling this palette creates
- "vibe": exactly one of: "warm" | "cool" | "bold" | "minimal" | "playful" | "luxury"
- "colors": object with hex codes for: primary, secondary, accent, background, surface, text
- "bestFor": one sentence on who resonates most with this palette

Color design rules:
- "text" must have ≥4.5:1 contrast on "background" (WCAG AA)
- "accent" should be vibrant — used for CTA buttons and highlights
- "background" should be light (off-white, cream, soft pastels — not pure white #fff)
- "surface" = card background (slightly different from background, e.g. pure white or lighter tint)
- "primary" = navbar, brand bar color
- Each of the 5 palettes must feel DISTINCTLY different — vary warmth, saturation, and mood
- Draw from the richness of African/Nigerian visual culture: kente warmth, Lagos energy, Afro-minimalism, Nollywood boldness, Lagos Island luxury — where it fits the brief

Return ONLY the raw JSON array. No markdown, no explanation, no code fences.`;

  let raw = "";
  if (openai) {
    const response = await openai.responses.create({
      model: REX_OPENAI_MODEL,
      input: prompt,
    });
    raw = response.output_text?.trim() ?? "";
  } else if (anthropic) {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });
    raw = message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
  }

  // Extract JSON array even if model wraps it in extra text
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return NextResponse.json({ error: { message: "AI returned unexpected format — try again." } }, { status: 500 });
  }

  let palettes: unknown;
  try {
    palettes = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: { message: "Could not parse palette response." } }, { status: 500 });
  }

  return NextResponse.json({ palettes });
});
