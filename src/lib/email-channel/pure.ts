// Email as an inbox channel, the pure parts (no database, no network): which way of connecting email to recommend
// for a store, the DNS records a sending domain needs (from Resend's answer, plus DMARC), the reply address that
// threads a customer's answer back into its conversation, the Gmail sign-in state and PKCE pair, and building and
// reading Gmail messages. Node runs this file directly in tests (types are stripped), so only node: imports here.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { DnsPurpose, DnsRecordStatus, EmailDnsRecord, EmailRecommendation } from "./shared.ts";

export * from "./shared.ts";

// ─── Which option to show first ──────────────────────────────────────────────

/** The www-less, lower-case form of a domain (or null for nothing usable). */
export function bareDomain(raw: string | null | undefined) {
  const value = String(raw ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!value || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value)) return null;
  return value.replace(/^www\./, "");
}

/**
 * A domain bought through Shopinbos: one-click email on it. A domain bought elsewhere: email on it with DNS steps,
 * Gmail as the other choice. A free Shopinbos address: Gmail, and a nudge that buying a domain gives a professional
 * email address.
 */
export function recommendEmailSetup(input: { customDomain: string | null | undefined; boughtDomains?: Array<string | null | undefined>; platformDomains?: Array<string | null | undefined> }): EmailRecommendation {
  const domain = bareDomain(input.customDomain);
  // A free address on a Shopinbos domain (adas.mybos.store) is not the seller's own domain.
  const platform = (input.platformDomains ?? []).map(bareDomain).filter((d): d is string => Boolean(d));
  if (!domain || platform.some((p) => domain === p || domain.endsWith(`.${p}`))) return { kind: "free", domain: null, primary: "gmail", options: ["gmail", "buy_domain"] };
  const bought = (input.boughtDomains ?? []).some((d) => bareDomain(d) === domain);
  if (bought) return { kind: "bought", domain, primary: "domain_auto", options: ["domain_auto", "gmail"] };
  return { kind: "custom", domain, primary: "domain_dns", options: ["domain_dns", "gmail"] };
}

// ─── The address ─────────────────────────────────────────────────────────────

/** The part before the @: lower-case letters, numbers, dots, dashes and underscores, 1–32 long. */
export function cleanPrefix(raw: unknown) {
  const value = String(raw ?? "").trim().toLowerCase();
  return /^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/.test(value) && !value.includes("..") ? value : null;
}

/** The name customers see beside the address. No quotes, angle brackets or line breaks (they would break the header). */
export function cleanFromName(raw: unknown, fallback = "") {
  const value = String(raw ?? "").replace(/[\r\n"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return value || fallback.replace(/[\r\n"<>\\]/g, " ").trim().slice(0, 60);
}

/** `"Ada's Closet" <hello@adascloset.com>` */
export function formatFrom(name: string, address: string) {
  const clean = cleanFromName(name);
  return clean ? `"${clean}" <${address}>` : address;
}

// ─── DNS records for a sending domain ────────────────────────────────────────

/** A record as Resend returns it (create/get domain). */
export interface ResendDnsRecord {
  record?: string;
  name?: string;
  type?: string;
  value?: string;
  ttl?: string | number;
  priority?: number | null;
  status?: string;
}

export const DMARC_VALUE = "v=DMARC1; p=none;";

/** "send.mystore.com" or "send" → "send"; "mystore.com", "" or "@" → "@". */
export function relativeHost(name: string | null | undefined, domain: string) {
  const host = String(name ?? "").trim().toLowerCase().replace(/\.$/, "");
  const base = domain.toLowerCase();
  if (!host || host === "@" || host === base) return "@";
  return host.endsWith(`.${base}`) ? host.slice(0, -(base.length + 1)) : host;
}

function purposeOf(record: ResendDnsRecord): DnsPurpose {
  const kind = String(record.record ?? "").toLowerCase();
  if (kind === "spf") return "spf";
  if (kind === "dkim") return "dkim";
  if (kind === "receiving") return "receiving";
  return "other";
}

