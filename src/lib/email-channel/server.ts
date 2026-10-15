import "server-only";

import { createHmac } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import type { Prisma } from "@prisma/client";
import { Resend } from "resend";
import { db } from "@/lib/db/client";
import { getPlatformRootDomain } from "@/lib/domains/storefront";
import { addDnsRecordOnVercel, hasVercelDomainConfig, listDnsRecordsOnVercel } from "@/lib/domains/vercel";
import { credentialKey, decryptJson, hasCredentialKey } from "@/lib/inbox/crypto";
import {
  bareDomain,
  buildEmailDnsRecords,
  cleanFromName,
  cleanPrefix,
  hasApexMx,
  hasDmarc,
  recommendEmailSetup,
  recordPresent,
  sendingVerified,
  vercelRecordBody,
  type DnsRecordStatus,
  type EmailDnsRecord,
  type EmailProvider,
  type EmailRecommendation,
  type ResendDnsRecord,
} from "./pure";

// Email as an inbox channel, per store. Everything lives on the store's InboxChannel row for "email":
//   status      "connected" once the store can send (Gmail signed in, or its domain verified in Resend)
//   settings    { provider, address, fromName, domain: { name, resendId, prefix, records, status, auto, receiving },
//                 gmail: { email, historyId, syncedAt } }
//   credentials Gmail tokens, AES-256-GCM encrypted (src/lib/inbox/crypto.ts); never sent to the browser
// A row connected before this (the store's Shopinbos inbox address) has no provider and counts as "platform".

export class EmailSetupError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
  }
}

export interface DomainSetup {
  name: string;
  resendId: string;
  prefix: string;
  records: EmailDnsRecord[];
  status: "pending" | "verified" | "failed";
  /** We added the records ourselves (domain bought through Shopinbos, DNS on Vercel). */
  auto: boolean;
  /** Mail sent to the domain itself also lands in the inbox (only on bought domains with no other mailbox). */
  receiving: boolean;
  dnsError: string | null;
  startedAt: string;
  checkedAt: string | null;
}

export interface EmailSettings {
  provider?: EmailProvider;
  address?: string;
  fromName?: string;
  domain?: DomainSetup;
  gmail?: { email: string; historyId?: string | null; syncedAt?: string | null };
}

export function readEmailSettings(raw: unknown): EmailSettings {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as EmailSettings) : {};
}

export async function emailRow(storeId: string) {
  return db.inboxChannel.findUnique({ where: { storeId_channel: { storeId, channel: "email" } } });
}

export async function saveEmailRow(storeId: string, data: { settings: EmailSettings; status?: string; externalId?: string | null; displayName?: string | null; credentials?: string | null; lastError?: string | null; connectedAt?: Date | null }) {
  const values = {
    settings: data.settings as unknown as Prisma.InputJsonValue,
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.externalId !== undefined ? { externalId: data.externalId } : {}),
    ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
    ...(data.credentials !== undefined ? { credentials: data.credentials } : {}),
    ...(data.lastError !== undefined ? { lastError: data.lastError } : {}),
    ...(data.connectedAt !== undefined ? { connectedAt: data.connectedAt } : {}),
  };
  return db.inboxChannel.upsert({
    where: { storeId_channel: { storeId, channel: "email" } },
    create: { storeId, channel: "email", status: data.status ?? "disconnected", ...values },
    update: values,
  });
}

// ─── Who sends ───────────────────────────────────────────────────────────────

export type EmailSender =
  | { kind: "gmail"; address: string; fromName: string }
  | { kind: "domain"; address: string; fromName: string }
  | { kind: "platform" }
  | { kind: "none" };

/** How this store's email goes out right now. */
export async function resolveEmailSender(storeId: string, storeName: string): Promise<EmailSender> {
  const row = await emailRow(storeId).catch(() => null);
  if (!row || row.status !== "connected") return { kind: "none" };
  const settings = readEmailSettings(row.settings);
  const fromName = cleanFromName(settings.fromName, storeName);
  if (settings.provider === "gmail" && settings.gmail?.email) return { kind: "gmail", address: settings.gmail.email, fromName };
  if (settings.provider === "resend_domain" && settings.domain?.status === "verified" && settings.address) return { kind: "domain", address: settings.address, fromName };
  return { kind: "platform" };
}

