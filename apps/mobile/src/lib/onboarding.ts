import type { BrandLook, BrandPalette, DeliveryZone, PaymentMethodKey, ProductPath, SellerQuestion } from "@shared/onboarding";
import { api, ApiError, API_URL } from "./api";
import { supabase } from "./supabase";

// Seller onboarding calls for the app; same endpoints as the web onboarding (src/components/onboarding/seller/api.ts).

export interface OnboardingMemory {
  businessDescription?: string;
  storeName?: string;
  templateId?: string;
  category?: string;
  categories?: string[];
  productPath?: ProductPath;
  languages?: string[];
  screen?: "chat" | "brand" | "products" | "where" | "payments" | SellerQuestion;
  palette?: { id?: string; name?: string; colors?: Record<string, string> } | null;
}

export interface OnboardingStatus {
  store: { id: string; name: string; slug: string; status: string; live: boolean; url: string };
  ownerName: string;
  finished: boolean;
  memory: OnboardingMemory | null;
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

export const fetchStatus = () => api<OnboardingStatus>("/api/app/onboarding");

export const saveMemory = (memory: Partial<OnboardingMemory>, storePatch: Record<string, unknown> = {}) =>
  api("/api/app/store", { method: "PATCH", json: { ...storePatch, brandSettings: { onboardingMemory: { ...memory, updatedAt: new Date().toISOString() } } } });

export const saveStoreName = (name: string) => api<{ name: string; slug: string }>("/api/app/store", { method: "POST", json: { name } });

export async function askRex(message: string, memory: Partial<OnboardingMemory> & { preferredName?: string }) {
  // This route answers without the usual { data } envelope.
  return api<{ reply?: string; memoryPatch?: Partial<OnboardingMemory> }>("/api/ai/onboarding-rex", { method: "POST", json: { message, memory } });
}

export async function draftProducts(photos: Array<{ uri: string; mimeType?: string | null; fileName?: string | null }>) {
  const form = new FormData();
  photos.forEach((photo, index) => {
    const type = photo.mimeType ?? "image/jpeg";
    // React Native's FormData takes { uri, name, type } file parts.
    form.append("files", { uri: photo.uri, name: photo.fileName ?? `product-${index + 1}.${type.split("/")[1] ?? "jpg"}`, type } as unknown as Blob);
  });
  const data = await api<{ drafts: Omit<ProductDraft, "stock">[]; drafted: boolean }>("/api/ai/product-drafts", { method: "POST", body: form });
  return { drafted: data.drafted, drafts: data.drafts.map((draft) => ({ ...draft, stock: 10 })) };
}

export async function createProducts(drafts: ProductDraft[]) {
  for (const draft of drafts) {
    await api("/api/store/products", {
      method: "POST",
      json: {
        name: draft.name.trim(),
        description: [draft.detail, draft.description].filter(Boolean).join(". ").slice(0, 5000) || undefined,
        images: [draft.imageUrl],
        retailPrice: draft.price,
        currentStock: Math.max(0, Math.round(draft.stock)),
        status: "published",
        visibility: "storefront",
        sourceType: "seller",
      },
    });
  }
}

export const savePayments = (methods: Record<PaymentMethodKey, boolean>, zones: DeliveryZone[]) =>
  api<{ zonesNote?: string | null }>("/api/app/onboarding/payments", { method: "PUT", json: { methods, zones } });

export const fetchPayoutBank = () =>
  api<{ banks: string[]; current: { bankName: string | null; accountName: string | null; accountNumberMask: string | null } | null }>("/api/app/payout-bank");

export const linkPayoutBank = (bankName: string, accountNumber: string, accountName: string) =>
  api("/api/app/payout-bank", { method: "POST", json: { bankName, accountNumber, accountName } });

export const tickChecklist = (key: string, done: boolean) => api<OnboardingStatus>("/api/app/onboarding/checklist", { method: "PATCH", json: { key, done } });

export const finishOnboarding = (live: boolean) =>
  api("/api/app/store", { method: "PATCH", json: { firstDashboardVisitComplete: true, onboardingState: live ? "LIVE" : "INCOMPLETE" } });

/** Puts the shop live. Publishing is free, so the phone can do it too. */
export const publishStore = () => api("/api/store/editor/publish", { method: "POST" });

// ── One question per screen (shared/onboarding.ts SELLER_QUESTIONS; same calls as the web's seller/api.ts) ─────

export const saveLogo = (logoUrl: string | null) => api("/api/app/store", { method: "PATCH", json: { logoUrl } });

export interface LogoIdea {
  style: string;
  label: string;
  url: string;
}

/** Four logo ideas from the store name. Throws when Rex can't draw now (the seller carries on with initials). */
export async function drawLogos(input: { businessName: string; businessDescription?: string; round: number; notes?: string }) {
  const body = await api<{ logos?: LogoIdea[] }>("/api/ai/generate-logo", { method: "POST", json: { ...input, count: 4 } });
  if (!body?.logos?.length) throw new ApiError("", 503);
  return body.logos;
}

/** Root marketplace categories for "What do you sell?" (names only). */
export async function fetchSellCategories(): Promise<string[]> {
  const rows = await api<Array<{ name: string }>>("/api/public/categories?rootOnly=true").catch(() => []);
  return (rows ?? []).map((row) => row.name).filter(Boolean);
}

export interface SupplierPick {
  id: string;
  name: string;
  price: number;
  supplier: string;
  imageUrl?: string;
}

/** Supplier products open to dropshipping (the dropship path's "Add your first product"). */
export async function fetchSupplierPicks(): Promise<SupplierPick[]> {
  const rows = await api<Array<{ id: string; name: string; wholesalePrice: number; supplier?: { displayName?: string }; images?: string[] }>>("/api/public/products?dropship=true&limit=20");
  return (rows ?? []).map((row) => ({ id: row.id, name: row.name, price: row.wholesalePrice, supplier: row.supplier?.displayName ?? "", imageUrl: row.images?.[0] }));
}

/** Adds a supplier product as a dropship listing; "terms" when the supplier wants their terms accepted first. */
export async function addSupplierPick(supplierProductId: string, retailPrice: number): Promise<"added" | "terms"> {
  try {
    await api("/api/app/store-products/add-from-supplier", { method: "POST", json: { supplierProductId, retailPrice, fulfillmentType: "dropship", visibility: "storefront" } });
    return "added";
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) return "terms";
    throw error;
  }
}

