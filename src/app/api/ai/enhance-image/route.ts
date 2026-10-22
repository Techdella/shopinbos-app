import { NextRequest, NextResponse } from "next/server";
import { creditBalance } from "@/lib/ai/credits.server";
import { withSeller } from "@/lib/auth/middleware";
import { EDIT_PROMPTS, editImage, ImageUnavailableError, type EditKind } from "@/lib/ai/images";
import { meterAiCharged, refundAi } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const maxDuration = 120;

// Edits a product photo the seller already uploaded: enhance, remove the background, white studio
// backdrop, lifestyle scene, or a custom instruction. The source photo is sent to the model.
export const POST = withSeller(async (req: NextRequest, { user }) => {
  const body = (await req.json().catch(() => ({}))) as { imageUrl?: string; prompt?: string; kind?: string };
  const imageUrl = body.imageUrl?.trim();
  if (!imageUrl) return NextResponse.json({ error: { code: "missing_image", message: "Pick a photo first." } }, { status: 400 });

  const kind = (body.kind && body.kind in EDIT_PROMPTS ? body.kind : "enhance") as EditKind;
  const custom = body.prompt?.trim().slice(0, 1000);
  const prompt = custom ? `${EDIT_PROMPTS[kind]} Also: ${custom}` : EDIT_PROMPTS[kind];

  const metered = await meterAiCharged(user.id, "image", 1, kind === "remove_background" ? "bg_remove" : "photo");
  if (metered.blocked) return metered.blocked;

  try {
    const url = await editImage({ sourceUrl: imageUrl, prompt, transparent: kind === "remove_background", path: `enhanced/${user.id}/${Date.now()}` });
    const credits = await creditBalance(user.id);
    return NextResponse.json({ image: { url }, creditsRemaining: credits });
  } catch (error) {
    // A failed edit is given back (the credits and the day's cap).
    await refundAi(user.id, "image", 1, metered.credits);
    const status = error instanceof ImageUnavailableError ? 503 : 400;
    const message = error instanceof Error ? error.message : "Couldn't edit that photo";
    return NextResponse.json({ error: { code: "enhancement_failed", message } }, { status });
  }
});
