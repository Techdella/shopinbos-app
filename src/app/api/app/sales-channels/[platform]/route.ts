import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { channelActionAllowed, isComingSoon, isLivePlatform, isOAuthPlatform } from "@/lib/sales-channels/pure";
import { connectWhatsAppCatalog, disconnectPlatform, recordInterest, syncPlatform } from "@/lib/sales-channels/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// One platform on Sell everywhere, for the phone app (the web does these with src/app/channels/actions.ts; both
// call src/lib/sales-channels/server.ts). Signing in goes through ./connect and ./callback.
//   POST { action: "retry" }  → { ok, needsSignup? }: "Try again", "I've done it", and WhatsApp's one-tap connect.
//   POST { action: "notify" } → { ok }: "Tell me when it's ready" for a coming-soon platform.
//   DELETE                    → { ok }: Disconnect.

const Body = z.object({ action: z.enum(["retry", "notify"]) });

async function storeOf(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true } });
}

export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const platform = String(params.platform ?? "");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !channelActionAllowed(platform, parsed.data.action)) return apiError("BAD_REQUEST", "That isn't something this platform can do.");
  const store = await storeOf(user.id);
  if (!store) return apiError("NOT_FOUND", "Set up your store first", 404);

  if (parsed.data.action === "notify") {
    if (!isComingSoon(platform)) return apiError("BAD_REQUEST", "That platform isn't coming soon.");
    await recordInterest(store.id, user.id, platform);
    revalidatePath("/channels");
    return ok({ ok: true });
  }
  if (platform === "whatsapp") {
    const result = await connectWhatsAppCatalog(store.id);
    revalidatePath("/channels");
    // needsSignup: the WhatsApp number isn't connected yet. That runs Meta's Embedded Signup, which only works on /channels.
    return ok(result.ok ? { ok: true } : "needsSignup" in result ? { ok: false, needsSignup: true } : { ok: false });
  }
  if (!isOAuthPlatform(platform)) return apiError("BAD_REQUEST", "That isn't something this platform can do.");
  const outcome = await syncPlatform(store.id, platform);
  revalidatePath("/channels");
  return ok({ ok: outcome === "connected" || outcome === "syncing" });
});

export const DELETE = withSeller(async (_req, { user, params }) => {
  const platform = String(params.platform ?? "");
  if (!isLivePlatform(platform)) return apiError("BAD_REQUEST", "That platform can't be disconnected.");
  const store = await storeOf(user.id);
  if (!store) return apiError("NOT_FOUND", "Set up your store first", 404);
  await disconnectPlatform(store.id, platform);
  revalidatePath("/channels");
  return ok({ ok: true });
});
