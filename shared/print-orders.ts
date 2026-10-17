// Ordering prints of a packaging design (/home/labels/order): materials and finishes per pack, quantity tiers,
// an instant price and delivery, and the order's life (paid → printing → shipped → delivered). Prices are naira
// estimates for digital/short-run printing in Lagos; the team confirms anything unusual before printing.
// Pure, unit-tested in tests/packaging.test.mjs.

import { z } from "zod";
import { PACK_FORMAT_INFO, type PackFormat, type PackSize } from "./packaging.ts";

export const PRINT_ORDER_REFERENCE_PREFIX = "printorder-";

export interface PrintMaterial {
  id: string;
  name: string;
  /** Multiplies the unit price. */
  factor: number;
}

/** What each pack can be printed on. The first is the default. */
export const PRINT_MATERIALS: Record<PackFormat, PrintMaterial[]> = {
  pouch: [
    { id: "kraft_zip", name: "Kraft paper zip pouch, foil lined", factor: 1 },
    { id: "matte_zip", name: "Matte plastic zip pouch, foil lined", factor: 1.1 },
    { id: "clear_window", name: "With a clear window", factor: 1.2 },
  ],
  box: [
    { id: "card_300", name: "300 gsm white card", factor: 1 },
    { id: "card_350", name: "350 gsm premium card", factor: 1.15 },
    { id: "kraft_card", name: "Kraft card", factor: 1.05 },
  ],
  jar_label: [
    { id: "paper_sticker", name: "Paper sticker", factor: 1 },
    { id: "vinyl_waterproof", name: "Waterproof vinyl", factor: 1.35 },
    { id: "clear_vinyl", name: "Clear vinyl", factor: 1.45 },
  ],
  bottle_label: [
    { id: "vinyl_waterproof", name: "Waterproof vinyl", factor: 1 },
    { id: "paper_sticker", name: "Paper sticker", factor: 0.8 },
    { id: "clear_vinyl", name: "Clear vinyl", factor: 1.1 },
  ],
  round_sticker: [
    { id: "paper_sticker", name: "Paper sticker", factor: 1 },
    { id: "vinyl_waterproof", name: "Waterproof vinyl", factor: 1.35 },
  ],
  sachet: [
    { id: "foil_laminate", name: "Foil laminate", factor: 1 },
    { id: "paper_foil", name: "Paper and foil", factor: 1.1 },
  ],
  tube_label: [
    { id: "printed_tube", name: "Printed plastic tube", factor: 1 },
    { id: "label_on_tube", name: "Label on a plain tube", factor: 0.7 },
  ],
  sleeve: [
    { id: "paper_200", name: "200 gsm paper", factor: 1 },
    { id: "kraft_paper", name: "Kraft paper", factor: 1.05 },
  ],
  bag: [
    { id: "kraft_bag", name: "Kraft paper bag, twisted handles", factor: 1 },
    { id: "laminated_bag", name: "Laminated art paper, rope handles", factor: 1.5 },
  ],
};

export const PRINT_FINISHES = [
  { id: "matte", name: "Matte", factor: 1 },
  { id: "gloss", name: "Gloss", factor: 1 },
  { id: "soft_touch", name: "Soft touch", factor: 1.15 },
  { id: "foil", name: "Gold or silver foil detail", factor: 1.3 },
] as const;
export type PrintFinish = (typeof PRINT_FINISHES)[number]["id"];

/** Naira per piece at the format's middle preset size and 500 pieces, setup and minimum order. */
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

/** Bigger runs cost less per piece. */
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

export const DELIVERY_ZONES = [
  { id: "lagos", name: "Lagos", fee: 4000, extraDays: 1 },
  { id: "southwest", name: "Ogun, Oyo, Osun, Ondo, Ekiti", fee: 6500, extraDays: 2 },
  { id: "rest", name: "Rest of Nigeria", fee: 9500, extraDays: 4 },
  { id: "pickup", name: "Pick up in Lagos", fee: 0, extraDays: 0 },
] as const;
export type DeliveryZone = (typeof DELIVERY_ZONES)[number]["id"];

