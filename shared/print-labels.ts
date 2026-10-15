// Print studio (/home/labels/studio): the printable things a seller makes for products and parcels: hang tags, price
// and barcode labels, QR stickers, package labels and thank-you cards. Sizes are real millimetres so they print true
// on an A4 sheet or a label printer. Pure, unit-tested in tests/behaviour.test.mjs.

import { normaliseEan13 } from "./barcodes.ts";

export const PRINT_KINDS = ["tag", "price", "qr", "package", "thanks"] as const;
export type PrintKind = (typeof PRINT_KINDS)[number];

/** Width × height in millimetres, and whether each label is about one product. */
export const PRINT_SPECS: Record<PrintKind, { w: number; h: number; perProduct: boolean }> = {
  tag: { w: 50, h: 90, perProduct: true },
  price: { w: 50, h: 25, perProduct: true },
  qr: { w: 50, h: 50, perProduct: false },
  package: { w: 100, h: 70, perProduct: true },
  thanks: { w: 105, h: 74, perProduct: false },
};

export const QR_TARGETS = ["product", "store", "whatsapp", "reviews", "custom"] as const;
export type QrTarget = (typeof QR_TARGETS)[number];

export type PaperMode = "sheet" | "roll";

/** A4 printable area with 8mm margins and 3mm gaps between labels. */
const SHEET = { w: 210 - 16, h: 297 - 16, gap: 3 };

/** How many labels of a kind fit on one A4 sheet. */
export function labelsPerSheet(kind: PrintKind) {
  const { w, h } = PRINT_SPECS[kind];
  const across = Math.max(1, Math.floor((SHEET.w + SHEET.gap) / (w + SHEET.gap)));
  const down = Math.max(1, Math.floor((SHEET.h + SHEET.gap) / (h + SHEET.gap)));
  return across * down;
}

export function isPrintKind(value: unknown): value is PrintKind {
  return typeof value === "string" && (PRINT_KINDS as readonly string[]).includes(value);
}

export function isQrTarget(value: unknown): value is QrTarget {
  return typeof value === "string" && (QR_TARGETS as readonly string[]).includes(value);
}

/** The number in a product's barcode: its EAN if valid, else its barcode text or SKU, else a short id. */
export function barcodeValueFor(product: { id: string; barcode?: string | null; sku?: string | null }) {
  const barcode = product.barcode?.trim();
  if (barcode && normaliseEan13(barcode)) return normaliseEan13(barcode)!;
  if (barcode && /^[\x20-\x7e]{1,40}$/.test(barcode)) return barcode;
  const sku = product.sku?.trim();
  if (sku && /^[\x20-\x7e]{1,40}$/.test(sku)) return sku;
  return product.id.slice(-10).toUpperCase();
}

export interface PrintProduct {
  id: string;
  name: string;
  price: string;
  url: string;
  barcode?: string | null;
  sku?: string | null;
  image?: string | null;
}

export interface PrintStore {
  name: string;
  url: string;
  whatsapp: string | null;
  reviewsUrl: string;
}

/** Where a label's QR code points. */
export function qrTargetUrl(target: QrTarget, store: PrintStore, product: PrintProduct | null, custom: string) {
  if (target === "custom" && /^https?:\/\/\S+$/i.test(custom.trim())) return custom.trim();
  if (target === "whatsapp" && store.whatsapp) return `https://wa.me/${store.whatsapp.replace(/\D/g, "")}${product ? `?text=${encodeURIComponent(`Hi, I'd like ${product.name}`)}` : ""}`;
  if (target === "reviews") return store.reviewsUrl;
  if (target === "product" && product) return product.url;
  return store.url;
}

export interface PrintItem {
  key: string;
  product: PrintProduct | null;
  qr: string;
  barcode: string | null;
}

/**
 * The labels to print: for product kinds, each chosen product × copies; for the others, one per chosen product
 * (QR to that product) or, with none chosen, `copies` store-wide ones. Capped at 300 labels.
 */
export function buildPrintItems(input: { kind: PrintKind; products: PrintProduct[]; copies: number; target: QrTarget; custom: string; store: PrintStore }): PrintItem[] {
  const copies = Math.max(1, Math.min(100, Math.round(input.copies) || 1));
  const spec = PRINT_SPECS[input.kind];
  const sources: Array<PrintProduct | null> = spec.perProduct || input.products.length ? input.products : [null];
  const items: PrintItem[] = [];
  for (const product of sources) {
    for (let copy = 0; copy < copies && items.length < 300; copy++) {
      items.push({
        key: `${product?.id ?? "store"}-${copy}`,
        product,
        qr: qrTargetUrl(input.target, input.store, product, input.custom),
        barcode: product ? barcodeValueFor(product) : null,
      });
    }
  }
  return items;
}

/** The @page rule: A4 sheets, or one label per page at the label's own size for label printers. */
export function pageCss(kind: PrintKind, paper: PaperMode) {
  const { w, h } = PRINT_SPECS[kind];
  return paper === "roll" ? `@page { size: ${w}mm ${h}mm; margin: 0; }` : "@page { size: A4; margin: 8mm; }";
}
