import "server-only";
import type { NotificationType, Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { appBase, sendPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import type { Locale } from "@shared/i18n";
import { mailT } from "@shared/i18n/mail";
import {
  BURST_WINDOW_MS,
  DEFAULT_QUIET_HOURS,
  androidChannelFor,
  appRouteFor,
  autoDedupeKey,
  burstDecision,
  burstFlushDue,
  burstSummary,
  categoryForType,
  channelAllowedFor,
  collapseByKey,
  eventInfo,
  isQuietTime,
  planDelivery,
  preferenceEventKey,
  quietSummary,
  resolvePreferences,
  routeHref,
  type NotifyCategory,
  type QuietHours,
} from "@shared/notifications";
import { PUSH_DEVICE_SELECT, checkExpoReceipts, pushToDevices, type PushPayload } from "./push.server";
import { sendSms, sendWhatsAppMessage } from "./service";
import { toE164 } from "@shared/phone";
import { metaWhatsAppConfig, sendMetaTemplate } from "@/lib/lead-growth/whatsapp-meta.server";
import { notifyWhatsAppTemplate } from "./whatsapp-templates";

// The one way to tell someone something (build: "notify()"): writes the in-app notification (the bell), then
// delivers it the way they chose in Settings › Notifications: push to their phone and browsers, email, SMS or
// WhatsApp, per category (shared/notifications.ts). Quiet hours hold pushes until morning (urgent ones still go),
// the same thing is never sent twice (dedupe key), and a burst ("5 new orders") becomes one push.
// createNotification (./create.ts) is a thin wrapper, so every existing trigger goes through here.

export type NotifyPriority = "critical" | "warning" | "info" | "success";

export interface NotifyInput {
  userId: string;
  /** Event key from shared/notifications.ts NOTIFY_EVENTS (decides category, urgency and burst grouping). */
  event?: string | null;
  /** Notification.type (icon and the old filters). Defaults from the category. */
  type?: NotificationType;
  /** Overrides the event's category. */
  category?: NotifyCategory;
  priority?: NotifyPriority;
  title: string;
  description: string;
  link?: string | null;
  actionLabel?: string | null;
  actionUrl?: string | null;
  imageUrl?: string | null;
  metadata?: Record<string, unknown>;
  /** Same key, same person: sent once. Omitted: the same text within two minutes counts as a repeat. false: never deduped. */
  dedupeKey?: string | null | false;
  /** Email it too: true (follows their email switch for the category) or "transactional" (billing and security, always). */
  email?: boolean | "transactional";
  /** Ignore quiet hours (defaults from the event). */
  urgent?: boolean;
  /** The caller already texted or WhatsApped them about this: don't again. */
  phoneHandled?: boolean;
  /**
   * WhatsApp it too, unless they set this category's WhatsApp switch themselves (it's off by default for most
   * categories): for the few alerts that matter enough, like a shop waiting for a supplier's products.
   */
  whatsapp?: boolean;
  /** Skip every channel except the bell (e.g. the person is looking at the screen already). */
  inAppOnly?: boolean;
  /** The language the title and description are written in: the email's frame and button follow it. */
  locale?: Locale;
  /** The phone app screen a tapped push opens (expo-router href or app:/… link), when it isn't the link's own screen. */
  appRoute?: string | null;
  /** Push only to these kinds of device: "app" (Expo phones) and/or "web" (browsers). Default: all of them. */
  pushPlatforms?: ReadonlyArray<"app" | "web">;
  /** Stored as the push deliveries' collapseKey so a sender can count them (e.g. "push-campaign:<id>"). */
  trackKey?: string | null;
}

export interface NotifyResult {
  notification: { id: string } & Record<string, unknown>;
  duplicate: boolean;
}

const TYPE_FOR_CATEGORY: Record<NotifyCategory, NotificationType> = {
  orders: "order",
  money: "payout",
  messages: "customers",
  deliveries: "logistics",
  stock: "inventory",
  marketing: "marketing",
  account: "system",
  announcements: "system",
};

function absoluteUrl(target: string) {
  return /^https?:\/\//.test(target) ? target : `${appBase()}${target.startsWith("/") ? "" : "/"}${target}`;
}

function isUniqueViolation(error: unknown) {
  return (error as { code?: unknown })?.code === "P2002";
}

/** The notify columns aren't in the database yet (migration not run): fall back to a plain notification. */
function isMissingColumn(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  return code === "P2022" || /column .* does not exist/i.test(String((error as { message?: unknown })?.message ?? ""));
}

function isMissingTable(error: unknown) {
  const code = (error as { code?: unknown })?.code;
  return code === "P2021" || /relation .* does not exist/i.test(String((error as { message?: unknown })?.message ?? ""));
}

export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const info = eventInfo(input.event);
  const category: NotifyCategory = input.category ?? info?.category ?? categoryForType(input.type);
  const type: NotificationType = input.type ?? TYPE_FOR_CATEGORY[category];
  const priority = input.priority ?? "info";
  const now = new Date();
  const key = input.dedupeKey === false ? null : input.dedupeKey || autoDedupeKey({ event: input.event, title: input.title, description: input.description, link: input.link }, now);

  const base = {
    userId: input.userId,
    type,
    priority,
    title: input.title.slice(0, 300),
    description: input.description.slice(0, 2000),
    link: input.link ?? null,
    actionLabel: input.actionLabel ?? null,
    actionUrl: input.actionUrl ?? null,
    imageUrl: input.imageUrl ?? null,
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
  };

  // Already sent (a retry, or the same alert twice in its window): return it without asking the database to refuse a
  // duplicate, which Prisma would log as an error. The unique index below still settles two at the same moment.
  if (key) {
    const existing = await db.notification.findFirst({ where: { userId: input.userId, dedupeKey: key } }).catch(() => null);
    if (existing) return { notification: existing, duplicate: true };
  }

  let notification: NotifyResult["notification"];
  try {
    notification = await db.notification.create({ data: { ...base, event: input.event ?? null, category, dedupeKey: key } });
  } catch (error) {
    if (isUniqueViolation(error) && key) {
      const existing = await db.notification.findFirst({ where: { userId: input.userId, dedupeKey: key } });
      if (existing) return { notification: existing, duplicate: true };
    }
    if (!isMissingColumn(error)) throw error;
    notification = await db.notification.create({ data: base });
  }

  if (!input.inAppOnly) {
    await deliver({ ...input, priority, type }, notification.id, category, now).catch((error) => console.error("[notify] delivery failed", error));
  }
  return { notification, duplicate: false };
}

/** notify() for every admin (items to review, alerts). */
export async function notifyAdmins(input: Omit<NotifyInput, "userId">) {
  const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true }, take: 50 }).catch(() => []);
  await Promise.all(admins.map((admin) => notify({ ...input, userId: admin.id }).catch(() => null)));
}

