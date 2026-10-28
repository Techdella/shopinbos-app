import { NextRequest } from "next/server";
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
  NOTIFY_CATEGORY_KEYS,
  categoriesFor,
  categoryLabel,
  channelAllowedFor,
  parseClock,
  preferenceEventKey,
  resolvePreferences,
  type NotifyCategory,
} from "@shared/notifications";

// Settings › Notifications: for each category (orders, payments, messages…) which channels are on (push, email,
// SMS, WhatsApp), and quiet hours. The bell always gets everything. Saved as NotificationPreference rows
// ("notify.<category>") and one NotificationSetting row.

async function load(user: { id: string; role: string }) {
  const [rows, setting, account, devices] = await Promise.all([
    db.notificationPreference.findMany({ where: { userId: user.id }, select: { eventKey: true, push: true, email: true, sms: true, whatsapp: true, inApp: true } }),
    db.notificationSetting.findUnique({ where: { userId: user.id } }).catch(() => null),
    db.user.findUnique({ where: { id: user.id }, select: { email: true, phone: true } }),
    db.pushDevice.count({ where: { userId: user.id, disabledAt: null } }).catch(() => 0),
  ]);
  const prefs = resolvePreferences(rows, user.role);
  return {
    categories: categoriesFor(user.role).map((category) => ({
      key: category.key,
      label: categoryLabel(category.key, user.role),
      help: category.help,
      channels: prefs[category.key],
      textAllowed: channelAllowedFor(category.key, "sms"),
      emailAllowed: channelAllowedFor(category.key, "email"),
    })),
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
});

export const PUT = withAuth(async (req: NextRequest, { user }) => {
  const parsed = SaveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check your choices.");
  const { categories, quietHours } = parsed.data;

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
    }
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
