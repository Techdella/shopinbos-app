import { escapeHtml, html, safeHref } from "../email/shell.ts";
import type { PlatformTopic } from "../email/preferences.ts";

// The lifecycle email catalog: every email Shopinbos sends its own users (sellers, suppliers, delivery partners,
// admins) because of where they are in their journey, not because of a single transaction. Welcome, onboarding
// nudges, activation tips, milestones, win-backs, anniversaries and weekly summaries.
//
// Pure (unit-tested in tests/lifecycle.test.mjs). Rules read a snapshot of the user's facts (facts.server.ts) and
// say whether they're due; planLifecycle picks at most one to send per evaluation; run.server.ts sends it through
// the shared email shell and logs it in LifecycleEmail so it never goes twice.
//
// Every rule is state-based with a window, so it is safe to evaluate at any time and as often as we like: on the
// hourly cron, and straight after an in-app event (sign-up, first sale, verification) via queueLifecycle.

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;
/** Africa/Lagos is UTC+1 all year (no daylight saving). */
const LAGOS_OFFSET = HOUR;

export type LifecycleRole = "seller" | "supplier" | "logistics_partner" | "admin";

export type Journey =
  /** Account status changes people need to hear about: verified, rejected, store live. Always sent. */
  | "account"
  /** The first email after sign-up. Always sent. */
  | "welcome"
  /** Celebrating a first or a round number. */
  | "milestone"
  /** Anniversaries and thank-yous. */
  | "loyalty"
  /** The next most useful thing to try, once the basics are done. */
  | "activation"
  /** Finishing setup in the first two weeks. */
  | "onboarding"
  /** Bringing people back after a quiet spell. */
  | "retention"
  /** The weekly recap (its own preference: weekly_summary). Sellers, suppliers and delivery partners get theirs from
   * src/lib/email/weekly-summary.server.ts; only admins get one from here. */
  | "summary";

/** Send order when several are due at once (one email per evaluation). */
export const JOURNEY_PRIORITY: Journey[] = ["account", "welcome", "milestone", "loyalty", "onboarding", "activation", "retention", "summary"];

/** Nudges: at most one per NUDGE_GAP, so nobody gets a pile of reminders on the same day. */
export const NUDGE_JOURNEYS: ReadonlySet<Journey> = new Set(["activation", "onboarding", "retention", "summary"]);
export const NUDGE_GAP = 20 * HOUR;

/** A user seen for the first time this long after sign-up is baselined (see planLifecycle). */
export const BASELINE_AFTER = 2 * DAY;

/** A failed send is retried this many times in all, at least an hour apart. */
export const MAX_ATTEMPTS = 3;

// ─── Facts ────────────────────────────────────────────────────────────────────

export interface SellerFacts {
  storeName: string;
  storeUrl: string;
  currency: string;
  live: boolean;
  products: number;
  payoutBank: boolean;
  /** Paid (or later) storefront orders, all time. */
  paidOrders: number;
  revenue: number;
  lastPaidOrderAt: number | null;
  /** Store products that come from a supplier (dropship). */
  dropshipProducts: number;
  deliveryBookings: number;
}

export interface SupplierFacts {
  businessName: string;
  verification: string;
  products: number;
  /** Published products (visible to sellers). */
  liveProducts: number;
  dropshipProducts: number;
  /** Dropship and wholesale orders, not rejected or cancelled. */
  orders: number;
  revenue: number;
  payoutAccount: boolean;
}

export interface LogisticsFacts {
  companyName: string;
  verification: string;
  coverageZones: number;
  priced: boolean;
  bookings: number;
  delivered: number;
  riders: number;
  payoutAccount: boolean;
}

export interface AdminFacts {
  pendingSuppliers: number;
  pendingLogistics: number;
  week: { sellers: number; suppliers: number; logistics: number; orders: number; gmv: number };
}

export interface LifecycleFacts {
  userId: string;
  role: LifecycleRole;
  firstName: string;
  email: string | null;
  createdAt: number;
  /** Last sign-in, store activity, profile edit or order, whichever is latest (null: never seen). */
  lastActiveAt: number | null;
  appUrl: string;
  seller?: SellerFacts | null;
  supplier?: SupplierFacts | null;
  logistics?: LogisticsFacts | null;
  admin?: AdminFacts | null;
}

/** A LifecycleEmail row, as the planner needs it. */
export interface SentEntry {
  key: string;
  rule: string;
  status: string;
  attempts: number;
  /** Last change (a retry is due an hour after a failure). */
  at: number;
}

export interface RuleContext {
  now: number;
  /** When a rule last went out (sent, or skipped/baselined: it "happened"), or null. */
  sentAt(ruleId: string): number | null;
}

export interface LifecycleContent {
  subject: string;
  heading: string;
  preheader: string;
  eyebrow: string;
  bodyHtml: string;
  cta: { label: string; url: string } | null;
}

