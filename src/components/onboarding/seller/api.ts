"use client";

import type { LabelledColourSet } from "@shared/colour-sets";
import type { DeliveryAreaChoice, GoLiveBlocker, LibraryPhoto, OnboardingEvent, RexBuildMemory, ShopReadyRow } from "@shared/seller-onboarding";
import type { EdSection, EdSnapshot } from "@shared/store-editor";
import { rexPost } from "@/lib/ai/rex-jobs-client";

// Browser calls for the web's seller onboarding, "Rex builds your shop (step by step)" (./SellerRexBuild.tsx). The web
// uses the SAME routes and server functions as the phone (src/app/api/mobile/onboarding/**, src/lib/onboarding/
// rex-build.server.ts): withSeller there reads the Supabase session cookie when there's no Bearer token, so a seller
// who starts on the phone and carries on here (or the other way round) picks up on the same screen from the same
// memory, Store.brandSettings.onboardingMemory.rexBuild.
//   GET   /api/mobile/onboarding                 everything the screens need and the saved answers
//   PATCH /api/mobile/onboarding                 a step's answers (+ an analytics event)
//   POST  /api/mobile/onboarding/events          an analytics event (spec §7)
//   PUT   /api/mobile/onboarding/categories      the confirmed categories (collections)
//   PUT   /api/mobile/onboarding/contact         WhatsApp, delivery areas, pickup, pay on delivery
//   GET   /api/mobile/onboarding/colours         D2b colour sets from the logo and photos (WCAG-checked)
//   POST  /api/mobile/onboarding/about           Rex writes the About story (a Rex job)
//   POST  /api/mobile/onboarding/build           Rex builds the draft (a Rex job); PATCH { notify } when leaving
//   GET / POST /api/mobile/onboarding/go-live    the blockers / publish (the editor's publish path)
//   GET / PATCH /api/mobile/store-editor         the draft for the review (E2), saved back with a version check
//   POST  /api/mobile/store-editor/rex           "tap a section → Rex changes it"
// Banner lines come from the banner helper's words (POST /api/mobile/banner, picture: false), also a Rex job.

export interface OnboardingProduct {
  id: string;
  name: string;
  price: number | null;
  image: string | null;
  supplier: boolean;
}

export interface OnboardingStore {
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
}

export interface OnboardingState {
  store: OnboardingStore | null;
  owner: { firstName: string; phone: string };
  flow: RexBuildMemory;
  products?: OnboardingProduct[];
  collections?: { id: string; name: string; productIds: string[] }[];
  suggestedGroups?: { name: string; productIds: string[] }[];
  priceChecks?: string[];
  contact?: { whatsapp: string; pickup: string };
  library?: LibraryPhoto[];
}

export type LoadedState = OnboardingState & { store: OnboardingStore };

export interface ProductDraft {
  imageUrl: string;
  name: string;
  price: number | null;
  description: string;
  detail: string;
  confidence: "ok" | "check";
  stock: number;
}

export interface StoreAddress {
  slug: string;
  url: string;
  host: string;
  available?: boolean;
  problem?: string | null;
}

export interface ShopReady {
  rows: ShopReadyRow[];
  open: ShopReadyRow[];
  done: number;
  total: number;
  percent: number;
  complete: boolean;
  facts: { products: number };
}

export class OnboardingRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function readError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { message: response.redirected || response.status === 401 ? "Your session has ended. Log in again to carry on." : fallback, code: undefined };
  }
  const body = (await response.json().catch(() => null)) as { error?: { message?: string; code?: string } } | null;
  return { message: body?.error?.message ?? fallback, code: body?.error?.code };
}

async function call<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  if (!response.ok) {
    const error = await readError(response, fallback);
    throw new OnboardingRequestError(error.message, response.status, error.code);
  }
  const body = (await response.json().catch(() => null)) as { data?: T } | T | null;
  return (body && typeof body === "object" && "data" in body ? body.data : body) as T;
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

// ── The guided build (the phone's routes) ────────────────────────────────────

export const fetchOnboarding = () => call<OnboardingState>("/api/mobile/onboarding", { method: "GET" }, "Your shop didn't load.");

export const saveFlow = (patch: Partial<RexBuildMemory>, event?: OnboardingEvent, props?: Record<string, unknown>) =>
  call<{ flow: RexBuildMemory }>("/api/mobile/onboarding", json("PATCH", { patch, ...(event ? { event, props: { ...(props ?? {}), app: "web" } } : {}) }), "That didn't save.");

