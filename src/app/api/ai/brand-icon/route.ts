import { NextRequest } from "next/server";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { generateImage, ImageUnavailableError, isOwnImageUrl, loadReferences } from "@/lib/ai/images";
import { meterAiCharged, refundAi } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

const PROMPTS = {
  icon: "Turn this logo into a square brand icon (like an app icon or profile picture): keep the brand's symbol or initial and its colours, centred with generous padding on a solid brand-coloured or white square background. Bold, simple, readable at 64 pixels. Keep any letters exactly as in the logo; no new words.",
  favicon: "Turn this logo into a favicon for browser tabs: the simplest recognisable mark from the logo (its symbol or first letter) in its strongest brand colour, very bold, high contrast, filling a square with a little padding. Must read clearly at 16 to 32 pixels. No small text, no thin lines.",
} as const;

// Rex makes the logo icon or favicon from the store's logo (or a logo the seller picked in the logo studio).
// The picture is shown for the seller to use; nothing is changed until they tap "Use" (PATCH /api/app/brand-assets).
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { kind?: string; from?: string };
  const kind = body.kind === "favicon" ? "favicon" : "icon";
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { logoUrl: true } });
  const source = typeof body.from === "string" && isOwnImageUrl(body.from) ? body.from : store?.logoUrl && isOwnImageUrl(store.logoUrl) ? store.logoUrl : null;
  if (!source) return apiError("BAD_REQUEST", "Add your logo first (upload it or make one with Rex), then Rex can make the icon from it.");
  const references = await loadReferences([source]);
  if (!references.length) return apiError("BAD_REQUEST", "Rex can't read that logo file. Upload it as a PNG, JPG or WebP.");

  const metered = await meterAiCharged(user.id, "image");
  if (metered.blocked) return metered.blocked;
  // A failed picture is given back (the credits and the day's cap).
  const giveBack = () => refundAi(user.id, "image", 1, metered.credits);
  try {
    const url = await generateImage({ prompt: PROMPTS[kind], size: "1024x1024", references, path: `logos/${user.id}/${kind}-${Date.now()}` });
    return ok({ url, kind });
  } catch (error) {
    await giveBack();
    if (error instanceof ImageUnavailableError) return apiError("UNAVAILABLE", error.message, 503);
    console.error("[brand-icon] failed", error);
    return apiError("UNAVAILABLE", "Rex couldn't make that just now. Nothing changed; try again.", 503);
  }
});
