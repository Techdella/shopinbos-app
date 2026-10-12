"use client";

import { useEffect, useRef, useState } from "react";
import { Segmented } from "@/components/app-ui";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Field, buttonClass, checkClass, inputClass, selectClass, textareaClass } from "@/components/growth/kit";
import { SOCIAL_LABELS, SOCIAL_NETWORKS, type Align, type ColumnCell, type EmailBlock, type EmailBlockType, type ProductItem } from "@/lib/marketing/blocks";
import { api, errorText, insertAtCursor } from "./client";

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
      return { type, text: "You're getting this because you shop with {{store}}." };
  }
}

/** One line describing a block, for the block list. */
export function blockSummary(block: EmailBlock) {
  switch (block.type) {
    case "heading":
    case "text":
    case "footer":
      return block.text.replace(/\s+/g, " ").trim() || "Empty";
    case "button":
      return block.label || "Button";
    case "image":
      return block.alt || (block.url ? "Picture" : "No picture yet");
    case "columns":
      return block.cells.map((cell) => cell.heading || cell.text || "…").join(" | ");
    case "products":
      return block.items.length ? block.items.map((item) => item.name).join(", ") : "Pick products";
    case "coupon":
      return block.code || "No code yet";
    case "social":
      return block.links.map((link) => SOCIAL_LABELS[link.network]).join(", ") || "No links yet";
    case "spacer":
      return `${block.height}px`;
    case "divider":
      return "Line";
  }
}

const LINKS = [
  ["{{store_url}}", "Your shop"],
  ["{{cart_url}}", "Their saved cart"],
] as const;

async function uploadImage(file: File) {
  const body = new FormData();
  body.append("file", file);
  body.append("folder", "brand");
  const res = await fetch("/api/upload", { method: "POST", body });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data?.publicUrl) throw new Error(json?.error?.message ?? "The picture couldn't be uploaded");
  return json.data.publicUrl as string;
}

function ImageField({ url, onChange, label = "Picture" }: { url: string; onChange: (url: string) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-2">
      <span className="text-[13.5px] font-bold">{label}</span>
      <div className="flex items-center gap-2">
        {url && /^https?:\/\//.test(url) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-14 w-14 shrink-0 rounded-[12px] border border-app-line object-cover" />
        ) : (
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[12px] border border-dashed border-app-line text-app-ink-soft"><Icon name="image" size={18} /></span>
        )}
        <button type="button" className={buttonClass("white", "sm")} disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="upload" size={14} /> {busy ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              onChange(await uploadImage(file));
            } catch (uploadError) {
              setError(errorText(uploadError));
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      <input aria-label={`${label} link`} value={url} onChange={(e) => onChange(e.target.value)} className={inputClass} placeholder="…or paste an https:// image link" inputMode="url" />
      {error ? <p className="m-0 text-[12.5px] text-app-danger">{error}</p> : null}
    </div>
  );
}

function LinkField({ label, url, onChange }: { label: string; url: string; onChange: (url: string) => void }) {
  const preset = LINKS.some(([value]) => value === url);
  return (
    <Field label={label}>
      <div className="grid gap-2">
        <select aria-label={label} value={preset ? url : "custom"} onChange={(e) => onChange(e.target.value === "custom" ? "https://" : e.target.value)} className={selectClass}>
          {LINKS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          <option value="custom">Another link</option>
        </select>
        {!preset ? <input aria-label={`${label} (address)`} value={url} onChange={(e) => onChange(e.target.value)} className={inputClass} placeholder="https://" inputMode="url" /> : null}
      </div>
    </Field>
  );
}

function ColorField({ label, value, onChange, fallback }: { label: string; value?: string; onChange: (value: string | undefined) => void; fallback: string }) {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-2">
      <span className="text-[13.5px] font-bold">{label}</span>
      <span className="flex items-center gap-2">
        <input type="color" aria-label={label} value={value || fallback} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded-[10px] border border-app-line bg-white p-1" />
        {value ? (
          <button type="button" onClick={() => onChange(undefined)} className="min-h-[36px] rounded-full px-3 text-[12.5px] font-bold text-app-ink-soft hover:bg-app-canvas">Reset</button>
        ) : (
          <span className="w-[52px] text-[12px] text-app-ink-soft">Brand</span>
        )}
      </span>
    </div>
  );
}

function AlignField({ value, onChange }: { value?: Align; onChange: (value: Align) => void }) {
  return (
    <Field label="Alignment">
      <Segmented options={[{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }]} value={value ?? "left"} onChange={onChange} className="border border-app-line" />
    </Field>
  );
}

