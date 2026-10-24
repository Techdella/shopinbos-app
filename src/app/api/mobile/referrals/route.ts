import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { referralOverview } from "@/lib/referrals/service.server";
import { REFERRAL_OFFERS, REFERRAL_ROLES } from "@shared/referrals";

export const dynamic = "force-dynamic";

// GET /api/mobile/referrals: Refer & earn on the phone's Rewards screen, the same data as the web's Refer & earn
// page (referralOverview): your invite link, what you get for each kind of business you invite, what you've earned,
// and the businesses that joined with your link. Rewards are free months or AI credits, never cash.

const APP = "https://app.shopinbos.com";

export const GET = withAuth(
  async (_req, { user }) => {
    try {
      const overview = await referralOverview(user.id);
      return ok({
        code: overview.code,
        link: `${APP}/r/${overview.code}`,
        role: overview.role,
        offers: REFERRAL_ROLES.map((role) => ({ role, months: REFERRAL_OFFERS[role].referrerMonths, credits: REFERRAL_OFFERS[role].referrerCredits })),
        counts: overview.counts,
        earned: overview.earned,
        freeUntil: overview.freeUntil,
        referrals: overview.referrals.slice(0, 10).map((referral) => ({
          id: referral.id,
          name: referral.name,
          avatarUrl: referral.avatarUrl,
          role: referral.role,
          status: referral.status,
          joinedAt: referral.joinedAt,
        })),
      });
    } catch (error) {
      console.error("[referrals] mobile GET", error);
      return apiError("INTERNAL_ERROR", "We couldn't load your invite link. Try again in a moment.", 500);
    }
  },
  ["seller", "supplier", "logistics_partner"],
);
