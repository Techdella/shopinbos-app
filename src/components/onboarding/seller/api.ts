"use client";

import type { BrandLook, BrandPalette, DeliveryZone, PaymentMethodKey } from "@shared/onboarding";
import type { StoreOnboardingMemory } from "@/lib/onboarding-memory";
import { friendlyError } from "@/lib/errors/report-client";

// Browser calls for the redesigned seller onboarding. They rely on the Supabase session cookie.

export interface OnboardingStatus {
  store: { id: string; name: string; slug: string; status: string; live: boolean; url: string };
  ownerName: string;
  finished: boolean;
  memory: StoreOnboardingMemory | null;
  productCount: number;
  checklist: Array<{ key: string; label: string; hint: string; href: string; done: boolean; manual: boolean }>;
}

export interface ProductDraft {
  imageUrl: string;
  name: string;
  price: number | null;
  description: string;
  detail: string;
  confidence: "ok" | "check";
  stock: number;
}

async function readError(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return response.redirected || response.status === 401 ? "Your session has ended. Log in again to carry on." : fallback;
  }
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

async function call<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await readError(response, fallback));
  const body = (await response.json().catch(() => null)) as { data?: T } | T | null;
  return (body && typeof body === "object" && "data" in body ? body.data : body) as T;
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export function fetchStatus() {
  return call<OnboardingStatus>("/api/app/onboarding", { method: "GET" }, "Couldn't load your shop.");
}

export function saveMemory(memory: Partial<StoreOnboardingMemory>, storePatch: Record<string, unknown> = {}) {
  return call("/api/app/store", json("PATCH", { ...storePatch, brandSettings: { onboardingMemory: { ...memory, updatedAt: new Date().toISOString() } } }), "Couldn't save your progress.");
}

export function saveStoreName(name: string) {
  return call<{ slug: string; name: string }>("/api/app/store", json("POST", { name }), "Couldn't save your shop name.");
}

export async function askRex(message: string, memory: Partial<StoreOnboardingMemory>) {
  const response = await fetch("/api/ai/onboarding-rex", json("POST", { message, memory }));
  if (!response.ok) throw new Error(await readError(response, "Rex couldn't read that just now."));
  return (await response.json()) as { reply?: string; memoryPatch?: Partial<StoreOnboardingMemory> };
}

export async function transcribe(audio: Blob) {
  const form = new FormData();
  form.append("audio", audio, "rex-onboarding.webm");
  const data = await call<{ text?: string }>("/api/ai/transcribe", { method: "POST", body: form }, "Rex couldn't hear that. Try again or type it.");
  return data?.text?.trim() ?? "";
}

