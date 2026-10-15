import "server-only";

import { db } from "@/lib/db/client";
import { appUrl } from "@/lib/inbox/channels/types";
import { encryptJson, hasCredentialKey } from "@/lib/inbox/crypto";
import { normaliseInboundEmail } from "@/lib/inbox/pure";
import { addressOf, base64UrlEncode, buildMimeMessage, cleanFromName, readGmailMessage, type GmailMessageRaw, type ReadGmailMessage } from "./pure";
import { decryptEmailCredentials, emailRow, EmailSetupError, googleConfigured, readEmailSettings, removeDomainEmail, saveEmailRow, type EmailSettings } from "./server";

// Gmail as the store's email: Google sign-in (gmail.send + gmail.readonly, PKCE), sending as the seller's Gmail
// through the Gmail API, and pulling customers' replies into the inbox (/api/cron/gmail-sync every 5 minutes).
// Only threads that started in the app, or mail from people who already are the store's customers, are imported:
// never the whole mailbox. Tokens are stored encrypted on the InboxChannel row and never reach the browser.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_EXPIRED = "Gmail sign-in expired or was removed. Connect Gmail again.";

export function gmailRedirectUri() {
  return `${appUrl()}/api/app/inbox/email/gmail/callback`;
}

type TokenAnswer = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...body }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as TokenAnswer;
  return { ok: res.ok && Boolean(json.access_token), json };
}

/** Google sent the seller back with a code: swap it (with the PKCE verifier) for tokens and save them encrypted. */
export async function finishGmailConnect(store: { id: string; name: string }, code: string, verifier: string) {
  if (!googleConfigured()) throw new EmailSetupError("NOT_READY", "Gmail connection isn't switched on for Shopinbos yet.", 503);
  if (!hasCredentialKey()) throw new EmailSetupError("NOT_READY", "This server can't store sign-ins safely yet (INBOX_ENCRYPTION_KEY).", 503);
  const { ok, json } = await tokenRequest({ code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: gmailRedirectUri() });
  if (!ok) throw new EmailSetupError("GOOGLE_FAILED", json.error_description || json.error || "Google sign-in failed.", 502);
  const scopes = String(json.scope ?? "");
  if (!scopes.includes("gmail.send") || !scopes.includes("gmail.readonly")) {
    throw new EmailSetupError("SCOPES", "Allow Shopinbos to send and read email when Google asks, so replies can come back here.");
  }
  const profile = await gmailGet<{ emailAddress?: string; historyId?: string }>(json.access_token!, "/profile");
  const email = profile.emailAddress?.toLowerCase();
  if (!email) throw new EmailSetupError("GOOGLE_FAILED", "Google didn't tell us which Gmail address you used.", 502);

  const row = await emailRow(store.id);
  const settings = readEmailSettings(row?.settings);
  const old = decryptEmailCredentials(row?.credentials);
  // Google only sends a refresh token on first consent; keep the one we have for the same account.
  const refreshToken = json.refresh_token || (settings.gmail?.email === email ? old?.refreshToken : undefined);
  if (!refreshToken) throw new EmailSetupError("GOOGLE_FAILED", "Google didn't give us lasting access. Remove Shopinbos from your Google account's apps, then connect again.", 502);
  const credentials = encryptJson({ refreshToken, accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 });
  const next: EmailSettings = { ...settings, provider: "gmail", fromName: cleanFromName(settings.fromName, store.name), gmail: { email, historyId: profile.historyId ?? null, syncedAt: null } };
  await saveEmailRow(store.id, { settings: next, status: "connected", externalId: email, displayName: email, credentials, lastError: null, connectedAt: new Date() });
  return email;
}

class GmailAuthError extends Error {}

