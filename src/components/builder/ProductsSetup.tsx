"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Papa from "papaparse";
import { Mascot, Notice, PillButton, Segmented, cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { uploadFile } from "@/lib/supabase/storage";
import { useT } from "@/components/i18n/I18nProvider";

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
  id: "fashion" | "food" | "beauty" | "tech" | "health" | "general";
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
      id: "fashion",
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
      id: "food",
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
      id: "beauty",
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
      id: "tech",
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
      id: "health",
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
    id: "general",
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

const INPUT = "w-full rounded-[14px] border border-app-line bg-white px-3.5 py-3 text-[15px] text-app-ink outline-none transition placeholder:text-app-ink-faint focus:border-app-ink";
const LABEL = "text-[13.5px] font-bold text-app-ink";
const SECTION_TITLE = "m-0 mb-3 text-[15px] font-extrabold";

// ── Component ──────────────────────────────────────────────────────────────────

export function ProductsSetup({ category, onNext, onBack, onProductsChange }: ProductsSetupProps) {
  const t = useT("builder");
  const schema = getCategorySchema(category);
  const specLabel = (sf: SpecField) => t.dynamic(`ps.${schema.id}.${sf.key}`, sf.label);
  const specPlaceholder = (sf: SpecField) => t.dynamic(`ps.${schema.id}.${sf.key}.ph`, sf.placeholder);
  const [tab, setTab] = useState<"manual" | "csv" | "marketplace">("manual");
  const [products, setProducts] = useState<ProductRow[]>(() => [mkProduct(schema)]);
  const [csvRows, setCsvRows] = useState<{ name: string; price: string; desc: string }[]>([]);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [peggyLoading, setPeggyLoading] = useState<{ id: string; field: string } | null>(null);
  const [peggyError, setPeggyError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [mpProducts, setMpProducts] = useState<Array<{ id: string; name: string; price: number; currency: string; supplier: string; imageUrl?: string }>>([]);
  const [addedMp, setAddedMp] = useState<Set<string>>(new Set());
  const [mpState, setMpState] = useState<"idle" | "loading" | "done" | "error">("idle");
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
    setPeggyError(null);

    let fieldName = "";
    let instructions = "";
    let maxWords = 80;
    if (field === "shortDesc") {
      fieldName = "product card description";
      instructions = "One punchy sentence. No filler words.";
      maxWords = 15;
    } else if (field === "fullDesc") {
      fieldName = "product description";
      instructions = "3-4 sentences on benefits, quality, and why a customer should buy it.";
      maxWords = 90;
    } else if (specKey) {
      const sf = schema.specFields.find((f) => f.key === specKey);
      fieldName = `"${sf?.label ?? specKey}" field of a product listing`;
      if (specKey === "ingredients" || specKey === "key_ingredients") instructions = "A comma-separated list of likely key ingredients. Only list ingredients typical for this product.";
      else if (specKey === "care") instructions = "Concise care or washing instructions.";
      else if (specKey === "how_to_use") instructions = "2-3 simple usage steps.";
      else if (specKey === "specs") instructions = "Typical technical specifications, one per line.";
      else instructions = "A realistic value for this field, as short as possible.";
    }

    try {
      const res = await fetch("/api/ai/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: fieldName,
          instructions,
          maxWords,
          context: {
            product: product.name,
            category: category || "general e-commerce",
            price: product.price || "",
            "short description": field === "shortDesc" ? "" : product.shortDesc,
            "seller's notes": field === "fullDesc" ? product.fullDesc : "",
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as { data?: { text?: string }; error?: { message?: string } } | null;
      const text = json?.data?.text;
      if (!res.ok || !text) throw new Error(json?.error?.message ?? t("ps.peggyError"));
      if (field === "shortDesc" || field === "fullDesc") update(productId, { [field]: text });
      else if (specKey) updateSpec(productId, specKey, text);
    } catch (error) {
      setPeggyError(error instanceof Error ? error.message : t("ps.peggyError"));
    } finally {
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
    if (mpProducts.length > 0 || mpState === "loading") return;
    setMpState("loading");
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
      setMpState("done");
    } catch {
      setMpState("error");
    }
  }, [category, mpProducts.length, mpState]);

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
        title={product?.name.trim() ? undefined : t("ps.nameFirst")}
        className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full bg-app-mint px-2.5 text-[12.5px] font-bold text-app-forest disabled:opacity-45"
      >
        <Mascot name="peggy" mood={isLoading ? "thinking" : "idle"} className="h-4 w-4" alt="" />
        {isLoading ? t("ps.writing") : t("ps.askPeggy")}
      </button>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const TABS = [
    { value: "manual" as const, label: t("ps.tab.manual") },
    { value: "csv" as const, label: t("ps.tab.csv") },
    { value: "marketplace" as const, label: t("ps.tab.marketplace") },
  ];

  return (
    <div className="flex flex-col gap-5 font-app text-app-ink">
      <div className="flex items-start gap-3 rounded-[18px] bg-app-mint px-4 py-3.5">
        <Mascot name="peggy" className="h-9 w-9 shrink-0" alt="Peggy" />
        <p className="m-0 text-[14px] leading-[1.55]">
          {(() => {
            const [before, after = ""] = t("ps.peggyIntro", { button: "\u0001" }).split("\u0001");
            return <>{before}<strong>{t("ps.askPeggy")}</strong>{after}</>;
          })()}
        </p>
      </div>

      {peggyError && <Notice>{peggyError}</Notice>}

      <Segmented
        className="w-full border border-app-line"
        value={tab}
        onChange={(next) => {
          setTab(next);
          if (next === "marketplace") void fetchMp();
        }}
        options={TABS}
      />

      {tab === "manual" && (
        <div className="grid gap-3">
          {products.map((p, pIdx) => {
            const bodyId = `product-${p.id}`;
            return (
              <div key={p.id} className="overflow-hidden rounded-[22px] border border-app-line bg-white">
                <button
                  type="button"
                  aria-expanded={p.open}
                  aria-controls={bodyId}
                  onClick={() => update(p.id, { open: !p.open })}
                  className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {p.images[0] ? (
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px]">
                        <Image src={p.images[0]} alt="" fill sizes="40px" className="object-cover" />
                      </span>
                    ) : (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-app-canvas text-app-ink-soft"><Icon name="image" size={16} /></span>
                    )}
                    <span className="truncate text-[15px] font-extrabold">{p.name || t("ps.product", { n: pIdx + 1 })}</span>
                    {p.price && <span className="shrink-0 text-[13.5px] text-app-ink-soft">{p.price.match(/[₦GH₵KSh$]/) ? p.price : `₦${p.price}`}</span>}
                  </span>
                  <Icon name="chevDown" size={18} className={cx("shrink-0 text-app-ink-soft transition", p.open && "rotate-180")} />
                </button>

                {p.open && (
                  <div id={bodyId} className="grid gap-6 border-t border-app-line px-4 pb-5 pt-5 sm:px-5">
                    <section>
                      <h4 className={SECTION_TITLE}>{t("ps.basics")}</h4>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_150px]">
                        <div className="min-w-0">
                          <label htmlFor={`${bodyId}-name`} className={`${LABEL} mb-1.5 block`}>{t("ps.name")}</label>
                          <input id={`${bodyId}-name`} value={p.name} onChange={(e) => update(p.id, { name: e.target.value })} placeholder={t("ps.namePh")} className={INPUT} />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor={`${bodyId}-price`} className={`${LABEL} mb-1.5 block`}>{t("ps.price")}</label>
                          <input id={`${bodyId}-price`} inputMode="decimal" value={p.price} onChange={(e) => update(p.id, { price: e.target.value })} placeholder="₦15,000" className={INPUT} />
                        </div>
                        <div className="min-w-0">
                          <label htmlFor={`${bodyId}-compare`} className={`${LABEL} mb-1.5 block`}>{t("ps.was")}</label>
                          <input id={`${bodyId}-compare`} inputMode="decimal" value={p.compareAt} onChange={(e) => update(p.id, { compareAt: e.target.value })} placeholder="₦20,000" className={INPUT} />
                        </div>
                      </div>
                    </section>

                    <section>
                      <h4 className={SECTION_TITLE}>{t("ps.photos")}</h4>
                      <div className="flex flex-wrap gap-2">
                        {p.images.map((url, imgIdx) => (
                          <div key={imgIdx} className="relative h-20 w-20 overflow-hidden rounded-[14px] border border-app-line">
                            <Image src={url} alt={t("ps.photo", { n: imgIdx + 1 })} fill sizes="80px" className="object-cover" />
                            <button
                              type="button"
                              onClick={() => removeImage(p.id, imgIdx)}
                              aria-label={t("ps.removePhoto", { n: imgIdx + 1 })}
                              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-app-ink shadow"
                            >
                              <Icon name="x" size={13} />
                            </button>
                          </div>
                        ))}
                        {p.images.length < 5 && (
                          <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed border-app-line-strong text-app-ink-soft transition hover:border-app-ink hover:text-app-ink focus-within:border-app-ink">
                            <Icon name="plus" size={18} />
                            <span className="text-[11.5px] font-bold">{t("ps.addPhoto")}</span>
                            <input type="file" multiple accept="image/*" className="sr-only" onChange={(e) => addImages(p.id, e.target.files)} />
                          </label>
                        )}
                      </div>
                      <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">{t("ps.photosHelp")}</p>
                    </section>

                    <section className="grid gap-4">
                      <h4 className={`${SECTION_TITLE} mb-0`}>{t("ps.descriptions")}</h4>
                      <div>
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <label htmlFor={`${bodyId}-short`} className={LABEL}>
                            {t("ps.short")} <span className="font-normal text-app-ink-soft">{t("ps.shortHint")}</span>
                          </label>
                          <PeggyBtn id={p.id} field="shortDesc" />
                        </div>
                        <input id={`${bodyId}-short`} value={p.shortDesc} onChange={(e) => update(p.id, { shortDesc: e.target.value })} placeholder={t("ps.shortPh")} className={INPUT} />
                      </div>
                      <div>
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <label htmlFor={`${bodyId}-full`} className={LABEL}>
                            {t("ps.full")} <span className="font-normal text-app-ink-soft">{t("ps.fullHint")}</span>
                          </label>
                          <PeggyBtn id={p.id} field="fullDesc" />
                        </div>
                        <textarea
                          id={`${bodyId}-full`}
                          rows={3}
                          value={p.fullDesc}
                          onChange={(e) => update(p.id, { fullDesc: e.target.value })}
                          placeholder={t("ps.fullPh")}
                          className={`${INPUT} resize-y leading-[1.55]`}
                        />
                      </div>
                    </section>

                    <section>
                      <h4 className={SECTION_TITLE}>{t("ps.options")}</h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {p.variants.map((v, vIdx) => (
                          <div key={vIdx} className="min-w-0">
                            <label htmlFor={`${bodyId}-variant-${vIdx}`} className={`${LABEL} mb-1.5 block`}>{t.dynamic(`ps.${schema.id}.v${vIdx}`, v.type)}</label>
                            <input
                              id={`${bodyId}-variant-${vIdx}`}
                              value={v.options}
                              onChange={(e) => updateVariant(p.id, vIdx, e.target.value)}
                              placeholder={t("ps.optionsPh")}
                              className={INPUT}
                            />
                          </div>
                        ))}
                      </div>
                      <p className="mb-0 mt-2 text-[13px] text-app-ink-soft">{t("ps.optionsHelp")}</p>
                    </section>

                    <section>
                      <h4 className={SECTION_TITLE}>{t("ps.details")}</h4>
                      <div className="grid gap-3">
                        {schema.specFields.map((sf) => (
                          <div key={sf.key}>
                            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                              <label htmlFor={`${bodyId}-spec-${sf.key}`} className={LABEL}>{specLabel(sf)}</label>
                              <PeggyBtn id={p.id} field="spec" specKey={sf.key} />
                            </div>
                            {sf.multiline ? (
                              <textarea
                                id={`${bodyId}-spec-${sf.key}`}
                                rows={2}
                                value={p.specs[sf.key] ?? ""}
                                onChange={(e) => updateSpec(p.id, sf.key, e.target.value)}
                                placeholder={specPlaceholder(sf)}
                                className={`${INPUT} resize-y leading-[1.55]`}
                              />
                            ) : (
                              <input id={`${bodyId}-spec-${sf.key}`} value={p.specs[sf.key] ?? ""} onChange={(e) => updateSpec(p.id, sf.key, e.target.value)} placeholder={specPlaceholder(sf)} className={INPUT} />
                            )}
                          </div>
                        ))}
                      </div>
                    </section>

                    {products.length > 1 && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setProducts((prev) => prev.filter((x) => x.id !== p.id))}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[13.5px] font-bold text-app-danger hover:bg-app-danger-tint"
                        >
                          <Icon name="trash" size={14} /> {t("ps.removeProduct")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => setProducts((prev) => [...prev, mkProduct(schema)])}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-app-line-strong text-[14px] font-bold text-app-ink-soft transition hover:border-app-ink hover:text-app-ink"
          >
            <Icon name="plus" size={16} /> {t("ps.addAnother")}
          </button>
        </div>
      )}

      {tab === "csv" && (
        <div className="grid gap-4">
          <button
            type="button"
            onClick={() => csvRef.current?.click()}
            className={cx(
              "flex flex-col items-center justify-center rounded-[22px] border-2 border-dashed bg-white px-6 py-10 text-center transition hover:border-app-ink",
              csvFileName ? "border-app-ink" : "border-app-line-strong",
            )}
          >
            <Icon name="upload" size={22} className="text-app-ink-soft" />
            <span className="mt-2 text-[15px] font-extrabold">{csvFileName ?? t("ps.chooseCsv")}</span>
            <span className="mt-1 text-[13px] text-app-ink-soft">{t("ps.csvCols")}</span>
          </button>
          <input ref={csvRef} type="file" accept=".csv" aria-label={t("ps.uploadCsv")} className="sr-only" onChange={handleCsvUpload} />

          {csvRows.length > 0 && (
            <div className="overflow-hidden rounded-[22px] border border-app-line bg-white">
              <ul className="m-0 list-none divide-y divide-app-line p-0">
                {csvRows.slice(0, 8).map((r, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-[14px]">
                    <span className="min-w-0 flex-1 truncate font-bold">{r.name || t("ps.noName")}</span>
                    <span className="shrink-0 text-app-ink-soft">{r.price}</span>
                    {r.desc && <span className="w-full truncate text-[13px] text-app-ink-soft">{r.desc}</span>}
                  </li>
                ))}
              </ul>
              {csvRows.length > 8 && <p className="m-0 border-t border-app-line px-4 py-2.5 text-[13px] text-app-ink-soft">{t("ps.more", { count: csvRows.length - 8 })}</p>}
            </div>
          )}
        </div>
      )}

      {tab === "marketplace" && (
        <div className="grid gap-3">
          <p className="m-0 text-[14px] text-app-ink-soft">{t("ps.suggested", { category: category || t("ps.yourStore") })}</p>
          {mpProducts.length === 0 ? (
            <p className="m-0 rounded-[18px] bg-app-canvas px-4 py-8 text-center text-[14px] text-app-ink-soft" role="status">
              {mpState === "loading" || mpState === "idle" ? t("ps.finding") : mpState === "error" ? t("ps.loadError") : t("ps.noneForCategory")}
            </p>
          ) : (
            <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
              {mpProducts.map((p) => (
                <li key={p.id} className="flex min-w-0 items-center gap-3 rounded-[18px] border border-app-line bg-white px-3 py-2.5">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-[10px] object-cover" />
                  ) : (
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-app-canvas text-app-ink-soft"><Icon name="box" size={16} /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{p.name}</span>
                    <span className="block truncate text-[12.5px] text-app-ink-soft">{p.supplier} · {p.currency} {p.price}</span>
                  </span>
                  <PillButton size="sm" tone={addedMp.has(p.id) ? "white" : "ink"} onClick={() => addMpProduct(p.id)} disabled={addedMp.has(p.id)} aria-label={addedMp.has(p.id) ? t("ps.addedLabel", { name: p.name }) : t("ps.addLabel", { name: p.name })}>
                    {addedMp.has(p.id) ? <><Icon name="check" size={13} /> {t("ps.added")}</> : t("ps.add")}
                  </PillButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <PillButton size="md" tone="white" onClick={onBack}>{t("ps.back")}</PillButton>
        <PillButton size="md" onClick={saveAndNext} busy={isSaving} disabled={saved}>
          {saved ? <><Icon name="check" size={15} /> {t("ps.saved")}</> : t("ps.saveContinue")}
        </PillButton>
        <button type="button" onClick={onNext} className="min-h-[44px] px-2 text-[14px] font-bold text-app-ink-soft hover:text-app-ink">
          {t("ps.skip")}
        </button>
      </div>
    </div>
  );
}
