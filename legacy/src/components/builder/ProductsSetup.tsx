"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Papa from "papaparse";
import { ChipAvatar } from "@/components/brand/ChipAvatar";
import { uploadFile } from "@/lib/supabase/storage";

// ── Types ──────────────────────────────────────────────────────────────────────

interface VariantRow {
  type: string;
  options: string; // comma-separated values
}

interface SpecField {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
}

interface CategorySchema {
  variantTypes: string[];
  specFields: SpecField[];
}

interface ProductRow {
  id: string;
  name: string;
  shortDesc: string;
  fullDesc: string;
  price: string;
  compareAt: string;
  images: string[];
  imageFiles: (File | null)[];
  variants: VariantRow[];
  specs: Record<string, string>;
  open: boolean;
}

export interface PreviewProduct {
  name: string;
  subtitle: string;
  price: string;
  color: string;
  imageUrl?: string;
}

interface ProductsSetupProps {
  category: string;
  onNext: () => void;
  onBack: () => void;
  onProductsChange?: (products: PreviewProduct[]) => void;
}

// ── Category schema ────────────────────────────────────────────────────────────

function getCategorySchema(cat: string): CategorySchema {
  const s = cat.toLowerCase();

  if (/fashion|cloth|wear|dress|shirt|bag|shoe|ankara|fabric|style|wears/.test(s)) {
    return {
      variantTypes: ["Size", "Color"],
      specFields: [
        { key: "material", label: "Material / Fabric", placeholder: "e.g. 100% cotton, Ankara print, polyester blend" },
        { key: "fit", label: "Fit / cut", placeholder: "e.g. Regular fit, oversized, slim cut" },
        { key: "care", label: "Care instructions", placeholder: "e.g. Hand wash cold, do not bleach, line dry" },
        { key: "origin", label: "Made in", placeholder: "e.g. Lagos, Nigeria" },
      ],
    };
  }

  if (/food|sauce|snack|pepper|spice|rice|bread|cake|pastry|drink|beverage|jollof|bake|cook/.test(s)) {
    return {
      variantTypes: ["Size / Weight", "Flavour"],
      specFields: [
        { key: "ingredients", label: "Ingredients", placeholder: "List all ingredients in order of quantity...", multiline: true },
        { key: "weight", label: "Net weight / volume", placeholder: "e.g. 200g, 500ml, 1 litre" },
        { key: "allergens", label: "Allergens", placeholder: "e.g. Contains nuts, gluten-free, dairy-free" },
        { key: "shelf_life", label: "Shelf life / storage", placeholder: "e.g. 6 months unopened, refrigerate after opening" },
        { key: "nutritional", label: "Nutritional info (optional)", placeholder: "e.g. Per 100g: 350kcal, 12g protein, 45g carbs" },
      ],
    };
  }

  if (/beauty|skin|hair|cream|soap|oil|serum|makeup|cosmetic|glow|moistur/.test(s)) {
    return {
      variantTypes: ["Size", "Shade / Tone"],
      specFields: [
        { key: "key_ingredients", label: "Key ingredients", placeholder: "e.g. Shea butter, Vitamin C, Aloe Vera, Jojoba oil", multiline: true },
        { key: "volume", label: "Volume / weight", placeholder: "e.g. 50ml, 100g, 30ml serum" },
        { key: "skin_type", label: "Suitable skin type", placeholder: "e.g. All skin types, oily skin, sensitive, dry" },
        { key: "how_to_use", label: "How to use", placeholder: "Step-by-step application instructions...", multiline: true },
        { key: "warnings", label: "Precautions", placeholder: "e.g. Avoid contact with eyes, patch test recommended" },
      ],
    };
  }

  if (/phone|gadget|tech|electron|laptop|accessory|cable|charger|device/.test(s)) {
    return {
      variantTypes: ["Color", "Storage / Variant"],
      specFields: [
        { key: "specs", label: "Technical specs", placeholder: "e.g. 6.5\" display, 4GB RAM, 64GB storage, 5000mAh", multiline: true },
        { key: "compatibility", label: "Compatibility", placeholder: "e.g. All Android devices, iPhone 12 and above" },
        { key: "in_box", label: "What's in the box", placeholder: "e.g. Device, USB-C cable, user manual, warranty card" },
        { key: "warranty", label: "Warranty", placeholder: "e.g. 1 year manufacturer warranty, 3-month local warranty" },
      ],
    };
  }

  if (/health|wellness|vitamin|supplement|organic|herbal|natural/.test(s)) {
    return {
      variantTypes: ["Size / Quantity", "Variant"],
      specFields: [
        { key: "ingredients", label: "Active ingredients", placeholder: "e.g. Zinc, Vitamin D3, Elderberry extract", multiline: true },
        { key: "dosage", label: "Dosage / serving", placeholder: "e.g. 1 capsule daily with food" },
        { key: "warnings", label: "Warnings / contraindications", placeholder: "e.g. Not for pregnant women, consult your doctor" },
        { key: "certifications", label: "Certifications", placeholder: "e.g. NAFDAC approved, ISO certified, organic certified" },
      ],
    };
  }

  // Default / general merchandise
  return {
    variantTypes: ["Size", "Color"],
    specFields: [
      { key: "material", label: "Material", placeholder: "e.g. Wood, plastic, metal, leather, ceramic" },
      { key: "dimensions", label: "Dimensions / weight", placeholder: "e.g. 30 x 20 x 10cm, 500g" },
      { key: "origin", label: "Made in", placeholder: "e.g. Accra, Ghana" },
    ],
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const CARD_COLORS = ["#2E7E78", "#F2A93B", "#6B4F8A", "#E86A4F", "#0E2A38"];

function mkProduct(schema: CategorySchema): ProductRow {
  return {
    id: Math.random().toString(36).slice(2),
    name: "",
    shortDesc: "",
    fullDesc: "",
    price: "",
    compareAt: "",
    images: [],
    imageFiles: [],
    variants: schema.variantTypes.map((t) => ({ type: t, options: "" })),
    specs: Object.fromEntries(schema.specFields.map((f) => [f.key, ""])),
    open: true,
  };
}

const INPUT_BASE = "w-full rounded-[10px] border px-3 py-2.5 text-[13px] outline-none transition-colors focus:border-[var(--color-mint)]";
const INPUT_STYLE = {
  borderColor: "rgb(14 42 56 / 0.12)",
  color: "var(--color-navy)",
  background: "white",
};
const LABEL_COLOR = { color: "var(--color-muted)" };
const SECTION_TITLE = "mb-3 font-mono text-[10px] uppercase tracking-[0.12em]";
const DIVIDER = { borderTop: "1px solid rgb(14 42 56 / 0.06)" };

// ── Component ──────────────────────────────────────────────────────────────────

export function ProductsSetup({ category, onNext, onBack, onProductsChange }: ProductsSetupProps) {
  const schema = getCategorySchema(category);
  const [tab, setTab] = useState<"manual" | "csv" | "marketplace">("manual");
  const [products, setProducts] = useState<ProductRow[]>(() => [mkProduct(schema)]);
  const [csvRows, setCsvRows] = useState<{ name: string; price: string; desc: string }[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [peggyLoading, setPeggyLoading] = useState<{ id: string; field: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mpProducts, setMpProducts] = useState<Array<{ id: string; name: string; price: number; currency: string; supplier: string; imageUrl?: string }>>([]);
  const [addedMp, setAddedMp] = useState<Set<string>>(new Set());
  const csvRef = useRef<HTMLInputElement>(null);

  // Sync to parent for live preview whenever products change
  useEffect(() => {
    if (!onProductsChange) return;
    const mapped = products
      .filter((p) => p.name.trim())
      .map((p, i) => ({
        name: p.name,
        subtitle: p.shortDesc || p.fullDesc.slice(0, 60).trim() || "",
        price: p.price
          ? p.price.match(/[₦GH₵KSh$]/) ? p.price : `₦${p.price.replace(/[^0-9.,]/g, "")}`
          : "₦0",
        color: CARD_COLORS[i % CARD_COLORS.length],
        imageUrl: p.images[0],
      }));
    onProductsChange(mapped);
  }, [products, onProductsChange]);

  // ── Updaters ──

  function update(id: string, patch: Partial<ProductRow>) {
    setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function updateVariant(id: string, idx: number, options: string) {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const v = [...p.variants];
        v[idx] = { ...v[idx], options };
        return { ...p, variants: v };
      })
    );
  }

  function updateSpec(id: string, key: string, val: string) {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, specs: { ...p.specs, [key]: val } } : p))
    );
  }

  function addImages(id: string, files: FileList | null) {
    if (!files) return;
    const product = products.find((p) => p.id === id);
    const slots = 5 - (product?.images.length ?? 0);
    Array.from(files)
      .slice(0, slots)
      .forEach((file) => {
        const url = URL.createObjectURL(file);
        setProducts((prev) =>
          prev.map((p) =>
            p.id === id
              ? { ...p, images: [...p.images, url], imageFiles: [...p.imageFiles, file] }
              : p
          )
        );
      });
  }

  function removeImage(id: string, imgIdx: number) {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              images: p.images.filter((_, i) => i !== imgIdx),
              imageFiles: p.imageFiles.filter((_, i) => i !== imgIdx),
            }
          : p
      )
    );
  }

  // ── Peggy AI ──

  async function askPeggy(productId: string, field: "shortDesc" | "fullDesc" | "spec", specKey?: string) {
    const product = products.find((p) => p.id === productId);
    if (!product?.name.trim()) return;

    const loadKey = specKey ?? field;
    setPeggyLoading({ id: productId, field: loadKey });

    const ctx = `Product: "${product.name}". Category: ${category || "general e-commerce"}.`;
    let prompt = "";

    if (field === "shortDesc") {
      prompt = `${ctx}\n\nWrite a punchy 1-sentence product card description, under 15 words. No filler words. Return ONLY the text.`;
    } else if (field === "fullDesc") {
      prompt = `${ctx}\n\nWrite a compelling 3-4 sentence product description. Focus on benefits, quality, and why a customer should buy it. Return ONLY the text.`;
    } else if (specKey) {
      const sf = schema.specFields.find((f) => f.key === specKey);
      if (specKey === "ingredients" || specKey === "key_ingredients") {
        prompt = `${ctx}\n\nList realistic key ingredients as a comma-separated list. Return ONLY the list.`;
      } else if (specKey === "care") {
        prompt = `${ctx}\n\nWrite concise care/washing instructions. Return ONLY the instructions.`;
      } else if (specKey === "how_to_use") {
        prompt = `${ctx}\n\nWrite 2-3 simple application/usage steps. Return ONLY the steps.`;
      } else if (specKey === "specs") {
        prompt = `${ctx}\n\nWrite realistic technical specifications. Return ONLY the specs, one per line.`;
      } else {
        prompt = `${ctx}\n\nFor the product field "${sf?.label ?? specKey}", suggest a realistic value. Return ONLY the value.`;
      }
    }

    try {
      const res = await fetch("/api/ai/store-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          store: { name: "", products: [], changed: [] },
        }),
      });
      if (!res.body) throw new Error("no body");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n").filter(Boolean)) {
          try {
            const ev = JSON.parse(line) as { type: string; text?: string };
            if (ev.type === "token" && ev.text && !ev.text.includes("<store_config>")) {
              text += ev.text;
              if (field === "shortDesc" || field === "fullDesc") {
                update(productId, { [field]: text });
              } else if (specKey) {
                updateSpec(productId, specKey, text);
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* best-effort */ }
    finally {
      setPeggyLoading(null);
    }
  }

  // ── CSV ──

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setCsvRows(
          res.data.map((r) => ({
            name: r.name ?? r.Name ?? r.product ?? "",
            price: r.price ?? r.Price ?? r.retail_price ?? "",
            desc: r.description ?? r.Description ?? r.desc ?? "",
          }))
        );
      },
    });
    e.target.value = "";
  }

  // ── Marketplace ──

  const fetchMp = useCallback(async () => {
    if (mpProducts.length > 0) return;
    try {
      const res = await fetch(`/api/public/products?category=${encodeURIComponent(category)}&limit=6`);
      const data = await res.json() as {
        data?: Array<{ id: string; name: string; wholesalePrice: number; currency: string; supplier: { displayName: string }; images?: string[] }>;
      };
      setMpProducts(
        (data.data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          price: p.wholesalePrice,
          currency: p.currency,
          supplier: p.supplier?.displayName ?? "",
          imageUrl: p.images?.[0],
        }))
      );
    } catch { /* no-op */ }
  }, [category, mpProducts.length]);

  async function addMpProduct(id: string) {
    const product = mpProducts.find((item) => item.id === id);
    if (!product) return;
    try {
      await fetch("/api/app/store-products/add-from-supplier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierProductId: id,
          retailPrice: product.price,
          fulfillmentType: "dropship",
        }),
      });
      setAddedMp((prev) => new Set([...prev, id]));
    } catch { /* best-effort */ }
  }

  // ── Save ──

  async function saveAndNext() {
    setIsSaving(true);

    try {
      if (tab === "csv") {
        for (const product of csvRows) {
          await fetch("/api/app/store-products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: product.name,
              description: product.desc,
              retailPrice: parseFloat(product.price.replace(/[^0-9.]/g, "")) || 0,
              currency: "NGN",
              status: "published",
            }),
          });
        }
      } else {
        for (const product of products.filter((item) => item.name.trim())) {
          const uploadedImages: string[] = [];

          for (const file of product.imageFiles.filter((image): image is File => image instanceof File)) {
            try {
              const uploaded = await uploadFile("products", file);
              uploadedImages.push(uploaded.publicUrl);
            } catch {
              // best-effort: keep saving the product even if one image fails
            }
          }

          const existingRemoteImages = product.images.filter((image) => /^https?:\/\//.test(image));

          await fetch("/api/app/store-products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: product.name,
              description: product.fullDesc || product.shortDesc,
              images: [...existingRemoteImages, ...uploadedImages],
              retailPrice: parseFloat(product.price.replace(/[^0-9.]/g, "")) || 0,
              currency: "NGN",
              status: "published",
            }),
          });
        }
      }
    } catch { /* best-effort */ }
    finally {
      setIsSaving(false);
      setSaved(true);
      setTimeout(onNext, 600);
    }
  }

  // ── Peggy button helper ──

  function PeggyBtn({ id, field, specKey }: { id: string; field: "shortDesc" | "fullDesc" | "spec"; specKey?: string }) {
    const loadKey = specKey ?? field;
    const isLoading = peggyLoading?.id === id && peggyLoading.field === loadKey;
    const product = products.find((p) => p.id === id);
    return (
      <button
        type="button"
        onClick={() => askPeggy(id, field, specKey)}
        disabled={!product?.name.trim() || isLoading}
        className="flex items-center gap-1 text-[11px] font-semibold disabled:opacity-40"
        style={{ color: "var(--color-teal-deep)" }}
      >
        <ChipAvatar mascot="peggy" size={13} />
        {isLoading ? "Writing..." : "Ask Peggy"}
      </button>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const TABS = [
    { id: "manual" as const, label: "Add manually" },
    { id: "csv" as const, label: "Import CSV" },
    { id: "marketplace" as const, label: "From marketplace" },
  ];

  return (
    <div className="flex flex-col gap-5">

      {/* Peggy intro */}
      <div
        className="flex items-start gap-3 rounded-[18px] border px-4 py-4"
        style={{ background: "rgb(14 42 56 / 0.03)", borderColor: "rgb(115 216 200 / 0.2)" }}
      >
        <ChipAvatar mascot="peggy" size={32} />
        <p className="text-[13px] leading-[1.6]" style={{ color: "var(--color-navy)" }}>
          I&apos;m Peggy, your product assistant. Add your products below and I&apos;ll help with
          descriptions, ingredients, care labels, specs — anything you need. Just click{" "}
          <strong>Ask Peggy</strong> next to any field.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-[14px] p-1" style={{ background: "rgb(14 42 56 / 0.06)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              if (t.id === "marketplace") fetchMp();
            }}
            className="flex flex-1 items-center justify-center rounded-[10px] py-2 text-[12px] font-semibold transition-all"
            style={{
              background: tab === t.id ? "white" : "transparent",
              color: tab === t.id ? "var(--color-navy)" : "var(--color-muted)",
              boxShadow: tab === t.id ? "0 1px 3px rgb(14 42 56 / 0.08)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── MANUAL TAB ── */}
      {tab === "manual" && (
        <div className="space-y-4">
          {products.map((p, pIdx) => (
            <div
              key={p.id}
              className="overflow-hidden rounded-[18px] border"
              style={{ borderColor: "rgb(14 42 56 / 0.09)" }}
            >
              {/* Card header / collapse toggle */}
              <button
                type="button"
                onClick={() => update(p.id, { open: !p.open })}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
                style={{ background: "rgb(14 42 56 / 0.02)" }}
              >
                <div className="flex items-center gap-3">
                  {p.images[0] && (
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[8px]">
                      <Image src={p.images[0]} alt="" fill sizes="36px" className="object-cover" />
                    </div>
                  )}
                  <span className="text-[14px] font-semibold" style={{ color: "var(--color-navy)" }}>
                    {p.name || `Product ${pIdx + 1}`}
                  </span>
                  {p.price && (
                    <span className="font-mono text-[12px]" style={{ color: "var(--color-muted)" }}>
                      {p.price.match(/[₦GH₵KSh$]/) ? p.price : `₦${p.price}`}
                    </span>
                  )}
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{
                    transform: p.open ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s",
                    color: "var(--color-muted)",
                  }}
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {p.open && (
                <div className="space-y-5 px-5 pb-6 pt-5" style={DIVIDER}>

                  {/* ─ Basic Info ─ */}
                  <div>
                    <div className={SECTION_TITLE} style={{ color: "var(--color-teal-deep)" }}>Basic info</div>
                    <div className="grid gap-3 sm:grid-cols-[1fr_140px_140px]">
                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold" style={LABEL_COLOR}>Product name *</label>
                        <input
                          value={p.name}
                          onChange={(e) => update(p.id, { name: e.target.value })}
                          placeholder="e.g. Handmade Leather Tote"
                          className={INPUT_BASE}
                          style={INPUT_STYLE}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold" style={LABEL_COLOR}>Price *</label>
                        <input
                          value={p.price}
                          onChange={(e) => update(p.id, { price: e.target.value })}
                          placeholder="₦15,000"
                          className={INPUT_BASE}
                          style={INPUT_STYLE}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-[11px] font-semibold" style={LABEL_COLOR}>Compare-at price</label>
                        <input
                          value={p.compareAt}
                          onChange={(e) => update(p.id, { compareAt: e.target.value })}
                          placeholder="₦20,000"
                          className={INPUT_BASE}
                          style={INPUT_STYLE}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={DIVIDER} />

                  {/* ─ Images ─ */}
                  <div>
                    <div className={SECTION_TITLE} style={{ color: "var(--color-teal-deep)" }}>Product images</div>
                    <div className="flex flex-wrap gap-2">
                      {p.images.map((url, imgIdx) => (
                        <div
                          key={imgIdx}
                          className="group relative h-20 w-20 overflow-hidden rounded-[10px] border"
                          style={{ borderColor: "rgb(14 42 56 / 0.1)" }}
                        >
                          <Image src={url} alt="" fill sizes="80px" className="object-cover" />
                          <button
                            type="button"
                            onClick={() => removeImage(p.id, imgIdx)}
                            className="absolute inset-0 hidden items-center justify-center text-[11px] font-bold text-white group-hover:flex"
                            style={{ background: "rgba(0,0,0,0.55)" }}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      {p.images.length < 5 && (
                        <label
                          className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed transition-colors hover:border-[var(--color-mint)]"
                          style={{ borderColor: "rgb(14 42 56 / 0.15)", color: "var(--color-muted)" }}
                        >
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="mb-1">
                            <path d="M9 4v10M4 9h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                          <span className="text-[10px] font-semibold">Add photo</span>
                          <input
                            type="file"
                            multiple
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => addImages(p.id, e.target.files)}
                          />
                        </label>
                      )}
                    </div>
                    <p className="mt-1.5 text-[11px]" style={{ color: "var(--color-muted)" }}>
                      Up to 5 photos. The first image shows in the store preview.
                    </p>
                  </div>

                  <div style={DIVIDER} />

                  {/* ─ Descriptions ─ */}
                  <div>
                    <div className={SECTION_TITLE} style={{ color: "var(--color-teal-deep)" }}>Descriptions</div>
                    <div className="space-y-4">
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <label className="text-[11px] font-semibold" style={LABEL_COLOR}>
                            Short description{" "}
                            <span className="font-normal opacity-70">(one line — shows on product card)</span>
                          </label>
                          <PeggyBtn id={p.id} field="shortDesc" />
                        </div>
                        <input
                          value={p.shortDesc}
                          onChange={(e) => update(p.id, { shortDesc: e.target.value })}
                          placeholder="One punchy sentence about this product..."
                          className={INPUT_BASE}
                          style={INPUT_STYLE}
                        />
                      </div>
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <label className="text-[11px] font-semibold" style={LABEL_COLOR}>
                            Full description{" "}
                            <span className="font-normal opacity-70">(shows on product page)</span>
                          </label>
                          <PeggyBtn id={p.id} field="fullDesc" />
                        </div>
                        <textarea
                          rows={3}
                          value={p.fullDesc}
                          onChange={(e) => update(p.id, { fullDesc: e.target.value })}
                          placeholder="Tell the full story — quality, sourcing, benefits, what makes it different..."
                          className="w-full resize-none rounded-[10px] border px-3 py-2.5 text-[13px] leading-[1.6] outline-none transition-colors focus:border-[var(--color-mint)]"
                          style={INPUT_STYLE}
                        />
                      </div>
                    </div>
                  </div>

                  <div style={DIVIDER} />

                  {/* ─ Variants ─ */}
                  <div>
                    <div className={SECTION_TITLE} style={{ color: "var(--color-teal-deep)" }}>Variants</div>
                    <div className="space-y-3">
                      {p.variants.map((v, vIdx) => (
                        <div key={vIdx}>
                          <label className="mb-1.5 block text-[11px] font-semibold" style={LABEL_COLOR}>{v.type}</label>
                          <input
                            value={v.options}
                            onChange={(e) => updateVariant(p.id, vIdx, e.target.value)}
                            placeholder="Comma-separated options, e.g. S, M, L, XL"
                            className={INPUT_BASE}
                            style={INPUT_STYLE}
                          />
                        </div>
                      ))}
                      <p className="text-[11px]" style={{ color: "var(--color-muted)" }}>
                        Leave blank if this product has no variants.
                      </p>
                    </div>
                  </div>

                  <div style={DIVIDER} />

                  {/* ─ Product Details / Specs ─ */}
                  <div>
                    <div className={SECTION_TITLE} style={{ color: "var(--color-teal-deep)" }}>Product details</div>
                    <div className="space-y-3">
                      {schema.specFields.map((sf) => (
                        <div key={sf.key}>
                          <div className="mb-1.5 flex items-center justify-between">
                            <label className="text-[11px] font-semibold" style={LABEL_COLOR}>{sf.label}</label>
                            <PeggyBtn id={p.id} field="spec" specKey={sf.key} />
                          </div>
                          {sf.multiline ? (
                            <textarea
                              rows={2}
                              value={p.specs[sf.key] ?? ""}
                              onChange={(e) => updateSpec(p.id, sf.key, e.target.value)}
                              placeholder={sf.placeholder}
                              className="w-full resize-none rounded-[10px] border px-3 py-2.5 text-[13px] leading-[1.55] outline-none transition-colors focus:border-[var(--color-mint)]"
                              style={INPUT_STYLE}
                            />
                          ) : (
                            <input
                              value={p.specs[sf.key] ?? ""}
                              onChange={(e) => updateSpec(p.id, sf.key, e.target.value)}
                              placeholder={sf.placeholder}
                              className={INPUT_BASE}
                              style={INPUT_STYLE}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Remove product */}
                  {products.length > 1 && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => setProducts((prev) => prev.filter((x) => x.id !== p.id))}
                        className="text-[12px] font-semibold"
                        style={{ color: "var(--color-coral)" }}
                      >
                        Remove this product
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setProducts((prev) => [...prev, mkProduct(schema)])}
            className="w-full rounded-[14px] border border-dashed px-4 py-3.5 text-[13px] font-semibold transition-colors hover:border-[var(--color-mint)]"
            style={{ borderColor: "rgb(14 42 56 / 0.15)", color: "var(--color-muted)" }}
          >
            + Add another product
          </button>
        </div>
      )}

      {/* ── CSV TAB ── */}
      {tab === "csv" && (
        <div className="space-y-4">
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-[18px] border-2 border-dashed px-6 py-10 transition-colors hover:border-[var(--color-mint)]"
            style={{ borderColor: csvFileName ? "var(--color-mint)" : "rgb(14 42 56 / 0.15)" }}
            onClick={() => csvRef.current?.click()}
          >
            <input ref={csvRef} type="file" accept=".csv" title="Upload CSV file" className="hidden" onChange={handleCsvUpload} />
            <div className="text-[14px] font-semibold" style={{ color: "var(--color-navy)" }}>
              {csvFileName ?? "Drop your CSV file here or click to browse"}
            </div>
            <div className="mt-1 text-[12px]" style={{ color: "var(--color-muted)" }}>
              Required columns: <strong>name</strong>, <strong>price</strong> — Optional: description
            </div>
          </div>

          {csvRows.length > 0 && (
            <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
              <table className="w-full text-[12px]">
                <thead style={{ background: "rgb(14 42 56 / 0.04)" }}>
                  <tr>
                    {["Name", "Price", "Description"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left font-semibold" style={LABEL_COLOR}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 8).map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid rgb(14 42 56 / 0.05)" }}>
                      <td className="px-3 py-2" style={{ color: "var(--color-navy)" }}>{r.name}</td>
                      <td className="px-3 py-2 font-mono" style={LABEL_COLOR}>{r.price}</td>
                      <td className="max-w-[200px] truncate px-3 py-2" style={LABEL_COLOR}>{r.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvRows.length > 8 && (
                <div className="px-3 py-2 text-[11px]" style={LABEL_COLOR}>
                  +{csvRows.length - 8} more rows
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── MARKETPLACE TAB ── */}
      {tab === "marketplace" && (
        <div className="space-y-3">
          <div className="font-mono text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--color-teal-deep)" }}>
            Suggested for {category || "your store"} — add to dropship instantly
          </div>
          {mpProducts.length === 0 ? (
            <div className="py-10 text-center text-[13px]" style={{ color: "var(--color-muted)" }}>
              Loading marketplace suggestions...
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {mpProducts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-[16px] border bg-white px-4 py-3"
                  style={{ borderColor: "rgb(14 42 56 / 0.08)" }}
                >
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt={p.name} className="h-10 w-10 shrink-0 rounded-[8px] object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold" style={{ color: "var(--color-navy)" }}>
                      {p.name}
                    </div>
                    <div className="text-[11px]" style={LABEL_COLOR}>
                      {p.supplier} · {p.currency} {p.price}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => addMpProduct(p.id)}
                    disabled={addedMp.has(p.id)}
                    className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold disabled:opacity-60"
                    style={{
                      background: addedMp.has(p.id) ? "var(--color-teal)" : "var(--color-mint)",
                      color: "var(--color-navy)",
                    }}
                  >
                    {addedMp.has(p.id) ? "Added" : "Add"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border px-5 py-3 text-[13px] font-semibold"
          style={{ borderColor: "rgb(14 42 56 / 0.12)", color: "var(--color-muted)" }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={saveAndNext}
          disabled={isSaving}
          className="rounded-full px-6 py-3 text-[13px] font-semibold disabled:opacity-60"
          style={{ background: "var(--color-mint)", color: "var(--color-navy)" }}
        >
          {saved ? "Saved" : isSaving ? "Saving..." : "Save & continue"}
        </button>
        <button
          type="button"
          onClick={onNext}
          className="text-[13px] underline"
          style={{ color: "var(--color-muted)" }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