/** A current access token for the store's Gmail, refreshed (and saved) when it's about to run out. */
async function accessToken(storeId: string) {
  const row = await emailRow(storeId);
  const creds = decryptEmailCredentials(row?.credentials);
  if (!row || !creds?.refreshToken) throw new GmailAuthError(GMAIL_EXPIRED);
  if (creds.accessToken && creds.expiresAt && creds.expiresAt > Date.now() + 60_000) return creds.accessToken;
  const { ok, json } = await tokenRequest({ refresh_token: creds.refreshToken, grant_type: "refresh_token" });
  if (!ok) {
    if (json.error === "invalid_grant") {
      await db.inboxChannel.update({ where: { id: row.id }, data: { lastError: GMAIL_EXPIRED } }).catch(() => null);
      throw new GmailAuthError(GMAIL_EXPIRED);
    }
    throw new Error(json.error_description || "Google didn't answer. Try again in a minute.");
  }
  await db.inboxChannel.update({ where: { id: row.id }, data: { credentials: encryptJson({ ...creds, accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 }) } });
  return json.access_token!;
}

async function gmailGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok) {
    const error = new Error(json.error?.message || `Gmail answered ${res.status}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return json;
}

/** The Gmail thread and the last Message-ID in this conversation, so the next email continues the same thread. */
async function threadContext(conversationId: string | null | undefined) {
  if (!conversationId) return { threadId: null, inReplyTo: null };
  const rows = await db.inboxMessage.findMany({ where: { conversationId, externalId: { startsWith: "gmail:" } }, orderBy: { createdAt: "desc" }, take: 10, select: { meta: true } });
  let threadId: string | null = null;
  let inReplyTo: string | null = null;
  for (const row of rows) {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    if (!threadId && typeof meta.gmailThreadId === "string") threadId = meta.gmailThreadId;
    if (!inReplyTo && typeof meta.messageIdHeader === "string") inReplyTo = meta.messageIdHeader;
  }
  return { threadId, inReplyTo };
}

/** Sends one email as the seller's Gmail. The Gmail thread id goes back with the result to be kept on the message. */
export async function sendGmailEmail(input: { storeId: string; conversationId?: string | null; fromName: string; fromAddress: string; to: string; subject: string; text: string; html?: string | null }) {
  let token: string;
  try {
    token = await accessToken(input.storeId);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : GMAIL_EXPIRED };
  }
  const context = await threadContext(input.conversationId);
  const raw = buildMimeMessage({ fromName: input.fromName, fromAddress: input.fromAddress, to: input.to, subject: input.subject, text: input.text, html: input.html, inReplyTo: context.inReplyTo });
  const res = await fetch(`${GMAIL}/messages/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64UrlEncode(raw), ...(context.threadId ? { threadId: context.threadId } : {}) }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; threadId?: string; error?: { message?: string } };
  if (!res.ok || !json.id) {
    if (res.status === 401 || res.status === 403) {
      await db.inboxChannel.updateMany({ where: { storeId: input.storeId, channel: "email" }, data: { lastError: GMAIL_EXPIRED } }).catch(() => null);
      return { ok: false as const, error: GMAIL_EXPIRED };
    }
    return { ok: false as const, error: (json.error?.message || `Gmail answered ${res.status}`).slice(0, 300) };
  }
  return { ok: true as const, externalId: `gmail:${json.id}`, meta: { gmailThreadId: json.threadId ?? null } };
}

/** Disconnect: revoke the token at Google and forget it. Conversations stay. */
export async function disconnectGmail(storeId: string) {
  const row = await emailRow(storeId);
  if (!row) return;
  const creds = decryptEmailCredentials(row.credentials);
  const token = creds?.refreshToken || creds?.accessToken;
  if (token) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const settings = readEmailSettings(row.settings);
  const active = settings.provider === "gmail";
  await saveEmailRow(storeId, {
    settings: { ...settings, gmail: undefined, ...(active ? { provider: undefined } : {}) },
    credentials: null,
    ...(active ? { status: "disconnected", externalId: null, displayName: null, lastError: null } : {}),
  });
}

