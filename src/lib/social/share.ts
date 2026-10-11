// Sharing a product to social apps: tagged links, caption limits and the apps' own share pages. Pure, unit tested.

import { withUtm } from "./feeds.ts";

export const SHARE_CHANNELS = [
  { key: "whatsapp", label: "WhatsApp", source: "whatsapp", limit: 700, intent: true },
  { key: "instagram", label: "Instagram", source: "instagram", limit: 2200, intent: false },
  { key: "facebook", label: "Facebook", source: "facebook", limit: 2000, intent: true },
  { key: "x", label: "X", source: "x", limit: 280, intent: true },
  { key: "tiktok", label: "TikTok", source: "tiktok", limit: 2200, intent: false },
] as const;

export type ShareChannel = (typeof SHARE_CHANNELS)[number]["key"];
export const SHARE_CHANNEL_KEYS = SHARE_CHANNELS.map((channel) => channel.key) as [ShareChannel, ...ShareChannel[]];

/** X counts every link as 23 characters. */
const X_LINK_LENGTH = 23;

/** The product page tagged for one app, so visits and orders from the post show under that channel. */
export function taggedProductLink(productUrl: string, channel: ShareChannel, campaign = "social_post") {
  const source = SHARE_CHANNELS.find((item) => item.key === channel)!.source;
  return withUtm(productUrl, source, "social", campaign);
}

/** Characters left for the caption once the link is added (X counts links as 23). */
export function captionRoom(channel: ShareChannel, link: string) {
  const spec = SHARE_CHANNELS.find((item) => item.key === channel)!;
  const linkLength = channel === "x" ? X_LINK_LENGTH : link.length;
  return spec.limit - linkLength - 1;
}

/** Trims a caption to fit, at a word boundary when it can. */
export function fitCaption(caption: string, room: number) {
  const text = caption.trim();
  if (text.length <= room) return text;
  const cut = text.slice(0, Math.max(0, room - 1));
  const space = cut.lastIndexOf(" ");
  return `${(space > room * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The post text with the link at the end (Instagram and TikTok don't make caption links tappable, so it says so). */
export function postText(channel: ShareChannel, caption: string, link: string) {
  const body = fitCaption(caption, captionRoom(channel, link));
  if (channel === "instagram" || channel === "tiktok") return `${body}\n\nShop: link in bio`;
  return `${body}\n${link}`;
}

/** The app's own share page, for apps that have one on the web. Instagram and TikTok don't. */
export function shareIntentUrl(channel: ShareChannel, caption: string, link: string): string | null {
  const body = fitCaption(caption, captionRoom(channel, link));
  switch (channel) {
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${body}\n${link}`)}`;
    case "x":
      return `https://twitter.com/intent/tweet?text=${encodeURIComponent(body)}&url=${encodeURIComponent(link)}`;
    case "facebook":
      // Facebook ignores pre-filled text; the caption is copied for the seller to paste.
      return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`;
    default:
      return null;
  }
}

/** A plain caption when no AI provider is set up: facts only, nothing invented. */
export function fallbackCaption(product: { name: string; price: string; storeName: string }, channel: ShareChannel) {
  const base = `${product.name}, ${product.price}. Available now at ${product.storeName}.`;
  if (channel === "whatsapp") return `${base} Tap the link to order.`;
  if (channel === "x") return `${product.name} — ${product.price} at ${product.storeName}.`;
  if (channel === "instagram" || channel === "tiktok") return `${base} Send us a DM to order.`;
  return `${base} Order through the link.`;
}
