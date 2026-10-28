import type { ReactNode } from "react";
import { Card, Pill } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { PRODUCT_STATUS, buttonClass, fieldClass, hintClass, labelClass, money, statusOf, textareaClass } from "./supplier-kit";
import { Mascot } from "@/components/brand/Mascot";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";
import { MediaListField } from "@/components/media/MediaListField";
import { getT } from "@/lib/i18n/server";
import { PREORDER_DEPOSIT_SUGGESTED, PREORDER_NOTE_MAX, preorderDay } from "@shared/preorder";
import { HANDLING_DAYS, SIZE_CLASS_LABELS, canTakePreorders, dropshipUnitPrice, cleanDropshipMinQty, cleanHandlingDays, readPriceBreaks, type LevelGoal } from "@shared/dropship-rules";
import { SIZE_BANDS } from "@shared/delivery-market";
import { ChannelPricesFields } from "./ChannelPricesFields";

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
  /** Preorders (shared/preorder.ts). */
  preorderEnabled?: boolean;
  preorderShipsAt?: Date | string | null;
  preorderLimit?: number | null;
  preorderTaken?: number;
  preorderNote?: string | null;
  preorderDepositPct?: number | null;
  /** Prices per channel and dropship options (shared/dropship-rules.ts). */
  priceMode?: string | null;
  dropshipPrice?: number | null;
  preorderPrice?: number | null;
  minRetailPrice?: number | null;
  dropshipMinQty?: number | null;
  handlingDays?: number | null;
  sizeBand?: string | null;
}

/** The supplier's level (src/lib/supplier-levels.server.ts supplierLevelView): pre-orders open at Established. */
export interface SupplierFormLevel {
  level: string;
  next: string | null;
  goals: LevelGoal[];
}

interface SupplierProductFormProps {
  mode: "create" | "edit";
  action: (formData: FormData) => void | Promise<void>;
  categories: CategoryOption[];
  product?: SupplierProductFormValue | null;
  error?: string;
  saved?: boolean;
  level?: SupplierFormLevel | null;
}

