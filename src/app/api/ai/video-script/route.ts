import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { firstJsonObject, generateText } from "@/lib/ai/text";
import { meterAi } from "@/lib/ai/usage";
import { MAX_PHOTOS, VIDEO_LANGUAGES, fallbackScript, normaliseScript } from "@shared/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LANGUAGE_KEYS = VIDEO_LANGUAGES.map((language) => language.key) as [string, ...string[]];

const Schema = z.object({
  name: z.string().trim().min(1, "Add the product name").max(120),
  price: z.string().trim().max(30).optional().default(""),
  description: z.string().trim().max(600).optional().default(""),
  language: z.enum(LANGUAGE_KEYS),
  photos: z.number().int().min(1).max(MAX_PHOTOS),
});

const LANGUAGE_NOTE: Record<string, string> = {
  english: "Nigerian English, warm and direct.",
  pidgin: "Nigerian Pidgin, natural and playful, the way Lagos sellers talk on WhatsApp status.",
  yoruba: "Yorùbá with correct tone marks.",
  hausa: "Hausa with correct hooked letters (ɓ, ɗ, ƙ).",
};

// Video studio: captions, a voiceover and an end-card line for a short product reel.
export const POST = withSeller(async (req, { user }) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the details");
  const { name, price, description, language, photos } = parsed.data;
  const fallback = fallbackScript(name, price, language as never, photos);

  const limited = await meterAi(user.id, "text");
  if (limited) return limited;

  const raw = await generateText(
    [
      `Write a ${photos}-shot vertical product reel for a small Nigerian online shop.`,
      `Product: ${name}${price ? `, ${price}` : ""}.${description ? ` Details: ${description}` : ""}`,
      `Language: ${LANGUAGE_NOTE[language]}`,
      `Return JSON only: {"captions": [${photos} on-screen lines, max 6 words each, one per photo], "voiceover": "2-3 short sentences, under 40 words, ends by telling viewers to tap the link", "cta": "end card line, max 5 words"}.`,
      "No emojis, no hashtags, no prices other than the one given, no claims you can't know (materials, origin) unless in the details.",
    ].join("\n"),
  );
  const script = normaliseScript(firstJsonObject(raw), fallback, photos);
  return ok({ ...script, drafted: Boolean(raw) });
});