/** An analytics event (never throws, never waits on the screen). */
export function track(event: OnboardingEvent, props: Record<string, unknown> = {}) {
  void fetch("/api/mobile/onboarding/events", json("POST", { event, props: { ...props, app: "web" } })).catch(() => null);
}

export const saveCategories = (groups: { name: string; productIds: string[] }[]) =>
  call<{ collections: { id: string; name: string; productIds: string[] }[] }>("/api/mobile/onboarding/categories", json("PUT", { groups }), "Check the categories.");

export const saveContact = (contact: { whatsapp: string; areas: DeliveryAreaChoice[]; pickup?: string; pod: boolean }) =>
  call<{ podProblem: string | null }>("/api/mobile/onboarding/contact", json("PUT", contact), "Check your contact details.");

/** D2b's colour sets from the seller's logo and product photos, with Rex's pick (shared/colour-sets.ts). */
export const fetchColourSets = (style?: string | null) =>
  call<{ sets: LabelledColourSet[] }>(`/api/mobile/onboarding/colours${style ? `?style=${encodeURIComponent(style)}` : ""}`, { method: "GET" }, "No colours.").then((body) => body.sets ?? []);

/** Rex writes the About story (a Rex job: leaving the screen keeps it, asking again never pays twice). */
export const writeAbout = (input: { started: string; different: string; round: number; language?: string }) =>
  rexPost<{ story: string }>("/api/mobile/onboarding/about", input, { slot: "onboarding-about", envelope: true });

/** Rex's three banner lines in the chosen style's feel (the banner helper's words, no picture). */
export const writeBannerWords = (input: { vibe: string; language?: string; round: number }) =>
  rexPost<{ options?: { heading: string; text?: string; button?: string }[] }>(
    "/api/mobile/banner",
    { vibe: input.vibe, picture: false, language: input.language, prompt: input.round > 1 ? `Round ${input.round}: new lines` : "" },
    { slot: "onboarding-words", envelope: true },
  );

/** Rex builds the draft (a Rex job: closing the tab doesn't lose it; asking again gets the same build back). */
export const buildShop = () => rexPost<{ version: string; pages: number; done: string[] }>("/api/mobile/onboarding/build", {}, { slot: "onboarding-build", envelope: true });

export const notifyWhenBuilt = (notify: boolean) => {
  void fetch("/api/mobile/onboarding/build", { ...json("PATCH", { notify }), keepalive: true }).catch(() => null);
};

export const fetchBlockers = () => call<{ blockers: GoLiveBlocker[] }>("/api/mobile/onboarding/go-live", { method: "GET" }, "Couldn't check your shop.");

export const goLive = () =>
  call<{ live: true; url: string; pages: number | null } | { live: false; blockers: GoLiveBlocker[] }>("/api/mobile/onboarding/go-live", { method: "POST" }, "Your shop didn't go live.");

export const fetchShopReady = () => call<ShopReady>("/api/mobile/onboarding/ready", { method: "GET" }, "Couldn't load your checklist.");

// ── The draft (the store editor's, shared with the web builder and the phone) ─

export interface EditorLoad {
  /** What the storefront renderer draws (the web builder's own store data). */
  store: Record<string, unknown> & { name: string; slug: string; storefrontUrl: string | null };
  draft: EdSnapshot | null;
  version: string;
}

export const fetchDraft = () => call<EditorLoad>("/api/mobile/store-editor", { method: "GET" }, "Your shop didn't load.");

/** Saves the draft; 409 CONFLICT when it was changed on another device since `baseVersion`. */
export const saveDraft = (snapshot: EdSnapshot, baseVersion: string | null) =>
  call<{ version: string }>("/api/mobile/store-editor", json("PATCH", { snapshot, baseVersion }), "That change didn't save.");

export const askRexToEdit = (input: { message: string; section?: string; page?: string; baseVersion: string | null }) =>
  call<{ reply: string; changes: string[]; draft: EdSnapshot | null; version: string | null }>("/api/mobile/store-editor/rex", json("POST", input), "Rex couldn't change that just now.");

export type { EdSection };

// ── Shop basics and products (the web's own routes, the same ones the phone calls) ─

