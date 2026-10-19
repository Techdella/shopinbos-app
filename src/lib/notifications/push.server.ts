import "server-only";
import webpush from "web-push";
import { db } from "@/lib/db/client";
import {
  EXPO_BATCH_SIZE,
  EXPO_RECEIPT_BATCH_SIZE,
  MAX_DEVICE_FAILURES,
  chunk,
  isDeadWebPushStatus,
  readReceipts,
  readTickets,
  type AndroidChannelId,
  type ExpoTicket,
} from "@shared/notifications";

// Sending push notifications: Expo (the iOS and Android app, batches of 100, tickets checked later by
// /api/cron/push-receipts) and Web Push (browsers, VAPID keys in WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY /
// WEB_PUSH_SUBJECT). Both switch a device off when its token is dead. Without keys, web push is simply skipped.

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const FETCH_TIMEOUT_MS = 10_000;

export interface PushDeviceRow {
  id: string;
  provider: string;
  token: string;
  p256dh: string | null;
  auth: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Web link (the browser opens it; the app maps it to a screen). */
  url?: string | null;
  /** App screen to open, when there's no web page (riders). */
  route?: string | null;
  notificationId?: string | null;
  category: string;
  event?: string | null;
  channelId: AndroidChannelId;
  urgent?: boolean;
  /** App icon badge (unread count). */
  badge?: number | null;
  /** Browser: a newer notification with the same tag replaces the old one. */
  tag?: string | null;
}

export interface PushRecord {
  notificationId?: string | null;
  userId?: string | null;
  riderId?: string | null;
  collapseKey?: string | null;
  category?: string | null;
}

export const PUSH_DEVICE_SELECT = { id: true, provider: true, token: true, p256dh: true, auth: true } as const;

// ─── Web Push setup ───────────────────────────────────────────────────────────

let vapidReady: boolean | null = null;

export function webPushPublicKey(): string | null {
  const key = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
  return key && process.env.WEB_PUSH_PRIVATE_KEY?.trim() ? key : null;
}

function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return (vapidReady = false);
  try {
    webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT?.trim() || "mailto:hello@shopinbos.com", publicKey, privateKey);
    return (vapidReady = true);
  } catch (error) {
    console.error("[push] web push keys are not valid", error);
    return (vapidReady = false);
  }
}

// ─── Devices ──────────────────────────────────────────────────────────────────

async function disableDevices(ids: string[], reason: string) {
  if (!ids.length) return;
  await db.pushDevice.updateMany({ where: { id: { in: ids }, disabledAt: null }, data: { disabledAt: new Date(), lastError: reason.slice(0, 300) } }).catch(() => null);
}

async function countFailure(id: string, error: string) {
  const device = await db.pushDevice.update({ where: { id }, data: { failureCount: { increment: 1 }, lastError: error.slice(0, 300) }, select: { failureCount: true } }).catch(() => null);
  if (device && device.failureCount >= MAX_DEVICE_FAILURES) await disableDevices([id], `Too many failed sends: ${error}`);
}

async function countSuccess(ids: string[]) {
  if (!ids.length) return;
  await db.pushDevice.updateMany({ where: { id: { in: ids }, failureCount: { gt: 0 } }, data: { failureCount: 0, lastError: null } }).catch(() => null);
}

// ─── Expo ─────────────────────────────────────────────────────────────────────

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" };
  const token = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function expoMessage(device: PushDeviceRow, payload: PushPayload) {
  return {
    to: device.token,
    title: payload.title.slice(0, 120),
    body: payload.body.slice(0, 240),
    sound: "default",
    channelId: payload.channelId,
    priority: payload.urgent ? "high" : "default",
    ...(typeof payload.badge === "number" ? { badge: Math.max(0, payload.badge) } : {}),
    data: {
      notificationId: payload.notificationId ?? null,
      url: payload.url ?? null,
      route: payload.route ?? null,
      category: payload.category,
      event: payload.event ?? null,
    },
  };
}

