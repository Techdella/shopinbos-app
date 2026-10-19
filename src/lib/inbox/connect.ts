import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { recordMetaUser } from "@/lib/meta/user-links.server";
import { encryptJson, decryptJson, hasCredentialKey, randomSecret } from "./crypto";
import { inboxAddress, inboxEmailDomain } from "./channels/email";
import { disconnectEmail } from "@/lib/email-channel/gmail.server";
import { subscribePage, verifyMetaPage } from "./channels/meta";
import { connectTelegram, disconnectTelegram } from "./channels/telegram";
import { smsProvider, SMS_PROVIDER_MODULES } from "@/lib/sms";
import { isSmsProvider, providerWebhookUrl, SMS_PROVIDER_LABELS, storeNumber, termiiBaseUrl, type SmsProviderKey } from "@/lib/sms/pure";
import { appUrl } from "./channels/types";
import { embeddedSignupConfig, exchangeSignupCode, registerWhatsAppNumber, subscribeWaba, verifyWhatsApp, whatsappTokenExpiry } from "./channels/whatsapp";
import { CONNECTABLE_CHANNELS, normalisePhone, type ConnectableChannel } from "./pure";

// Connecting a channel: validate what the seller pasted, check it with the provider, encrypt it, and wire the
// provider's webhook to us where its API allows (Telegram setWebhook, Meta Page subscription).
// SMS and phone-call providers (Termii, Africa's Talking, Sendchamp) have no API for that: the seller pastes the
// webhook URL we show, which carries the channel id and a secret token.

const token = z.string().trim().min(10, "Paste the full token").max(1000);
const optionalSecret = z.string().trim().max(200).optional().transform((v) => v || undefined);

