// Where an order came from. Storefront links carry ?ref= (our share buttons) or ?utm_source=; checkout
// stores the normalised value on RetailOrder.channel and the seller dashboard groups orders by it.

// "payment_link": paid through a payment link (src/lib/payment-links) that wasn't opened from a known app.
export const ORDER_CHANNELS = ["whatsapp", "instagram", "facebook", "tiktok", "google", "email", "online_store", "in_person", "payment_link"] as const;
export type OrderChannel = (typeof ORDER_CHANNELS)[number];

/** Channels a storefront link can claim at checkout ("in person" is only for sales the seller records). */
export const LINK_CHANNELS = ["whatsapp", "instagram", "facebook", "tiktok", "google", "email", "online_store"] as const;
export type LinkChannel = (typeof LINK_CHANNELS)[number];

/** Where a sale the seller records by hand came from. */
export const RECORDED_SALE_CHANNELS = ["whatsapp", "instagram", "facebook", "tiktok", "in_person"] as const;
export type RecordedSaleChannel = (typeof RECORDED_SALE_CHANNELS)[number];

export const CHANNEL_LABEL: Record<OrderChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  google: "Google",
  email: "Email",
  online_store: "Online store",
  in_person: "In person",
  payment_link: "Payment link",
};

const ALIASES: Record<string, LinkChannel> = {
  wa: "whatsapp",
  whatsapp: "whatsapp",
  ig: "instagram",
  insta: "instagram",
  instagram: "instagram",
  fb: "facebook",
  facebook: "facebook",
  tt: "tiktok",
  tiktok: "tiktok",
  google: "google", // Merchant Center product feed links (utm_source=google)
  email: "email",
  newsletter: "email",
};

/** Maps a ?ref / ?utm_source value to a known channel; anything else is not a channel we report. */
export function channelFromRef(value: string | null | undefined): LinkChannel | null {
  const key = value?.trim().toLowerCase().replace(/[^a-z]/g, "");
  return key ? ALIASES[key] ?? null : null;
}

/** Appends the share ref to a storefront link, e.g. for the WhatsApp Status button. */
export function withChannelRef(url: string, channel: Exclude<OrderChannel, "online_store" | "in_person">) {
  const ref = channel === "whatsapp" ? "wa" : channel === "instagram" ? "ig" : channel === "facebook" ? "fb" : channel === "tiktok" ? "tt" : channel === "google" ? "google" : "email";
  return `${url}${url.includes("?") ? "&" : "?"}ref=${ref}`;
}