function statusOf(raw: unknown): DnsRecordStatus {
  return raw === "verified" ? "verified" : raw === "failed" ? "failed" : "pending";
}

/**
 * The records the seller's domain needs: Resend's sending records (SPF on the "send" host, DKIM), the receiving
 * MX only when asked for, and a DMARC record (Resend doesn't list one, inboxes like Gmail expect it). Tracking
 * records are left out: we don't turn link tracking on.
 */
export function buildEmailDnsRecords(domain: string, resendRecords: readonly ResendDnsRecord[], options: { receiving?: boolean; dmarc?: boolean; dmarcStatus?: DnsRecordStatus } = {}): EmailDnsRecord[] {
  const out: EmailDnsRecord[] = [];
  for (const record of resendRecords) {
    const purpose = purposeOf(record);
    if (purpose === "other") continue;
    if (purpose === "receiving" && !options.receiving) continue;
    const type = String(record.type ?? "").toUpperCase();
    if (type !== "TXT" && type !== "MX" && type !== "CNAME") continue;
    const name = relativeHost(record.name, domain);
    out.push({
      purpose,
      type,
      name,
      fqdn: name === "@" ? domain : `${name}.${domain}`,
      value: String(record.value ?? ""),
      priority: type === "MX" ? (typeof record.priority === "number" ? record.priority : 10) : null,
      ttl: String(record.ttl ?? "Auto"),
      status: statusOf(record.status),
    });
  }
  if (options.dmarc !== false) {
    out.push({ purpose: "dmarc", type: "TXT", name: "_dmarc", fqdn: `_dmarc.${domain}`, value: DMARC_VALUE, priority: null, ttl: "Auto", status: options.dmarcStatus ?? "pending" });
  }
  return out;
}

/** Sending works once SPF and DKIM are verified (DMARC and receiving help, but don't block sending). */
export function sendingVerified(records: readonly EmailDnsRecord[]) {
  const needed = records.filter((r) => r.purpose === "spf" || r.purpose === "dkim");
  return needed.length > 0 && needed.every((r) => r.status === "verified");
}

/** The body Vercel's DNS API takes for one record (POST /v2/domains/{domain}/records). */
export function vercelRecordBody(record: EmailDnsRecord) {
  return {
    name: record.name === "@" ? "" : record.name,
    type: record.type,
    value: record.value,
    ttl: 60,
    ...(record.type === "MX" ? { mxPriority: record.priority ?? 10 } : {}),
  };
}

/** Whether a record is already in a zone listing (Vercel's names are relative, "" for the apex). */
export function recordPresent(record: EmailDnsRecord, existing: ReadonlyArray<{ name?: string | null; type?: string | null; value?: string | null }>) {
  const name = record.name === "@" ? "" : record.name;
  const unquote = (v: string) => v.trim().replace(/^"|"$/g, "").replace(/\.$/, "").toLowerCase();
  return existing.some((row) => String(row.name ?? "") === name && String(row.type ?? "").toUpperCase() === record.type && unquote(String(row.value ?? "")) === unquote(record.value));
}

/** A zone already has a DMARC policy (only one is allowed, so we never add a second). */
export function hasDmarc(existing: ReadonlyArray<{ name?: string | null; type?: string | null; value?: string | null }>) {
  return existing.some((row) => String(row.name ?? "") === "_dmarc" && String(row.type ?? "").toUpperCase() === "TXT" && /v=DMARC1/i.test(String(row.value ?? "")));
}

/** A zone already receives email at the domain itself (Google Workspace, Zoho…): never take that over. */
export function hasApexMx(existing: ReadonlyArray<{ name?: string | null; type?: string | null }>) {
  return existing.some((row) => String(row.name ?? "") === "" && String(row.type ?? "").toUpperCase() === "MX");
}

// ─── Reply address: replies thread back into their conversation ─────────────

const REPLY_TAG = /^r-([a-z0-9]{8,40})-([0-9a-f]{12})$/;

function replySig(slug: string, conversationId: string, secret: string) {
  return createHmac("sha256", secret).update(`email-reply:${slug}:${conversationId}`).digest("hex").slice(0, 12);
}