/** The "Disconnect" button: Gmail is revoked, an own domain is removed from Resend, the inbox address is turned off. */
export async function disconnectEmail(storeId: string) {
  const row = await emailRow(storeId);
  if (!row) return;
  const settings = readEmailSettings(row.settings);
  if (settings.gmail || row.credentials) await disconnectGmail(storeId);
  if (settings.domain) await removeDomainEmail(storeId);
  const fresh = readEmailSettings((await emailRow(storeId))?.settings);
  await saveEmailRow(storeId, { settings: { ...fresh, provider: undefined, address: undefined }, status: "disconnected", credentials: null, externalId: null, displayName: null, lastError: null });
}

// ─── Pulling replies in ──────────────────────────────────────────────────────

const KNOWN_THREAD_DAYS = 60;
const MAX_FETCH = 40;

async function ingest(storeId: string, message: ReadGmailMessage, sellerAddress: string) {
  const parsed = normaliseInboundEmail({ from: message.from, to: message.to, subject: message.subject, text: message.text, html: message.html, message_id: message.id });
  if (!parsed || parsed.fromEmail === sellerAddress) return false;
  const { ingestInbound } = await import("@/lib/inbox/service");
  const result = await ingestInbound({
    storeId,
    channel: "email",
    threadId: parsed.fromEmail,
    subject: parsed.subject || null,
    contact: { name: parsed.fromName, email: parsed.fromEmail },
    message: {
      body: parsed.text || "(empty email)",
      bodyHtml: parsed.html,
      externalId: `gmail:${message.id}`,
      attachments: message.attachments.map((a) => ({ type: "file", name: a.name, contentType: a.contentType, mediaId: null })),
      meta: { gmailThreadId: message.threadId, messageIdHeader: message.messageIdHeader, via: "gmail" },
      createdAt: message.createdAt ?? undefined,
    },
  });
  return !result.duplicate;
}

/** Is this sender someone the store already knows (an email conversation or an order with their address)? */
async function knownCustomer(storeId: string, email: string) {
  const [conversation, order] = await Promise.all([
    db.inboxConversation.findFirst({ where: { storeId, contactEmail: { equals: email, mode: "insensitive" } }, select: { id: true } }),
    db.retailOrder.findFirst({ where: { storeId, buyerEmail: { equals: email, mode: "insensitive" } }, select: { id: true } }),
  ]);
  return Boolean(conversation || order);
}

