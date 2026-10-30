import "expo-sqlite/localStorage/install";
import { api } from "./api";
import { rexApi } from "./rex-jobs";
import {
  entryFromQuery,
  type DeliveryAreaChoice,
  type EntryIntent,
  type GoLiveBlocker,
  type LibraryPhoto,
  type OnboardingEvent,
  type RexBuildMemory,
  type ShopReadyItem,
  type ShopReadyRow,
} from "@shared/seller-onboarding";

export * from "@shared/seller-onboarding";

// Seller onboarding on the phone, "Rex builds your shop" (app/onboarding/**, design RB-01…RB-16). The calls:
//   GET   /api/mobile/onboarding                 everything the screens need and the saved answers
//   PATCH /api/mobile/onboarding                 a step's answers (+ an analytics event)
//   POST  /api/mobile/onboarding/events          an analytics event (spec §7)
//   PUT   /api/mobile/onboarding/categories      the confirmed categories (collections)
//   PUT   /api/mobile/onboarding/contact         WhatsApp, delivery areas, pickup, pay on delivery
//   POST  /api/mobile/onboarding/about           Rex writes the About story (a Rex job)
//   POST  /api/mobile/onboarding/build           Rex builds the draft (a Rex job); PATCH { notify } when leaving
//   GET / POST /api/mobile/onboarding/go-live    the blockers / publish (the editor's publish path)
//   GET   /api/mobile/onboarding/ready           Home's "Get your shop ready"
// Banner lines come from the banner helper's words (POST /api/mobile/banner, picture: false), also a Rex job.

export interface OnboardingProduct {
  id: string;
  name: string;
  price: number | null;
  image: string | null;
  supplier: boolean;
}

export interface OnboardingState {
  store: {
    id: string;
    name: string;
    slug: string;
    url: string;
    host: string;
    live: boolean;
    logoUrl: string | null;
    city: string;
    state: string;
    finished: boolean;
    themeId: string | null;
  } | null;
  owner: { firstName: string; phone: string };
  flow: RexBuildMemory;
  products?: OnboardingProduct[];
  collections?: { id: string; name: string; productIds: string[] }[];
  suggestedGroups?: { name: string; productIds: string[] }[];
  priceChecks?: string[];
  contact?: { whatsapp: string; pickup: string };
  library?: LibraryPhoto[];
}

export const fetchOnboarding = () => api<OnboardingState>("/api/mobile/onboarding");

export const saveFlow = (patch: Partial<RexBuildMemory>, event?: OnboardingEvent, props?: Record<string, unknown>) =>
  api<{ flow: RexBuildMemory }>("/api/mobile/onboarding", { method: "PATCH", json: { patch, ...(event ? { event, props: props ?? {} } : {}) } });

/** An analytics event (never throws, never waits on the screen). */
export function track(event: OnboardingEvent, props: Record<string, unknown> = {}) {
  void api("/api/mobile/onboarding/events", { method: "POST", json: { event, props } }).catch(() => null);
}

export const saveCategories = (groups: { name: string; productIds: string[] }[]) =>
  api<{ collections: { id: string; name: string; productIds: string[] }[] }>("/api/mobile/onboarding/categories", { method: "PUT", json: { groups } });

export const saveContact = (contact: { whatsapp: string; areas: DeliveryAreaChoice[]; pickup?: string; pod: boolean }) =>
  api<{ podProblem: string | null }>("/api/mobile/onboarding/contact", { method: "PUT", json: contact });

export const fetchLibrary = () => api<{ photos: LibraryPhoto[] }>("/api/mobile/onboarding/library");

/** Rex writes the About story (a Rex job: leaving the screen keeps it, asking again never pays twice). */
export const writeAbout = (input: { started: string; different: string; round: number; language?: string }) =>
  rexApi<{ story: string }>("/api/mobile/onboarding/about", input, "onboarding-about");

/** Rex's three banner lines in the chosen style's feel (the banner helper's words, no picture). */
export const writeBannerWords = (input: { vibe: string; language?: string; round: number }) =>
  rexApi<{ options?: { heading: string; text?: string; button?: string }[] }>("/api/mobile/banner", { vibe: input.vibe, picture: false, language: input.language, prompt: input.round > 1 ? `Round ${input.round}: new lines` : "" }, "onboarding-words");

/** Rex builds the draft (a Rex job). */
export const buildShop = () => rexApi<{ version: string; pages: number; done: string[] }>("/api/mobile/onboarding/build", {}, "onboarding-build");

export const notifyWhenBuilt = (notify: boolean) => api("/api/mobile/onboarding/build", { method: "PATCH", json: { notify } }).catch(() => null);

export const fetchBlockers = () => api<{ blockers: GoLiveBlocker[] }>("/api/mobile/onboarding/go-live");

export const goLive = () => api<{ live: true; url: string; pages: number | null } | { live: false; blockers: GoLiveBlocker[] }>("/api/mobile/onboarding/go-live", { method: "POST" });

export interface ShopReady {
  rows: ShopReadyRow[];
  open: ShopReadyRow[];
  done: number;
  total: number;
  percent: number;
  complete: boolean;
  facts: { products: number };
}

export const fetchShopReady = () => api<ShopReady>("/api/mobile/onboarding/ready");

/** A product's name and price from the price check (the products route's own PATCH). */
export const updateProduct = (id: string, input: { name: string; price: number }) =>
  api(`/api/store/products/${encodeURIComponent(id)}`, { method: "PATCH", json: { name: input.name.trim(), retailPrice: input.price } });

export const SHOP_READY_ROUTE: Record<ShopReadyItem, string> = {
  bank: "/wallet",
  delivery: "/delivery",
  pod: "/payments",
  share: "",
  post: "/create",
  products: "/add-products",
  channels: "/channels",
  domain: "/domain",
};

// ─── What a link into the app carried (spec §2) ─────────────────────────────
// ?intent=add_product&productSlug=… (pre-adds that product on the products step, "Added from Trending"), ?ref=CODE
// (a referral: sent with the sign-up), ?invite=CODE (a pilot invite, redeemed after sign-in). Kept on the phone until
// it's used, so it survives the sign-in.

const ENTRY_KEY = "shopinbos.entryIntent";

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Remembers what a link carried (merged with what's already kept). Never throws. */
export function captureEntry(query: string) {
  const found = entryFromQuery(query);
  if (!Object.keys(found).length) return;
  try {
    store()?.setItem(ENTRY_KEY, JSON.stringify({ ...readEntry(), ...found }));
  } catch {
    // No storage: the link's intent is just not kept.
  }
}

export function readEntry(): EntryIntent {
  try {
    const raw = store()?.getItem(ENTRY_KEY);
    return raw ? (JSON.parse(raw) as EntryIntent) : {};
  } catch {
    return {};
  }
}

/** Forgets parts of the kept intent once they're used. */
export function forgetEntry(keys: (keyof EntryIntent)[]) {
  try {
    const next = { ...readEntry() };
    for (const key of keys) delete next[key];
    if (Object.keys(next).length) store()?.setItem(ENTRY_KEY, JSON.stringify(next));
    else store()?.removeItem(ENTRY_KEY);
  } catch {
    // Nothing kept.
  }
}
