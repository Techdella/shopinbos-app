"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StoreLaunchPricing } from "@/components/billing/StoreLaunchBillingModal";
import type { SurfaceStore } from "@/components/storefront/TemplateStorefrontSurface";
import { createBlankEditorSnapshot, isBoutiqueTheme, type StoreEditorPatchOp, type StoreEditorSnapshot } from "@/lib/store-templates";
import { migrateSnapshot } from "@/lib/store-templates/section-content";
import { normalizeChrome, propagateChrome } from "@/lib/store-templates/chrome";
import { heroDefaultLayout } from "./section-schema";
import { readShopperInfo, type StorefrontShopperInfo } from "@/lib/storefront/shopper-info";
import type { ShopperStock } from "@shared/product-stock";
import { useEditorT } from "./i18n";
import {
  canRedo,
  canUndo,
  createHistory,
  publishState,
  pushHistory,
  redoHistory,
  snapshotKey,
  undoHistory,
  type History,
} from "./editor-logic";

export interface BuilderProduct {
  id: string;
  name: string;
  description?: string | null;
  retailPrice: number | null;
  currency: string | null;
  images: string[];
  avgRating?: number;
  reviewCount?: number;
  category?: { id: string; name: string; slug: string } | null;
  /** Product page fields, so the builder's product page preview shows the real product. */
  compareAtPrice?: number | null;
  variants?: unknown;
  variantOptions?: unknown;
  productType?: string | null;
  productDetails?: unknown;
  relatedProductIds?: string[];
  tags?: string[];
  sku?: string | null;
  longDescription?: string | null;
  specifications?: unknown;
  faqs?: unknown;
  careInstructions?: string | null;
  shippingInfo?: string | null;
  returnPolicy?: string | null;
  warranty?: string | null;
  supportInfo?: string | null;
  videoUrl?: string | null;
  /** Tracked stock as shoppers see it (shared/product-stock.ts); null when not tracked. */
  stock?: ShopperStock | null;
  supplierProduct?: { stockQuantity?: number | null } | null;
  /** The product's own page layout / sections (product-override.ts). */
  pageLayout?: unknown;
  lowStockThreshold?: number | null;
}

export interface BuilderStore {
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  city: string | null;
  country: string | null;
  currency: string;
  storefrontUrl: string | null;
  products: BuilderProduct[];
  shopper: StorefrontShopperInfo;
  rawShopper: unknown;
}

const AUTOSAVE_MS = 5000;

const EMPTY_STORE: BuilderStore = {
  name: "My store",
  slug: "",
  description: null,
  logoUrl: null,
  city: null,
  country: null,
  currency: "NGN",
  storefrontUrl: null,
  products: [],
  shopper: readShopperInfo(null),
  rawShopper: null,
};

export type ToastAction = { label: string; href?: string; run?: () => void };
export type Toast = { id: number; message: string; tone: "ok" | "error"; action?: ToastAction };

