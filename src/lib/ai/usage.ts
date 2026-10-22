import "server-only";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { checkRateLimitShared, rateLimitKey } from "@/lib/rate-limit";
import { addCredits, creditBalance, liveCreditPrices, spendCredits } from "@/lib/ai/credits.server";
import { creditCost, creditsUrlFor, outOfCreditsMessage, type CreditAction } from "@shared/ai-credits";
import { aiSafetyTier, planKeyForMarker } from "@shared/plans";

// Every AI request costs credits: the plan's monthly credits first, then bought credits (shared/ai-credits.ts,
// src/lib/ai/credits.server.ts). On top, a daily safety cap per kind stops a loop, a bot or a runaway script from
// burning through credits or the AI bill; it never gives anything free. aiCredits on User is the plan marker
// (shared/plans.ts), read here, never spent.

// "speech" is voice typing (speech to text, POST /api/ai/transcribe): short and frequent, so its own cap.
// "video" is a finished reel from the video studio (the pictures and voice in it are metered on their own).
export type AiKind = "text" | "image" | "voice" | "build" | "speech" | "video";

const DAILY: Record<"starter" | "growth" | "pro", Record<AiKind, number>> = {
  starter: { text: 200, image: 30, voice: 30, build: 10, speech: 150, video: 10 },
  growth: { text: 800, image: 120, voice: 120, build: 30, speech: 500, video: 40 },
  pro: { text: 3000, image: 400, voice: 400, build: 80, speech: 1500, video: 120 },
};

export function aiTier(aiCredits: number | null | undefined): keyof typeof DAILY {
  return aiSafetyTier(planKeyForMarker(aiCredits));
}

export function dailyLimit(kind: AiKind, aiCredits: number | null | undefined) {
  return DAILY[aiTier(aiCredits)][kind];
}

const KIND_WORD: Record<AiKind, string> = { text: "AI requests", image: "images", voice: "voiceovers", build: "store builds", speech: "voice typing recordings", video: "videos" };

/**
 * Checks the caps and takes the credits for one use (`action` names the button, e.g. "product_copy", for its own
 * price; otherwise the kind's price). Returns a 429 when over the daily cap or bursting, a 402 when credits ran
 * out, else null. Recorded up front so parallel requests can't all slip under the cap.
 */
export async function meterAi(userId: string, kind: AiKind, units = 1, action?: CreditAction): Promise<NextResponse | null> {
  return (await meterAiCharged(userId, kind, units, action)).blocked;
}

/** meterAi, also saying how many credits it took, so a job that then fails can be given back with refundAi. */
export async function meterAiCharged(userId: string, kind: AiKind, units = 1, action?: CreditAction): Promise<{ blocked: NextResponse | null; credits: number }> {
  let credits = 0;
  const blocked = await meterOnce(userId, kind, units, action, (cost) => {
    credits = cost;
  });
  return { blocked, credits: blocked ? 0 : credits };
}

/**
 * For previews that are free to look at (Rex showing a design before the seller applies it): the burst limit and
 * the daily safety cap still apply and the use is counted, but no credits are taken.
 */
export async function meterAiPreview(userId: string, kind: AiKind, units = 1): Promise<NextResponse | null> {
  return meterOnce(userId, kind, units, undefined, () => undefined, { free: true });
}

/** What a kind or action costs right now (Admin › Pricing), for buttons that show it before use. */
export async function aiCost(kind: AiKind, units = 1, action?: CreditAction) {
  return creditCost(action ?? kind, units, (await liveCreditPrices()).costs);
}

/**
 * Gives back uses that failed after metering (an image the service couldn't make): the daily cap (a negative usage
 * row) and the credits they took, as a 12-month lot. Never fails the caller.
 */
export async function refundAi(userId: string, kind: AiKind, units: number, credits: number) {
  try {
    if (units > 0) await db.aiUsage.create({ data: { userId, kind, units: -Math.round(units) } });
    if (credits > 0) await addCredits(userId, credits, "refund");
  } catch (error) {
    console.error("[ai/usage] refund failed", error);
  }
}

async function meterOnce(userId: string, kind: AiKind, units: number, action: CreditAction | undefined, charged: (cost: number) => void, options: { free?: boolean } = {}): Promise<NextResponse | null> {
  // Bursts across every server instance (shared, fails open); the daily cap below is counted in AiUsage.
  const burst = await checkRateLimitShared(rateLimitKey(`ai:${kind}`, userId), { maxRequests: kind === "text" ? 20 : kind === "speech" ? 12 : 8, windowMs: 60_000 });
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
      return NextResponse.json(
        { error: { code: "AI_DAILY_CAP", message: `That's today's limit of ${limit} ${KIND_WORD[kind]}, a safety cap so nothing runs away with your credits. It resets within 24 hours.` } },
        { status: 429 },
      );
    }
    if (options.free) {
      await db.aiUsage.create({ data: { userId, kind, units } });
      return null;
    }
    const cost = creditCost(action ?? kind, units, (await liveCreditPrices()).costs);
    const left = await spendCredits(userId, cost).catch((error) => {
      console.error("[ai/usage] credit spend failed", error);
      return null;
    });
    if (left === null) {
      const balance = await creditBalance(userId);
      return NextResponse.json(
        { error: { code: "AI_CREDITS_NEEDED", message: outOfCreditsMessage(cost, balance), buyUrl: creditsUrlFor(user?.role), cost, balance } },
        { status: 402 },
      );
    }
    charged(cost);
    await db.aiUsage.create({ data: { userId, kind, units } });
  } catch (error) {
    // Metering must never take Rex or Peggy down (e.g. before the table exists); the burst limit still applies.
    console.error("[ai/usage] metering failed", error);
  }
  return null;
}

const ALLOWANCE_LABEL: Record<AiKind, string> = { text: "Peggy & Rex requests", image: "Pictures", voice: "Voiceovers", build: "Store builds", speech: "Voice typing", video: "Videos" };

/** What the seller has used of each daily safety cap (last 24 hours), for Settings. Null if it can't be read. */
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
