// Notifications: categories, events, who gets what on which channel, quiet hours, bursts, dedupe keys, where a tap
// goes in the mobile app, Expo push batching and receipts. Shared by the server (src/lib/notifications/notify.server.ts),
// the web notification center and the Expo app. Pure (no imports) so tests/notifications.test.mjs can load it directly.

// ─── Categories and channels ─────────────────────────────────────────────────

export const NOTIFY_CATEGORY_KEYS = ["orders", "money", "messages", "deliveries", "stock", "marketing", "account"] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORY_KEYS)[number];

export const NOTIFY_CHANNEL_KEYS = ["push", "email", "sms", "whatsapp"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNEL_KEYS)[number];

export type NotifyRole = "seller" | "supplier" | "logistics_partner" | "admin";

export interface CategoryInfo {
  key: NotifyCategory;
  label: string;
  help: string;
  /** Portals where this category exists (settings only show these). */
  roles: readonly NotifyRole[];
}

export const NOTIFY_CATEGORIES: readonly CategoryInfo[] = [
  { key: "orders", label: "Orders", help: "New orders, supplier answers and order changes.", roles: ["seller", "supplier", "logistics_partner", "admin"] },
  { key: "money", label: "Payments and payouts", help: "Money received, payouts and cash to pay in.", roles: ["seller", "supplier", "logistics_partner", "admin"] },
  { key: "messages", label: "Messages", help: "Chats with customers, suppliers and delivery partners.", roles: ["seller", "supplier", "logistics_partner", "admin"] },
  { key: "deliveries", label: "Deliveries", help: "Riders, pickups and delivery updates.", roles: ["seller", "supplier", "logistics_partner", "admin"] },
  { key: "stock", label: "Stock", help: "Products running low or sold out.", roles: ["seller", "supplier"] },
  { key: "marketing", label: "Marketing and tips", help: "Campaign results, new reviews and ideas to sell more.", roles: ["seller", "supplier"] },
  { key: "account", label: "Account and verification", help: "Verification, product approvals and support replies.", roles: ["seller", "supplier", "logistics_partner", "admin"] },
];

/** Words a delivery partner or admin knows better than "Orders". */
export function categoryLabel(category: NotifyCategory, role?: string | null): string {
  if (category === "orders" && role === "logistics_partner") return "Jobs";
  if (category === "account" && role === "admin") return "Needs review";
  return NOTIFY_CATEGORIES.find((item) => item.key === category)?.label ?? "Updates";
}

export function categoriesFor(role: string | null | undefined): CategoryInfo[] {
  const r = (role ?? "seller") as NotifyRole;
  return NOTIFY_CATEGORIES.filter((item) => item.roles.includes(r));
}

export function isNotifyCategory(value: unknown): value is NotifyCategory {
  return typeof value === "string" && (NOTIFY_CATEGORY_KEYS as readonly string[]).includes(value);
}