export interface LifecycleRule {
  id: string;
  role: LifecycleRole;
  journey: Journey;
  /** One line for the catalog listing and logs. */
  summary: string;
  /** "notification" mail is account news (no unsubscribe, always sent); "lifecycle" honours the topic preference. */
  kind: "lifecycle" | "notification";
  topic: PlatformTopic | null;
  /** The occurrence key when due ("" for once-only rules), else null. */
  due(facts: LifecycleFacts, ctx: RuleContext): string | null;
  render(facts: LifecycleFacts, ctx: RuleContext): LifecycleContent;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ageDays = (f: LifecycleFacts, now: number) => (now - f.createdAt) / DAY;
const daysSince = (at: number | null | undefined, now: number) => (at == null ? Infinity : (now - at) / DAY);
const within = (value: number, from: number, to: number) => value >= from && value < to;
const url = (f: LifecycleFacts, path: string) => `${f.appUrl.replace(/\/+$/, "")}${path}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-NG")} ${n === 1 ? one : many}`;

export function money(amount: number, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString("en-NG")}`;
  }
}

/** "₦1M", "₦100k": round thresholds read better short. */
function shortMoney(amount: number, currency: string) {
  const symbol = money(0, currency).replace(/[\d.,\s]/g, "") || `${currency} `;
  if (amount >= 1_000_000_000) return `${symbol}${amount / 1_000_000_000}B`;
  if (amount >= 1_000_000) return `${symbol}${amount / 1_000_000}M`;
  if (amount >= 1_000) return `${symbol}${amount / 1_000}k`;
  return money(amount, currency);
}

/** YYYY-MM-DD in Lagos (occurrence keys for lapses). */
export function lagosDay(at: number) {
  return new Date(at + LAGOS_OFFSET).toISOString().slice(0, 10);
}

function isoWeek(lagos: Date) {
  const date = new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7; // Monday 0
  date.setUTCDate(date.getUTCDate() - day + 3); // the Thursday of this week decides its year
  const year = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/**
 * The weekly summary window: the seven days before this Monday 00:00 Lagos. Summaries go out from Monday 8am Lagos
 * until Wednesday (a later run catches anyone the nudge gap held back), keyed by this week so each goes once.
 */
export function summaryWindow(now: number) {
  const lagos = new Date(now + LAGOS_OFFSET);
  const weekday = (lagos.getUTCDay() + 6) % 7; // Monday 0
  const lagosMidnight = Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate());
  const end = lagosMidnight - weekday * DAY - LAGOS_OFFSET; // this Monday 00:00 Lagos, as UTC ms
  return {
    start: end - 7 * DAY,
    end,
    key: isoWeek(lagos),
    due: weekday <= 2 && (weekday > 0 || lagos.getUTCHours() >= 8),
  };
}

/** Whole years since sign-up, when the anniversary was in the last week. */
export function anniversary(createdAt: number, now: number): number | null {
  const start = new Date(createdAt);
  const today = new Date(now);
  let years = today.getUTCFullYear() - start.getUTCFullYear();
  const thisYear = Date.UTC(start.getUTCFullYear() + years, start.getUTCMonth(), start.getUTCDate(), start.getUTCHours());
  if (thisYear > now) years -= 1;
  if (years < 1) return null;
  const last = Date.UTC(start.getUTCFullYear() + years, start.getUTCMonth(), start.getUTCDate(), start.getUTCHours());
  return now - last < 7 * DAY ? years : null;
}

/** The band a count sits in: 60 orders with [10, 50, 100] is 50. Jumping 9 → 60 celebrates 50 only. */
export function band(value: number, thresholds: readonly number[]): number | null {
  let hit: number | null = null;
  for (const t of thresholds) if (value >= t) hit = t;
  return hit;
}

const a = (label: string, href: string) => `<a class="sib-link" href="${safeHref(href)}" style="color:#2E7E78">${escapeHtml(label)}</a>`;
const strongLine = (text: string) => `<p class="sib-ink" style="margin:0 0 8px;font-weight:700">${escapeHtml(text)}</p>`;
const signoff = (from = "The Shopinbos team") => html.small(`Questions? Just reply. A real person reads every email. ${from}`);

function checklist(items: Array<{ label: string; done: boolean }>) {
  return html.rows(items.map((item) => ({ label: item.label, value: item.done ? "Done" : "To do", muted: item.done })));
}

// ─── Shared rule shapes ───────────────────────────────────────────────────────

const ROLE_HOME: Record<LifecycleRole, string> = { seller: "/home", supplier: "/supplier", logistics_partner: "/logistics", admin: "/admin" };
const ROLE_PREFIX: Record<LifecycleRole, string> = { seller: "seller", supplier: "supplier", logistics_partner: "logistics", admin: "admin" };

function businessName(f: LifecycleFacts) {
  return f.seller?.storeName || f.supplier?.businessName || f.logistics?.companyName || "your business";
}

/** Two win-back emails per quiet spell: two weeks in, then six. Keyed by the day they were last active. */
function winbackRules(role: Exclude<LifecycleRole, "admin">): LifecycleRule[] {
  const prefix = ROLE_PREFIX[role];
  const last = (f: LifecycleFacts) => f.lastActiveAt ?? f.createdAt;
  const what: Record<typeof role, { short: string; ideas: string[]; path: string }> = {
    seller: {
      short: "your store",
      path: "/home",
      ideas: [
        "Send a campaign to past customers: a new arrival or a weekend discount",
        "Ask Peggy to reply to customers on WhatsApp while you're busy",
        "Add a trending product from the marketplace, no stock needed",
      ],
    },
    supplier: {
      short: "your supplier account",
      path: "/supplier",
      ideas: ["Update stock and prices so sellers see what's available today", "Answer open quote requests: fast replies win orders", "Turn on dropship for more products"],
    },
    logistics_partner: {
      short: "your delivery account",
      path: "/logistics",
      ideas: ["Check your coverage areas and prices are current", "Answer open delivery quotes quickly", "Add riders so you can take more bookings"],
    },
  };
  const copy = what[role];
  const make = (id: string, from: number, to: number, minAge: number, subject: (f: LifecycleFacts) => string, lead: (f: LifecycleFacts) => string): LifecycleRule => ({
    id: `${prefix}.${id}`,
    role,
    journey: "retention",
    summary: `Quiet for ${from} days: come back`,
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (ageDays(f, ctx.now) >= minAge && within(daysSince(last(f), ctx.now), from, to) ? lagosDay(last(f)) : null),
    render: (f) => ({
      subject: subject(f),
      heading: `Hi ${f.firstName},`,
      eyebrow: "We saved your spot",
      preheader: lead(f),
      bodyHtml: `${html.p(lead(f))}${strongLine("A few quick wins when you're back:")}${html.list(copy.ideas)}${signoff()}`,
      cta: { label: `Open ${copy.short}`, url: url(f, copy.path) },
    }),
  });
  return [
    make("winback_14", 14, 21, 21, (f) => `${businessName(f)} misses you`, (f) => `It's been two weeks since you were last on Shopinbos. ${businessName(f)} is right where you left it.`),
    make(
      "winback_45",
      45,
      60,
      45,
      (f) => `Still there, ${f.firstName}?`,
      (f) => `We haven't seen you in a while. Your account and everything in ${businessName(f)} is still here whenever you're ready.`,
    ),
  ];
}

function anniversaryRule(role: Exclude<LifecycleRole, "admin">, stats: (f: LifecycleFacts) => Array<{ label: string; value: string }>): LifecycleRule {
  const prefix = ROLE_PREFIX[role];
  return {
    id: `${prefix}.anniversary`,
    role,
    journey: "loyalty",
    summary: "Yearly thank-you with lifetime numbers",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => {
      const years = anniversary(f.createdAt, ctx.now);
      return years ? String(years) : null;
    },
    render: (f, ctx) => {
      const years = anniversary(f.createdAt, ctx.now) ?? 1;
      const span = plural(years, "year");
      return {
        subject: `${span} of ${businessName(f)} on Shopinbos`,
        heading: `Happy ${span}, ${f.firstName}`,
        eyebrow: "Anniversary",
        preheader: `Thank you for building ${businessName(f)} with us. Here's what you've done so far.`,
        bodyHtml: `${html.p(`${span} ago you joined Shopinbos. Thank you for building ${businessName(f)} with us. Here's what you've done since:`)}${html.rows(stats(f))}${html.p("Here's to the next one.")}${signoff()}`,
        cta: { label: "See your numbers", url: url(f, `${ROLE_HOME[role]}/analytics`) },
      };
    },
  };
}

