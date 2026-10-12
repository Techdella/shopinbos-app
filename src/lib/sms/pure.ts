// SMS and voice providers used in Nigeria (Termii, Africa's Talking, Sendchamp): the pure parts. Which platform
// provider to try first, the webhook checks, the parsers that turn each provider's callbacks into one shape, the
// send-response readers and Africa's Talking voice XML. No server imports (only node:crypto), so they are
// unit-tested in tests/sms-providers.test.mjs.
//
// What each provider offers (checked against their docs, October 2026):
//   Termii           send (single + bulk up to 100, routes "dnd" | "generic"), delivery reports and inbound
//                    messages to one webhook set in the Termii console, signed with X-Termii-Signature
//                    (HMAC-SHA512 of the body with the account's secret key). Inbound needs a Termii number.
//   Africa's Talking send (form POST, alphanumeric sender ID or shortcode), delivery reports and incoming
//                    messages as form POSTs to callback URLs set in the AT dashboard. Inbound needs a shortcode
//                    (shared with a keyword, or dedicated). No signature: we use a secret token in the URL and
//                    an optional IP allow list. Voice: outbound calls, call-handling XML, recordings.
//   Sendchamp        send (routes "dnd" | "non_dnd" | "international"), delivery reports to a dashboard webhook.
//                    One-way only: there is no inbound SMS. No documented signature: secret token in the URL.

import { createHmac, timingSafeEqual } from "node:crypto";

export type SmsProviderKey = "termii" | "africastalking" | "sendchamp";
export const SMS_PROVIDERS: SmsProviderKey[] = ["termii", "africastalking", "sendchamp"];

export const SMS_PROVIDER_LABELS: Record<SmsProviderKey, string> = {
  termii: "Termii",
  africastalking: "Africa's Talking",
  sendchamp: "Sendchamp",
};

/** Providers that can deliver messages customers send back to the store. */
export const TWO_WAY_PROVIDERS: SmsProviderKey[] = ["termii", "africastalking"];

export function isSmsProvider(value: unknown): value is SmsProviderKey {
  return typeof value === "string" && (SMS_PROVIDERS as string[]).includes(value);
}

export type SendOutcome = { ok: true; externalId: string | null } | { ok: false; error: string };

export interface InboundSms {
  /** The store's number or shortcode the customer texted. */
  to: string;
  from: string;
  /** The customer's number in E.164, when it is one. */
  phone: string | null;
  text: string;
  externalId: string | null;
  timestamp: Date;
}

export interface SmsStatus {
  externalId: string;
  status: "sent" | "delivered" | "failed";
  error: string | null;
}

// ─── Small helpers ───────────────────────────────────────────────────────────

const asRecord = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
const str = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");

/** Same rules as the inbox's normalisePhone: "+234 801…", "0801…", "234801…" → "+234801…". */
export function e164(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value).replace(/^(tel|sms):/i, "").trim();
  let digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (!raw.startsWith("+") && digits.length === 11 && digits.startsWith("0")) digits = `234${digits.slice(1)}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** A store number for lookups: E.164 for phone numbers, bare digits for shortcodes ("33012"). */
export function storeNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const phone = e164(value);
  if (phone) return phone;
  const digits = String(value).replace(/[^\d]/g, "");
  return digits.length >= 3 && digits.length <= 7 ? digits : null;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function date(value: unknown) {
  const text = str(value);
  if (!text) return new Date();
  const parsed = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(text) ? `${text.replace(" ", "T")}Z` : text);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export const TERMII_DEFAULT_BASE_URL = "https://v3.api.termii.com";

/** A Termii base URL from the dashboard, only on termii.com over HTTPS (keys are never sent anywhere else). */
export function termiiBaseUrl(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return TERMII_DEFAULT_BASE_URL;
  try {
    const url = new URL(value.trim().includes("://") ? value.trim() : `https://${value.trim()}`);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (url.hostname !== "termii.com" && !url.hostname.endsWith(".termii.com")) return null;
    return `https://${url.hostname}`;
  } catch {
    return null;
  }
}

// ─── Platform provider choice ────────────────────────────────────────────────

type Env = Record<string, string | undefined>;

export function providerConfigured(key: SmsProviderKey, env: Env): boolean {
  if (key === "termii") return Boolean(env.TERMII_API_KEY);
  if (key === "africastalking") return Boolean(env.AFRICASTALKING_API_KEY && env.AFRICASTALKING_USERNAME);
  return Boolean(env.SENDCHAMP_API_KEY);
}

