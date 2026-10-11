"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Notice, PillButton, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { field } from "@/components/seller-core";

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
  currentStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  pageVariant: string;
  enabledModules: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  category: { id: string; name: string } | null;
}

interface ProductFormProps {
  product: Product | null;
  categories: Category[];
  isEdit: boolean;
}

const TABS = ["Details", "Visibility and channels", "Price and stock", "Description", "Product page"];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Live" },
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

const PAGE_VARIANTS = [
  { value: "shopify", label: "Shopify" },
  { value: "amazon", label: "Amazon" },
  { value: "luxury", label: "Luxury" },
  { value: "minimal", label: "Minimal" },
  { value: "marketplace", label: "Marketplace" },
  { value: "fashion", label: "Fashion" },
  { value: "mobile_first", label: "Mobile first" },
];

const ALL_MODULES = [
  { value: "image_gallery", label: "Image gallery" },
  { value: "zoom", label: "Zoom" },
  { value: "video", label: "Video" },
  { value: "360_view", label: "360° view" },
  { value: "variants", label: "Variants" },
  { value: "size_selector", label: "Size selector" },
  { value: "color_selector", label: "Colour selector" },
  { value: "quantity", label: "Quantity" },
  { value: "price", label: "Price" },
  { value: "discount", label: "Discount" },
  { value: "stock_status", label: "Stock status" },
  { value: "delivery_estimate", label: "Delivery estimate" },
  { value: "wishlist", label: "Wishlist" },
  { value: "share", label: "Share" },
  { value: "related_products", label: "Related products" },
  { value: "reviews", label: "Reviews" },
  { value: "description", label: "Description" },
  { value: "specifications", label: "Specifications" },
  { value: "faqs", label: "FAQs" },
  { value: "supplier_info", label: "Supplier info" },
  { value: "return_policy", label: "Return policy" },
  { value: "trust_badges", label: "Trust badges" },
];

