"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Segmented } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Field, buttonClass, checkClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { EMAIL_THEMES, EMAIL_THEME_INFO, GAME_LABELS, SOCIAL_LABELS, SOCIAL_NETWORKS, type Align, type ColumnCell, type EmailBlock, type EmailBlockType, type ProductItem } from "@/lib/marketing/blocks";
import { api, errorText, insertAtCursor } from "./client";
import { MediaPicker } from "@/components/media/MediaPicker";
import { useT } from "@/components/i18n/I18nProvider";
import type { TFunction } from "@shared/i18n";
import type { MessageKey } from "@shared/i18n/catalog";

type BuilderT = TFunction<MessageKey<"emailBuilder">>;

// Settings for one email block (text, links, colours, alignment, spacing), shared by the template builder's
// right-hand panel and the compact composer that campaigns and automations use.

export const BLOCK_ICONS: Record<EmailBlockType, IconName> = {
  heading: "edit",
  text: "list",
  button: "link",
  image: "image",
  divider: "minus",
  spacer: "layers",
  columns: "grid",
  products: "bag",
  coupon: "percent",
  social: "users",
  footer: "document",
  theme: "palette",
  hero: "flag",
  banner: "megaphone",
  countdown: "clock",
  receipt: "file",
  steps: "truck",
  review: "star",
  features: "checkCircle",
  vip: "card",
  meter: "chart",
  game: "sparkle",
};

export function blankBlock(type: EmailBlockType): EmailBlock {
  switch (type) {
    case "heading":
      return { type, text: "A short headline" };
    case "text":
      return { type, text: "" };
    case "button":
      return { type, label: "Shop now", url: "{{store_url}}" };
    case "image":
      return { type, url: "", alt: "" };
    case "divider":
      return { type };
    case "spacer":
      return { type, height: 24 };
    case "columns":
      return { type, cells: [{ heading: "Left", text: "A few words" }, { heading: "Right", text: "A few words" }] };
    case "products":
      return { type, items: [], buttonLabel: "Shop now" };
    case "coupon":
      return { type, code: "SAVE10", title: "Your discount code", note: "Use it at checkout." };
    case "social":
      return { type, links: [{ network: "instagram", url: "https://instagram.com/" }, { network: "whatsapp", url: "https://wa.me/" }] };
    case "footer":
      return { type, text: "Thanks for shopping with {{store}}. Reply any time, a real person reads it." };
    case "theme":
      return { type, theme: "editorial" };
    case "hero":
      return { type, layout: "type", imageUrl: "", alt: "", eyebrow: "New in", heading: "A big, bold headline", text: "One or two lines that make people want to read on.", buttonLabel: "Shop now", buttonUrl: "{{store_url}}" };
    case "banner":
      return { type, text: "Free delivery this weekend", variant: "accent" };
    case "countdown":
      return { type, variant: "boxes", title: "Ends in", units: [{ value: "23", label: "hours" }, { value: "59", label: "mins" }], note: "" };
    case "receipt":
      return { type, title: "Order summary", lines: [{ name: "Order {{order_number}}", amount: "" }], totals: [{ label: "Total", amount: "{{order_total}}" }], note: "" };
    case "steps":
      return { type, steps: ["Confirmed", "Packed", "On the way", "Delivered"], current: 1, note: "" };
    case "review":
      return { type, quote: "Lovely quality and it came fast.", author: "A happy customer", rating: 5, detail: "Verified buyer" };
    case "features":
      return { type, items: [{ icon: "✓", title: "Pay on delivery" }, { icon: "✓", title: "Easy returns" }, { icon: "✓", title: "Fast delivery" }] };
    case "vip":
      return { type, tier: "Gold", title: "Your member perks", text: "", perks: ["Free delivery on every order", "Early access to new drops"], buttonLabel: "Shop now", buttonUrl: "{{store_url}}" };
    case "meter":
      return { type, title: "Your points", current: 450, goal: 1000, unit: "points", from: "Silver", to: "Gold", note: "" };
    case "game":
      return { type, game: "spin", title: "You have 1 free spin", text: "Every spin wins something.", prizes: ["5% off", "10% off", "Free delivery"], value: "", buttonLabel: "Spin now", buttonUrl: "{{store_url}}?play=spin" };
  }
}