function milestoneRules(input: {
  role: LifecycleRole;
  id: string;
  thresholds: readonly number[];
  count: (f: LifecycleFacts) => number | null;
  render: (f: LifecycleFacts, n: number) => Omit<LifecycleContent, "preheader"> & { preheader?: string };
}): LifecycleRule[] {
  return input.thresholds.map((n) => ({
    id: `${ROLE_PREFIX[input.role]}.${input.id}_${n}`,
    role: input.role,
    journey: "milestone" as const,
    summary: `Reached ${n.toLocaleString("en-NG")} ${input.id}`,
    kind: "lifecycle" as const,
    topic: "lifecycle" as const,
    due: (f: LifecycleFacts) => {
      const value = input.count(f);
      return value != null && band(value, input.thresholds) === n ? "" : null;
    },
    render: (f: LifecycleFacts) => {
      const content = input.render(f, n);
      return { ...content, preheader: content.preheader ?? content.heading };
    },
  }));
}

// ─── Sellers ──────────────────────────────────────────────────────────────────

const ORDER_MILESTONES = [10, 50, 100, 250, 500, 1000, 5000] as const;
const REVENUE_MILESTONES_NGN = [100_000, 1_000_000, 10_000_000, 100_000_000] as const;
const DELIVERY_MILESTONES = [10, 50, 100, 250, 500, 1000, 5000] as const;

const s = (f: LifecycleFacts) => f.seller!;