/** A text box with Bold / Italic / Link buttons that wrap the selection in the builder's simple marks. */
function RichText({ value, onChange, rows = 5, label, onFocusField }: { value: string; onChange: (value: string) => void; rows?: number; label: string; onFocusField?: (el: HTMLTextAreaElement) => void }) {
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
        <button type="button" className={`${tool} font-extrabold`} onClick={() => wrap("**", "**", "bold words")} aria-label="Bold">B</button>
        <button type="button" className={`${tool} italic`} onClick={() => wrap("*", "*", "italic words")} aria-label="Italic">I</button>
        <button type="button" className={tool} onClick={() => wrap("[", "](https://)", "link text")} aria-label="Add a link"><Icon name="link" size={14} /></button>
      </div>
      <textarea ref={ref} aria-label={label} value={value} onFocus={(e) => onFocusField?.(e.currentTarget)} onChange={(e) => onChange(e.target.value)} rows={rows} className={textareaClass} placeholder="Write here. A blank line starts a new paragraph." />
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
  const [products, setProducts] = useState<Array<ProductItem & { id: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadProducts().then(setProducts).catch((loadError) => setError(errorText(loadError)));
  }, []);
  const chosen = new Set(items.map((item) => item.url));
  if (error) return <p className="m-0 text-[13px] text-app-danger">{error}</p>;
  if (!products) return <p className="m-0 text-[13px] text-app-ink-soft">Loading your products…</p>;
  if (!products.length) return <p className="m-0 text-[13px] text-app-ink-soft">Publish a product with a photo first, then pick it here.</p>;
  return (
    <div className="grid gap-1.5">
      <span className="text-[13.5px] font-bold">Products ({items.length} of 6)</span>
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
  return (
    <fieldset className="grid gap-2.5 rounded-[14px] border border-app-line p-3">
      <legend className="px-1 text-[13px] font-extrabold">{title}</legend>
      <ImageField url={cell.imageUrl ?? ""} onChange={(imageUrl) => onChange({ ...cell, imageUrl })} label="Picture (optional)" />
      <Field label="Heading"><input value={cell.heading ?? ""} onChange={(e) => onChange({ ...cell, heading: e.target.value })} className={inputClass} /></Field>
      <RichText label="Text" rows={3} value={cell.text ?? ""} onChange={(text) => onChange({ ...cell, text })} />
      <Field label="Button text (optional)"><input value={cell.buttonLabel ?? ""} onChange={(e) => onChange({ ...cell, buttonLabel: e.target.value })} className={inputClass} placeholder="Leave empty for no button" /></Field>
      {cell.buttonLabel ? <LinkField label="Button goes to" url={cell.buttonUrl ?? "{{store_url}}"} onChange={(buttonUrl) => onChange({ ...cell, buttonUrl })} /> : null}
    </fieldset>
  );
}

/**
 * The fields for one block. `onFocusText` lets the parent insert {{details}} where the seller is typing.
 */
