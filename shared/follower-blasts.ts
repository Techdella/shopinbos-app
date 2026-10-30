// "Notify my followers": a shop tells the people who follow it about a new drop, a pre-order or a live, by WhatsApp
// template, email and (once Shopinbos Plug launches) push. Pure rules, shared by the server
// (src/lib/followers/blasts.server.ts), the web page (/home/marketing/followers), the phone screen
// (apps/mobile/src/app/marketing/followers.tsx) and tests/follower-blasts.test.mjs.
//
//   * At most BLAST_CAP (3) blasts in any rolling BLAST_WINDOW_DAYS (7) days per shop. Queued, sending and sent blasts
//     count; a blast that failed outright doesn't.
//   * Who may get what (marketing rules, stricter than order messages):
//       WhatsApp: the follower opted in (ShopFollower.whatsappOptIn, from their order page) or already gave the shop
//                 WhatsApp marketing consent (a sign-up form, the seller, an import), and hasn't sent STOP since.
//                 A phone given at checkout is for order messages only, never for this.
//       Email:    they have an email and haven't unsubscribed or turned "Promotions" off; the shop has a postal
//                 address (CAN-SPAM, Gmail/Yahoo bulk sender rules).
//       Push:     needs the follower's Plug app; nobody has it before Plug launches.

export const FOLLOWER_BLAST_KINDS = ["drop", "preorder", "live"] as const;
export type FollowerBlastKind = (typeof FOLLOWER_BLAST_KINDS)[number];

export const FOLLOWER_SOURCES = ["order", "link", "qr", "plug"] as const;
export type FollowerSource = (typeof FOLLOWER_SOURCES)[number];

export const BLAST_CHANNELS = ["whatsapp", "email", "push"] as const;
export type BlastChannel = (typeof BLAST_CHANNELS)[number];

export const BLAST_STATUSES = ["queued", "sending", "sent", "failed"] as const;
export type BlastStatus = (typeof BLAST_STATUSES)[number];

/** Blasts per shop in any rolling window. */
export const BLAST_CAP = 3;
export const BLAST_WINDOW_DAYS = 7;
const WINDOW_MS = BLAST_WINDOW_DAYS * 86_400_000;

/** Statuses that use up one of the week's blasts. */
export const COUNTED_STATUSES: readonly BlastStatus[] = ["queued", "sending", "sent"];

/** Copy limits: the title is the email subject and heading; title + body fill one WhatsApp template variable. */
export const TITLE_MAX = 60;
export const BODY_MAX = 300;
export const LINK_MAX = 500;

/** The CustomerMessage event every follower message is logged under. */
export const BLAST_EVENT = "follower_blast";

/** The WhatsApp ready-made template (src/lib/marketing/text-channels.ts FOLLOWER_TEMPLATE_PRESETS). */
export const FOLLOWER_TEMPLATE_PRESET = "follower_news";

/** CustomerMessage.refId for one follower of one blast: unique per blast and follower, so one message per channel. */
export function blastRefId(blastId: string, shopperId: string) {
  return `${blastId}:${shopperId}`;
}

export function isBlastKind(value: unknown): value is FollowerBlastKind {
  return typeof value === "string" && (FOLLOWER_BLAST_KINDS as readonly string[]).includes(value);
}

// ─── The weekly cap ───────────────────────────────────────────────────────────

export interface BlastAllowance {
  cap: number;
  used: number;
  left: number;
  /** When the oldest counted blast leaves the window (another one is free), or null when one is free now. */
  nextFreeAt: Date | null;
}

/** How many of this week's blasts are used and left, from the shop's recent blasts (any order, any age). */
export function blastAllowance(blasts: ReadonlyArray<{ status: string; createdAt: Date | string }>, now: Date = new Date()): BlastAllowance {
  const since = now.getTime() - WINDOW_MS;
  const counted = blasts
    .filter((b) => (COUNTED_STATUSES as readonly string[]).includes(b.status))
    .map((b) => new Date(b.createdAt).getTime())
    .filter((at) => Number.isFinite(at) && at > since && at <= now.getTime() + 60_000)
    .sort((a, b) => a - b);
  const used = counted.length;
  const left = Math.max(0, BLAST_CAP - used);
  // The (used - cap + 1)th oldest must leave the window before one is free again.
  const nextFreeAt = left > 0 ? null : new Date(counted[used - BLAST_CAP] + WINDOW_MS);
  return { cap: BLAST_CAP, used, left, nextFreeAt };
}

/** The start of the window to count blasts from (for the database query). */
export function blastWindowStart(now: Date = new Date()) {
  return new Date(now.getTime() - WINDOW_MS);
}

// ─── The message ──────────────────────────────────────────────────────────────

/** Details the seller can put in the message: {{first_name}}, {{store_name}}, {{product_name}}. */
export const BLAST_VARIABLES = {
  first_name: { sample: "Ada", fallback: "there" },
  store_name: { sample: "Adire House", fallback: "" },
  product_name: { sample: "Adire kaftan", fallback: "" },
} as const;
export type BlastVariable = keyof typeof BLAST_VARIABLES;
export type BlastValues = Partial<Record<BlastVariable, string>>;

