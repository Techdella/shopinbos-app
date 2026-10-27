// Push center (Admin › Push center, /admin/push): what a campaign says, where a tap goes, who gets it, when it may
// go out, and how a run sends it without telling anyone twice. Pure, so the admin page, the server
// (src/lib/push-campaigns/campaigns.server.ts) and tests/push-campaigns.test.mjs share it.

import { appRouteFor, routeHref, shortHash } from "./notifications.ts";

// ─── The message ──────────────────────────────────────────────────────────────

/** Android cuts a title at about 50 characters and the text at about 150 (two lines expanded). */
export const PUSH_TITLE_MAX = 50;
export const PUSH_BODY_MAX = 150;

/** At most this many real campaigns per Lagos day, unless the admin ticks "override". Tests and "only me" don't count. */
export const PUSH_DAILY_LIMIT = 3;

/** The notify() dedupe key and the deliveries' collapseKey for a campaign. */
export const campaignKey = (id: string) => `push-campaign:${id}`;

// ─── Where a tap goes ─────────────────────────────────────────────────────────

export interface PushLink {
  key: string;
  label: string;
  /** Who the screen is for (a hint in the composer; any role can be sent any link). */
  for: "seller" | "supplier" | "logistics_partner" | "rider" | "everyone";
  /** What a browser and the bell open. */
  web: string;
  /** What appRouteFor turns into the phone screen (the web path itself, or an app:/… link for app-only screens). */
  app: string;
}

export const PUSH_LINKS: readonly PushLink[] = [
  { key: "home", label: "Home", for: "seller", web: "/home", app: "/home" },
  { key: "orders", label: "Orders", for: "seller", web: "/home/orders", app: "/home/orders" },
  { key: "products", label: "Products", for: "seller", web: "/home/products", app: "/home/products" },
  { key: "chats", label: "Chats", for: "seller", web: "/home/messages", app: "/home/messages" },
  { key: "rewards", label: "Rewards", for: "everyone", web: "/home/refer", app: "app:/rewards" },
  { key: "find", label: "Find products", for: "seller", web: "/marketplace", app: "/marketplace" },
  { key: "posts", label: "Posts", for: "seller", web: "/home/marketing/social", app: "/home/marketing/social" },
  { key: "wallet", label: "Wallet", for: "seller", web: "/home/wallet", app: "/home/wallet" },
  { key: "notifications", label: "Notifications", for: "everyone", web: "/home/notifications", app: "app:/notifications" },
  { key: "supplier-home", label: "Supplier home", for: "supplier", web: "/supplier", app: "/supplier" },
  { key: "partner-home", label: "Delivery partner home", for: "logistics_partner", web: "/logistics", app: "/logistics" },
  { key: "rider-home", label: "Rider home", for: "rider", web: "/rider", app: "/rider" },
];

export const CUSTOM_LINK = "custom";

/** A path on app.shopinbos.com: starts with one "/", no spaces, no scheme, not too long. */
export function isSafeWebPath(path: unknown): path is string {
  if (typeof path !== "string") return false;
  const value = path.trim();
  return value.length > 0 && value.length <= 300 && value.startsWith("/") && !value.startsWith("//") && !/[\s\\<>"']/.test(value) && !/^\/+[a-z][a-z0-9+.-]*:/i.test(value);
}

export interface ResolvedLink {
  linkKey: string;
  /** Web path for browsers and the bell. */
  link: string;
  /** What the server passes to notify() as appRoute (null: the web link's own screen, or the website). */
  appLink: string | null;
  /** The phone screen a tap opens (expo-router href), or null when the app opens that page of the website. */
  appRoute: string | null;
}

/** The curated screen, or a custom web path; null when neither is valid. */
export function resolvePushLink(input: { linkKey?: string | null; customPath?: string | null }): ResolvedLink | null {
  const key = input.linkKey || "home";
  if (key === CUSTOM_LINK) {
    const path = input.customPath?.trim() ?? "";
    if (!isSafeWebPath(path)) return null;
    const route = appRouteFor(path);
    return { linkKey: CUSTOM_LINK, link: path, appLink: null, appRoute: route ? routeHref(route) : null };
  }
  const item = PUSH_LINKS.find((entry) => entry.key === key);
  if (!item) return null;
  const route = appRouteFor(item.app);
  return { linkKey: item.key, link: item.web, appLink: item.app === item.web ? null : item.app, appRoute: route ? routeHref(route) : null };
}

/** Same title, text and link: a test of one counts for the other. */
export function contentHash(input: { title: string; body: string; link: string; appLink?: string | null }): string {
  return shortHash(`${input.title.trim()}\n${input.body.trim()}\n${input.link}\n${input.appLink ?? ""}`);
}

/** The first real send needs a test of exactly what is going out. */
export function testMatches(campaign: { testedHash: string | null | undefined }, current: string) {
  return Boolean(campaign.testedHash) && campaign.testedHash === current;
}

// ─── Who gets it ──────────────────────────────────────────────────────────────

export const PUSH_ROLES = [
  { key: "seller", label: "Sellers" },
  { key: "supplier", label: "Suppliers" },
  { key: "logistics_partner", label: "Delivery partners" },
  { key: "rider", label: "Riders" },
] as const;
export type PushRole = (typeof PUSH_ROLES)[number]["key"];
export const ACCOUNT_ROLES = ["seller", "supplier", "logistics_partner"] as const;

export const PUSH_SCOPES = [
  { key: "everyone", label: "Everyone" },
  { key: "roles", label: "By role" },
  { key: "sellers_not_live", label: "Sellers whose store isn't live yet" },
  { key: "sellers_no_products", label: "Sellers with no products yet" },
  { key: "user", label: "One person" },
  { key: "me", label: "Only me" },
] as const;
export type PushScope = (typeof PUSH_SCOPES)[number]["key"];

export const PUSH_PLATFORMS = [
  { key: "any", label: "Phone app and web" },
  { key: "app", label: "Phone app only" },
  { key: "web", label: "Web browsers only" },
] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number]["key"];