/**
 * The order the platform tries providers in for OTP, notifications, marketing and review requests.
 * SMS_PROVIDER names the first choice (or a comma list, e.g. "termii,africastalking"); every other configured
 * provider follows as a fallback. Providers without keys are left out.
 */
export function platformProviderOrder(env: Env): SmsProviderKey[] {
  const wanted = (env.SMS_PROVIDER ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/[^a-z]/g, ""))
    .filter(isSmsProvider);
  const order = [...wanted, ...SMS_PROVIDERS.filter((key) => !wanted.includes(key))];
  return Array.from(new Set(order)).filter((key) => providerConfigured(key, env));
}

// ─── Webhook checks ──────────────────────────────────────────────────────────

/** Termii: X-Termii-Signature = HMAC-SHA512(secret key, raw body). Hex in practice; base64 accepted too. */
export function verifyTermiiSignature(rawBody: string, header: string | null | undefined, secret: string | null | undefined) {
  if (!header || !secret) return false;
  const mac = createHmac("sha512", secret).update(rawBody, "utf8");
  const digest = mac.digest();
  const given = header.trim();
  return safeEqual(given.toLowerCase(), digest.toString("hex")) || safeEqual(given, digest.toString("base64"));
}

/** The secret token we put in every webhook URL we hand out (for providers that don't sign requests). */
export function verifyUrlToken(given: string | null | undefined, expected: string | null | undefined) {
  if (!given || !expected) return false;
  return safeEqual(given, expected);
}

function ipv4ToInt(ip: string) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * Optional allow list (SMS_WEBHOOK_ALLOWED_IPS: "1.2.3.4, 5.6.7.0/24"). An empty list allows everyone, since the
 * URL token is the main check. Exact match for IPv6, exact or CIDR for IPv4.
 */
export function ipAllowed(ip: string | null | undefined, allowList: string | null | undefined) {
  const entries = (allowList ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!entries.length) return true;
  if (!ip) return false;
  const address = ip.trim().replace(/^::ffff:/, "");
  for (const entry of entries) {
    if (!entry.includes("/")) {
      if (entry === address) return true;
      continue;
    }
    const [base, bitsText] = entry.split("/");
    const bits = Number(bitsText);
    const a = ipv4ToInt(address);
    const b = ipv4ToInt(base);
    if (a === null || b === null || !Number.isInteger(bits) || bits < 0 || bits > 32) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if (((a & mask) >>> 0) === ((b & mask) >>> 0)) return true;
  }
  return false;
}

/**
 * The webhook URL a store pastes into its provider dashboard: the channel row id says whose it is, the token
 * proves it came from someone we gave the URL to. Without a row (platform account) it carries SMS_WEBHOOK_SECRET.
 */
export function providerWebhookUrl(appUrl: string, kind: "sms" | "voice", provider: SmsProviderKey, rowId: string | null, token: string | null) {
  const url = new URL(`${appUrl.replace(/\/$/, "")}/api/webhooks/${kind}/${provider}`);
  if (rowId) url.searchParams.set("channel", rowId);
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

/** The caller's IP behind Vercel / a proxy. */
export function clientIp(headers: { get(name: string): string | null }) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || null;
}

/** Reads a webhook body as JSON, or as form fields when it isn't JSON. */
export function parseBody(raw: string): Record<string, unknown> {
  const text = raw.trim();
  if (text.startsWith("{")) {
    try {
      return asRecord(JSON.parse(text));
    } catch {
      return {};
    }
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(text)) out[key] = value;
  return out;
}

// ─── Inbound messages and delivery reports ───────────────────────────────────

/** Termii webhook: { type: "inbound", sender, receiver, message, message_id, received_at }. */
export function parseTermiiInbound(payload: unknown): InboundSms | null {
  const p = asRecord(payload);
  if (str(p.type).toLowerCase() !== "inbound" && str(p.status).toLowerCase() !== "received") return null;
  const from = str(p.sender);
  const to = str(p.receiver);
  if (!from || !to) return null;
  return { to: storeNumber(to) ?? to, from, phone: e164(from), text: str(p.message), externalId: str(p.message_id) || str(p.id) || null, timestamp: date(p.received_at) };
}