/** The first product, from its photo, name and price. */
export const createFirstProduct = (input: { name: string; price: number; imageUrl: string }) =>
  api("/api/store/products", { method: "POST", json: { name: input.name.trim(), images: [input.imageUrl], retailPrice: input.price, currentStock: 10, status: "published", visibility: "storefront", sourceType: "seller" } });

export interface StoreAddress {
  slug: string;
  url: string;
  host: string;
  available?: boolean;
  problem?: string | null;
}

export const checkAddress = (slug: string) => api<StoreAddress>(`/api/app/onboarding/address?slug=${encodeURIComponent(slug)}`);

export const saveAddress = (slug: string) => api<StoreAddress>("/api/app/onboarding/address", { method: "PUT", json: { slug } });

// ── Rex store build (mirrors the web onboarding) ─────────────────────────────

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

/**
 * Asks Rex for the storefront design and saves it as the draft; falls back to the plain seed so the shop
 * can still go live. React Native's fetch doesn't stream, so the NDJSON response is read in one go.
 */
export async function buildStore(input: BuildInput) {
  const seed = seedStore(input);
  let built: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    const prompt = [input.description, input.tweak ? `Requested change: ${input.tweak}` : ""].filter(Boolean).join("\n\n");
    const response = await fetch(`${API_URL}/api/ai/store-builder`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt || `A shop called ${input.storeName}.` }],
        store: seed,
        brandContext: { category: input.category ?? "", businessDescription: input.description },
        templateContext: { templateId: input.look.templateId, templateName: input.look.label, layoutFamily: input.look.label },
      }),
    });
    if (response.ok) {
      for (const line of (await response.text()).split("\n")) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as { type?: string; data?: Record<string, unknown> };
        if (event.type === "store" && event.data) built = { ...seed, ...event.data };
      }
    }
  } catch {
    built = null;
  }
  await api("/api/store/editor", { method: "PATCH", json: { hydrateFromStoreConfig: built ?? seed } });
  return { usedRex: Boolean(built) };
}