export const CONNECT_SCHEMAS = {
  email: z.object({}).strict(),
  whatsapp: z.object({ accessToken: token, phoneNumberId: z.string().trim().regex(/^\d{6,25}$/, "The phone number ID is a long number from WhatsApp → API Setup"), wabaId: z.string().trim().regex(/^\d*$/).optional(), appSecret: optionalSecret }).strict(),
  messenger: z.object({ pageAccessToken: token, appSecret: optionalSecret }).strict(),
  instagram: z.object({ pageAccessToken: token, appSecret: optionalSecret }).strict(),
  sms: z
    .object({
      provider: z.enum(["termii", "africastalking", "sendchamp"], { message: "Choose Termii, Africa's Talking or Sendchamp" }),
      apiKey: z.string().trim().min(8, "Paste the full API key").max(500),
      username: z.string().trim().max(100).optional(),
      senderId: z.string().trim().regex(/^[A-Za-z0-9 .&-]{3,11}$/, "A sender ID is 3 to 11 letters or numbers").optional(),
      phoneNumber: z.string().trim().max(30).optional(),
      secretKey: optionalSecret,
      route: z.enum(["dnd", "generic", "non_dnd", "international"]).optional(),
      baseUrl: z.string().trim().max(200).optional(),
    })
    .strict(),
  voice: z
    .object({
      username: z.string().trim().max(100).optional(),
      apiKey: z.string().trim().max(500).optional(),
      phoneNumber: z.string().trim().max(30).optional(),
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
  /** SMS and phone calls: which provider the store's account is on (null for rows from the old provider). */
  provider?: SmsProviderKey | null;
}

export function webhookUrlFor(channel: ConnectableChannel, rowId?: string, sms?: { provider: unknown; token: string | null }) {
  switch (channel) {
    case "email":
      return `${appUrl()}/api/webhooks/email`;
    case "whatsapp":
      return `${appUrl()}/api/webhooks/whatsapp`;
    case "messenger":
    case "instagram":
      return `${appUrl()}/api/webhooks/meta`;
    case "sms":
    case "voice":
      return rowId && sms?.token && isSmsProvider(sms.provider) ? providerWebhookUrl(appUrl(), channel, sms.provider, rowId, sms.token) : null;
    case "telegram":
      return rowId ? `${appUrl()}/api/webhooks/telegram/${rowId}` : null;
  }
}

export const RECONNECT_MESSAGE = "SMS and calls now run on Termii, Africa's Talking or Sendchamp. Connect your account again to keep receiving messages.";

/** Every connectable channel's status for the store, safe to send to the browser (no credentials). */
export async function channelViews(storeId: string): Promise<ChannelView[]> {
  const rows = await db.inboxChannel.findMany({ where: { storeId } });
  return CONNECTABLE_CHANNELS.map((channel) => {
    const row = rows.find((r) => r.channel === channel);
    const meta = channel === "whatsapp" || channel === "messenger" || channel === "instagram";
    const phone = channel === "sms" || channel === "voice";
    const provider = phone ? ((row?.settings as { provider?: unknown } | null)?.provider ?? null) : null;
    // SMS and calls used to run on another provider; those rows have no provider and must be connected again.
    const legacy = phone && row?.status === "connected" && !isSmsProvider(provider);
    return {
      channel,
      status: legacy ? "error" : ((row?.status as ChannelView["status"]) ?? "disconnected"),
      displayName: row?.displayName ?? null,
      account: row?.externalId ?? null,
      connectedAt: row?.connectedAt?.toISOString() ?? null,
      lastError: legacy ? RECONNECT_MESSAGE : (row?.lastError ?? null),
      webhookUrl: phone ? (row?.status === "connected" ? webhookUrlFor(channel, row.id, { provider, token: row.webhookSecret }) : null) : webhookUrlFor(channel, row?.id),
      provider: phone ? (isSmsProvider(provider) ? provider : null) : undefined,
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
    whatsappEmbeddedSignup: embeddedSignupConfig() !== null,
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
    // The store's Shopinbos inbox address. A domain set up earlier stays in the settings, so it can be finished later.
    const current = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId: store.id, channel: "email" } }, select: { settings: true } });
    const { gmail: _gmail, ...kept } = (current?.settings as Record<string, unknown> | null) ?? {};
    void _gmail;
    await save(store.id, "email", { externalId: address, displayName: address ?? "Replies by email", credentials: null, settings: { ...kept, provider: "platform" } });
    return { ok: true, view: await viewOf(store.id, "email") };
  }

  if (channel === "whatsapp") {
    const credentials = { accessToken: input.accessToken!, phoneNumberId: input.phoneNumberId!, ...(input.wabaId ? { wabaId: input.wabaId } : {}), ...(input.appSecret ? { appSecret: input.appSecret } : {}) };
    return saveWhatsApp(store.id, credentials, "manual");
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
    await recordMetaUser(store.id, channel === "instagram" ? "inbox_instagram" : "inbox_messenger", input.pageAccessToken!);
    return { ok: true, view: await viewOf(store.id, channel) };
  }

  if (channel === "sms") return connectSms(store, input);
  if (channel === "voice") return connectVoice(store, input);

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

// ─── WhatsApp ────────────────────────────────────────────────────────────────

/**
 * Checks WhatsApp credentials with Meta, subscribes the business account to our webhook (when we know its id),
 * and saves them encrypted. Token expiry and how it was connected go in the channel's settings for the health card.
 */
async function saveWhatsApp(storeId: string, credentials: Record<string, string>, via: "manual" | "embedded"): Promise<Result> {
  if (await claimedElsewhere(storeId, "whatsapp", credentials.phoneNumberId)) return { ok: false, error: "This WhatsApp number is already connected to another store." };
  const check = await verifyWhatsApp(credentials);
  if (!check.ok) return check;
  const subscribed = credentials.wabaId ? await subscribeWaba(credentials.wabaId, credentials.accessToken) : null;
  const expiry = await whatsappTokenExpiry(credentials.accessToken).catch(() => null);
  const row = await save(storeId, "whatsapp", {
    externalId: credentials.phoneNumberId,
    displayName: check.displayName,
    credentials,
    webhookSecret: randomSecret(),
    settings: {
      via,
      wabaId: credentials.wabaId ?? null,
      phone: check.phone,
      qualityRating: check.qualityRating,
      tokenExpiresAt: expiry === "never" ? "never" : expiry ? expiry.toISOString() : null,
      checkedAt: new Date().toISOString(),
    },
  });
  if (subscribed && !subscribed.ok) await db.inboxChannel.update({ where: { id: row.id }, data: { lastError: subscribed.error } });
  await recordMetaUser(storeId, "inbox_whatsapp", credentials.accessToken);
  return { ok: true, view: await viewOf(storeId, "whatsapp") };
}

const EmbeddedSignupSchema = z.object({ code: z.string().trim().min(10).max(2000), phoneNumberId: z.string().trim().regex(/^\d{6,25}$/), wabaId: z.string().trim().regex(/^\d{6,25}$/) }).strict();

/**
 * Embedded Signup finished in the browser: exchange the code for the business's token (server to server),
 * subscribe our app to their WhatsApp account, register the number with a random two-step PIN, and save.
 * Webhooks then arrive signed with the platform's META_APP_SECRET.
 */
export async function connectWhatsAppEmbedded(store: { id: string }, raw: unknown): Promise<Result> {
  const parsed = EmbeddedSignupSchema.safeParse(raw ?? {});
  if (!parsed.success) return { ok: false, error: "WhatsApp sign-up didn't send back your number. Start again." };
  if (!hasCredentialKey()) return { ok: false, error: "This server can't store channel keys safely yet (INBOX_ENCRYPTION_KEY isn't set). Ask your Shopinbos admin." };
  const exchanged = await exchangeSignupCode(parsed.data.code);
  if (!exchanged.ok) return exchanged;
  const pin = String(100000 + (randomBytes(4).readUInt32BE(0) % 900000));
  const registered = await registerWhatsAppNumber(parsed.data.phoneNumberId, exchanged.accessToken, pin);
  if (!registered.ok) return registered;
  return saveWhatsApp(store.id, { accessToken: exchanged.accessToken, phoneNumberId: parsed.data.phoneNumberId, wabaId: parsed.data.wabaId, pin }, "embedded");
}

// ─── SMS and phone calls (Termii, Africa's Talking, Sendchamp) ──────────────

/** Keep a channel's webhook token across reconnects, so the URL pasted in the provider's dashboard keeps working. */
async function keepSecret(storeId: string, channel: ConnectableChannel) {
  const row = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId, channel } }, select: { webhookSecret: true } });
  return row?.webhookSecret || randomSecret();
}

