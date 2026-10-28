// The "Start here" checklist (/home/start): what a new seller still has to do, worked out from the real state of
// their shop. Pure (no server imports, relative imports only), so the page, the API, Peggy's setup_status tool
// and the unit tests all agree on what "done" means.

/** Session cookie set by Start here: Home sends new sellers to Start here once per visit until setup is done or dismissed. */
export const START_SEEN_COOKIE = "sib_start_seen";

export const SETUP_STEP_KEYS = ["store", "look", "products", "payments", "delivery", "partners", "payout", "live", "socials", "share", "domain", "audience"] as const;
export type SetupStepKey = (typeof SETUP_STEP_KEYS)[number];

/** Facts read from the database. Every step's "done" comes from these, never from a tick box. */
export interface SetupFacts {
  /** The shop's editor has a draft or published design, or a template was picked. */
  lookChosen: boolean;
  products: number;
  /** Products with at least one photo. */
  productsWithPhotos: number;
  /** The seller saved their payment choices (Money page, onboarding, Start here or Peggy) with at least one on. */
  paymentMethodsOn: number;
  activeDeliveryZones: number;
  /** Delivery companies (logistics marketplace partners) the seller has connected and not removed. */
  deliveryPartners: number;
  payoutBank: boolean;
  live: boolean;
  /** WhatsApp, Facebook Page and Instagram accounts connected (/channels): connect once, used everywhere. */
  socialsConnected: number;
  /** The seller shared their link from Start here or the store hub, or a shopper has ordered online. */
  shared: boolean;
  customDomain: boolean;
  subscribers: number;
  campaignsSent: number;
  /** Live sign-up forms and pop-ups (StoreForm, active, collecting subscribers): adding one is this step's ask. */
  signupForms?: number;
}

/** What the seller chose on Start here (Store.brandSettings.setup.start). */
export interface SetupChoices {
  skipped: SetupStepKey[];
  /** "I'm done here": hides Start here even with steps left. */
  dismissed: boolean;
  /** When they last shared their link from Start here. */
  sharedAt: string | null;
}

export type SetupAction =
  | { kind: "inline"; label: string }
  | { kind: "link"; label: string; href: string };

export interface SetupStep {
  key: SetupStepKey;
  title: string;
  /** One short line: what's left, or what was done. */
  hint: string;
  optional: boolean;
  done: boolean;
  skipped: boolean;
  action: SetupAction;
  /** Who can help with this step from the side panel, and what to ask them. */
  helper: { who: "peggy" | "rex"; prompt: string } | null;
}

export interface SetupChecklist {
  steps: SetupStep[];
  /** Required steps done (skipped ones don't count as done). */
  done: number;
  /** Required steps in total. */
  total: number;
  /** 0-100, required steps done or skipped. */
  percent: number;
  /** Every required step is done or skipped. */
  complete: boolean;
  /** Start here should show (in the menu and as the landing page): not complete and not dismissed. */
  showStart: boolean;
  /** The first required step still open, else the first optional one. */
  next: SetupStep | null;
}

/** Cities Start here offers as one-tap delivery areas, with the names checkout matches against (city or state). */
export const DELIVERY_CITY_PRESETS: Array<{ city: string; regions: string[]; fee: number }> = [
  { city: "Lagos", regions: ["Lagos"], fee: 2000 },
  { city: "Abuja", regions: ["Abuja", "FCT", "Federal Capital Territory"], fee: 3500 },
  { city: "Port Harcourt", regions: ["Port Harcourt", "Rivers"], fee: 4000 },
  { city: "Ibadan", regions: ["Ibadan", "Oyo"], fee: 3000 },
  { city: "Abeokuta", regions: ["Abeokuta", "Ogun"], fee: 3000 },
  { city: "Benin City", regions: ["Benin", "Edo"], fee: 4000 },
  { city: "Enugu", regions: ["Enugu"], fee: 4000 },
  { city: "Owerri", regions: ["Owerri", "Imo"], fee: 4000 },
  { city: "Kano", regions: ["Kano"], fee: 4500 },
  { city: "Kaduna", regions: ["Kaduna"], fee: 4500 },
  { city: "Uyo", regions: ["Uyo", "Akwa Ibom"], fee: 4500 },
  { city: "Warri", regions: ["Warri", "Delta"], fee: 4000 },
];

export const ELSEWHERE_AREA = "Everywhere else";

/**
 * Delivery areas from the cities a seller ticked (each with its own fee) and an optional fee for everywhere
 * else. Unknown cities are ignored; the catch-all always comes last so checkout tries the cities first.
 */