export interface PushAudience {
  scope: PushScope;
  /** scope "roles". */
  roles?: PushRole[];
  platform: PushPlatform;
  /** Store, business or account city/state (case-insensitive). Empty: anywhere. Accounts only. */
  cities?: string[];
  /** Also people with no phone or browser push on (they only get the bell). Platform "any" only. */
  includeBellOnly?: boolean;
  /** scope "user": an email address or phone number. */
  contact?: string;
}

const isScope = (value: unknown): value is PushScope => PUSH_SCOPES.some((scope) => scope.key === value);
const isRole = (value: unknown): value is PushRole => PUSH_ROLES.some((role) => role.key === value);
const isPlatform = (value: unknown): value is PushPlatform => PUSH_PLATFORMS.some((platform) => platform.key === value);

/** A clean audience from anything (the form, a stored row), or an error message. */
export function parseAudience(raw: unknown): { audience: PushAudience } | { error: string } {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!isScope(input.scope)) return { error: "Pick who gets it." };
  const platform = isPlatform(input.platform) ? input.platform : "any";
  const audience: PushAudience = { scope: input.scope, platform };
  if (input.scope === "roles") {
    const roles = Array.isArray(input.roles) ? [...new Set(input.roles.filter(isRole))] : [];
    if (!roles.length) return { error: "Pick at least one role." };
    audience.roles = roles;
  }
  if (input.scope === "user") {
    const contact = typeof input.contact === "string" ? input.contact.trim().slice(0, 200) : "";
    if (!contact) return { error: "Type the person's email address or phone number." };
    audience.contact = contact;
  }
  const cities = Array.isArray(input.cities) ? [...new Set(input.cities.filter((city): city is string => typeof city === "string").map((city) => city.trim().slice(0, 80)).filter(Boolean))].slice(0, 20) : [];
  if (cities.length && !["user", "me"].includes(input.scope)) audience.cities = cities;
  if (input.includeBellOnly === true && platform === "any" && !["user", "me"].includes(input.scope)) audience.includeBellOnly = true;
  return { audience };
}

/** Riders are in it (they have no account: push only, no bell, no location). */
export function audienceHasRiders(audience: PushAudience) {
  return audience.scope === "roles" && Boolean(audience.roles?.includes("rider")) && audience.platform !== "web" && !audience.cities?.length;
}

/** The kinds of device push goes to (notify()'s pushPlatforms): undefined is all of them. */
export function pushPlatformsFor(audience: PushAudience): Array<"app" | "web"> | undefined {
  return audience.platform === "app" ? ["app"] : audience.platform === "web" ? ["web"] : undefined;
}

/** The PushDevice filter for the platform (active devices only). */
export function deviceWhere(audience: PushAudience): Record<string, unknown> {
  return { disabledAt: null, ...(audience.platform === "app" ? { provider: "expo" } : audience.platform === "web" ? { provider: "webpush" } : {}) };
}

/** Same rule as src/lib/onboarding/setup-rules.ts storeIsLive, as a Store filter. */
export const LIVE_STORE_WHERE = {
  OR: [
    { onboardingState: "LIVE" },
    { launchPayments: { some: { status: { in: ["paid", "settled", "deposit_paid"] } } } },
    { AND: [{ status: { in: ["active", "published"] } }, { brandSettings: { path: ["editor", "published"], equals: true } }] },
  ],
};