export function storefrontHost(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // Shops at app.shopinbos.com/s/<slug> show their path too.
    return `${parsed.host}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

/** Draft, undo history, autosave, publish and the store data the canvas renders. */
export function useBuilder() {
  // Messages are read through refs so a language change never re-runs loading or saving.
  const words = useEditorT();
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const tx = (text: string) => wordsRef.current.tx(text);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [store, setStore] = useState<BuilderStore>(EMPTY_STORE);
  const [history, setHistory] = useState<History<StoreEditorSnapshot | null>>(() => createHistory<StoreEditorSnapshot | null>(null));
  const [savedKey, setSavedKey] = useState("");
  const [published, setPublished] = useState<StoreEditorSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [launchPricing, setLaunchPricing] = useState<StoreLaunchPricing | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const draft = history.present;
  const draftKey = useMemo(() => snapshotKey(draft), [draft]);
  const dirty = Boolean(draft) && draftKey !== savedKey;

  const showToast = useCallback((message: string, tone: Toast["tone"] = "ok", action?: ToastAction) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, tone, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 8000 : 3200);
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const resetDraft = useCallback((next: StoreEditorSnapshot | null, saved = true) => {
    setHistory(createHistory(next));
    if (saved) setSavedKey(snapshotKey(next));
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch("/api/store/editor", { cache: "no-store" });
      const json = await response.json().catch(() => null) as { data?: Record<string, unknown>; error?: { message?: string } } | null;
      if (!response.ok || !json?.data) throw new Error(json?.error?.message ?? tx("Your store couldn't be loaded."));
      const raw = (json.data.store ?? {}) as Record<string, unknown>;
      setStore({
        name: typeof raw.name === "string" ? raw.name : EMPTY_STORE.name,
        slug: typeof raw.slug === "string" ? raw.slug : "",
        description: typeof raw.description === "string" ? raw.description : null,
        logoUrl: typeof raw.logoUrl === "string" ? raw.logoUrl : null,
        city: typeof raw.city === "string" ? raw.city : null,
        country: typeof raw.country === "string" ? raw.country : null,
        currency: typeof raw.currency === "string" && raw.currency ? raw.currency : "NGN",
        storefrontUrl: typeof raw.storefrontUrl === "string" ? raw.storefrontUrl : null,
        products: Array.isArray(raw.storeProducts) ? (raw.storeProducts as BuilderProduct[]) : [],
        shopper: readShopperInfo(raw.shopper),
        rawShopper: raw.shopper ?? null,
      });
      // Older saves are upgraded in memory (slides get their own words, renamed layouts…); the published copy is
      // upgraded the same way so the upgrade alone never shows as unpublished changes.
      // Older saves could also carry a different header or footer per page: every page now shares the home page's.
      const upgrade = (snapshot: StoreEditorSnapshot | null) => normalizeChrome(migrateSnapshot(snapshot, { heroDefault: snapshot ? heroDefaultLayout(isBoutiqueTheme(snapshot.templateId) ? "boutique" : "classic", snapshot.templateId) : undefined }));
      const nextDraft = upgrade((json.data.draft as StoreEditorSnapshot | null | undefined) ?? null);
      resetDraft(nextDraft && Array.isArray(nextDraft.pages) ? nextDraft : null);
      setPublished(upgrade((json.data.published as StoreEditorSnapshot | null | undefined) ?? null));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : tx("Your store couldn't be loaded."));
    } finally {
      setLoading(false);
    }
  }, [resetDraft]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Every edit goes through here so it can be undone. Edits sharing a key (typing in one field) merge. The header,
   * announcement bar and footer are shared by every page, so changing them on one page changes them everywhere.
   */
  const commit = useCallback((updater: (snapshot: StoreEditorSnapshot) => StoreEditorSnapshot, key?: string) => {
    setHistory((current) => {
      if (!current.present) return current;
      const next = propagateChrome(current.present, updater(current.present));
      if (next === current.present) return current;
      return pushHistory(current, { ...next, updatedAt: new Date().toISOString() }, { key: key ?? null });
    });
  }, []);

  const undo = useCallback(() => setHistory((current) => undoHistory(current)), []);
  const redo = useCallback(() => setHistory((current) => redoHistory(current)), []);

  const persist = useCallback(async (snapshot: StoreEditorSnapshot) => {
    const response = await fetch("/api/store/editor", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot }),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new Error(json?.error?.message ?? tx("Your changes couldn't be saved."));
    }
    setSavedKey(snapshotKey(snapshot));
  }, []);

  const draftRef = useRef(draft);
  draftRef.current = draft;

  // An autosave that failed isn't retried for the same content; the next edit (or Save) tries again.
  const failedKey = useRef<string | null>(null);

  const save = useCallback(async (options: { quiet?: boolean } = {}) => {
    const snapshot = draftRef.current;
    if (!snapshot) return true;
    setSaving(true);
    try {
      await persist(snapshot);
      failedKey.current = null;
      if (!options.quiet) showToast(tx("Saved"));
      return true;
    } catch (error) {
      failedKey.current = snapshotKey(snapshot);
      showToast(error instanceof Error ? error.message : tx("Your changes couldn't be saved."), "error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [persist, showToast]);

  // Drafts save themselves a few seconds after the last change; Publish is what shoppers see.
  useEffect(() => {
    if (!dirty || saving || failedKey.current === draftKey) return;
    const timer = setTimeout(() => { void save({ quiet: true }); }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, draftKey, saving, save]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const publish = useCallback(async () => {
    if (!draftRef.current) return;
    setPublishing(true);
    try {
      // Publishing reads the saved draft, so the latest edits are saved first.
      if (snapshotKey(draftRef.current) !== savedKey) await persist(draftRef.current);
      const response = await fetch("/api/store/editor/publish", { method: "POST" });
      const json = await response.json().catch(() => null) as {
        data?: { published?: StoreEditorSnapshot | null };
        billing?: StoreLaunchPricing;
        error?: { message?: string; blockers?: string[] };
      } | null;
      if (response.status === 402 && json?.billing) {
        setLaunchPricing(json.billing);
        return;
      }
      if (!response.ok) throw new Error(json?.error?.blockers?.[0] ?? json?.error?.message ?? tx("Your store couldn't be published."));
      setPublished(json?.data?.published ?? draftRef.current);
      const host = storefrontHost(store.storefrontUrl);
      showToast(host ? wordsRef.current.t("edk.publishedTo", { host }) : tx("Published"), "ok", store.storefrontUrl ? { href: store.storefrontUrl, label: tx("View store") } : undefined);
    } catch (error) {
      showToast(error instanceof Error ? error.message : tx("Your store couldn't be published."), "error");
    } finally {
      setPublishing(false);
    }
  }, [persist, savedKey, showToast, store.storefrontUrl]);

  const startBlank = useCallback(async () => {
    const next = createBlankEditorSnapshot(store.name);
    resetDraft(next, false);
    try {
      await persist(next);
      showToast(tx("Blank store created"));
    } catch {
      showToast(tx("Blank store created here. It saves when you're back online."), "error");
    }
  }, [persist, resetDraft, showToast, store.name]);

  /** Rex's edits apply to the saved draft, so local edits are saved first and the result replaces the draft. */
  const applyOps = useCallback(async (ops: StoreEditorPatchOp[]) => {
    if (draftRef.current && snapshotKey(draftRef.current) !== savedKey) await persist(draftRef.current);
    const response = await fetch("/api/store/editor", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ops }),
    });
    const json = await response.json().catch(() => null) as { data?: { draft?: StoreEditorSnapshot | null }; error?: { message?: string } } | null;
    if (!response.ok || !json?.data?.draft) throw new Error(json?.error?.message ?? tx("Rex's change couldn't be applied."));
    // An older saved draft can still hold per-page headers; the builder always works on the shared one.
    const next = normalizeChrome(json.data.draft);
    // Kept undoable: Undo takes the store back to before Rex's change (and autosaves that).
    setHistory((current) => pushHistory(current, next));
    // What the server holds; when normalising changed it, autosave stores the shared version.
    setSavedKey(snapshotKey(json.data.draft));
  }, [persist, savedKey]);

  const surfaceStore: SurfaceStore = useMemo(() => ({
    name: store.name,
    slug: store.slug,
    description: store.description,
    logoUrl: store.logoUrl,
    city: store.city,
    country: store.country,
    currency: store.currency,
    shopper: store.rawShopper ?? undefined,
    storeProducts: store.products.map((product) => ({
      id: product.id,
      name: product.name,
      description: product.description ?? null,
      images: product.images ?? [],
      retailPrice: product.retailPrice ?? 0,
      currency: product.currency ?? store.currency,
      avgRating: product.avgRating,
      reviewCount: product.reviewCount,
      category: product.category ?? null,
      compareAtPrice: product.compareAtPrice ?? null,
      variants: product.variants,
      variantOptions: product.variantOptions,
      productType: product.productType,
      productDetails: product.productDetails,
      relatedProductIds: product.relatedProductIds,
      tags: product.tags,
      sku: product.sku,
      longDescription: product.longDescription,
      specifications: product.specifications,
      faqs: product.faqs,
      careInstructions: product.careInstructions,
      shippingInfo: product.shippingInfo,
      returnPolicy: product.returnPolicy,
      warranty: product.warranty,
      supportInfo: product.supportInfo,
      videoUrl: product.videoUrl,
      stock: product.stock ?? null,
      supplierProduct: product.supplierProduct ?? null,
      pageLayout: product.pageLayout,
      lowStockThreshold: product.lowStockThreshold,
    })),
  }), [store]);

  const status = useMemo(() => publishState(draft, published), [draft, published]);

  return {
    loading,
    loadError,
    reload: load,
    store,
    setStore,
    surfaceStore,
    draft,
    published,
    status,
    dirty,
    saving,
    publishing,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    commit,
    undo,
    redo,
    save,
    publish,
    startBlank,
    applyOps,
    resetDraft,
    launchPricing,
    clearLaunchPricing: () => setLaunchPricing(null),
    toast,
    showToast,
    dismissToast,
  };
}

export type Builder = ReturnType<typeof useBuilder>;
