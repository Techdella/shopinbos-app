// Product catalog feeds for Google Merchant Center, Meta (Facebook/Instagram Shop), TikTok and WhatsApp catalogs.
// Pure: the route in src/app/api/public/feeds/[store]/[file] loads products and calls these; tests run them directly.
//
// Every channel accepts an RSS 2.0 file with Google's g: namespace, so the XML is the same shape for all of them
// (with the channel's own availability words and UTM tags); the CSVs use each channel's column names.

import { toCsv } from "../csv.ts";

export const FEED_CHANNELS = ["google", "meta", "tiktok", "whatsapp"] as const;
export type FeedChannel = (typeof FEED_CHANNELS)[number];
export const FEED_FORMATS = ["xml", "csv"] as const;
export type FeedFormat = (typeof FEED_FORMATS)[number];

export const FEED_CHANNEL_LABEL: Record<FeedChannel, string> = {
  google: "Google Merchant Center",
  meta: "Facebook and Instagram Shop",
  tiktok: "TikTok Shop catalog",
  whatsapp: "WhatsApp catalog",
};

/** The utm_source each feed's links carry; checkout turns it into the order's channel (shared/channels.ts). */
// One Meta catalog serves both Facebook and Instagram, so its links say "meta" rather than guessing which app.
export const FEED_UTM_SOURCE: Record<FeedChannel, string> = { google: "google", meta: "meta", tiktok: "tiktok", whatsapp: "whatsapp" };

export interface FeedProductInput {
  id: string;
  name: string;
  description: string | null;
  images: string[];
  retailPrice: number;
  compareAtPrice: number | null;
  currency: string;
  currentStock: number;
  sku: string | null;
  barcode: string | null;
  categoryName: string | null;
  status: string;
}

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImageLinks: string[];
  inStock: boolean;
  /** "15000.00 NGN": the regular price (the compare-at price when the product is on sale). */
  price: string;
  salePrice: string | null;
  brand: string;
  gtin: string | null;
  mpn: string | null;
  productType: string | null;
}

export interface FeedBuild {
  items: FeedItem[];
  skipped: Array<{ id: string; name: string; reason: string }>;
}

/** `/feeds/<slug>/google.xml` → { channel: "google", format: "xml" }; anything else → null. */
export function parseFeedFile(file: string): { channel: FeedChannel; format: FeedFormat } | null {
  const match = /^([a-z]+)\.([a-z]+)$/.exec(file.toLowerCase());
  if (!match) return null;
  const channel = FEED_CHANNELS.find((item) => item === match[1]);
  const format = FEED_FORMATS.find((item) => item === match[2]);
  return channel && format ? { channel, format } : null;
}

export function feedPrice(amount: number, currency: string) {
  return `${(Math.round(amount * 100) / 100).toFixed(2)} ${(currency || "NGN").toUpperCase()}`;
}

