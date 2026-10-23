import "server-only";

import { db } from "@/lib/db/client";
import { addCredits } from "@/lib/ai/credits.server";
import { notify } from "@/lib/notifications/notify.server";
import { levelFor, asRewardRole } from "@/lib/rewards/rules";
import { ANNIVERSARY_CREDITS, anniversaryDue, tierForLevel } from "@shared/loyalty";
import { monthPeriod } from "./journeys";
import { mailT, memberLocale } from "./i18n";

// Loyalty perks (shared/loyalty.ts), run from the hourly journeys job when switched on (Admin › Leads › Member tips,
// PlatformSetting "member.loyalty"): each month's tier credits, a message when someone moves up a tier, and the
// account-anniversary gift. Each is a MemberMessage claimed first, so it's given once.

const SETTING = "member.loyalty";

export async function loyaltyOn() {
  const row = await db.platformSetting.findUnique({ where: { key: SETTING } }).catch(() => null);
  return (row?.value as { on?: boolean } | null)?.on === true;
}

export async function setLoyaltyOn(on: boolean, userId: string) {
  const value = { on, updatedBy: userId, updatedAt: new Date().toISOString() };
  await db.platformSetting.upsert({ where: { key: SETTING }, create: { key: SETTING, value }, update: { value } });
}

async function claim(userId: string, kind: string, period: string, ref: string, channel = "credits") {
  try {
    return await db.memberMessage.create({ data: { userId, kind, period, ref, channel } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return null;
    throw error;
  }
}

async function done(id: string) {
  await db.memberMessage.update({ where: { id }, data: { status: "sent", sentAt: new Date() } });
}

/** Monthly tier credits, tier-up messages and anniversary gifts. */
export async function runLoyalty(now = new Date(), deadline = Date.now() + 120_000) {
  if (!(await loyaltyOn())) return { on: false };
  const month = monthPeriod(now);
  let monthly = 0;
  let tierUps = 0;
  let anniversaries = 0;

  // Everyone at Silver or above (XP high enough for level 3 in their role catalog), checked by level.
  const accounts = await db.rewardAccount.findMany({ where: { xp: { gte: 200 } }, select: { userId: true, xp: true }, take: 5000 });
  const users = await db.user.findMany({ where: { id: { in: accounts.map((a) => a.userId) }, verificationStatus: { not: "suspended" } }, select: { id: true, role: true, preferences: true } });
  const roleOf = new Map(users.map((u) => [u.id, asRewardRole(u.role)]));
  const tOf = new Map(users.map((u) => [u.id, mailT(memberLocale(u.preferences))]));
  for (const account of accounts) {
    if (Date.now() > deadline) break;
    const role = roleOf.get(account.userId);
    if (!role) continue;
    const level = levelFor(role, account.xp).level;
    const tier = tierForLevel(level);
    if (tier.key === "bronze") continue;
    const t = tOf.get(account.userId) ?? mailT();
    const tierName = t(`tier.${tier.key}`);

    // Moved up a tier: tell them once per tier.
    const up = await claim(account.userId, "tier_up", tier.key, tier.name, "bell");
    if (up) {
      await notify({
        userId: account.userId,
        event: "member.tier_up",
        category: "account",
        priority: "success",
        title: t("loyalty.up.title", { tier: tierName }),
        description: t(tier.key !== "silver" ? "loyalty.up.descEarly" : "loyalty.up.desc", { tier: tierName, count: tier.monthlyCredits }),
        locale: t.locale,
        link: "/refer",
        dedupeKey: `tier-up-${account.userId}-${tier.key}`,
        email: true,
      }).catch(() => undefined);
      await done(up.id);
      tierUps++;
    }

    // This month's tier credits.
    if (tier.monthlyCredits > 0) {
      const row = await claim(account.userId, "loyalty_monthly", month, tier.key);
      if (row) {
        await addCredits(account.userId, tier.monthlyCredits, "grant", `loyalty-${account.userId}-${month}`);
        await notify({
          userId: account.userId,
          event: "member.loyalty_credits",
          category: "account",
          priority: "success",
          title: t("loyalty.monthly.title", { count: tier.monthlyCredits, tier: tierName }),
          description: t("loyalty.monthly.desc"),
          dedupeKey: `loyalty-${account.userId}-${month}`,
          inAppOnly: true,
        }).catch(() => undefined);
        await done(row.id);
        monthly++;
      }
    }
  }

  // Anniversaries: accounts that turned 1, 2, … years old this week.
  const day = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const window = Array.from({ length: 7 }, (_, i) => day(new Date(now.getTime() - i * 86_400_000)));
  const candidates = await db.$queryRaw<Array<{ id: string; createdAt: Date; preferences: unknown }>>`
    SELECT u."id", u."createdAt", u."preferences" FROM "User" u
    WHERE u."role"::text IN ('seller', 'supplier', 'logistics_partner')
      AND u."verificationStatus"::text <> 'suspended'
      AND u."createdAt" < ${new Date(now.getTime() - 360 * 86_400_000)}
      AND to_char(u."createdAt", 'MM-DD') = ANY(${window})
    LIMIT 2000`;
  for (const person of candidates) {
    if (Date.now() > deadline) break;
    const years = anniversaryDue(person.createdAt, now);
    if (!years) continue;
    const row = await claim(person.id, "anniversary", String(now.getUTCFullYear()), `${years}y`);
    if (!row) continue;
    await addCredits(person.id, ANNIVERSARY_CREDITS, "grant", `anniversary-${person.id}-${now.getUTCFullYear()}`);
    const t = mailT(memberLocale(person.preferences));
    await notify({
      userId: person.id,
      event: "member.anniversary",
      category: "account",
      priority: "success",
      title: t("loyalty.anniversary.title", { years }),
      description: t("loyalty.anniversary.desc", { count: ANNIVERSARY_CREDITS }),
      locale: t.locale,
      dedupeKey: `anniversary-${person.id}-${now.getUTCFullYear()}`,
      email: true,
    }).catch(() => undefined);
    await done(row.id);
    anniversaries++;
  }
  return { on: true, monthly, tierUps, anniversaries };
}
