"use client";

import { useState } from "react";
import { cx } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { field, pillButton } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";
import { productTypeDef, type ProductTypeKey } from "@shared/product-types";
import {
  MAX_OPTIONS,
  MAX_VARIANTS,
  adjustPrices,
  combinationCount,
  generateVariants,
  setAllPrices,
  totalVariantStock,
  type ProductVariant,
  type VariantOption,
} from "@shared/product-variants";

// Sizes, colours and other options on the product form: options with their values (quick chips from the product
// type), one row per combination with its own price, "was" price, stock, SKU, photo and on/off, and bulk tools.
// The rows are made by shared/product-variants.ts (generateVariants), so a combination keeps its price and stock
// when other values are added or removed.

interface Props {
  productType: ProductTypeKey | null;
  options: VariantOption[];
  variants: ProductVariant[];
  basePrice: number | null;
  images: string[];
  /** Whether this product counts its own stock (stock boxes show). */
  countsStock: boolean;
  onChange: (options: VariantOption[], variants: ProductVariant[]) => void;
  /** Opens Peggy with a request typed in for the seller. */
  onAskPeggy?: (prompt: string) => void;
}

function numberOrNull(text: string): number | null {
  const clean = text.replace(/[,₦\s]/g, "");
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const naira = (value: number) => `₦${Math.round(value).toLocaleString("en-NG")}`;

export function VariantsEditor({ productType, options, variants, basePrice, images, countsStock, onChange, onAskPeggy }: Props) {
  const t = useT("productTypes");
  const type = productTypeDef(productType);
  const [problem, setProblem] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [allPrice, setAllPrice] = useState("");
  const [adjust, setAdjust] = useState({ key: "", amount: "" });
  const [photoFor, setPhotoFor] = useState<string | null>(null);

  function update(nextOptions: VariantOption[]) {
    const rows = generateVariants(nextOptions, variants, basePrice);
    if (!rows) {
      setProblem(t("v.tooMany", { count: combinationCount(nextOptions), max: MAX_VARIANTS }));
      return;
    }
    setProblem("");
    onChange(nextOptions, rows);
  }

  function addOption(name: string) {
    if (options.length >= MAX_OPTIONS || options.some((option) => option.name.toLowerCase() === name.toLowerCase())) return;
    // A new option starts empty and makes no rows until it has a value.
    onChange([...options, { name, values: [] }], variants);
  }

  function renameOption(index: number, name: string) {
    const old = options[index].name;
    const next = options.map((option, i) => (i === index ? { ...option, name } : option));
    // Rows keep their values under the new name.
    const rows = variants.map((variant) => {
      if (!(old in variant.options)) return variant;
      const renamed: Record<string, string> = {};
      for (const [key, value] of Object.entries(variant.options)) renamed[key === old ? name : key] = value;
      return { ...variant, options: renamed };
    });
    onChange(next, rows);
  }

  function addValues(index: number, raw: string) {
    const values = raw.split(/[,\n]/).map((value) => value.trim()).filter(Boolean);
    if (!values.length) return;
    const option = options[index];
    const merged = [...option.values];
    for (const value of values) if (!merged.some((existing) => existing.toLowerCase() === value.toLowerCase())) merged.push(value);
    update(options.map((entry, i) => (i === index ? { ...entry, values: merged } : entry)));
    setDrafts((current) => ({ ...current, [index]: "" }));
  }

  function removeValue(index: number, value: string) {
    update(options.map((entry, i) => (i === index ? { ...entry, values: entry.values.filter((v) => v !== value) } : entry)));
  }

  function removeOption(index: number) {
    update(options.filter((_, i) => i !== index));
  }

  function editRow(id: string, patch: Partial<ProductVariant>) {
    onChange(options, variants.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)));
  }

  const presetLeft = type.options.filter((preset) => !options.some((option) => option.name.toLowerCase() === preset.name.toLowerCase()));
  const allValues = options.flatMap((option) => option.values.map((value) => ({ key: `${option.name}::${value}`, option: option.name, value })));
  const totalStock = totalVariantStock(variants);
  const base = basePrice ?? 0;

  return (
    <div className="grid gap-4">
      {options.length === 0 ? (
        <p className="m-0 rounded-[16px] bg-app-canvas px-4 py-3 text-[14px] text-app-ink-soft">{t("v.empty")}</p>
      ) : null}

      {options.map((option, index) => {
        const preset = type.options.find((entry) => entry.name.toLowerCase() === option.name.toLowerCase());
        const quick = (preset?.values ?? []).filter((value) => !option.values.some((v) => v.toLowerCase() === value.toLowerCase()));
        return (
          <div key={index} className="grid gap-3 rounded-[18px] border border-app-line p-4">
            <div className="flex items-end gap-2">
              <label className="block min-w-0 flex-1">
                <span className={field.label}>{t("v.optionName")}</span>
                <input value={option.name} onChange={(e) => renameOption(index, e.target.value)} className={field.input} maxLength={40} placeholder={t("v.optionNamePlaceholder")} />
              </label>
              <button type="button" onClick={() => removeOption(index)} aria-label={t("v.removeOption", { name: option.name || "" })} className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-app-danger hover:bg-app-danger-tint">
                <Icon name="trash" size={16} />
              </button>
            </div>
            {option.values.length ? (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label={t("v.choicesFor", { name: option.name })}>
                {option.values.map((value) => (
                  <li key={value}>
                    <span className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-app-ink pl-3.5 pr-1 text-[13.5px] font-bold text-white">
                      {value}
                      <button type="button" onClick={() => removeValue(index, value)} aria-label={t("v.removeValue", { value })} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/20">
                        <Icon name="x" size={12} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <input
                value={drafts[index] ?? ""}
                onChange={(e) => setDrafts((current) => ({ ...current, [index]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addValues(index, drafts[index] ?? "");
                  }
                }}
                className={cx(field.input, "flex-1")}
                placeholder={t("v.addValuePlaceholder")}
                aria-label={t("v.addValueFor", { name: option.name })}
              />
              <button type="button" onClick={() => addValues(index, drafts[index] ?? "")} className={cx(pillButton.white, "min-h-12 shrink-0")}>
                <Icon name="plus" size={14} /> {t("v.add")}
              </button>
            </div>
            {quick.length ? (
              <div className="flex flex-wrap gap-1.5" aria-label={t("v.quickChoices")}>
                {quick.map((value) => (
                  <button key={value} type="button" onClick={() => addValues(index, value)} className="min-h-[34px] rounded-full border border-dashed border-app-line-strong bg-white px-3 text-[13px] font-bold text-app-ink hover:bg-app-canvas">
                    + {value}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      {options.length < MAX_OPTIONS ? (
        <div className="flex flex-wrap gap-2">
          {presetLeft.map((preset) => (
            <button key={preset.name} type="button" onClick={() => addOption(preset.name)} className={pillButton.white}>
              <Icon name="plus" size={14} /> {preset.name}
            </button>
          ))}
          <button type="button" onClick={() => addOption("")} className={pillButton.white}>
            <Icon name="plus" size={14} /> {t("v.otherOption")}
          </button>
        </div>
      ) : (
        <p className={field.hint}>{t("v.maxOptions", { max: MAX_OPTIONS })}</p>
      )}

      {problem ? <p role="alert" className="m-0 rounded-[14px] bg-app-danger-tint px-4 py-3 text-[14px] font-bold text-app-danger">{problem}</p> : null}

      {variants.length ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-[15px] font-extrabold">{t("v.rowsTitle", { count: variants.length })}</h3>
            {countsStock && totalStock !== null ? <span className="text-[13px] text-app-ink-soft">{t("v.totalStock", { count: totalStock })}</span> : null}
          </div>

          {/* Bulk tools */}
          <div className="grid gap-2 rounded-[16px] bg-app-canvas p-3 sm:grid-cols-2">
            <div className="flex gap-2">
              <input value={allPrice} onChange={(e) => setAllPrice(e.target.value)} inputMode="decimal" className={cx(field.input, "min-w-0 flex-1 bg-white")} placeholder={basePrice ? String(basePrice) : "15000"} aria-label={t("v.setAllLabel")} />
              <button
                type="button"
                className={cx(pillButton.ink, "min-h-12 shrink-0")}
                onClick={() => {
                  const value = numberOrNull(allPrice);
                  if (value === null) return;
                  onChange(options, setAllPrices(variants, value));
                  setAllPrice("");
                }}
              >
                {t("v.setAll")}
              </button>
            </div>
            <div className="flex gap-2">
              <span className="grid h-12 shrink-0 place-items-center text-[14px] font-bold">+₦</span>
              <input value={adjust.amount} onChange={(e) => setAdjust((current) => ({ ...current, amount: e.target.value }))} inputMode="decimal" className={cx(field.input, "w-[96px] shrink-0 bg-white")} placeholder="2000" aria-label={t("v.adjustAmount")} />
              <div className="min-w-0 flex-1">
                <select value={adjust.key} onChange={(e) => setAdjust((current) => ({ ...current, key: e.target.value }))} className={cx(field.select, "bg-white")} aria-label={t("v.adjustFor")}>
                  <option value="">{t("v.adjustPick")}</option>
                  {allValues.map((entry) => (
                    <option key={entry.key} value={entry.key}>{t("v.adjustOption", { value: entry.value, option: entry.option })}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className={cx(pillButton.white, "min-h-12 shrink-0")}
                onClick={() => {
                  const amount = Number(adjust.amount.replace(/[,₦\s]/g, ""));
                  const target = allValues.find((entry) => entry.key === adjust.key);
                  if (!target || !Number.isFinite(amount) || !amount) return;
                  onChange(options, adjustPrices(variants, target.option, target.value, amount, base));
                  setAdjust({ key: "", amount: "" });
                }}
              >
                {t("v.adjustApply")}
              </button>
            </div>
          </div>
          {onAskPeggy ? (
            <button type="button" onClick={() => onAskPeggy(t("v.peggyPrompt"))} className="flex items-center gap-2 self-start rounded-full bg-app-mint px-4 py-2 text-left text-[13.5px] font-bold text-app-ink hover:brightness-95">
              <Icon name="sparkle" size={14} /> {t("v.askPeggy")}
            </button>
          ) : null}

          {/* One card per version on phones, a table on wide screens. */}
          <div className="hidden grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))_56px_64px] gap-2 px-2 text-[12px] font-bold uppercase tracking-[0.06em] text-app-ink-soft lg:grid">
            <span>{t("v.col.option")}</span>
            <span>{t("v.col.price")}</span>
            <span>{t("v.col.was")}</span>
            <span>{countsStock ? t("v.col.stock") : ""}</span>
            <span>SKU</span>
            <span>{t("v.col.photo")}</span>
            <span>{t("v.col.on")}</span>
          </div>
          <ul className="m-0 grid list-none gap-2 p-0">
            {variants.map((variant) => {
              const price = variant.price ?? base;
              return (
                <li key={variant.id} className={cx("grid gap-2 rounded-[16px] border border-app-line p-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))_56px_64px] lg:items-center", !variant.enabled && "bg-app-canvas opacity-70")}>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-extrabold">{variant.name || "—"}</div>
                    {basePrice !== null && price !== basePrice ? (
                      <div className="text-[12.5px] text-app-ink-soft">{price > basePrice ? `+${naira(price - basePrice)}` : `−${naira(basePrice - price)}`}</div>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:contents">
                    <label className="block min-w-0">
                      <span className="mb-1 block text-[12px] font-bold text-app-ink-soft lg:sr-only">{t("v.col.price")}</span>
                      <input value={variant.price ?? ""} onChange={(e) => editRow(variant.id, { price: numberOrNull(e.target.value) })} inputMode="decimal" type="number" min={0} step="0.01" className={field.input} placeholder={basePrice !== null ? String(basePrice) : ""} aria-label={t("v.priceOf", { name: variant.name })} />
                    </label>
                    <label className="block min-w-0">
                      <span className="mb-1 block text-[12px] font-bold text-app-ink-soft lg:sr-only">{t("v.col.was")}</span>
                      <input value={variant.compareAtPrice ?? ""} onChange={(e) => editRow(variant.id, { compareAtPrice: numberOrNull(e.target.value) })} inputMode="decimal" type="number" min={0} step="0.01" className={field.input} aria-label={t("v.wasOf", { name: variant.name })} />
                    </label>
                    {countsStock ? (
                      <label className="block min-w-0">
                        <span className="mb-1 block text-[12px] font-bold text-app-ink-soft lg:sr-only">{t("v.col.stock")}</span>
                        <input value={variant.stock ?? ""} onChange={(e) => { const value = numberOrNull(e.target.value); editRow(variant.id, { stock: value === null ? null : Math.floor(value) }); }} inputMode="numeric" type="number" min={0} step={1} className={field.input} placeholder="—" aria-label={t("v.stockOf", { name: variant.name })} />
                      </label>
                    ) : <span className="hidden lg:block" />}
                    <label className="block min-w-0">
                      <span className="mb-1 block text-[12px] font-bold text-app-ink-soft lg:sr-only">SKU</span>
                      <input value={variant.sku ?? ""} onChange={(e) => editRow(variant.id, { sku: e.target.value.trim() ? e.target.value.slice(0, 60) : null })} className={field.input} aria-label={t("v.skuOf", { name: variant.name })} />
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-2 lg:contents">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setPhotoFor(photoFor === variant.id ? null : variant.id)}
                        aria-expanded={photoFor === variant.id}
                        aria-label={t("v.photoOf", { name: variant.name })}
                        className="grid h-12 w-12 place-items-center overflow-hidden rounded-[12px] border border-app-line bg-app-canvas"
                      >
                        {variant.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={variant.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon name="image" size={16} />
                        )}
                      </button>
                      {photoFor === variant.id ? (
                        <div className="absolute left-0 top-14 z-20 grid w-[232px] max-w-[calc(100vw-48px)] grid-cols-4 gap-1.5 rounded-[14px] border border-app-line bg-white p-2 shadow-lg">
                          {images.length ? (
                            images.map((url, i) => (
                              <button key={url} type="button" onClick={() => { editRow(variant.id, { imageUrl: url }); setPhotoFor(null); }} aria-label={t("v.usePhoto", { number: i + 1 })} className={cx("aspect-square overflow-hidden rounded-[8px] border-2", variant.imageUrl === url ? "border-app-ink" : "border-transparent")}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="" className="h-full w-full object-cover" />
                              </button>
                            ))
                          ) : (
                            <p className="col-span-4 m-0 p-1 text-[12.5px] text-app-ink-soft">{t("v.noPhotos")}</p>
                          )}
                          {variant.imageUrl ? (
                            <button type="button" onClick={() => { editRow(variant.id, { imageUrl: null }); setPhotoFor(null); }} className="col-span-4 min-h-[32px] rounded-full text-[12.5px] font-bold text-app-danger hover:bg-app-danger-tint">
                              {t("v.noPhoto")}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] font-bold">
                      <input type="checkbox" checked={variant.enabled} onChange={(e) => editRow(variant.id, { enabled: e.target.checked })} className={field.checkbox} aria-label={t("v.onOf", { name: variant.name })} />
                      <span className="lg:sr-only">{variant.enabled ? t("v.on") : t("v.off")}</span>
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
          {countsStock ? <p className={field.hint}>{t("v.stockHint")}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