// ─── Delivery ─────────────────────────────────────────────────────────────────

async function quietHoursFor(userId: string): Promise<QuietHours> {
  const setting = await db.notificationSetting.findUnique({ where: { userId } }).catch(() => null);
  return setting ? { enabled: setting.quietHoursEnabled, start: setting.quietStart, end: setting.quietEnd, timezone: setting.timezone } : DEFAULT_QUIET_HOURS;
}

async function activeDevices(where: { userId?: string; riderId?: string }, platforms?: ReadonlyArray<"app" | "web">) {
  const providers = platforms?.length ? platforms.map((platform) => (platform === "app" ? "expo" : "webpush")) : null;
  return db.pushDevice.findMany({ where: { ...where, disabledAt: null, ...(providers ? { provider: { in: providers } } : {}) }, select: PUSH_DEVICE_SELECT, orderBy: { lastSeenAt: "desc" }, take: 10 }).catch(() => []);
}

async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, read: false } }).catch(() => null);
}

function pushPayload(input: { title: string; description: string; link?: string | null; actionUrl?: string | null; event?: string | null; appRoute?: string | null }, category: NotifyCategory, notificationId: string | null, urgent: boolean, badge: number | null): PushPayload {
  const url = input.actionUrl || input.link || null;
  const route = appRouteFor(input.appRoute || url);
  return {
    title: input.title,
    body: input.description,
    url,
    route: route ? routeHref(route) : null,
    notificationId,
    category,
    event: input.event ?? null,
    channelId: androidChannelFor(category),
    urgent,
    badge,
    tag: notificationId,
  };
}

