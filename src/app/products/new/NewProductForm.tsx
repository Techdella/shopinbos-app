"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead } from "@/components/ui";
import { askPeggy } from "@/app/actions/ai";
import { Mascot } from "@/components/brand/Mascot";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface PeggyData {
  userName: string;
  storeName: string;
  storeSlug: string;
}

interface Variant {
  id: string;
  name: string;
  sku: string;
  price: string;
  color: string;
  size: string;
  imageUrl: string;
  images: string[];
  customFields: Array<{ id: string; name: string; value: string }>;
  stock: string;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export function NewProductForm({ categories, peggyData }: { categories: Category[]; peggyData: PeggyData }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const [generatingImage, setGeneratingImage] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [enhancingIndex, setEnhancingIndex] = useState<number | null>(null);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [peggyOpen, setPeggyOpen] = useState(false);
  const [peggyMessages, setPeggyMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [peggyInput, setPeggyInput] = useState("");
  const [peggyLoading, setPeggyLoading] = useState(false);

  const storeContext = `Store: ${peggyData.storeName}. Owner: ${peggyData.userName}.`;

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "products");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error("That picture didn't upload. Check your connection and try again.");
        const data = await res.json();
        uploaded.push(data.data.publicUrl);
      }
      setImages((prev) => [...prev, ...uploaded]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That picture didn't upload. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const handleGenerateImage = useCallback(async () => {
    if (!imagePrompt.trim()) return;
    setGeneratingImage(true);
    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: imagePrompt.trim(), size: "1024x1024" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Peggy couldn't make that picture. Try again in a minute.");
      }
      const data = await res.json();
      setImages((prev) => [...prev, data.image.url]);
      setImagePrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Peggy couldn't make that picture. Try again in a minute.");
    } finally {
      setGeneratingImage(false);
    }
  }, [imagePrompt]);

  const handleEnhanceImage = useCallback(async (index: number) => {
    const imageUrl = images[index];
    if (!imageUrl) return;
    setEnhancingIndex(index);
    try {
      const res = await fetch("/api/ai/enhance-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "Peggy couldn't improve that picture. Try again in a minute.");
      }
      const data = await res.json();
      setImages((prev) => [...prev, data.image.url]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Peggy couldn't improve that picture. Try again in a minute.");
    } finally {
      setEnhancingIndex(null);
    }
  }, [images]);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addVariant = useCallback(() => {
    setVariants((prev) => [...prev, { id: uid(), name: "", sku: "", price: "", color: "", size: "", imageUrl: "", images: [], customFields: [], stock: "0" }]);
  }, []);

  const updateVariant = useCallback((id: string, field: keyof Variant, value: string) => {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  }, []);

  const removeVariant = useCallback((id: string) => {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  }, []);

  const uploadVariantImages = useCallback(async (id: string, files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("folder", "product-variants");
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) throw new Error("That picture didn't upload. Check your connection and try again.");
        const data = await res.json();
        uploaded.push(data.data.publicUrl);
      }
      setVariants((prev) => prev.map((variant) => (
        variant.id === id
          ? { ...variant, imageUrl: variant.imageUrl || uploaded[0] || "", images: [...variant.images, ...uploaded] }
          : variant
      )));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That picture didn't upload. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }, []);

  const addVariantField = useCallback((id: string) => {
    setVariants((prev) => prev.map((variant) => (
      variant.id === id
        ? { ...variant, customFields: [...variant.customFields, { id: uid(), name: "", value: "" }] }
        : variant
    )));
  }, []);

  const updateVariantField = useCallback((variantId: string, fieldId: string, key: "name" | "value", value: string) => {
    setVariants((prev) => prev.map((variant) => (
      variant.id === variantId
        ? {
            ...variant,
            customFields: variant.customFields.map((field) => field.id === fieldId ? { ...field, [key]: value } : field),
          }
        : variant
    )));
  }, []);

  const removeVariantField = useCallback((variantId: string, fieldId: string) => {
    setVariants((prev) => prev.map((variant) => (
      variant.id === variantId
        ? { ...variant, customFields: variant.customFields.filter((field) => field.id !== fieldId) }
        : variant
    )));
  }, []);

  const createCategory = useCallback(async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await fetch("/api/app/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.error ?? "Category could not be created");
      const category = json.data as Category;
      setCategoryOptions((prev) => [...prev, category].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCategoryId(category.id);
      setNewCategoryName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Category could not be created");
    }
  }, [newCategoryName]);

  const handlePeggyAsk = useCallback(async () => {
    if (!peggyInput.trim()) return;
    const msg = peggyInput.trim();
    setPeggyMessages((prev) => [...prev, { role: "user", text: msg }]);
    setPeggyInput("");
    setPeggyLoading(true);
    try {
      const res = await askPeggy(msg, storeContext);
      if (res.error) {
        setPeggyMessages((prev) => [...prev, { role: "assistant", text: `Sorry: ${res.error}` }]);
      } else {
        setPeggyMessages((prev) => [...prev, { role: "assistant", text: res.text ?? "" }]);
      }
    } catch {
      setPeggyMessages((prev) => [...prev, { role: "assistant", text: "Something went wrong. Please try again." }]);
    } finally {
      setPeggyLoading(false);
    }
  }, [peggyInput, storeContext]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const description = (form.elements.namedItem("description") as HTMLTextAreaElement).value;
    const sku = (form.elements.namedItem("sku") as HTMLInputElement).value;
    const retailPrice = parseFloat((form.elements.namedItem("retailPrice") as HTMLInputElement).value);
    const costPriceStr = (form.elements.namedItem("costPrice") as HTMLInputElement).value;
    const costPrice = costPriceStr ? parseFloat(costPriceStr) : undefined;
    const categoryId = selectedCategoryId;

    const data = {
      name,
      description: description || undefined,
      sku: sku || undefined,
      images,
      retailPrice,
      costPrice,
      currency: "NGN",
      status: "draft",
      fulfillmentType: "merchant_fulfilled",
      categoryId: categoryId || undefined,
      variants: variants.map((v) => ({
        name: v.name,
        sku: v.sku || undefined,
        price: v.price ? parseFloat(v.price) : undefined,
        color: v.color || undefined,
        size: v.size || undefined,
        imageUrl: v.imageUrl || undefined,
        images: v.images,
        customFields: v.customFields
          .filter((field) => field.name.trim())
          .map((field) => ({ name: field.name.trim(), value: field.value.trim() })),
        stock: parseInt(v.stock) || 0,
      })),
    };

    try {
      const res = await fetch("/api/app/store-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        router.push("/products");
      } else {
        const err = await res.json();
        setError(err?.error ?? "Failed to create product");
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
          title="New product"
          sub="Add a product to your store catalogue with images, variations, and AI assistance"
          actions={
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPeggyOpen((p) => !p)} className="dbtn dBtn-ghost dBtn-sm">
                {peggyOpen ? "Close Peggy" : "Peggy AI"}
              </button>
              <Link href="/products" className="dbtn dBtn-ghost dBtn-sm">
                Cancel
              </Link>
            </div>
          }
        />

        {error && (
          <div className="card" style={{ padding: 12, marginBottom: 14, borderColor: "var(--danger)", color: "var(--danger)", fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="grid gap-6" style={{ gridTemplateColumns: peggyOpen ? "1fr 320px" : "1fr" }}>
          <form onSubmit={handleSubmit} className="space-y-5">
            <section className="card" style={{ padding: 20 }}>
              <div className="onb-card-kicker">Product details</div>
              <h2 className="m-0 mt-1 mb-4 font-display text-[22px] font-normal text-[var(--ink-900)]">Tell buyers what you&apos;re selling.</h2>
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <label className="field">
                  <span className="label">Product name *</span>
                  <input name="name" className="inp" required minLength={2} maxLength={200} placeholder="e.g. Premium Leather Tote Bag" />
                </label>
                <label className="field">
                  <span className="label">SKU (optional)</span>
                  <input name="sku" className="inp" maxLength={60} placeholder="e.g. LTH-TOTE-001" />
                </label>
              </div>
              <div className="grid gap-4 lg:grid-cols-[1fr_0.6fr] mt-4">
                <label className="field">
                  <span className="label">Description</span>
                  <textarea id="new-product-description" name="description" className="ta" rows={5} placeholder="Describe your product, materials, sizing, features, and what makes it special." />
                  <VoiceInputButton targetId="new-product-description" context="a product description" className="mt-2" />
                </label>
                <label className="field">
                  <span className="label">Category</span>
                  <select name="categoryId" className="inp" value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
                    <option value="">No category</option>
                    {categoryOptions.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={newCategoryName}
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      className="inp text-[13px]"
                      placeholder="Create category, e.g. Shoes"
                    />
                    <button type="button" onClick={createCategory} className="dbtn dBtn-ghost dBtn-sm" disabled={!newCategoryName.trim()}>
                      Add
                    </button>
                  </div>
                </label>
              </div>
            </section>

            <section className="card" style={{ padding: 20 }}>
              <div className="onb-card-kicker">Pricing</div>
              <h2 className="m-0 mt-1 mb-4 font-display text-[22px] font-normal text-[var(--ink-900)]">Set your prices.</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field">
                  <span className="label">Retail price (₦) *</span>
                  <input name="retailPrice" type="number" className="inp" required min={1} step="0.01" placeholder="e.g. 25000" />
                </label>
                <label className="field">
                  <span className="label">Cost price (₦)</span>
                  <input name="costPrice" type="number" className="inp" min={0} step="0.01" placeholder="e.g. 15000" />
                </label>
              </div>
            </section>

            <section className="card" style={{ padding: 20 }}>
              <div className="onb-card-kicker">Product images</div>
              <h2 className="m-0 mt-1 mb-4 font-display text-[22px] font-normal text-[var(--ink-900)]">Upload, generate, or enhance product photos.</h2>

              <div className="flex flex-wrap gap-3 mb-4">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="dbtn dBtn-ghost dBtn-sm" disabled={uploading}>
                  {uploading ? "Uploading..." : "Upload images"}
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />

                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="Describe an image to generate..."
                    className="inp"
                    style={{ width: 280, fontSize: 13 }}
                    disabled={generatingImage}
                  />
                  <button type="button" onClick={handleGenerateImage} className="dbtn dBtn-mint dBtn-sm" disabled={generatingImage || !imagePrompt.trim()}>
                    {generatingImage ? "Generating..." : "Generate"}
                  </button>
                </div>
              </div>

              {images.length > 0 ? (
                <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                  {images.map((url, i) => (
                    <div key={i} className="relative rounded-[10px] overflow-hidden border border-[var(--ink-100)]" style={{ aspectRatio: "1/1" }}>
                      <img src={url} alt={`Product ${i + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 flex gap-1 p-1 bg-gradient-to-t from-black/60 to-transparent">
                        <button type="button" onClick={() => removeImage(i)} className="text-white text-[11px] bg-red-600/80 rounded px-2 py-0.5 hover:bg-red-600">Remove</button>
                        <button
                          type="button"
                          onClick={() => handleEnhanceImage(i)}
                          disabled={enhancingIndex === i}
                          className="text-white text-[11px] bg-blue-600/80 rounded px-2 py-0.5 hover:bg-blue-600"
                        >
                          {enhancingIndex === i ? "..." : "Enhance"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-[13px] text-[var(--ink-400)] border-2 border-dashed border-[var(--ink-200)] rounded-[12px]">
                  No images yet. Upload, generate, or drop files here.
                </div>
              )}
            </section>

            <section className="card" style={{ padding: 20 }}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="onb-card-kicker">Variants</div>
                  <h2 className="m-0 mt-1 font-display text-[22px] font-normal text-[var(--ink-900)]">Add size, color, and SKU options.</h2>
                </div>
                <button type="button" onClick={addVariant} className="dbtn dBtn-ghost dBtn-sm">+ Add variant</button>
              </div>

              {variants.length === 0 ? (
                <div className="text-center py-6 text-[13px] text-[var(--ink-400)] border-2 border-dashed border-[var(--ink-200)] rounded-[12px]">
                  No variants yet. Add options like size or color.
                </div>
              ) : (
                <div className="space-y-3">
                  {variants.map((v) => (
                    <div key={v.id} className="space-y-3 rounded-[10px] border border-[var(--ink-100)] bg-[var(--ink-50)] p-3">
                      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 90px 110px 90px 80px 32px" }}>
                        <label className="field"><span className="label text-[11px]">Name</span><input className="inp text-[13px]" value={v.name} onChange={(e) => updateVariant(v.id, "name", e.target.value)} placeholder="Black size 42" /></label>
                        <label className="field"><span className="label text-[11px]">SKU</span><input className="inp text-[13px]" value={v.sku} onChange={(e) => updateVariant(v.id, "sku", e.target.value)} placeholder="SHOE-BLK-42" /></label>
                        <label className="field"><span className="label text-[11px]">Price</span><input className="inp text-[13px]" type="number" value={v.price} onChange={(e) => updateVariant(v.id, "price", e.target.value)} placeholder="25000" /></label>
                        <label className="field"><span className="label text-[11px]">Color</span><input className="inp text-[13px]" value={v.color} onChange={(e) => updateVariant(v.id, "color", e.target.value)} placeholder="Black" /></label>
                        <label className="field"><span className="label text-[11px]">Size</span><input className="inp text-[13px]" value={v.size} onChange={(e) => updateVariant(v.id, "size", e.target.value)} placeholder="42 / XL" /></label>
                        <label className="field"><span className="label text-[11px]">Stock</span><input className="inp text-[13px]" type="number" value={v.stock} onChange={(e) => updateVariant(v.id, "stock", e.target.value)} placeholder="10" /></label>
                        <button type="button" onClick={() => removeVariant(v.id)} className="mt-5 text-red-500 hover:text-red-700 text-[18px]">&times;</button>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                        <div>
                          <div className="label text-[11px]">Variant images</div>
                          <label className="dbtn dBtn-ghost dBtn-sm inline-flex cursor-pointer">
                            Upload
                            <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => uploadVariantImages(v.id, event.target.files)} />
                          </label>
                          {images.length > 0 ? (
                            <select className="inp mt-2 text-[12px]" value="" onChange={(event) => {
                              const url = event.target.value;
                              if (!url) return;
                              setVariants((prev) => prev.map((variant) => variant.id === v.id ? { ...variant, imageUrl: variant.imageUrl || url, images: [...variant.images, url] } : variant));
                            }}>
                              <option value="">Reuse product image</option>
                              {images.map((url, index) => <option key={url} value={url}>Image {index + 1}</option>)}
                            </select>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {v.images.map((url, index) => (
                            <button
                              key={`${url}-${index}`}
                              type="button"
                              onClick={() => updateVariant(v.id, "imageUrl", url)}
                              className={`overflow-hidden rounded-[8px] border ${v.imageUrl === url ? "border-[var(--teal-600)]" : "border-[var(--ink-100)]"}`}
                              style={{ width: 58, height: 58 }}
                              title="Set as primary variant image"
                            >
                              <img src={url} alt="" className="h-full w-full object-cover" />
                            </button>
                          ))}
                          {v.images.length === 0 ? <span className="text-[12px] text-[var(--ink-400)]">No variant images yet.</span> : null}
                        </div>
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <div className="label text-[11px]">Custom fields</div>
                          <button type="button" className="text-[12px] font-semibold text-[var(--teal-700)]" onClick={() => addVariantField(v.id)}>+ Add field</button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {v.customFields.map((field) => (
                            <div key={field.id} className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 28px" }}>
                              <input className="inp text-[12px]" value={field.name} onChange={(event) => updateVariantField(v.id, field.id, "name", event.target.value)} placeholder="Field, e.g. Material" />
                              <input className="inp text-[12px]" value={field.value} onChange={(event) => updateVariantField(v.id, field.id, "value", event.target.value)} placeholder="Value, e.g. Leather" />
                              <button type="button" onClick={() => removeVariantField(v.id, field.id)} className="text-red-500">&times;</button>
                            </div>
                          ))}
                        </div>
                        {v.customFields.length === 0 ? <div className="text-[12px] text-[var(--ink-400)]">Add fields like shoe size, material, ingredients, fit, or care instructions.</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="flex items-center justify-end gap-2">
              <Link href="/products" className="dbtn dBtn-ghost">Cancel</Link>
              <button type="submit" className="dbtn dBtn-mint" disabled={saving}>
                {saving ? "Saving..." : "Save product"}
              </button>
            </div>
          </form>

          {peggyOpen && (
            <aside className="card flex flex-col" style={{ maxHeight: "calc(100vh - 140px)", background: "var(--ink-50)" }}>
              <div className="p-3 border-b border-[var(--ink-100)]">
                <div className="flex items-center gap-2">
                  <Mascot who="peggy" mood={peggyLoading ? "thinking" : "idle"} className="h-8 w-8 rounded-full" />
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--ink-900)]">Peggy</div>
                    <div className="text-[11px] text-[var(--ink-500)]">AI product assistant</div>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 text-[13px]">
                {peggyMessages.length === 0 && (
                  <div className="text-center py-6 text-[var(--ink-400)]">
                    <p className="mb-2">Hi! I&apos;m Peggy. I can help you:</p>
                    <ul className="text-left space-y-1 list-disc list-inside text-[12px]">
                      <li>Write product descriptions</li>
                      <li>Suggest retail prices</li>
                      <li>Brainstorm product names</li>
                      <li>Write marketing copy</li>
                    </ul>
                  </div>
                )}
                {peggyMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-[12px] px-3 py-2 leading-5 ${
                      msg.role === "user"
                        ? "bg-[var(--teal-600)] text-white"
                        : "bg-white border border-[var(--ink-100)] text-[var(--ink-800)]"
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {peggyLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-[var(--ink-100)] rounded-[12px] px-3 py-2 text-[var(--ink-400)]">Thinking...</div>
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-[var(--ink-100)]">
                <div className="flex gap-2">
                  <input
                    value={peggyInput}
                    onChange={(e) => setPeggyInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePeggyAsk(); } }}
                    placeholder="Ask Peggy for help..."
                    className="inp flex-1 text-[13px]"
                    disabled={peggyLoading}
                  />
                  <button type="button" onClick={handlePeggyAsk} disabled={peggyLoading || !peggyInput.trim()} className="dbtn dBtn-mint dBtn-sm">
                    Send
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </AppFrame>
  );
}
