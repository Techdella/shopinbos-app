import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { db } from "@/lib/db/client";
import { ok, apiError } from "@/lib/api/response";
import { isEmailConfigured } from "@/lib/notifications/resend";
import { platformWhatsAppReady } from "@/lib/notifications/service";
import { textPhoneFor } from "@/lib/notifications/notify.server";
import { webPushPublicKey } from "@/lib/notifications/push.server";
import { platformSmsReady } from "@/lib/sms";
import {
  DEFAULT_QUIET_HOURS,
  LEGACY_MESSAGE_EVENT_KEY,
  NOTIFY_CATEGORY_KEYS,
  categoriesFor,
  categoryLabel,
  channelAllowedFor,
  parseClock,
  preferenceEventKey,
  resolvePreferences,
  type NotifyCategory,
} from "@shared/notifications";
import { messageSourceEventKey, messageSourceSwitches, messageSourcesFor, unreadEmailOn, type MessageSource } from "@shared/message-notifications";

// Settings › Notifications: for each category (orders, payments, messages…) which channels are on (push, email,
// SMS, WhatsApp), and quiet hours. The bell always gets everything. Saved as NotificationPreference rows
// ("notify.<category>") and one NotificationSetting row. Messages also has its own section
// (shared/message-notifications.ts): push per source for delivery partners ("notify.messages.<source>" rows) and the
// "email me if I haven't read it in 15 minutes" switch (the older "message_received" row the email sweep reads).

async function load(user: { id: string; role: string }) {
  const [rows, setting, account, devices] = await Promise.all([
    db.notificationPreference.findMany({ where: { userId: user.id }, select: { eventKey: true, push: true, email: true, sms: true, whatsapp: true, inApp: true } }),
    db.notificationSetting.findUnique({ where: { userId: user.id } }).catch(() => null),
    db.user.findUnique({ where: { id: user.id }, select: { email: true, phone: true } }),
    db.pushDevice.count({ where: { userId: user.id, disabledAt: null } }).catch(() => 0),
  ]);
  const prefs = resolvePreferences(rows, user.role);
  // For Messages, "Email" is the unread-message email (the only email messages send), so both places agree.
  const unreadEmail = unreadEmailOn(rows);
  return {
    categories: categoriesFor(user.role).map((category) => ({
      key: category.key,
      label: categoryLabel(category.key, user.role),
      help: category.help,
      channels: category.key === "messages" ? { ...prefs.messages, email: unreadEmail } : prefs[category.key],
      textAllowed: channelAllowedFor(category.key, "sms"),
      emailAllowed: channelAllowedFor(category.key, "email"),
    })),
    // Admins have no partner chat, so no unread-message email.
    messages: { push: prefs.messages.push, sources: messageSourceSwitches(rows, user.role), unreadEmail: user.role === "admin" ? null : unreadEmail },
    quietHours: setting ? { enabled: setting.quietHoursEnabled, start: setting.quietStart, end: setting.quietEnd, timezone: setting.timezone } : DEFAULT_QUIET_HOURS,
    available: { webPush: Boolean(webPushPublicKey()), email: isEmailConfigured(), sms: platformSmsReady(), whatsapp: platformWhatsAppReady() },
    contact: { email: account?.email ?? null, phone: (await textPhoneFor(user.id, account?.phone ?? null, user.role)) ?? null },
    devices,
  };
}

export const GET = withAuth(async (_req, { user }) => ok(await load(user)));

const Switches = z.object({ push: z.boolean(), email: z.boolean(), sms: z.boolean(), whatsapp: z.boolean() }).partial();
const Clock = z.string().refine((value) => parseClock(value) !== null, "Use a time like 22:00.");
const SaveSchema = z.object({
  categories: z.partialRecord(z.enum(NOTIFY_CATEGORY_KEYS), Switches).optional(),
  quietHours: z.object({ enabled: z.boolean(), start: Clock, end: Clock }).partial().optional(),
  messages: z
    .object({
      sources: z.partialRecord(z.enum(["riders", "business", "customers"]), z.object({ push: z.boolean() })).optional(),
      unreadEmail: z.boolean().optional(),
    })
    .optional(),
});

/** The unread-message email switch, on the older "message_received" row (inApp and SMS kept as they are). */
async function saveUnreadEmail(user: { id: string; role: Role }, on: boolean) {
  await db.notificationPreference.upsert({
    where: { userId_eventKey_category: { userId: user.id, eventKey: LEGACY_MESSAGE_EVENT_KEY, category: "marketplace" } },
    create: { userId: user.id, role: user.role, eventKey: LEGACY_MESSAGE_EVENT_KEY, category: "marketplace", inApp: true, email: on },
    update: { email: on },
  });
}

export const PUT = withAuth(async (req: NextRequest, { user }) => {
  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your choices.");
  const { categories, quietHours, messages } = parsed.data;

  if (categories) {
    const rows = await db.notificationPreference.findMany({ where: { userId: user.id }, select: { eventKey: true, push: true, email: true, sms: true, whatsapp: true, inApp: true } });
    const current = resolvePreferences(rows, user.role);
    for (const [key, change] of Object.entries(categories) as Array<[NotifyCategory, z.infer<typeof Switches>]>) {
      if (!change) continue;
      const next = { ...current[key], ...change };
      if (!channelAllowedFor(key, "email")) next.email = false;
      if (!channelAllowedFor(key, "sms")) next.sms = false;
      if (!channelAllowedFor(key, "whatsapp")) next.whatsapp = false;
      const eventKey = preferenceEventKey(key);
      await db.notificationPreference.upsert({
        where: { userId_eventKey_category: { userId: user.id, eventKey, category: "system" } },
        create: { userId: user.id, role: user.role, eventKey, category: "system", inApp: true, ...next },
        update: { ...next },
      });
      if (key === "messages" && change.email !== undefined) await saveUnreadEmail(user, change.email);
    }
  }

  if (messages) {
    const allowed = messageSourcesFor(user.role);
    for (const [source, change] of Object.entries(messages.sources ?? {}) as Array<[MessageSource, { push: boolean } | undefined]>) {
      if (!change || !allowed.includes(source)) continue;
      const eventKey = messageSourceEventKey(source);
      await db.notificationPreference.upsert({
        where: { userId_eventKey_category: { userId: user.id, eventKey, category: "system" } },
        create: { userId: user.id, role: user.role, eventKey, category: "system", inApp: true, push: change.push },
        update: { push: change.push },
      });
    }
    if (messages.unreadEmail !== undefined) await saveUnreadEmail(user, messages.unreadEmail);
  }

  if (quietHours) {
    await db.notificationSetting.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        quietHoursEnabled: quietHours.enabled ?? DEFAULT_QUIET_HOURS.enabled,
        quietStart: quietHours.start ?? DEFAULT_QUIET_HOURS.start,
        quietEnd: quietHours.end ?? DEFAULT_QUIET_HOURS.end,
      },
      update: {
        ...(quietHours.enabled !== undefined ? { quietHoursEnabled: quietHours.enabled } : {}),
        ...(quietHours.start ? { quietStart: quietHours.start } : {}),
        ...(quietHours.end ? { quietEnd: quietHours.end } : {}),
      },
    });
  }

  return ok(await load(user));
});