function cityFilter(cities: readonly string[]) {
  const or: Array<Record<string, unknown>> = [];
  for (const city of cities) {
    const match = { equals: city, mode: "insensitive" };
    or.push({ city: match }, { store: { is: { city: match } } }, { supplier: { is: { city: match } } }, { logisticsPartner: { is: { city: match } } });
  }
  return { OR: or };
}

/**
 * The User filter (Prisma where) for the accounts in an audience, or null when it has no accounts (riders only).
 * `userId` is the person found for scope "user" (null: not found, so nobody). Admins only ever get "only me".
 */
export function audienceUserWhere(audience: PushAudience, ctx: { meId: string; userId?: string | null }): Record<string, unknown> | null {
  const and: Array<Record<string, unknown>> = [];
  switch (audience.scope) {
    case "me":
      and.push({ id: ctx.meId });
      break;
    case "user":
      if (!ctx.userId) return null;
      and.push({ id: ctx.userId }, { role: { in: [...ACCOUNT_ROLES, "admin"] } });
      break;
    case "everyone":
      and.push({ role: { in: [...ACCOUNT_ROLES] } });
      break;
    case "roles": {
      const roles = (audience.roles ?? []).filter((role) => role !== "rider");
      if (!roles.length) return null;
      and.push({ role: { in: roles } });
      break;
    }
    case "sellers_not_live":
      and.push({ role: "seller" }, { NOT: { store: { is: LIVE_STORE_WHERE } } });
      break;
    case "sellers_no_products":
      and.push({ role: "seller" }, { storeProducts: { none: {} } });
      break;
  }
  if (audience.cities?.length) and.push(cityFilter(audience.cities));
  // Push only to people with a phone or browser on (unless the bell-only people are included too).
  if (!audience.includeBellOnly) and.push({ pushDevices: { some: deviceWhere(audience) } });
  return and.length === 1 ? and[0] : { AND: and };
}

/** People who switched Shopinbos news push off (they still get the bell, never the push). */
export const NEWS_PUSH_OFF = { notificationPreferences: { some: { eventKey: "notify.announcements", push: false } } };

/** The rider filter (LogisticsTeamMember where) for an audience, or null when it has no riders. */
export function audienceRiderWhere(audience: PushAudience): Record<string, unknown> | null {
  if (!audienceHasRiders(audience)) return null;
  return { status: "active", riderTokenHash: { not: null }, pushDevices: { some: { disabledAt: null } } };
}

export function describeAudience(raw: unknown): string {
  const parsed = parseAudience(raw);
  if ("error" in parsed) return "Unknown audience";
  const a = parsed.audience;
  const who =
    a.scope === "roles"
      ? (a.roles ?? []).map((role) => PUSH_ROLES.find((item) => item.key === role)?.label ?? role).join(", ")
      : a.scope === "user"
        ? `One person (${a.contact})`
        : PUSH_SCOPES.find((scope) => scope.key === a.scope)?.label ?? a.scope;
  const parts = [who];
  if (a.platform !== "any") parts.push(PUSH_PLATFORMS.find((p) => p.key === a.platform)?.label ?? a.platform);
  if (a.cities?.length) parts.push(`in ${a.cities.join(", ")}`);
  if (a.includeBellOnly) parts.push("bell for people without push");
  return parts.join(" · ");
}

/** Tests and "only me" don't count towards the daily limit. */
export const countsTowardsLimit = (audience: PushAudience) => audience.scope !== "me";

// ─── When ─────────────────────────────────────────────────────────────────────

/** Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET_MS = 60 * 60_000;

/** "2026-11-30T09:15" typed as Lagos time → the instant. null when it isn't a date and time. */
export function lagosInputToDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const utc = Date.UTC(y, mo - 1, d, h, mi) - LAGOS_OFFSET_MS;
  const check = new Date(utc + LAGOS_OFFSET_MS);
  if (check.getUTCDate() !== d) return null; // 31 February
  return new Date(utc);
}

/** The instant as a datetime-local value in Lagos time. */
export function dateToLagosInput(date: Date | string): string {
  const lagos = new Date(new Date(date).getTime() + LAGOS_OFFSET_MS);
  return lagos.toISOString().slice(0, 16);
}