export async function draftProducts(files: File[]) {
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  const data = await call<{ drafts: Omit<ProductDraft, "stock">[]; drafted: boolean }>("/api/ai/product-drafts", { method: "POST", body: form }, "Rex couldn't read those photos.");
  return { drafted: data.drafted, drafts: data.drafts.map((draft) => ({ ...draft, stock: 10 })) };
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

export function savePayments(methods: Record<PaymentMethodKey, boolean>, zones: DeliveryZone[]) {
  return call("/api/app/onboarding/payments", json("PUT", { methods, zones }), "Couldn't save your payment settings.");
}

export function tickChecklist(key: string, done: boolean) {
  return call<OnboardingStatus>("/api/app/onboarding/checklist", json("PATCH", { key, done }), "Couldn't update that.");
}

export function finishOnboarding(live: boolean) {
  return call("/api/app/store", json("PATCH", { firstDashboardVisitComplete: true, onboardingState: live ? "LIVE" : "INCOMPLETE" }), "Couldn't finish setup.");
}

// ── One question per screen (shared/onboarding.ts SELLER_QUESTIONS) ─────────────────────

/** Uploads one picture (POST /api/upload, into the seller's media library) and returns its https address. */
export async function uploadPicture(file: File, folder: "brand" | "products") {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  const data = await call<{ publicUrl: string }>("/api/upload", { method: "POST", body: form }, "That picture didn't upload. Check your connection and try again.");
  return data.publicUrl;
}

export function saveLogo(logoUrl: string | null) {
  return call("/api/app/store", json("PATCH", { logoUrl }), "Couldn't save your logo.");
}

export interface LogoIdea {
  style: string;
  label: string;
  url: string;
}

/** Four logo ideas from the store name ("Show me more" passes the next round; `notes` is what to change). */
export async function drawLogos(input: { businessName: string; businessDescription?: string; round: number; notes?: string }) {
  const response = await fetch("/api/ai/generate-logo", json("POST", { ...input, count: 4 }));
  const body = (await response.json().catch(() => null)) as { logos?: LogoIdea[]; error?: { code?: string; message?: string } } | null;
  if (!response.ok || !body?.logos?.length) {
    const error = new Error(body?.error?.message ?? "Rex couldn't draw logos just now.") as Error & { unavailable?: boolean };
    // No image key, no allowance or credits left, or the model failed: the seller carries on with initials.
    error.unavailable = true;
    throw error;
  }
  return body.logos;
}

/** Root marketplace categories for "What do you sell?" (names only). */
export async function fetchSellCategories(): Promise<string[]> {
  const response = await fetch("/api/public/categories?rootOnly=true");
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as { data?: Array<{ name: string; slug: string }> } | null;
  return (body?.data ?? []).map((row) => row.name).filter(Boolean);
}

export interface SupplierPick {
  id: string;
  name: string;
  price: number;
  currency: string;
  supplier: string;
  imageUrl?: string;
}

/** Supplier products open to dropshipping, for the swipe on "Add your first product" (dropship path). */
export async function fetchSupplierPicks(): Promise<SupplierPick[]> {
  const response = await fetch("/api/public/products?dropship=true&limit=20");
  if (!response.ok) return [];
  const body = (await response.json().catch(() => null)) as {
    data?: Array<{ id: string; name: string; wholesalePrice: number; currency: string; supplier?: { displayName?: string }; images?: string[] }>;
  } | null;
  return (body?.data ?? []).map((row) => ({ id: row.id, name: row.name, price: row.wholesalePrice, currency: row.currency, supplier: row.supplier?.displayName ?? "", imageUrl: row.images?.[0] }));
}

/** Adds a supplier product to the store as a dropship listing. "terms" when the supplier asks the seller to accept terms first. */
export async function addSupplierPick(supplierProductId: string, retailPrice: number): Promise<"added" | "terms"> {
  const response = await fetch("/api/app/store-products/add-from-supplier", json("POST", { supplierProductId, retailPrice, fulfillmentType: "dropship", visibility: "storefront" }));
  if (response.status === 409) return "terms";
  if (!response.ok) throw new Error(await readError(response, "Couldn't add that product."));
  return "added";
}

/** Creates the first product from its photo, name and price. */
export function createFirstProduct(input: { name: string; price: number; imageUrl: string }) {
  return call(
    "/api/store/products",
    json("POST", { name: input.name.trim(), images: [input.imageUrl], retailPrice: input.price, currentStock: 10, status: "published", visibility: "storefront", sourceType: "seller" }),
    "Couldn't add your product.",
  );
}

export interface StoreAddress {
  slug: string;
  url: string;
  host: string;
  available?: boolean;
  problem?: string | null;
}

export function checkAddress(slug: string) {
  return call<StoreAddress>(`/api/app/onboarding/address?slug=${encodeURIComponent(slug)}`, { method: "GET" }, "Couldn't check that address.");
}

export function saveAddress(slug: string) {
  return call<StoreAddress>("/api/app/onboarding/address", json("PUT", { slug }), "Couldn't save that address.");
}

export interface DomainResult {
  domain: string;
  available: boolean;
  price: number | null;
  free: boolean;
}

export function searchDomains(query: string) {
  return call<DomainResult[]>(`/api/domains/search?q=${encodeURIComponent(query)}`, { method: "GET" }, "Domain search isn't working just now.");
}

/** Publishes the store (free on every plan). The reason it can't go live yet, or null when it is live. */
export async function publishStore(): Promise<string | null> {
  const response = await fetch("/api/store/editor/publish", { method: "POST" });
  if (response.ok) return null;
  const body = (await response.json().catch(() => null)) as { error?: { message?: string; blockers?: string[] } } | null;
  return body?.error?.blockers?.[0] ?? body?.error?.message ?? "Something stopped it. Try again.";
}

// ── Rex store build ──────────────────────────────────────────────────────────

export interface BuildInput {
  storeName: string;
  slug: string;
  description: string;
  category?: string;
  palette: BrandPalette;
  look: BrandLook;
  tweak?: string;
}

function seedStore(input: BuildInput) {
  const [dark, accent, light] = input.palette.swatches;
  return {
    name: input.storeName,
    slug: input.slug,
    tagline: "Quality products, delivered.",
    heroHeadline: input.storeName,
    heroSubline: input.description.slice(0, 140) || "Shop our latest pieces.",
    heroCtaText: "Shop now",
    palette: { heroBg: dark, heroText: light, accent, ctaBg: accent, ctaText: light, paperBg: light },
    fontStyle: input.look.fontStyle,
    navLinks: ["Shop", "New in", "About", "Contact"],
    products: [],
    changed: ["name", "palette", "hero"],
  };
}

async function hydrateEditor(store: Record<string, unknown>) {
  await call("/api/store/editor", json("PATCH", { hydrateFromStoreConfig: store }), "Rex built the design but couldn't save it.");
}

/**
 * Asks Rex to write the storefront, then saves it as the store's draft. If Rex is unavailable the plain
 * seed (name, palette, look) is saved instead, so the shop can still go live.
 */
export async function buildStore(input: BuildInput, onProgress?: (text: string) => void) {
  const seed = seedStore(input);
  try {
    const prompt = [input.description, input.tweak ? `Requested change: ${input.tweak}` : ""].filter(Boolean).join("\n\n");
    const response = await fetch(
      "/api/ai/store-builder",
      json("POST", {
        messages: [{ role: "user", content: prompt || `A shop called ${input.storeName}.` }],
        store: seed,
        brandContext: { category: input.category ?? "", businessDescription: input.description },
        templateContext: { templateId: input.look.templateId, templateName: input.look.label, layoutFamily: input.look.label },
      }),
    );
    if (!response.ok || !response.body) throw new Error(await readError(response, "Rex couldn't build the design."));
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let built: Record<string, unknown> | null = null;
    let message = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as { type?: string; text?: string; data?: Record<string, unknown>; message?: string };
        if (event.type === "token" && event.text) {
          message += event.text;
          onProgress?.(message);
        }
        if (event.type === "store" && event.data) built = { ...seed, ...event.data };
        if (event.type === "error") throw new Error(event.message ?? "Rex couldn't build the design.");
      }
    }
    await hydrateEditor(built ?? seed);
    return { usedRex: Boolean(built) };
  } catch (error) {
    await hydrateEditor(seed);
    return { usedRex: false, error: error instanceof Error ? friendlyError(error) : String(error) };
  }
}
