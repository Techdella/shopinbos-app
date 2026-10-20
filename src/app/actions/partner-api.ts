"use server";

import { requireAdminSection } from "@/lib/admin-team/service.server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { createPartnerApiKey, revokePartnerApiKey } from "@/lib/logistics/api-keys";
import { PARTNER_EVENTS, generateWebhookSecret, isAllowedWebhookUrl } from "@/lib/logistics/partner-api-core";
import { sendTestEvent } from "@/lib/logistics/webhooks";

// Admin only: connection keys and webhooks for a delivery partner's own dispatch software. Partners never see
// these; they ask through "Connect your system" (a setup support ticket) and the team sets it up from
// Admin › Developers (/admin/developers).

const MAX_KEYS = 5;
const MAX_WEBHOOKS = 5;

type Fail = { ok: false; error: string };

async function adminPartner(partnerId: string) {
  return db.logisticsPartner.findUnique({ where: { id: String(partnerId) }, select: { id: true, verificationStatus: true, status: true } });
}

const page = (partnerId: string) => `/admin/developers?partner=${partnerId}`;

export async function createApiKeyAction(partnerId: string, name: string): Promise<{ ok: true; key: string; prefix: string } | Fail> {
  await requireAdminSection("developers");
  const partner = await adminPartner(partnerId);
  if (!partner) return { ok: false, error: "Partner not found." };
  if (partner.verificationStatus !== "verified") return { ok: false, error: "Verify this partner first. Keys only work for verified partners." };
  const active = await db.partnerApiKey.count({ where: { logisticsPartnerId: partner.id, revokedAt: null } });
  if (active >= MAX_KEYS) return { ok: false, error: `This partner already has ${MAX_KEYS} active keys. Revoke one first.` };

  const created = await createPartnerApiKey(partner.id, String(name ?? ""));
  revalidatePath(page(partner.id));
  return { ok: true, key: created.key, prefix: created.prefix };
}

/** Rotate: issue a new key with the same name, then revoke the old one. The new key is shown once. */
export async function rotateApiKeyAction(partnerId: string, keyId: string): Promise<{ ok: true; key: string; prefix: string } | Fail> {
  await requireAdminSection("developers");
  const partner = await adminPartner(partnerId);
  if (!partner) return { ok: false, error: "Partner not found." };
  if (partner.verificationStatus !== "verified") return { ok: false, error: "Verify this partner first. Keys only work for verified partners." };
  const old = await db.partnerApiKey.findFirst({ where: { id: String(keyId), logisticsPartnerId: partner.id, revokedAt: null }, select: { id: true, name: true } });
  if (!old) return { ok: false, error: "That key was not found or is already revoked." };

  const created = await createPartnerApiKey(partner.id, old.name);
  await revokePartnerApiKey(partner.id, old.id);
  revalidatePath(page(partner.id));
  return { ok: true, key: created.key, prefix: created.prefix };
}

export async function revokeApiKeyAction(partnerId: string, keyId: string): Promise<{ ok: true } | Fail> {
  await requireAdminSection("developers");
  const partner = await adminPartner(partnerId);
  if (!partner) return { ok: false, error: "Partner not found." };
  if (!(await revokePartnerApiKey(partner.id, String(keyId)))) return { ok: false, error: "That key was not found or is already revoked." };
  revalidatePath(page(partner.id));
  return { ok: true };
}

export async function addWebhookAction(partnerId: string, input: { url: string; events: string[] }): Promise<{ ok: true; secret: string } | Fail> {
  await requireAdminSection("developers");
  const partner = await adminPartner(partnerId);
  if (!partner) return { ok: false, error: "Partner not found." };
  const url = String(input?.url ?? "").trim();
  if (!isAllowedWebhookUrl(url)) return { ok: false, error: "Use a public https:// address for the webhook." };
  const events = Array.isArray(input?.events) ? PARTNER_EVENTS.filter((event) => input.events.includes(event)) : [];
  if (!events.length) return { ok: false, error: "Pick at least one event to send." };
  const count = await db.partnerWebhook.count({ where: { logisticsPartnerId: partner.id } });
  if (count >= MAX_WEBHOOKS) return { ok: false, error: `This partner already has ${MAX_WEBHOOKS} webhooks. Remove one first.` };

  const secret = generateWebhookSecret();
  // Every event selected is stored as "all events" (empty list), so new event types reach them too.
  await db.partnerWebhook.create({
    data: { logisticsPartnerId: partner.id, url, secret, events: events.length === PARTNER_EVENTS.length ? [] : events },
  });
  revalidatePath(page(partner.id));
  return { ok: true, secret };
}

export async function removeWebhookAction(partnerId: string, webhookId: string): Promise<{ ok: true } | Fail> {
  await requireAdminSection("developers");
  const partner = await adminPartner(partnerId);
  if (!partner) return { ok: false, error: "Partner not found." };
  const removed = await db.partnerWebhook.deleteMany({ where: { id: String(webhookId), logisticsPartnerId: partner.id } });
  if (removed.count === 0) return { ok: false, error: "That webhook was not found." };
  revalidatePath(page(partner.id));
  return { ok: true };
}

export async function sendTestWebhookAction(partnerId: string, webhookId: string): Promise<{ ok: true; delivered: boolean; status: number } | Fail> {
  await requireAdminSection("developers");
  const partner = await adminPartner(partnerId);
  if (!partner) return { ok: false, error: "Partner not found." };
  const result = await sendTestEvent(partner.id, String(webhookId));
  if (!result) return { ok: false, error: "That webhook was not found." };
  revalidatePath(page(partner.id));
  return { ok: true, delivered: result.ok, status: result.status };
}
