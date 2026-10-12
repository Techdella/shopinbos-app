import "server-only";

import { db } from "@/lib/db/client";
import { verifyWhatsApp, wabaSubscribed, whatsappTokenExpiry, sendWhatsApp } from "./channels/whatsapp";
import { getChannel, markChannelError } from "./service";
import { normalisePhone } from "./pure";

// The "Put Peggy on your WhatsApp" page's server side: connection health (last message in, Peggy's last reply,
// recent failures, token expiry), "Test connection" against the Graph API, and a test message to the seller's
// own number. Credentials never leave the server.

export interface WhatsAppHealth {
  connected: boolean;
  displayName: string | null;
  phoneNumberId: string | null;
  via: "manual" | "embedded" | null;
  lastError: string | null;
  /** ISO date, "never" for permanent tokens, or null when unknown. */
  tokenExpiresAt: string | null;
  qualityRating: string | null;
  checkedAt: string | null;
  lastInboundAt: string | null;
  lastPeggyReplyAt: string | null;
  peggyRepliesToday: number;
  failedLastDay: number;
  lastFailure: string | null;
  handedOffOpen: number;
}

const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

export async function whatsappHealth(storeId: string): Promise<WhatsAppHealth> {
  const row = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId, channel: "whatsapp" } } });
  const settings = (row?.settings ?? {}) as Record<string, unknown>;
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
  const onWhatsApp = { storeId, conversation: { channel: "whatsapp" } };
  const peggy = { ...onWhatsApp, direction: "outbound", kind: "auto_reply", meta: { path: ["channelBot"], equals: "whatsapp" } };
  const [lastInbound, lastPeggy, peggyToday, failed, lastFailed, handedOff] = await Promise.all([
    db.inboxMessage.findFirst({ where: { ...onWhatsApp, direction: "inbound" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    db.inboxMessage.findFirst({ where: { ...peggy, status: { not: "failed" } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null),
    db.inboxMessage.count({ where: { ...peggy, status: { not: "failed" }, createdAt: { gte: dayAgo } } }).catch(() => 0),
    db.inboxMessage.count({ where: { ...onWhatsApp, direction: "outbound", status: "failed", createdAt: { gte: dayAgo } } }),
    db.inboxMessage.findFirst({ where: { ...onWhatsApp, direction: "outbound", status: "failed", createdAt: { gte: dayAgo } }, orderBy: { createdAt: "desc" }, select: { error: true } }),
    db.inboxConversation.count({ where: { storeId, channel: "whatsapp", status: "open", tags: { has: "needs-human" } } }),
  ]);
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    connected: row?.status === "connected",
    displayName: row?.status === "connected" ? row.displayName : null,
    phoneNumberId: row?.status === "connected" ? row.externalId : null,
    via: settings.via === "embedded" ? "embedded" : settings.via === "manual" ? "manual" : null,
    lastError: row?.status === "connected" ? row.lastError : null,
    tokenExpiresAt: text(settings.tokenExpiresAt),
    qualityRating: text(settings.qualityRating),
    checkedAt: text(settings.checkedAt),
    lastInboundAt: iso(lastInbound?.createdAt),
    lastPeggyReplyAt: iso(lastPeggy?.createdAt),
    peggyRepliesToday: peggyToday,
    failedLastDay: failed,
    lastFailure: lastFailed?.error ?? null,
    handedOffOpen: handedOff,
  };
}

/** "Test connection": token and number still work, the account is subscribed to webhooks, and when the token expires. */
export async function testWhatsAppConnection(storeId: string): Promise<{ ok: true; checks: Array<{ label: string; ok: boolean | null; detail: string }> } | { ok: false; error: string }> {
  const channel = await getChannel(storeId, "whatsapp");
  if (!channel) return { ok: false, error: "WhatsApp isn't connected yet." };
  const { credentials, row } = channel;
  const checks: Array<{ label: string; ok: boolean | null; detail: string }> = [];

  const number = await verifyWhatsApp(credentials);
  checks.push(number.ok ? { label: "Token and phone number", ok: true, detail: number.displayName } : { label: "Token and phone number", ok: false, detail: number.error });

  const wabaId = credentials.wabaId || ((row.settings ?? {}) as Record<string, unknown>).wabaId;
  if (typeof wabaId === "string" && wabaId) {
    const subscribed = await wabaSubscribed(wabaId, credentials.accessToken);
    checks.push({ label: "Messages sent to Shopinbos", ok: subscribed, detail: subscribed ? "Your WhatsApp account is subscribed to webhooks." : subscribed === false ? "No app is subscribed to your WhatsApp account's messages. Reconnect with the account ID, or subscribe in your Meta app." : "Couldn't check the webhook subscription." });
  } else {
    checks.push({ label: "Messages sent to Shopinbos", ok: null, detail: "Add your WhatsApp Business Account ID when connecting so we can check (and set) this for you." });
  }

  const expiry = await whatsappTokenExpiry(credentials.accessToken).catch(() => null);
  const soon = expiry instanceof Date && expiry.getTime() - Date.now() < 7 * 24 * 60 * 60_000;
  checks.push({
    label: "Token expiry",
    ok: expiry === null ? null : expiry === "never" ? true : !soon,
    detail: expiry === "never" ? "Doesn't expire." : expiry instanceof Date ? (expiry.getTime() <= Date.now() ? "Expired. Reconnect with a new token." : `Expires ${expiry.toISOString().slice(0, 10)}.${soon ? " Make a permanent System User token soon." : ""}`) : "Meta didn't say.",
  });

  const settings = { ...((row.settings ?? {}) as Record<string, unknown>), checkedAt: new Date().toISOString(), tokenExpiresAt: expiry === "never" ? "never" : expiry ? expiry.toISOString() : null, ...(number.ok ? { qualityRating: number.qualityRating, phone: number.phone } : {}) };
  await db.inboxChannel.update({ where: { id: row.id }, data: { settings, ...(number.ok ? { lastError: null } : {}) } }).catch(() => null);
  if (!number.ok) await markChannelError(row.id, number.error);
  return { ok: true, checks };
}

/**
 * A test message to the seller's own number. WhatsApp only delivers free-form text inside the 24-hour window, so
 * the seller sends "hi" to their business number first; we don't send paid templates on their behalf.
 */
export async function sendWhatsAppTest(store: { id: string; name: string; slug: string }, to: string, botName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const phone = normalisePhone(to);
  if (!phone) return { ok: false, error: "Enter your own WhatsApp number with the country code, like +2348012345678." };
  const channel = await getChannel(store.id, "whatsapp");
  if (!channel) return { ok: false, error: "Connect WhatsApp first." };
  const result = await sendWhatsApp({
    to: phone,
    body: `Hi from ${botName} at ${store.name}! Your WhatsApp is connected to Shopinbos. Reply "what do you sell" to see what your customers will get.`,
    store,
    credentials: channel.credentials,
  });
  if (result.ok) return { ok: true };
  if (/24 hours|template/i.test(result.error)) return { ok: false, error: `Send "hi" from ${phone} to your business number first, then try again. WhatsApp only lets businesses message people who wrote to them in the last 24 hours (or with an approved template).` };
  return result;
}
