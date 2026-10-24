// Packaging and labels (app/packaging.tsx), the parts that need no network, so tests/mobile-shop-web.test.mjs runs
// them. The print prices are copies of shared/print-orders.ts for the default material and a matte finish (that file
// needs zod, which isn't in the app); the test checks they give the server's price for every pack, run and zone.
import { cleanDesign, guessProductType, newDesign, PACK_FORMAT_INFO, PRODUCT_TYPE_INFO, stylesFor, type PackContent, type PackDesign, type PackFormat, type PackSize, type PackStyle, type ProductType } from "../../../../shared/packaging.ts";

/** Naira per piece at the format's middle preset size and 500 pieces, setup and minimum order (shared/print-orders.ts). */
const BASE: Record<PackFormat, { unit: number; setup: number; min: number; days: number }> = {
  pouch: { unit: 380, setup: 25000, min: 100, days: 10 },
  box: { unit: 260, setup: 30000, min: 100, days: 10 },
  jar_label: { unit: 55, setup: 5000, min: 100, days: 5 },
  bottle_label: { unit: 70, setup: 5000, min: 100, days: 5 },
  round_sticker: { unit: 25, setup: 3000, min: 100, days: 4 },
  sachet: { unit: 45, setup: 25000, min: 1000, days: 12 },
  tube_label: { unit: 320, setup: 35000, min: 500, days: 14 },
  sleeve: { unit: 60, setup: 5000, min: 100, days: 5 },
  bag: { unit: 420, setup: 20000, min: 100, days: 10 },
};

export const QUANTITY_TIERS = [50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;

export const DELIVERY_ZONES = [
  { id: "lagos", name: "Lagos", fee: 4000, extraDays: 1 },
  { id: "southwest", name: "Ogun, Oyo, Osun, Ondo, Ekiti", fee: 6500, extraDays: 2 },
  { id: "rest", name: "Rest of Nigeria", fee: 9500, extraDays: 4 },
  { id: "pickup", name: "Pick up in Lagos", fee: 0, extraDays: 0 },
] as const;
export type DeliveryZone = (typeof DELIVERY_ZONES)[number]["id"];

function quantityFactor(quantity: number) {
  if (quantity < 100) return 1.6;
  if (quantity < 250) return 1.3;
  if (quantity < 500) return 1.12;
  if (quantity < 1000) return 1;
  if (quantity < 2500) return 0.85;
  if (quantity < 5000) return 0.72;
  if (quantity < 10000) return 0.64;
  return 0.58;
}

export function minQuantity(format: PackFormat) {
  return BASE[format].min;
}

/** The price of a run on the default material, matte (what the app orders). The server prices it again. */
export function quotePrint(input: { format: PackFormat; size: PackSize; quantity: number; zone: DeliveryZone }) {
  const base = BASE[input.format];
  const quantity = Math.max(base.min, Math.min(100000, Math.round(input.quantity) || base.min));
  const middle = PACK_FORMAT_INFO[input.format].sizes[1];
  const area = (size: PackSize) => (size.w * size.h + (size.d ? size.d * (size.w + size.h) : 0)) || 1;
  const scale = Math.min(3, Math.max(0.6, area(input.size) / area(middle)));
  const unitPrice = Math.max(5, Math.round(base.unit * scale * quantityFactor(quantity)));
  const printCost = unitPrice * quantity;
  const zone = DELIVERY_ZONES.find((item) => item.id === input.zone) ?? DELIVERY_ZONES[0];
  const parcels = zone.fee ? Math.max(1, Math.ceil((quantity * scale * (input.format === "box" || input.format === "bag" ? 4 : 1)) / 2000)) : 0;
  const deliveryFee = zone.fee * parcels;
  return { quantity, unitPrice, printCost, setupFee: base.setup, deliveryFee, total: printCost + base.setup + deliveryFee, days: base.days + (quantity >= 2500 ? 3 : 0) + zone.extraDays };
}

/** The quantity buttons for a pack: up to five tiers at or above its minimum run. */
export function quantityChoices(format: PackFormat): number[] {
  const min = minQuantity(format);
  return QUANTITY_TIERS.filter((count) => count >= min).slice(0, 5);
}

/** The packs that suit a product type. */
export function formatsFor(type: ProductType): PackFormat[] {
  return PRODUCT_TYPE_INFO[type].formats;
}

/** Templates in the order that suits the product type. */
export const templatesFor = (type: ProductType): PackStyle[] => stylesFor(type);

/** Product names are long ("Ofada rice, 5kg bag, stone free"); the pack shows the first part. */
export function shortName(name: string) {
  const first = name.split(/[,(|–]/)[0].trim();
  return (first || name).slice(0, 40);
}

/** A fresh design with the shop's name and logo, on one product when one is picked (a sample otherwise). */
export function startDesign(input: { shopName: string; logoUrl: string | null; website: string; style: PackStyle; format?: PackFormat; product?: { id: string; name: string; images: string[] } | null; type?: ProductType }): PackDesign {
  const type = input.type ?? (input.product ? guessProductType(input.product.name) : "food");
  const formats = formatsFor(type);
  const format = input.format && formats.includes(input.format) ? input.format : formats[0];
  return newDesign({
    format,
    style: input.style,
    productType: type,
    brand: input.shopName,
    name: input.product ? shortName(input.product.name) : "",
    productId: input.product?.id ?? null,
    image: input.product?.images[0] ?? null,
    logoUrl: input.logoUrl && /^https:\/\//.test(input.logoUrl) ? input.logoUrl : null,
    website: input.website,
  });
}

/** Peggy's words merged into the design (the server cleans them again on save). */
export function withWords(design: PackDesign, content: Partial<PackContent>): PackDesign {
  return cleanDesign({ ...design, content: { ...design.content, ...content } });
}