export function deliveryAreasFromPicks(picks: Array<{ city: string; fee: number }>, elsewhereFee: number | null) {
  const areas: Array<{ name: string; fee: number; regions: string[] }> = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    const preset = DELIVERY_CITY_PRESETS.find((item) => item.city.toLowerCase() === pick.city.trim().toLowerCase());
    if (!preset || seen.has(preset.city)) continue;
    seen.add(preset.city);
    areas.push({ name: preset.city, fee: Math.max(0, Math.round(Number(pick.fee) || 0)), regions: preset.regions });
  }
  if (elsewhereFee !== null && Number.isFinite(elsewhereFee)) areas.push({ name: ELSEWHERE_AREA, fee: Math.max(0, Math.round(elsewhereFee)), regions: [] });
  return areas;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function isSetupStepKey(value: unknown): value is SetupStepKey {
  return typeof value === "string" && (SETUP_STEP_KEYS as readonly string[]).includes(value);
}

/** Reads the seller's Start here choices from Store.brandSettings. Junk is ignored. */
export function readSetupChoices(brandSettings: unknown): SetupChoices {
  const start = record(record(record(brandSettings).setup).start);
  const skipped = Array.isArray(start.skipped) ? [...new Set(start.skipped.filter(isSetupStepKey))].filter((key) => key !== "store") : [];
  return {
    skipped,
    dismissed: typeof start.dismissedAt === "string" && start.dismissedAt.length > 0,
    sharedAt: typeof start.sharedAt === "string" ? start.sharedAt : null,
  };
}

export type SetupChoicePatch =
  | { type: "skip"; key: SetupStepKey }
  | { type: "unskip"; key: SetupStepKey }
  | { type: "dismiss" }
  | { type: "reopen" }
  | { type: "shared" };

/** The new brandSettings.setup.start value after a choice. Keeps anything else stored there. */
export function applySetupChoice(brandSettings: unknown, patch: SetupChoicePatch, now = new Date()): Record<string, unknown> {
  const current = record(record(record(brandSettings).setup).start);
  const choices = readSetupChoices(brandSettings);
  const next: Record<string, unknown> = { ...current, skipped: choices.skipped };
  if (patch.type === "skip" && patch.key !== "store") next.skipped = [...new Set([...choices.skipped, patch.key])];
  if (patch.type === "unskip") next.skipped = choices.skipped.filter((key) => key !== patch.key);
  if (patch.type === "dismiss") next.dismissedAt = now.toISOString();
  if (patch.type === "reopen") delete next.dismissedAt;
  if (patch.type === "shared") next.sharedAt = now.toISOString();
  return next;
}

