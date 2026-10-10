"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

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

const TABS = ["Details", "Visibility & Sales Channel", "Inventory & Pricing", "Description Builder", "Product Page"];

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

const VISIBILITY_OPTIONS = [
  { value: "hidden", label: "Hidden" },
  { value: "storefront", label: "Storefront" },
  { value: "featured", label: "Featured" },
  { value: "collection_only", label: "Collection Only" },
];

const INVENTORY_TYPES = [
  { value: "seller", label: "Seller Inventory" },
  { value: "dropshipping", label: "Dropshipping" },
  { value: "source_on_demand", label: "Source-On-Demand" },
  { value: "print_on_demand", label: "Print-On-Demand" },
  { value: "digital", label: "Digital" },
];

const SALES_CHANNELS = [
  { value: "website", label: "Website" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "marketplace", label: "Marketplace" },
];

const FULFILLMENT_OPTIONS = [
  { value: "merchant_fulfilled", label: "Merchant Fulfilled" },
  { value: "dropship", label: "Dropship" },
  { value: "wholesale_stocked", label: "Wholesale Stocked" },
];

const PAGE_VARIANTS = [
  { value: "shopify", label: "Shopify" },
  { value: "amazon", label: "Amazon" },
  { value: "luxury", label: "Luxury" },
  { value: "minimal", label: "Minimal" },
  { value: "marketplace", label: "Marketplace" },
  { value: "fashion", label: "Fashion" },
  { value: "mobile_first", label: "Mobile First" },
];