async function connectSms(store: { id: string }, input: Record<string, string | undefined>): Promise<Result> {
  const key = input.provider as SmsProviderKey;
  const provider = SMS_PROVIDER_MODULES[key];
  const number = provider.twoWay ? storeNumber(input.phoneNumber) : null;
  if (input.phoneNumber && provider.twoWay && !number) return { ok: false, error: "Enter the number in +234… format, or the shortcode's digits." };
  if (key === "africastalking" && !input.username) return { ok: false, error: "Enter your Africa's Talking app username." };
  if (key === "termii" && !input.senderId && !number) return { ok: false, error: "Enter your approved Termii sender ID, or your Termii number." };
  if (key === "termii" && termiiBaseUrl(input.baseUrl) === null) return { ok: false, error: "The Termii base URL must be the https://….termii.com address from your Termii dashboard." };
  if (input.route && !(key === "termii" ? ["dnd", "generic"] : key === "sendchamp" ? ["dnd", "non_dnd", "international"] : []).includes(input.route)) {
    return { ok: false, error: "That route isn't available on this provider." };
  }
  if (number && (await claimedElsewhere(store.id, "sms", number))) return { ok: false, error: "This number is already connected to another store." };

  const credentials: Record<string, string> = { provider: key, apiKey: input.apiKey! };
  for (const field of ["username", "senderId", "secretKey", "route"] as const) if (input[field]) credentials[field] = input[field]!;
  if (number) credentials.phoneNumber = number;
  if (key === "termii" && input.baseUrl) credentials.baseUrl = termiiBaseUrl(input.baseUrl)!;
  const check = await provider.verify(credentials as never);
  if (!check.ok) return check;

  const label = SMS_PROVIDER_LABELS[key];
  const twoWay = Boolean(number && provider.twoWay);
  await save(store.id, "sms", {
    externalId: number ?? credentials.senderId ?? null,
    displayName: `${label} · ${[credentials.senderId, number].filter(Boolean).join(" / ") || check.detail}${twoWay ? "" : " (send only)"}`,
    credentials,
    webhookSecret: await keepSecret(store.id, "sms"),
    settings: { provider: key, twoWay, senderId: credentials.senderId ?? null },
  });
  return { ok: true, view: await viewOf(store.id, "sms") };
}

/** Phone calls run on Africa's Talking Voice. The AT keys can be reused from an Africa's Talking SMS connection. */
async function connectVoice(store: { id: string }, input: Record<string, string | undefined>): Promise<Result> {
  let username = input.username;
  let apiKey = input.apiKey;
  if (!username || !apiKey) {
    const sms = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId: store.id, channel: "sms" } } });
    const saved = sms?.status === "connected" ? decryptJson<Record<string, string>>(sms.credentials) : null;
    if (saved?.provider === "africastalking") {
      username ||= saved.username;
      apiKey ||= saved.apiKey;
    }
  }
  const number = storeNumber(input.phoneNumber);
  if (!username || !apiKey || !number) return { ok: false, error: "Enter your Africa's Talking username, API key and voice number (+234…)." };
  if (await claimedElsewhere(store.id, "voice", number)) return { ok: false, error: "This number is already connected to another store." };
  const credentials = { provider: "africastalking", username, apiKey, phoneNumber: number };
  const check = await smsProvider("africastalking")!.verify(credentials as never);
  if (!check.ok) return check;
  await save(store.id, "voice", { externalId: number, displayName: `Africa's Talking · ${number}`, credentials, webhookSecret: await keepSecret(store.id, "voice"), settings: { provider: "africastalking" } });
  const forward = normalisePhone(input.forwardCallsTo);
  await db.inboxSettings.upsert({ where: { storeId: store.id }, create: { storeId: store.id, forwardCallsTo: forward }, update: { forwardCallsTo: forward } });
  return { ok: true, view: await viewOf(store.id, "voice") };
}

export async function disconnectChannel(storeId: string, channel: ConnectableChannel) {
  if (channel === "email") return disconnectEmail(storeId);
  const row = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId, channel } } });
  if (!row) return;
  if (channel === "telegram") {
    const credentials = decryptJson<Record<string, string>>(row.credentials);
    if (credentials?.botToken) await disconnectTelegram(credentials.botToken).catch(() => null);
  }
  // Keep the conversations; forget the keys.
  await db.inboxChannel.update({ where: { id: row.id }, data: { status: "disconnected", credentials: null, webhookSecret: null, lastError: null } });
}
