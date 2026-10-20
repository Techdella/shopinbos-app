// Delivery partner team members (LogisticsTeamMember). Shared by the web Riders page and the phone app.

export const TEAM_ROLES = ["rider", "dispatcher", "manager", "support"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

const RIDER_EMAIL_DOMAIN = "@riders.shopinbos.app";

/**
 * Riders have no email: they sign in with their private Riders app link. The table still needs a unique email per
 * partner, so a rider gets a placeholder made from their WhatsApp number (the rider never sees it). The web page
 * and the phone app use the same one, so adding the same number twice updates one rider instead of making two.
 */
export function riderPlaceholderEmail(phoneE164: string) {
  return `wa${phoneE164.replace(/\D/g, "")}${RIDER_EMAIL_DOMAIN}`;
}

export function isRiderPlaceholderEmail(email: string | null | undefined) {
  return Boolean(email?.endsWith(RIDER_EMAIL_DOMAIN));
}
