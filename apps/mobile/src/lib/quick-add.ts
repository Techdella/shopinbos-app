import { api } from "./api";
import type { Markup, QuickPriceBasis } from "@shared/supplier-markup";

// Finding supplier products to sell, made quick (src/lib/marketplace/quick-add.server.ts on the server):
// one-tap and bulk "Add to my shop" with Undo, the seller's markup, starter packs and My supplier products.

export const QUICK_ADD_BATCH = 60;

export type QuickSkipCode =
  | "NOT_AVAILABLE"
  | "OUT_OF_STOCK"
  | "NOT_VERIFIED"
  | "PRICE_PROBLEM"
  | "PLAN_LIMIT"
  | "AGREEMENT_NEEDED"
  | "AGREEMENT_WAITING"
  | "AGREEMENT_DECLINED"
  | "TOO_FAR"
  | "NO_PLACE"
  | "PAUSED"
  | "NOT_PAYABLE";

export interface QuickSkipped {
  supplierProductId: string;
  name: string | null;
  code: QuickSkipCode;
  message: string;
  supplierId: string | null;
  supplierName: string | null;
}

export interface QuickAddResult {
  added: Array<{ supplierProductId: string; storeProductId: string; name: string; retailPrice: number; basis: QuickPriceBasis }>;
  already: Array<{ supplierProductId: string; storeProductId: string; name: string | null }>;
  skipped: QuickSkipped[];
  left: number | null;
  markup: Markup;
}

export const quickAdd = (ids: string[], markup?: Markup | null) =>
  api<QuickAddResult>("/api/mobile/marketplace/quick-add", { method: "POST", json: markup ? { ids, markup } : { ids } });

/**
 * Adds many in batches of 60 (the server's most per call), telling `onProgress` how many are done. Safe to run again
 * after a dropped connection: what's already in the shop comes back as `already`.
 */
export async function quickAddMany(ids: string[], markup: Markup | null, onProgress: (done: number, total: number) => void): Promise<QuickAddResult> {
  const total: QuickAddResult = { added: [], already: [], skipped: [], left: null, markup: markup ?? { kind: "percent", value: 30 } };
  onProgress(0, ids.length);
  for (let at = 0; at < ids.length; at += QUICK_ADD_BATCH) {
    const batch = ids.slice(at, at + QUICK_ADD_BATCH);
    const result = await quickAdd(batch, at === 0 ? markup : null);
    total.added.push(...result.added);
    total.already.push(...result.already);
    total.skipped.push(...result.skipped);
    total.left = result.left;
    total.markup = result.markup;
    onProgress(Math.min(ids.length, at + batch.length), ids.length);
    // The plan is full: the rest would be refused the same way.
    if (result.left === 0 && at + QUICK_ADD_BATCH < ids.length) {
      for (const id of ids.slice(at + QUICK_ADD_BATCH)) total.skipped.push({ supplierProductId: id, name: null, code: "PLAN_LIMIT", message: result.skipped.find((item) => item.code === "PLAN_LIMIT")?.message ?? "", supplierId: null, supplierName: null });
      onProgress(ids.length, ids.length);
      break;
    }
  }
  return total;
}

export const undoQuickAdd = (storeProductIds: string[]) =>
  api<{ removed: number }>("/api/mobile/marketplace/quick-add/undo", { method: "POST", json: { storeProductIds } });

export const fetchMarkup = () => api<{ markup: Markup; asked: boolean }>("/api/mobile/marketplace/markup");
export const saveMarkup = (markup: Markup) => api<{ markup: Markup; asked: boolean }>("/api/mobile/marketplace/markup", { method: "PUT", json: markup });

export interface PackItem {
  id: string;
  name: string;
  image: string | null;
  category: string;
  supplierName: string;
  cost: number;
  price: number;
  ready: boolean;
  dropship: boolean;
}

export interface StarterPack {
  id: string;
  title: string;
  icon: "tag" | "phone" | "sparkle" | "home" | "star";
  size: number;
  count: number;
  totalCost: number;
  totalPrice: number;
  readyCount: number;
  needsAgreement: Array<{ id: string; name: string }>;
  items: PackItem[];
}

export const fetchPacks = () => api<{ packs: StarterPack[]; markup: Markup; asked: boolean }>("/api/mobile/marketplace/packs");

export interface MySupplierProduct {
  id: string;
  supplierProductId: string;
  name: string;
  image: string | null;
  status: string;
  dropship: boolean;
  supplierName: string;
  price: number;
  cost: number;
  lowest: number | null;
  stock: number;
  unavailable: boolean;
  /** Paused by Shopinbos: the supplier's new price would make a sale lose money (newer servers, shared/price-notice.ts). */
  pausedForPrice?: boolean;
  /** "Raise to ₦X": the lowest nice price that sells it again without a loss. */
  fixPrice?: number | null;
  /** The supplier's price rise on notice: what you'll pay per piece and from when (ISO). */
  priceChange?: { cost: number; at: string } | null;
}

/** One tap on a product paused for a price loss: raised to its fix price and back on the store. */
export const fixMine = (id: string) => api<{ price: number }>("/api/mobile/marketplace/mine", { method: "POST", json: { action: "fix", id } });

export const fetchMine = () => api<{ products: MySupplierProduct[]; markup: Markup; asked: boolean }>("/api/mobile/marketplace/mine");

export const repriceMine = (ids: string[], change: { markup: Markup } | { suggested: true }) =>
  api<{ updated: Array<{ id: string; price: number }>; skipped: Array<{ id: string; name: string; message: string }> }>("/api/mobile/marketplace/mine", { method: "POST", json: { action: "reprice", ids, ...change } });

export const removeMine = (ids: string[]) => api<{ removed: number }>("/api/mobile/marketplace/mine", { method: "POST", json: { action: "remove", ids } });

/** Skips grouped for the summary: one line per supplier for an agreement, one per reason otherwise. */
export function groupSkipped(skipped: readonly QuickSkipped[]) {
  const groups: Array<{ key: string; code: QuickSkipCode; supplierId: string | null; supplierName: string | null; message: string; count: number; firstId: string }> = [];
  for (const item of skipped) {
    const perSupplier = item.code.startsWith("AGREEMENT") || item.code === "TOO_FAR";
    const key = perSupplier ? `${item.code}:${item.supplierId}` : item.code;
    const found = groups.find((group) => group.key === key);
    if (found) found.count += 1;
    else groups.push({ key, code: item.code, supplierId: perSupplier ? item.supplierId : null, supplierName: perSupplier ? item.supplierName : null, message: item.message, count: 1, firstId: item.supplierProductId });
  }
  return groups;
}
