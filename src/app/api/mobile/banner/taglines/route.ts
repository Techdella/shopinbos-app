import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { aiConfigured } from "@/lib/ai/client";
import { loadSellerBrandContext } from "@/lib/ai/brand-context.server";
import { aiText, firstJsonObject } from "@/lib/ai/text";
import { meterAiCharged, refundAi } from "@/lib/ai/usage";
import { parseTaglines, TAGLINE_SYSTEM, taglinePrompt } from "@shared/store-banner";
import { overLimit, readJson, writerLanguage } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "Write a tagline with Peggy" in the phone's Edit my shop (apps/mobile/src/components/seller/BannerEditor.tsx).
//   POST { language?, current? } → { taglines: string[] (3) }
// Three short taglines in the phone's language and the shop's own tone (the feel and customers from onboarding).
// One "text" from the day's allowance, then AI credits (402 AI_CREDITS_NEEDED when out of both); given back when
// nothing usable comes back. Saves nothing: the seller taps one into the tagline or the banner heading.

const Body = z.object({
  language: z.string().max(8).optional(),
  current: z.string().trim().max(240).optional().default(""),
});

export const POST = withSeller(async (req: NextRequest, { user }) => {
  const input = await readJson(req, Body);
  if (input instanceof NextResponse) return input;
  if (!aiConfigured()) return apiError("AI_OFF", "Peggy isn't switched on yet.", 503);
  const limited = await overLimit("mobile-taglines", user.id, 40);
  if (limited) return limited;

  const metered = await meterAiCharged(user.id, "text", 1);
  if (metered.blocked) return metered.blocked;

  const brand = await loadSellerBrandContext(user.id).catch(() => null);
  const prompt = taglinePrompt({
    storeName: brand?.storeName ?? "the shop",
    business: brand?.business ?? null,
    audience: brand?.audience ?? null,
    tone: brand?.vibe ?? null,
    current: input.current,
    language: writerLanguage(input.language),
  });
  const result = await aiText({ system: TAGLINE_SYSTEM, prompt, fast: true, maxTokens: 800 }).catch(() => null);
  const text = result?.text ?? null;
  const taglines = parseTaglines(firstJsonObject(text) ?? text);
  if (!taglines.length) {
    await refundAi(user.id, "text", 1, metered.credits);
    return apiError("UNAVAILABLE", "Peggy couldn't write taglines just now. Try again in a moment.", 503);
  }
  return ok({ taglines });
});