/** Termii delivery report: { message_id, status: "DELIVERED" | "Message Failed" | "DND Active on Phone Number" | … }. */
export function parseTermiiStatus(payload: unknown): SmsStatus | null {
  const p = asRecord(payload);
  if (str(p.type).toLowerCase() === "inbound") return null;
  const externalId = str(p.message_id) || str(p.id);
  const raw = str(p.status);
  if (!externalId || !raw) return null;
  const status = statusFrom(raw);
  if (!status) return null;
  return { externalId, status, error: status === "failed" ? `Termii: ${raw}` : null };
}

/** Africa's Talking incoming message callback (form): from, to, text, id, date, linkId, networkCode. */
export function parseAfricasTalkingInbound(params: Record<string, unknown>): InboundSms | null {
  const from = str(params.from);
  const to = str(params.to);
  if (!from || !to || params.text === undefined) return null;
  return { to: storeNumber(to) ?? to, from, phone: e164(from), text: str(params.text), externalId: str(params.id) || null, timestamp: date(params.date) };
}

/** Africa's Talking delivery report (form): id, status, phoneNumber, networkCode, failureReason, retryCount. */
export function parseAfricasTalkingStatus(params: Record<string, unknown>): SmsStatus | null {
  const externalId = str(params.id);
  const raw = str(params.status);
  if (!externalId || !raw || params.text !== undefined) return null;
  const status = statusFrom(raw);
  if (!status) return null;
  const reason = str(params.failureReason);
  return { externalId, status, error: status === "failed" ? `Africa's Talking: ${reason || raw}` : null };
}

/** Sendchamp delivery webhook. The payload isn't documented in detail, so read the usual field names. */
export function parseSendchampStatus(payload: unknown): SmsStatus | null {
  const root = asRecord(payload);
  const p = Object.keys(asRecord(root.data)).length ? asRecord(root.data) : root;
  const externalId = str(p.reference) || str(p.id) || str(p.uid) || str(p.message_id) || str(p.business_uid);
  const raw = str(p.status) || str(root.status);
  if (!externalId || !raw) return null;
  const status = statusFrom(raw);
  if (!status) return null;
  return { externalId, status, error: status === "failed" ? `Sendchamp: ${str(p.reason) || str(p.message) || raw}` : null };
}

/** Maps every provider's status words to ours. Unknown words are ignored rather than guessed. */
export function statusFrom(raw: string): SmsStatus["status"] | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (/undeliver|fail|reject|dnd|expired|absent|blacklist|invalid|insufficient|error/.test(s)) return "failed";
  if (/deliver|^success$/.test(s)) return "delivered";
  if (/sent|submitted|buffered|queued|accepted|pending|processing/.test(s)) return "sent";
  return null;
}

// ─── Send responses ──────────────────────────────────────────────────────────

/** Termii /api/sms/send: { code: "ok", message_id, message, balance }. */
export function readTermiiSend(httpOk: boolean, json: Record<string, unknown>): SendOutcome {
  const id = str(json.message_id_str) || str(json.message_id);
  if (httpOk && (str(json.code).toLowerCase() === "ok" || id)) return { ok: true, externalId: id || null };
  return { ok: false, error: (str(json.message) || str(json.error) || "Termii didn't accept the message.").slice(0, 300) };
}

/** Africa's Talking /version1/messaging: { SMSMessageData: { Message, Recipients: [{ statusCode, status, messageId }] } }. */
export function readAfricasTalkingSend(httpOk: boolean, json: Record<string, unknown>): SendOutcome {
  const data = asRecord(json.SMSMessageData);
  const recipients = Array.isArray(data.Recipients) ? data.Recipients.map(asRecord) : [];
  const accepted = recipients.find((r) => [100, 101, 102].includes(Number(r.statusCode)));
  if (httpOk && accepted) return { ok: true, externalId: str(accepted.messageId) || null };
  const reason = str(recipients[0]?.status) || str(data.Message) || str(json.errorMessage) || str(json.message);
  return { ok: false, error: (reason ? `Africa's Talking: ${reason}` : "Africa's Talking didn't accept the message.").slice(0, 300) };
}

