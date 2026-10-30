// New-message notification settings (Settings › Notifications › Messages, and the Riders app's Me › Notifications).
// Pure, so tests/message-notification-settings.test.mjs can load it directly.
//
// Accounts (delivery partners, sellers, suppliers): the Messages category switch (shared/notifications.ts) is the
// master; a delivery partner can also turn off push per source ("Messages from riders", "Messages from shops &
// suppliers"), saved as NotificationPreference rows "notify.messages.<source>" (push column). The bell always gets
// them. "Email me if I haven't read it in 15 minutes" is the unread-message email of partner chat
// (src/lib/conversations/service.server.ts emailUnreadMessages), saved on the older "message_received" row.
// Quiet hours are the account's own (NotificationSetting): pushes wait for the morning summary.
//
// Riders (no account): LogisticsTeamMember.notifyPrefs JSON { company, shops, quiet: { enabled, start, end } }.
// During a rider's quiet hours the push is skipped; the message still waits in the chat.

import { DEFAULT_QUIET_HOURS, LEGACY_MESSAGE_EVENT_KEY, isQuietTime, parseClock, type QuietHours } from "./notifications.ts";

// ─── Sources ─────────────────────────────────────────────────────────────────

/** Who wrote: a rider, a business (partner chat: shops, suppliers, delivery partners), or a shop customer. */
export type MessageSource = "riders" | "business" | "customers";

/** The per-source switches each role has in its settings (others only have the Messages category switch). */
export const MESSAGE_SOURCES_BY_ROLE: Partial<Record<string, readonly MessageSource[]>> = {
  logistics_partner: ["riders", "business"],
};

export function messageSourcesFor(role: string | null | undefined): readonly MessageSource[] {
  return (role && MESSAGE_SOURCES_BY_ROLE[role]) || [];
}

export function isMessageSource(value: unknown): value is MessageSource {
  return value === "riders" || value === "business" || value === "customers";
}

export const messageSourceEventKey = (source: MessageSource) => `notify.messages.${source}`;

interface SourceRow {
  eventKey: string;
  push: boolean;
  email?: boolean;
}

/** Push for messages from this source: on unless they turned it off (no row, or no source, means on). */
export function sourcePushOn(rows: readonly SourceRow[], source: MessageSource | null | undefined): boolean {
  if (!source) return true;
  const row = rows.find((item) => item.eventKey === messageSourceEventKey(source));
  return row ? row.push : true;
}

/** Each of this role's sources and whether its push is on. */
export function messageSourceSwitches(rows: readonly SourceRow[], role: string | null | undefined): Array<{ key: MessageSource; push: boolean }> {
  return messageSourcesFor(role).map((key) => ({ key, push: sourcePushOn(rows, key) }));
}

/**
 * The unread-message email (partner chat, after UNREAD_EMAIL_DELAY_MINUTES): on unless the older "message_received"
 * row says email off. That row is what the email sweep reads.
 */
export function unreadEmailOn(rows: readonly SourceRow[]): boolean {
  const legacy = rows.find((item) => item.eventKey === LEGACY_MESSAGE_EVENT_KEY);
  return legacy ? legacy.email !== false : true;
}

// ─── Riders ──────────────────────────────────────────────────────────────────

export type RiderMessageSource = "company" | "shops";

export interface RiderNotifyPrefs {
  company: boolean;
  shops: boolean;
  quiet: { enabled: boolean; start: string; end: string };
}

/** Riders work late: quiet hours start off, 22:00 to 07:00 when turned on. */
export const DEFAULT_RIDER_NOTIFY_PREFS: RiderNotifyPrefs = { company: true, shops: true, quiet: { enabled: false, start: "22:00", end: "07:00" } };

/** The rider's saved JSON, with anything missing or broken filled from the defaults. */
export function readRiderNotifyPrefs(value: unknown): RiderNotifyPrefs {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const quiet = raw.quiet && typeof raw.quiet === "object" && !Array.isArray(raw.quiet) ? (raw.quiet as Record<string, unknown>) : {};
  const clock = (input: unknown, fallback: string) => (typeof input === "string" && parseClock(input) !== null ? input : fallback);
  const d = DEFAULT_RIDER_NOTIFY_PREFS;
  return {
    company: typeof raw.company === "boolean" ? raw.company : d.company,
    shops: typeof raw.shops === "boolean" ? raw.shops : d.shops,
    quiet: {
      enabled: typeof quiet.enabled === "boolean" ? quiet.enabled : d.quiet.enabled,
      start: clock(quiet.start, d.quiet.start),
      end: clock(quiet.end, d.quiet.end),
    },
  };
}

/** A change from the Riders app merged onto the current settings; null when the change isn't valid. */
export function mergeRiderNotifyPrefs(current: RiderNotifyPrefs, change: unknown): RiderNotifyPrefs | null {
  if (!change || typeof change !== "object" || Array.isArray(change)) return null;
  const input = change as Record<string, unknown>;
  const next: RiderNotifyPrefs = { ...current, quiet: { ...current.quiet } };
  for (const key of ["company", "shops"] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== "boolean") return null;
    next[key] = input[key] as boolean;
  }
  if (input.quiet !== undefined) {
    if (!input.quiet || typeof input.quiet !== "object" || Array.isArray(input.quiet)) return null;
    const quiet = input.quiet as Record<string, unknown>;
    if (quiet.enabled !== undefined) {
      if (typeof quiet.enabled !== "boolean") return null;
      next.quiet.enabled = quiet.enabled;
    }
    for (const key of ["start", "end"] as const) {
      if (quiet[key] === undefined) continue;
      if (typeof quiet[key] !== "string" || parseClock(quiet[key] as string) === null) return null;
      next.quiet[key] = quiet[key] as string;
    }
  }
  return next;
}

export function riderQuietHours(prefs: RiderNotifyPrefs): QuietHours {
  return { ...prefs.quiet, timezone: DEFAULT_QUIET_HOURS.timezone };
}

// ─── The decision ────────────────────────────────────────────────────────────

export type MessagePushDecision = "send" | "quiet" | "off";

/**
 * Whether a new message buzzes the phone: "off" when the person turned messages (or this source) off, "quiet"
 * during their quiet hours (Lagos time unless they set another zone), else "send". The message itself always
 * arrives in the app (and the bell, for accounts).
 */
export function shouldPushMessage(
  prefs: { on?: boolean; sources?: Partial<Record<string, boolean>>; quietHours?: QuietHours | null },
  source: string | null | undefined,
  now: Date,
): MessagePushDecision {
  if (prefs.on === false) return "off";
  if (source && prefs.sources?.[source] === false) return "off";
  return isQuietTime(now, prefs.quietHours ?? null) ? "quiet" : "send";
}

/** shouldPushMessage for a rider's own settings. */
export function riderMessagePush(prefs: RiderNotifyPrefs, source: RiderMessageSource, now: Date): MessagePushDecision {
  return shouldPushMessage({ sources: { company: prefs.company, shops: prefs.shops }, quietHours: riderQuietHours(prefs) }, source, now);
}

/** "22:00" → "10pm", "07:30" → "7:30am", "00:00" → "12am": quiet hours in a line riders read at a glance. */
export function clockWords(value: string): string {
  const minutes = parseClock(value);
  if (minutes === null) return value;
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${hour < 12 ? "am" : "pm"}`;
}