/** One store: new messages since the last sync (Gmail history), kept only for app threads or known customers. */
export async function syncGmailStore(storeId: string) {
  const row = await emailRow(storeId);
  const settings = readEmailSettings(row?.settings);
  if (!row || row.status !== "connected" || settings.provider !== "gmail" || !settings.gmail?.email) return { imported: 0, skipped: "not_gmail" as const };
  const seller = settings.gmail.email;
  let token: string;
  try {
    token = await accessToken(storeId);
  } catch (error) {
    return { imported: 0, skipped: error instanceof GmailAuthError ? ("expired" as const) : ("error" as const) };
  }

  const known = await db.inboxMessage.findMany({
    where: { storeId, externalId: { startsWith: "gmail:" }, createdAt: { gte: new Date(Date.now() - KNOWN_THREAD_DAYS * 86_400_000) } },
    select: { meta: true },
    take: 2000,
  });
  const appThreads = new Set(known.map((m) => (m.meta as Record<string, unknown> | null)?.gmailThreadId).filter((v): v is string => typeof v === "string"));

  let imported = 0;
  let historyId = settings.gmail.historyId ?? null;
  let candidates: Array<{ id: string; threadId: string }> = [];

  if (historyId) {
    const start: string = historyId;
    try {
      let pageToken: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const query: URLSearchParams = new URLSearchParams({ startHistoryId: start, historyTypes: "messageAdded", maxResults: "100" });
        if (pageToken) query.set("pageToken", pageToken);
        type HistoryPage = { history?: Array<{ messagesAdded?: Array<{ message?: { id?: string; threadId?: string; labelIds?: string[] } }> }>; historyId?: string; nextPageToken?: string };
        const history: HistoryPage = await gmailGet<{ history?: Array<{ messagesAdded?: Array<{ message?: { id?: string; threadId?: string; labelIds?: string[] } }> }>; historyId?: string; nextPageToken?: string }>(token, `/history?${query}`);
        for (const h of history.history ?? []) {
          for (const added of h.messagesAdded ?? []) {
            const m = added.message;
            // Mail the seller sent (from Gmail or from here) isn't a customer's reply.
            if (m?.id && m.threadId && !(m.labelIds ?? []).includes("SENT") && !(m.labelIds ?? []).includes("DRAFT")) candidates.push({ id: m.id, threadId: m.threadId });
          }
        }
        if (history.historyId) historyId = history.historyId;
        pageToken = history.nextPageToken;
        if (!pageToken) break;
      }
    } catch (error) {
      // History older than about a week is gone (404): start again from now and look at the app's threads directly.
      if ((error as { status?: number }).status !== 404) throw error;
      historyId = null;
    }
  }

  if (!historyId) {
    const profile = await gmailGet<{ historyId?: string }>(token, "/profile");
    historyId = profile.historyId ?? null;
    candidates = [];
    for (const threadId of [...appThreads].slice(0, 20)) {
      const thread = await gmailGet<{ messages?: Array<{ id?: string; threadId?: string; labelIds?: string[] }> }>(token, `/threads/${encodeURIComponent(threadId)}?format=minimal`).catch(() => null);
      for (const m of thread?.messages ?? []) if (m.id && m.threadId && !(m.labelIds ?? []).includes("SENT")) candidates.push({ id: m.id, threadId: m.threadId });
    }
  }

  const seen = new Set<string>();
  let fetched = 0;
  for (const candidate of candidates) {
    if (seen.has(candidate.id) || fetched >= MAX_FETCH) continue;
    seen.add(candidate.id);
    const already = await db.inboxMessage.findFirst({ where: { storeId, externalId: `gmail:${candidate.id}` }, select: { id: true } });
    if (already) continue;
    if (!appThreads.has(candidate.threadId)) {
      // Not a thread from the app: only a known customer's mail comes in, judged on the sender alone first.
      const head = await gmailGet<GmailMessageRaw>(token, `/messages/${encodeURIComponent(candidate.id)}?format=metadata&metadataHeaders=From`).catch(() => null);
      fetched += 1;
      const from = addressOf(String(head?.payload?.headers?.find((h) => String(h.name).toLowerCase() === "from")?.value ?? ""));
      if (!from || from === seller || !(await knownCustomer(storeId, from))) continue;
    }
    const full = await gmailGet<GmailMessageRaw>(token, `/messages/${encodeURIComponent(candidate.id)}?format=full`).catch(() => null);
    fetched += 1;
    const message = full ? readGmailMessage(full) : null;
    if (message && (await ingest(storeId, message, seller))) imported += 1;
  }

  const fresh = readEmailSettings((await emailRow(storeId))?.settings);
  if (fresh.gmail) await saveEmailRow(storeId, { settings: { ...fresh, gmail: { ...fresh.gmail, historyId, syncedAt: new Date().toISOString() } } });
  return { imported, skipped: null };
}

/** Every Gmail-connected store, oldest sync first. Called by /api/cron/gmail-sync. */
export async function syncAllGmail(limit = 50) {
  const rows = await db.inboxChannel.findMany({
    where: { channel: "email", status: "connected", settings: { path: ["provider"], equals: "gmail" } },
    select: { storeId: true },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  let imported = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      imported += (await syncGmailStore(row.storeId)).imported;
    } catch (error) {
      failed += 1;
      console.error("[gmail-sync] store failed", error instanceof Error ? error.message.slice(0, 200) : "unknown");
    }
  }
  return { stores: rows.length, imported, failed };
}
