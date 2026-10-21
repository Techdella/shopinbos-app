// Create with Rex ("Make a post") and the posts calendar in the phone app, for sellers, suppliers and delivery
// partners: the formats and their sizes, the role-aware ideas, the 3 design layouts per job, the post rules and
// which scheduled posts are due a "Time to post" reminder. Pure (no server imports), unit-tested in
// tests/create-posts.test.mjs. The routes are src/app/api/mobile/create/** and src/app/api/mobile/posts/**; the
// renderer is src/lib/create/render.server.tsx.
//
// Nothing here posts for anyone: "Share now" opens the phone's share sheet and "Schedule" saves a reminder.

export type CreateRole = "seller" | "supplier" | "logistics_partner";

export const CREATE_FORMAT_KEYS = ["status", "reel", "post", "flyer"] as const;
export type CreateFormat = (typeof CREATE_FORMAT_KEYS)[number];

/** Pixel sizes: WhatsApp Status and reel covers are 9:16, a feed post is square, a flyer is 4:5. */
export const CREATE_FORMATS: Record<CreateFormat, { width: number; height: number; label: string }> = {
  status: { width: 1080, height: 1920, label: "Status" },
  reel: { width: 1080, height: 1920, label: "Reel cover" },
  post: { width: 1080, height: 1080, label: "Post" },
  flyer: { width: 1080, height: 1350, label: "Flyer" },
};

export function isCreateFormat(value: unknown): value is CreateFormat {
  return typeof value === "string" && (CREATE_FORMAT_KEYS as readonly string[]).includes(value);
}

export function createRoleOf(role: string | null | undefined): CreateRole {
  return role === "supplier" || role === "logistics_partner" ? role : "seller";
}

/** Designs in one job, and its kind for the AI usage meter (one "image" a job, so the image credit cost). */
export const DESIGNS_PER_JOB = 3;
export const CREATE_USAGE_KIND = "image" as const;

// ─── Ideas ────────────────────────────────────────────────────────────────────

export interface CreateIdea {
  id: string;
  title: string;
  line: string;
  format: CreateFormat;
  /** Big words on the design. */
  headline: string;
  /** Smaller line under the headline (a price, a place). */
  subline: string;
  /** Starting caption when the AI can't write one. */
  caption: string;
  /** A photo to build the design from (product photo, logo, banner). */
  imageUrl: string | null;
  productId: string | null;
}

/** What the server knows that makes the ideas specific. Every field is optional: no data still gives ideas. */
export interface IdeaFacts {
  /** Shop, business or company name. */
  name?: string | null;
  /** Where people order: the shop link, or "Shopinbos". */
  link?: string | null;
  logoUrl?: string | null;
  /** Seller: newest product. Supplier: newest product (price to shops). */
  newest?: { id: string; name: string; price: string; image: string | null } | null;
  /** Seller: best seller, or one with a was-price. */
  deal?: { id: string; name: string; price: string; image: string | null; wasPrice?: string | null } | null;
  /** Seller: the state of a recent delivered order ("Kano"). */
  deliveredTo?: string | null;
  /** Supplier: a bulk price from the product's wholesale tiers. */
  bulk?: { id: string; name: string; unitPrice: string; minQty: number; image: string | null } | null;
  /** Partner: the newest destination on their rate card, and their newest pickup point. */
  newRoute?: { to: string; price?: string | null } | null;
  pickupPoint?: { name: string; address: string; hours?: string | null } | null;
  bannerUrl?: string | null;
}

const said = (value: string | null | undefined, fallback: string) => (value && value.trim() ? value.trim() : fallback);

/**
 * The ideas for "Make a post", specific ones first (from the person's own products, routes and orders), then the
 * prototype's evergreen ones so there are always some. Ids are stable for the same facts, so POST /api/mobile/create
 * can look the idea up again.
 */