export function renameStore(name: string) {
  return call("/api/app/store", json("PATCH", { name }), "Couldn't save your shop name.");
}

export function checkAddress(slug: string) {
  return call<StoreAddress>(`/api/app/onboarding/address?slug=${encodeURIComponent(slug)}`, { method: "GET" }, "Couldn't check that address.");
}

export function saveAddress(slug: string) {
  return call<StoreAddress>("/api/app/onboarding/address", json("PUT", { slug }), "Couldn't save that address.");
}

/** Switches the store's draft to a library theme (POST /api/store/templates/apply; the server checks the plan). */
export function applyTheme(templateId: string) {
  return call<{ storeSlug?: string; draftOnly?: boolean }>("/api/store/templates/apply", json("POST", { templateId }), "We couldn't use that look. Try again.");
}

/** Rex reads product photos (POST /api/ai/product-drafts): a name, price check and description for each. */
export async function draftProducts(files: File[]) {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const data = await call<{ drafts: Omit<ProductDraft, "stock">[]; drafted: boolean; error?: string }>("/api/ai/product-drafts", { method: "POST", body: form }, "Rex couldn't read those photos.");
  return { drafted: data.drafted, error: data.error, drafts: data.drafts.map((draft) => ({ ...draft, stock: 10 })) };
}

export async function createProducts(drafts: ProductDraft[]) {
  for (const draft of drafts) {
    await call(
      "/api/store/products",
      json("POST", {
        name: draft.name.trim(),
        description: [draft.detail, draft.description].filter(Boolean).join(". ").slice(0, 5000) || undefined,
        images: [draft.imageUrl],
        retailPrice: draft.price,
        currentStock: Math.max(0, Math.round(draft.stock)),
        status: "published",
        visibility: "storefront",
        sourceType: "seller",
      }),
      `Couldn't add ${draft.name}.`,
    );
  }
}

/** A product's name and price from the price check (the products route's own PATCH). */
export const updateProduct = (id: string, input: { name: string; price: number }) =>
  call(`/api/store/products/${encodeURIComponent(id)}`, json("PATCH", { name: input.name.trim(), retailPrice: input.price }), "Couldn't save that product.");

/** Adds a supplier product to the store as a dropship listing. "terms" when the supplier asks the seller to accept terms first. */
export async function addSupplierPick(supplierProductId: string, retailPrice: number): Promise<"added" | "terms"> {
  const response = await fetch("/api/app/store-products/add-from-supplier", json("POST", { supplierProductId, retailPrice, fulfillmentType: "dropship", visibility: "storefront" }));
  if (response.status === 409) return "terms";
  if (!response.ok) throw new Error((await readError(response, "Couldn't add that product.")).message);
  return "added";
}

/** A marketplace product by its slug (the website's "Add to my shop" link). */
export const fetchMarketplaceProduct = (slug: string) =>
  call<{ id: string; wholesalePrice: number }>(`/api/public/products/${encodeURIComponent(slug)}`, { method: "GET" }, "That product isn't open any more.");

/** Uploads one picture (POST /api/upload, into the seller's media library) and returns its https address. */
export async function uploadPicture(file: File, folder: "brand" | "products") {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  const data = await call<{ publicUrl: string }>("/api/upload", { method: "POST", body: form }, "That picture didn't upload. Check your connection and try again.");
  return data.publicUrl;
}

/** A pilot invite code from the WhatsApp test link, redeemed quietly (never asked about). */
export const redeemInvite = (code: string) => call("/api/app/features/invite", json("POST", { code }), "That code doesn't work.");

/** "Share your shop" on the checklist counts once the seller shares. */
export const markShared = () => call("/api/app/setup", json("PATCH", { type: "shared" }), "Couldn't save that.");

/** Onboarding is done (live) or put aside for now (Save & exit: Home lets them in and offers to carry on). */
export function finishOnboarding(live: boolean) {
  return call("/api/app/store", json("PATCH", { firstDashboardVisitComplete: true, onboardingState: live ? "LIVE" : "INCOMPLETE" }), "Couldn't finish setup.");
}

/** Save & exit: Home opens (it sends a seller still at NEW back here) and shows "Finish your shop". */
export function pauseOnboarding() {
  return call("/api/app/store", json("PATCH", { onboardingState: "INCOMPLETE" }), "Couldn't save your progress.");
}
