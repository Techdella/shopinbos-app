"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getCurrentAppUser } from "@/lib/server-auth";
import { COMING_SOON_PLATFORMS, LIVE_PLATFORMS, OAUTH_PLATFORMS } from "@/lib/sales-channels/pure";
import { connectWhatsAppCatalog, disconnectPlatform, recordInterest, syncPlatform, type WhatsAppConnectResult } from "@/lib/sales-channels/server";

// Sell everywhere (/channels): Disconnect, Try again, the WhatsApp one-tap connect, and "Tell me when it's ready".
// Sign-ins for Facebook & Instagram, TikTok and Google go through /api/app/sales-channels/[platform]/connect.
// Tokens are encrypted at rest (src/lib/inbox/crypto.ts, INBOX_ENCRYPTION_KEY) and never sent to the browser.

async function seller() {
  const user = await getCurrentAppUser({ redirectTo: "/login" });
  if (!user || user.role !== "seller") return null;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true } });
  return store ? { user, store } : null;
}

const live = z.enum(LIVE_PLATFORMS);
const oauth = z.enum(OAUTH_PLATFORMS);
const soon = z.enum(COMING_SOON_PLATFORMS);

export async function disconnectAction(platform: string): Promise<void> {
  const me = await seller();
  const parsed = live.safeParse(platform);
  if (!me || !parsed.success) return;
  await disconnectPlatform(me.store.id, parsed.data);
  revalidatePath("/channels");
}

/** "Try again" after a failed sync, and "I've done it, connect again" after creating the account they needed. */
export async function retryAction(platform: string): Promise<{ ok: boolean }> {
  const me = await seller();
  if (!me) return { ok: false };
  if (platform === "whatsapp") {
    const result = await connectWhatsAppCatalog(me.store.id);
    revalidatePath("/channels");
    return { ok: result.ok };
  }
  const parsed = oauth.safeParse(platform);
  if (!parsed.success) return { ok: false };
  const outcome = await syncPlatform(me.store.id, parsed.data);
  revalidatePath("/channels");
  return { ok: outcome === "connected" || outcome === "syncing" };
}

/** WhatsApp: needs the number connected first (Embedded Signup in the browser), then sets up the catalog. */
export async function connectWhatsAppAction(): Promise<WhatsAppConnectResult> {
  const me = await seller();
  if (!me) return { ok: false, error: "signin" };
  const result = await connectWhatsAppCatalog(me.store.id);
  revalidatePath("/channels");
  return result;
}

export async function notifyMeAction(platform: string): Promise<{ ok: boolean }> {
  const me = await seller();
  const parsed = soon.safeParse(platform);
  if (!me || !parsed.success) return { ok: false };
  await recordInterest(me.store.id, me.user.id, parsed.data);
  revalidatePath("/channels");
  return { ok: true };
}