const SELLER_RULES: LifecycleRule[] = [
  {
    id: "seller.welcome",
    role: "seller",
    journey: "welcome",
    summary: "Welcome and the three steps to a first sale",
    kind: "notification",
    topic: null,
    due: (f, ctx) => (ageDays(f, ctx.now) < 2 ? "" : null),
    render: (f) => ({
      subject: `Welcome to Shopinbos, ${f.firstName}`,
      heading: `Welcome to Shopinbos, ${f.firstName}`,
      eyebrow: "Welcome",
      preheader: `${s(f).storeName} is set up. Here's the fastest way to your first sale.`,
      bodyHtml: `${html.p(`You're in. ${s(f).storeName} is set up and ready for you to make it yours. Here's the fastest way to your first sale:`)}${html.list([
        "Answer a few questions and Rex, our AI store builder, designs your store",
        "Add products: your own, or from verified suppliers with no stock to buy",
        "Publish, then share your link on WhatsApp, Instagram and TikTok",
      ])}${signoff()}`,
      cta: { label: "Start setting up", url: url(f, "/home/start") },
    }),
  },
  {
    id: "seller.store_live",
    role: "seller",
    journey: "account",
    summary: "Store published: share it",
    kind: "notification",
    topic: null,
    due: (f) => (s(f).live ? "" : null),
    render: (f) => ({
      subject: `${s(f).storeName} is live`,
      heading: `${s(f).storeName} is live`,
      eyebrow: "You launched",
      preheader: "Your store is open for orders. Now let people know.",
      bodyHtml: `${html.p("Your store is open and taking orders at:")}${html.raw(a(s(f).storeUrl.replace(/^https?:\/\//, ""), s(f).storeUrl))}${strongLine("Get your first visitors today:")}${html.list([
        "Post the link on your WhatsApp status and in your groups",
        "Put it in your Instagram and TikTok bio",
        "Send it to five customers who've bought from you before",
      ])}${signoff()}`,
      cta: { label: "View your store", url: s(f).storeUrl },
    }),
  },
  {
    id: "seller.first_sale",
    role: "seller",
    journey: "milestone",
    summary: "First paid order",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f) => (s(f).paidOrders >= 1 ? "" : null),
    render: (f) => ({
      subject: `Your first sale on ${s(f).storeName}`,
      heading: "You made your first sale",
      eyebrow: "Milestone",
      preheader: "The first one is the hardest. Here's how to turn it into the next ten.",
      bodyHtml: `${html.p(`Someone just bought from ${s(f).storeName}. The first one is the hardest, and you've done it.`)}${strongLine("Turn one order into the next ten:")}${html.list([
        "Ship fast and keep the buyer posted: it's what gets you repeat orders",
        "Once it's delivered, ask for a review (Shopinbos can send the request for you)",
        "Book delivery through Shopinbos to compare prices from verified partners",
      ])}${signoff()}`,
      cta: { label: "See the order", url: url(f, "/home/orders") },
    }),
  },
  ...milestoneRules({
    role: "seller",
    id: "orders",
    thresholds: ORDER_MILESTONES,
    count: (f) => f.seller?.paidOrders ?? null,
    render: (f, n) => ({
      subject: `${n.toLocaleString("en-NG")} orders on ${s(f).storeName}`,
      heading: `${n.toLocaleString("en-NG")} orders`,
      eyebrow: "Milestone",
      preheader: `${s(f).storeName} just passed ${n.toLocaleString("en-NG")} paid orders.`,
      bodyHtml: `${html.p(`${s(f).storeName} just passed ${n.toLocaleString("en-NG")} paid orders. That's ${n.toLocaleString("en-NG")} times someone chose you.`)}${html.rows([
        { label: "Paid orders", value: s(f).paidOrders.toLocaleString("en-NG") },
        { label: "Sales to date", value: money(s(f).revenue, s(f).currency) },
      ])}${html.p("Your best customers are the ones who already bought. A thank-you campaign with a small discount is the easiest repeat order you'll get.")}${signoff()}`,
      cta: { label: "Thank your customers", url: url(f, "/home/marketing/campaigns") },
    }),
  }),
  ...milestoneRules({
    role: "seller",
    id: "revenue",
    thresholds: REVENUE_MILESTONES_NGN,
    count: (f) => (f.seller && f.seller.currency === "NGN" ? f.seller.revenue : null),
    render: (f, n) => ({
      subject: `${s(f).storeName} just passed ${shortMoney(n, "NGN")} in sales`,
      heading: `${shortMoney(n, "NGN")} in sales`,
      eyebrow: "Milestone",
      preheader: `You've sold more than ${money(n, "NGN")} on Shopinbos.`,
      bodyHtml: `${html.p(`${s(f).storeName} has now sold more than ${money(n, "NGN")} on Shopinbos. Well done.`)}${html.rows([
        { label: "Sales to date", value: money(s(f).revenue, "NGN") },
        { label: "Paid orders", value: s(f).paidOrders.toLocaleString("en-NG") },
      ])}${signoff()}`,
      cta: { label: "See your analytics", url: url(f, "/home/analytics") },
    }),
  }),
  anniversaryRule("seller", (f) => [
    { label: "Paid orders", value: (f.seller?.paidOrders ?? 0).toLocaleString("en-NG") },
    { label: "Sales", value: money(f.seller?.revenue ?? 0, f.seller?.currency) },
    { label: "Products", value: (f.seller?.products ?? 0).toLocaleString("en-NG") },
  ]),
  {
    id: "seller.payout_setup",
    role: "seller",
    journey: "activation",
    summary: "Live store without a payout bank",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (s(f).live && !s(f).payoutBank && daysSince(ctx.sentAt("seller.store_live"), ctx.now) >= 1 ? "" : null),
    render: (f) => ({
      subject: "Where should we send your money?",
      heading: "Add your payout bank",
      eyebrow: "Get paid",
      preheader: "Add your bank so card and transfer payments reach you.",
      bodyHtml: `${html.p(`${s(f).storeName} is live, but there's no bank account for your payouts yet. Add one now so money from card and transfer orders reaches you without delay.`)}${html.small("It takes a minute: your bank, account number, done. We check the account name with your bank.")}`,
      cta: { label: "Add payout bank", url: url(f, "/home/payouts") },
    }),
  },
  {
    id: "seller.first_sale_tips",
    role: "seller",
    journey: "activation",
    summary: "Live a week, no sale yet: how to get the first",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (s(f).live && s(f).paidOrders === 0 && within(daysSince(ctx.sentAt("seller.store_live"), ctx.now), 7, 21) ? "" : null),
    render: (f) => ({
      subject: "How sellers get their first order",
      heading: "Getting your first order",
      eyebrow: "Tips",
      preheader: "What works for sellers in their first weeks.",
      bodyHtml: `${html.p(`${s(f).storeName} has been live for a week. Most first orders come from people who already know you, so start there:`)}${html.list([
        "Share one product a day on your WhatsApp status, with the link",
        "Message ten past customers or friends directly: personal beats posting",
        "Offer a launch discount code for your first buyers",
        "Add a few trending products from verified suppliers",
        "Switch on Peggy to answer questions on WhatsApp while you sleep",
      ])}${signoff()}`,
      cta: { label: "Create a launch discount", url: url(f, "/home/discounts") },
    }),
  },
  {
    id: "seller.delivery_intro",
    role: "seller",
    journey: "activation",
    summary: "Selling, never booked delivery: meet logistics partners",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (s(f).paidOrders >= 1 && s(f).deliveryBookings === 0 && within(daysSince(ctx.sentAt("seller.first_sale"), ctx.now), 2, 30) ? "" : null),
    render: (f) => ({
      subject: "Ship your orders without the back-and-forth",
      heading: "Book delivery in a few taps",
      eyebrow: "Delivery",
      preheader: "Compare verified delivery partners and track every order.",
      bodyHtml: `${html.p("Now that orders are coming in, let Shopinbos handle delivery. Compare prices from verified delivery partners in your city, book in a few taps and track every package, with pay-on-delivery where you need it.")}${signoff()}`,
      cta: { label: "Find delivery partners", url: url(f, "/marketplace/logistics") },
    }),
  },
  {
    id: "seller.marketplace_intro",
    role: "seller",
    journey: "activation",
    summary: "Few products, no dropship: try the supplier marketplace",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (s(f).products >= 1 && s(f).products < 5 && s(f).dropshipProducts === 0 && within(ageDays(f, ctx.now), 6, 14) ? "" : null),
    render: (f) => ({
      subject: "Grow your catalogue without buying stock",
      heading: "Sell more without buying stock",
      eyebrow: "Find products",
      preheader: "Add products from verified suppliers. They ship, you earn the margin.",
      bodyHtml: `${html.p("Verified suppliers on Shopinbos let you sell their products in your store. Add them in one tap, set your price, and when a customer orders, the supplier ships straight to them. You keep the margin.")}${html.list(["No stock to buy or store", "Suggested retail prices, so you know your margin", "Wholesale and quotes when you want to buy in bulk"])}${signoff()}`,
      cta: { label: "Browse products", url: url(f, "/marketplace") },
    }),
  },
  {
    id: "seller.setup_checklist",
    role: "seller",
    journey: "onboarding",
    summary: "Day 1, not live: what's left",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (!s(f).live && within(ageDays(f, ctx.now), 1, 3) ? "" : null),
    render: (f) => {
      const steps = [
        { label: "Add a product", done: s(f).products > 0 },
        { label: "Add your payout bank", done: s(f).payoutBank },
        { label: "Publish your store", done: s(f).live },
      ];
      const left = steps.filter((step) => !step.done).length;
      return {
        subject: `${plural(left, "step")} to get ${s(f).storeName} live`,
        heading: `${s(f).storeName} is almost ready`,
        eyebrow: "Finish setting up",
        preheader: `${plural(left, "step")} left before you can take orders.`,
        bodyHtml: `${html.p(`You're ${plural(left, "step")} from taking orders. Here's where ${s(f).storeName} stands:`)}${checklist(steps)}${html.small("Stuck on design? Rex can build the whole store from a few answers.")}`,
        cta: { label: "Finish setting up", url: url(f, "/home/start") },
      };
    },
  },
  {
    id: "seller.first_product",
    role: "seller",
    journey: "onboarding",
    summary: "Day 3, no products",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (s(f).products === 0 && within(ageDays(f, ctx.now), 3, 6) ? "" : null),
    render: (f) => ({
      subject: "Add your first product (no stock needed)",
      heading: "Add your first product",
      eyebrow: "Finish setting up",
      preheader: "Two ways to fill your store today.",
      bodyHtml: `${html.p(`${s(f).storeName} needs something to sell. Two ways to start:`)}${strongLine("Sell your own products")}${html.p("A photo, a name and a price is enough. Add the rest later.")}${strongLine("Sell from verified suppliers")}${html.raw(`Pick products from the ${a("marketplace", url(f, "/marketplace"))}. The supplier ships to your customer and you keep the margin.`)}`,
      cta: { label: "Add a product", url: url(f, "/home/inventory") },
    }),
  },
  {
    id: "seller.publish_store",
    role: "seller",
    journey: "onboarding",
    summary: "Products but not published",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (s(f).products > 0 && !s(f).live && within(ageDays(f, ctx.now), 5, 9) ? "" : null),
    render: (f) => ({
      subject: "Your products are ready. Is your store?",
      heading: "Publish your store",
      eyebrow: "Finish setting up",
      preheader: `${plural(s(f).products, "product")} waiting for customers.`,
      bodyHtml: `${html.p(`You've added ${plural(s(f).products, "product")}, but ${s(f).storeName} isn't published yet, so customers can't see them. Check how it looks and publish when you're happy. You can keep changing it after.`)}${signoff()}`,
      cta: { label: "Review and publish", url: url(f, "/home/editor") },
    }),
  },
  {
    id: "seller.rex_help",
    role: "seller",
    journey: "onboarding",
    summary: "Day 9, still not live: offer Rex and a human",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (!s(f).live && within(ageDays(f, ctx.now), 9, 15) ? "" : null),
    render: (f) => ({
      subject: `Want help finishing ${s(f).storeName}?`,
      heading: "Let's finish it together",
      eyebrow: "We can help",
      preheader: "Rex can build it for you, or reply and we'll help.",
      bodyHtml: `${html.p(`${s(f).storeName} isn't live yet. That's normal, and it doesn't have to take long. Tell Rex what you sell and it builds the pages, writes the copy and picks the colours. You review and publish.`)}${html.p("Prefer a person? Reply to this email with what's holding you up and we'll help you get it done.")}`,
      cta: { label: "Build it with Rex", url: url(f, "/studio") },
    }),
  },
  {
    id: "seller.sales_slump",
    role: "seller",
    journey: "retention",
    summary: "Regular seller, three weeks without an order",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (s(f).paidOrders >= 3 && within(daysSince(s(f).lastPaidOrderAt, ctx.now), 21, 35) ? lagosDay(s(f).lastPaidOrderAt!) : null),
    render: (f) => ({
      subject: "Three weeks since your last order. Let's change that.",
      heading: "Let's get orders moving again",
      eyebrow: "Ideas",
      preheader: "Quick ways sellers bring customers back.",
      bodyHtml: `${html.p(`${s(f).storeName} hasn't had an order in three weeks. Quiet spells happen. These usually help:`)}${html.list([
        "Email your past customers about something new, or a limited-time discount",
        "Restock and feature your best sellers on the homepage",
        "Post on your WhatsApp status every day this week",
        "Add a trending product from the marketplace",
      ])}${signoff()}`,
      cta: { label: "Start a campaign", url: url(f, "/home/marketing/campaigns") },
    }),
  },
  ...winbackRules("seller"),
];

// ─── Suppliers ────────────────────────────────────────────────────────────────

const sup = (f: LifecycleFacts) => f.supplier!;

const SUPPLIER_RULES: LifecycleRule[] = [
  {
    id: "supplier.welcome",
    role: "supplier",
    journey: "welcome",
    summary: "Welcome and how sellers find you",
    kind: "notification",
    topic: null,
    due: (f, ctx) => (ageDays(f, ctx.now) < 2 ? "" : null),
    render: (f) => ({
      subject: `Welcome to Shopinbos, ${f.firstName}`,
      heading: `Welcome to Shopinbos, ${f.firstName}`,
      eyebrow: "Welcome",
      preheader: "Thousands of online sellers are looking for products like yours.",
      bodyHtml: `${html.p(`${sup(f).businessName} is on Shopinbos, where online sellers across Africa find products to stock and dropship. Three steps to your first order:`)}${html.list([
        "Verify your business so sellers can see and trust you",
        "Add products with wholesale prices and minimum order quantities",
        "Turn on dropship: sellers list your products and you ship to their customers",
      ])}${signoff()}`,
      cta: { label: "Open your supplier portal", url: url(f, "/supplier") },
    }),
  },
  {
    id: "supplier.verified",
    role: "supplier",
    journey: "account",
    summary: "Verification approved",
    kind: "notification",
    topic: null,
    due: (f) => (sup(f).verification === "verified" ? "" : null),
    render: (f) => ({
      subject: `${sup(f).businessName} is verified on Shopinbos`,
      heading: "You're verified",
      eyebrow: "Verification",
      preheader: "Sellers can now find you, order and ask for quotes.",
      bodyHtml: `${html.p(`Good news: ${sup(f).businessName} is verified. Your profile and published products now show in the Shopinbos marketplace with a verified badge, and sellers can order and ask you for quotes.`)}${
        sup(f).liveProducts === 0 ? html.p("Next: publish your first products so sellers have something to order.") : ""
      }${signoff()}`,
      cta: sup(f).liveProducts === 0 ? { label: "Add products", url: url(f, "/supplier/products/new") } : { label: "Open your portal", url: url(f, "/supplier") },
    }),
  },
  {
    id: "supplier.verification_rejected",
    role: "supplier",
    journey: "account",
    summary: "Verification not approved",
    kind: "notification",
    topic: null,
    due: (f) => (sup(f).verification === "rejected" ? "" : null),
    render: (f) => ({
      subject: `We couldn't verify ${sup(f).businessName} yet`,
      heading: "Your verification needs another look",
      eyebrow: "Verification",
      preheader: "Check your documents and send them again.",
      bodyHtml: `${html.p(`We couldn't verify ${sup(f).businessName} with the documents we have. This is usually a blurry photo, an expired document, or a name that doesn't match your registration.`)}${html.p("Check what's on file, upload clearer copies, and we'll review again. Reply to this email if you're not sure what's wrong.")}`,
      cta: { label: "Review my documents", url: url(f, "/supplier/verification") },
    }),
  },
  {
    id: "supplier.first_order",
    role: "supplier",
    journey: "milestone",
    summary: "First order from a seller",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f) => (sup(f).orders >= 1 ? "" : null),
    render: (f) => ({
      subject: `${sup(f).businessName} got its first Shopinbos order`,
      heading: "Your first order",
      eyebrow: "Milestone",
      preheader: "Ship it well and sellers come back.",
      bodyHtml: `${html.p("A seller just ordered from you. Sellers re-order from suppliers who are quick and reliable, so:")}${html.list([
        "Accept the order and ship within your stated processing time",
        "Add the tracking code as soon as it leaves",
        "Keep your stock numbers current so you never sell what you don't have",
      ])}${signoff()}`,
      cta: { label: "See the order", url: url(f, "/supplier/orders") },
    }),
  },
  ...milestoneRules({
    role: "supplier",
    id: "orders",
    thresholds: ORDER_MILESTONES,
    count: (f) => f.supplier?.orders ?? null,
    render: (f, n) => ({
      subject: `${n.toLocaleString("en-NG")} orders for ${sup(f).businessName}`,
      heading: `${n.toLocaleString("en-NG")} orders`,
      eyebrow: "Milestone",
      preheader: `Sellers have now ordered from you ${n.toLocaleString("en-NG")} times.`,
      bodyHtml: `${html.p(`Sellers have now ordered from ${sup(f).businessName} ${n.toLocaleString("en-NG")} times on Shopinbos.`)}${html.rows([
        { label: "Orders", value: sup(f).orders.toLocaleString("en-NG") },
        { label: "Order value", value: money(sup(f).revenue) },
      ])}${signoff()}`,
      cta: { label: "See your analytics", url: url(f, "/supplier/analytics") },
    }),
  }),
  anniversaryRule("supplier", (f) => [
    { label: "Orders", value: (f.supplier?.orders ?? 0).toLocaleString("en-NG") },
    { label: "Order value", value: money(f.supplier?.revenue ?? 0) },
    { label: "Published products", value: (f.supplier?.liveProducts ?? 0).toLocaleString("en-NG") },
  ]),
  {
    id: "supplier.payout_setup",
    role: "supplier",
    journey: "activation",
    summary: "Has orders, no payout account",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (sup(f).orders >= 1 && !sup(f).payoutAccount && daysSince(ctx.sentAt("supplier.first_order"), ctx.now) >= 1 ? "" : null),
    render: (f) => ({
      subject: "Add your payout account",
      heading: "Where should we send your money?",
      eyebrow: "Get paid",
      preheader: "Add a bank account to receive payment for your orders.",
      bodyHtml: html.p(`${sup(f).businessName} has orders but no payout account yet. Add your bank account so you're paid for dropship orders without delay.`),
      cta: { label: "Add payout account", url: url(f, "/supplier/payouts") },
    }),
  },
  {
    id: "supplier.dropship_tip",
    role: "supplier",
    journey: "activation",
    summary: "Products live, dropship off",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (sup(f).liveProducts > 0 && sup(f).dropshipProducts === 0 && within(ageDays(f, ctx.now), 5, 14) ? "" : null),
    render: (f) => ({
      subject: "Let sellers sell your products for you",
      heading: "Turn on dropship",
      eyebrow: "Grow",
      preheader: "Sellers list your products; you ship to their customers.",
      bodyHtml: `${html.p("With dropship on, any seller on Shopinbos can add your products to their store. When their customer orders, you get the order with the delivery address and ship it. You're paid your wholesale price; the seller keeps their margin.")}${html.p("It's the fastest way to get your products in front of thousands of buyers without a single ad.")}`,
      cta: { label: "Turn on dropship", url: url(f, "/supplier/products") },
    }),
  },
  {
    id: "supplier.no_orders",
    role: "supplier",
    journey: "activation",
    summary: "Verified with products, two weeks without an order",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (sup(f).verification === "verified" && sup(f).liveProducts > 0 && sup(f).orders === 0 && within(ageDays(f, ctx.now), 14, 28) ? "" : null),
    render: (f) => ({
      subject: "What gets suppliers their first order",
      heading: "Getting your first order",
      eyebrow: "Tips",
      preheader: "Small changes that make sellers pick you.",
      bodyHtml: `${html.p(`${sup(f).businessName} is verified and live, but no seller has ordered yet. What sellers look for:`)}${html.list([
        "Clear photos on a plain background, several per product",
        "A suggested retail price with room for the seller's margin",
        "Low minimum order quantities and samples",
        "Fast replies to quote requests (aim for the same day)",
      ])}${signoff()}`,
      cta: { label: "Improve my products", url: url(f, "/supplier/products") },
    }),
  },
  {
    id: "supplier.first_product",
    role: "supplier",
    journey: "onboarding",
    summary: "Day 1, no products",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (sup(f).products === 0 && within(ageDays(f, ctx.now), 1, 5) ? "" : null),
    render: (f) => ({
      subject: "Add your first product for sellers",
      heading: "Add your first product",
      eyebrow: "Finish setting up",
      preheader: "Sellers can't order what they can't see.",
      bodyHtml: html.p(`${sup(f).businessName} doesn't have any products yet. Add your first: photos, your wholesale price, a suggested retail price and your minimum order. It takes a few minutes.`),
      cta: { label: "Add a product", url: url(f, "/supplier/products/new") },
    }),
  },
  {
    id: "supplier.publish_products",
    role: "supplier",
    journey: "onboarding",
    summary: "Products in draft, none published",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (sup(f).products > 0 && sup(f).liveProducts === 0 && within(ageDays(f, ctx.now), 2, 10) ? "" : null),
    render: (f) => ({
      subject: "Your products aren't visible to sellers yet",
      heading: "Publish your products",
      eyebrow: "Finish setting up",
      preheader: `${plural(sup(f).products, "product")} saved but not published.`,
      bodyHtml: html.p(`You've added ${plural(sup(f).products, "product")}, but none are published, so sellers can't find them. Review and publish them when they're ready.`),
      cta: { label: "Review products", url: url(f, "/supplier/products") },
    }),
  },
  ...winbackRules("supplier"),
];

