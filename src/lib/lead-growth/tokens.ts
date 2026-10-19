// Signed opt-out links for lead campaign messages. Pure (node:crypto), unit-tested.
import { createHmac, timingSafeEqual } from "node:crypto";
import { LEAD_CHANNELS, type LeadChannel } from "./pure.ts";

/** Same secret chain as the email preference links (src/lib/email/tokens.ts). */
export function leadLinkSecret(env: Record<string, string | undefined> = process.env) {
  return env.MARKETING_LINK_SECRET || env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.JWT_SECRET || "";
}

function signOptOut(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`lead-optout:${payload}`).digest("base64url").slice(0, 24);
}

/** `<leadId>.<channel>.<signature>`: never expires, so an opt-out link in an old message keeps working. */
export function leadOptOutToken(leadId: string, channel: LeadChannel, secret = leadLinkSecret()) {
  if (!secret) throw new Error("MARKETING_LINK_SECRET (or CRON_SECRET) must be set to sign opt-out links");
  return `${leadId}.${channel}.${signOptOut(`${leadId}.${channel}`, secret)}`;
}

export function verifyLeadOptOutToken(token: string | null | undefined, secret = leadLinkSecret()): { leadId: string; channel: LeadChannel } | null {
  if (!token || !secret || token.length > 200) return null;
  const [leadId, channel, signature, extra] = token.split(".");
  if (!leadId || !channel || !signature || extra !== undefined) return null;
  if (!(LEAD_CHANNELS as readonly string[]).includes(channel)) return null;
  const expected = Buffer.from(signOptOut(`${leadId}.${channel}`, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { leadId, channel: channel as LeadChannel };
}

export function optOutUrl(appUrl: string, leadId: string, channel: LeadChannel, secret = leadLinkSecret()) {
  return `${appUrl.replace(/\/+$/, "")}/api/public/leads/opt-out?t=${encodeURIComponent(leadOptOutToken(leadId, channel, secret))}`;
}
