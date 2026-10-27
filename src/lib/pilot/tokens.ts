// Signed links to the pilot reply form (/pilot/<token>). Pure (node:crypto), unit-tested.
import { createHmac, timingSafeEqual } from "node:crypto";
import { leadLinkSecret } from "../lead-growth/tokens.ts";

function sign(applicantId: string, secret: string) {
  return createHmac("sha256", secret).update(`pilot-reply:${applicantId}`).digest("base64url").slice(0, 24);
}

/** `<applicantId>.<signature>`: one link per invited person. */
export function pilotToken(applicantId: string, secret = leadLinkSecret()) {
  if (!secret) throw new Error("MARKETING_LINK_SECRET (or CRON_SECRET) must be set to sign pilot links");
  return `${applicantId}.${sign(applicantId, secret)}`;
}

export function verifyPilotToken(token: string | null | undefined, secret = leadLinkSecret()) {
  if (!token || !secret || token.length > 200) return null;
  const [applicantId, signature, extra] = token.split(".");
  if (!applicantId || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(applicantId, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return applicantId;
}

export function pilotReplyUrl(appUrl: string, applicantId: string, secret = leadLinkSecret()) {
  return `${appUrl.replace(/\/+$/, "")}/pilot/${pilotToken(applicantId, secret)}`;
}
