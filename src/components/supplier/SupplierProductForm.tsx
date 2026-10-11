import type { ReactNode } from "react";
import { Card, Pill } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { PRODUCT_STATUS, buttonClass, fieldClass, hintClass, labelClass, money, statusOf, textareaClass } from "./supplier-kit";

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
}

interface SupplierProductFormValue {
  id?: string;
  name?: string;
  description?: string;
  categoryId?: string;
  images?: string[];
  wholesalePrice?: number;
  wholesalePriceTo?: number | null;
  suggestedRetailPrice?: number;
  currency?: string;
  moq?: number;
  stockQuantity?: number;
  pricingTiers?: unknown;
  dropshipAvailable?: boolean;
  bulkOrderAvailable?: boolean;
  sampleAvailable?: boolean;
  deliveryRegions?: string[];
  processingTime?: string | null;
  status?: string;
}

interface SupplierProductFormProps {
  mode: "create" | "edit";
  action: (formData: FormData) => void | Promise<void>;
  categories: CategoryOption[];
  product?: SupplierProductFormValue | null;
  error?: string;
  saved?: boolean;
}

function pricingTierText(product?: SupplierProductFormValue | null) {
  const tiers = Array.isArray(product?.pricingTiers) ? product.pricingTiers : [];
  return tiers
    .filter((tier): tier is { minQty: number; maxQty?: number | null; price: number } => {
      if (!tier || typeof tier !== "object") return false;
      const value = tier as { minQty?: unknown; price?: unknown };
      return typeof value.minQty === "number" && typeof value.price === "number";
    })
    .map((tier) => `${tier.minQty}${tier.maxQty ? `-${tier.maxQty}` : ""}: ${tier.price}`)
    .join("\n");
}

function Section({ title, sub, aside, children }: { title: string; sub: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[19px] font-extrabold tracking-[-0.3px]">{title}</h2>
          <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">{sub}</p>
        </div>
        {aside}
      </div>
      {children}
    </Card>
  );
}

function Field({ id, label, hint, className, children }: { id: string; label: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      {children}
      {hint && <div className={hintClass}>{hint}</div>}
    </div>
  );
}