// ─── What the setup page shows ───────────────────────────────────────────────

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

/** Domains this store bought through Shopinbos (registered on the platform's Vercel account). */
async function boughtDomains(storeId: string) {
  const rows = await db.domainPurchase.findMany({ where: { storeId, status: "bought" }, select: { domain: true } }).catch(() => []);
  return rows.map((r) => r.domain);
}

export async function storeRecommendation(store: { id: string; customDomain: string | null }): Promise<EmailRecommendation> {
  return recommendEmailSetup({ customDomain: store.customDomain, boughtDomains: await boughtDomains(store.id), platformDomains: [getPlatformRootDomain(), "mybos.store", "shopinbos.com"] });
}

export interface EmailSetupView {
  connected: boolean;
  provider: EmailProvider | null;
  address: string | null;
  fromName: string;
  storeName: string;
  recommendation: EmailRecommendation;
  domain: Omit<DomainSetup, "resendId" | "startedAt"> | null;
  gmail: { email: string } | null;
  lastError: string | null;
  platformAddress: string | null;
  ready: { resend: boolean; vercel: boolean; google: boolean; encryption: boolean; inbound: boolean };
}

export async function emailSetupView(store: { id: string; name: string; slug: string; customDomain: string | null }): Promise<EmailSetupView> {
  const [row, recommendation] = await Promise.all([emailRow(store.id), storeRecommendation(store)]);
  const settings = readEmailSettings(row?.settings);
  const connected = row?.status === "connected";
  const provider: EmailProvider | null = connected ? (settings.provider ?? "platform") : null;
  const inboundDomain = process.env.INBOX_EMAIL_DOMAIN?.trim().toLowerCase() || null;
  const platformAddress = inboundDomain ? `${store.slug}@${inboundDomain}` : null;
  const domain = settings.domain ? { name: settings.domain.name, prefix: settings.domain.prefix, records: settings.domain.records, status: settings.domain.status, auto: settings.domain.auto, receiving: settings.domain.receiving, dnsError: settings.domain.dnsError, checkedAt: settings.domain.checkedAt } : null;
  return {
    connected,
    provider,
    address: provider === "gmail" ? settings.gmail?.email ?? null : provider === "resend_domain" ? settings.address ?? null : provider === "platform" ? platformAddress : null,
    fromName: cleanFromName(settings.fromName, store.name),
    storeName: store.name,
    recommendation,
    domain,
    gmail: settings.gmail?.email ? { email: settings.gmail.email } : null,
    lastError: row?.lastError ?? null,
    platformAddress,
    ready: {
      resend: Boolean(process.env.RESEND_API_KEY),
      vercel: hasVercelDomainConfig(),
      google: googleConfigured(),
      encryption: hasCredentialKey(),
      inbound: Boolean(inboundDomain && (process.env.RESEND_WEBHOOK_SECRET || process.env.INBOX_EMAIL_WEBHOOK_SECRET)),
    },
  };
}

// ─── Own domain through Resend ───────────────────────────────────────────────

function resend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new EmailSetupError("NOT_READY", "Email sending isn't switched on for Shopinbos yet.", 503);
  return new Resend(key);
}

/** Creates the sending domain in Resend, or finds it when it already exists (a retry, or set up before). */
async function resendDomain(name: string, receiving: boolean): Promise<{ id: string; records: ResendDnsRecord[] }> {
  const client = resend();
  const created = await client.domains.create({ name, capabilities: { sending: "enabled", receiving: receiving ? "enabled" : "disabled" } });
  if (created.data?.id) return { id: created.data.id, records: created.data.records as ResendDnsRecord[] };
  const list = await client.domains.list();
  const found = list.data?.data.find((d) => d.name.toLowerCase() === name);
  if (!found) throw new EmailSetupError("RESEND_FAILED", created.error?.message || "We couldn't set up email for this domain. Try again in a few minutes.", 502);
  const full = await client.domains.get(found.id);
  return { id: found.id, records: (full.data?.records ?? []) as ResendDnsRecord[] };
}

