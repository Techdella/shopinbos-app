// Channel names and icons, safe for client components (no Node imports).

export type InboxChannelKey = "email" | "whatsapp" | "sms" | "messenger" | "instagram" | "telegram" | "tiktok" | "voice" | "livechat" | "form";
/** Channels with credentials the seller connects (live chat and forms are built in; TikTok has no open API). */
export type ConnectableChannel = "email" | "whatsapp" | "sms" | "messenger" | "instagram" | "telegram" | "voice";

export interface ChannelMeta {
  key: InboxChannelKey;
  label: string;
  icon: "mail" | "whatsapp" | "message" | "facebook" | "instagram" | "send" | "tiktok" | "phone" | "chat" | "document";
  /** Can the seller reply on this channel from the inbox? */
  replies: boolean;
}

export const CHANNELS: Record<InboxChannelKey, ChannelMeta> = {
  email: { key: "email", label: "Email", icon: "mail", replies: true },
  whatsapp: { key: "whatsapp", label: "WhatsApp", icon: "whatsapp", replies: true },
  sms: { key: "sms", label: "SMS", icon: "message", replies: true },
  messenger: { key: "messenger", label: "Messenger", icon: "facebook", replies: true },
  instagram: { key: "instagram", label: "Instagram", icon: "instagram", replies: true },
  telegram: { key: "telegram", label: "Telegram", icon: "send", replies: true },
  tiktok: { key: "tiktok", label: "TikTok", icon: "tiktok", replies: false },
  voice: { key: "voice", label: "Phone calls", icon: "phone", replies: false },
  livechat: { key: "livechat", label: "Live chat", icon: "chat", replies: true },
  form: { key: "form", label: "Contact form", icon: "document", replies: true },
};

export const CHANNEL_KEYS = Object.keys(CHANNELS) as InboxChannelKey[];
export const CONNECTABLE_CHANNELS: ConnectableChannel[] = ["email", "whatsapp", "sms", "messenger", "instagram", "telegram", "voice"];

export function isChannelKey(value: unknown): value is InboxChannelKey {
  return typeof value === "string" && value in CHANNELS;
}

export const CONVERSATION_STATUSES = ["open", "snoozed", "closed"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