export function selectIdeas(role: CreateRole, facts: IdeaFacts = {}): CreateIdea[] {
  const name = said(facts.name, role === "seller" ? "our shop" : role === "supplier" ? "us" : "our team");
  const link = said(facts.link, "Shopinbos");
  const ideas: CreateIdea[] = [];
  const add = (idea: Omit<CreateIdea, "imageUrl" | "productId"> & { imageUrl?: string | null; productId?: string | null }) => {
    if (!ideas.some((existing) => existing.id === idea.id)) ideas.push({ imageUrl: null, productId: null, ...idea });
  };

  if (role === "seller") {
    if (facts.newest) {
      add({
        id: `new-stock:${facts.newest.id}`, title: "New stock just landed", line: `Status · ${facts.newest.name}`, format: "status",
        headline: "New stock!", subline: `${facts.newest.name} · ${facts.newest.price}`,
        caption: `New stock just landed. ${facts.newest.name}, ${facts.newest.price}. Delivery all over Nigeria. Order: ${link}`,
        imageUrl: facts.newest.image, productId: facts.newest.id,
      });
    }
    if (facts.deal) {
      add({
        id: `deal:${facts.deal.id}`, title: facts.deal.wasPrice ? "Weekend price drop" : "Best seller this week", line: `Reel · ${facts.deal.name}`, format: "reel",
        headline: facts.deal.wasPrice ? "Weekend deal" : "Best seller", subline: facts.deal.wasPrice ? `Now ${facts.deal.price}` : `${facts.deal.name} · ${facts.deal.price}`,
        caption: facts.deal.wasPrice
          ? `This weekend only: ${facts.deal.name} now ${facts.deal.price} (was ${facts.deal.wasPrice}). Tap the link to order: ${link}`
          : `Our best seller: ${facts.deal.name}, ${facts.deal.price}. Order before it sells out: ${link}`,
        imageUrl: facts.deal.image, productId: facts.deal.id,
      });
    }
    add({
      id: "packing", title: "Packing today’s orders", line: "Status · behind the scenes", format: "status",
      headline: "Packing your orders", subline: "Order on our shop link", caption: `Packing today’s orders. Yours could be next. ${link}`,
      imageUrl: facts.newest?.image ?? null,
    });
    const place = facts.deliveredTo?.trim();
    add({
      id: place ? `delivered:${place}` : "delivered", title: place ? `Delivered to ${place}` : "Delivered today", line: "Status · show it’s real", format: "status",
      headline: place ? `Delivered to ${place}` : "Delivered today", subline: "We deliver nationwide",
      caption: place ? `Another order delivered to ${place}. We deliver all over Nigeria.` : "Another happy customer. We deliver all over Nigeria.",
      imageUrl: facts.deal?.image ?? facts.newest?.image ?? null,
    });
    add({
      id: "flyer", title: "A flyer for the shop", line: "Flyer · print or share", format: "flyer",
      headline: `Shop ${name}`, subline: "Order online, pay safely", caption: `Shop ${name} online. Pay safely and get it delivered. ${link}`,
      imageUrl: facts.newest?.image ?? facts.logoUrl ?? null,
    });
  } else if (role === "supplier") {
    if (facts.newest) {
      add({
        id: `new-for-shops:${facts.newest.id}`, title: `New for shops: ${facts.newest.name}`, line: `Status · ${facts.newest.name}`, format: "status",
        headline: "New for your shop", subline: `${facts.newest.price} to shops`,
        caption: `New stock for shops: ${facts.newest.name}. ${facts.newest.price} to shops. Sell it without stock: find ${name} on Shopinbos.`,
        imageUrl: facts.newest.image, productId: facts.newest.id,
      });
    }
    if (facts.bulk) {
      add({
        id: `bulk:${facts.bulk.id}`, title: "Bulk price this week", line: `Post · ${facts.bulk.name}`, format: "post",
        headline: "Bulk price", subline: `${facts.bulk.unitPrice} each for ${facts.bulk.minQty}+`,
        caption: `Bulk price this week: ${facts.bulk.name} ${facts.bulk.unitPrice} each when you buy ${facts.bulk.minQty} or more. Send me a price request on Shopinbos.`,
        imageUrl: facts.bulk.image, productId: facts.bulk.id,
      });
    }
    add({
      id: "packing-day", title: "Packing day", line: "Reel · orders going out", format: "reel",
      headline: "Orders going out", subline: "Shops: order on Shopinbos", caption: "Packing day. Shops all over Nigeria, your orders are on the way.",
      imageUrl: facts.newest?.image ?? facts.bannerUrl ?? null,
    });
    add({
      id: "dropship", title: "Sell it without stock", line: "Flyer · for shop owners", format: "flyer",
      headline: "Sell without stock", subline: `Find ${name} on Shopinbos`,
      caption: `Shop owners: add our products to your shop and we ship to your customers. Find ${name} on Shopinbos.`,
      imageUrl: facts.newest?.image ?? facts.logoUrl ?? null,
    });
  } else {
    if (facts.newRoute) {
      add({
        id: `route:${facts.newRoute.to}`, title: `Now delivering to ${facts.newRoute.to}`, line: "Status · new route", format: "status",
        headline: `Now delivering to ${facts.newRoute.to}`, subline: facts.newRoute.price ? `From ${facts.newRoute.price}` : `Pick ${name} at checkout`,
        caption: `${name} now delivers to ${facts.newRoute.to}: doorstep or pickup point. Sellers, connect with us on Shopinbos.`,
        imageUrl: facts.bannerUrl ?? facts.logoUrl ?? null,
      });
    }
    if (facts.pickupPoint) {
      add({
        id: `pickup:${facts.pickupPoint.name}`, title: `New pickup point: ${facts.pickupPoint.name}`, line: `Post · ${facts.pickupPoint.address}`, format: "post",
        headline: "New pickup point", subline: facts.pickupPoint.hours ? `${facts.pickupPoint.name} · ${facts.pickupPoint.hours}` : facts.pickupPoint.name,
        caption: `New ${name} pickup point: ${facts.pickupPoint.address}${facts.pickupPoint.hours ? `, ${facts.pickupPoint.hours}` : ""}.`,
        imageUrl: facts.bannerUrl ?? facts.logoUrl ?? null,
      });
    }
    add({
      id: "connect", title: "Selling online? Connect with us", line: "Reel · for sellers", format: "reel",
      headline: "Selling online?", subline: `Find ${name} on Shopinbos`,
      caption: `Selling online? Find ${name} on Shopinbos and offer doorstep delivery at checkout.`,
      imageUrl: facts.bannerUrl ?? facts.logoUrl ?? null,
    });
    add({
      id: "on-time", title: "Delivered on time", line: "Status · show you’re reliable", format: "status",
      headline: "Delivered on time", subline: "Same day in town, nationwide in days",
      caption: `Another parcel delivered on time by ${name}. Sellers, connect with us on Shopinbos.`,
      imageUrl: facts.bannerUrl ?? facts.logoUrl ?? null,
    });
  }
  return ideas;
}