async function dmarcStatus(domain: string): Promise<DnsRecordStatus> {
  try {
    const rows = await Promise.race([resolveTxt(`_dmarc.${domain}`), new Promise<string[][]>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000))]);
    return rows.some((parts) => /v=DMARC1/i.test(parts.join(""))) ? "verified" : "pending";
  } catch {
    return "pending";
  }
}

/**
 * Starts email on the store's own domain: the seller chose the address prefix (hello@, sales@…) and the name
 * customers see. A domain bought through Shopinbos gets its records added on Vercel for them; any other domain shows
 * the records to add at their registrar.
 */
export async function startDomainEmail(store: { id: string; name: string; customDomain: string | null }, input: { prefix: unknown; fromName: unknown }) {
  const prefix = cleanPrefix(input.prefix);
  if (!prefix) throw new EmailSetupError("BAD_PREFIX", "Use only letters, numbers, dots or dashes before the @.");
  const recommendation = await storeRecommendation(store);
  const name = recommendation.domain;
  if (!name || recommendation.kind === "free") throw new EmailSetupError("NO_DOMAIN", "Your store doesn't have its own domain yet. Get one on the Domain page first.");
  const auto = recommendation.kind === "bought" && hasVercelDomainConfig();

  // Receive at the domain too only when nothing else does: a bought domain whose zone has no mail (MX) record.
  let existing: Awaited<ReturnType<typeof listDnsRecordsOnVercel>> = [];
  let dnsError: string | null = null;
  if (auto) {
    try {
      existing = await listDnsRecordsOnVercel(name);
    } catch (error) {
      dnsError = error instanceof Error ? error.message.slice(0, 200) : "DNS lookup failed";
    }
  }
  const receiving = auto && !dnsError && !hasApexMx(existing);
  const made = await resendDomain(name, receiving);
  const records = buildEmailDnsRecords(name, made.records, { receiving });

  if (auto && !dnsError) {
    try {
      for (const record of records) {
        if (record.purpose === "dmarc" && hasDmarc(existing)) continue;
        if (recordPresent(record, existing)) continue;
        await addDnsRecordOnVercel(name, vercelRecordBody(record));
      }
    } catch (error) {
      dnsError = error instanceof Error ? error.message.slice(0, 200) : "Adding DNS records failed";
    }
  }
  await resend().domains.verify(made.id).catch(() => null);

  const row = await emailRow(store.id);
  const settings = readEmailSettings(row?.settings);
  const domain: DomainSetup = { name, resendId: made.id, prefix, records, status: "pending", auto: auto && !dnsError, receiving, dnsError, startedAt: new Date().toISOString(), checkedAt: null };
  await saveEmailRow(store.id, { settings: { ...settings, fromName: cleanFromName(input.fromName, store.name), domain } });
  return checkDomainEmail(store.id, store.name, { skipVerify: true });
}

/** Asks Resend to check the records again, and switches the store to its own address once SPF and DKIM pass. */
export async function checkDomainEmail(storeId: string, storeName: string, options: { skipVerify?: boolean } = {}) {
  const row = await emailRow(storeId);
  const settings = readEmailSettings(row?.settings);
  const setup = settings.domain;
  if (!setup) throw new EmailSetupError("NO_SETUP", "Start setting up email on your domain first.", 404);
  const client = resend();
  if (!options.skipVerify && setup.status !== "verified") await client.domains.verify(setup.resendId).catch(() => null);
  const got = await client.domains.get(setup.resendId);
  if (!got.data) {
    // The Resend domain is gone (removed by hand): start again from the setup button.
    await saveEmailRow(storeId, { settings: { ...settings, domain: { ...setup, status: "failed", checkedAt: new Date().toISOString() } } });
    return { verified: false };
  }
  const records = buildEmailDnsRecords(setup.name, got.data.records as ResendDnsRecord[], { receiving: setup.receiving, dmarcStatus: await dmarcStatus(setup.name) });
  const verified = sendingVerified(records);
  const domain: DomainSetup = { ...setup, records, status: verified ? "verified" : got.data.status === "failed" ? "failed" : "pending", checkedAt: new Date().toISOString() };
  const address = `${setup.prefix}@${setup.name}`;
  // The seller asked for their own domain, so once it passes it becomes how the store sends (even over Gmail).
  const switchOver = verified && (settings.provider !== "resend_domain" || row?.status !== "connected");
  if (switchOver) {
    await saveEmailRow(storeId, {
      settings: { ...settings, provider: "resend_domain", address, fromName: cleanFromName(settings.fromName, storeName), domain },
      status: "connected",
      externalId: address,
      displayName: address,
      lastError: null,
      connectedAt: new Date(),
    });
  } else {
    await saveEmailRow(storeId, { settings: { ...settings, domain } });
  }
  return { verified };
}

