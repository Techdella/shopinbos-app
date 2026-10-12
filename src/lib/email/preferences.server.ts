import "server-only";

import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db/client";
import { normalizeEmail, normalizePhone } from "@/lib/marketing/segment-rules";
import { clearOptOut, recordOptOut } from "@/lib/marketing/opt-outs";
import { optOutIndex, isOptedOut } from "@/lib/marketing/text-channels";
import { PLATFORM_TOPICS, STORE_TOPICS, platformEventKey, readContactTopics, type PlatformTopic, type StoreTopic } from "./preferences";

// Reading and saving email preferences: store contacts (B) on Subscriber, Shopinbos users (A) on NotificationPreference.
// Every marketing and lifecycle send checks these first (campaigns/send.ts, automations/flow-engine.ts,
// verification/reminders.server.ts via sendPlatformEmail).

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

// ─── Shopinbos users (A) ──────────────────────────────────────────────────────

export async function platformEmailPrefs(userId: string): Promise<Record<PlatformTopic, boolean>> {
  const rows = await db.notificationPreference
    .findMany({ where: { userId, category: "system", eventKey: { in: PLATFORM_TOPICS.map((t) => platformEventKey(t.key)) } }, select: { eventKey: true, email: true } })
    .catch(() => []);
  const off = new Set(rows.filter((row) => !row.email).map((row) => row.eventKey));
  return Object.fromEntries(PLATFORM_TOPICS.map((t) => [t.key, !off.has(platformEventKey(t.key))])) as Record<PlatformTopic, boolean>;
}

export async function platformEmailAllowed(userId: string, topic: PlatformTopic) {
  return (await platformEmailPrefs(userId))[topic];
}

export async function savePlatformEmailPrefs(userId: string, prefs: Partial<Record<PlatformTopic, boolean>>) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) return false;
  for (const topic of PLATFORM_TOPICS) {
    const value = prefs[topic.key];
    if (typeof value !== "boolean") continue;
    const eventKey = platformEventKey(topic.key);
    await db.notificationPreference.upsert({
      where: { userId_eventKey_category: { userId, eventKey, category: "system" } },
      create: { userId, role: user.role as Role, eventKey, category: "system", inApp: false, email: value },
      update: { email: value },
    });
  }
  return true;
}

// ─── Store contacts (B) ───────────────────────────────────────────────────────

export interface ContactPreferences {
  email: string;
  subscribed: boolean;
  topics: Record<StoreTopic, boolean>;
  phone: string | null;
  /** null: no phone on file, so the channel isn't offered. */
  sms: boolean | null;
  whatsapp: boolean | null;
}

export async function contactPreferences(storeId: string, rawEmail: string): Promise<ContactPreferences> {
  const email = normalizeEmail(rawEmail) ?? rawEmail.toLowerCase();
  const row = await db.subscriber.findUnique({ where: { storeId_email: { storeId, email } }, select: { status: true, phone: true, metadata: true } });
  const phone = normalizePhone(row?.phone);
  let sms: boolean | null = null;
  let whatsapp: boolean | null = null;
  if (phone) {
    const optOuts = optOutIndex(await db.marketingOptOut.findMany({ where: { storeId, phone }, select: { phone: true, channel: true, scope: true } }).catch(() => []));
    const history = Array.isArray(record(row?.metadata).consent) ? (record(row?.metadata).consent as Array<Record<string, unknown>>) : [];
    const last = history[history.length - 1] ?? {};
    sms = last.sms === true && !isOptedOut(optOuts, "sms", phone, "marketing");
    whatsapp = last.whatsapp === true && !isOptedOut(optOuts, "whatsapp", phone, "marketing");
  }
  return { email, subscribed: !row || row.status === "active", topics: readContactTopics(row?.metadata), phone, sms, whatsapp };
}

export interface SaveContactInput {
  topics?: Partial<Record<StoreTopic, boolean>>;
  sms?: boolean;
  whatsapp?: boolean;
  /** Unsubscribe from all marketing email (and texts, when they have a phone). */
  unsubscribeAll?: boolean;
}

/** Saves a contact's choices from the preference center. Idempotent. */
export async function saveContactPreferences(storeId: string, rawEmail: string, input: SaveContactInput, source = "preference_center") {
  const email = normalizeEmail(rawEmail);
  if (!email) return false;
  const now = new Date();
  const existing = await db.subscriber.findUnique({ where: { storeId_email: { storeId, email } }, select: { id: true, status: true, phone: true, metadata: true } });
  const metadata = record(existing?.metadata);
  const current = readContactTopics(metadata);
  const topics = input.unsubscribeAll
    ? (Object.fromEntries(STORE_TOPICS.map((t) => [t.key, false])) as Record<StoreTopic, boolean>)
    : { ...current, ...Object.fromEntries(Object.entries(input.topics ?? {}).filter(([, v]) => typeof v === "boolean")) };
  const anyOn = STORE_TOPICS.some((t) => topics[t.key]);
  // Keeping some topics on is a fresh, explicit choice made from their own inbox; all off is an unsubscribe.
  const status = anyOn ? "active" : "unsubscribed";
  const history = Array.isArray(metadata.consent) ? (metadata.consent as Array<Record<string, unknown>>).slice(-9) : [];
  const last = history[history.length - 1] ?? {};
  const consent = { email: anyOn, sms: last.sms === true, whatsapp: last.whatsapp === true, at: now.toISOString(), source };
  const nextMetadata = { ...metadata, emailTopics: topics, consent: [...history, consent], preferencesUpdatedAt: now.toISOString() } as unknown as Prisma.InputJsonValue;
  const statusData = status === "active" ? { status: "active" as const, unsubscribedAt: null } : { status: "unsubscribed" as const, unsubscribedAt: existing?.status === "active" || !existing ? now : undefined };
  if (existing) {
    // A bounce or spam complaint is never undone from here.
    const keepSuppressed = existing.status === "bounced" || existing.status === "spam";
    await db.subscriber.update({ where: { id: existing.id }, data: { metadata: nextMetadata, ...(keepSuppressed ? {} : statusData) } });
  } else {
    await db.subscriber.create({ data: { storeId, email, source: "order", metadata: nextMetadata, ...statusData, status: statusData.status } });
  }

  const phone = normalizePhone(existing?.phone);
  if (phone) {
    const sms = input.unsubscribeAll ? false : input.sms;
    const whatsapp = input.unsubscribeAll ? false : input.whatsapp;
    if (sms === false) await recordOptOut(storeId, phone, "sms", { scope: "marketing", source }).catch(() => null);
    if (sms === true) await clearOptOut(storeId, phone, "sms", source, true).catch(() => null);
    if (whatsapp === false) await recordOptOut(storeId, phone, "whatsapp", { scope: "marketing", source }).catch(() => null);
    if (whatsapp === true) await clearOptOut(storeId, phone, "whatsapp", source, true).catch(() => null);
  }
  return true;
}

/** Turns off every optional Shopinbos email for a user (one-click unsubscribe). */
export async function unsubscribeUserFromAll(userId: string) {
  return savePlatformEmailPrefs(userId, Object.fromEntries(PLATFORM_TOPICS.map((t) => [t.key, false])));
}
