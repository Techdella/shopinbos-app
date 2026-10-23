// Refer & earn wording in each person's app language (the "ref.*" keys of shared/i18n/messages/mail): rewards, the
// welcome gift, when an invite counts. Pure, tested in tests/member-i18n.test.mjs; English matches shared/referrals.ts.

import type { Locale } from "../../../shared/i18n/index.ts";
import { mailT } from "../../../shared/i18n/mail.ts";
import { PLAN_LABEL, REFERRAL_OFFERS, type ReferralRole } from "../../../shared/referrals.ts";

/** "3 months free + 500 AI credits". */
export function rewardTextIn(locale: Locale, reward: { months: number; credits: number }) {
  const t = mailT(locale);
  const parts: string[] = [];
  if (reward.months) parts.push(t("ref.months", { count: reward.months }));
  if (reward.credits) parts.push(t("ref.credits", { count: reward.credits }));
  return parts.join(" + ") || "-";
}

/** "3 months free or 500 AI credits": what the inviter gets for inviting this role. */
export function referrerRewardIn(locale: Locale, role: ReferralRole) {
  const t = mailT(locale);
  const offer = REFERRAL_OFFERS[role];
  return t("ref.or", { months: t("ref.months", { count: offer.referrerMonths }), credits: t("ref.credits", { count: offer.referrerCredits }) });
}

/** What the new account gets ("1 month of Supplier Plus free + 1 featured week in the marketplace"). */
export function welcomeTextIn(locale: Locale, role: ReferralRole) {
  const t = mailT(locale);
  const offer = REFERRAL_OFFERS[role];
  const parts: string[] = [];
  if (offer.welcomeMonths) parts.push(t("ref.welcome.months", { count: offer.welcomeMonths, plan: PLAN_LABEL[role] }));
  if (offer.welcomeCredits) parts.push(t("ref.welcome.credits", { count: offer.welcomeCredits }));
  if (offer.welcomeFeaturedWeeks) parts.push(t("ref.welcome.weeks", { count: offer.welcomeFeaturedWeeks }));
  return parts.join(" + ");
}

/** When an invite counts, as part of a sentence ("they're verified and have 5 approved products"). */
export function ruleIn(locale: Locale, role: ReferralRole) {
  return mailT(locale)(`ref.rule.${role}`);
}

/** "a supplier". */
export function nounIn(locale: Locale, role: ReferralRole) {
  return mailT(locale)(`ref.noun.${role}`);
}
