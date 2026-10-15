"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Notice, PillButton, Toggle, cx } from "@/components/app-ui";
import {
  DEFAULT_BUY_BLOCKS,
  DEFAULT_PAGE_BLOCKS,
  PDP_BUY_BLOCKS,
  PDP_LAYOUT_OPTIONS,
  PDP_PAGE_BLOCKS,
  toggleInOrder,
  type PdpBuyBlock,
  type PdpLayout,
  type PdpPageBlock,
} from "@/components/storefront/boutique/pdp/pdp-logic";
import { readProductPageOverride, writeProductPageOverride } from "@/components/storefront/boutique/pdp/product-override";
import { Icon } from "@/components/ui/Icon";
import { field } from "@/components/seller-core";
import { SeoTab } from "@/components/seo/SeoTab";
import { MediaLibraryDialog } from "@/components/media/MediaLibraryDialog";
import { normalizeSeo, type SeoFields } from "@/lib/seo/fields";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { useT } from "@/components/i18n/I18nProvider";
import { ProductTypeDetails, ProductTypePicker } from "@/app/components/product-form/ProductTypeFields";
import { VariantsEditor } from "@/app/components/product-form/VariantsEditor";
import { RelatedPicker, type RelatedOption } from "@/app/components/product-form/RelatedPicker";
import { ProductPeggy, type ProductPeggyHandle } from "@/app/components/product-form/ProductPeggy";
import { isProductTypeKey, readProductDetails, type ProductTypeKey } from "@shared/product-types";
import { normalizeVariants, readVariantOptions, serializeVariants, totalVariantStock, type ProductVariant, type VariantOption } from "@shared/product-variants";
import { applySuggestion, type AssistantFormState, type SuggestionInput } from "@shared/product-assistant";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Product {
  id: string;
  name: string;
  description: string | null;
  longDescription: string | null;
  specifications: unknown;
  faqs: unknown;
  careInstructions: string | null;
  shippingInfo: string | null;
  returnPolicy: string | null;
  warranty: string | null;
  supportInfo: string | null;
  sku: string | null;
  barcode: string | null;
  images: string[];
  videoUrl: string | null;
  has360View: boolean;
  retailPrice: number;
  costPrice: number | null;
  compareAtPrice: number | null;
  weight: number | null;
  weightUnit: string;
  dimensions: unknown;
  fulfillmentType: string;
  status: string;
  visibility: string;
  salesChannel: string;
  inventoryType: string;
  categoryId: string | null;
  tags: string[];
  featured: boolean;
  productType?: string | null;
  productDetails?: unknown;
  variants?: unknown;
  variantOptions?: unknown;
  relatedProductIds?: string[];
  currentStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  trackStock?: boolean;
  continueSellingWhenOut?: boolean;
  /** This product's own page layout / parts (product-override.ts). */
  pageLayout?: unknown;
  seoTitle: string | null;
  seoDescription: string | null;
  category: { id: string; name: string } | null;
}

interface ProductFormProps {
  product: Product | null;
  categories: Category[];
  isEdit: boolean;
  /** For the SEO tab's previews: the storefront origin and store name. */
  storeOrigin?: string;
  storeName?: string;
  /** The store's other products, for "Customers also like". */
  storeProducts?: RelatedOption[];
}

const TABS = ["Details", "Visibility and channels", "Price and stock", "Description", "Product page", "SEO"];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Live" },
  { value: "archived", label: "Archived" },
];

const VISIBILITY_OPTIONS = [
  { value: "hidden", label: "Hidden" },
  { value: "storefront", label: "Storefront" },
  { value: "featured", label: "Featured" },
  { value: "collection_only", label: "Collections only" },
];

const INVENTORY_TYPES = [
  { value: "seller", label: "My own stock" },
  { value: "dropshipping", label: "Dropshipping" },
  { value: "source_on_demand", label: "Source on demand" },
  { value: "print_on_demand", label: "Print on demand" },
  { value: "digital", label: "Digital" },
];

const SALES_CHANNELS = [
  { value: "website", label: "Website" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "marketplace", label: "Marketplace" },
];

const FULFILLMENT_OPTIONS = [
  { value: "merchant_fulfilled", label: "I fulfil it" },
  { value: "dropship", label: "Dropship" },
  { value: "wholesale_stocked", label: "Wholesale stock" },
];

// The product page tab chooses this product's own layout and parts over the store's Product page settings (builder).
// The older "page variant" (Shopify, Amazon…) and module checkboxes were never read by any storefront; they are no
// longer shown or saved (product-override.ts explains why their saved defaults are ignored).

