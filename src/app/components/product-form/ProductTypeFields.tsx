"use client";

import { cx } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { field } from "@/components/seller-core";
import { useT } from "@/components/i18n/I18nProvider";
import { PRODUCT_TYPES, productTypeDef, type DetailField, type ProductTypeKey } from "@shared/product-types";

// The product type picker (preset categories) and the type's details on the product form. Choosing a type shows
// its details straight away (Clothing → Material, Fit, For, Care instructions); values are saved in
// StoreProduct.productDetails, except care instructions and warranty, which use their own product fields.

export type ColumnValues = { careInstructions: string; warranty: string };

export function ProductTypePicker({ value, onChange }: { value: ProductTypeKey | null; onChange: (key: ProductTypeKey) => void }) {
  const t = useT("productTypes");
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={field.label}>{t("type.question")}</legend>
      <p className={cx(field.hint, "mb-2 mt-0")}>{t("type.questionSub")}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" role="radiogroup" aria-label={t("type.question")}>
        {PRODUCT_TYPES.map((type) => {
          const on = value === type.key;
          return (
            <button
              key={type.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(type.key)}
              className={cx(
                "flex min-h-[56px] items-center gap-2.5 rounded-[14px] border px-3 py-2 text-left transition",
                on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
              )}
            >
              <Icon name={type.icon as IconName} size={17} className="shrink-0" />
              <span className="min-w-0">
                <span className="block text-[14px] font-bold leading-tight">{t.dynamic(`type.${type.key}`, type.label)}</span>
                <span className={cx("block truncate text-[12px] leading-tight", on ? "text-white/75" : "text-app-ink-soft")}>{t.dynamic(`hint.${type.key}`, type.hint)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

interface FieldsProps {
  productType: ProductTypeKey | null;
  details: Record<string, string>;
  onDetail: (key: string, value: string) => void;
  columns: ColumnValues;
  onColumn: (key: keyof ColumnValues, value: string) => void;
}

export function ProductTypeDetails({ productType, details, onDetail, columns, onColumn }: FieldsProps) {
  const t = useT("productTypes");
  const type = productTypeDef(productType);
  if (!type.fields.length) return <p className="m-0 text-[14px] text-app-ink-soft">{t("details.none")}</p>;

  function valueOf(entry: DetailField) {
    return entry.column ? columns[entry.column] : details[entry.key] ?? "";
  }
  function set(entry: DetailField, value: string) {
    if (entry.column) onColumn(entry.column, value);
    else onDetail(entry.key, value);
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {type.fields.map((entry) => {
        const label = t.dynamic(`field.${entry.key}`, entry.label);
        const value = valueOf(entry);
        const id = `detail-${type.key}-${entry.key}`;
        return (
          <div key={entry.key} className={cx("min-w-0", entry.kind === "longtext" && "md:col-span-2")}>
            <label htmlFor={id} className={field.label}>{label}</label>
            {entry.kind === "longtext" ? (
              <textarea id={id} value={value} onChange={(e) => set(entry, e.target.value)} className={field.textarea} rows={3} maxLength={1000} placeholder={entry.placeholder} />
            ) : (
              <input id={id} value={value} onChange={(e) => set(entry, e.target.value)} className={field.input} maxLength={entry.kind === "select" ? 120 : 300} placeholder={entry.placeholder ?? (entry.choices ? entry.choices[0] : "")} />
            )}
            {entry.choices ? (
              <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t("details.quick", { name: label })}>
                {entry.choices.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={value === choice}
                    onClick={() => set(entry, value === choice ? "" : choice)}
                    className={cx("min-h-[34px] rounded-full border px-3 text-[13px] font-bold", value === choice ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong")}
                  >
                    {choice}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
