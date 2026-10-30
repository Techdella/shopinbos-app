import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { ok } from "@/lib/api/response";
import { colourSetsForSeller } from "@/lib/onboarding/colour-sets.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Onboarding D2b "Here are 3 colour sets for you" (and the phone editor's theme sheet):
//   GET ?style=warm|soft|luxury|bold → { sets: [{ id, source: "logo" | "photos" | "rex", swatch, tokens, set }] }
// Made from the seller's logo and product photos (src/lib/onboarding/colour-sets.server.ts), every set checked for
// WCAG contrast (shared/colour-sets.ts); Rex's presets fill in when there are no pictures. Free, nothing is saved:
// the phone saves the picked set's tokens with PATCH /api/mobile/onboarding { palette, paletteTokens }.

const STYLES = new Set(["warm", "soft", "luxury", "bold"]);

export const GET = withSeller(async (req: NextRequest, { user }) => {
  const style = req.nextUrl.searchParams.get("style");
  const sets = await colourSetsForSeller(user.id, style && STYLES.has(style) ? (style as "warm") : null);
  return ok({ sets });
});