/** What GET /api/mobile/create/ideas sends: only the contract's fields. */
export function publicIdea(idea: CreateIdea) {
  return { id: idea.id, title: idea.title, line: idea.line, format: idea.format };
}

/** The tip under the ideas (from the prototype), per role. */
export const CREATE_TIPS: Record<CreateRole, string> = {
  seller: "Post on your WhatsApp Status 2 or 3 times a day: new stock in the morning, a price or deal at lunch, a delivery photo in the evening.",
  supplier: "Shop owners watch your Status. Post new stock with your price to shops, and say “sell it without stock on Shopinbos”. Packing-day videos show you’re busy and reliable.",
  logistics_partner: "Sellers and suppliers check your Status. Post new routes, new pickup points and your price for popular routes. Ask happy sellers to share your post.",
};

/** A free-text request ("prompt") becomes an idea of its own: the first line is the headline. */
export function ideaFromPrompt(prompt: string, format: CreateFormat, fallback: CreateIdea | null): CreateIdea {
  const clean = prompt.replace(/\s+/g, " ").trim().slice(0, 200);
  const headline = clean.length > 42 ? `${clean.slice(0, 40).replace(/\s+\S*$/, "")}…` : clean;
  return {
    id: "prompt",
    title: clean,
    line: CREATE_FORMATS[format].label,
    format,
    headline: headline || fallback?.headline || "New post",
    subline: fallback?.subline ?? "",
    caption: clean || fallback?.caption || "",
    imageUrl: fallback?.imageUrl ?? null,
    productId: fallback?.productId ?? null,
  };
}

// ─── Designs ──────────────────────────────────────────────────────────────────

export const DESIGN_STYLES = ["photo", "block", "card"] as const;
export type DesignStyle = (typeof DESIGN_STYLES)[number];

export interface DesignSpec {
  /** 1, 2, 3 (the design's id is "<jobId>-<n>"). */
  n: number;
  style: DesignStyle;
  width: number;
  height: number;
  /** Reel covers carry a play mark; flyers a footer with the link. */
  playMark: boolean;
  footer: boolean;
}

/**
 * The 3 designs of a job: full-bleed photo, a colour block over the photo, and the photo on a card. Without a photo
 * the photo style is left out and a second colour block (inverted colours) takes its place.
 */
export function designSpecs(format: CreateFormat, hasPhoto: boolean): DesignSpec[] {
  const { width, height } = CREATE_FORMATS[format];
  const styles: DesignStyle[] = hasPhoto ? ["photo", "block", "card"] : ["block", "card", "block"];
  return styles.map((style, index) => ({ n: index + 1, style, width, height, playMark: format === "reel", footer: format === "flyer" }));
}

export const designId = (jobId: string, n: number) => `${jobId}-${n}`;

