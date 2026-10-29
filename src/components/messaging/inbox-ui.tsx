"use client";

import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { CHANNELS, type InboxChannelKey } from "@/lib/inbox/meta";
import { useT } from "@/components/i18n/I18nProvider";
import { APP_TIME_ZONE, formatRelative, intlLocale, type Locale } from "@shared/i18n";

// Small pieces shared by the inbox screens.

export type ListChannelKey = InboxChannelKey | "partner";

const CHANNEL_TINT: Record<ListChannelKey, string> = {
  email: "bg-[#E8EAFB] text-[#3D4FB8]",
  whatsapp: "bg-[#DCF8E6] text-[#128C4B]",
  sms: "bg-app-canvas text-app-ink",
  messenger: "bg-[#E3EEFF] text-[#0866FF]",
  instagram: "bg-[#FCE7F1] text-[#C13584]",
  telegram: "bg-[#E2F3FB] text-[#229ED9]",
  tiktok: "bg-app-ink text-white",
  voice: "bg-[#FDF0D5] text-[#8A5A00]",
  livechat: "bg-app-peach text-app-accent-ink",
  form: "bg-app-mint text-app-forest",
  partner: "bg-app-canvas text-app-ink-soft",
};

export function channelLabel(channel: ListChannelKey) {
  return channel === "partner" ? "Suppliers and partners" : CHANNELS[channel].label;
}

/** channelLabel() in the person's language (brand names stay as they are). */
export function useChannelLabel() {
  const t = useT("inbox");
  return (channel: ListChannelKey) => t.dynamic(`channel.${channel}`, channelLabel(channel));
}

export function channelIcon(channel: ListChannelKey) {
  return channel === "partner" ? "users" : CHANNELS[channel].icon;
}

/** Round channel mark: the icon in the channel's colour. */
export function ChannelMark({ channel, size = 22, className }: { channel: ListChannelKey; size?: number; className?: string }) {
  const label = useChannelLabel()(channel);
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-full", CHANNEL_TINT[channel], className)} style={{ width: size, height: size }} title={label}>
      <Icon name={channelIcon(channel)} size={Math.round(size * 0.58)} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Short time for lists ("now", "5m", "14:05", "Tue", "3 Nov"), in Lagos time so the server's render (UTC) and the
 * browser's agree; the relative ones can still tick over between the two, so their elements suppressHydrationWarning.
 */
export function formatWhen(iso: string, locale: Locale = "en") {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (locale !== "en") {
    const tag = intlLocale(locale);
    if (diff < 3_600_000) return formatRelative(d, locale);
    if (diff < 86_400_000) return d.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
    if (diff < 604_800_000) return d.toLocaleDateString(tag, { weekday: "short", timeZone: APP_TIME_ZONE });
    return d.toLocaleDateString(tag, { day: "numeric", month: "short", timeZone: APP_TIME_ZONE });
  }
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
  if (diff < 604_800_000) return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: APP_TIME_ZONE });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: APP_TIME_ZONE });
}

export function formatStamp(iso: string, locale: Locale = "en") {
  return new Date(iso).toLocaleString(locale === "en" ? "en-GB" : intlLocale(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE });
}

/** fetch → the `data` of our API envelope, or an Error with the API's message. */
export async function inboxApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
  return json?.data as T;
}