export function minQuantity(format: PackFormat) {
  return BASE[format].min;
}

export interface PrintQuote {
  quantity: number;
  unitPrice: number;
  printCost: number;
  setupFee: number;
  deliveryFee: number;
  total: number;
  days: number;
  material: PrintMaterial;
  finish: (typeof PRINT_FINISHES)[number];
}

/** The price of a run. Unit prices scale with the face area against the format's middle size (0.6× to 3×). */
export function quotePrint(input: { format: PackFormat; size: PackSize; quantity: number; material?: string | null; finish?: string | null; zone: DeliveryZone }): PrintQuote {
  const base = BASE[input.format];
  const quantity = Math.max(base.min, Math.min(100000, Math.round(input.quantity) || base.min));
  const middle = PACK_FORMAT_INFO[input.format].sizes[1];
  const area = (size: PackSize) => (size.w * size.h + (size.d ? size.d * (size.w + size.h) : 0)) || 1;
  const scale = Math.min(3, Math.max(0.6, area(input.size) / area(middle)));
  const material = PRINT_MATERIALS[input.format].find((item) => item.id === input.material) ?? PRINT_MATERIALS[input.format][0];
  const finish = PRINT_FINISHES.find((item) => item.id === input.finish) ?? PRINT_FINISHES[0];
  const unitPrice = Math.max(5, Math.round(base.unit * scale * material.factor * finish.factor * quantityFactor(quantity)));
  const printCost = unitPrice * quantity;
  const zone = DELIVERY_ZONES.find((item) => item.id === input.zone) ?? DELIVERY_ZONES[0];
  // Heavy runs ship in more parcels.
  const parcels = zone.fee ? Math.max(1, Math.ceil((quantity * scale * (input.format === "box" || input.format === "bag" ? 4 : 1)) / 2000)) : 0;
  const deliveryFee = zone.fee * parcels;
  return {
    quantity,
    unitPrice,
    printCost,
    setupFee: base.setup,
    deliveryFee,
    total: printCost + base.setup + deliveryFee,
    days: base.days + (quantity >= 2500 ? 3 : 0) + zone.extraDays,
    material,
    finish,
  };
}

export const PRINT_ORDER_STATUSES = ["awaiting_payment", "paid", "printing", "shipped", "delivered", "cancelled"] as const;
export type PrintOrderStatus = (typeof PRINT_ORDER_STATUSES)[number];

export const PRINT_ORDER_STATUS_LABEL: Record<PrintOrderStatus, string> = {
  awaiting_payment: "Not paid yet",
  paid: "Paid, in the queue",
  printing: "Printing",
  shipped: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const text = (max: number) => z.string().trim().max(max);

export const PrintOrderSchema = z.object({
  designId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(100000),
  material: text(40).nullable().optional(),
  finish: z.enum(PRINT_FINISHES.map((item) => item.id) as [PrintFinish, ...PrintFinish[]]).default("matte"),
  zone: z.enum(DELIVERY_ZONES.map((item) => item.id) as [DeliveryZone, ...DeliveryZone[]]),
  contactName: text(120).min(2, "Add the name for delivery"),
  contactPhone: z.string().trim().min(7, "Add a phone number").max(30),
  address: text(300).nullable().optional(),
  city: text(80).nullable().optional(),
  state: text(80).nullable().optional(),
  notes: text(1000).nullable().optional(),
  proofOk: z.literal(true, { message: "Tick the box to say you've checked the design" }),
});
export type PrintOrderInput = z.infer<typeof PrintOrderSchema>;

export const PrintOrderUpdateSchema = z.object({
  status: z.enum(PRINT_ORDER_STATUSES).optional(),
  tracking: text(300).nullable().optional(),
  adminNotes: text(4000).nullable().optional(),
});
