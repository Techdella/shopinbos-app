import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { creditBalance, liveCreditPrices, spendCredits } from "@/lib/ai/credits.server";
import { creditCost, creditsUrlFor, outOfCreditsMessage } from "@shared/ai-credits";

/** Where a seller buys AI credits. */
export const CREDITS_URL = "/home/credits";

// Daily limits for Rex and Peggy so a loop, a bot or one busy user can't run up the AI bill. Past the day's
// allowance, bought AI credits pay per request (shared/ai-credits.ts, src/lib/ai/credits.server.ts).
// aiCredits is the plan tier elsewhere in the app (see plan-limits.ts), so it is read here, never spent.

// "speech" is voice typing (speech to text, POST /api/ai/transcribe): short and frequent, so its own allowance.
// "video" is a finished reel from the video studio (the pictures and voice in it are metered on their own).
export type AiKind = "text" | "image" | "voice" | "build" | "speech" | "video";

const DAILY: Record<"starter" | "growth" | "pro", Record<AiKind, number>> = {
  starter: { text: 60, image: 8, voice: 10, build: 6, speech: 60, video: 2 },
  growth: { text: 300, image: 40, voice: 40, build: 20, speech: 200, video: 10 },
  pro: { text: 1500, image: 150, voice: 150, build: 60, speech: 600, video: 40 },
};

export function aiTier(aiCredits: number | null | undefined): keyof typeof DAILY {
  const credits = aiCredits ?? 0;
  return credits >= 100 ? "pro" : credits >= 50 ? "growth" : "starter";
}

export function dailyLimit(kind: AiKind, aiCredits: number | null | undefined) {
  return DAILY[aiTier(aiCredits)][kind];
}

const KIND_WORD: Record<AiKind, string> = { text: "AI requests", image: "images", voice: "voiceovers", build: "store builds", speech: "voice typing recordings", video: "videos" };

/**
 * Checks and records one use. Returns a 429 response when over the limit (or bursting), else null.
 * Recording happens up front so parallel requests can't all slip under the limit.
 */
export async function meterAi(userId: string, kind: AiKind, units = 1): Promise<NextResponse | null> {
  // Bursts across every server instance (shared, fails open); the daily allowance below is counted in AiUsage.
  const burst = await checkRateLimitShared(rateLimitKey(`ai:${kind}`, userId), { maxRequests: kind === "text" ? 20 : kind === "speech" ? 12 : 6, windowMs: 60_000 });
  if (!burst.allowed) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "That's a lot at once. Wait a minute and try again." } }, { status: 429 });
  }
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [user, used] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { aiCredits: true, role: true } }),
      db.aiUsage.aggregate({ where: { userId, kind, createdAt: { gte: since } }, _sum: { units: true } }),
    ]);
    const limit = dailyLimit(kind, user?.aiCredits);
    if ((used._sum.units ?? 0) + units > limit) {
      // Allowance used up: bought credits pay for it (the saved card tops them up when auto top-up is on).
      const cost = creditCost(kind, units, (await liveCreditPrices()).costs);
      const left = await spendCredits(userId, cost).catch((error) => {
        console.error("[ai/usage] credit spend failed", error);
        return null;
      });
      if (left === null) {
        const balance = await creditBalance(userId);
        return NextResponse.json(
          { error: { code: "AI_CREDITS_NEEDED", message: outOfCreditsMessage(`${limit} ${KIND_WORD[kind]}`, cost, balance), buyUrl: creditsUrlFor(user?.role), cost, balance } },
          { status: 402 },
        );
      }
    }
    await db.aiUsage.create({ data: { userId, kind, units } });
  } catch (error) {
    // Metering must never take Rex or Peggy down (e.g. before the table exists); the burst limit still applies.
    console.error("[ai/usage] metering failed", error);
  }
  return null;
}

const ALLOWANCE_LABEL: Record<AiKind, string> = { text: "Peggy & Rex requests", image: "Pictures", voice: "Voiceovers", build: "Store builds", speech: "Voice typing", video: "Videos" };

/** What the seller has used of each daily AI allowance (last 24 hours), for Settings. Null if it can't be read. */
export async function aiAllowanceToday(userId: string, aiCredits: number | null | undefined) {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db.aiUsage.groupBy({ by: ["kind"], where: { userId, createdAt: { gte: since } }, _sum: { units: true } });
    const used = new Map(rows.map((row) => [row.kind, row._sum.units ?? 0]));
    return (Object.keys(ALLOWANCE_LABEL) as AiKind[]).map((kind) => ({ kind, label: ALLOWANCE_LABEL[kind], used: used.get(kind) ?? 0, limit: dailyLimit(kind, aiCredits) }));
  } catch (error) {
    console.error("[ai/usage] allowance read failed", error);
    return null;
  }
}