/** Plain text from a description that may hold HTML; channels reject markup and control characters. */
export function plainText(value: string | null | undefined, max: number) {
  const text = (value ?? "")
    .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function absoluteImage(url: string, appOrigin: string) {
  const value = url.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${appOrigin.replace(/\/$/, "")}${value}`;
  return null;
}

export function withUtm(url: string, source: string, medium = "product_feed", campaign = "catalog") {
  const next = new URL(url);
  next.searchParams.set("utm_source", source);
  next.searchParams.set("utm_medium", medium);
  next.searchParams.set("utm_campaign", campaign);
  return next.toString();
}

/**
 * The products a channel may list: published, with a price above zero and at least one web image.
 * Everything else is reported in `skipped` with the reason, so the seller can fix it.
 */
export function buildFeedItems(
  products: FeedProductInput[],
  options: { channel: FeedChannel; brand: string; productUrl: (id: string) => string; appOrigin: string },
): FeedBuild {
  const items: FeedItem[] = [];
  const skipped: FeedBuild["skipped"] = [];
  for (const product of products) {
    if (product.status !== "published") {
      skipped.push({ id: product.id, name: product.name, reason: "Not published" });
      continue;
    }
    const images = product.images.map((image) => absoluteImage(image, options.appOrigin)).filter((image): image is string => Boolean(image));
    if (!images.length) {
      skipped.push({ id: product.id, name: product.name, reason: "No photo" });
      continue;
    }
    if (!(product.retailPrice > 0)) {
      skipped.push({ id: product.id, name: product.name, reason: "No price" });
      continue;
    }
    const title = plainText(product.name, 150);
    const onSale = product.compareAtPrice != null && product.compareAtPrice > product.retailPrice;
    const digits = (product.barcode ?? "").replace(/\D/g, "");
    items.push({
      id: product.id,
      title,
      description: plainText(product.description, 5000) || title,
      link: withUtm(options.productUrl(product.id), FEED_UTM_SOURCE[options.channel]),
      imageLink: images[0],
      additionalImageLinks: images.slice(1, 11),
      inStock: product.currentStock > 0,
      price: feedPrice(onSale ? product.compareAtPrice! : product.retailPrice, product.currency),
      salePrice: onSale ? feedPrice(product.retailPrice, product.currency) : null,
      brand: plainText(options.brand, 70),
      gtin: digits.length >= 8 && digits.length <= 14 ? digits : null,
      mpn: product.sku?.trim() ? plainText(product.sku, 70) : null,
      productType: product.categoryName ? plainText(product.categoryName, 750) : null,
    });
  }
  return { items, skipped };
}

export function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function availability(channel: FeedChannel, inStock: boolean) {
  // Google wants in_stock; Meta and TikTok document "in stock" (they also accept Google's form, but be exact).
  if (channel === "google") return inStock ? "in_stock" : "out_of_stock";
  return inStock ? "in stock" : "out of stock";
}

export function feedXml(channel: FeedChannel, store: { name: string; url: string }, build: FeedBuild) {
  const tag = (name: string, value: string | null) => (value ? `      <g:${name}>${xmlEscape(value)}</g:${name}>\n` : "");
  const entries = build.items
    .map((item) =>
      [
        "    <item>\n",
        tag("id", item.id),
        `      <title>${xmlEscape(item.title)}</title>\n`,
        `      <description>${xmlEscape(item.description)}</description>\n`,
        `      <link>${xmlEscape(item.link)}</link>\n`,
        tag("image_link", item.imageLink),
        ...item.additionalImageLinks.map((link) => tag("additional_image_link", link)),
        tag("availability", availability(channel, item.inStock)),
        tag("condition", "new"),
        tag("price", item.price),
        tag("sale_price", item.salePrice),
        tag("brand", item.brand),
        tag("gtin", item.gtin),
        tag("mpn", item.mpn),
        item.gtin || item.mpn ? "" : tag("identifier_exists", "no"),
        tag("product_type", item.productType),
        "    </item>\n",
      ].join(""),
    )
    .join("");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n',
    "  <channel>\n",
    `    <title>${xmlEscape(store.name)}</title>\n`,
    `    <link>${xmlEscape(store.url)}</link>\n`,
    `    <description>${xmlEscape(`${store.name} products for ${FEED_CHANNEL_LABEL[channel]}`)}</description>\n`,
    entries,
    "  </channel>\n",
    "</rss>\n",
  ].join("");
}

export function feedCsv(channel: FeedChannel, build: FeedBuild) {
  // TikTok's catalog template calls the id column sku_id; Google, Meta and WhatsApp use id.
  const header = [
    channel === "tiktok" ? "sku_id" : "id",
    "title",
    "description",
    "availability",
    "condition",
    "price",
    "sale_price",
    "link",
    "image_link",
    "additional_image_link",
    "brand",
    "gtin",
    "mpn",
    ...(channel === "google" ? ["identifier_exists"] : []),
    "product_type",
  ];
  const rows = build.items.map((item) => [
    item.id,
    item.title,
    item.description,
    availability(channel, item.inStock),
    "new",
    item.price,
    item.salePrice ?? "",
    item.link,
    item.imageLink,
    item.additionalImageLinks.join(","),
    item.brand,
    item.gtin ?? "",
    item.mpn ?? "",
    ...(channel === "google" ? [item.gtin || item.mpn ? "" : "no"] : []),
    item.productType ?? "",
  ]);
  return toCsv([header, ...rows]);
}

/** Which channel's crawler fetched a feed, from its User-Agent (null for people and unknown tools). */
export function feedFetcher(userAgent: string | null | undefined): FeedChannel | null {
  const ua = userAgent ?? "";
  if (/google/i.test(ua)) return "google";
  if (/facebookexternalhit|facebookcatalog|meta-externalagent|facebook/i.test(ua)) return "meta";
  if (/tiktok|bytespider|bytedance/i.test(ua)) return "tiktok";
  return null;
}

/** Meta Graph `items_batch` requests (allow_upsert) for a catalog, same fields as the feed. */
export function metaBatchRequests(build: FeedBuild) {
  return build.items.map((item) => ({
    method: "UPDATE",
    data: {
      id: item.id,
      title: item.title,
      description: item.description,
      availability: availability("meta", item.inStock),
      condition: "new",
      price: item.price,
      ...(item.salePrice ? { sale_price: item.salePrice } : {}),
      link: item.link,
      image_link: item.imageLink,
      ...(item.additionalImageLinks.length ? { additional_image_link: item.additionalImageLinks.join(",") } : {}),
      brand: item.brand,
      ...(item.gtin ? { gtin: item.gtin } : {}),
      ...(item.mpn ? { mpn: item.mpn } : {}),
    },
  }));
}