type SpecItem = { id: string; name: string; value: string };
type FaqItem = { id: string; question: string; answer: string };

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function ProductForm({ product, categories, isEdit }: ProductFormProps) {
  const router = useRouter();
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
  const [videoUrl, setVideoUrl] = useState(product?.videoUrl ?? "");

  const [status, setStatus] = useState(product?.status ?? "draft");
  const [visibility, setVisibility] = useState(product?.visibility ?? "hidden");
  const [salesChannels, setSalesChannels] = useState<string[]>(product?.salesChannel ? [product.salesChannel] : ["website"]);
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [seoTitle, setSeoTitle] = useState(product?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(product?.seoDescription ?? "");

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

  const [pageVariant, setPageVariant] = useState(product?.pageVariant ?? "shopify");
  const [enabledModules, setEnabledModules] = useState<string[]>(product?.enabledModules ?? [
    "image_gallery", "price", "quantity", "stock_status", "description", "reviews",
  ]);

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

  const toggleModule = (mod: string) => {
    setEnabledModules((prev) => prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]);
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
      currentStock: parseInt(currentStock) || 0,
      reservedStock: parseInt(reservedStock) || 0,
      lowStockThreshold: parseInt(lowStockThreshold) || 10,
      pageVariant,
      enabledModules,
      seoTitle: seoTitle || undefined,
      seoDescription: seoDescription || undefined,
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


  const stockNumber = parseInt(currentStock);
  const thresholdNumber = parseInt(lowStockThreshold);

  return (
    <div className="grid gap-4">
      {error && <Notice>{error}</Notice>}

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
                <Field label="Description">
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={field.textarea} rows={4} placeholder="Describe your product, materials, sizing, features, and what makes it special." />
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

              <Section title="Search engines" sub="How this product shows up on Google.">
                <Field label="Search title" hint={`${seoTitle.length}/70 characters`}>
                  <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={field.input} maxLength={70} placeholder="Product title for search results" />
                </Field>
                <Field label="Search description" hint={`${seoDescription.length}/160 characters`}>
                  <textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} className={field.textarea} rows={3} maxLength={160} placeholder="Brief description for search snippets" />
                </Field>
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
                    <input value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} type="number" inputMode="decimal" className={field.input} required min={1} step="0.01" placeholder="25000" />
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

              <Section title="Stock" sub="Track how many you have.">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="In stock">
                    <input value={currentStock} onChange={(e) => setCurrentStock(e.target.value)} type="number" inputMode="numeric" className={field.input} min={0} />
                  </Field>
                  <Field label="Reserved">
                    <input value={reservedStock} onChange={(e) => setReservedStock(e.target.value)} type="number" inputMode="numeric" className={field.input} min={0} />
                  </Field>
                  <Field label="Warn me when below">
                    <input value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} type="number" inputMode="numeric" className={field.input} min={0} />
                  </Field>
                </div>
                {stockNumber > 0 && (
                  <p className="m-0 flex items-center gap-2 text-[14px]">
                    <span aria-hidden className={cx("h-2 w-2 rounded-full", stockNumber <= thresholdNumber ? "bg-app-accent" : "bg-app-success")} />
                    {stockNumber <= thresholdNumber ? (
                      <span className="font-bold text-app-accent-ink">{currentStock} left, below your warning level</span>
                    ) : (
                      <span className="text-app-ink-soft">{currentStock} available ({stockNumber - parseInt(reservedStock)} after reservations)</span>
                    )}
                  </p>
                )}
              </Section>

              <Section title="Shipping and fulfilment" sub="Weight, codes and who sends it out.">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Weight">
                    <div className="flex gap-2">
                      <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" inputMode="decimal" className={cx(field.input, "flex-1")} min={0} step="0.01" placeholder="0.5" aria-label="Weight" />
                      <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} className={cx(field.select, "w-[88px] shrink-0")} aria-label="Weight unit">
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="lb">lb</option>
                        <option value="oz">oz</option>
                      </select>
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
                title="Specifications"
                sub="Short facts like material or size."
                action={
                  <button type="button" onClick={addSpec} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-app-line bg-white px-4 text-[13px] font-bold hover:border-app-line-strong">
                    <Icon name="plus" size={14} /> Add spec
                  </button>
                }
              >
                {specs.length === 0 ? (
                  <p className="m-0 rounded-[16px] border-2 border-dashed border-app-line px-4 py-6 text-center text-[14px] text-app-ink-soft">
                    No specifications yet. Add specs like material, dimensions, or care instructions.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {specs.map((spec, index) => (
                      <div key={spec.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                        <input value={spec.name} onChange={(e) => updateSpec(spec.id, "name", e.target.value)} className={cx(field.input, "flex-1 basis-[40%]")} placeholder="e.g. Material" aria-label={`Specification ${index + 1} name`} />
                        <input value={spec.value} onChange={(e) => updateSpec(spec.id, "value", e.target.value)} className={cx(field.input, "flex-1 basis-[40%]")} placeholder="e.g. 100% Cotton" aria-label={`Specification ${index + 1} value`} />
                        <button type="button" onClick={() => removeSpec(spec.id)} aria-label={`Remove specification ${index + 1}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint">
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
              <Section title="Page layout" sub="Choose a layout for this product's page.">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" role="radiogroup" aria-label="Page layout">
                  {PAGE_VARIANTS.map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      role="radio"
                      aria-checked={pageVariant === v.value}
                      onClick={() => setPageVariant(v.value)}
                      className={cx(
                        "min-h-[48px] rounded-[14px] border px-3 py-3 text-center text-[14px] font-bold transition",
                        pageVariant === v.value ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white hover:border-app-line-strong",
                      )}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Page sections" sub="Turn parts of the product page on or off.">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {ALL_MODULES.map((mod) => {
                    const on = enabledModules.includes(mod.value);
                    return (
                      <label key={mod.value} className={cx("flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-[14px] border px-3 text-[14px]", on ? "border-app-ink bg-app-canvas font-bold" : "border-app-line bg-white")}>
                        <input type="checkbox" checked={on} onChange={() => toggleModule(mod.value)} className={field.checkbox} />
                        {mod.label}
                      </label>
                    );
                  })}
                </div>
              </Section>
            </>
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

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={field.label}>{label}</span>
      {children}
      {hint && <span className={cx(field.hint, "block")}>{hint}</span>}
    </label>
  );
}
