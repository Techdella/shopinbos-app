import { NextRequest, NextResponse } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { aiConfigured } from "@/lib/ai/client";
import { aiText, firstJsonArray } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const maxDuration = 30;

const HEX = /^#[0-9a-fA-F]{6}$/;
const COLOR_KEYS = ["primary", "secondary", "accent", "background", "surface", "text"] as const;

function cleanPalettes(raw: unknown[]) {
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item, index) => {
      const colors = (item.colors && typeof item.colors === "object" ? item.colors : {}) as Record<string, unknown>;
      if (!COLOR_KEYS.every((key) => typeof colors[key] === "string" && HEX.test(colors[key] as string))) return null;
      return {
        id: typeof item.id === "string" && item.id ? item.id.slice(0, 60) : `palette-${index + 1}`,
        name: typeof item.name === "string" ? item.name.slice(0, 60) : `Palette ${index + 1}`,
        personality: typeof item.personality === "string" ? item.personality.slice(0, 240) : "",
        vibe: typeof item.vibe === "string" ? item.vibe : "minimal",
        colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, colors[key] as string])),
        bestFor: typeof item.bestFor === "string" ? item.bestFor.slice(0, 240) : "",
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .slice(0, 5);
}

export const POST = withSeller(async (req: NextRequest, { user }) => {
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: { code: "AI_OFF", message: "AI isn't switched on yet. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to generate palettes." } },
      { status: 503 },
    );
  }
  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

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

  let raw: string | null = null;
  try {
    raw = (await aiText({ prompt, fast: true, maxTokens: 6000 }))?.text ?? null;
  } catch (error) {
    console.error("[ai/generate-palette] failed", error);
  }
  if (!raw) {
    return NextResponse.json({ error: { code: "AI_FAILED", message: "Rex couldn't reach the AI right now. Try again in a moment." } }, { status: 502 });
  }

  const palettes = cleanPalettes(firstJsonArray(raw) ?? []);
  if (!palettes.length) {
    return NextResponse.json({ error: { code: "AI_FORMAT", message: "The palettes came back in a format that couldn't be read. Try again." } }, { status: 502 });
  }

  return NextResponse.json({ palettes });
});