/**
 * "adas-closet+r-<conversation>-<sig>@inbox.shopinbos.com". The inbound webhook already reads the store from the part
 * before "+"; the tag names the conversation, signed so nobody can drop mail into another thread. Lower-case only:
 * some mail servers lower-case addresses.
 */
export function encodeReplyAddress(slug: string, conversationId: string, domain: string, secret: string) {
  const id = conversationId.toLowerCase();
  if (!secret || !/^[a-z0-9]{8,40}$/.test(id)) return `${slug}@${domain}`;
  return `${slug}+r-${id}-${replySig(slug, id, secret)}@${domain}`;
}

/** The store slug and (when the tag is valid) the conversation id in a reply address on our inbox domain. */
export function decodeReplyAddress(address: string, domain: string | null | undefined, secret: string | null | undefined): { slug: string; conversationId: string | null } | null {
  if (!domain) return null;
  const [local, host] = String(address ?? "").trim().toLowerCase().split("@");
  if (!local || host !== domain.trim().toLowerCase()) return null;
  const [slug, tag] = local.split("+", 2);
  if (!slug) return null;
  const match = tag ? REPLY_TAG.exec(tag) : null;
  if (!match || !secret) return { slug, conversationId: null };
  const expected = Buffer.from(replySig(slug, match[1], secret));
  const given = Buffer.from(match[2]);
  return { slug, conversationId: expected.length === given.length && timingSafeEqual(expected, given) ? match[1] : null };
}

// ─── Gmail sign-in: signed state + PKCE ──────────────────────────────────────

export const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/gmail.readonly"];
export const GMAIL_STATE_MAX_AGE_MS = 15 * 60_000;
export const GMAIL_COOKIE_PATH = "/api/app/inbox/email/gmail";
export const GMAIL_NONCE_COOKIE = "sib_gmail_nonce";
export const GMAIL_PKCE_COOKIE = "sib_gmail_pkce";

export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: pkceChallenge(verifier) };
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function gmailStateSig(payload: string, key: Buffer) {
  return createHmac("sha256", key).update(`gmail-state:${payload}`).digest("base64url");
}

export function signGmailState(state: { storeId: string; nonce: string; iat: number }, key: Buffer) {
  const payload = Buffer.from(JSON.stringify({ s: state.storeId, n: state.nonce, t: state.iat })).toString("base64url");
  return `${payload}.${gmailStateSig(payload, key)}`;
}