/** Fills {{first_name}}, {{store_name}}, {{product_name}}; unknown {{…}} are removed so nobody reads braces. */
export function fillBlastText(text: string, values: BlastValues) {
  return String(text ?? "")
    .replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => {
      if (!(key in BLAST_VARIABLES)) return "";
      const known = key as BlastVariable;
      return values[known]?.trim() || BLAST_VARIABLES[known].fallback;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const clean = (value: unknown, max: number) =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);

export interface BlastInput {
  kind: FollowerBlastKind;
  title: string;
  body: string;
  productId: string | null;
  link: string | null;
}

export type BlastProblem = "kind" | "title_missing" | "title_long" | "body_missing" | "body_long" | "link_bad";

/** Tidies what the seller typed and lists what's wrong (empty when it can go). */
export function checkBlast(raw: { kind?: unknown; title?: unknown; body?: unknown; productId?: unknown; link?: unknown }): { input: BlastInput; problems: BlastProblem[] } {
  const problems: BlastProblem[] = [];
  const kind = isBlastKind(raw.kind) ? raw.kind : "drop";
  if (!isBlastKind(raw.kind)) problems.push("kind");
  const titleRaw = String(raw.title ?? "").replace(/\s+/g, " ").trim();
  const bodyRaw = clean(raw.body, 10_000);
  if (!titleRaw) problems.push("title_missing");
  if (titleRaw.length > TITLE_MAX) problems.push("title_long");
  if (!bodyRaw) problems.push("body_missing");
  if (bodyRaw.length > BODY_MAX) problems.push("body_long");
  const linkRaw = String(raw.link ?? "").trim();
  if (linkRaw && (linkRaw.length > LINK_MAX || !/^https:\/\/[^\s]+\.[^\s]+$/i.test(linkRaw))) problems.push("link_bad");
  const productId = typeof raw.productId === "string" && raw.productId.trim() ? raw.productId.trim().slice(0, 64) : null;
  return { input: { kind, title: titleRaw.slice(0, TITLE_MAX), body: bodyRaw.slice(0, BODY_MAX), productId, link: linkRaw && !problems.includes("link_bad") ? linkRaw : null }, problems };
}

/**
 * What fills the WhatsApp template's news variable: "Title: body" on one line (Meta refuses newlines, tabs and runs
 * of spaces in a variable), with the variables filled for this person.
 */
export function whatsappNewsText(blast: { title: string; body: string }, values: BlastValues) {
  const title = fillBlastText(blast.title, values);
  const body = fillBlastText(blast.body, values);
  const joined = title && body ? `${title.replace(/[.:!?]+$/, "")}: ${body}` : title || body;
  return joined.replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 900);
}

/** A starting message for each kind, when the seller hasn't written one (and Rex isn't available). English. */
export function defaultBlastCopy(kind: FollowerBlastKind, input: { storeName: string; productName?: string | null }): { title: string; body: string } {
  const product = input.productName?.trim();
  switch (kind) {
    case "preorder":
      return {
        title: product ? `Pre-order ${product}` : "Pre-orders are open",
        body: product ? `Hi {{first_name}}, ${product} is coming soon and you can pre-order it now. Secure yours before they're gone.` : `Hi {{first_name}}, pre-orders are open at ${input.storeName}. Secure yours before they're gone.`,
      };
    case "live":
      return {
        title: "We're going live",
        body: product ? `Hi {{first_name}}, join us live: we'll show ${product} and answer your questions. Tap the link to watch.` : `Hi {{first_name}}, ${input.storeName} is going live. Come and see what's new and ask us anything.`,
      };
    default:
      return {
        title: product ? `New: ${product}` : "New drop just landed",
        body: product ? `Hi {{first_name}}, ${product} just dropped at ${input.storeName}. Take a look before it sells out.` : `Hi {{first_name}}, something new just dropped at ${input.storeName}. Take a look before it sells out.`,
      };
  }
}

// ─── Who gets what ────────────────────────────────────────────────────────────

export interface FollowerReach {
  whatsappOptIn: boolean;
  /** An existing WhatsApp marketing consent for this phone at this shop (sign-up form, seller, import). */
  whatsappConsent: boolean;
  /** They sent STOP (or "Stop promotions") on WhatsApp to this shop. */
  whatsappOptedOut: boolean;
  email: string | null;
  /** They unsubscribed, bounced, complained or turned "Promotions" off. */
  emailSuppressed: boolean;
  /** Plug devices that may get a push (none before Plug launches). */
  pushTokens: number;
}

export interface ChannelReadiness {
  whatsapp: boolean;
  email: boolean;
  push: boolean;
}

/** The channels one follower gets this blast on, from the channels the shop chose and can use. */
export function followerChannels(reach: FollowerReach, chosen: readonly BlastChannel[], ready: ChannelReadiness): BlastChannel[] {
  const out: BlastChannel[] = [];
  if (chosen.includes("whatsapp") && ready.whatsapp && (reach.whatsappOptIn || reach.whatsappConsent) && !reach.whatsappOptedOut) out.push("whatsapp");
  if (chosen.includes("email") && ready.email && reach.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reach.email) && !reach.emailSuppressed) out.push("email");
  if (chosen.includes("push") && ready.push && reach.pushTokens > 0) out.push("push");
  return out;
}

export interface AudienceCounts {
  followers: number;
  whatsapp: number;
  email: number;
  push: number;
  /** Followers who get it on at least one channel. */
  reachable: number;
}

export function countAudience(reaches: readonly FollowerReach[], chosen: readonly BlastChannel[], ready: ChannelReadiness): AudienceCounts {
  const counts: AudienceCounts = { followers: reaches.length, whatsapp: 0, email: 0, push: 0, reachable: 0 };
  for (const reach of reaches) {
    const channels = followerChannels(reach, chosen, ready);
    for (const channel of channels) counts[channel] += 1;
    if (channels.length) counts.reachable += 1;
  }
  return counts;
}

/** A blast's final status from its message counts. */
export function blastFinalStatus(counts: { sent: number; failed: number; queued: number }): BlastStatus {
  if (counts.queued > 0) return "sending";
  return counts.sent > 0 ? "sent" : "failed";
}
