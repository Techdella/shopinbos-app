import "server-only";

import { z } from "zod";
import { db } from "@/lib/db/client";
import { encryptJson, decryptJson, hasCredentialKey, randomSecret } from "./crypto";
import { inboxAddress, inboxEmailDomain } from "./channels/email";
import { subscribePage, verifyMetaPage } from "./channels/meta";
import { connectTelegram, disconnectTelegram } from "./channels/telegram";
import { pointTwilioNumber, verifyTwilio } from "./channels/twilio";
import { appUrl, GRAPH_URL } from "./channels/types";
import { verifyWhatsApp } from "./channels/whatsapp";
import { CONNECTABLE_CHANNELS, normalisePhone, type ConnectableChannel } from "./pure";

// Connecting a channel: validate what the seller pasted, check it with the provider, encrypt it, and wire the
// provider's webhook to us where its API allows (Telegram setWebhook, Twilio number URLs, Meta Page subscription).

const token = z.string().trim().min(10, "Paste the full token").max(1000);
const optionalSecret = z.string().trim().max(200).optional().transform((v) => v || undefined);

export const CONNECT_SCHEMAS = {
  email: z.object({}).strict(),
  whatsapp: z.object({ accessToken: token, phoneNumberId: z.string().trim().regex(/^\d{6,25}$/, "The phone number ID is a long number from WhatsApp → API Setup"), wabaId: z.string().trim().regex(/^\d*$/).optional(), appSecret: optionalSecret }).strict(),
  messenger: z.object({ pageAccessToken: token, appSecret: optionalSecret }).strict(),
  instagram: z.object({ pageAccessToken: token, appSecret: optionalSecret }).strict(),
  sms: z.object({ accountSid: z.string().trim().regex(/^AC[0-9a-fA-F]{32}$/, "Account SID starts with AC"), authToken: z.string().trim().min(16).max(64), phoneNumber: z.string().trim().min(6) }).strict(),
  voice: z
    .object({
      accountSid: z.string().trim().optional(),
      authToken: z.string().trim().optional(),
      phoneNumber: z.string().trim().optional(),
      forwardCallsTo: z.string().trim().max(30).optional(),
    })
    .strict(),
  telegram: z.object({ botToken: z.string().trim().regex(/^\d+:[A-Za-z0-9_-]{20,}$/, "A bot token looks like 123456:ABC-DEF…") }).strict(),
} satisfies Record<ConnectableChannel, z.ZodType>;

export interface ChannelView {
  channel: ConnectableChannel;
  status: "connected" | "error" | "disconnected";
  displayName: string | null;
  account: string | null;
  connectedAt: string | null;
  lastError: string | null;
  webhookUrl: string | null;
  verifyToken: string | null;
}

export function webhookUrlFor(channel: ConnectableChannel, rowId?: string) {
  switch (channel) {
    case "email":
      return `${appUrl()}/api/webhooks/email`;
    case "whatsapp":
      return `${appUrl()}/api/webhooks/whatsapp`;
    case "messenger":
    case "instagram":
      return `${appUrl()}/api/webhooks/meta`;
    case "sms":
      return `${appUrl()}/api/webhooks/twilio/sms`;
    case "voice":
      return `${appUrl()}/api/webhooks/twilio/voice?step=incoming`;
    case "telegram":
      return rowId ? `${appUrl()}/api/webhooks/telegram/${rowId}` : null;
  }
}

/** Every connectable channel's status for the store, safe to send to the browser (no credentials). */
export async function channelViews(storeId: string): Promise<ChannelView[]> {
  const rows = await db.inboxChannel.findMany({ where: { storeId } });
  return CONNECTABLE_CHANNELS.map((channel) => {
    const row = rows.find((r) => r.channel === channel);
    const meta = channel === "whatsapp" || channel === "messenger" || channel === "instagram";
    return {
      channel,
      status: (row?.status as ChannelView["status"]) ?? "disconnected",
      displayName: row?.displayName ?? null,
      account: row?.externalId ?? null,
      connectedAt: row?.connectedAt?.toISOString() ?? null,
      lastError: row?.lastError ?? null,
      webhookUrl: webhookUrlFor(channel, row?.id),
      // Sellers using their own Meta app paste this into the app's webhook settings. It only proves the handshake.
      verifyToken: meta && row?.status === "connected" ? row.webhookSecret : null,
    };
  });
}