/** Only a fresh state we signed, for this seller's store, from the browser that holds the nonce cookie. */
export function checkGmailState(value: string | null | undefined, expect: { storeId: string | null | undefined; nonceCookie: string | null | undefined }, key: Buffer, now = Date.now()) {
  if (!value || !expect.storeId || !expect.nonceCookie) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;
  const a = Buffer.from(gmailStateSig(payload, key));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  let raw: { s?: unknown; n?: unknown; t?: unknown };
  try {
    raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (raw.s !== expect.storeId || typeof raw.n !== "string" || typeof raw.t !== "number") return false;
  if (raw.t > now + 60_000 || now - raw.t > GMAIL_STATE_MAX_AGE_MS) return false;
  const n1 = Buffer.from(raw.n);
  const n2 = Buffer.from(expect.nonceCookie);
  return n1.length === n2.length && timingSafeEqual(n1, n2);
}

export function gmailAuthUrl(input: { clientId: string; redirectUri: string; state: string; challenge: string; loginHint?: string | null }) {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  });
  if (input.loginHint) params.set("login_hint", input.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ─── Building and reading Gmail messages ─────────────────────────────────────

/** RFC 2047 for a header with non-ASCII text (names and subjects in Yorùbá, Igbo, emoji…). */
export function encodeHeaderWord(value: string) {
  const clean = value.replace(/[\r\n]+/g, " ");
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

function encodeAddressHeader(name: string, address: string) {
  const clean = cleanFromName(name);
  if (!clean) return address;
  return /^[\x20-\x7e]*$/.test(clean) ? `"${clean}" <${address}>` : `${encodeHeaderWord(clean)} <${address}>`;
}

function wrap76(text: string) {
  return text.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

/** A multipart (plain text + HTML) message, ready for Gmail's users.messages.send as base64url "raw". */
export function buildMimeMessage(input: { fromName: string; fromAddress: string; to: string; subject: string; text: string; html?: string | null; inReplyTo?: string | null; references?: string | null; replyTo?: string | null; boundary?: string; date?: Date }) {
  const boundary = input.boundary ?? `sib_${randomBytes(12).toString("hex")}`;
  const headers = [
    `From: ${encodeAddressHeader(input.fromName, input.fromAddress)}`,
    `To: ${input.to.replace(/[\r\n]/g, "")}`,
    `Subject: ${encodeHeaderWord(input.subject)}`,
    `Date: ${(input.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
    "MIME-Version: 1.0",
    ...(input.replyTo ? [`Reply-To: ${input.replyTo.replace(/[\r\n]/g, "")}`] : []),
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo.replace(/[\r\n]/g, "")}`] : []),
    ...(input.references || input.inReplyTo ? [`References: ${(input.references || input.inReplyTo || "").replace(/[\r\n]/g, " ")}`] : []),
  ];
  const textPart = [`--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(Buffer.from(input.text, "utf8").toString("base64"))];
  const htmlPart = input.html ? [`--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", wrap76(Buffer.from(input.html, "utf8").toString("base64"))] : [];
  return [...headers, `Content-Type: multipart/alternative; boundary="${boundary}"`, "", ...textPart, ...htmlPart, `--${boundary}--`, ""].join("\r\n");
}

export function base64UrlEncode(text: string) {
  return Buffer.from(text, "utf8").toString("base64url");
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
}

export interface GmailMessageRaw {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart;
}

export interface ReadGmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  from: string;
  to: string;
  subject: string;
  messageIdHeader: string | null;
  text: string;
  html: string | null;
  createdAt: Date | null;
  attachments: Array<{ name: string | null; contentType: string | null }>;
}

function header(part: GmailPart | undefined, name: string) {
  const wanted = name.toLowerCase();
  return part?.headers?.find((h) => String(h.name ?? "").toLowerCase() === wanted)?.value ?? "";
}

function decodeBody(data: string | undefined) {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function walk(part: GmailPart | undefined, found: { text: string; html: string; attachments: ReadGmailMessage["attachments"] }) {
  if (!part) return;
  const type = String(part.mimeType ?? "").toLowerCase();
  if (part.filename) {
    found.attachments.push({ name: part.filename, contentType: part.mimeType ?? null });
  } else if (type === "text/plain" && !found.text) {
    found.text = decodeBody(part.body?.data);
  } else if (type === "text/html" && !found.html) {
    found.html = decodeBody(part.body?.data);
  }
  for (const child of part.parts ?? []) walk(child, found);
}

/** A Gmail API message (format=full) → the parts the inbox needs. */
export function readGmailMessage(raw: GmailMessageRaw): ReadGmailMessage | null {
  if (!raw.id || !raw.threadId || !raw.payload) return null;
  const found = { text: "", html: "", attachments: [] as ReadGmailMessage["attachments"] };
  walk(raw.payload, found);
  const internal = Number(raw.internalDate);
  return {
    id: raw.id,
    threadId: raw.threadId,
    labelIds: raw.labelIds ?? [],
    from: header(raw.payload, "From"),
    to: header(raw.payload, "To"),
    subject: header(raw.payload, "Subject"),
    messageIdHeader: header(raw.payload, "Message-ID") || header(raw.payload, "Message-Id") || null,
    text: found.text,
    html: found.html || null,
    createdAt: Number.isFinite(internal) && internal > 0 ? new Date(internal) : null,
    attachments: found.attachments,
  };
}

/** The plain address in a header like `Ada Obi <ada@example.com>`. */
export function addressOf(value: string) {
  const match = /<([^>]+)>/.exec(value);
  const address = (match ? match[1] : value).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : null;
}