/** The pre-order card for suppliers who aren't Established yet: a goal, not a wall. */
function PreorderLocked({ level }: { level: SupplierFormLevel | null | undefined }) {
  const meters = (level?.goals ?? []).filter((goal) => goal.kind === "count" && (goal.key === "delivered" || goal.key === "reviews"));
  return (
    <div className="grid gap-4 rounded-[16px] border border-dashed border-app-line-strong p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="lock" size={16} />
        <span className="text-[14.5px] font-extrabold">Pre-orders unlock when you&apos;re Established</span>
        <Pill tone="muted">Your level: {level?.level === "trusted" ? "Trusted" : "New"}</Pill>
      </div>
      <p className="m-0 text-[13.5px] leading-[1.55] text-app-ink-soft">Shops pay before the goods exist, so pre-orders open after 100 delivered orders and 30 reviews. Keep delivering well.</p>
      {meters.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {meters.map((goal) => (
            <div key={goal.key}>
              <div className="flex justify-between text-[13px]"><span className="font-bold">{goal.key === "delivered" ? "Delivered orders" : "Reviews"}</span><span className="text-app-ink-soft">{goal.have} of {goal.need}</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-app-canvas" role="progressbar" aria-valuemin={0} aria-valuemax={goal.need} aria-valuenow={Math.min(goal.have, goal.need)} aria-label={goal.label}>
                <div className="h-full rounded-full bg-app-ink" style={{ width: `${Math.min(100, Math.round((goal.have / Math.max(1, goal.need)) * 100))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="m-0 text-[13px] text-app-ink-soft">
        {meters.map((goal) => `${goal.have} of ${goal.need} ${goal.key === "delivered" ? "delivered orders" : "reviews"}`).join(" · ")}
        {meters.length > 0 && " · "}
        <a href="/supplier/level" className="font-bold text-app-ink underline underline-offset-4">See your level</a>
      </p>
    </div>
  );
}

function Choice({ name, value, checked, title, sub }: { name: string; value: string; checked: boolean; title: string; sub?: string }) {
  return (
    <label className="flex min-h-[52px] cursor-pointer items-start gap-3 rounded-[16px] border border-app-line px-4 py-3 has-[:checked]:border-app-ink">
      <input type="radio" name={name} value={value} defaultChecked={checked} className="mt-0.5 h-5 w-5 shrink-0 accent-[#16141F]" />
      <span className="min-w-0">
        <span className="block text-[14px] font-bold">{title}</span>
        {sub && <span className="block text-[12.5px] text-app-ink-soft">{sub}</span>}
      </span>
    </label>
  );
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

export async function SupplierProductForm({ mode, action, categories, product, error, saved, level }: SupplierProductFormProps) {
  const t = await getT("supplier", "common");
  const isEdit = mode === "edit";
  const currency = product?.currency ?? "NGN";
  // What a seller pays per piece to dropship it (its own dropship price when priced per channel).
  const wholesalePrice = product?.wholesalePrice ? dropshipUnitPrice({ priceMode: product.priceMode, wholesalePrice: product.wholesalePrice, dropshipPrice: product.dropshipPrice }) : 0;
  const suggestedRetailPrice = product?.suggestedRetailPrice ?? 0;
  const margin = suggestedRetailPrice > 0 && wholesalePrice > 0
    ? Math.round(((suggestedRetailPrice - wholesalePrice) / suggestedRetailPrice) * 100)
    : 0;
  const status = product?.status ? statusOf(PRODUCT_STATUS, product.status, t) : null;
  // Pre-orders open at Established; a listing that already takes them stays editable (and can be switched off).
  const preorderOpen = canTakePreorders(level?.level) || Boolean(product?.preorderEnabled);
  const tiers = readPriceBreaks(product?.pricingTiers);
  const minQty = cleanDropshipMinQty(product?.dropshipMinQty);
  const handlingDays = cleanHandlingDays(product?.handlingDays);
  const checklist = [
    { label: t("productForm.check.name"), done: Boolean(product?.name?.trim()) },
    { label: t("productForm.check.description"), done: (product?.description?.trim().length ?? 0) >= 40 },
    { label: t("productForm.check.image"), done: (product?.images?.length ?? 0) > 0 },
    { label: t("productForm.check.moq"), done: Boolean(product?.moq) && (product?.stockQuantity ?? 0) > 0 },
    { label: t("productForm.check.regions"), done: (product?.deliveryRegions?.length ?? 0) > 0 },
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <form action={action} className="grid min-w-0 content-start gap-5">
        {product?.id && <input type="hidden" name="productId" value={product.id} />}

        {(error || saved) && (
          <div role={error ? "alert" : "status"} className={`rounded-[16px] px-4 py-3 text-[14px] font-medium ${error ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
            {error ?? t("productForm.saved")}
          </div>
        )}

        <Section title={t("productForm.whatTitle")} sub={t("productForm.whatSub")} aside={status ? <Pill tone={status.tone}>{status.label}</Pill> : undefined}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <Field id="product-name" label={t("productForm.name")}>
              <input id="product-name" className={fieldClass} name="name" defaultValue={product?.name ?? ""} placeholder={t("productForm.namePlaceholder")} required />
            </Field>
            <Field id="product-category" label={t("productForm.category")}>
              <select id="product-category" className={fieldClass} name="categoryId" defaultValue={product?.categoryId ?? categories[0]?.id ?? ""} required>
                <option value="" disabled>{t("productForm.chooseCategory")}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field id="product-description" label={t("productForm.description")} className="mt-4">
            <textarea
              id="product-description"
              className={textareaClass}
              name="description"
              rows={6}
              defaultValue={product?.description ?? ""}
              placeholder={t("productForm.descriptionPlaceholder")}
              required
            />
            <VoiceInputButton targetId="product-description" context="a product description" className="mt-2" />
          </Field>
        </Section>

        <Section title={t("productForm.termsTitle")} sub={t("productForm.termsSub")}>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <Field id="product-price-to" label={t("productForm.priceUpTo")} hint={t("productForm.priceUpToHint")}>
              <input id="product-price-to" className={fieldClass} name="wholesalePriceTo" type="number" min="0" step="1" defaultValue={product?.wholesalePriceTo ?? ""} />
            </Field>
            <Field id="product-currency" label={t("productForm.currency")}>
              <input id="product-currency" className={fieldClass} name="currency" defaultValue={currency} maxLength={3} required />
            </Field>
            <Field id="product-moq" label={t("productForm.moq")}>
              <input id="product-moq" className={fieldClass} name="moq" type="number" min="1" step="1" defaultValue={product?.moq ?? 1} required />
            </Field>
            <Field id="product-stock" label={t("productForm.stock")}>
              <input id="product-stock" className={fieldClass} name="stockQuantity" type="number" min="0" step="1" defaultValue={product?.stockQuantity ?? 0} required />
            </Field>
            <Field id="product-processing" label={t("productForm.processing")} className="sm:col-span-2">
              <input id="product-processing" className={fieldClass} name="processingTime" defaultValue={product?.processingTime ?? ""} placeholder={t("productForm.processingPlaceholder")} />
            </Field>
          </div>
        </Section>

        <Section title="Prices" sub="One price for everyone, or a price per channel. Sellers see your price, theirs and what they keep.">
          <ChannelPricesFields
            preorderPriceOpen={preorderOpen}
            initial={{
              // Older listings with quantity breaks already price per channel.
              priceMode: product?.priceMode === "per_channel" || tiers.length > 0 ? "per_channel" : "same",
              wholesalePrice: product?.wholesalePrice ?? null,
              dropshipPrice: product?.dropshipPrice ?? null,
              preorderPrice: product?.preorderPrice ?? null,
              suggestedRetailPrice: product?.suggestedRetailPrice ?? null,
              minRetailPrice: product?.minRetailPrice ?? null,
              tiers,
            }}
          />
        </Section>

        <Section title="Dropship settings" sub="Sellers see these before they add your product, so nobody is surprised after a customer has paid.">
          <div className="grid gap-5">
            <fieldset className="m-0 grid gap-2 border-0 p-0">
              <legend className="mb-2 text-[14px] font-bold">Do you ship single pieces?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <Choice name="dropshipSingles" value="yes" checked={minQty === 1} title="Yes, 1 piece is fine" />
                <Choice name="dropshipSingles" value="min" checked={minQty > 1} title="No, set a minimum" sub="Customers can't check out with fewer" />
              </div>
              <div className="max-w-[260px]">
                <label htmlFor="product-dropship-min" className={labelClass}>Minimum per order (pieces)</label>
                <input id="product-dropship-min" className={fieldClass} name="dropshipMinQty" type="number" min="1" max="1000" step="1" inputMode="numeric" defaultValue={minQty > 1 ? minQty : 2} />
                <div className={hintClass}>Used when you choose a minimum.</div>
              </div>
            </fieldset>
            <fieldset className="m-0 grid gap-2 border-0 p-0">
              <legend className="mb-1 text-[14px] font-bold">How fast do you pack an order?</legend>
              <p className="m-0 mb-1 text-[12.5px] text-app-ink-soft">Customers see this in the delivery date.</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {HANDLING_DAYS.map((days) => (
                  <Choice key={days} name="handlingDays" value={String(days)} checked={handlingDays === days} title={days === 1 ? "Within 1 day" : `Within ${days} days`} />
                ))}
              </div>
            </fieldset>
            <fieldset className="m-0 grid gap-2 border-0 p-0">
              <legend className="mb-1 text-[14px] font-bold">How big is the parcel?</legend>
              <p className="m-0 mb-1 text-[12.5px] text-app-ink-soft">Sets the delivery price from your rate card.</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {SIZE_BANDS.map((band) => (
                  <Choice key={band} name="sizeBand" value={band} checked={product?.sizeBand === band} title={SIZE_CLASS_LABELS[band]} />
                ))}
              </div>
            </fieldset>
            <label className="flex min-h-[56px] cursor-pointer items-start gap-3 rounded-[16px] border border-app-line px-4 py-3 has-[:checked]:border-app-ink">
              <input type="checkbox" name="sampleAvailable" value="true" defaultChecked={Boolean(product?.sampleAvailable)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#16141F]" />
              <span className="min-w-0">
                <span className="block text-[14px] font-bold">Sellers can order 1 sample</span>
                <span className="block text-[12.5px] text-app-ink-soft">At your dropship price, to check quality</span>
              </span>
            </label>
          </div>
        </Section>

        <Section title={t("productForm.preorderTitle")} sub={t("productForm.preorderSub")} aside={preorderOpen ? undefined : <Pill tone="muted">Established</Pill>}>
          {!preorderOpen ? <PreorderLocked level={level} /> : <>
          <label className="flex min-h-[56px] cursor-pointer items-start gap-3 rounded-[16px] border border-app-line px-4 py-3 has-[:checked]:border-app-ink">
            <input type="checkbox" name="preorderEnabled" value="true" defaultChecked={Boolean(product?.preorderEnabled)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#16141F]" />
            <span className="min-w-0">
              <span className="block text-[14px] font-bold">{t("productForm.preorderOn")}</span>
              <span className="block text-[12.5px] text-app-ink-soft">{t("productForm.preorderOnHint")}</span>
            </span>
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="product-preorder-ships" label={t("productForm.preorderShips")} hint={t("productForm.preorderShipsHint")}>
              <input id="product-preorder-ships" className={fieldClass} name="preorderShipsAt" type="date" defaultValue={preorderDay(product?.preorderShipsAt) ?? ""} />
            </Field>
            <Field id="product-preorder-limit" label={t("productForm.preorderLimit")} hint={t("productForm.preorderLimitHint", { count: String(product?.preorderEnabled ? product.preorderTaken ?? 0 : 0) })}>
              <input id="product-preorder-limit" className={fieldClass} name="preorderLimit" type="number" min="1" step="1" defaultValue={product?.preorderLimit ?? ""} />
            </Field>
            <Field id="product-preorder-deposit" label={t("productForm.preorderDeposit")} hint={t("productForm.preorderDepositHint", { pct: String(PREORDER_DEPOSIT_SUGGESTED) })}>
              <input id="product-preorder-deposit" className={fieldClass} name="preorderDepositPct" type="number" min="0" max="100" step="1" inputMode="numeric" defaultValue={product?.preorderDepositPct ?? 0} />
            </Field>
            <Field id="product-preorder-note" label={t("productForm.preorderNote")} className="sm:col-span-2">
              <textarea id="product-preorder-note" className={textareaClass} name="preorderNote" rows={2} maxLength={PREORDER_NOTE_MAX} defaultValue={product?.preorderNote ?? ""} placeholder={t("productForm.preorderNotePlaceholder")} />
            </Field>
          </div>
          <p className="mb-0 mt-4 rounded-[16px] bg-app-canvas px-4 py-3 text-[13px] leading-[1.55] text-app-ink-soft">{t("productForm.preorderMoney")}</p>
          </>}
        </Section>

        <Section title={t("productForm.photosTitle")} sub={t("productForm.photosSub")}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field id="product-images" label={t("productForm.images")} hint={t("productForm.imagesHint")}>
              {/* Upload, choose from the supplier's media library, or paste links; posts "images" one per line. */}
              <MediaListField id="product-images" name="images" defaultValue={product?.images ?? []} max={12} />
            </Field>
            <Field id="product-regions" label={t("productForm.regions")} hint={t("productForm.regionsHint")}>
              <textarea id="product-regions" className={textareaClass} name="deliveryRegions" rows={5} defaultValue={(product?.deliveryRegions ?? ["Lagos", "Abuja"]).join("\n")} placeholder={"Lagos\nAbuja\nPort Harcourt"} required />
            </Field>
          </div>
          <fieldset className="m-0 mt-4 grid gap-2 border-0 p-0 sm:grid-cols-2">
            <legend className="mb-2 text-[14px] font-bold">{t("productForm.howBuy")}</legend>
            {[
              ["dropshipAvailable", t("productForm.dropship"), t("productForm.dropshipHint"), product?.dropshipAvailable ?? false],
              ["bulkOrderAvailable", t("productForm.wholesale"), t("productForm.wholesaleHint"), product?.bulkOrderAvailable ?? true],
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
            {t("productForm.saveDraft")}
          </button>
          <button type="submit" name="intent" value="submit" className={buttonClass.accent} disabled={categories.length === 0}>
            {isEdit ? t("productForm.saveReview") : t("productForm.createReview")} <Icon name="arrow" size={15} />
          </button>
        </div>
      </form>

      <aside className="grid min-w-0 content-start gap-5">
        <section className="rounded-[22px] bg-app-peach p-5">
          <div className="mb-3 flex items-center gap-3">
            <Mascot who="rex" size={40} />
            <h2 className="m-0 text-[17px] font-extrabold">{t("productForm.margin")}</h2>
          </div>
          <dl className="m-0 grid gap-2 rounded-[16px] bg-white p-4 text-[14px]">
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">{t("productForm.wholesale")}</dt><dd className="m-0 font-bold">{wholesalePrice ? money(wholesalePrice, currency) : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-app-ink-soft">{t("productForm.suggestedRetail")}</dt><dd className="m-0 font-bold">{suggestedRetailPrice ? money(suggestedRetailPrice, currency) : "—"}</dd></div>
            <div className="flex justify-between gap-3 border-t border-app-line pt-2"><dt className="text-app-ink-soft">{t("productForm.sellerKeeps")}</dt><dd className="m-0 font-extrabold">{margin > 0 ? `${margin}%` : t("productForm.addPrices")}</dd></div>
          </dl>
          {!isEdit && <p className="mb-0 mt-3 text-[13px] leading-[1.5]">{t("productForm.marginAfterSave")}</p>}
        </section>
        <Card className="p-5">
          <h2 className="m-0 text-[17px] font-extrabold">{t("productForm.readyTitle")}</h2>
          <ul className="m-0 mt-3 grid list-none gap-2.5 p-0">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2.5 text-[14px]">
                {item.done ? <Icon name="checkCircle" size={16} className="shrink-0 text-app-success" /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-app-toggle-off" />}
                <span className={item.done ? "text-app-ink-soft" : "font-semibold"}>{item.label}</span>
                <span className="sr-only">{item.done ? t("productForm.done") : t("productForm.todo")}</span>
              </li>
            ))}
          </ul>
          <p className="mb-0 mt-4 text-[13px] leading-[1.5] text-app-ink-soft">
            {t("productForm.reviewNote")}
          </p>
        </Card>
      </aside>
    </div>
  );
}