type SpecItem = { id: string; name: string; value: string };
type FaqItem = { id: string; question: string; answer: string };

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function ProductForm({ product, categories, isEdit, storeOrigin = "", storeName = "Your store", storeProducts = [] }: ProductFormProps) {
  const router = useRouter();
  const t = useT("productTypes");
  const peggyRef = useRef<ProductPeggyHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [longDescription, setLongDescription] = useState(product?.longDescription ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [tagsStr, setTagsStr] = useState(product?.tags?.join(", ") ?? "");
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState(product?.videoUrl ?? "");

  // "active" is an older spelling of Live; storefronts only sell "published".
  const [status, setStatus] = useState(product?.status === "active" ? "published" : product?.status ?? "draft");
  const [visibility, setVisibility] = useState(product?.visibility ?? "hidden");
  const [salesChannels, setSalesChannels] = useState<string[]>(product?.salesChannel ? [product.salesChannel] : ["website"]);
  const [featured, setFeatured] = useState(product?.featured ?? false);
  // Search title/description live on the product; the rest of the SEO tab (share card, canonical, noindex,
  // main phrase) is saved to /api/app/seo after the product itself.
  const [seo, setSeo] = useState<SeoFields>(() => normalizeSeo({ metaTitle: product?.seoTitle ?? "", metaDescription: product?.seoDescription ?? "" }));
  const productId = product?.id ?? null;
  useEffect(() => {
    if (!productId) return;
    let active = true;
    fetch(`/api/app/seo?${new URLSearchParams({ resourceType: "product", resourceId: productId })}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { data?: unknown } | null) => {
        if (!active || !json?.data) return;
        const stored = normalizeSeo(json.data);
        setSeo((current) => ({ ...stored, metaTitle: current.metaTitle, metaDescription: current.metaDescription }));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [productId]);

  const [inventoryType, setInventoryType] = useState(product?.inventoryType ?? "seller");
  const [retailPrice, setRetailPrice] = useState(product?.retailPrice?.toString() ?? "");
  const [costPrice, setCostPrice] = useState(product?.costPrice?.toString() ?? "");
  const [compareAtPrice, setCompareAtPrice] = useState(product?.compareAtPrice?.toString() ?? "");
  const [currentStock, setCurrentStock] = useState(product?.currentStock?.toString() ?? "0");
  const [reservedStock, setReservedStock] = useState(product?.reservedStock?.toString() ?? "0");
  const [lowStockThreshold, setLowStockThreshold] = useState(product?.lowStockThreshold?.toString() ?? "10");
  const [weight, setWeight] = useState(product?.weight?.toString() ?? "");
  const [weightUnit, setWeightUnit] = useState(product?.weightUnit ?? "kg");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
  const [fulfillmentType, setFulfillmentType] = useState(product?.fulfillmentType ?? "merchant_fulfilled");

  const [specs, setSpecs] = useState<SpecItem[]>(
    Array.isArray(product?.specifications) ? (product.specifications as Array<{ name: string; value: string }>).map((s) => ({ ...s, id: uid() })) : [],
  );
  const [faqs, setFaqs] = useState<FaqItem[]>(
    Array.isArray(product?.faqs) ? (product.faqs as Array<{ question: string; answer: string }>).map((f) => ({ ...f, id: uid() })) : [],
  );
  const [careInstructions, setCareInstructions] = useState(product?.careInstructions ?? "");
  const [shippingInfo, setShippingInfo] = useState(product?.shippingInfo ?? "");
  const [returnPolicy, setReturnPolicy] = useState(product?.returnPolicy ?? "");
  const [warranty, setWarranty] = useState(product?.warranty ?? "");
  const [supportInfo, setSupportInfo] = useState(product?.supportInfo ?? "");

  // Type (preset category) and its details, the versions (sizes, colours…) and "Customers also like".
  const [productType, setProductType] = useState<ProductTypeKey | null>(isProductTypeKey(product?.productType) ? product.productType : product ? "other" : null);
  const [details, setDetails] = useState<Record<string, string>>(() => readProductDetails(product?.productDetails));
  const [variants, setVariants] = useState<ProductVariant[]>(() => normalizeVariants(product?.variants));
  const [options, setOptions] = useState<VariantOption[]>(() => readVariantOptions(product?.variantOptions, normalizeVariants(product?.variants)));
  const [relatedIds, setRelatedIds] = useState<string[]>(product?.relatedProductIds ?? []);
  const [peggyNote, setPeggyNote] = useState("");

  // "Track stock": off = never sold out, the count isn't used. Products from before the switch were backfilled.
  const [trackStock, setTrackStock] = useState(Boolean(product?.trackStock));
  const [continueSelling, setContinueSelling] = useState(Boolean(product?.continueSellingWhenOut));

  // This product's own page: null = the store's Product page settings (builder) for that part.
  const [pageOverride] = useState(() => readProductPageOverride(product?.pageLayout));
  const [pageLayoutChoice, setPageLayoutChoice] = useState<PdpLayout | null>(pageOverride.layout);
  const [buyBoxChoice, setBuyBoxChoice] = useState<PdpBuyBlock[] | null>(pageOverride.buyBox);
  const [sectionsChoice, setSectionsChoice] = useState<PdpPageBlock[] | null>(pageOverride.sections);
  const customParts = buyBoxChoice !== null || sectionsChoice !== null;

  /** A new main price: versions that simply followed it follow it again. */
  function changeRetailPrice(next: string) {
    const before = parseFloat(retailPrice);
    const after = parseFloat(next);
    setRetailPrice(next);
    if (Number.isFinite(before) && Number.isFinite(after)) {
      setVariants((rows) => rows.map((row) => (row.price === before ? { ...row, price: after } : row)));
    }
  }

  const basePrice = Number.isFinite(parseFloat(retailPrice)) ? parseFloat(retailPrice) : null;
  // Dropship products sell the supplier's stock; every other kind can be counted when the seller turns it on.
  const canTrack = inventoryType !== "dropshipping" && fulfillmentType !== "dropship";
  const tracking = canTrack && trackStock;
  // Sizes / colours get their own counts only for the seller's own stock, and only while it is tracked.
  const countsStock = inventoryType === "seller" && tracking;
  const variantStock = countsStock ? totalVariantStock(variants) : null;
  const usableOptions = options.filter((option) => option.name.trim() && option.values.length);

  /** The variant-related fields as the API takes them. */
  function variantPayload(state: { options: VariantOption[]; variants: ProductVariant[] }) {
    const opts = state.options.filter((option) => option.name.trim() && option.values.length).map((option) => ({ name: option.name.trim(), values: option.values }));
    return { variantOptions: opts, variants: serializeVariants(state.variants, opts) };
  }

  /** The form as Peggy reads it. */
  function assistantState(): AssistantFormState {
    return {
      name,
      description,
      productType,
      basePrice,
      options: usableOptions,
      variants,
      details: { ...details, ...(careInstructions ? { care: careInstructions } : {}), ...(warranty ? { warranty } : {}) },
      customDetails: specs.filter((spec) => spec.name.trim()).map((spec) => ({ name: spec.name, value: spec.value })),
    };
  }

  /** Peggy's suggestion into the form; on a saved product the changed parts are saved straight away. */
  async function applyPeggy(suggestion: SuggestionInput): Promise<string | null> {
    const { state } = applySuggestion(assistantState(), suggestion);
    setProductType(state.productType);
    if (state.name !== name) setName(state.name);
    if (state.description !== description) setDescription(state.description);
    if (state.basePrice !== basePrice && state.basePrice !== null) setRetailPrice(String(state.basePrice));
    setOptions(state.options);
    setVariants(state.variants);
    const { care, warranty: warrantyText, ...rest } = state.details;
    setDetails(rest);
    if (care !== undefined) setCareInstructions(care);
    if (warrantyText !== undefined) setWarranty(warrantyText);
    setSpecs(state.customDetails.map((detail) => ({ id: uid(), ...detail })));
    setPeggyNote(t("peggy.filledNote"));
    if (!isEdit || !product) return t("peggy.appliedNew");
    try {
      const res = await fetch(`/api/store/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...variantPayload(state),
          productType: state.productType,
          productDetails: rest,
          ...(care !== undefined ? { careInstructions: care } : {}),
          ...(warrantyText !== undefined ? { warranty: warrantyText } : {}),
          specifications: state.customDetails.filter((detail) => detail.name.trim() && detail.value.trim()),
          ...(state.basePrice !== null ? { retailPrice: state.basePrice } : {}),
          ...(state.name.trim().length >= 2 ? { name: state.name.trim() } : {}),
          ...(state.description ? { description: state.description } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        return t("peggy.saveFailed", { reason: err?.error?.message ?? "" });
      }
      router.refresh();
      return t("peggy.appliedSaved");
    } catch {
      return t("peggy.saveFailed", { reason: "" });
    }
  }

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "products");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error("Upload failed");
        const data = await res.json();
        uploaded.push(data.data.publicUrl);
      }
      setImages((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const toggleSalesChannel = (ch: string) => {
    setSalesChannels((prev) => prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]);
  };

  /** "Use store settings" or "Choose for this product" for the parts of the page (starting from everything on). */
  const setCustomParts = (custom: boolean) => {
    setBuyBoxChoice(custom ? [...DEFAULT_BUY_BLOCKS] : null);
    setSectionsChoice(custom ? [...DEFAULT_PAGE_BLOCKS] : null);
  };

  const addSpec = () => setSpecs((prev) => [...prev, { id: uid(), name: "", value: "" }]);
  const updateSpec = (id: string, field: "name" | "value", val: string) =>
    setSpecs((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: val } : s)));
  const removeSpec = (id: string) => setSpecs((prev) => prev.filter((s) => s.id !== id));

  const addFaq = () => setFaqs((prev) => [...prev, { id: uid(), question: "", answer: "" }]);
  const updateFaq = (id: string, field: "question" | "answer", val: string) =>
    setFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: val } : f)));
  const removeFaq = (id: string) => setFaqs((prev) => prev.filter((f) => f.id !== id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const tags = tagsStr.split(",").map((t) => t.trim()).filter(Boolean);

    const payload: Record<string, unknown> = {
      name,
      description: description || undefined,
      longDescription: longDescription || undefined,
      specifications: specs.filter((s) => s.name.trim()).map(({ id: _id, ...rest }) => rest),
      faqs: faqs.filter((f) => f.question.trim()).map(({ id: _id, ...rest }) => rest),
      careInstructions: careInstructions || undefined,
      shippingInfo: shippingInfo || undefined,
      returnPolicy: returnPolicy || undefined,
      warranty: warranty || undefined,
      supportInfo: supportInfo || undefined,
      sku: sku || undefined,
      barcode: barcode || undefined,
      images,
      videoUrl: videoUrl || undefined,
      retailPrice: parseFloat(retailPrice),
      costPrice: costPrice ? parseFloat(costPrice) : undefined,
      compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : undefined,
      weight: weight ? parseFloat(weight) : undefined,
      weightUnit,
      fulfillmentType,
      status,
      visibility,
      salesChannel: salesChannels[0] ?? "website",
      inventoryType,
      categoryId: categoryId || undefined,
      tags,
      featured,
      currentStock: variantStock ?? (parseInt(currentStock) || 0),
      reservedStock: parseInt(reservedStock) || 0,
      lowStockThreshold: Number.isFinite(parseInt(lowStockThreshold)) ? Math.max(0, parseInt(lowStockThreshold)) : 10,
      trackStock: tracking,
      continueSellingWhenOut: tracking && continueSelling,
      // Only what the seller chose here overrides the store's product page settings.
      pageLayout: writeProductPageOverride({ layout: pageLayoutChoice, buyBox: buyBoxChoice, sections: sectionsChoice }),
      seoTitle: seo.metaTitle.slice(0, 70) || undefined,
      seoDescription: seo.metaDescription.slice(0, 160) || undefined,
      // Type, details, versions and related products (the API checks and normalizes them).
      productType: productType ?? "other",
      productDetails: Object.fromEntries(Object.entries(details).filter(([, value]) => value.trim())),
      ...variantPayload({ options, variants }),
      relatedProductIds: relatedIds,
    };

    try {
      const method = isEdit ? "PATCH" : "POST";
      const url = isEdit ? `/api/store/products/${product!.id}` : "/api/store/products";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const saved = await res.json().catch(() => null);
        const savedId = productId ?? (saved?.data?.id as string | undefined);
        if (savedId) {
          await fetch("/api/app/seo", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resourceType: "product", resourceId: savedId, seo }) }).catch(() => null);
        }
        router.push("/products");
      } else {
        const err = await res.json().catch(() => null);
        // The API answers { error: { code, message } }; older handlers sent a plain string.
        setError(typeof err?.error === "string" ? err.error : err?.error?.message ?? "Failed to save product");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  };


  const stockNumber = variantStock ?? (parseInt(currentStock) || 0);
  const thresholdNumber = parseInt(lowStockThreshold) || 0;
  const availableNumber = stockNumber - Math.max(0, parseInt(reservedStock) || 0);

  return (
    <div className="grid gap-4">
      {error && <Notice>{error}</Notice>}
      {peggyNote && !error ? <Notice tone="success">{peggyNote}</Notice> : null}
      <ProductPeggy ref={peggyRef} isEdit={isEdit} productId={product?.id ?? null} getState={assistantState} onApply={applyPeggy} />

      <div role="tablist" aria-label="Product sections" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`product-tab-${i}`}
            aria-selected={i === activeTab}
            aria-controls="product-tab-panel"
            onClick={() => setActiveTab(i)}
            className={cx(
              "inline-flex min-h-[40px] shrink-0 items-center rounded-full border px-4 text-[14px] font-bold transition",
              i === activeTab ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4">
        <div id="product-tab-panel" role="tabpanel" aria-labelledby={`product-tab-${activeTab}`} className="grid gap-4">
          {/* Tab 1 - Details */}
          {activeTab === 0 && (
            <>
              <Section title="Basic information" sub="Tell buyers what you're selling.">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                  <Field label="Product name *">
                    <input value={name} onChange={(e) => setName(e.target.value)} className={field.input} required minLength={2} maxLength={200} placeholder="e.g. Premium leather tote bag" />
                  </Field>
                  <Field label="Tags" hint="Separate with commas">
                    <input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} className={field.input} placeholder="e.g. leather, premium, bags" />
                  </Field>
                </div>
                <ProductTypePicker value={productType} onChange={setProductType} />
                <Field label="Description">
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={field.textarea} rows={4} placeholder="Describe your product, materials, sizing, features, and what makes it special." />
                  <VoiceInputButton value={description} onChange={setDescription} context="a product description" className="mt-2" />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Category">
                    <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={field.select}>
                      <option value="">No category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Video link">
                    <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className={field.input} placeholder="https://youtube.com/watch?v=..." />
                  </Field>
                </div>
              </Section>

              <Section
                title="Photos"
                sub="Clear photos on a plain background sell best."
                action={
                  <>
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold hover:border-app-line-strong">
                      <Icon name="upload" size={15} /> Upload photos
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" aria-label="Upload product photos" onChange={(e) => handleUpload(e.target.files)} />
                    <button type="button" onClick={() => setLibraryOpen(true)} className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold hover:border-app-line-strong">
                      <Icon name="grid" size={15} /> Choose from my media
                    </button>
                    <MediaLibraryDialog
                      open={libraryOpen}
                      multiple
                      title="Choose product photos"
                      onClose={() => setLibraryOpen(false)}
                      onSelect={(assets) => setImages((prev) => [...prev, ...assets.map((asset) => asset.url).filter((url) => !prev.includes(url))])}
                    />
                  </>
                }
              >
                {images.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
                    {images.map((url, i) => (
                      <div key={i} className="relative aspect-square overflow-hidden rounded-[14px] border border-app-line bg-app-canvas">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Product photo ${i + 1}`} className="h-full w-full object-cover" />
                        <button type="button" onClick={() => removeImage(i)} aria-label={`Remove photo ${i + 1}`} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-app-ink/70 text-white hover:bg-app-ink">
                          <Icon name="x" size={14} />
                        </button>
                        {i === 0 && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold">Cover</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="grid w-full place-items-center gap-2 rounded-[18px] border-2 border-dashed border-app-line px-4 py-10 text-[14px] text-app-ink-soft hover:border-app-line-strong">
                    <Icon name="image" size={26} />
                    No photos yet. Tap to upload.
                  </button>
                )}
              </Section>
              <Section
                title={productType ? t("details.title", { type: t.dynamic(`type.${productType}`, productType) }) : t("details.titleNoType")}
                sub={t("details.sub")}
              >
                {productType ? (
                  <ProductTypeDetails
                    productType={productType}
                    details={details}
                    onDetail={(key, value) => setDetails((current) => ({ ...current, [key]: value }))}
                    columns={{ careInstructions, warranty }}
                    onColumn={(key, value) => (key === "careInstructions" ? setCareInstructions(value) : setWarranty(value))}
                  />
                ) : (
                  <p className="m-0 rounded-[16px] bg-app-canvas px-4 py-3 text-[14px] text-app-ink-soft">{t("details.pickType")}</p>
                )}
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="m-0 text-[15px] font-extrabold">{t("custom.title")}</h3>
                      <p className="m-0 text-[13px] text-app-ink-soft">{t("custom.sub")}</p>
                    </div>
                    <button type="button" onClick={addSpec} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold hover:border-app-line-strong">
                      <Icon name="plus" size={14} /> {t("custom.add")}
                    </button>
                  </div>
                  {specs.map((spec, index) => (
                    <div key={spec.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                      <input value={spec.name} onChange={(e) => updateSpec(spec.id, "name", e.target.value)} className={cx(field.input, "flex-1 basis-[40%]")} placeholder={t("custom.namePlaceholder")} aria-label={t("custom.nameLabel", { number: index + 1 })} maxLength={100} />
                      <input value={spec.value} onChange={(e) => updateSpec(spec.id, "value", e.target.value)} className={cx(field.input, "flex-1 basis-[40%]")} placeholder={t("custom.valuePlaceholder")} aria-label={t("custom.valueLabel", { number: index + 1 })} maxLength={500} />
                      <button type="button" onClick={() => removeSpec(spec.id)} aria-label={t("custom.remove", { number: index + 1 })} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint">
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title={t("v.title")} sub={t("v.sub")}>
                <VariantsEditor
                  productType={productType}
                  options={options}
                  variants={variants}
                  basePrice={basePrice}
                  images={images}
                  countsStock={countsStock}
                  onChange={(nextOptions, nextVariants) => {
                    setOptions(nextOptions);
                    setVariants(nextVariants);
                  }}
                  onAskPeggy={(prompt) => peggyRef.current?.ask(prompt)}
                />
              </Section>
            </>
          )}

          {/* Tab 2 - Visibility & Sales Channel */}
          {activeTab === 1 && (
            <>
              <Section title="Status and visibility" sub="Control where and how your product appears.">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Status">
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className={field.select}>
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Visibility">
                    <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className={field.select}>
                      {VISIBILITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>

                <fieldset className="m-0 border-0 p-0">
                  <legend className={field.label}>Sales channels</legend>
                  <div className="flex flex-wrap gap-2">
                    {SALES_CHANNELS.map((ch) => {
                      const on = salesChannels.includes(ch.value);
                      return (
                        <label key={ch.value} className={cx("inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border px-4 text-[14px] font-bold", on ? "border-app-ink bg-app-canvas" : "border-app-line bg-white")}>
                          <input type="checkbox" checked={on} onChange={() => toggleSalesChannel(ch.value)} className={field.checkbox} />
                          {ch.label}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <label className="flex cursor-pointer items-start gap-3 rounded-[16px] bg-app-canvas p-4">
                  <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} className={cx(field.checkbox, "mt-0.5")} />
                  <span>
                    <span className="block text-[14px] font-bold">Featured product</span>
                    <span className="block text-[13px] text-app-ink-soft">Featured products are highlighted on your storefront and marketing materials.</span>
                  </span>
                </label>
              </Section>

            </>
          )}

          {/* Tab 3 - Inventory & Pricing */}
          {activeTab === 2 && (
            <>
              <Section title="Where does it come from?" sub="How you hold or source this product.">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5" role="radiogroup" aria-label="Inventory type">
                  {INVENTORY_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      role="radio"
                      aria-checked={inventoryType === t.value}
                      onClick={() => setInventoryType(t.value)}
                      className={cx(
                        "min-h-[48px] rounded-[14px] border px-4 py-3 text-left text-[14px] font-bold transition",
                        inventoryType === t.value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white hover:border-app-line-strong",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Price" sub="What buyers pay, and what it costs you.">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Selling price (₦) *">
                    <input value={retailPrice} onChange={(e) => changeRetailPrice(e.target.value)} type="number" inputMode="decimal" className={field.input} required min={1} step="0.01" placeholder="25000" />
                  </Field>
                  <Field label="Cost price (₦)">
                    <input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} type="number" inputMode="decimal" className={field.input} min={0} step="0.01" placeholder="15000" />
                  </Field>
                  <Field label="Was price (₦)" hint="Shown crossed out">
                    <input value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} type="number" inputMode="decimal" className={field.input} min={0} step="0.01" placeholder="30000" />
                  </Field>
                </div>
                {retailPrice && costPrice && (
                  <p className="m-0 text-[14px] text-app-ink-soft">
                    Margin: <strong className="text-app-success">{Math.round((1 - parseFloat(costPrice) / parseFloat(retailPrice)) * 100)}%</strong>
                  </p>
                )}
              </Section>

              <Section title="Stock" sub="Count how many you have, so shoppers can't buy more than you can send.">
                {!canTrack ? (
                  <p className="m-0 rounded-[16px] bg-app-canvas px-4 py-3 text-[14px] text-app-ink-soft">
                    Dropship products sell your supplier&apos;s stock. When the supplier runs out, shoppers see Sold out.
                  </p>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4 rounded-[16px] bg-app-canvas p-4">
                      <span className="min-w-0">
                        <span className="block text-[14px] font-bold">Track stock</span>
                        <span className="block text-[13px] text-app-ink-soft">
                          {tracking
                            ? "Shoppers can buy up to what you have. At 0 it shows Sold out, and each order takes from the count."
                            : "Off: this product never sells out and orders don't change any count. Turn on to count it."}
                        </span>
                      </span>
                      <Toggle on={tracking} onChange={setTrackStock} label="Track stock" />
                    </div>
                    {tracking ? (
                      <>
                        <div className="grid gap-4 sm:grid-cols-3">
                          <Field label="Quantity in stock" hint={variantStock !== null ? t("stock.fromOptions") : undefined}>
                            <input value={variantStock ?? currentStock} onChange={(e) => setCurrentStock(e.target.value)} type="number" inputMode="numeric" className={field.input} min={0} disabled={variantStock !== null} />
                          </Field>
                          <Field label="Set aside" hint="Not for sale online (kept for a customer, display…)">
                            <input value={reservedStock} onChange={(e) => setReservedStock(e.target.value)} type="number" inputMode="numeric" className={field.input} min={0} />
                          </Field>
                          <Field label="Low stock alert at" hint={`You get an alert, and shoppers see "Only ${thresholdNumber > 0 ? thresholdNumber : 5} left", at this count.`}>
                            <input value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} type="number" inputMode="numeric" className={field.input} min={0} />
                          </Field>
                        </div>
                        <p className="m-0 flex items-center gap-2 text-[14px]">
                          <span aria-hidden className={cx("h-2 w-2 rounded-full", availableNumber <= 0 ? "bg-app-danger" : availableNumber <= thresholdNumber ? "bg-app-accent" : "bg-app-success")} />
                          {availableNumber <= 0 ? (
                            <span className="font-bold text-app-danger">{continueSelling ? "Out of stock: shoppers can still order (you keep selling)" : "Sold out: shoppers can't buy it until you add more"}</span>
                          ) : availableNumber <= thresholdNumber ? (
                            <span className="font-bold text-app-accent-ink">{availableNumber} for sale, at or below your alert level</span>
                          ) : (
                            <span className="text-app-ink-soft">{availableNumber} for sale</span>
                          )}
                        </p>
                        <label className="flex cursor-pointer items-start gap-3 rounded-[16px] border border-app-line p-4">
                          <input type="checkbox" checked={continueSelling} onChange={(e) => setContinueSelling(e.target.checked)} className={cx(field.checkbox, "mt-0.5")} />
                          <span>
                            <span className="block text-[14px] font-bold">Keep selling when out of stock</span>
                            <span className="block text-[13px] text-app-ink-soft">Shoppers can still order at 0 (the count goes below 0). Use it only if you can restock quickly.</span>
                          </span>
                        </label>
                      </>
                    ) : null}
                  </>
                )}
              </Section>

              <Section title="Shipping and fulfilment" sub="Weight, codes and who sends it out.">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Weight">
                    <div className="flex gap-2">
                      <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" inputMode="decimal" className={cx(field.input, "min-w-0 flex-1")} min={0} step="0.01" placeholder="0.5" aria-label="Weight" />
                      {/* The unit sits in a fixed-width box: field.select is w-full, which used to squeeze the number box to nothing. */}
                      <div className="w-[96px] shrink-0">
                        <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} className={field.select} aria-label="Weight unit">
                          <option value="kg">kg</option>
                          <option value="g">g</option>
                          <option value="lb">lb</option>
                          <option value="oz">oz</option>
                        </select>
                      </div>
                    </div>
                  </Field>
                  <Field label="SKU">
                    <input value={sku} onChange={(e) => setSku(e.target.value)} className={field.input} placeholder="LTH-TOTE-001" />
                  </Field>
                  <Field label="Barcode">
                    <input value={barcode} onChange={(e) => setBarcode(e.target.value)} className={field.input} placeholder="UPC / EAN / ISBN" />
                  </Field>
                  <Field label="Fulfilment">
                    <select value={fulfillmentType} onChange={(e) => setFulfillmentType(e.target.value)} className={field.select}>
                      {FULFILLMENT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </Section>
            </>
          )}

          {/* Tab 4 - Description Builder */}
          {activeTab === 3 && (
            <>
              <Section title="Full description" sub="Everything a buyer might want to know.">
                <Field label="Long description">
                  <textarea value={longDescription} onChange={(e) => setLongDescription(e.target.value)} className={field.textarea} rows={8} placeholder="Full product description with details about materials, sizing, care, and features..." />
                </Field>
              </Section>

              <Section
                title="Questions buyers ask"
                sub="Answer them once here."
                action={
                  <button type="button" onClick={addFaq} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold hover:border-app-line-strong">
                    <Icon name="plus" size={14} /> Add question
                  </button>
                }
              >
                {faqs.length === 0 ? (
                  <p className="m-0 rounded-[16px] border-2 border-dashed border-app-line px-4 py-6 text-center text-[14px] text-app-ink-soft">
                    No questions yet. Add common questions buyers ask about this product.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {faqs.map((faq, index) => (
                      <div key={faq.id} className="grid gap-2 rounded-[16px] bg-app-canvas p-3">
                        <div className="flex gap-2">
                          <input value={faq.question} onChange={(e) => updateFaq(faq.id, "question", e.target.value)} className={cx(field.input, "flex-1")} placeholder="Question" aria-label={`Question ${index + 1}`} />
                          <button type="button" onClick={() => removeFaq(faq.id)} aria-label={`Remove question ${index + 1}`} className="grid h-12 w-11 shrink-0 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint">
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                        <textarea value={faq.answer} onChange={(e) => updateFaq(faq.id, "answer", e.target.value)} className={field.textarea} rows={2} placeholder="Answer" aria-label={`Answer ${index + 1}`} />
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section title="More details" sub="Shown on the product page when filled in.">
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Care instructions">
                    <textarea value={careInstructions} onChange={(e) => setCareInstructions(e.target.value)} className={field.textarea} rows={3} placeholder="Washing, storage, and care instructions..." />
                  </Field>
                  <Field label="Shipping info">
                    <textarea value={shippingInfo} onChange={(e) => setShippingInfo(e.target.value)} className={field.textarea} rows={3} placeholder="Processing times, delivery estimates, shipping carriers..." />
                  </Field>
                  <Field label="Return policy">
                    <textarea value={returnPolicy} onChange={(e) => setReturnPolicy(e.target.value)} className={field.textarea} rows={3} placeholder="Return window, conditions, refund process..." />
                  </Field>
                  <Field label="Warranty">
                    <textarea value={warranty} onChange={(e) => setWarranty(e.target.value)} className={field.textarea} rows={3} placeholder="Warranty period, coverage, exclusions..." />
                  </Field>
                  <Field label="Support info">
                    <textarea value={supportInfo} onChange={(e) => setSupportInfo(e.target.value)} className={field.textarea} rows={3} placeholder="Contact details, support hours, response times..." />
                  </Field>
                </div>
              </Section>
            </>
          )}

          {/* Tab 5 - Product Page */}
          {activeTab === 4 && (
            <>
              <Section title={t("related.title")} sub={t("related.sub")}>
                <RelatedPicker products={storeProducts.filter((entry) => entry.id !== product?.id)} value={relatedIds} onChange={setRelatedIds} />
              </Section>

              <p className="m-0 rounded-[16px] bg-app-canvas px-4 py-3 text-[14px] text-app-ink-soft">
                Every product page follows your store&apos;s product page settings (Edit your store, then the Product page). Change them
                here only when this product needs something different, for example a bigger gallery or no reviews yet.
              </p>

              <Section title="Page layout" sub="How photos and the buying panel sit on this product's page.">
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5" role="radiogroup" aria-label="Page layout">
                  {[{ value: null, label: "Store default", hint: "Same layout as your other products." }, ...PDP_LAYOUT_OPTIONS].map((option) => {
                    const on = pageLayoutChoice === option.value;
                    return (
                      <button
                        key={option.value ?? "store"}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setPageLayoutChoice(option.value)}
                        className={cx(
                          "min-h-[48px] rounded-[14px] border px-4 py-3 text-left transition",
                          on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white hover:border-app-line-strong",
                        )}
                      >
                        <span className="block text-[14px] font-bold">{option.label}</span>
                        <span className={cx("mt-0.5 block text-[12.5px] leading-5", on ? "text-white/80" : "text-app-ink-soft")}>{option.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </Section>

              <Section title="Page sections" sub="Which parts show on this product's page.">
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Page sections">
                  {[
                    { custom: false, label: "Store default", hint: "The parts your store shows on every product page." },
                    { custom: true, label: "Choose for this product", hint: "Turn parts on or off just for this product." },
                  ].map((option) => {
                    const on = customParts === option.custom;
                    return (
                      <button
                        key={String(option.custom)}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setCustomParts(option.custom)}
                        className={cx(
                          "min-h-[48px] rounded-[14px] border px-4 py-3 text-left transition",
                          on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white hover:border-app-line-strong",
                        )}
                      >
                        <span className="block text-[14px] font-bold">{option.label}</span>
                        <span className={cx("mt-0.5 block text-[12.5px] leading-5", on ? "text-white/80" : "text-app-ink-soft")}>{option.hint}</span>
                      </button>
                    );
                  })}
                </div>
                {customParts ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <PartToggles
                      legend="Buying panel"
                      hint="The product name always shows. Parts with nothing to show (no reviews, no sizes) stay hidden."
                      options={PDP_BUY_BLOCKS}
                      value={buyBoxChoice ?? DEFAULT_BUY_BLOCKS}
                      onToggle={(id, show) => setBuyBoxChoice((list) => toggleInOrder(list ?? DEFAULT_BUY_BLOCKS, id, show, DEFAULT_BUY_BLOCKS))}
                    />
                    <PartToggles
                      legend="Below the product"
                      options={PDP_PAGE_BLOCKS}
                      value={sectionsChoice ?? DEFAULT_PAGE_BLOCKS}
                      onToggle={(id, show) => setSectionsChoice((list) => toggleInOrder(list ?? DEFAULT_PAGE_BLOCKS, id, show, DEFAULT_PAGE_BLOCKS))}
                    />
                  </div>
                ) : null}
              </Section>
            </>
          )}

          {/* Tab 6 - SEO */}
          {activeTab === 5 && (
            <SeoTab
              value={seo}
              onChange={setSeo}
              title={name ? `${name} | ${storeName}` : "Product name"}
              fallbackDescription={description}
              slug={product?.id ?? ""}
              urlPrefix={`${storeOrigin || "yourstore"}/product/`}
              siteName={storeName}
              fallbackImage={images[0] ?? null}
              content={{ bodyText: [description, longDescription].filter(Boolean).join(" ") }}
            />
          )}
        </div>

        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-[22px] border border-app-line bg-white/95 px-4 py-3 shadow-[0_8px_24px_rgba(22,20,31,0.08)] backdrop-blur">
          <Link href="/products" className="inline-flex min-h-[48px] items-center rounded-full px-5 text-[15px] font-bold text-app-ink no-underline hover:bg-app-canvas">
            Cancel
          </Link>
          <PillButton type="submit" tone="accent" size="md" busy={saving}>
            {isEdit ? "Update product" : "Save product"}
          </PillButton>
        </div>
      </form>
    </div>
  );
}

function Section({ title, sub, action, children }: { title: string; sub?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-[22px] border border-app-line bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-extrabold">{title}</h2>
          {sub && <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** On/off checkboxes for parts of the product page (the order stays the store's). */
function PartToggles<T extends string>({ legend, hint, options, value, onToggle }: { legend: string; hint?: string; options: Array<{ value: T; label: string }>; value: readonly T[]; onToggle: (id: T, show: boolean) => void }) {
  return (
    <fieldset className="m-0 grid gap-2 border-0 p-0">
      <legend className={field.label}>{legend}</legend>
      {options.map((option) => {
        const on = value.includes(option.value);
        return (
          <label key={option.value} className={cx("flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[14px] border px-3 text-[14px]", on ? "border-app-ink bg-app-canvas font-bold" : "border-app-line bg-white")}>
            <input type="checkbox" checked={on} onChange={(event) => onToggle(option.value, event.target.checked)} className={field.checkbox} />
            {option.label}
          </label>
        );
      })}
      {hint ? <span className={cx(field.hint, "block")}>{hint}</span> : null}
    </fieldset>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={field.label}>{label}</span>
      {children}
      {hint && <span className={cx(field.hint, "block")}>{hint}</span>}
    </label>
  );
}