async function sendExpo(devices: PushDeviceRow[], payload: PushPayload, record: PushRecord) {
  let sent = 0;
  for (const batch of chunk(devices, EXPO_BATCH_SIZE)) {
    let tickets: ExpoTicket[] | null = null;
    let requestError: string | null = null;
    try {
      const response = await fetch(EXPO_SEND_URL, { method: "POST", headers: expoHeaders(), body: JSON.stringify(batch.map((device) => expoMessage(device, payload))), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      const body = (await response.json().catch(() => null)) as { data?: ExpoTicket[] | ExpoTicket; errors?: Array<{ message?: string }> } | null;
      if (!response.ok) requestError = body?.errors?.[0]?.message ?? `Expo answered ${response.status}`;
      else tickets = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : null;
    } catch (error) {
      requestError = error instanceof Error ? error.message : "Expo push request failed";
    }
    const outcomes = readTickets(batch.map((device) => device.id), requestError ? [] : tickets);
    await db.notificationDelivery
      .createMany({
        data: outcomes.map((outcome) => ({
          notificationId: record.notificationId ?? null,
          userId: record.userId ?? null,
          riderId: record.riderId ?? null,
          deviceId: outcome.deviceId,
          channel: "push",
          provider: "expo",
          status: outcome.status,
          ticketId: outcome.ticketId,
          collapseKey: record.collapseKey ?? null,
          category: record.category ?? payload.category,
          title: payload.title.slice(0, 200),
          error: requestError ?? outcome.error,
        })),
      })
      .catch((error) => console.error("[push] could not record Expo tickets", error));
    await disableDevices(outcomes.filter((outcome) => outcome.dead).map((outcome) => outcome.deviceId), "DeviceNotRegistered");
    for (const outcome of outcomes) if (outcome.status === "error" && !outcome.dead && !requestError) await countFailure(outcome.deviceId, outcome.error ?? "error");
    sent += outcomes.filter((outcome) => outcome.status === "sent").length;
  }
  return sent;
}

// ─── Web Push ─────────────────────────────────────────────────────────────────

async function sendWeb(devices: PushDeviceRow[], payload: PushPayload, record: PushRecord) {
  if (!devices.length || !ensureVapid()) return 0;
  const body = JSON.stringify({
    title: payload.title.slice(0, 120),
    body: payload.body.slice(0, 240),
    url: payload.url ?? "/home/notifications",
    tag: payload.tag ?? payload.notificationId ?? undefined,
    notificationId: payload.notificationId ?? null,
    category: payload.category,
    badge: payload.badge ?? null,
  });
  let sent = 0;
  const ok: string[] = [];
  await Promise.all(
    devices.map(async (device) => {
      if (!device.p256dh || !device.auth) return;
      let status = "ok";
      let error: string | null = null;
      try {
        await webpush.sendNotification({ endpoint: device.token, keys: { p256dh: device.p256dh, auth: device.auth } }, body, { TTL: 12 * 60 * 60, urgency: payload.urgent ? "high" : "normal", timeout: FETCH_TIMEOUT_MS });
        sent++;
        ok.push(device.id);
      } catch (caught) {
        const statusCode = (caught as { statusCode?: number })?.statusCode ?? null;
        status = "error";
        error = `${statusCode ?? ""} ${caught instanceof Error ? caught.message : "Web push failed"}`.trim().slice(0, 300);
        if (isDeadWebPushStatus(statusCode)) await disableDevices([device.id], "Browser subscription expired");
        else await countFailure(device.id, error);
      }
      await db.notificationDelivery
        .create({ data: { notificationId: record.notificationId ?? null, userId: record.userId ?? null, riderId: record.riderId ?? null, deviceId: device.id, channel: "push", provider: "webpush", status, collapseKey: record.collapseKey ?? null, category: record.category ?? payload.category, title: payload.title.slice(0, 200), error } })
        .catch(() => null);
    }),
  );
  await countSuccess(ok);
  return sent;
}

/** Sends one push to these devices (phones through Expo, browsers through Web Push). Never throws. */
export async function pushToDevices(devices: PushDeviceRow[], payload: PushPayload, record: PushRecord): Promise<number> {
  try {
    const expo = devices.filter((device) => device.provider === "expo");
    const web = devices.filter((device) => device.provider === "webpush");
    const [a, b] = await Promise.all([expo.length ? sendExpo(expo, payload, record) : 0, sendWeb(web, payload, record)]);
    return a + b;
  } catch (error) {
    console.error("[push] send failed", error);
    return 0;
  }
}

// ─── Receipts ─────────────────────────────────────────────────────────────────

/** Tickets are checked after 15 minutes (Expo's advice) and given up after a day (receipts are gone by then). */
const RECEIPT_MIN_AGE_MS = 15 * 60_000;
const RECEIPT_MAX_AGE_MS = 24 * 60 * 60_000;

export async function checkExpoReceipts(now = new Date(), limit = 3000) {
  const rows = await db.notificationDelivery.findMany({
    where: { provider: "expo", status: "sent", ticketId: { not: null }, createdAt: { lte: new Date(now.getTime() - RECEIPT_MIN_AGE_MS), gte: new Date(now.getTime() - RECEIPT_MAX_AGE_MS) } },
    select: { id: true, ticketId: true, deviceId: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const stats = { checked: rows.length, ok: 0, failed: 0, deadDevices: 0, pending: 0 };
  for (const batch of chunk(rows, EXPO_RECEIPT_BATCH_SIZE)) {
    let receipts: Record<string, ExpoTicket> | null = null;
    try {
      const response = await fetch(EXPO_RECEIPTS_URL, { method: "POST", headers: expoHeaders(), body: JSON.stringify({ ids: batch.map((row) => row.ticketId) }), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!response.ok) continue;
      receipts = ((await response.json().catch(() => null)) as { data?: Record<string, ExpoTicket> } | null)?.data ?? null;
    } catch {
      continue; // try again next run
    }
    const outcome = readReceipts(batch.map((row) => ({ id: row.id, ticketId: row.ticketId!, deviceId: row.deviceId })), receipts);
    const checkedAt = new Date();
    if (outcome.ok.length) await db.notificationDelivery.updateMany({ where: { id: { in: outcome.ok } }, data: { status: "ok", checkedAt } });
    for (const failed of outcome.failed) await db.notificationDelivery.update({ where: { id: failed.id }, data: { status: "error", error: failed.error, checkedAt } }).catch(() => null);
    await disableDevices(outcome.deadDevices, "DeviceNotRegistered");
    stats.ok += outcome.ok.length;
    stats.failed += outcome.failed.length;
    stats.deadDevices += outcome.deadDevices.length;
    stats.pending += outcome.pending.length;
  }
  // Tickets too old to have a receipt: stop asking.
  await db.notificationDelivery.updateMany({ where: { provider: "expo", status: "sent", createdAt: { lt: new Date(now.getTime() - RECEIPT_MAX_AGE_MS) } }, data: { status: "expired", checkedAt: now } }).catch(() => null);
  return stats;
}
