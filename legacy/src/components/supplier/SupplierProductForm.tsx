import { Icon } from "@/components/ui/Icon";
import { formatMoney } from "@/components/role/RolePage";

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

function statusBadge(status?: string) {
  switch (status) {
    case "published":
      return "badge-success";
    case "pending_review":
      return "badge-warn";
    case "rejected":
      return "badge-danger";
    default:
      return "badge-soft";
  }
}

export function SupplierProductForm({ mode, action, categories, product, error, saved }: SupplierProductFormProps) {
  const isEdit = mode === "edit";
  const currency = product?.currency ?? "NGN";
  const wholesalePrice = product?.wholesalePrice ?? 0;
  const suggestedRetailPrice = product?.suggestedRetailPrice ?? 0;
  const margin = suggestedRetailPrice > 0 && wholesalePrice > 0
    ? Math.round(((suggestedRetailPrice - wholesalePrice) / suggestedRetailPrice) * 100)
    : 0;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
      <form action={action} className="space-y-5">
        {product?.id && <input type="hidden" name="productId" value={product.id} />}

        {(error || saved) && (
          <div className={`card ${error ? "bg-[var(--danger-bg)]" : "bg-[var(--success-bg)]"}`} style={{ borderColor: error ? "var(--danger-bg)" : "var(--success-bg)" }}>
            <div className={`text-[13px] font-semibold ${error ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
              {error ?? "Saved. Rex kept the product workflow tidy."}
            </div>
          </div>
        )}

        <section className="card">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <div className="onb-card-kicker">Product basics</div>
              <h2 className="m-0 mt-1 font-display text-[26px] font-normal text-[var(--ink-900)]">What are sellers buying?</h2>
            </div>
            {product?.status && <span className={`badge ${statusBadge(product.status)}`}>{product.status.replace("_", " ")}</span>}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <label className="field">
              <span className="label">Product name</span>
              <input className="inp" name="name" defaultValue={product?.name ?? ""} placeholder="Handmade leather sandal" required />
            </label>
            <label className="field">
              <span className="label">Category</span>
              <select className="inp" name="categoryId" defaultValue={product?.categoryId ?? categories[0]?.id ?? ""} required>
                <option value="" disabled>Choose category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field mt-4">
            <span className="label">Description</span>
            <textarea
              className="ta"
              name="description"
              rows={6}
              defaultValue={product?.description ?? ""}
              placeholder="Material, sizing, packaging, production capacity, and what makes it easy for sellers to resell."
              required
            />
          </label>
        </section>

        <section className="card">
          <div className="mb-4">
            <div className="onb-card-kicker">Pricing and stock</div>
            <h2 className="m-0 mt-1 font-display text-[26px] font-normal text-[var(--ink-900)]">Set the trade terms.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="field">
              <span className="label">Wholesale price</span>
              <input className="inp" name="wholesalePrice" type="number" min="1" step="1" defaultValue={product?.wholesalePrice ?? ""} required />
            </label>
            <label className="field">
              <span className="label">Price up to</span>
              <input className="inp" name="wholesalePriceTo" type="number" min="0" step="1" defaultValue={product?.wholesalePriceTo ?? ""} />
            </label>
            <label className="field">
              <span className="label">Suggested retail</span>
              <input className="inp" name="suggestedRetailPrice" type="number" min="1" step="1" defaultValue={product?.suggestedRetailPrice ?? ""} required />
            </label>
            <label className="field">
              <span className="label">Currency</span>
              <input className="inp" name="currency" defaultValue={currency} maxLength={3} required />
            </label>
            <label className="field">
              <span className="label">MOQ</span>
              <input className="inp" name="moq" type="number" min="1" step="1" defaultValue={product?.moq ?? 1} required />
            </label>
            <label className="field">
              <span className="label">Stock available</span>
              <input className="inp" name="stockQuantity" type="number" min="0" step="1" defaultValue={product?.stockQuantity ?? 0} required />
            </label>
            <label className="field sm:col-span-2">
              <span className="label">Processing time</span>
              <input className="inp" name="processingTime" defaultValue={product?.processingTime ?? ""} placeholder="2-4 business days" />
            </label>
          </div>
          <label className="field mt-4">
            <span className="label">Tier pricing</span>
            <textarea className="ta font-mono text-[13px]" name="pricingTiers" rows={3} defaultValue={pricingTierText(product)} placeholder="10-49: 8500&#10;50-99: 7800&#10;100: 7200" />
          </label>
        </section>

        <section className="card">
          <div className="mb-4">
            <div className="onb-card-kicker">Media and fulfilment</div>
            <h2 className="m-0 mt-1 font-display text-[26px] font-normal text-[var(--ink-900)]">Make it marketplace ready.</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="field">
              <span className="label">Image URLs</span>
              <textarea className="ta font-mono text-[13px]" name="images" rows={5} defaultValue={(product?.images ?? []).join("\n")} placeholder="https://..." required />
            </label>
            <label className="field">
              <span className="label">Delivery regions</span>
              <textarea className="ta" name="deliveryRegions" rows={5} defaultValue={(product?.deliveryRegions ?? ["Lagos", "Abuja"]).join("\n")} placeholder="Lagos&#10;Abuja&#10;Port Harcourt" required />
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              ["dropshipAvailable", "Dropship ready", product?.dropshipAvailable ?? false],
              ["bulkOrderAvailable", "Bulk orders", product?.bulkOrderAvailable ?? true],
              ["sampleAvailable", "Samples", product?.sampleAvailable ?? false],
            ].map(([name, label, checked]) => (
              <label key={String(name)} className="flex items-center gap-3 rounded-[12px] border border-[var(--ink-100)] bg-[var(--ink-50)] px-3 py-3 text-[13px] font-semibold text-[var(--ink-800)]">
                <input type="checkbox" name={String(name)} value="true" defaultChecked={Boolean(checked)} />
                {label}
              </label>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="submit" name="intent" value="draft" className="btn btn-ghost btn-lg">
            Save draft
          </button>
          <button type="submit" name="intent" value="submit" className="btn btn-mint btn-lg" disabled={categories.length === 0}>
            {isEdit ? "Save and send to review" : "Create and send to review"} <Icon name="arrow" size={15} />
          </button>
        </div>
      </form>

      <aside className="space-y-4">
        <div className="card bg-[linear-gradient(160deg,var(--amber-100),var(--paper))]">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-white text-[var(--amber-500)]">
              <Icon name="bolt" size={17} />
            </div>
            <div className="text-[13px] font-semibold text-[var(--ink-900)]">Rex review</div>
          </div>
          <div className="grid gap-2 text-[12.5px] leading-5 text-[var(--ink-700)]">
            <div className="flex justify-between gap-3"><span>Margin estimate</span><strong>{margin > 0 ? `${margin}%` : "Add prices"}</strong></div>
            <div className="flex justify-between gap-3"><span>Wholesale</span><strong>{wholesalePrice ? formatMoney(wholesalePrice, currency) : "-"}</strong></div>
            <div className="flex justify-between gap-3"><span>Retail guide</span><strong>{suggestedRetailPrice ? formatMoney(suggestedRetailPrice, currency) : "-"}</strong></div>
          </div>
        </div>
        <div className="card">
          <div className="onb-card-kicker mb-3">Review checklist</div>
          <div className="space-y-3">
            {["Clear product name", "Supplier-ready description", "At least one image URL", "MOQ and stock set", "Delivery regions listed"].map((item) => (
              <div key={item} className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--ink-700)]">
                <Icon name="check" size={14} color="var(--teal-700)" />
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="card text-[12.5px] leading-6 text-[var(--ink-600)]">
          Published product edits return to review when public selling fields change, so sellers never see unreviewed updates.
        </div>
      </aside>
    </div>
  );
}