export function platformReadiness() {
  return {
    encryption: hasCredentialKey(),
    resend: Boolean(process.env.RESEND_API_KEY),
    resendInbound: Boolean(process.env.RESEND_WEBHOOK_SECRET || process.env.INBOX_EMAIL_WEBHOOK_SECRET),
    emailDomain: inboxEmailDomain(),
    metaAppSecret: Boolean(process.env.META_APP_SECRET),
    metaVerifyToken: Boolean(process.env.META_WEBHOOK_VERIFY_TOKEN),
  };
}

type Result = { ok: true; view: ChannelView } | { ok: false; error: string };

async function save(storeId: string, channel: ConnectableChannel, data: { externalId: string | null; displayName: string; credentials: Record<string, string> | null; webhookSecret?: string | null; settings?: Record<string, unknown> }) {
  const encrypted = data.credentials ? encryptJson(data.credentials) : null;
  const values = {
    status: "connected",
    externalId: data.externalId,
    displayName: data.displayName,
    credentials: encrypted,
    webhookSecret: data.webhookSecret ?? null,
    settings: (data.settings ?? {}) as object,
    lastError: null,
    connectedAt: new Date(),
  };
  return db.inboxChannel.upsert({ where: { storeId_channel: { storeId, channel } }, create: { storeId, channel, ...values }, update: values });
}

async function viewOf(storeId: string, channel: ConnectableChannel) {
  return (await channelViews(storeId)).find((v) => v.channel === channel)!;
}

/** Another store already uses this account: webhooks would be ambiguous, so refuse. */
async function claimedElsewhere(storeId: string, channel: ConnectableChannel, externalId: string) {
  const other = await db.inboxChannel.findFirst({ where: { channel, externalId, status: "connected", storeId: { not: storeId } }, select: { id: true } });
  return Boolean(other);
}

