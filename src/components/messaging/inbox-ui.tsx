"use client";

import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { CHANNELS, type InboxChannelKey } from "@/lib/inbox/meta";

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

export function channelIcon(channel: ListChannelKey) {
  return channel === "partner" ? "users" : CHANNELS[channel].icon;
}

/** Round channel mark: the icon in the channel's colour. */
export function ChannelMark({ channel, size = 22, className }: { channel: ListChannelKey; size?: number; className?: string }) {
  return (
    <span className={cx("grid shrink-0 place-items-center rounded-full", CHANNEL_TINT[channel], className)} style={{ width: size, height: size }} title={channelLabel(channel)}>
      <Icon name={channelIcon(channel)} size={Math.round(size * 0.58)} />
      <span className="sr-only">{channelLabel(channel)}</span>
    </span>
  );
}

export function formatWhen(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (diff < 604_800_000) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function formatStamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** fetch → the `data` of our API envelope, or an Error with the API's message. */
export async function inboxApi<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? "Something went wrong. Try again.");
  return json?.data as T;
}