async function deliver(input: NotifyInput & { priority: NotifyPriority; type: NotificationType }, notificationId: string, category: NotifyCategory, now: Date) {
  const info = eventInfo(input.event);
  const urgent = input.urgent ?? info?.urgent ?? false;
  const [user, rows, quietHours, devices] = await Promise.all([
    db.user.findUnique({ where: { id: input.userId }, select: { email: true, phone: true, role: true, name: true } }),
    db.notificationPreference.findMany({ where: { userId: input.userId }, select: { eventKey: true, push: true, email: true, sms: true, whatsapp: true, inApp: true } }).catch(() => []),
    quietHoursFor(input.userId),
    activeDevices({ userId: input.userId }, input.pushPlatforms),
  ]);
  if (!user) return;

  // Same rule as before notify(): payouts and critical alerts are transactional (no opt-out), the rest follow the switch.
  const emailKind = input.email ? (input.email === "transactional" || input.type === "payout" || input.priority === "critical" ? "transactional" : "notification") : null;
  const prefs = resolvePreferences(rows, user.role);
  if (input.whatsapp && !rows.some((row) => row.eventKey === preferenceEventKey(category))) prefs[category] = { ...prefs[category], whatsapp: channelAllowedFor(category, "whatsapp") };
  const plan = planDelivery({ category, urgent, prefs, quiet: isQuietTime(now, quietHours), email: emailKind, phoneHandled: input.phoneHandled });
  const target = input.actionUrl || input.link || null;

  const jobs: Array<Promise<unknown>> = [];

  if (plan.email && user.email && emailKind) {
    jobs.push(
      sendPlatformEmail({
        to: user.email,
        user: { id: input.userId, role: user.role },
        kind: emailKind,
        subject: input.title,
        heading: input.title,
        eyebrow: input.locale && input.locale !== "en" ? null : (input.type as string).replace(/_/g, " "),
        preheader: input.description.slice(0, 140),
        bodyHtml: html.text(input.description),
        cta: target ? { label: input.actionLabel || mailT(input.locale)("notify.viewDetails"), url: absoluteUrl(target) } : null,
        locale: input.locale,
      })
        .then((result) => record({ notificationId, userId: input.userId, channel: "email", provider: "resend", status: result.success ? "ok" : "error", category, title: input.title, error: result.success ? null : result.message ?? null }))
        .catch(() => null),
    );
  }

  const phone = plan.sms || plan.whatsapp ? await textPhoneFor(input.userId, user.phone, user.role) : null;
  const text = `Shopinbos: ${input.title.replace(/\.$/, "")}. ${input.description}`.slice(0, 300) + (target ? ` ${absoluteUrl(target)}` : "");
  if (plan.sms && phone) {
    jobs.push(
      sendSms({ to: [phone], message: text })
        .then((result) => record({ notificationId, userId: input.userId, channel: "sms", provider: result.provider, status: result.success ? "ok" : "error", category, title: input.title, error: result.success ? null : result.message }))
        .catch(() => null),
    );
  }
  if (plan.whatsapp && phone) {
    jobs.push(
      sendAlertWhatsApp({ input, category, to: phone, url: target ? absoluteUrl(target) : null, user, text })
        .then((result) => record({ notificationId, userId: input.userId, channel: "whatsapp", provider: result.provider, status: result.success ? "ok" : "error", category, title: input.title, error: result.success ? null : result.message }))
        .catch(() => null),
    );
  }

  if (plan.push !== "off" && devices.length) {
    jobs.push(deliverPush({ input, notificationId, category, urgent, devices, hold: plan.push === "hold", now, collapse: info?.collapse ?? null }));
  }
  await Promise.all(jobs);
}

/**
 * WhatsApp for an alert: the approved template on our own number (Meta Cloud API) when it's connected, since WhatsApp
 * only lets a business start a chat with a template (lib/notifications/whatsapp-templates.ts). Template not approved
 * yet: plain text on the same number, which reaches people who messaged us in the last 24 hours. Always WhatsApp
 * Cloud, never an SMS provider.
 */