/** The name customers see, and (on a verified domain) the part before the @. */
export async function updateEmailIdentity(storeId: string, storeName: string, input: { fromName?: unknown; prefix?: unknown }) {
  const row = await emailRow(storeId);
  if (!row) throw new EmailSetupError("NO_SETUP", "Connect email first.", 404);
  const settings = readEmailSettings(row.settings);
  const next: EmailSettings = { ...settings };
  if (input.fromName !== undefined) next.fromName = cleanFromName(input.fromName, storeName);
  if (input.prefix !== undefined) {
    const prefix = cleanPrefix(input.prefix);
    if (!prefix) throw new EmailSetupError("BAD_PREFIX", "Use only letters, numbers, dots or dashes before the @.");
    if (!settings.domain) throw new EmailSetupError("NO_SETUP", "Set up email on your domain first.", 404);
    next.domain = { ...settings.domain, prefix };
    if (settings.provider === "resend_domain") next.address = `${prefix}@${settings.domain.name}`;
  }
  const own = next.provider === "resend_domain" && next.address;
  await saveEmailRow(storeId, { settings: next, ...(own ? { externalId: next.address!, displayName: next.address! } : {}) });
}

/** Stops sending from the domain and removes it from Resend (the DNS records can stay; they do no harm). */
export async function removeDomainEmail(storeId: string) {
  const row = await emailRow(storeId);
  const settings = readEmailSettings(row?.settings);
  if (settings.domain?.resendId && process.env.RESEND_API_KEY) await resend().domains.remove(settings.domain.resendId).catch(() => null);
  const next: EmailSettings = { ...settings, domain: undefined };
  const wasActive = settings.provider === "resend_domain";
  if (wasActive) {
    next.provider = undefined;
    next.address = undefined;
  }
  await saveEmailRow(storeId, { settings: next, ...(wasActive ? { status: "disconnected", externalId: null, displayName: null } : {}) });
}

/** Pending domain setups, checked again by the email sync cron so "Connected" shows up without a click. */
export async function checkPendingDomains(limit = 20) {
  const rows = await db.inboxChannel.findMany({
    where: { channel: "email", settings: { path: ["domain", "status"], equals: "pending" } },
    select: { storeId: true },
    take: limit,
    orderBy: { updatedAt: "asc" },
  });
  let verified = 0;
  for (const row of rows) {
    const store = await db.store.findUnique({ where: { id: row.storeId }, select: { name: true } });
    const result = await checkDomainEmail(row.storeId, store?.name ?? "").catch(() => ({ verified: false }));
    if (result.verified) verified += 1;
  }
  return { checked: rows.length, verified };
}

/** The store whose verified, receiving domain an inbound email was sent to (mail to hello@mystore.com). */
export async function storeForReceivingDomain(addresses: string[]) {
  for (const address of addresses) {
    const host = bareDomain(address.split("@")[1]);
    if (!host) continue;
    const row = await db.inboxChannel.findFirst({
      where: { channel: "email", status: "connected", settings: { path: ["domain", "name"], equals: host } },
      select: { storeId: true, settings: true },
    });
    if (row && readEmailSettings(row.settings).domain?.receiving) return row.storeId;
  }
  return null;
}

/** The secret that signs reply addresses (derived from the channel encryption key). */
export function replySecret() {
  const key = credentialKey();
  const base = key ?? process.env.RESEND_WEBHOOK_SECRET ?? process.env.INBOX_EMAIL_WEBHOOK_SECRET ?? "";
  return base ? createHmac("sha256", base).update("email-reply-address").digest("hex") : "";
}

export function decryptEmailCredentials(payload: string | null | undefined) {
  return decryptJson<{ refreshToken?: string; accessToken?: string; expiresAt?: number }>(payload);
}