const ALL_MODULES = [
  { value: "image_gallery", label: "Image Gallery" },
  { value: "zoom", label: "Zoom" },
  { value: "video", label: "Video" },
  { value: "360_view", label: "360 View" },
  { value: "variants", label: "Variants" },
  { value: "size_selector", label: "Size Selector" },
  { value: "color_selector", label: "Color Selector" },
  { value: "quantity", label: "Quantity" },
  { value: "price", label: "Price" },
  { value: "discount", label: "Discount" },
  { value: "stock_status", label: "Stock Status" },
  { value: "delivery_estimate", label: "Delivery Estimate" },
  { value: "wishlist", label: "Wishlist" },
  { value: "share", label: "Share" },
  { value: "related_products", label: "Related Products" },
  { value: "reviews", label: "Reviews" },
  { value: "description", label: "Description" },
  { value: "specifications", label: "Specifications" },
  { value: "faqs", label: "FAQs" },
  { value: "supplier_info", label: "Supplier Info" },
  { value: "return_policy", label: "Return Policy" },
  { value: "trust_badges", label: "Trust Badges" },
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
        const err = await res.json();
        setError(err?.error ?? "Failed to save product");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppFrame role="seller" storeName="Products" storeInitial="P">
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 28px 40px", background: "var(--canvas)" }}>
        <PageHead
          title={isEdit ? product!.name : "New product"}
          sub={isEdit ? "Edit product details, visibility, inventory, and page settings" : "Add a new product to your store"}
          crumbs={["Products", isEdit ? product!.name : "New"]}
          actions={
            <Link href="/products" className="dbtn dBtn-ghost dBtn-sm" style={{ textDecoration: "none" }}>
              Cancel
            </Link>
          }
        />

        {error && (
          <div className="card" style={{ padding: 12, marginBottom: 14, borderColor: "var(--danger)", color: "var(--danger)", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="design-tabs" style={{ marginBottom: 20 }}>
          {TABS.map((tab, i) => (
            <button
              key={tab}
              type="button"
              className={`tab${i === activeTab ? " on" : ""}`}
              onClick={() => setActiveTab(i)}
              style={{ cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}
            >
              {tab}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => void handleSubmit(e)}>
          {/* Tab 1 - Details */}
          {activeTab === 0 && (
            <div className="flex flex-col gap-5">
              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--teal-700)" }}>Basic Information</div>
                <h2 className="font-display text-[22px] font-normal m-0 mb-4" style={{ color: "var(--ink-900)" }}>Tell buyers what you&apos;re selling.</h2>
                <div className="grid gap-4" style={{ gridTemplateColumns: "1.2fr 0.8fr" }}>
                  <label className="field">
                    <span className="label">Product name *</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className="inp" required minLength={2} maxLength={200} placeholder="e.g. Premium Leather Tote Bag" />
                  </label>
                  <label className="field">
                    <span className="label">Tags</span>
                    <input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} className="inp" placeholder="e.g. leather, premium, bags" />
                    <div className="text-[11px] mt-1" style={{ color: "var(--ink-400)" }}>Comma-separated</div>
                  </label>
                </div>
                <label className="field mt-4">
                  <span className="label">Description</span>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="ta" rows={4} placeholder="Describe your product, materials, sizing, features, and what makes it special." />
                </label>
                <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label className="field">
                    <span className="label">Category</span>
                    <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="inp">
                      <option value="">No category</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">Video URL</span>
                    <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="inp" placeholder="https://youtube.com/watch?v=..." />
                  </label>
                </div>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--teal-700)" }}>Images</div>
                <h2 className="font-display text-[22px] font-normal m-0 mb-4" style={{ color: "var(--ink-900)" }}>Upload product photos.</h2>
                <div className="flex gap-2 mb-4">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="dbtn dBtn-ghost dBtn-sm">
                    <Icon name="upload" size={14} /> Upload images
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
                </div>
                {images.length > 0 ? (
                  <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))" }}>
                    {images.map((url, i) => (
                      <div key={i} className="relative rounded-[10px] overflow-hidden" style={{ aspectRatio: "1/1", border: "1px solid var(--ink-100)" }}>
                        <img src={url} alt={`Product ${i + 1}`} className="w-full h-full object-cover" />
                        <button type="button" onClick={() => removeImage(i)} className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-white text-[12px]" style={{ background: "rgba(0,0,0,0.5)" }}>✕</button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[13px] border-2 border-dashed rounded-[12px]" style={{ color: "var(--ink-400)", borderColor: "var(--ink-200)" }}>
                    No images yet. Upload product photos above.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2 - Visibility & Sales Channel */}
          {activeTab === 1 && (
            <div className="flex flex-col gap-5">
              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--teal-700)" }}>Status & Visibility</div>
                <h2 className="font-display text-[22px] font-normal m-0 mb-4" style={{ color: "var(--ink-900)" }}>Control where and how your product appears.</h2>
                <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label className="field">
                    <span className="label">Status</span>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="inp">
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="label">Visibility</span>
                    <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="inp">
                      {VISIBILITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-5">
                  <div className="label mb-2">Sales Channels</div>
                  <div className="flex flex-wrap gap-3">
                    {SALES_CHANNELS.map((ch) => (
                      <label key={ch.value} className="flex items-center gap-2 cursor-pointer text-[13px]" style={{ color: "var(--ink-800)" }}>
                        <input
                          type="checkbox"
                          checked={salesChannels.includes(ch.value)}
                          onChange={() => toggleSalesChannel(ch.value)}
                          className="w-4 h-4 rounded"
                          style={{ accentColor: "var(--teal-700)" }}
                        />
                        {ch.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={featured}
                      onChange={(e) => setFeatured(e.target.checked)}
                      className="w-4 h-4 rounded"
                      style={{ accentColor: "var(--teal-700)" }}
                    />
                    <span className="text-[13px] font-semibold" style={{ color: "var(--ink-800)" }}>Featured product</span>
                  </label>
                  <div className="text-[12px] mt-1" style={{ color: "var(--ink-500)" }}>Featured products are highlighted on your storefront and marketing materials.</div>
                </div>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--teal-700)" }}>SEO</div>
                <h2 className="font-display text-[22px] font-normal m-0 mb-4" style={{ color: "var(--ink-900)" }}>Optimize for search engines.</h2>
                <label className="field">
                  <span className="label">SEO Title</span>
                  <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className="inp" maxLength={70} placeholder="Product title for search results" />
                  <div className="text-[11px] mt-1" style={{ color: "var(--ink-400)" }}>{seoTitle.length}/70 characters</div>
                </label>
                <label className="field mt-4">
                  <span className="label">SEO Description</span>
                  <textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} className="ta" rows={3} maxLength={160} placeholder="Brief description for search snippets" />
                  <div className="text-[11px] mt-1" style={{ color: "var(--ink-400)" }}>{seoDescription.length}/160 characters</div>
                </label>
              </div>
            </div>
          )}

          {/* Tab 3 - Inventory & Pricing */}
          {activeTab === 2 && (
            <div className="flex flex-col gap-5">
              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--teal-700)" }}>Inventory Type</div>
                <h2 className="font-display text-[22px] font-normal m-0 mb-4" style={{ color: "var(--ink-900)" }}>How do you manage this product?</h2>
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                  {INVENTORY_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setInventoryType(t.value)}
                      className="text-left rounded-[10px] p-3 text-[13px] font-semibold cursor-pointer"
                      style={{
                        border: inventoryType === t.value ? "2px solid var(--teal-600)" : "1px solid var(--ink-150)",
                        background: inventoryType === t.value ? "var(--teal-50)" : "var(--paper)",
                        color: inventoryType === t.value ? "var(--teal-800)" : "var(--ink-700)",
                        transition: "all 0.12s",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--teal-700)" }}>Pricing</div>
                <h2 className="font-display text-[22px] font-normal m-0 mb-4" style={{ color: "var(--ink-900)" }}>Set your prices.</h2>
                <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <label className="field">
                    <span className="label">Retail price (₦) *</span>
                    <input value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} type="number" className="inp" required min={1} step="0.01" placeholder="25000" />
                  </label>
                  <label className="field">
                    <span className="label">Cost price (₦)</span>
                    <input value={costPrice} onChange={(e) => setCostPrice(e.target.value)} type="number" className="inp" min={0} step="0.01" placeholder="15000" />
                  </label>
                  <label className="field">
                    <span className="label">Compare-at price (₦)</span>
                    <input value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} type="number" className="inp" min={0} step="0.01" placeholder="30000" />
                  </label>
                </div>
                {retailPrice && costPrice && (
                  <div className="mt-3 text-[13px]" style={{ color: "var(--ink-600)" }}>
                    Margin: <strong style={{ color: "var(--teal-700)" }}>{Math.round((1 - parseFloat(costPrice) / parseFloat(retailPrice)) * 100)}%</strong>
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--teal-700)" }}>Stock</div>
                <h2 className="font-display text-[22px] font-normal m-0 mb-4" style={{ color: "var(--ink-900)" }}>Track your inventory levels.</h2>
                <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <label className="field">
                    <span className="label">Current stock</span>
                    <input value={currentStock} onChange={(e) => setCurrentStock(e.target.value)} type="number" className="inp" min={0} />
                  </label>
                  <label className="field">
                    <span className="label">Reserved stock</span>
                    <input value={reservedStock} onChange={(e) => setReservedStock(e.target.value)} type="number" className="inp" min={0} />
                  </label>
                  <label className="field">
                    <span className="label">Low stock threshold</span>
                    <input value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} type="number" className="inp" min={0} />
                  </label>
                </div>
                {parseInt(currentStock) > 0 && (
                  <div className="mt-3 flex items-center gap-2 text-[13px]" style={{ color: "var(--ink-600)" }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: parseInt(currentStock) <= parseInt(lowStockThreshold) ? "var(--warning)" : "var(--success)" }} />
                    {parseInt(currentStock) <= parseInt(lowStockThreshold) ? (
                      <span style={{ color: "var(--warning)", fontWeight: 600 }}>{currentStock} left — below threshold</span>
                    ) : (
                      <span>{currentStock} available ({parseInt(currentStock) - parseInt(reservedStock)} after reservations)</span>
                    )}
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--teal-700)" }}>Shipping & Fulfillment</div>
                <h2 className="font-display text-[22px] font-normal m-0 mb-4" style={{ color: "var(--ink-900)" }}>Weight, dimensions, and fulfillment.</h2>
                <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <label className="field">
                    <span className="label">Weight</span>
                    <div className="flex gap-2">
                      <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" className="inp flex-1" min={0} step="0.01" placeholder="0.5" />
                      <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} className="inp" style={{ width: 80 }}>
                        <option value="kg">kg</option>
                        <option value="g">g</option>
                        <option value="lb">lb</option>
                        <option value="oz">oz</option>
                      </select>
                    </div>
                  </label>
                  <label className="field">
                    <span className="label">SKU</span>
                    <input value={sku} onChange={(e) => setSku(e.target.value)} className="inp" placeholder="LTH-TOTE-001" />
                  </label>
                  <label className="field">
                    <span className="label">Barcode</span>
                    <input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="inp" placeholder="UPC / EAN / ISBN" />
                  </label>
                  <label className="field">
                    <span className="label">Fulfillment type</span>
                    <select value={fulfillmentType} onChange={(e) => setFulfillmentType(e.target.value)} className="inp">
                      {FULFILLMENT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4 - Description Builder */}
          {activeTab === 3 && (
            <div className="flex flex-col gap-5">
              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--teal-700)" }}>Long Description</div>
                <h2 className="font-display text-[22px] font-normal m-0 mb-4" style={{ color: "var(--ink-900)" }}>Detailed product description.</h2>
                <label className="field">
                  <span className="label">Long description (rich text)</span>
                  <textarea value={longDescription} onChange={(e) => setLongDescription(e.target.value)} className="ta" rows={8} placeholder="Full product description with details about materials, sizing, care, and features..." />
                </label>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <div className="font-semibold text-[13px] uppercase tracking-[0.04em]" style={{ color: "var(--teal-700)" }}>Specifications</div>
                    <h2 className="font-display text-[22px] font-normal m-0 mt-1 mb-3" style={{ color: "var(--ink-900)" }}>Key-value specs table.</h2>
                  </div>
                  <button type="button" onClick={addSpec} className="dbtn dBtn-ghost dBtn-sm">
                    <Icon name="plus" size={14} /> Add spec
                  </button>
                </div>
                {specs.length === 0 ? (
                  <div className="text-center py-6 text-[13px] border-2 border-dashed rounded-[12px]" style={{ color: "var(--ink-400)", borderColor: "var(--ink-200)" }}>
                    No specifications yet. Add specs like material, dimensions, or care instructions.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {specs.map((spec) => (
                      <div key={spec.id} className="flex gap-2 items-center">
                        <input value={spec.name} onChange={(e) => updateSpec(spec.id, "name", e.target.value)} className="inp text-[13px]" placeholder="e.g. Material" style={{ flex: 1 }} />
                        <input value={spec.value} onChange={(e) => updateSpec(spec.id, "value", e.target.value)} className="inp text-[13px]" placeholder="e.g. 100% Cotton" style={{ flex: 1 }} />
                        <button type="button" onClick={() => removeSpec(spec.id)} className="text-red-500 hover:text-red-700 text-[18px] leading-none">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <div className="font-semibold text-[13px] uppercase tracking-[0.04em]" style={{ color: "var(--teal-700)" }}>FAQs</div>
                    <h2 className="font-display text-[22px] font-normal m-0 mt-1 mb-3" style={{ color: "var(--ink-900)" }}>Frequently asked questions.</h2>
                  </div>
                  <button type="button" onClick={addFaq} className="dbtn dBtn-ghost dBtn-sm">
                    <Icon name="plus" size={14} /> Add FAQ
                  </button>
                </div>
                {faqs.length === 0 ? (
                  <div className="text-center py-6 text-[13px] border-2 border-dashed rounded-[12px]" style={{ color: "var(--ink-400)", borderColor: "var(--ink-200)" }}>
                    No FAQs yet. Add common questions buyers ask about this product.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {faqs.map((faq) => (
                      <div key={faq.id} className="rounded-[10px] p-3" style={{ border: "1px solid var(--ink-100)", background: "var(--ink-50)" }}>
                        <div className="flex gap-2 mb-2">
                          <input value={faq.question} onChange={(e) => updateFaq(faq.id, "question", e.target.value)} className="inp text-[13px] flex-1" placeholder="Question" />
                          <button type="button" onClick={() => removeFaq(faq.id)} className="text-red-500 hover:text-red-700 text-[18px] leading-none shrink-0">✕</button>
                        </div>
                        <textarea value={faq.answer} onChange={(e) => updateFaq(faq.id, "answer", e.target.value)} className="ta text-[13px]" rows={2} placeholder="Answer" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-4" style={{ color: "var(--teal-700)" }}>Additional Sections</div>
                <div className="flex flex-col gap-4">
                  <label className="field">
                    <span className="label">Care Instructions</span>
                    <textarea value={careInstructions} onChange={(e) => setCareInstructions(e.target.value)} className="ta" rows={3} placeholder="Washing, storage, and care instructions..." />
                  </label>
                  <label className="field">
                    <span className="label">Shipping Info</span>
                    <textarea value={shippingInfo} onChange={(e) => setShippingInfo(e.target.value)} className="ta" rows={3} placeholder="Processing times, delivery estimates, shipping carriers..." />
                  </label>
                  <label className="field">
                    <span className="label">Return Policy</span>
                    <textarea value={returnPolicy} onChange={(e) => setReturnPolicy(e.target.value)} className="ta" rows={3} placeholder="Return window, conditions, refund process..." />
                  </label>
                  <label className="field">
                    <span className="label">Warranty</span>
                    <textarea value={warranty} onChange={(e) => setWarranty(e.target.value)} className="ta" rows={3} placeholder="Warranty period, coverage, exclusions..." />
                  </label>
                  <label className="field">
                    <span className="label">Support Info</span>
                    <textarea value={supportInfo} onChange={(e) => setSupportInfo(e.target.value)} className="ta" rows={3} placeholder="Contact details, support hours, response times..." />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Tab 5 - Product Page */}
          {activeTab === 4 && (
            <div className="flex flex-col gap-5">
              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--teal-700)" }}>Page Design</div>
                <h2 className="font-display text-[22px] font-normal m-0 mb-4" style={{ color: "var(--ink-900)" }}>Choose a layout variant for your product page.</h2>
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
                  {PAGE_VARIANTS.map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => setPageVariant(v.value)}
                      className="text-center rounded-[10px] p-3 text-[13px] font-semibold cursor-pointer"
                      style={{
                        border: pageVariant === v.value ? "2px solid var(--teal-600)" : "1px solid var(--ink-150)",
                        background: pageVariant === v.value ? "var(--teal-50)" : "var(--paper)",
                        color: pageVariant === v.value ? "var(--teal-800)" : "var(--ink-700)",
                        transition: "all 0.12s",
                      }}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div className="font-semibold text-[13px] uppercase tracking-[0.04em] mb-1" style={{ color: "var(--teal-700)" }}>Page Modules</div>
                <h2 className="font-display text-[22px] font-normal m-0 mb-4" style={{ color: "var(--ink-900)" }}>Enable or disable sections on the product page.</h2>
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                  {ALL_MODULES.map((mod) => (
                    <label key={mod.value} className="flex items-center gap-2 cursor-pointer text-[13px] p-2 rounded-[8px]" style={{ color: "var(--ink-800)", border: "1px solid var(--ink-100)", background: enabledModules.includes(mod.value) ? "var(--teal-50)" : "var(--paper)" }}>
                      <input
                        type="checkbox"
                        checked={enabledModules.includes(mod.value)}
                        onChange={() => toggleModule(mod.value)}
                        className="w-4 h-4 rounded"
                        style={{ accentColor: "var(--teal-700)" }}
                      />
                      {mod.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 mt-6 pt-5" style={{ borderTop: "1px solid var(--ink-100)" }}>
            <Link href="/products" className="dbtn dBtn-ghost" style={{ textDecoration: "none" }}>
              Cancel
            </Link>
            <button type="submit" className="dbtn dBtn-mint" disabled={saving} style={{ fontFamily: "inherit", cursor: "pointer", border: "none" }}>
              {saving ? "Saving..." : isEdit ? "Update product" : "Save product"}
            </button>
          </div>
        </form>
      </div>
    </AppFrame>
  );
}