export async function sendAlertWhatsApp(args: {
  input: NotifyInput;
  category: NotifyCategory;
  to: string;
  url: string | null;
  user: { name: string; role: string };
  text: string;
}): Promise<{ success: boolean; provider: string; message?: string }> {
  const config = metaWhatsAppConfig();
  if (config) {
    const business = args.user.role === "logistics_partner"
      ? (await db.logisticsPartner.findUnique({ where: { userId: args.input.userId }, select: { displayName: true } }).catch(() => null))?.displayName
      : args.user.role === "supplier"
        ? (await db.supplier.findUnique({ where: { userId: args.input.userId }, select: { displayName: true } }).catch(() => null))?.displayName
        : null;
    const status = typeof args.input.metadata?.status === "string" ? args.input.metadata.status : null;
    const { template, params } = notifyWhatsAppTemplate({
      event: args.input.event ?? "",
      category: args.category,
      status,
      title: args.input.title,
      description: args.input.description,
      url: args.url,
      name: args.user.name,
      business: business ?? args.user.name,
    });
    const sent = await sendMetaTemplate(config, { to: args.to, template: template.name, language: template.language, params });
    if (sent.ok) return { success: true, provider: "meta" };
    console.warn(`[notify] WhatsApp template ${template.name} not sent, trying plain text:`, sent.error);
  }
  const result = await sendWhatsAppMessage({ to: [args.to], message: args.text });
  return { success: result.success, provider: result.provider, message: result.message };
}

export type WhatsAppResend = { ok: true; provider: string; to: string } | { ok: false; error: string };

/**
 * Sends a notice that's already in someone's bell on WhatsApp (Admin › Sellers › "Send on WhatsApp"), the way notify()
 * would: the approved template on our number, else plain text. Recorded as a delivery; one already delivered on
 * WhatsApp isn't sent again.
 */
export async function sendNotificationOnWhatsApp(notificationId: string): Promise<WhatsAppResend> {
  if (!metaWhatsAppConfig()) return { ok: false, error: "WhatsApp Cloud isn't connected." };
  const notice = await db.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true, type: true, title: true, description: true, link: true, actionUrl: true, event: true, category: true, metadata: true, user: { select: { name: true, role: true, phone: true } } },
  });
  if (!notice) return { ok: false, error: "That notice is gone." };
  const already = await db.notificationDelivery.findFirst({ where: { notificationId, channel: "whatsapp", status: "ok" }, select: { id: true } }).catch(() => null);
  if (already) return { ok: false, error: "Already sent on WhatsApp." };
  const to = await textPhoneFor(notice.userId, notice.user.phone, notice.user.role);
  if (!to) return { ok: false, error: "No phone number on the account." };
  const category = (notice.category ?? categoryForType(notice.type)) as NotifyCategory;
  const target = notice.actionUrl ?? notice.link;
  const url = target ? absoluteUrl(target) : null;
  const text = `Shopinbos: ${notice.title.replace(/\.$/, "")}. ${notice.description}`.slice(0, 300) + (url ? ` ${url}` : "");
  const input: NotifyInput = { userId: notice.userId, event: notice.event, type: notice.type, title: notice.title, description: notice.description, link: notice.link, metadata: (notice.metadata ?? {}) as Record<string, unknown> };
  const result = await sendAlertWhatsApp({ input, category, to, url, user: { name: notice.user.name ?? "", role: notice.user.role }, text }).catch((error: Error) => ({ success: false, provider: "meta", message: error.message }));
  await record({ notificationId, userId: notice.userId, channel: "whatsapp", provider: result.provider, status: result.success ? "ok" : "error", category, title: notice.title, error: result.success ? null : result.message ?? null });
  return result.success ? { ok: true, provider: result.provider, to } : { ok: false, error: result.message || "WhatsApp didn't take it." };
}

/**
 * Where texts and WhatsApp messages go: the account's phone, else for a delivery partner the company's WhatsApp
 * number (partners sign up with it on the company profile, so the account often has no phone of its own).
 */
export async function textPhoneFor(userId: string, phone: string | null, role?: string | null): Promise<string | null> {
  if (phone?.trim()) return phone;
  if (role !== "logistics_partner") return null;
  const partner = await db.logisticsPartner.findUnique({ where: { userId }, select: { whatsappNumber: true } }).catch(() => null);
  const number = partner?.whatsappNumber?.trim();
  return number ? toE164(number) ?? number : null;
}

