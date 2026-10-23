// Spacing, so Shopinbos never feels like a nuisance (pure, tested in tests/spacing.test.mjs). Every marketing touch
// (weekly tips, journeys, announcements, product news, setup nudges, the weekly summary) counts; account and billing
// notices, celebrations of their own wins and referral updates don't. The senders ask before sending and, when it's
// too soon, wait for the next allowed slot instead of piling up.
//
//  • At most one marketing message a day, email and WhatsApp together (20 hours apart).
//  • Email: 2 days apart, at most 3 in 7 days.
//  • WhatsApp: 4 days apart, at most 2 in 7 days.
//  • Only Mon–Sat 08:00–20:00 Lagos.

export type TouchChannel = "email" | "whatsapp";
export type Touch = { channel: TouchChannel; at: Date };

export const SPACING = {
  anyGapHours: 20,
  email: { gapHours: 48, perWeek: 3 },
  whatsapp: { gapHours: 96, perWeek: 2 },
} as const;

const HOUR = 3_600_000;
const WEEK = 7 * 24 * HOUR;
const LAGOS = HOUR; // UTC+1, no daylight saving

export type SpacingResult = { ok: true } | { ok: false; reason: string; until: Date };

/** May we send a marketing message on this channel now, given what they got in the last 7 days? */
export function spacingCheck(channel: TouchChannel, history: readonly Touch[], now: Date): SpacingResult {
  const recent = history.filter((touch) => now.getTime() - touch.at.getTime() < WEEK && touch.at.getTime() <= now.getTime());
  const latest = (list: readonly Touch[]) => list.reduce<Date | null>((max, touch) => (!max || touch.at > max ? touch.at : max), null);
  const anyLast = latest(recent);
  if (anyLast && now.getTime() - anyLast.getTime() < SPACING.anyGapHours * HOUR) {
    return { ok: false, reason: "They already heard from us today", until: nextSendingTime(new Date(anyLast.getTime() + SPACING.anyGapHours * HOUR)) };
  }
  const rule = SPACING[channel];
  const same = recent.filter((touch) => touch.channel === channel);
  const last = latest(same);
  if (last && now.getTime() - last.getTime() < rule.gapHours * HOUR) {
    return { ok: false, reason: `Too soon after the last ${channel === "email" ? "email" : "WhatsApp"}`, until: nextSendingTime(new Date(last.getTime() + rule.gapHours * HOUR)) };
  }
  if (same.length >= rule.perWeek) {
    const oldest = same.reduce((min, touch) => (touch.at < min ? touch.at : min), same[0]!.at);
    return { ok: false, reason: `Already ${rule.perWeek} ${channel === "email" ? "emails" : "WhatsApp messages"} this week`, until: nextSendingTime(new Date(oldest.getTime() + WEEK)) };
  }
  if (!inSendingHours(now)) return { ok: false, reason: "Outside sending hours", until: nextSendingTime(now) };
  return { ok: true };
}

/** Mon–Sat, 08:00–20:00 Lagos. */
export function inSendingHours(at: Date) {
  const local = new Date(at.getTime() + LAGOS);
  const hour = local.getUTCHours();
  return local.getUTCDay() !== 0 && hour >= 8 && hour < 20;
}

/** The first moment at or after `at` inside sending hours. */
export function nextSendingTime(at: Date): Date {
  if (inSendingHours(at)) return at;
  const local = new Date(at.getTime() + LAGOS);
  let day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  if (local.getUTCHours() >= 8) day += 24 * HOUR; // past 20:00: tomorrow morning
  let candidate = new Date(day + 8 * HOUR - LAGOS);
  if (new Date(candidate.getTime() + LAGOS).getUTCDay() === 0) candidate = new Date(candidate.getTime() + 24 * HOUR); // never Sunday
  return candidate;
}

/** Message kinds that are about their own account (not marketing) and so never count or wait. */
export const SPACING_EXEMPT_KINDS = ["first_win", "credits_low", "tier_up", "loyalty_monthly", "anniversary"] as const;
