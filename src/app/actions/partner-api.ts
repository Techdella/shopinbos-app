"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { createPartnerApiKey, revokePartnerApiKey } from "@/lib/logistics/api-keys";
import { PARTNER_EVENTS, generateWebhookSecret, isAllowedWebhookUrl } from "@/lib/logistics/partner-api-core";
import { sendTestEvent } from "@/lib/logistics/webhooks";

// "Connect your system" page: API keys and webhooks for a delivery partner's dispatch software.

const MAX_KEYS = 5;
const MAX_WEBHOOKS = 5;
const PAGE = "/logistics/connect";

type Fail = { ok: false; error: string };

async function currentPartner() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  return db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { id: true, verificationStatus: true, status: true } });
}

export async function createApiKeyAction(name: string): Promise<{ ok: true; key: string; prefix: string } | Fail> {
  const partner = await currentPartner();
  if (!partner) return { ok: false, error: "Finish setting up your partner profile first." };
  if (partner.verificationStatus !== "verified") return { ok: false, error: "API keys work once your business is verified." };
  const active = await db.partnerApiKey.count({ where: { logisticsPartnerId: partner.id, revokedAt: null } });
  if (active >= MAX_KEYS) return { ok: false, error: `You can have ${MAX_KEYS} keys at once. Revoke one you no longer use.` };

  const created = await createPartnerApiKey(partner.id, String(name ?? ""));
  revalidatePath(PAGE);
  return { ok: true, key: created.key, prefix: created.prefix };
}

export async function revokeApiKeyAction(keyId: string): Promise<{ ok: true } | Fail> {
  const partner = await currentPartner();
  if (!partner) return { ok: false, error: "Partner profile not found." };
  if (!(await revokePartnerApiKey(partner.id, String(keyId)))) return { ok: false, error: "That key was not found or is already revoked." };
  revalidatePath(PAGE);
  return { ok: true };
}

export async function addWebhookAction(input: { url: string; events: string[] }): Promise<{ ok: true; secret: string } | Fail> {
  const partner = await currentPartner();
  if (!partner) return { ok: false, error: "Partner profile not found." };
  const url = String(input?.url ?? "").trim();
  if (!isAllowedWebhookUrl(url)) return { ok: false, error: "Use a public https:// address for your webhook." };
  const events = Array.isArray(input?.events) ? PARTNER_EVENTS.filter((event) => input.events.includes(event)) : [];
  if (!events.length) return { ok: false, error: "Pick at least one event to receive." };
  const count = await db.partnerWebhook.count({ where: { logisticsPartnerId: partner.id } });
  if (count >= MAX_WEBHOOKS) return { ok: false, error: `You can have ${MAX_WEBHOOKS} webhooks. Remove one first.` };

  const secret = generateWebhookSecret();
  // Every event selected is stored as "all events" (empty list), so new event types reach them too.
  await db.partnerWebhook.create({
    data: { logisticsPartnerId: partner.id, url, secret, events: events.length === PARTNER_EVENTS.length ? [] : events },
  });
  revalidatePath(PAGE);
  return { ok: true, secret };
}

export async function removeWebhookAction(webhookId: string): Promise<{ ok: true } | Fail> {
  const partner = await currentPartner();
  if (!partner) return { ok: false, error: "Partner profile not found." };
  const removed = await db.partnerWebhook.deleteMany({ where: { id: String(webhookId), logisticsPartnerId: partner.id } });
  if (removed.count === 0) return { ok: false, error: "That webhook was not found." };
  revalidatePath(PAGE);
  return { ok: true };
}

export async function sendTestWebhookAction(webhookId: string): Promise<{ ok: true; delivered: boolean; status: number } | Fail> {
  const partner = await currentPartner();
  if (!partner) return { ok: false, error: "Partner profile not found." };
  const result = await sendTestEvent(partner.id, String(webhookId));
  if (!result) return { ok: false, error: "That webhook was not found." };
  revalidatePath(PAGE);
  return { ok: true, delivered: result.ok, status: result.status };
}
