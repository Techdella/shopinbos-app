// Pay-when-it-arrives orders that go out in several parcels (some lines sent by suppliers, the rest by the seller):
// how much the rider collects for each parcel, so the customer pays the order total once, spread across the
// parcels, never the whole total at every door. Pure (no imports), tested in tests/cod-split.test.mjs.
//
// Each store order line gets a share of the order total in proportion to its value (price × quantity), so
// delivery fees and discounts are spread the same way. Worked in kobo; the rounding remainder goes to the first
// line, so the shares always add up to the total exactly. A parcel collects the shares of the lines it carries.
// Shares depend only on the order's lines, not on which parcel is booked first, and a replacement supplier
// carries the same lines, so it collects what the supplier it replaced would have.

export interface CodOrderLine {
  productId?: unknown;
  variant?: unknown;
  price?: unknown;
  quantity?: unknown;
}

export interface CodPartLine {
  storeProductId?: unknown;
  variant?: unknown;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function lineKey(productId: unknown, variant: unknown) {
  return `${text(productId)}::${text(variant).toLowerCase()}`;
}

function asLines(items: unknown): CodOrderLine[] {
  return Array.isArray(items) ? (items as CodOrderLine[]).filter((item) => item && typeof item === "object") : [];
}

/** Each line's share of `total`, in naira with kobo precision. Sums to `total` exactly. */
export function lineShares(items: unknown, total: number): number[] {
  const lines = asLines(items);
  const totalKobo = Math.max(0, Math.round((Number(total) || 0) * 100));
  if (!lines.length) return [];
  const qty = (line: CodOrderLine) => Math.max(1, Math.floor(Number(line.quantity) || 1));
  let weights = lines.map((line) => Math.max(0, Number(line.price) || 0) * qty(line));
  // No prices recorded: share by quantity instead.
  if (weights.every((weight) => weight <= 0)) weights = lines.map(qty);
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  const kobo = weights.map((weight) => Math.floor((totalKobo * weight) / sum));
  kobo[0] += totalKobo - kobo.reduce((acc, value) => acc + value, 0);
  return kobo.map((value) => value / 100);
}

/** Lines (by index) a parcel carries: the first unclaimed order line matching each part line's product and size/colour. */
function claim(lines: CodOrderLine[], partLines: CodPartLine[], taken: Set<number>): number[] {
  const indexes: number[] = [];
  for (const part of partLines) {
    const key = lineKey(part.storeProductId, part.variant);
    const index = lines.findIndex((line, i) => !taken.has(i) && lineKey(line.productId, line.variant) === key);
    if (index >= 0) {
      taken.add(index);
      indexes.push(index);
    }
  }
  return indexes;
}

/** What the rider collects for one supplier's parcel. */
export function supplierPartCollect(items: unknown, total: number, partLines: unknown): number {
  const lines = asLines(items);
  const shares = lineShares(lines, total);
  const indexes = claim(lines, Array.isArray(partLines) ? (partLines as CodPartLine[]) : [], new Set());
  return Math.round(indexes.reduce((acc, i) => acc + shares[i], 0) * 100) / 100;
}

/**
 * What the rider collects for the seller's own parcel: the lines no supplier order of this store order carries.
 * With no supplier orders it's the whole total, as before.
 */
export function ownPartCollect(items: unknown, total: number, supplierParts: unknown[]): number {
  const lines = asLines(items);
  const shares = lineShares(lines, total);
  if (!lines.length) return Math.max(0, Number(total) || 0);
  const taken = new Set<number>();
  for (const part of supplierParts) claim(lines, Array.isArray(part) ? (part as CodPartLine[]) : [], taken);
  return Math.round(lines.reduce((acc, _line, i) => (taken.has(i) ? acc : acc + shares[i]), 0) * 100) / 100;
}