/** One line describing a block, for the block list. */
export function blockSummary(block: EmailBlock, t: BuilderT) {
  switch (block.type) {
    case "heading":
    case "text":
    case "footer":
      return block.text.replace(/\s+/g, " ").trim() || t("bs.sum.empty");
    case "button":
      return block.label || t("block.button");
    case "image":
      return block.alt || (block.url ? t("bubble.picture") : t("bs.sum.noPicture"));
    case "columns":
      return block.cells.map((cell) => cell.heading || cell.text || "…").join(" | ");
    case "products":
      return block.items.length ? block.items.map((item) => item.name).join(", ") : t("bs.sum.pickProducts");
    case "coupon":
      return block.code || t("bs.sum.noCode");
    case "social":
      return block.links.map((link) => SOCIAL_LABELS[link.network]).join(", ") || t("bs.sum.noLinks");
    case "spacer":
      return `${block.height}px`;
    case "divider":
      return block.variant && block.variant !== "line" ? t("bs.sum.lineVariant", { variant: block.variant }) : t("block.divider");
    case "theme":
      return t.dynamic(`theme.${block.theme}`, EMAIL_THEME_INFO[block.theme].label);
    case "hero":
      return block.heading || t("block.hero");
    case "banner":
      return block.text || t("bs.sum.notice");
    case "countdown":
      return `${block.title} ${block.units.map((u) => `${u.value} ${u.label}`).join(" ")}`.trim();
    case "receipt":
      return t("bs.sum.receipt", { lines: block.lines.length, totals: block.totals.length });
    case "steps":
      return block.steps.join(" → ") || t("bs.sum.noSteps");
    case "review":
      return `${"★".repeat(block.rating)} ${block.author}`;
    case "features":
      return block.items.map((item) => item.title).join(" · ") || t("bs.sum.noHighlights");
    case "vip":
      return `${block.tier} · ${block.title}`;
    case "meter":
      return `${block.current} / ${block.goal} ${block.unit}`;
    case "game":
      return `${t.dynamic(`game.${block.game}`, GAME_LABELS[block.game])}: ${block.title}`;
  }
}

const LINKS = [
  ["{{store_url}}", "bs.link.shop"],
  ["{{cart_url}}", "bs.link.cart"],
] as const;

function ImageField({ url, onChange, label: givenLabel }: { url: string; onChange: (url: string) => void; label?: string }) {
  const t = useT("emailBuilder");
  const label = givenLabel ?? t("bubble.picture");
  // Upload, choose from the seller's media library, or paste a link (src/components/media).
  return (
    <div className="grid gap-2">
      <span className="text-[13.5px] font-bold">{label}</span>
      <MediaPicker value={url} onChange={onChange} shape="square" compact />
    </div>
  );
}

function LinkField({ label, url, onChange }: { label: string; url: string; onChange: (url: string) => void }) {
  const t = useT("emailBuilder");
  const preset = LINKS.some(([value]) => value === url);
  return (
    <Field label={label}>
      <div className="grid gap-2">
        <select aria-label={label} value={preset ? url : "custom"} onChange={(e) => onChange(e.target.value === "custom" ? "https://" : e.target.value)} className={selectClass}>
          {LINKS.map(([value, text]) => <option key={value} value={value}>{t(text)}</option>)}
          <option value="custom">{t("bs.anotherLink")}</option>
        </select>
        {!preset ? <input aria-label={t("bs.labelAddress", { label })} value={url} onChange={(e) => onChange(e.target.value)} className={inputClass} placeholder="https://" inputMode="url" /> : null}
      </div>
    </Field>
  );
}

function ColorField({ label, value, onChange, fallback }: { label: string; value?: string; onChange: (value: string | undefined) => void; fallback: string }) {
  const t = useT("emailBuilder");
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-2">
      <span className="text-[13.5px] font-bold">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" aria-label={label} value={value || fallback} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded-[10px] border border-app-line bg-white p-1" />
        {value ? (
          <button type="button" onClick={() => onChange(undefined)} className="min-h-[36px] rounded-full px-3 text-[12.5px] font-bold text-app-ink-soft hover:bg-app-canvas">{t("bs.reset")}</button>
        ) : (
          <span className="w-[52px] text-[12px] text-app-ink-soft">{t("bs.brand")}</span>
        )}
      </span>
    </div>
  );
}

function AlignField({ value, onChange }: { value?: Align; onChange: (value: Align) => void }) {
  const t = useT("emailBuilder");
  return (
    <Field label={t("bs.alignment")}>
      <Segmented options={[{ value: "left", label: t("bs.left") }, { value: "center", label: t("bs.centre") }, { value: "right", label: t("bs.right") }]} value={value ?? "left"} onChange={onChange} className="border border-app-line" />
    </Field>
  );
}

/** A text box with Bold / Italic / Link buttons that wrap the selection in the builder's simple marks. */
function RichText({ value, onChange, rows = 5, label, onFocusField }: { value: string; onChange: (value: string) => void; rows?: number; label: string; onFocusField?: (el: HTMLTextAreaElement) => void }) {
  const t = useT("emailBuilder");
  const ref = useRef<HTMLTextAreaElement>(null);
  function wrap(before: string, after: string, placeholder: string) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const picked = value.slice(start, end) || placeholder;
    onChange(value.slice(0, start) + before + picked + after + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + picked.length);
    });
  }
  const tool = "grid h-9 min-w-9 place-items-center rounded-full px-2.5 text-[13px] hover:bg-app-canvas";
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1">
        <span className="mr-auto text-[13.5px] font-bold">{label}</span>
        <button type="button" className={`${tool} font-extrabold`} onClick={() => wrap("**", "**", t("bs.boldWords"))} aria-label={t("bs.bold")}>B</button>
        <button type="button" className={`${tool} italic`} onClick={() => wrap("*", "*", t("bs.italicWords"))} aria-label={t("bs.italic")}>I</button>
        <button type="button" className={tool} onClick={() => wrap("[", "](https://)", t("bs.linkText"))} aria-label={t("bs.addLink")}><Icon name="link" size={14} /></button>
      </div>
      <textarea ref={ref} aria-label={label} value={value} onFocus={(e) => onFocusField?.(e.currentTarget)} onChange={(e) => onChange(e.target.value)} rows={rows} className={textareaClass} placeholder={t("bs.writeHere")} />
    </div>
  );
}