async function record(data: { notificationId?: string | null; userId?: string | null; riderId?: string | null; channel: string; provider?: string | null; status: string; category?: string | null; collapseKey?: string | null; title?: string | null; body?: string | null; error?: string | null }) {
  await db.notificationDelivery.create({ data: { ...data, title: data.title?.slice(0, 200) ?? null, body: data.body?.slice(0, 300) ?? null, error: data.error?.slice(0, 300) ?? null } }).catch((error) => {
    if (!isMissingTable(error)) console.error("[notify] could not record delivery", error);
  });
}

async function deliverPush(args: {
  input: NotifyInput;
  notificationId: string;
  category: NotifyCategory;
  urgent: boolean;
  devices: Awaited<ReturnType<typeof activeDevices>>;
  hold: boolean;
  now: Date;
  collapse: { key: string; one: string; many: string } | null;
}) {
  const { input, notificationId, category, urgent, devices, now, collapse } = args;
  if (args.hold) {
    await record({ notificationId, userId: input.userId, channel: "push", status: "held_quiet", category, collapseKey: collapse?.key ?? input.trackKey ?? null, title: input.title, body: input.description });
    return;
  }

  if (collapse && !urgent) {
    const last = await db.notificationDelivery.findFirst({
      where: { userId: input.userId, channel: "push", collapseKey: collapse.key, status: { in: ["sent", "ok", "error"] }, createdAt: { gte: new Date(now.getTime() - BURST_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (burstDecision({ now, lastSentAt: last?.createdAt ?? null }) === "hold") {
      await record({ notificationId, userId: input.userId, channel: "push", status: "held_burst", category, collapseKey: collapse.key, title: input.title, body: input.description });
      return;
    }
    // Things held from the last burst go out with this one as a single "N new orders".
    const held = await db.notificationDelivery.findMany({ where: { userId: input.userId, channel: "push", status: "held_burst", collapseKey: collapse.key }, select: { id: true } });
    if (held.length) {
      await db.notificationDelivery.updateMany({ where: { id: { in: held.map((row) => row.id) } }, data: { status: "flushed", checkedAt: now } });
      const summary = burstSummary(collapse, held.length + 1);
      const badge = await unreadCount(input.userId);
      await pushToDevices(devices, { ...pushPayload({ ...input, title: summary.title, description: summary.body, link: "/home/notifications", actionUrl: null }, category, notificationId, urgent, badge), tag: collapse.key }, { notificationId, userId: input.userId, collapseKey: collapse.key, category });
      return;
    }
  }

  const badge = await unreadCount(input.userId);
  await pushToDevices(devices, pushPayload(input, category, notificationId, urgent, badge), { notificationId, userId: input.userId, collapseKey: collapse?.key ?? input.trackKey ?? null, category });
}

// ─── Riders (no account: push only) ───────────────────────────────────────────

/** A push to a rider's phone (riders sign in with their private link, so there's no bell). Sent once per key. */
export async function notifyRider(input: { riderId: string; event: string; title: string; body: string; route?: string | null; dedupeKey?: string | null }) {
  try {
    const key = input.dedupeKey ? `rider:${input.dedupeKey}`.slice(0, 190) : null;
    if (key) {
      const seen = await db.notificationDelivery.findFirst({ where: { riderId: input.riderId, collapseKey: key }, select: { id: true } });
      if (seen) return;
    }
    const devices = await activeDevices({ riderId: input.riderId });
    const category = eventInfo(input.event)?.category ?? "deliveries";
    if (!devices.length) {
      if (key) await record({ riderId: input.riderId, channel: "push", status: "skipped", category, collapseKey: key, title: input.title, error: "No phone with notifications on" });
      return;
    }
    await pushToDevices(
      devices,
      { title: input.title, body: input.body, url: null, route: input.route ?? "/rider", notificationId: null, category, event: input.event, channelId: androidChannelFor(category), urgent: eventInfo(input.event)?.urgent ?? false, badge: null, tag: key },
      { riderId: input.riderId, collapseKey: key, category },
    );
  } catch (error) {
    console.error("[notify] rider push failed", error);
  }
}

// ─── Cron: held pushes and receipts ───────────────────────────────────────────

/** Held pushes older than this are dropped rather than sent (yesterday's news). */
const HELD_MAX_AGE_MS = 18 * 60 * 60_000;

/** Sends the "N new orders" summaries whose burst window has closed. */
export async function flushBursts(now = new Date()) {
  const held = await db.notificationDelivery.findMany({
    where: { channel: "push", status: "held_burst", userId: { not: null } },
    select: { id: true, userId: true, collapseKey: true, category: true, notificationId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  const groups = new Map<string, typeof held>();
  for (const row of held) {
    const groupKey = `${row.userId}|${row.collapseKey ?? ""}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), row]);
  }
  let sent = 0;
  for (const rows of groups.values()) {
    const first = rows[0];
    if (!burstFlushDue(first.createdAt, now)) continue;
    const ids = rows.map((row) => row.id);
    if (now.getTime() - first.createdAt.getTime() > HELD_MAX_AGE_MS) {
      await db.notificationDelivery.updateMany({ where: { id: { in: ids } }, data: { status: "skipped", checkedAt: now } });
      continue;
    }
    const userId = first.userId!;
    const category = (first.category ?? "orders") as NotifyCategory;
    const quiet = isQuietTime(now, await quietHoursFor(userId));
    if (quiet) {
      await db.notificationDelivery.updateMany({ where: { id: { in: ids } }, data: { status: "held_quiet" } });
      continue;
    }
    await db.notificationDelivery.updateMany({ where: { id: { in: ids } }, data: { status: "flushed", checkedAt: now } });
    const collapse = collapseByKey(first.collapseKey);
    const summary = rows.length > 1 && collapse ? burstSummary(collapse, rows.length) : null;
    const devices = await activeDevices({ userId });
    if (!devices.length) continue;
    const single = rows.length === 1 && first.notificationId ? await db.notification.findUnique({ where: { id: first.notificationId }, select: { id: true, title: true, description: true, link: true, actionUrl: true, event: true } }).catch(() => null) : null;
    const badge = await unreadCount(userId);
    const payload = single
      ? pushPayload(single, category, single.id, false, badge)
      : pushPayload({ title: summary?.title ?? "New updates", description: summary?.body ?? "Tap to see them.", link: "/home/notifications" }, category, null, false, badge);
    sent += await pushToDevices(devices, { ...payload, tag: first.collapseKey }, { userId, collapseKey: first.collapseKey, category });
  }
  return sent;
}

/** After quiet hours: one push per person for everything that arrived overnight. */
export async function flushQuietHours(now = new Date()) {
  const held = await db.notificationDelivery.findMany({
    where: { channel: "push", status: "held_quiet", userId: { not: null } },
    select: { id: true, userId: true, category: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });
  const byUser = new Map<string, typeof held>();
  for (const row of held) byUser.set(row.userId!, [...(byUser.get(row.userId!) ?? []), row]);
  let sent = 0;
  for (const [userId, rows] of byUser) {
    if (isQuietTime(now, await quietHoursFor(userId))) continue;
    const ids = rows.map((row) => row.id);
    const fresh = rows.filter((row) => now.getTime() - row.createdAt.getTime() <= HELD_MAX_AGE_MS);
    await db.notificationDelivery.updateMany({ where: { id: { in: ids } }, data: { status: fresh.length ? "flushed" : "skipped", checkedAt: now } });
    if (!fresh.length) continue;
    const [devices, user] = await Promise.all([activeDevices({ userId }), db.user.findUnique({ where: { id: userId }, select: { role: true } })]);
    const summary = quietSummary(fresh.map((row) => row.category ?? "account"), user?.role);
    if (!devices.length || !summary) continue;
    const badge = await unreadCount(userId);
    const category = (fresh[0].category ?? "account") as NotifyCategory;
    sent += await pushToDevices(devices, { ...pushPayload({ title: summary.title, description: summary.body, link: "/home/notifications" }, category, null, false, badge), tag: "quiet-summary" }, { userId, category });
  }
  return sent;
}

/** Everything /api/cron/push-receipts does: burst and quiet-hours summaries, Expo receipts, old rows cleared. */
export async function runPushMaintenance(now = new Date()) {
  const bursts = await flushBursts(now);
  const quiet = await flushQuietHours(now);
  const receipts = await checkExpoReceipts(now);
  // Delivery history is kept 30 days.
  const pruned = await db.notificationDelivery.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60_000) } } }).then((result) => result.count).catch(() => 0);
  return { bursts, quiet, receipts, pruned };
}
