import "server-only";

import { db } from "@/lib/db/client";
import { creditBalance, ensureCreditAccount, liveCreditPrices } from "@/lib/ai/credits.server";
import { planOfUser } from "@/lib/plan-limits";
import { notify } from "@/lib/notifications/notify.server";
import { tFor } from "@shared/i18n/catalog";
import { isLocale, type Locale } from "@shared/i18n";
import { parsePreferences } from "@shared/preferences";
import {
  REX_STUDIO_CARD_DAYS,
  REX_STUDIO_WELCOME_REASON,
  REX_STUDIO_WELCOME_TARGET,
  dueRexStudioNudge,
  rexStudioMeter,
  rexStudioWelcomeExpiry,
  rexStudioWelcomeGrant,
  showRexStudioCard,
  starterProduct,
  type RexStudioMeterState,
} from "@shared/rex-studio-welcome";

// "You have 20 credits to try Rex Studio" (rules in shared/rex-studio-welcome.ts). grantRexStudioWelcome runs when
// Rex's build finishes, on every platform: the phone's and the new web onboarding's build (buildShopDraft in
// src/lib/onboarding/rex-build.server.ts) and a shop's first publish (publishStoreDraft, which the web's existing
// onboarding and the phone's go-live both end with). It is safe to call any number of times: the AiCreditGrant row
// (unique per seller) is written first, so only one caller ever adds credits. Never throws: a failure is logged and
// the build carries on.

const WELCOME_KINDS = ["image", "video"] as const;

/**
 * Tops a FREE seller's usable credits up to 20, once (paid plans: nothing). Returns the credits added (0 when they
 * already had 20 or more, or it was given before), or null when it didn't apply or couldn't run.
 */
export async function grantRexStudioWelcome(userId: string, options: { storeId?: string | null } = {}): Promise<number | null> {
  try {
    const plan = await planOfUser(userId);
    if (plan !== "seller_free") return null;
    const existing = await db.aiCreditGrant.findUnique({ where: { userId_reason: { userId, reason: REX_STUDIO_WELCOME_REASON } }, select: { id: true } });
    if (existing) return null;
    await ensureCreditAccount(userId);
    const balance = await creditBalance(userId);
    const decision = rexStudioWelcomeGrant({ planKey: plan, balance, alreadyGranted: false });
    if (!decision.eligible) return null;
    const now = new Date();
    const expiresAt = rexStudioWelcomeExpiry(now);
    const added = await db.$transaction(async (tx) => {
      // The marker first: a second caller at the same moment fails here (unique) and adds nothing.
      await tx.aiCreditGrant.create({ data: { userId, reason: REX_STUDIO_WELCOME_REASON, storeId: options.storeId ?? null, credits: decision.credits, balanceBefore: balance, expiresAt: decision.credits > 0 ? expiresAt : null } });
      if (decision.credits > 0) {
        await tx.aiCreditLot.create({ data: { userId, credits: decision.credits, source: REX_STUDIO_WELCOME_REASON, reference: `${REX_STUDIO_WELCOME_REASON}-${userId}`, expiresAt } });
        await tx.aiCreditAccount.update({ where: { userId }, data: { balance: { increment: decision.credits } } });
      }
      return decision.credits;
    });
    return added;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return null; // given by the other caller just now
    console.error("[rex-studio-welcome] grant failed", error instanceof Error ? error.message : error);
    return null;
  }
}

export interface RexStudioWelcomeView {
  /** Credits the welcome added (0 when they already had 20). */
  granted: number;
  balance: number;
  target: number;
  percent: number;
  state: RexStudioMeterState;
  /** When the welcome credits run out (null when none were added). */
  expiresAt: string | null;
  /** The shop's product the starters name ("Make a 15s video of …"), or null. */
  product: string | null;
  /** What a picture and a video cost right now (Admin › Pricing). */
  costs: { photo: number; video: number; image: number };
}