export function BlockSettings({ block, onChange, onFocusText }: { block: EmailBlock; onChange: (block: EmailBlock) => void; onFocusText?: (el: HTMLTextAreaElement | HTMLInputElement, field: "text" | "label") => void }) {
  const set = (patch: Partial<EmailBlock>) => onChange({ ...block, ...patch } as EmailBlock);
  const look = (options: { align?: boolean; color?: string | false; bg?: boolean; pad?: boolean }) => (
    <div className="grid gap-2 border-t border-app-line pt-3">
      {options.align ? <AlignField value={block.align} onChange={(align) => set({ align })} /> : null}
      {options.color ? <ColorField label={options.color} value={block.color} onChange={(color) => set({ color })} fallback={block.type === "button" ? "#FF6A2B" : "#16141F"} /> : null}
      {options.bg ? <ColorField label="Background" value={block.bg} onChange={(bg) => set({ bg })} fallback="#FFFFFF" /> : null}
      {options.pad ? (
        <Field label={`Space around (${block.pad ?? 0}px)`}>
          <input type="range" min={0} max={48} step={4} value={block.pad ?? 0} onChange={(e) => set({ pad: Number(e.target.value) || undefined })} className="w-full accent-[#16141F]" />
        </Field>
      ) : null}
    </div>
  );

  switch (block.type) {
    case "heading":
      return (
        <div className="grid gap-3">
          <Field label="Heading"><input value={block.text} onFocus={(e) => onFocusText?.(e.currentTarget, "text")} onChange={(e) => set({ text: e.target.value })} className={`${inputClass} font-bold`} /></Field>
          <Field label="Size">
            <Segmented options={[{ value: "lg", label: "Big" }, { value: "md", label: "Medium" }, { value: "sm", label: "Small" }]} value={block.size ?? "lg"} onChange={(size) => set({ size })} className="border border-app-line" />
          </Field>
          {look({ align: true, color: "Text colour", bg: true, pad: true })}
        </div>
      );
    case "text":
      return (
        <div className="grid gap-3">
          <RichText label="Text" rows={7} value={block.text} onChange={(text) => set({ text })} onFocusField={(el) => onFocusText?.(el, "text")} />
          <p className="m-0 text-[12.5px] text-app-ink-soft">**bold**, *italic* and [link text](https://…) work too.</p>
          {look({ align: true, color: "Text colour", bg: true, pad: true })}
        </div>
      );
    case "button":
      return (
        <div className="grid gap-3">
          <Field label="Button text"><input value={block.label} onFocus={(e) => onFocusText?.(e.currentTarget, "label")} onChange={(e) => set({ label: e.target.value })} className={inputClass} /></Field>
          <LinkField label="Goes to" url={block.url} onChange={(url) => set({ url })} />
          {look({ align: true, color: "Button colour", bg: false, pad: true })}
          <ColorField label="Button text colour" value={block.textColor} onChange={(textColor) => set({ textColor })} fallback="#FFFFFF" />
        </div>
      );
    case "image":
      return (
        <div className="grid gap-3">
          <ImageField url={block.url} onChange={(url) => set({ url })} />
          <Field label="Describe the picture" hint="Shown when pictures are off, and read out by screen readers."><input value={block.alt} onChange={(e) => set({ alt: e.target.value })} className={inputClass} /></Field>
          <Field label="Tap the picture to open (optional)"><input value={block.link ?? ""} onChange={(e) => set({ link: e.target.value || undefined })} className={inputClass} placeholder="{{store_url}} or https://" /></Field>
          {look({ pad: true })}
        </div>
      );
    case "divider":
      return <div className="grid gap-3">{look({ color: "Line colour", pad: true })}</div>;
    case "spacer":
      return (
        <Field label={`Height (${block.height}px)`}>
          <input type="range" min={4} max={120} step={4} value={block.height} onChange={(e) => set({ height: Number(e.target.value) })} className="w-full accent-[#16141F]" />
        </Field>
      );
    case "columns":
      return (
        <div className="grid gap-3">
          <p className="m-0 text-[12.5px] text-app-ink-soft">Side by side on a computer, one under the other on a phone.</p>
          {block.cells.map((cell, index) => (
            <CellEditor key={index} title={index === 0 ? "Left column" : "Right column"} cell={cell} onChange={(next) => set({ cells: block.cells.map((c, i) => (i === index ? next : c)) })} />
          ))}
          {look({ bg: true, pad: true })}
        </div>
      );
    case "products":
      return (
        <div className="grid gap-3">
          <ProductPicker items={block.items} onChange={(items) => set({ items })} />
          <Field label="Button text"><input value={block.buttonLabel ?? ""} onChange={(e) => set({ buttonLabel: e.target.value })} className={inputClass} placeholder="Shop now" /></Field>
          <p className="m-0 text-[12.5px] text-app-ink-soft">Names, prices and photos come from your products as they are now.</p>
          {look({ bg: true, pad: true })}
        </div>
      );
    case "coupon":
      return (
        <div className="grid gap-3">
          <Field label="Code" hint={<>The code must exist in <a href="/home/discounts" className="font-bold text-app-ink">Discounts</a> for it to work at checkout.</>}>
            <input value={block.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s+/g, "") })} className={`${inputClass} font-mono tracking-[0.1em]`} maxLength={40} />
          </Field>
          <Field label="Title"><input value={block.title} onChange={(e) => set({ title: e.target.value })} className={inputClass} /></Field>
          <Field label="Small print"><input value={block.note} onChange={(e) => set({ note: e.target.value })} className={inputClass} /></Field>
          {look({ color: "Text colour", bg: true, pad: true })}
        </div>
      );
    case "social":
      return (
        <div className="grid gap-2.5">
          <p className="m-0 text-[12.5px] text-app-ink-soft">Leave a box empty to hide that link.</p>
          {SOCIAL_NETWORKS.map((network) => {
            const link = block.links.find((l) => l.network === network);
            return (
              <Field key={network} label={SOCIAL_LABELS[network]}>
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
          <RichText label="Footer text" rows={3} value={block.text} onChange={(text) => set({ text })} onFocusField={(el) => onFocusText?.(el, "text")} />
          <label className="flex min-h-[44px] items-center gap-2 text-[14px] font-semibold">
            <input type="checkbox" className={checkClass} checked={Boolean(block.unsubscribe)} onChange={(e) => set({ unsubscribe: e.target.checked || undefined })} />
            Add an unsubscribe link
          </label>
          <p className="m-0 text-[12.5px] text-app-ink-soft">Campaign emails always get an unsubscribe link at the very bottom anyway.</p>
          {look({ align: true, color: "Text colour" })}
        </div>
      );
  }
}

export { insertAtCursor };