/** SMS and WhatsApp cost money per message: never for tips and marketing. */
export function channelAllowedFor(category: NotifyCategory, channel: NotifyChannel) {
  return !(category === "marketing" && (channel === "sms" || channel === "whatsapp"));
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface EventInfo {
  category: NotifyCategory;
  /** Time-critical: ignores quiet hours (a deadline is running, or a rider is waiting). */
  urgent?: boolean;
  /** Several of these within a few minutes become one push ("5 new orders"). */
  collapse?: { key: string; one: string; many: string };
}

export const NOTIFY_EVENTS = {
  // Sellers
  "order.new": { category: "orders", collapse: { key: "order.new", one: "new order", many: "new orders" } },
  "order.update": { category: "orders" },
  "order.stuck": { category: "orders" },
  "order.paid": { category: "money", collapse: { key: "order.paid", one: "payment received", many: "payments received" } },
  "order.cod_paid": { category: "money", collapse: { key: "order.paid", one: "payment received", many: "payments received" } },
  "order.transfer_sent": { category: "money" },
  "refund.update": { category: "money" },
  "supplier.accepted": { category: "orders" },
  "supplier.declined": { category: "orders" },
  "supplier.expired": { category: "orders" },
  "supplier.switched": { category: "orders" },
  "supplier.update": { category: "orders" },
  "quote.received": { category: "orders" },
  "delivery.update": { category: "deliveries", collapse: { key: "delivery.update", one: "delivery update", many: "delivery updates" } },
  "delivery.quote": { category: "deliveries" },
  "stock.low": { category: "stock", collapse: { key: "stock", one: "product needs restocking", many: "products need restocking" } },
  "stock.out": { category: "stock", collapse: { key: "stock", one: "product needs restocking", many: "products need restocking" } },
  "message.new": { category: "messages", collapse: { key: "message.new", one: "new message", many: "new messages" } },
  "customer.message": { category: "messages", collapse: { key: "message.new", one: "new message", many: "new messages" } },
  "review.new": { category: "marketing", collapse: { key: "review.new", one: "new review", many: "new reviews" } },
  "campaign.finished": { category: "marketing" },
  // Seasonal campaigns (Marketing > Seasonal campaigns): went live, ending soon, ended with a summary.
  "store_campaign.live": { category: "marketing" },
  "store_campaign.ending_soon": { category: "marketing" },
  "store_campaign.ended": { category: "marketing" },
  "tip": { category: "marketing" },
  // Admin › Pricing › Promotions going live (delivery partners get it as account news).
  "pricing.promotion": { category: "marketing" },
  "payout.sent": { category: "money" },
  // Shopinbos Wallet (src/lib/wallet/balance.server.ts): money in (a transfer to their own account number, or a card
  // top-up), and withdrawals sent or bounced back.
  "wallet.received": { category: "money", urgent: true },
  "wallet.withdrawal": { category: "money" },
  "payout.failed": { category: "money" },
  // Suppliers
  "supplier_order.new": { category: "orders", urgent: true, collapse: { key: "supplier_order.new", one: "new order to accept", many: "new orders to accept" } },
  "supplier_order.reminder": { category: "orders", urgent: true },
  "supplier_order.expired": { category: "orders" },
  "supplier_order.cancelled": { category: "orders" },
  "quote.request": { category: "orders", collapse: { key: "quote.request", one: "new quote request", many: "new quote requests" } },
  "pickup.update": { category: "deliveries" },
  "product.approved": { category: "account" },
  "product.rejected": { category: "account" },
  "verification.update": { category: "account" },
  // Delivery partners
  "job.new": { category: "orders", collapse: { key: "job.new", one: "new job", many: "new jobs" } },
  "job.quote_accepted": { category: "orders" },
  "job.update": { category: "orders" },
  "payin.reminder": { category: "money", urgent: true },
  "payin.overdue": { category: "money", urgent: true },
  "payin.received": { category: "money" },
  // Riders (no account: push only)
  "rider.job_assigned": { category: "deliveries", urgent: true },
  "rider.job_changed": { category: "deliveries" },
  "rider.job_cancelled": { category: "deliveries", urgent: true },
  // Admins and everyone
  "admin.review": { category: "account", collapse: { key: "admin.review", one: "item to review", many: "items to review" } },
  "admin.alert": { category: "account" },
  "support.reply": { category: "account" },
  "account.update": { category: "account" },
  "test": { category: "account", urgent: true },
} as const satisfies Record<string, EventInfo>;

export type NotifyEvent = keyof typeof NOTIFY_EVENTS;

export function eventInfo(event: string | null | undefined): EventInfo | null {
  return event && Object.prototype.hasOwnProperty.call(NOTIFY_EVENTS, event) ? (NOTIFY_EVENTS as Record<string, EventInfo>)[event] : null;
}

/** The burst wording for a collapse key ("order.new" → new order / new orders). */
export function collapseByKey(key: string | null | undefined): { key: string; one: string; many: string } | null {
  if (!key) return null;
  for (const info of Object.values(NOTIFY_EVENTS) as EventInfo[]) if (info.collapse?.key === key) return info.collapse;
  return null;
}

/** The settings category for an old-style notification type (Notification.type). */
export function categoryForType(type: string | null | undefined): NotifyCategory {
  switch (type) {
    case "order":
    case "checkout":
    case "dropshipping":
    case "suppliers":
      return "orders";
    case "payout":
      return "money";
    case "logistics":
      return "deliveries";
    case "inventory":
      return "stock";
    case "customers":
      return "messages";
    case "system":
    case "products":
      return "account";
    default:
      return "marketing"; // peggy, rexai, marketplace, marketing, category, health, activity, store_builder
  }
}

// ─── Preferences ──────────────────────────────────────────────────────────────

export type ChannelSwitches = Record<NotifyChannel, boolean>;
export type PreferenceMatrix = Record<NotifyCategory, ChannelSwitches>;

/** Before someone changes anything: push for everything, email for orders, money and account, no paid texts. */
export const DEFAULT_PREFERENCES: PreferenceMatrix = {
  orders: { push: true, email: true, sms: false, whatsapp: false },
  money: { push: true, email: true, sms: false, whatsapp: false },
  messages: { push: true, email: false, sms: false, whatsapp: false },
  deliveries: { push: true, email: false, sms: false, whatsapp: false },
  stock: { push: true, email: false, sms: false, whatsapp: false },
  marketing: { push: true, email: false, sms: false, whatsapp: false },
  account: { push: true, email: true, sms: false, whatsapp: false },
};

/** How a category's switches are stored: a NotificationPreference row with this eventKey. */
export const preferenceEventKey = (category: NotifyCategory) => `notify.${category}`;
/** The older message setting (supplier settings, partner chat): still honoured for Messages until changed here. */
export const LEGACY_MESSAGE_EVENT_KEY = "message_received";

export interface PreferenceRow {
  eventKey: string;
  push: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  inApp?: boolean;
}

export function resolvePreferences(rows: readonly PreferenceRow[]): PreferenceMatrix {
  const out = {} as PreferenceMatrix;
  for (const category of NOTIFY_CATEGORY_KEYS) {
    const base = { ...DEFAULT_PREFERENCES[category] };
    if (category === "messages") {
      const legacy = rows.find((row) => row.eventKey === LEGACY_MESSAGE_EVENT_KEY);
      if (legacy) {
        base.email = legacy.email;
        base.sms = legacy.sms;
        if (legacy.inApp === false) base.push = false;
      }
    }
    const row = rows.find((item) => item.eventKey === preferenceEventKey(category));
    const merged = row ? { push: row.push, email: row.email, sms: row.sms, whatsapp: row.whatsapp } : base;
    if (!channelAllowedFor(category, "sms")) merged.sms = false;
    if (!channelAllowedFor(category, "whatsapp")) merged.whatsapp = false;
    out[category] = merged;
  }
  return out;
}

// ─── Quiet hours ──────────────────────────────────────────────────────────────

export interface QuietHours {
  enabled: boolean;
  start: string; // "22:00"
  end: string; // "07:00"
  timezone: string;
}

export const DEFAULT_QUIET_HOURS: QuietHours = { enabled: true, start: "22:00", end: "07:00", timezone: "Africa/Lagos" };

export function parseClock(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Minutes since local midnight in that time zone (falls back to Lagos, UTC+1, if the zone is unknown). */
export function localMinutes(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
    return hour * 60 + minute;
  } catch {
    return (now.getUTCHours() * 60 + now.getUTCMinutes() + 60) % 1440;
  }
}

export function isQuietTime(now: Date, quiet: QuietHours | null | undefined): boolean {
  if (!quiet?.enabled) return false;
  const start = parseClock(quiet.start);
  const end = parseClock(quiet.end);
  if (start === null || end === null || start === end) return false;
  const minutes = localMinutes(now, quiet.timezone || DEFAULT_QUIET_HOURS.timezone);
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

// ─── Which channels a notification goes out on ───────────────────────────────

export type ChannelAction = "send" | "hold" | "off";

export interface DeliveryPlan {
  push: ChannelAction;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

/**
 * Who gets what: the person's switches for the category, quiet hours (push waits for the morning summary, texts
 * are skipped) unless it's urgent, email only for events that have an email (`email`: "notification" follows the
 * switch, "transactional" always sends: billing and security), and no texts when the caller already texted them.
 */
export function planDelivery(input: {
  category: NotifyCategory;
  urgent: boolean;
  prefs: PreferenceMatrix;
  quiet: boolean;
  email?: "notification" | "transactional" | null;
  phoneHandled?: boolean;
}): DeliveryPlan {
  const p = input.prefs[input.category] ?? DEFAULT_PREFERENCES[input.category];
  const hush = input.quiet && !input.urgent;
  const texts = !input.phoneHandled && !hush;
  return {
    push: p.push ? (hush ? "hold" : "send") : "off",
    email: input.email === "transactional" ? true : input.email === "notification" ? p.email : false,
    sms: texts && p.sms && channelAllowedFor(input.category, "sms"),
    whatsapp: texts && p.whatsapp && channelAllowedFor(input.category, "whatsapp"),
  };
}

// ─── Bursts ───────────────────────────────────────────────────────────────────

/** Pushes for the same thing this close together are held and sent as one summary. */
export const BURST_WINDOW_MS = 3 * 60_000;

/**
 * "send" when nothing like it was pushed in the last few minutes; else "hold" (the next one after the window, or
 * the cron, sends "N new orders" for everything held).
 */
export function burstDecision(input: { now: Date; lastSentAt: Date | null; windowMs?: number }): "send" | "hold" {
  const windowMs = input.windowMs ?? BURST_WINDOW_MS;
  if (!input.lastSentAt) return "send";
  return input.now.getTime() - input.lastSentAt.getTime() >= windowMs ? "send" : "hold";
}

/** Held pushes whose window has closed are due as a summary. */
export function burstFlushDue(oldestHeldAt: Date, now: Date, windowMs = BURST_WINDOW_MS) {
  return now.getTime() - oldestHeldAt.getTime() >= windowMs;
}

export function burstSummary(collapse: { one: string; many: string }, count: number): { title: string; body: string } {
  const n = Math.max(1, Math.floor(count));
  return { title: `${n} ${n === 1 ? collapse.one : collapse.many}`, body: n === 1 ? "Tap to see it." : "Tap to see them." };
}

/** The morning push for what arrived during quiet hours: "While you were away: Orders 3 · Messages 2". */
export function quietSummary(categories: readonly string[], role?: string | null): { title: string; body: string } | null {
  if (!categories.length) return null;
  const counts = new Map<NotifyCategory, number>();
  for (const value of categories) {
    const key = isNotifyCategory(value) ? value : "account";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const parts = NOTIFY_CATEGORY_KEYS.filter((key) => counts.has(key)).map((key) => `${categoryLabel(key, role)} ${counts.get(key)}`);
  const total = categories.length;
  return { title: `${total} ${total === 1 ? "update" : "updates"} while you were away`, body: `${parts.join(" · ")}. Tap to see them.` };
}

// ─── Dedupe keys ──────────────────────────────────────────────────────────────

/** A stable key from the parts that make a notification "the same one" (e.g. "supplier_order.new", order id). */
export function dedupeKey(...parts: Array<string | number | null | undefined | false>): string {
  return parts
    .filter((part) => part !== null && part !== undefined && part !== false && String(part) !== "")
    .map((part) => String(part).replace(/\s+/g, " ").trim())
    .join(":")
    .slice(0, 190);
}

/** 32-bit FNV-1a, hex. Enough to tell texts apart in a dedupe key; not for security. */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * When the caller gives no key: the same title, text and link within two minutes is a double send (a retried
 * request, a webhook delivered twice), so it gets the same key.
 */
export function autoDedupeKey(input: { event?: string | null; title: string; description: string; link?: string | null }, now: Date, bucketMs = 2 * 60_000): string {
  return dedupeKey("auto", input.event ?? "", shortHash(`${input.title}\n${input.description}\n${input.link ?? ""}`), Math.floor(now.getTime() / bucketMs));
}

// ─── Where a tap goes in the mobile app ───────────────────────────────────────

export interface AppRoute {
  pathname: string;
  params?: Record<string, string>;
}

function queryParam(query: string, name: string): string | null {
  for (const part of query.split("&")) {
    const [key, value = ""] = part.split("=");
    if (key === name && value) {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}

const SIMPLE_SCREENS: Array<[RegExp, string]> = [
  [/^\/home\/orders$/, "/orders"],
  [/^\/home\/(messages|inbox)(\/partners)?$/, "/chats"],
  [/^\/home\/reviews(\/.*)?$/, "/reviews"],
  [/^\/home\/marketing(\/.*)?$/, "/marketing"],
  [/^\/home\/(inventory|products)(\/.*)?$/, "/products"],
  [/^\/products(\/.*)?$/, "/products"],
  [/^\/marketplace(\/.*)?$/, "/find"],
  [/^\/home\/notifications(\/.*)?$/, "/notifications"],
  [/^\/home\/(payments|payouts)(\/.*)?$/, "/payments"],
  [/^\/home\/(shipping|logistics)$/, "/delivery"],
  [/^\/home\/settings(\/.*)?$/, "/settings"],
  [/^\/channels$/, "/channels"],
  [/^\/home$/, "/home"],
  [/^\/supplier\/orders$/, "/supplier/orders"],
  [/^\/supplier\/(quotes|quote-requests)$/, "/supplier/quotes"],
  [/^\/supplier\/inbox$/, "/supplier/messages"],
  [/^\/supplier\/(payouts|wholesale)$/, "/supplier/money"],
  [/^\/supplier\/products$/, "/supplier/products"],
  [/^\/supplier\/verification$/, "/supplier/verification"],
  [/^\/supplier(\/dashboard)?$/, "/supplier/home"],
  [/^\/logistics\/(bookings|jobs)$/, "/logistics/jobs"],
  [/^\/logistics\/(cash|payouts|billing)$/, "/logistics/earnings"],
  [/^\/logistics\/inbox$/, "/logistics/messages"],
  [/^\/logistics\/verification$/, "/logistics/verification"],
  [/^\/logistics(\/dashboard)?$/, "/logistics/home"],
  [/^\/rider$/, "/rider"],
];

/** Screens only the phone app has, for app:/… links. Anything else is ignored (null). */
const APP_OWN_SCREENS = ["/posts", "/rewards", "/create", "/ask-peggy", "/status/new", "/notifications"];

function appOwnRoute(rest: string): AppRoute | null {
  const [beforeQuery] = rest.split(/[?#]/);
  const pathname = beforeQuery.replace(/\/+$/, "") || "/";
  let match: RegExpExecArray | null;
  if ((match = /^\/posts\/([\w-]+)$/.exec(pathname))) return { pathname: "/posts/[id]", params: { id: match[1] } };
  if ((match = /^\/create\/([\w-]+)$/.exec(pathname))) return { pathname: "/create/[id]", params: { id: match[1] } };
  if (APP_OWN_SCREENS.includes(pathname)) return { pathname };
  return null;
}

/**
 * The app screen for a notification's web link (orders, chats, jobs, quotes, payouts…), or null when the app has
 * no screen for it (the app then opens that page of the website, signed in).
 */
export function appRouteFor(link: string | null | undefined): AppRoute | null {
  if (!link) return null;
  let path = String(link).trim();
  // The phone app's own screens: app:/posts/<id> (the "Time to post" reminder), app:/rewards and so on.
  if (path.startsWith("app:")) return appOwnRoute(path.slice(4));
  const absolute = /^https?:\/\/[^/]+(\/.*)?$/.exec(path);
  if (absolute) path = absolute[1] ?? "/";
  if (!path.startsWith("/")) return null;
  const [beforeHash] = path.split("#");
  const [rawPathname, query = ""] = beforeHash.split("?");
  const pathname = rawPathname.replace(/\/+$/, "") || "/";
  let match: RegExpExecArray | null;

  if ((match = /^\/home\/orders\/([\w-]+)$/.exec(pathname)) && match[1] !== "new") return { pathname: "/order/[id]", params: { id: match[1] } };
  if ((match = /^\/products\/([\w-]+)$/.exec(pathname)) && match[1] !== "new") return { pathname: "/product/[id]", params: { id: match[1] } };
  if ((match = /^\/home\/legal\/([\w-]+)$/.exec(pathname))) return { pathname: "/legal/[key]", params: { key: match[1] } };
  if (pathname === "/home/reviews/request") return { pathname: "/reviews/ask" };
  const conversation = queryParam(query, "c");
  if (pathname === "/home/messages" && conversation) return { pathname: "/inbox/[id]", params: { id: conversation } };
  if (pathname === "/home/messages/partners" && conversation) return { pathname: "/partners/[id]", params: { id: conversation } };
  if (pathname === "/supplier/inbox" && conversation) return { pathname: "/supplier/chat/[id]", params: { id: conversation } };
  if (pathname === "/logistics/inbox" && conversation) return { pathname: "/logistics/chat/[id]", params: { id: conversation } };
  if ((match = /^\/supplier\/orders\/([\w-]+)$/.exec(pathname))) {
    return { pathname: "/supplier/order/[id]", params: queryParam(query, "kind") === "wholesale" ? { id: match[1], kind: "wholesale" } : { id: match[1] } };
  }
  if ((match = /^\/supplier\/(?:quotes|quote-requests)\/([\w-]+)$/.exec(pathname))) return { pathname: "/supplier/quote/[id]", params: { id: match[1] } };
  const quote = queryParam(query, "quote");
  if (/^\/supplier\/(quotes|quote-requests)$/.test(pathname) && quote) return { pathname: "/supplier/quote/[id]", params: { id: quote } };
  if ((match = /^\/supplier\/products\/([\w-]+)$/.exec(pathname)) && match[1] !== "new") return { pathname: "/supplier/product/[id]", params: { id: match[1] } };
  if ((match = /^\/logistics\/(?:bookings|jobs)\/([\w-]+)$/.exec(pathname))) return { pathname: "/logistics/job/[id]", params: { id: match[1] } };
  const job = queryParam(query, "job");
  if (/^\/logistics\/(bookings|jobs)$/.test(pathname) && job) return { pathname: "/logistics/job/[id]", params: { id: job } };
  if ((match = /^\/rider\/drop\/([\w-]+)$/.exec(pathname))) return { pathname: "/rider/drop/[id]", params: { id: match[1] } };
  // A seller's Social posts are the phone's posts calendar: "Your post is ready for WhatsApp" opens it with Share.
  if ((match = /^\/home\/marketing\/social\/([\w-]+)$/.exec(pathname)) && !["new", "designs", "accounts"].includes(match[1])) return { pathname: "/posts/[id]", params: { id: match[1] } };
  if (pathname === "/home/marketing/social" || pathname === "/home/marketing/social/accounts") return { pathname: "/posts" };
  if (pathname === "/home/marketing/social/new") return { pathname: "/create" };
  for (const [pattern, screen] of SIMPLE_SCREENS) if (pattern.test(pathname)) return { pathname: screen };
  return null;
}

/** expo-router href string for a route ("/order/abc"), for places that take a plain path. */
export function routeHref(route: AppRoute): string {
  let href = route.pathname;
  const extra: string[] = [];
  for (const [key, value] of Object.entries(route.params ?? {})) {
    if (href.includes(`[${key}]`)) href = href.replace(`[${key}]`, encodeURIComponent(value));
    else extra.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return extra.length ? `${href}?${extra.join("&")}` : href;
}

// ─── Android notification channels ───────────────────────────────────────────

export const ANDROID_CHANNELS = [
  { id: "orders", name: "Orders and account", description: "New orders, jobs, stock and account updates." },
  { id: "messages", name: "Messages", description: "New chats from customers and business partners." },
  { id: "money", name: "Money", description: "Payments, payouts and cash to pay in." },
  { id: "deliveries", name: "Deliveries", description: "Riders, pickups and delivery updates." },
  { id: "marketing", name: "Tips and marketing", description: "Campaign results, reviews and ideas." },
] as const;
export type AndroidChannelId = (typeof ANDROID_CHANNELS)[number]["id"];

export function androidChannelFor(category: NotifyCategory): AndroidChannelId {
  if (category === "messages" || category === "money" || category === "deliveries" || category === "marketing") return category;
  return "orders";
}

// ─── Expo push: batches, tickets and receipts ────────────────────────────────

export const EXPO_BATCH_SIZE = 100;
export const EXPO_RECEIPT_BATCH_SIZE = 300;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export function isExpoPushToken(token: unknown): token is string {
  return typeof token === "string" && /^(ExponentPushToken|ExpoPushToken)\[[^\]]{10,}\]$/.test(token);
}

/** Errors that mean the phone will never get pushes on this token again. */
const DEAD_TOKEN_ERRORS = new Set(["DeviceNotRegistered"]);

export interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface TicketOutcome {
  deviceId: string;
  status: "sent" | "error";
  ticketId: string | null;
  error: string | null;
  dead: boolean;
}

/** Pairs the tickets Expo returned with the devices of the messages sent (same order). */
export function readTickets(deviceIds: readonly string[], tickets: readonly ExpoTicket[] | null | undefined): TicketOutcome[] {
  return deviceIds.map((deviceId, index) => {
    const ticket = tickets?.[index];
    if (!ticket) return { deviceId, status: "error", ticketId: null, error: "No ticket returned", dead: false };
    if (ticket.status === "ok" && ticket.id) return { deviceId, status: "sent", ticketId: ticket.id, error: null, dead: false };
    const code = ticket.details?.error ?? null;
    return { deviceId, status: "error", ticketId: ticket.id ?? null, error: (code ?? ticket.message ?? "Push not accepted").slice(0, 300), dead: Boolean(code && DEAD_TOKEN_ERRORS.has(code)) };
  });
}

export interface ReceiptRow {
  id: string;
  ticketId: string;
  deviceId: string | null;
}

export interface ReceiptOutcome {
  ok: string[];
  failed: Array<{ id: string; error: string }>;
  deadDevices: string[];
  /** No receipt yet (Expo keeps them about a day): checked again next run. */
  pending: string[];
}

/** What the receipts say: delivered rows, failed rows, and devices whose token is dead (switch them off). */
export function readReceipts(rows: readonly ReceiptRow[], receipts: Record<string, ExpoTicket | undefined> | null | undefined): ReceiptOutcome {
  const out: ReceiptOutcome = { ok: [], failed: [], deadDevices: [], pending: [] };
  const dead = new Set<string>();
  for (const row of rows) {
    const receipt = receipts?.[row.ticketId];
    if (!receipt) {
      out.pending.push(row.id);
      continue;
    }
    if (receipt.status === "ok") {
      out.ok.push(row.id);
      continue;
    }
    const code = receipt.details?.error ?? null;
    out.failed.push({ id: row.id, error: (code ?? receipt.message ?? "Not delivered").slice(0, 300) });
    if (code && DEAD_TOKEN_ERRORS.has(code) && row.deviceId) dead.add(row.deviceId);
  }
  out.deadDevices = [...dead];
  return out;
}

/** Web Push: the browser subscription is gone (unsubscribed, site data cleared). */
export function isDeadWebPushStatus(statusCode: number | null | undefined) {
  return statusCode === 404 || statusCode === 410;
}

/** Browser push services we deliver to. Anything else is refused (the server POSTs to this URL: no internal hosts). */
const WEB_PUSH_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com", "web.push.apple.com"];

export function isAllowedWebPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return WEB_PUSH_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

/** After this many failed sends in a row a device is switched off. */
export const MAX_DEVICE_FAILURES = 5;

// ─── Notification list helpers (web and app) ─────────────────────────────────

export type DayGroup<T> = { label: "Today" | "Yesterday" | "Earlier"; items: T[] };

/** Today / Yesterday / Earlier, by the viewer's local day, newest first within each. */
export function groupByDay<T extends { createdAt: string | Date }>(items: readonly T[], now = new Date()): DayGroup<T>[] {
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 24 * 60 * 60 * 1000;
  const groups: DayGroup<T>[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];
  for (const item of items) {
    const at = new Date(item.createdAt).getTime();
    groups[at >= startToday ? 0 : at >= startYesterday ? 1 : 2].items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}

export function timeAgo(value: string | Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