/** "<jobId>-<n>" → its parts, or null. */
export function parseDesignId(value: unknown): { jobId: string; n: number } | null {
  const match = typeof value === "string" ? /^([a-z0-9]{8,40})-([1-9])$/i.exec(value.trim()) : null;
  return match ? { jobId: match[1], n: Number(match[2]) } : null;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Brand colours for the designs, from the shop's theme when it has one, else Shopinbos navy and mint. */
export function designPalette(colours: { accent?: string | null; ink?: string | null; paper?: string | null; hero?: string | null; button?: string | null } | null | undefined) {
  const pick = (value: string | null | undefined, fallback: string) => (value && HEX.test(value) ? value : fallback);
  return {
    hero: pick(colours?.hero, "#0E2A38"),
    accent: pick(colours?.accent ?? colours?.button, "#73D8C8"),
    paper: pick(colours?.paper, "#F4F1EA"),
    ink: pick(colours?.ink, "#0E2A38"),
  };
}

/** Black or white text, whichever reads better on `hex`. */
export function textOn(hex: string) {
  const value = HEX.test(hex) ? hex : "#000000";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0E2A38" : "#FFFFFF";
}

/** Three captions for the 3 designs, from the AI's lines when there are 3 good ones, else from the idea's own. */
export function captionsFor(aiText: string | null | undefined, fallback: string): string[] {
  const lines = String(aiText ?? "")
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").replace(/^["“]|["”]$/g, "").trim())
    .filter((line) => line.length >= 8)
    .slice(0, DESIGNS_PER_JOB)
    .map((line) => line.slice(0, 600));
  const base = fallback.trim().slice(0, 600) || "New post";
  while (lines.length < DESIGNS_PER_JOB) lines.push(base);
  return lines;
}

// ─── Posts calendar ───────────────────────────────────────────────────────────

export const POST_PLATFORMS = [
  { key: "whatsapp", label: "WhatsApp Status" },
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
] as const;
export type PostPlatform = (typeof POST_PLATFORMS)[number]["key"];
export const POST_PLATFORM_KEYS = POST_PLATFORMS.map((platform) => platform.key) as [PostPlatform, ...PostPlatform[]];
export const POST_STATUSES = ["draft", "scheduled", "posted"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Known platforms only, once each, in the calendar's order. */
export function cleanPlatforms(value: unknown): PostPlatform[] {
  const wanted = new Set(Array.isArray(value) ? value.map((item) => String(item).toLowerCase().trim()) : []);
  return POST_PLATFORM_KEYS.filter((key) => wanted.has(key));
}

/**
 * The accounts row of the calendar. `linked` is true only where Shopinbos has a real connection (a seller's
 * connected Meta, TikTok or WhatsApp sales channel); it only changes the label, since nothing is posted for anyone.
 */
export function postAccounts(connections: ReadonlyArray<{ channel: string; status?: string | null; tokenEnc?: string | null | boolean }> = []) {
  const live = new Set(
    connections
      .filter((row) => row.status === "connected" || (row.status == null && Boolean(row.tokenEnc)))
      .map((row) => row.channel),
  );
  const linked: Record<PostPlatform, boolean> = {
    whatsapp: live.has("whatsapp"),
    instagram: live.has("meta"),
    facebook: live.has("meta"),
    tiktok: live.has("tiktok"),
  };
  return POST_PLATFORMS.map((platform) => ({ key: platform.key, label: platform.label, linked: linked[platform.key] }));
}

/** Status after a change: a time makes it scheduled, no time a draft; "posted" stays posted. */
export function postStatusFor(input: { current?: PostStatus | null; scheduledAt: Date | null; markPosted?: boolean }): PostStatus {
  if (input.markPosted || input.current === "posted") return "posted";
  return input.scheduledAt ? "scheduled" : "draft";
}

/** Reminders older than this are skipped (a phone off for days doesn't get a pile of stale "Time to post"). */
export const REMINDER_MAX_LATE_MS = 24 * 60 * 60 * 1000;

export interface ReminderCandidate {
  id: string;
  status: string;
  scheduledAt: Date | string | null;
  remindedAt: Date | string | null;
}

/** Posts due their one reminder now: scheduled, time reached (not more than a day ago) and not reminded yet. */
export function dueReminders<T extends ReminderCandidate>(posts: readonly T[], now: Date = new Date()): T[] {
  const at = now.getTime();
  return posts.filter((post) => {
    if (post.status !== "scheduled" || post.remindedAt || !post.scheduledAt) return false;
    const when = new Date(post.scheduledAt).getTime();
    return Number.isFinite(when) && when <= at && at - when <= REMINDER_MAX_LATE_MS;
  });
}

/** "Time to post: New stock just landed. Lace front…" (the start of the caption, on one line). */
export function reminderText(caption: string | null | undefined, max = 60) {
  const flat = String(caption ?? "").replace(/\s+/g, " ").trim();
  const start = flat.length > max ? `${flat.slice(0, max).replace(/\s+\S*$/, "")}…` : flat;
  return `Time to post: ${start || "your post"}`;
}

export const postLink = (id: string) => `app:/posts/${id}`;