let productCache: Promise<Array<ProductItem & { id: string }>> | null = null;
function loadProducts() {
  productCache ??= api<{ products: Array<ProductItem & { id: string }> }>("/api/app/marketing/products", "GET").then((data) => data.products).catch((error) => {
    productCache = null;
    throw error;
  });
  return productCache;
}

function ProductPicker({ items, onChange }: { items: ProductItem[]; onChange: (items: ProductItem[]) => void }) {
  const t = useT("emailBuilder");
  const [products, setProducts] = useState<Array<ProductItem & { id: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadProducts().then(setProducts).catch((loadError) => setError(errorText(loadError)));
  }, []);
  const chosen = new Set(items.map((item) => item.url));
  if (error) return <p className="m-0 text-[13px] text-app-danger">{error}</p>;
  if (!products) return <p className="m-0 text-[13px] text-app-ink-soft">{t("bs.loadingProducts")}</p>;
  if (!products.length) return <p className="m-0 text-[13px] text-app-ink-soft">{t("bs.publishFirst")}</p>;
  return (
    <div className="grid gap-1.5">
      <span className="text-[13.5px] font-bold">{t("bs.productsCount", { count: items.length })}</span>
      <ul className="m-0 grid max-h-[320px] list-none gap-1 overflow-y-auto p-0">
        {products.map((product) => {
          const on = chosen.has(product.url);
          return (
            <li key={product.id}>
              <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[12px] px-2 hover:bg-app-canvas">
                <input
                  type="checkbox"
                  className={checkClass}
                  checked={on}
                  disabled={!on && items.length >= 6}
                  onChange={() => onChange(on ? items.filter((item) => item.url !== product.url) : [...items, { name: product.name, price: product.price, imageUrl: product.imageUrl, url: product.url }])}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={product.imageUrl} alt="" className="h-10 w-10 shrink-0 rounded-[10px] object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{product.name}</span>
                  <span className="block text-[12.5px] text-app-ink-soft">{product.price}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CellEditor({ cell, onChange, title }: { cell: ColumnCell; onChange: (cell: ColumnCell) => void; title: string }) {
  const t = useT("emailBuilder");
  return (
    <fieldset className="grid gap-2.5 rounded-[14px] border border-app-line p-3">
      <legend className="px-1 text-[13px] font-extrabold">{title}</legend>
      <ImageField url={cell.imageUrl ?? ""} onChange={(imageUrl) => onChange({ ...cell, imageUrl })} label={t("bs.pictureOptional")} />
      <Field label={t("bs.heading")}><input value={cell.heading ?? ""} onChange={(e) => onChange({ ...cell, heading: e.target.value })} className={inputClass} /></Field>
      <RichText label={t("bs.text")} rows={3} value={cell.text ?? ""} onChange={(text) => onChange({ ...cell, text })} />
      <Field label={t("bs.buttonTextOptional")}><input value={cell.buttonLabel ?? ""} onChange={(e) => onChange({ ...cell, buttonLabel: e.target.value })} className={inputClass} placeholder={t("bs.noButton")} /></Field>
      {cell.buttonLabel ? <LinkField label={t("bs.buttonGoesTo")} url={cell.buttonUrl ?? "{{store_url}}"} onChange={(buttonUrl) => onChange({ ...cell, buttonUrl })} /> : null}
    </fieldset>
  );
}

/** A short list of rows (prizes, perks, receipt lines…): edit, add, remove. */
function RowsField<T>({ label, rows, max, blank, onChange, render }: { label: string; rows: T[]; max: number; blank: T; onChange: (rows: T[]) => void; render: (row: T, set: (row: T) => void, index: number) => ReactNode }) {
  const t = useT("emailBuilder", "common");
  return (
    <fieldset className="grid gap-2 rounded-[14px] border border-app-line p-3">
      <legend className="px-1 text-[13px] font-extrabold">{label}</legend>
      {rows.map((row, index) => (
        <div key={index} className="flex items-start gap-1.5">
          <div className="grid min-w-0 flex-1 gap-1.5">{render(row, (next) => onChange(rows.map((r, i) => (i === index ? next : r))), index)}</div>
          <button type="button" aria-label={t("bs.removeRow", { label: label.toLowerCase(), n: index + 1 })} onClick={() => onChange(rows.filter((_, i) => i !== index))} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-app-ink-soft hover:bg-app-canvas"><Icon name="x" size={14} /></button>
        </div>
      ))}
      {rows.length < max ? (
        <button type="button" onClick={() => onChange([...rows, structuredClone(blank)])} className={buttonClass("white", "sm")}><Icon name="plus" size={14} /> {t("add")}</button>
      ) : null}
    </fieldset>
  );
}

function VariantField<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <Field label={label}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className={selectClass}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  );
}

/**
 * The fields for one block. `onFocusText` lets the parent insert {{details}} where the seller is typing.
 */
export function BlockSettings({ block, onChange, onFocusText }: { block: EmailBlock; onChange: (block: EmailBlock) => void; onFocusText?: (el: HTMLTextAreaElement | HTMLInputElement, field: "text" | "label") => void }) {
  const t = useT("emailBuilder");
  const set = (patch: Partial<EmailBlock>) => onChange({ ...block, ...patch } as EmailBlock);
  const look = (options: { align?: boolean; color?: string | false; bg?: boolean; pad?: boolean }) => (
    <div className="grid gap-2 border-t border-app-line pt-3">
      {options.align ? <AlignField value={block.align} onChange={(align) => set({ align })} /> : null}
      {options.color ? <ColorField label={options.color} value={block.color} onChange={(color) => set({ color })} fallback={block.type === "button" ? "#FF6A2B" : "#16141F"} /> : null}
      {options.bg ? <ColorField label={t("bs.background")} value={block.bg} onChange={(bg) => set({ bg })} fallback="#FFFFFF" /> : null}
      {options.pad ? (
        <Field label={t("bs.spaceAround", { px: block.pad ?? 0 })}>
          <input type="range" min={0} max={48} step={4} value={block.pad ?? 0} onChange={(e) => set({ pad: Number(e.target.value) || undefined })} className="w-full accent-[#16141F]" />
        </Field>
      ) : null}
    </div>
  );

  switch (block.type) {
    case "heading":
      return (
        <div className="grid gap-3">
          <Field label={t("bs.heading")}><input value={block.text} onFocus={(e) => onFocusText?.(e.currentTarget, "text")} onChange={(e) => set({ text: e.target.value })} className={`${inputClass} font-bold`} /></Field>
          <Field label={t("bs.size")}>
            <Segmented options={[{ value: "lg", label: t("bs.big") }, { value: "md", label: t("bs.medium") }, { value: "sm", label: t("bs.small") }]} value={block.size ?? "lg"} onChange={(size) => set({ size })} className="border border-app-line" />
          </Field>
          {look({ align: true, color: t("bs.textColour"), bg: true, pad: true })}
        </div>
      );
    case "text":
      return (
        <div className="grid gap-3">
          <RichText label={t("bs.text")} rows={7} value={block.text} onChange={(text) => set({ text })} onFocusField={(el) => onFocusText?.(el, "text")} />
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.marksHelp")}</p>
          {look({ align: true, color: t("bs.textColour"), bg: true, pad: true })}
        </div>
      );
    case "button":
      return (
        <div className="grid gap-3">
          <Field label={t("bs.buttonText")}><input value={block.label} onFocus={(e) => onFocusText?.(e.currentTarget, "label")} onChange={(e) => set({ label: e.target.value })} className={inputClass} /></Field>
          <LinkField label={t("bs.goesTo")} url={block.url} onChange={(url) => set({ url })} />
          <VariantField label={t("bs.shape")} value={block.variant ?? "solid"} options={[{ value: "solid", label: t("bs.filled") }, { value: "outline", label: t("bs.outline") }, { value: "wide", label: t("bs.fullWidth") }]} onChange={(variant) => set({ variant: variant === "solid" ? undefined : variant })} />
          {look({ align: true, color: t("bs.buttonColour"), bg: false, pad: true })}
          <ColorField label={t("bs.buttonTextColour")} value={block.textColor} onChange={(textColor) => set({ textColor })} fallback="#FFFFFF" />
        </div>
      );
    case "image":
      return (
        <div className="grid gap-3">
          <ImageField url={block.url} onChange={(url) => set({ url })} />
          <Field label={t("bs.describePicture")} hint={t("bs.describePictureHint")}><input value={block.alt} onChange={(e) => set({ alt: e.target.value })} className={inputClass} /></Field>
          <Field label={t("bs.tapPicture")}><input value={block.link ?? ""} onChange={(e) => set({ link: e.target.value || undefined })} className={inputClass} placeholder="{{store_url}} or https://" /></Field>
          {look({ pad: true })}
        </div>
      );
    case "divider":
      return (
        <div className="grid gap-3">
          <VariantField label={t("bs.style")} value={block.variant ?? "line"} options={[{ value: "line", label: t("bs.thinLine") }, { value: "dashed", label: t("bs.dashed") }, { value: "dots", label: t("bs.threeDots") }, { value: "accent", label: t("bs.brandBar") }]} onChange={(variant) => set({ variant: variant === "line" ? undefined : variant })} />
          {look({ align: block.variant === "dots" || block.variant === "accent", color: t("bs.lineColour"), pad: true })}
        </div>
      );
    case "spacer":
      return (
        <Field label={t("bs.height", { px: block.height })}>
          <input type="range" min={4} max={120} step={4} value={block.height} onChange={(e) => set({ height: Number(e.target.value) })} className="w-full accent-[#16141F]" />
        </Field>
      );
    case "columns":
      return (
        <div className="grid gap-3">
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.columnsHelp")}</p>
          {block.cells.map((cell, index) => (
            <CellEditor key={index} title={index === 0 ? t("bs.leftColumn") : t("bs.rightColumn")} cell={cell} onChange={(next) => set({ cells: block.cells.map((c, i) => (i === index ? next : c)) })} />
          ))}
          {look({ bg: true, pad: true })}
        </div>
      );
    case "products":
      return (
        <div className="grid gap-3">
          <ProductPicker items={block.items} onChange={(items) => set({ items })} />
          <Field label={t("bs.layout")}>
            <Segmented options={[{ value: "1", label: t("bs.oneBig") }, { value: "2", label: t("bs.twoAcross") }, { value: "3", label: t("bs.threeAcross") }]} value={String(block.columns ?? 2)} onChange={(value) => set({ columns: value === "2" ? undefined : (Number(value) as 1 | 3) })} className="border border-app-line" />
          </Field>
          <Field label={t("bs.buttonText")}><input value={block.buttonLabel ?? ""} onChange={(e) => set({ buttonLabel: e.target.value })} className={inputClass} placeholder="Shop now" /></Field>
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.productsHelp")}</p>
          {look({ bg: true, pad: true })}
        </div>
      );
    case "coupon":
      return (
        <div className="grid gap-3">
          <Field label={t("bs.code")} hint={<>{t("bs.codeHintBefore")} <a href="/home/discounts" className="font-bold text-app-ink">{t("bs.codeHintLink")}</a> {t("bs.codeHintAfter")}</>}>
            <input value={block.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s+/g, "") })} className={`${inputClass} font-mono tracking-[0.1em]`} maxLength={40} />
          </Field>
          <Field label={t("bs.title")}><input value={block.title} onChange={(e) => set({ title: e.target.value })} className={inputClass} /></Field>
          <Field label={t("bs.bigValue")}><input value={block.value ?? ""} onChange={(e) => set({ value: e.target.value || undefined })} className={inputClass} placeholder={t("bs.bigValuePlaceholder")} maxLength={24} /></Field>
          <Field label={t("bs.smallPrint")}><input value={block.note} onChange={(e) => set({ note: e.target.value })} className={inputClass} /></Field>
          <VariantField label={t("bs.look")} value={block.variant ?? "dashed"} options={[{ value: "dashed", label: t("bs.dashedBox") }, { value: "ticket", label: t("bs.ticket") }, { value: "bold", label: t("bs.darkBold") }]} onChange={(variant) => set({ variant: variant === "dashed" ? undefined : variant })} />
          {look({ color: t("bs.textColour"), bg: true, pad: true })}
        </div>
      );
    case "social":
      return (
        <div className="grid gap-2.5">
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.socialHelp")}</p>
          {SOCIAL_NETWORKS.map((network) => {
            const link = block.links.find((l) => l.network === network);
            return (
              <Field key={network} label={network === "website" ? t("bs.website") : SOCIAL_LABELS[network]}>
                <input
                  value={link?.url ?? ""}
                  onChange={(e) => {
                    const url = e.target.value;
                    const others = block.links.filter((l) => l.network !== network);
                    set({ links: url ? SOCIAL_NETWORKS.flatMap((n) => (n === network ? [{ network, url }] : others.filter((l) => l.network === n))) : others });
                  }}
                  className={inputClass}
                  placeholder={network === "whatsapp" ? "https://wa.me/234…" : network === "website" ? "{{store_url}}" : "https://"}
                />
              </Field>
            );
          })}
          {look({ align: true })}
        </div>
      );
    case "footer":
      return (
        <div className="grid gap-3">
          <RichText label={t("bs.footerText")} rows={3} value={block.text} onChange={(text) => set({ text })} onFocusField={(el) => onFocusText?.(el, "text")} />
          {block.unsubscribe ? (
            <label className="flex min-h-[44px] items-center gap-2 text-[14px] font-semibold">
              <input type="checkbox" className={checkClass} checked onChange={() => set({ unsubscribe: undefined })} />
              {t("bs.unsubscribeOff")}
            </label>
          ) : null}
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.footerHelp")}</p>
          <VariantField label={t("bs.look")} value={block.variant ?? "simple"} options={[{ value: "simple", label: t("bs.smallPrint") }, { value: "panel", label: t("bs.panel") }]} onChange={(variant) => set({ variant: variant === "simple" ? undefined : variant })} />
          {look({ align: true, color: t("bs.textColour"), bg: block.variant === "panel" })}
        </div>
      );
    case "theme":
      return (
        <div className="grid gap-2">
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.themeHelp")}</p>
          <div className="grid gap-1.5" role="radiogroup" aria-label={t("bs.emailStyle")}>
            {EMAIL_THEMES.map((name) => {
              const info = EMAIL_THEME_INFO[name];
              const on = block.theme === name;
              return (
                <button key={name} type="button" role="radio" aria-checked={on} onClick={() => set({ theme: name })} className={`flex min-h-[52px] items-center gap-3 rounded-[12px] border px-3 text-left ${on ? "border-app-ink" : "border-app-line hover:border-app-line-strong"}`}>
                  <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-app-line text-[13px] font-bold" style={{ background: info.card, color: info.ink ?? "#16141F" }}>Aa</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-extrabold">{t.dynamic(`theme.${name}`, info.label)}</span>
                    <span className="block truncate text-[12px] text-app-ink-soft">{t.dynamic(`theme.${name}.sub`, info.sub)}</span>
                  </span>
                  {on ? <Icon name="check" size={16} /> : null}
                </button>
              );
            })}
          </div>
        </div>
      );
    case "hero":
      return (
        <div className="grid gap-3">
          <Field label={t("bs.layout")}>
            <Segmented options={[{ value: "full", label: t("bs.bigPhoto") }, { value: "split", label: t("bs.photoBeside") }, { value: "type", label: t("bs.wordsOnly") }]} value={block.layout} onChange={(layout) => set({ layout })} className="border border-app-line" />
          </Field>
          {block.layout === "full" ? <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.heroFullHelp")}</p> : null}
          {block.layout !== "type" ? <ImageField url={block.imageUrl} onChange={(imageUrl) => set({ imageUrl })} /> : null}
          {block.layout !== "type" ? <Field label={t("bs.describePicture")}><input value={block.alt} onChange={(e) => set({ alt: e.target.value })} className={inputClass} /></Field> : null}
          <Field label={t("bs.eyebrow")}><input value={block.eyebrow} onChange={(e) => set({ eyebrow: e.target.value })} className={inputClass} maxLength={60} placeholder="NEW IN" /></Field>
          <Field label={t("bs.headline")}><input value={block.heading} onFocus={(e) => onFocusText?.(e.currentTarget, "text")} onChange={(e) => set({ heading: e.target.value })} className={`${inputClass} font-bold`} /></Field>
          <RichText label={t("bs.text")} rows={3} value={block.text} onChange={(text) => set({ text })} onFocusField={(el) => onFocusText?.(el, "text")} />
          <Field label={t("bs.buttonTextOptional")}><input value={block.buttonLabel} onChange={(e) => set({ buttonLabel: e.target.value })} className={inputClass} placeholder={t("bs.noButton")} /></Field>
          {block.buttonLabel ? <LinkField label={t("bs.buttonGoesTo")} url={block.buttonUrl} onChange={(buttonUrl) => set({ buttonUrl })} /> : null}
          {look({ align: true, color: t("bs.textColour"), bg: true })}
        </div>
      );
    case "banner":
      return (
        <div className="grid gap-3">
          <Field label={t("bs.text")}><input value={block.text} onChange={(e) => set({ text: e.target.value })} className={inputClass} maxLength={200} /></Field>
          <VariantField label={t("bs.colour")} value={block.variant ?? "accent"} options={[{ value: "accent", label: t("bs.brandColour") }, { value: "dark", label: t("bs.dark") }, { value: "soft", label: t("bs.soft") }]} onChange={(variant) => set({ variant })} />
          {look({ align: true, color: t("bs.textColour"), bg: true })}
        </div>
      );
    case "countdown":
      return (
        <div className="grid gap-3">
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.countdownHelp")}</p>
          <VariantField label={t("bs.look")} value={block.variant ?? "boxes"} options={[{ value: "boxes", label: t("bs.numberBoxes") }, { value: "pill", label: t("bs.smallPill") }, { value: "bar", label: t("bs.darkBar") }]} onChange={(variant) => set({ variant })} />
          <Field label={t("bs.title")}><input value={block.title} onChange={(e) => set({ title: e.target.value })} className={inputClass} maxLength={80} /></Field>
          <RowsField label={t("bs.time")} rows={block.units} max={4} blank={{ value: "00", label: "mins" }} onChange={(units) => set({ units })} render={(unit, setUnit) => (
            <div className="grid grid-cols-2 gap-1.5">
              <input aria-label={t("bs.number")} value={unit.value} onChange={(e) => setUnit({ ...unit, value: e.target.value })} className={`${inputClass} font-mono`} maxLength={12} />
              <input aria-label={t("bs.unit")} value={unit.label} onChange={(e) => setUnit({ ...unit, label: e.target.value })} className={inputClass} maxLength={24} />
            </div>
          )} />
          <Field label={t("bs.noteUnder")}><input value={block.note} onChange={(e) => set({ note: e.target.value })} className={inputClass} placeholder={t("bs.endsSunday")} /></Field>
          {look({ align: block.variant === "pill", color: t("bs.numberColour"), bg: true })}
        </div>
      );
    case "receipt":
      return (
        <div className="grid gap-3">
          <Field label={t("bs.title")}><input value={block.title} onChange={(e) => set({ title: e.target.value })} className={inputClass} maxLength={80} /></Field>
          <RowsField label={t("bs.lines")} rows={block.lines} max={10} blank={{ name: t("bs.item"), amount: "₦0" }} onChange={(lines) => set({ lines })} render={(line, setLine) => (
            <>
              <input aria-label={t("bs.item")} value={line.name} onChange={(e) => setLine({ ...line, name: e.target.value })} className={inputClass} placeholder={t("bs.itemPlaceholder")} />
              <div className="grid grid-cols-2 gap-1.5">
                <input aria-label={t("bs.detail")} value={line.detail ?? ""} onChange={(e) => setLine({ ...line, detail: e.target.value || undefined })} className={inputClass} placeholder={t("bs.detailPlaceholder")} />
                <input aria-label={t("bs.amount")} value={line.amount} onChange={(e) => setLine({ ...line, amount: e.target.value })} className={`${inputClass} font-mono`} placeholder="₦0" />
              </div>
            </>
          )} />
          <RowsField label={t("bs.totals")} rows={block.totals} max={6} blank={{ label: "Delivery", amount: "₦0" }} onChange={(totals) => set({ totals })} render={(row, setRow) => (
            <div className="grid grid-cols-2 gap-1.5">
              <input aria-label={t("bs.label")} value={row.label} onChange={(e) => setRow({ ...row, label: e.target.value })} className={inputClass} />
              <input aria-label={t("bs.amount")} value={row.amount} onChange={(e) => setRow({ ...row, amount: e.target.value })} className={`${inputClass} font-mono`} placeholder="{{order_total}}" />
            </div>
          )} />
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.receiptNote", { orderNumber: "{{order_number}}", orderTotal: "{{order_total}}" })}</p>
          <Field label={t("bs.noteUnder")}><input value={block.note} onChange={(e) => set({ note: e.target.value })} className={inputClass} /></Field>
          {look({ bg: true })}
        </div>
      );
    case "steps":
      return (
        <div className="grid gap-3">
          <RowsField label={t("bs.steps")} rows={block.steps} max={5} blank="Next step" onChange={(steps) => set({ steps, current: Math.min(block.current, Math.max(0, steps.length - 1)) })} render={(step, setStep, index) => (
            <input aria-label={t("bs.stepN", { n: index + 1 })} value={step} onChange={(e) => setStep(e.target.value)} className={inputClass} maxLength={40} />
          )} />
          <VariantField label={t("bs.whereNow")} value={String(block.current)} options={block.steps.map((step, i) => ({ value: String(i), label: step || t("bs.stepN", { n: i + 1 }) }))} onChange={(value) => set({ current: Number(value) })} />
          <Field label={t("bs.noteUnder")}><input value={block.note} onChange={(e) => set({ note: e.target.value })} className={inputClass} /></Field>
          {look({ bg: true, pad: true })}
        </div>
      );
    case "review":
      return (
        <div className="grid gap-3">
          <Field label={t("bs.whatTheySaid")}><textarea value={block.quote} onChange={(e) => set({ quote: e.target.value })} rows={3} className={textareaClass} maxLength={600} /></Field>
          <Field label={t("bs.stars")}>
            <Segmented options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}★` }))} value={String(block.rating)} onChange={(value) => set({ rating: Number(value) })} className="border border-app-line" />
          </Field>
          <Field label={t("bs.name")}><input value={block.author} onChange={(e) => set({ author: e.target.value })} className={inputClass} placeholder="Ngozi A." /></Field>
          <Field label={t("bs.detailOptional")}><input value={block.detail} onChange={(e) => set({ detail: e.target.value })} className={inputClass} placeholder={t("bs.detailOptionalPlaceholder")} /></Field>
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.realReviews")}</p>
          {look({ align: true, color: t("bs.textColour"), bg: true })}
        </div>
      );
    case "features":
      return (
        <div className="grid gap-3">
          <RowsField label={t("bs.highlights")} rows={block.items} max={3} blank={{ icon: "✓", title: "Something good" }} onChange={(items) => set({ items })} render={(item, setItem) => (
            <>
              <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-1.5">
                <input aria-label={t("bs.symbol")} value={item.icon ?? ""} onChange={(e) => setItem({ ...item, icon: e.target.value || undefined })} className={`${inputClass} text-center`} maxLength={3} placeholder="✓" />
                <input aria-label={t("bs.title")} value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} className={`${inputClass} font-bold`} />
              </div>
              <input aria-label={t("bs.text")} value={item.text ?? ""} onChange={(e) => setItem({ ...item, text: e.target.value || undefined })} className={inputClass} placeholder={t("bs.oneShortLine")} />
            </>
          )} />
          {look({ bg: true, pad: true })}
        </div>
      );
    case "vip":
      return (
        <div className="grid gap-3">
          <Field label={t("bs.tierName")}><input value={block.tier} onChange={(e) => set({ tier: e.target.value })} className={inputClass} maxLength={24} placeholder="Gold" /></Field>
          <Field label={t("bs.title")}><input value={block.title} onChange={(e) => set({ title: e.target.value })} className={inputClass} /></Field>
          <RichText label={t("bs.text")} rows={2} value={block.text} onChange={(text) => set({ text })} />
          <RowsField label={t("bs.perks")} rows={block.perks} max={5} blank="A new perk" onChange={(perks) => set({ perks })} render={(perk, setPerk, index) => (
            <input aria-label={t("bs.perkN", { n: index + 1 })} value={perk} onChange={(e) => setPerk(e.target.value)} className={inputClass} maxLength={120} />
          )} />
          <Field label={t("bs.buttonTextOptional")}><input value={block.buttonLabel} onChange={(e) => set({ buttonLabel: e.target.value })} className={inputClass} /></Field>
          {block.buttonLabel ? <LinkField label={t("bs.buttonGoesTo")} url={block.buttonUrl} onChange={(buttonUrl) => set({ buttonUrl })} /> : null}
          {look({ color: t("bs.textColour"), bg: true })}
        </div>
      );
    case "meter":
      return (
        <div className="grid gap-3">
          <Field label={t("bs.title")}><input value={block.title} onChange={(e) => set({ title: e.target.value })} className={inputClass} placeholder={t("bs.yourPoints")} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label={t("bs.now")}><input type="number" min={0} value={block.current} onChange={(e) => set({ current: Math.max(0, Number(e.target.value) || 0) })} className={inputClass} /></Field>
            <Field label={t("bs.goal")}><input type="number" min={1} value={block.goal} onChange={(e) => set({ goal: Math.max(1, Number(e.target.value) || 1) })} className={inputClass} /></Field>
            <Field label={t("bs.unit")}><input value={block.unit} onChange={(e) => set({ unit: e.target.value })} className={inputClass} placeholder={t("bs.points")} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("bs.leftLabel")}><input value={block.from} onChange={(e) => set({ from: e.target.value })} className={inputClass} placeholder="Silver" /></Field>
            <Field label={t("bs.rightLabel")}><input value={block.to} onChange={(e) => set({ to: e.target.value })} className={inputClass} placeholder="Gold" /></Field>
          </div>
          <Field label={t("bs.noteOptional")}><input value={block.note} onChange={(e) => set({ note: e.target.value })} className={inputClass} /></Field>
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.meterHelp")}</p>
          {look({ color: t("bs.textColour"), bg: true })}
        </div>
      );
    case "game":
      return (
        <div className="grid gap-3">
          <VariantField label={t("bs.game")} value={block.game} options={(Object.keys(GAME_LABELS) as Array<keyof typeof GAME_LABELS>).map((value) => ({ value, label: t.dynamic(`game.${value}`, GAME_LABELS[value]) }))} onChange={(game) => set({ game })} />
          <Field label={t("bs.title")}><input value={block.title} onFocus={(e) => onFocusText?.(e.currentTarget, "text")} onChange={(e) => set({ title: e.target.value })} className={`${inputClass} font-bold`} /></Field>
          <RichText label={t("bs.text")} rows={3} value={block.text} onChange={(text) => set({ text })} />
          {block.game === "scratch" || block.game === "draw" ? (
            <Field label={block.game === "draw" ? t("bs.ticketNumber") : t("bs.cardHint")}><input value={block.value} onChange={(e) => set({ value: e.target.value })} className={inputClass} maxLength={40} placeholder={block.game === "draw" ? "No. 001" : t("bs.cardHintPlaceholder")} /></Field>
          ) : null}
          <RowsField label={t("bs.prizes")} rows={block.prizes} max={6} blank="A prize" onChange={(prizes) => set({ prizes })} render={(prize, setPrize, index) => (
            <input aria-label={t("bs.prizeN", { n: index + 1 })} value={prize} onChange={(e) => setPrize(e.target.value)} className={inputClass} maxLength={40} />
          )} />
          <Field label={t("bs.buttonText")}><input value={block.buttonLabel} onChange={(e) => set({ buttonLabel: e.target.value })} className={inputClass} /></Field>
          <LinkField label={t("bs.buttonGoesTo")} url={block.buttonUrl} onChange={(buttonUrl) => set({ buttonUrl })} />
          <p className="m-0 text-[12.5px] text-app-ink-soft">{t("bs.gameHelp")}</p>
          {look({ color: t("bs.textColour"), bg: true })}
        </div>
      );
  }
}

export { insertAtCursor };