/** "2026-11-30": the Lagos calendar day of an instant. */
export function lagosDay(date: Date | string): string {
  return new Date(new Date(date).getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

/** How many real campaigns already go out on that Lagos day, and whether one more is over the limit. */
export function dailyLimitCheck(others: ReadonlyArray<Date | string>, at: Date, limit = PUSH_DAILY_LIMIT) {
  const day = lagosDay(at);
  const used = others.filter((when) => lagosDay(when) === day).length;
  return { used, limit, reached: used >= limit };
}

/** Earliest and latest a campaign can be scheduled. */
export const SCHEDULE_MIN_LEAD_MS = 5 * 60_000;
export const SCHEDULE_MAX_AHEAD_MS = 60 * 86_400_000;

export function scheduleProblem(at: Date, now = new Date()): string | null {
  if (Number.isNaN(at.getTime())) return "Pick a date and time.";
  if (at.getTime() < now.getTime() + SCHEDULE_MIN_LEAD_MS) return "Pick a time at least 5 minutes from now.";
  if (at.getTime() > now.getTime() + SCHEDULE_MAX_AHEAD_MS) return "Schedule it within the next 60 days.";
  return null;
}

// ─── Statuses ─────────────────────────────────────────────────────────────────

export const CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent", "cancelled", "failed"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  cancelled: "Cancelled",
  failed: "Failed",
};

// ─── Sending (no database: src/lib/push-campaigns/campaigns.server.ts gives it a Prisma store) ─────────────────

export const CAMPAIGN_BATCH = 100;
/** People told at the same time within a batch (each is a few queries plus one Expo request). */
export const CAMPAIGN_CONCURRENCY = 8;
/** A batch left "sending" this long belongs to a run that died: it goes back in the queue (notify() dedupes). */
export const CAMPAIGN_STALE_MS = 10 * 60_000;

export interface CampaignRecipient {
  id: string;
  userId: string | null;
  riderId: string | null;
}

export interface CampaignStore {
  status(id: string): Promise<string | null>;
  /** scheduled (and due) → sending, atomically: true only for the one caller that moved it. */
  claim(id: string, now: Date): Promise<boolean>;
  hasRecipients(id: string): Promise<boolean>;
  /** Writes the recipient rows (unique per campaign and person, so a second snapshot adds nobody twice). */
  snapshot(id: string): Promise<number>;
  /** Up to `take` queued rows → sending (FOR UPDATE SKIP LOCKED: overlapping runs never take the same rows). */
  claimBatch(id: string, take: number): Promise<CampaignRecipient[]>;
  /** Bell + push for one person (dedupe key per campaign). Throws when it couldn't. */
  deliver(id: string, recipient: CampaignRecipient): Promise<{ notificationId: string | null }>;
  markSent(rowId: string, notificationId: string | null, at: Date): Promise<void>;
  markFailed(rowId: string, error: string): Promise<void>;
  /** Rows left "sending" since before `before` → queued again. */
  requeueStale(id: string, before: Date): Promise<void>;
  /** queued + sending rows left. */
  remaining(id: string): Promise<number>;
  /** sending → sent (only if still sending), with the totals. */
  finish(id: string, at: Date): Promise<void>;
}

export type CampaignProgress = { status: string; delivered: number; failed: number; remaining: number };

async function inParallel<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await task(items[next++]!);
  });
  await Promise.all(workers);
}

/** Sends the next batches of a campaign that is "sending" (bounded by time), and marks it sent once nobody is left. */
export async function runCampaign(input: { id: string; store: CampaignStore; deadline: number; now?: () => number; batchSize?: number; concurrency?: number; maxBatches?: number }): Promise<CampaignProgress> {
  const { id, store } = input;
  const now = input.now ?? Date.now;
  let delivered = 0;
  let failed = 0;
  const status = await store.status(id);
  if (status !== "sending") return { status: status ?? "missing", delivered, failed, remaining: 0 };
  if (!(await store.hasRecipients(id))) await store.snapshot(id);
  await store.requeueStale(id, new Date(now() - CAMPAIGN_STALE_MS));

  const maxBatches = input.maxBatches ?? 200;
  for (let round = 0; round < maxBatches && now() < input.deadline; round++) {
    // Cancelled or finished by someone else meanwhile: stop.
    if (round > 0 && (await store.status(id)) !== "sending") break;
    const batch = await store.claimBatch(id, input.batchSize ?? CAMPAIGN_BATCH);
    if (!batch.length) break;
    await inParallel(batch, input.concurrency ?? CAMPAIGN_CONCURRENCY, async (recipient) => {
      try {
        const result = await store.deliver(id, recipient);
        await store.markSent(recipient.id, result.notificationId, new Date(now()));
        delivered++;
      } catch (error) {
        await store.markFailed(recipient.id, (error instanceof Error ? error.message : String(error)).slice(0, 300));
        failed++;
      }
    });
  }

  const remaining = await store.remaining(id);
  if (remaining === 0) await store.finish(id, new Date(now()));
  return { status: remaining === 0 ? "sent" : "sending", delivered, failed, remaining };
}