export async function connectChannel(store: { id: string; slug: string }, channel: ConnectableChannel, raw: unknown): Promise<Result> {
  const parsed = CONNECT_SCHEMAS[channel].safeParse(raw ?? {});
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the details and try again." };
  const input = parsed.data as Record<string, string | undefined>;
  if (channel !== "email" && !hasCredentialKey()) {
    return { ok: false, error: "This server can't store channel keys safely yet (INBOX_ENCRYPTION_KEY isn't set). Ask your Shopinbos admin." };
  }

  if (channel === "email") {
    if (!process.env.RESEND_API_KEY) return { ok: false, error: "Email sending isn't set up on this server yet (RESEND_API_KEY)." };
    const address = inboxAddress(store.slug);
    await save(store.id, "email", { externalId: address, displayName: address ?? "Replies by email", credentials: null });
    return { ok: true, view: await viewOf(store.id, "email") };
  }

  if (channel === "whatsapp") {
    const credentials = { accessToken: input.accessToken!, phoneNumberId: input.phoneNumberId!, ...(input.appSecret ? { appSecret: input.appSecret } : {}) };
    if (await claimedElsewhere(store.id, channel, credentials.phoneNumberId)) return { ok: false, error: "This WhatsApp number is already connected to another store." };
    const check = await verifyWhatsApp(credentials);
    if (!check.ok) return check;
    if (input.wabaId) {
      // Subscribe our app to the business account so Meta sends this number's messages to the webhook.
      await fetch(`${GRAPH_URL}/${encodeURIComponent(input.wabaId)}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${credentials.accessToken}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    }
    await save(store.id, channel, { externalId: credentials.phoneNumberId, displayName: check.displayName, credentials, webhookSecret: randomSecret() });
    return { ok: true, view: await viewOf(store.id, channel) };
  }

  if (channel === "messenger" || channel === "instagram") {
    const check = await verifyMetaPage({ pageAccessToken: input.pageAccessToken! }, channel === "instagram");
    if (!check.ok) return check;
    const externalId = channel === "instagram" ? check.igAccountId! : check.pageId;
    if (await claimedElsewhere(store.id, channel, externalId)) return { ok: false, error: "This account is already connected to another store." };
    const subscribed = await subscribePage(check.pageId, input.pageAccessToken!);
    const credentials = { pageAccessToken: input.pageAccessToken!, pageId: check.pageId, ...(input.appSecret ? { appSecret: input.appSecret } : {}) };
    const row = await save(store.id, channel, { externalId, displayName: check.displayName, credentials, webhookSecret: randomSecret() });
    if (!subscribed.ok) await db.inboxChannel.update({ where: { id: row.id }, data: { lastError: subscribed.error } });
    return { ok: true, view: await viewOf(store.id, channel) };
  }

  if (channel === "sms" || channel === "voice") {
    let accountSid = input.accountSid;
    let authToken = input.authToken;
    let phoneNumber = input.phoneNumber;
    if (channel === "voice" && (!accountSid || !authToken || !phoneNumber)) {
      // Phone calls can reuse the Twilio account already connected for SMS.
      const sms = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId: store.id, channel: "sms" } } });
      const saved = sms?.status === "connected" ? decryptJson<Record<string, string>>(sms.credentials) : null;
      accountSid ||= saved?.accountSid;
      authToken ||= saved?.authToken;
      phoneNumber ||= saved?.phoneNumber;
    }
    const number = normalisePhone(phoneNumber);
    if (!accountSid || !/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !authToken || !number) return { ok: false, error: "Enter your Twilio Account SID, Auth Token and Twilio phone number." };
    if (await claimedElsewhere(store.id, channel, number)) return { ok: false, error: "This Twilio number is already connected to another store." };
    const credentials = { accountSid, authToken, phoneNumber: number };
    const check = await verifyTwilio(credentials);
    if (!check.ok) return check;
    const pointed = await pointTwilioNumber(credentials, check.numberSid, channel);
    const row = await save(store.id, channel, { externalId: number, displayName: check.displayName, credentials });
    if (!pointed.ok) await db.inboxChannel.update({ where: { id: row.id }, data: { lastError: `${pointed.error} Set the webhook in Twilio by hand.` } });
    if (channel === "voice") {
      const forward = normalisePhone(input.forwardCallsTo);
      await db.inboxSettings.upsert({ where: { storeId: store.id }, create: { storeId: store.id, forwardCallsTo: forward }, update: { forwardCallsTo: forward } });
    }
    return { ok: true, view: await viewOf(store.id, channel) };
  }

  // Telegram: the webhook URL carries the row id, so create the row first.
  const secret = randomSecret();
  const pending = await db.inboxChannel.upsert({
    where: { storeId_channel: { storeId: store.id, channel: "telegram" } },
    create: { storeId: store.id, channel: "telegram", status: "disconnected", webhookSecret: secret },
    update: { webhookSecret: secret },
  });
  const check = await connectTelegram(input.botToken!, pending.id, secret);
  if (!check.ok) {
    await db.inboxChannel.update({ where: { id: pending.id }, data: { status: "disconnected", lastError: check.error } });
    return check;
  }
  await save(store.id, "telegram", { externalId: check.botId, displayName: check.displayName, credentials: { botToken: input.botToken! }, webhookSecret: secret });
  return { ok: true, view: await viewOf(store.id, "telegram") };
}

export async function disconnectChannel(storeId: string, channel: ConnectableChannel) {
  const row = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId, channel } } });
  if (!row) return;
  if (channel === "telegram") {
    const credentials = decryptJson<Record<string, string>>(row.credentials);
    if (credentials?.botToken) await disconnectTelegram(credentials.botToken).catch(() => null);
  }
  // Keep the conversations; forget the keys.
  await db.inboxChannel.update({ where: { id: row.id }, data: { status: "disconnected", credentials: null, webhookSecret: null, lastError: null } });
}