/** The Rex Studio card for Home and the "is live" screen, or null when it doesn't show (paid plan, no welcome, too old). */
export async function rexStudioWelcomeFor(userId: string, now = new Date()): Promise<RexStudioWelcomeView | null> {
  try {
    const grant = await db.aiCreditGrant.findUnique({ where: { userId_reason: { userId, reason: REX_STUDIO_WELCOME_REASON } } });
    if (!grant || !showRexStudioCard(grant.createdAt, now)) return null;
    if ((await planOfUser(userId)) !== "seller_free") return null;
    const [balance, product, prices] = await Promise.all([
      creditBalance(userId),
      grant.storeId
        ? db.storeProduct.findFirst({ where: { storeId: grant.storeId, status: { not: "archived" } }, orderBy: { createdAt: "asc" }, select: { name: true } }).catch(() => null)
        : db.storeProduct.findFirst({ where: { store: { userId }, status: { not: "archived" } }, orderBy: { createdAt: "asc" }, select: { name: true } }).catch(() => null),
      liveCreditPrices(),
    ]);
    const meter = rexStudioMeter(balance, REX_STUDIO_WELCOME_TARGET);
    return {
      granted: grant.credits,
      balance: meter.balance,
      target: meter.target,
      percent: meter.percent,
      state: meter.state,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      product: starterProduct(product?.name),
      costs: { photo: prices.costs.photo ?? 10, video: prices.costs.video ?? 10, image: prices.costs.image ?? 10 },
    };
  } catch (error) {
    // Before the table exists, or a read failed: no card.
    console.error("[rex-studio-welcome] view failed", error instanceof Error ? error.message : error);
    return null;
  }
}

async function userLocale(userId: string): Promise<Locale> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { preferences: true } }).catch(() => null);
  const language = parsePreferences(user?.preferences).language;
  return language && isLocale(language) ? language : "en";
}

/**
 * Hourly (the lifecycle cron): free sellers who got the welcome and haven't made a picture or video since get a
 * reminder on day 1 and day 3 (two at most), as a "tip": the bell and push, following their "Tips and marketing"
 * notification switches. The words never sell anything, so they're fine in the phone app too.
 */
export async function sendRexStudioNudges(now = new Date()) {
  const since = new Date(now.getTime() - REX_STUDIO_CARD_DAYS * 24 * 60 * 60 * 1000);
  const grants = await db.aiCreditGrant.findMany({
    where: { reason: REX_STUDIO_WELCOME_REASON, nudges: { lt: 2 }, createdAt: { gte: since, lte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  let sent = 0;
  for (const grant of grants) {
    const used = await db.aiUsage.count({ where: { userId: grant.userId, kind: { in: [...WELCOME_KINDS] }, units: { gt: 0 }, createdAt: { gte: grant.createdAt } } }).catch(() => 1);
    const index = dueRexStudioNudge({ grantedAt: grant.createdAt, nudgesSent: grant.nudges, usedSinceGrant: used > 0, now });
    if (index === null) continue;
    if ((await planOfUser(grant.userId)) !== "seller_free") continue;
    const balance = await creditBalance(grant.userId);
    if (balance <= 0) continue;
    // Claim the reminder before sending, so two cron runs can't both send it.
    const claimed = await db.aiCreditGrant.updateMany({ where: { id: grant.id, nudges: grant.nudges }, data: { nudges: grant.nudges + 1, lastNudgeAt: now } });
    if (claimed.count !== 1) continue;
    const t = tFor(await userLocale(grant.userId), "credits");
    await notify({
      userId: grant.userId,
      event: "tip",
      category: "marketing",
      priority: "info",
      title: index === 0 ? t("rs.nudge1.title", { count: balance }) : t("rs.nudge2.title", { count: balance }),
      description: index === 0 ? t("rs.nudge1.body") : t("rs.nudge2.body"),
      link: "/studio",
      appRoute: "/studio",
      dedupeKey: `${REX_STUDIO_WELCOME_REASON}:${grant.userId}:${index}`,
    })
      .then(() => {
        sent += 1;
      })
      .catch((error) => console.error("[rex-studio-welcome] nudge failed", error instanceof Error ? error.message : "unknown"));
  }
  return { checked: grants.length, sent };
}