export function SupplierProductForm({ mode, action, categories, product, error, saved }: SupplierProductFormProps) {
  const isEdit = mode === "edit";
  const currency = product?.currency ?? "NGN";
  const wholesalePrice = product?.wholesalePrice ?? 0;
  const suggestedRetailPrice = product?.suggestedRetailPrice ?? 0;
  const margin = suggestedRetailPrice > 0 && wholesalePrice > 0
    ? Math.round(((suggestedRetailPrice - wholesalePrice) / suggestedRetailPrice) * 100)
    : 0;
  const status = product?.status ? statusOf(PRODUCT_STATUS, product.status) : null;
  const checklist = [
    { label: "Clear product name", done: Boolean(product?.name?.trim()) },
    { label: "Description sellers can reuse", done: (product?.description?.trim().length ?? 0) >= 40 },
    { label: "At least one image", done: (product?.images?.length ?? 0) > 0 },
    { label: "MOQ and stock set", done: Boolean(product?.moq) && (product?.stockQuantity ?? 0) > 0 },
    { label: "Delivery regions listed", done: (product?.deliveryRegions?.length ?? 0) > 0 },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <form action={action} className="grid min-w-0 content-start gap-5">
        {product?.id && <input type="hidden" name="productId" value={product.id} />}

        {(error || saved) && (
          <div role={error ? "alert" : "status"} className={`rounded-[16px] px-4 py-3 text-[14px] font-medium ${error ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
            {error ?? "Saved."}
          </div>
        )}

        <Section title="What are sellers buying?" sub="Name, category and a description sellers can copy into their shop." aside={status ? <Pill tone={status.tone}>{status.label}</Pill> : undefined}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Field id="product-name" label="Product name">
              <input id="product-name" className={fieldClass} name="name" defaultValue={product?.name ?? ""} placeholder="Handmade leather sandal" required />
            </Field>
            <Field id="product-category" label="Category">
              <select id="product-category" className={fieldClass} name="categoryId" defaultValue={product?.categoryId ?? categories[0]?.id ?? ""} required>
                <option value="" disabled>Choose category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field id="product-description" label="Description" className="mt-4">
            <textarea
              id="product-description"
              className={textareaClass}
              name="description"
              rows={6}
              defaultValue={product?.description ?? ""}
              placeholder="Material, sizing, packaging, production capacity, and what makes it easy for sellers to resell."
              required
            />
          </Field>
        </Section>

        <Section title="Trade terms" sub="Prices, minimum order and what you have in stock.">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <Field id="product-wholesale" label="Wholesale price">
              <input id="product-wholesale" className={fieldClass} name="wholesalePrice" type="number" min="1" step="1" defaultValue={product?.wholesalePrice ?? ""} required />
            </Field>
            <Field id="product-price-to" label="Price up to" hint="Optional, for a price range">
              <input id="product-price-to" className={fieldClass} name="wholesalePriceTo" type="number" min="0" step="1" defaultValue={product?.wholesalePriceTo ?? ""} />
            </Field>
            <Field id="product-retail" label="Suggested retail price">
              <input id="product-retail" className={fieldClass} name="suggestedRetailPrice" type="number" min="1" step="1" defaultValue={product?.suggestedRetailPrice ?? ""} required />
            </Field>
            <Field id="product-currency" label="Currency">
              <input id="product-currency" className={fieldClass} name="currency" defaultValue={currency} maxLength={3} required />
            </Field>
            <Field id="product-moq" label="Minimum order (MOQ)">
              <input id="product-moq" className={fieldClass} name="moq" type="number" min="1" step="1" defaultValue={product?.moq ?? 1} required />
            </Field>
            <Field id="product-stock" label="Stock available">
              <input id="product-stock" className={fieldClass} name="stockQuantity" type="number" min="0" step="1" defaultValue={product?.stockQuantity ?? 0} required />
            </Field>
            <Field id="product-processing" label="Processing time" className="sm:col-span-2">
              <input id="product-processing" className={fieldClass} name="processingTime" defaultValue={product?.processingTime ?? ""} placeholder="2-4 business days" />
            </Field>
          </div>
          <Field id="product-tiers" label="Tier pricing" hint="One tier per line: quantity range, then unit price." className="mt-4">
            <textarea id="product-tiers" className={`${textareaClass} font-mono text-[13.5px]`} name="pricingTiers" rows={3} defaultValue={pricingTierText(product)} placeholder={"10-49: 8500\n50-99: 7800\n100: 7200"} />
          </Field>
        </Section>

        <Section title="Photos and delivery" sub="What sellers see in the marketplace and where you can send it.">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field id="product-images" label="Image URLs" hint="One link per line. The first one is the cover.">
              <textarea id="product-images" className={`${textareaClass} font-mono text-[13.5px]`} name="images" rows={5} defaultValue={(product?.images ?? []).join("\n")} placeholder="https://..." required />
            </Field>
            <Field id="product-regions" label="Delivery regions" hint="One city or state per line.">
              <textarea id="product-regions" className={textareaClass} name="deliveryRegions" rows={5} defaultValue={(product?.deliveryRegions ?? ["Lagos", "Abuja"]).join("\n")} placeholder={"Lagos\nAbuja\nPort Harcourt"} required />
            </Field>
          </div>
          <fieldset className="m-0 mt-4 grid gap-2 border-0 p-0 sm:grid-cols-3">
            <legend className="mb-2 text-[14px] font-bold">How sellers can buy</legend>
            {[
              ["dropshipAvailable", "Dropship", "You ship each order to the customer", product?.dropshipAvailable ?? false],
              ["bulkOrderAvailable", "Wholesale", "Sellers buy stock in bulk", product?.bulkOrderAvailable ?? true],
              ["sampleAvailable", "Samples", "Sellers can order one to try", product?.sampleAvailable ?? false],
            ].map(([name, label, hint, checked]) => (
              <label key={String(name)} className="flex min-h-[56px] cursor-pointer items-start gap-3 rounded-[16px] border border-app-line px-4 py-3 has-[:checked]:border-app-ink">
                <input type="checkbox" name={String(name)} value="true" defaultChecked={Boolean(checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#16141F]" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold">{label}</span>
                  <span className="block text-[12.5px] text-app-ink-soft">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </Section>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="submit" name="intent" value="draft" className={buttonClass.white}>
            Save draft
          </button>
          <button type="submit" name="intent" value="submit" className={buttonClass.accent} disabled={categories.length === 0}>
            {isEdit ? "Save and send to review" : "Create and send to review"} <Icon name="arrow" size={15} />
          </button>
        </div>
      </form>

      <aside className="grid min-w-0 content-start gap-5">
        <section className="rounded-[22px] bg-app-peach p-5">
          <div className="mb-3 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/app/rex.png" alt="Rex" className="h-10 w-10 object-contain" />
            <h2 className="m-0 text-[17px] font-extrabold">Seller margin</h2>
          </div>
          <dl className="m-0 grid gap-2 rounded-[16px] bg-white p-4 text-[14px]">
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Wholesale</dt><dd className="m-0 font-bold">{wholesalePrice ? money(wholesalePrice, currency) : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">Suggested retail</dt><dd className="m-0 font-bold">{suggestedRetailPrice ? money(suggestedRetailPrice, currency) : "—"}</dd></div>
            <div className="flex justify-between gap-3 border-t border-app-line pt-2"><dt className="text-app-ink-soft">Seller keeps</dt><dd className="m-0 font-extrabold">{margin > 0 ? `${margin}%` : "Add prices"}</dd></div>
          </dl>
          {!isEdit && <p className="mb-0 mt-3 text-[13px] leading-[1.5]">Margin shows here after the first save.</p>}
        </section>
        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-extrabold">Ready for review?</h2>
          <ul className="m-0 mt-3 grid list-none gap-2.5 p-0">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2.5 text-[14px]">
                {item.done ? <Icon name="checkCircle" size={16} className="shrink-0 text-app-success" /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-app-toggle-off" />}
                <span className={item.done ? "text-app-ink-soft" : "font-semibold"}>{item.label}</span>
                <span className="sr-only">{item.done ? "(done)" : "(to do)"}</span>
              </li>
            ))}
          </ul>
          <p className="mb-0 mt-4 text-[13px] leading-[1.5] text-app-ink-soft">
            Changes to a live product go back through review, so sellers never see unreviewed updates.
          </p>
        </Card>
      </aside>
    </div>
  );
}