/** Sendchamp /sms/send: { code, status: "success", message, data: { id | reference | business_uid, status } }. */
export function readSendchampSend(httpOk: boolean, json: Record<string, unknown>): SendOutcome {
  const data = asRecord(json.data);
  const status = str(json.status).toLowerCase();
  if (httpOk && status !== "error" && status !== "failed") {
    return { ok: true, externalId: str(data.reference) || str(data.id) || str(data.uid) || str(data.business_uid) || null };
  }
  return { ok: false, error: (str(json.message) || "Sendchamp didn't accept the message.").slice(0, 300) };
}

/** Africa's Talking /call: { entries: [{ phoneNumber, status: "Queued", sessionId }], errorMessage: "None" }. */
export function readAfricasTalkingCall(httpOk: boolean, json: Record<string, unknown>): SendOutcome {
  const entry = asRecord(Array.isArray(json.entries) ? json.entries[0] : null);
  if (httpOk && str(entry.status).toLowerCase() === "queued") return { ok: true, externalId: str(entry.sessionId) || null };
  const reason = str(entry.status) || (str(json.errorMessage) !== "None" ? str(json.errorMessage) : "");
  return { ok: false, error: (reason ? `Africa's Talking couldn't start the call: ${reason}` : "Africa's Talking couldn't start the call.").slice(0, 300) };
}

// ─── Africa's Talking Voice ──────────────────────────────────────────────────

export interface VoiceEvent {
  sessionId: string;
  /** true while the call is live (we must answer with XML); false on the final notification. */
  active: boolean;
  direction: "inbound" | "outbound";
  callerNumber: string;
  destinationNumber: string;
  recordingUrl: string | null;
  durationSeconds: number;
  dialDurationSeconds: number;
  dialDestination: string | null;
  hangupCause: string | null;
  status: string | null;
  clientRequestId: string | null;
}

/** Africa's Talking voice callback (form): isActive, sessionId, direction, callerNumber, destinationNumber, … */
export function parseAfricasTalkingVoice(params: Record<string, unknown>): VoiceEvent | null {
  const sessionId = str(params.sessionId);
  if (!sessionId) return null;
  return {
    sessionId,
    active: str(params.isActive) === "1" || str(params.isActive).toLowerCase() === "true",
    direction: str(params.direction).toLowerCase() === "outbound" ? "outbound" : "inbound",
    callerNumber: str(params.callerNumber),
    destinationNumber: str(params.destinationNumber),
    recordingUrl: str(params.recordingUrl) || null,
    durationSeconds: Number(params.durationInSeconds ?? 0) || 0,
    dialDurationSeconds: Number(params.dialDurationInSeconds ?? 0) || 0,
    dialDestination: str(params.dialDestinationNumber) || null,
    hangupCause: str(params.hangupCause) || null,
    status: str(params.status) || null,
    clientRequestId: str(params.clientRequestId) || null,
  };
}

export function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

const XML = `<?xml version="1.0" encoding="UTF-8"?>`;

/** Take a voicemail: the recording comes back to callbackUrl (and on the call's final notification). */
export function voicemailXml(input: { storeName: string; callbackUrl: string }) {
  const name = escapeXml(input.storeName);
  return `${XML}<Response><Record finishOnKey="#" maxLength="120" trimSilence="true" playBeep="true" callbackUrl="${escapeXml(input.callbackUrl)}"><Say>Sorry we missed you at ${name}. Please leave a message after the tone, then press the hash key. We will call you back.</Say></Record></Response>`;
}

/**
 * An incoming call: ring the seller's own phone when one is set, else voicemail. Africa's Talking can't fall
 * back to voicemail after an unanswered Dial, so with forwarding on, missed calls are logged without one.
 */
export function incomingCallXml(input: { storeName: string; forwardTo: string | null; callbackUrl: string }) {
  if (!input.forwardTo) return voicemailXml(input);
  return `${XML}<Response><Dial phoneNumbers="${escapeXml(input.forwardTo)}" sequential="true" maxDuration="3600"/></Response>`;
}

/** Click-to-call: the seller answered their phone, now ring the customer from the store's number. */
export function bridgeCallXml(customer: string) {
  return `${XML}<Response><Say>Connecting your call.</Say><Dial phoneNumbers="${escapeXml(customer)}" maxDuration="3600"/></Response>`;
}

export function sayXml(text: string) {
  return `${XML}<Response><Say>${escapeXml(text)}</Say></Response>`;
}

export function emptyXml() {
  return `${XML}<Response/>`;
}

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds) || 0);
  return total >= 60 ? `${Math.floor(total / 60)}m ${total % 60}s` : `${total}s`;
}