// ─── Delivery partners ────────────────────────────────────────────────────────

const lp = (f: LifecycleFacts) => f.logistics!;

const LOGISTICS_RULES: LifecycleRule[] = [
  {
    id: "logistics.welcome",
    role: "logistics_partner",
    journey: "welcome",
    summary: "Welcome and how sellers book you",
    kind: "notification",
    topic: null,
    due: (f, ctx) => (ageDays(f, ctx.now) < 2 ? "" : null),
    render: (f) => ({
      subject: `Welcome to Shopinbos, ${f.firstName}`,
      heading: `Welcome to Shopinbos, ${f.firstName}`,
      eyebrow: "Welcome",
      preheader: "Online sellers need reliable deliveries. Here's how they'll book you.",
      bodyHtml: `${html.p(`${lp(f).companyName} is on Shopinbos, where online sellers book deliveries for their orders. Three steps to your first booking:`)}${html.list([
        "Verify your company so sellers can trust you",
        "Set your coverage areas and prices",
        "Add your riders so you can take bookings and track them",
      ])}${signoff()}`,
      cta: { label: "Open your partner portal", url: url(f, "/logistics") },
    }),
  },
  {
    id: "logistics.verified",
    role: "logistics_partner",
    journey: "account",
    summary: "Verification approved",
    kind: "notification",
    topic: null,
    due: (f) => (lp(f).verification === "verified" ? "" : null),
    render: (f) => ({
      subject: `${lp(f).companyName} is verified on Shopinbos`,
      heading: "You're verified",
      eyebrow: "Verification",
      preheader: "Sellers can now find and book you.",
      bodyHtml: html.p(`${lp(f).companyName} is verified. You now show in the Shopinbos delivery marketplace with a verified badge, and sellers in your coverage areas can request quotes and book you.`),
      cta: lp(f).coverageZones === 0 ? { label: "Set your coverage", url: url(f, "/logistics/coverage") } : { label: "Open your portal", url: url(f, "/logistics") },
    }),
  },
  {
    id: "logistics.verification_rejected",
    role: "logistics_partner",
    journey: "account",
    summary: "Verification not approved",
    kind: "notification",
    topic: null,
    due: (f) => (lp(f).verification === "rejected" ? "" : null),
    render: (f) => ({
      subject: `We couldn't verify ${lp(f).companyName} yet`,
      heading: "Your verification needs another look",
      eyebrow: "Verification",
      preheader: "Check your documents and send them again.",
      bodyHtml: `${html.p(`We couldn't verify ${lp(f).companyName} with the documents we have. This is usually a blurry photo, an expired document, or a name that doesn't match your registration.`)}${html.p("Upload clearer copies and we'll review again. Reply to this email if you're not sure what's wrong.")}`,
      cta: { label: "Review my documents", url: url(f, "/logistics/verification") },
    }),
  },
  {
    id: "logistics.first_booking",
    role: "logistics_partner",
    journey: "milestone",
    summary: "First booking",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f) => (lp(f).bookings >= 1 ? "" : null),
    render: (f) => ({
      subject: `${lp(f).companyName} got its first Shopinbos booking`,
      heading: "Your first booking",
      eyebrow: "Milestone",
      preheader: "Deliver it well and sellers book you again.",
      bodyHtml: `${html.p("A seller just booked you. Sellers stick with partners who keep them informed, so:")}${html.list([
        "Confirm the booking and assign a rider",
        "Update the status at pickup, in transit and delivery",
        "Collect proof of delivery (and the cash, for pay-on-delivery orders)",
      ])}${signoff()}`,
      cta: { label: "See the booking", url: url(f, "/logistics/bookings") },
    }),
  },
  ...milestoneRules({
    role: "logistics_partner",
    id: "deliveries",
    thresholds: DELIVERY_MILESTONES,
    count: (f) => f.logistics?.delivered ?? null,
    render: (f, n) => ({
      subject: `${n.toLocaleString("en-NG")} deliveries completed`,
      heading: `${n.toLocaleString("en-NG")} deliveries`,
      eyebrow: "Milestone",
      preheader: `${lp(f).companyName} has completed ${n.toLocaleString("en-NG")} Shopinbos deliveries.`,
      bodyHtml: `${html.p(`${lp(f).companyName} has now completed ${n.toLocaleString("en-NG")} deliveries for Shopinbos sellers. Thank you for getting their orders there.`)}${html.rows([
        { label: "Delivered", value: lp(f).delivered.toLocaleString("en-NG") },
        { label: "Bookings", value: lp(f).bookings.toLocaleString("en-NG") },
      ])}${signoff()}`,
      cta: { label: "See your analytics", url: url(f, "/logistics/analytics") },
    }),
  }),
  anniversaryRule("logistics_partner", (f) => [
    { label: "Bookings", value: (f.logistics?.bookings ?? 0).toLocaleString("en-NG") },
    { label: "Delivered", value: (f.logistics?.delivered ?? 0).toLocaleString("en-NG") },
  ]),
  {
    id: "logistics.add_riders",
    role: "logistics_partner",
    journey: "activation",
    summary: "Taking bookings with no riders added",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (lp(f).bookings >= 1 && lp(f).riders === 0 && daysSince(ctx.sentAt("logistics.first_booking"), ctx.now) >= 1 ? "" : null),
    render: (f) => ({
      subject: "Add your riders to Shopinbos",
      heading: "Add your riders",
      eyebrow: "Grow",
      preheader: "Assign bookings and let riders update deliveries from their phone.",
      bodyHtml: html.p("Add your riders so you can assign bookings to them. They get the pickup and delivery details on their phone, update the status as they go, and capture proof of delivery and cash collected. Sellers see it all live."),
      cta: { label: "Add riders", url: url(f, "/logistics/couriers") },
    }),
  },
  {
    id: "logistics.payout_setup",
    role: "logistics_partner",
    journey: "activation",
    summary: "Has bookings, no payout account",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (lp(f).bookings >= 1 && !lp(f).payoutAccount && daysSince(ctx.sentAt("logistics.first_booking"), ctx.now) >= 2 ? "" : null),
    render: (f) => ({
      subject: "Add your payout account",
      heading: "Where should we send your money?",
      eyebrow: "Get paid",
      preheader: "Add a bank account to receive delivery fees.",
      bodyHtml: html.p(`${lp(f).companyName} is taking bookings but has no payout account yet. Add your bank account so delivery fees and cash remittances reach you without delay.`),
      cta: { label: "Add payout account", url: url(f, "/logistics/payouts") },
    }),
  },
  {
    id: "logistics.no_bookings",
    role: "logistics_partner",
    journey: "activation",
    summary: "Verified, two weeks without a booking",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => (lp(f).verification === "verified" && lp(f).bookings === 0 && within(ageDays(f, ctx.now), 14, 28) ? "" : null),
    render: (f) => ({
      subject: "What gets delivery partners booked",
      heading: "Getting your first booking",
      eyebrow: "Tips",
      preheader: "Small changes that make sellers pick you.",
      bodyHtml: `${html.p(`${lp(f).companyName} is verified but hasn't been booked yet. What sellers look at:`)}${html.list([
        "Coverage: every area you can reliably reach",
        "Clear prices, so sellers can compare without asking",
        "A profile with your logo, vehicle types and delivery speed",
        "Fast answers to delivery quote requests",
      ])}${signoff()}`,
      cta: { label: "Update my profile", url: url(f, "/logistics/profile") },
    }),
  },
  {
    id: "logistics.coverage",
    role: "logistics_partner",
    journey: "onboarding",
    summary: "Day 1, no coverage or prices",
    kind: "lifecycle",
    topic: "lifecycle",
    due: (f, ctx) => ((lp(f).coverageZones === 0 || !lp(f).priced) && within(ageDays(f, ctx.now), 1, 6) ? "" : null),
    render: (f) => {
      const zones = lp(f).coverageZones > 0;
      return {
        subject: zones ? "Set your delivery prices" : "Where do you deliver?",
        heading: zones ? "Set your prices" : "Set your coverage areas",
        eyebrow: "Finish setting up",
        preheader: "Sellers only see partners who cover their area.",
        bodyHtml: html.p(
          zones
            ? "Your coverage is set, but there are no prices yet. Add them so sellers can compare and book without waiting for a quote."
            : `Sellers only see delivery partners who cover their area. Tell us where ${lp(f).companyName} delivers, and your prices, so you show up when they book.`,
        ),
        cta: zones ? { label: "Set prices", url: url(f, "/logistics/pricing") } : { label: "Set coverage", url: url(f, "/logistics/coverage") },
      };
    },
  },
  ...winbackRules("logistics_partner"),
];

// ─── Admins ───────────────────────────────────────────────────────────────────

const ADMIN_RULES: LifecycleRule[] = [
  {
    id: "admin.welcome",
    role: "admin",
    journey: "welcome",
    summary: "Admin access granted: where things are",
    kind: "notification",
    topic: null,
    due: (f, ctx) => (ageDays(f, ctx.now) < 2 ? "" : null),
    render: (f) => ({
      subject: "You're a Shopinbos admin",
      heading: `Welcome, ${f.firstName}`,
      eyebrow: "Admin",
      preheader: "Your admin access is set up.",
      bodyHtml: `${html.p("Your Shopinbos admin access is set up. From the admin panel you can:")}${html.list([
        "Review and verify suppliers and delivery partners",
        "Moderate supplier products and the marketplace catalogue",
        "Look up users and orders, and answer support tickets",
      ])}${html.small("If you didn't expect admin access, tell the team straight away.")}`,
      cta: { label: "Open the admin panel", url: url(f, "/admin") },
    }),
  },
  {
    id: "admin.weekly_summary",
    role: "admin",
    journey: "summary",
    summary: "Monday platform recap and review queue",
    kind: "lifecycle",
    topic: "weekly_summary",
    due: (f, ctx) => {
      const window = summaryWindow(ctx.now);
      return window.due && f.admin ? window.key : null;
    },
    render: (f) => {
      const ad = f.admin!;
      const queue = ad.pendingSuppliers + ad.pendingLogistics;
      return {
        subject: `Shopinbos last week: ${plural(ad.week.sellers, "new seller")}, ${plural(ad.week.orders, "order")}`,
        heading: "The platform last week",
        eyebrow: "Admin · weekly summary",
        preheader: `${plural(queue, "verification")} waiting for review.`,
        bodyHtml: `${html.rows([
          { label: "New sellers", value: ad.week.sellers.toLocaleString("en-NG") },
          { label: "New suppliers", value: ad.week.suppliers.toLocaleString("en-NG") },
          { label: "New delivery partners", value: ad.week.logistics.toLocaleString("en-NG") },
          { label: "Paid storefront orders", value: ad.week.orders.toLocaleString("en-NG") },
          { label: "Order value", value: money(ad.week.gmv) },
        ])}${strongLine("Waiting for review")}${html.rows([
          { label: "Suppliers to verify", value: ad.pendingSuppliers.toLocaleString("en-NG") },
          { label: "Delivery partners to verify", value: ad.pendingLogistics.toLocaleString("en-NG") },
        ])}`,
        cta: { label: "Open the dashboard", url: url(f, "/admin/dashboard") },
      };
    },
  },
];

export const LIFECYCLE_RULES: readonly LifecycleRule[] = [...SELLER_RULES, ...SUPPLIER_RULES, ...LOGISTICS_RULES, ...ADMIN_RULES];

export function lifecycleRule(id: string) {
  return LIFECYCLE_RULES.find((rule) => rule.id === id) ?? null;
}

// ─── Planning ─────────────────────────────────────────────────────────────────

export function occurrenceKey(rule: LifecycleRule, occurrence: string) {
  return occurrence ? `${rule.id}:${occurrence}` : rule.id;
}

/** Whether a logged row means "don't send this key again" (a failed send is retried, up to MAX_ATTEMPTS). */
export function isSettled(entry: SentEntry, now: number) {
  if (entry.status !== "failed") return true;
  return entry.attempts >= MAX_ATTEMPTS || now - entry.at < HOUR;
}

function hasRoleFacts(facts: LifecycleFacts) {
  if (facts.role === "seller") return Boolean(facts.seller);
  if (facts.role === "supplier") return Boolean(facts.supplier);
  if (facts.role === "logistics_partner") return Boolean(facts.logistics);
  return Boolean(facts.admin);
}

export interface LifecyclePlan {
  /** First look at an account older than BASELINE_AFTER: record `baseline` (and BASELINE_KEY), send nothing. */
  baselined: boolean;
  /** The one email to send now, if any. */
  send: { rule: LifecycleRule; key: string; retry: boolean } | null;
  /**
   * Keys to record without sending. First evaluation of an account older than BASELINE_AFTER: everything already
   * true (milestones passed long ago, a store live for months) is recorded as "baseline", so turning lifecycle email
   * on never floods existing users with old news. New accounts are never baselined.
   */
  baseline: Array<{ rule: LifecycleRule; key: string }>;
  /** Every rule due now, in send order (for previews and debugging). */
  due: Array<{ rule: LifecycleRule; key: string }>;
  /** What the rules were evaluated with; render with the same. */
  ctx: RuleContext;
}

export const BASELINE_KEY = "__baseline";

export function planLifecycle(facts: LifecycleFacts, history: SentEntry[], now: number): LifecyclePlan {
  const byKey = new Map(history.map((entry) => [entry.key, entry]));
  const latestByRule = new Map<string, number>();
  for (const entry of history) {
    if (entry.status === "failed") continue;
    latestByRule.set(entry.rule, Math.max(latestByRule.get(entry.rule) ?? 0, entry.at));
  }
  const ctx: RuleContext = { now, sentAt: (ruleId) => latestByRule.get(ruleId) ?? null };

  const empty: LifecyclePlan = { baselined: false, send: null, baseline: [], due: [], ctx };
  if (!facts.email || !hasRoleFacts(facts)) return empty;

  const rules = LIFECYCLE_RULES.filter((rule) => rule.role === facts.role)
    .map((rule, index) => ({ rule, index }))
    .sort((x, y) => JOURNEY_PRIORITY.indexOf(x.rule.journey) - JOURNEY_PRIORITY.indexOf(y.rule.journey) || x.index - y.index)
    .map(({ rule }) => rule);

  const due: LifecyclePlan["due"] = [];
  for (const rule of rules) {
    const occurrence = rule.due(facts, ctx);
    if (occurrence === null) continue;
    due.push({ rule, key: occurrenceKey(rule, occurrence) });
  }

  if (history.length === 0 && now - facts.createdAt > BASELINE_AFTER) {
    return { baselined: true, send: null, baseline: due, due, ctx };
  }

  const lastSent = Math.max(0, ...history.filter((entry) => entry.status === "sent").map((entry) => entry.at));
  const nudgeBlocked = now - lastSent < NUDGE_GAP;

  for (const item of due) {
    const previous = byKey.get(item.key);
    if (previous && isSettled(previous, now)) continue;
    if (NUDGE_JOURNEYS.has(item.rule.journey) && nudgeBlocked) continue;
    return { baselined: false, send: { ...item, retry: Boolean(previous) }, baseline: [], due, ctx };
  }
  return { baselined: false, send: null, baseline: [], due, ctx };
}
