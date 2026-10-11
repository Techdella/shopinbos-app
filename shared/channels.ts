// Where an order came from. Storefront links carry ?ref= (our share buttons) or ?utm_source=; checkout
// stores the normalised value on RetailOrder.channel and the seller dashboard groups orders by it.

export const ORDER_CHANNELS = ["whatsapp", "instagram", "facebook", "tiktok", "email", "online_store"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  email: "Email",
  online_store: "Online store",
};

const ALIASES: Record<string, OrderChannel> = {
  wa: "whatsapp",
  whatsapp: "whatsapp",
  ig: "instagram",
  insta: "instagram",
  instagram: "instagram",
  fb: "facebook",
  facebook: "facebook",
  tt: "tiktok",
  tiktok: "tiktok",
  email: "email",
  newsletter: "email",
};

/** Maps a ?ref / ?utm_source value to a known channel; anything else is not a channel we report. */
export function channelFromRef(value: string | null | undefined): OrderChannel | null {
  const key = value?.trim().toLowerCase().replace(/[^a-z]/g, "");
  return key ? ALIASES[key] ?? null : null;
}

/** Appends the share ref to a storefront link, e.g. for the WhatsApp Status button. */
export function withChannelRef(url: string, channel: Exclude<OrderChannel, "online_store">) {
  const ref = channel === "whatsapp" ? "wa" : channel === "instagram" ? "ig" : channel === "facebook" ? "fb" : channel === "tiktok" ? "tt" : "email";
  return `${url}${url.includes("?") ? "&" : "?"}ref=${ref}`;
}