/** Builds the checklist. Done always wins over skipped: a step finished later counts as done. */
export function buildSetupChecklist(facts: SetupFacts, choices: SetupChoices): SetupChecklist {
  const skipped = new Set(choices.skipped);
  const photoless = facts.products - facts.productsWithPhotos;

  const rows: Array<Omit<SetupStep, "skipped">> = [
    {
      key: "store",
      title: "Create your shop",
      hint: "Done. Your shop has a name and a link.",
      optional: false,
      done: true,
      action: { kind: "link", label: "View", href: "/home/store" },
      helper: null,
    },
    {
      key: "look",
      title: "Choose your look",
      hint: facts.lookChosen ? "Your shop has a design. Change it any time." : "Pick a theme, or let Rex design one from what you sell.",
      optional: false,
      done: facts.lookChosen,
      action: { kind: "link", label: facts.lookChosen ? "Edit your store" : "Pick a theme", href: facts.lookChosen ? "/seller/store/builder" : "/builder/templates" },
      helper: { who: "rex", prompt: "Design my shop's homepage from what I sell, in colours that suit my brand." },
    },
    {
      key: "products",
      title: "Add your first products with photos",
      hint:
        facts.productsWithPhotos > 0
          ? `${plural(facts.productsWithPhotos, "product")} with photos${photoless > 0 ? `, ${photoless} still need one` : ""}.`
          : facts.products > 0
            ? `${plural(facts.products, "product")}, but none has a photo yet. Shoppers buy what they can see.`
            : "Snap a few photos and Rex names and prices them. One is enough to start.",
      optional: false,
      done: facts.productsWithPhotos > 0,
      action: { kind: "link", label: facts.products > 0 && facts.productsWithPhotos === 0 ? "Add photos" : "Add products", href: facts.products > 0 && facts.productsWithPhotos === 0 ? "/products" : "/products/new" },
      helper: { who: "rex", prompt: "Help me add my first products: clean up my product photos and write the names and descriptions." },
    },
    {
      key: "payments",
      title: "Choose how customers pay",
      hint:
        facts.paymentMethodsOn > 0
          ? `${plural(facts.paymentMethodsOn, "way")} to pay ${facts.paymentMethodsOn === 1 ? "is" : "are"} on.`
          : "Bank transfer, card, pay on delivery or WhatsApp.",
      optional: false,
      done: facts.paymentMethodsOn > 0,
      action: { kind: "inline", label: "Choose" },
      helper: { who: "peggy", prompt: "Turn on bank transfer, card and pay on delivery for my shop." },
    },
    {
      key: "delivery",
      title: "Set where you deliver",
      hint: facts.activeDeliveryZones > 0 ? `${plural(facts.activeDeliveryZones, "delivery area")} with fees.` : "Pick your cities and a delivery fee for each.",
      optional: false,
      done: facts.activeDeliveryZones > 0,
      action: { kind: "inline", label: "Pick cities" },
      helper: { who: "peggy", prompt: "Set delivery to ₦2,000 in Lagos and ₦4,000 everywhere else." },
    },
    {
      // Optional: a delivery company (logistics marketplace partner) picks parcels up and delivers them. Done once
      // the seller has connected one (an active DeliveryConnection), from Start here or /home/logistics/partners.
      key: "partners",
      title: "Choose a delivery company",
      hint:
        (facts.deliveryPartners ?? 0) > 0
          ? "Your delivery company is ready to pick up your orders."
          : "Optional. A delivery company picks up parcels from you and takes them to your customers.",
      optional: true,
      done: (facts.deliveryPartners ?? 0) > 0,
      action: { kind: "inline", label: "Choose a company" },
      helper: null,
    },
    {
      key: "payout",
      title: "Add your payout bank",
      hint: facts.payoutBank ? "Your bank account is linked for payouts." : "Card payments go straight to your bank once you add it.",
      optional: false,
      done: facts.payoutBank,
      // The Shopinbos Wallet: pick the bank, see the account name, confirm (src/lib/wallet).
      action: { kind: "link", label: "Add bank", href: "/home/wallet" },
      helper: null,
    },
    {
      key: "live",
      title: "Put your shop live",
      hint: facts.live ? "Your shop is open to shoppers." : "Publish your shop so anyone with the link can buy.",
      optional: false,
      done: facts.live,
      action: { kind: "inline", label: "Go live" },
      helper: null,
    },
    {
      key: "socials",
      title: "Connect WhatsApp, Facebook & Instagram",
      hint:
        facts.socialsConnected > 0
          ? `${plural(facts.socialsConnected, "account")} connected. Messages come to your inbox and your products show there.`
          : "One tap each. Customers' messages come to your inbox and your products show there.",
      optional: false,
      done: facts.socialsConnected > 0,
      action: { kind: "link", label: "Connect", href: "/home/connections" },
      helper: null,
    },
    {
      key: "share",
      title: "Share your shop link",
      hint: facts.shared ? "Shared. Keep posting it where your customers are." : "Post it on your WhatsApp status and Instagram bio.",
      optional: false,
      done: facts.shared,
      action: { kind: "inline", label: "Share" },
      helper: { who: "peggy", prompt: "Write a WhatsApp status announcing my shop is open." },
    },
    {
      key: "domain",
      title: "Use your own domain",
      hint: facts.customDomain ? "Your domain is connected." : "Optional. A .com or .ng name that's yours.",
      optional: true,
      done: facts.customDomain,
      action: { kind: "link", label: "Connect", href: "/home/domain" },
      helper: null,
    },
    {
      key: "audience",
      title: "Get subscribers or send a first campaign",
      hint:
        facts.campaignsSent > 0
          ? `${plural(facts.campaignsSent, "campaign")} sent.`
          : facts.subscribers > 0
            ? `${plural(facts.subscribers, "subscriber")} so far. Send them a hello.`
            : (facts.signupForms ?? 0) > 0
              ? "Your sign-up form is live. New subscribers will show here."
              : "Optional. Add a sign-up pop-up and say hello to your first customers.",
      optional: true,
      done: facts.subscribers > 0 || facts.campaignsSent > 0 || (facts.signupForms ?? 0) > 0,
      action:
        facts.subscribers > 0
          ? { kind: "link", label: "Send a campaign", href: "/home/marketing/campaigns" }
          : { kind: "link", label: (facts.signupForms ?? 0) > 0 ? "See your forms" : "Add a sign-up form", href: "/home/marketing/forms" },
      helper: { who: "peggy", prompt: "Draft a welcome email to my subscribers introducing my shop." },
    },
  ];

  const steps: SetupStep[] = rows.map((row) => ({ ...row, skipped: !row.done && skipped.has(row.key) }));
  const required = steps.filter((step) => !step.optional);
  const done = required.filter((step) => step.done).length;
  const settled = required.filter((step) => step.done || step.skipped).length;
  const complete = settled === required.length;
  const open = (step: SetupStep) => !step.done && !step.skipped;
  const next = required.find(open) ?? steps.find((step) => step.optional && open(step)) ?? null;

  return {
    steps,
    done,
    total: required.length,
    percent: Math.round((settled / required.length) * 100),
    complete,
    showStart: !complete && !choices.dismissed,
    next,
  };
}
