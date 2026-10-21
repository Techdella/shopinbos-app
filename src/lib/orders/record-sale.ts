import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { ensureSupplierOrdersSafely } from "@/lib/supplier-orders/service.server";
import { RECORDED_SALE_CHANNELS } from "@shared/channels";
import { SALE_DELIVERY_KEYS, SALE_PAYMENT_KEYS, saleStatus, saleTotals, type SaleLine } from "@shared/sales";

// Records a sale the seller made off the storefront (WhatsApp, Instagram, in person). Used by
// POST /api/app/orders (mobile) and the web "Record a sale" form.

export const RecordSaleSchema = z.object({
  buyerName: z.string().trim().min(1, "Add the customer's name").max(120),
  buyerPhone: z.string().trim().max(30).optional().nullable(),
  buyerEmail: z.string().trim().email("That email doesn't look right").max(200).optional().nullable().or(z.literal("")),
  items: z
    .array(
      z.object({
        productId: z.string().max(64).optional().nullable(),
        name: z.string().trim().min(1, "Every item needs a name").max(160),
        price: z.number().min(0).max(100_000_000),
        quantity: z.number().int().min(1).max(10_000),
      }),
    )
    .min(1, "Add at least one item")
    .max(50),
  payment: z.enum(SALE_PAYMENT_KEYS),
  delivery: z.enum(SALE_DELIVERY_KEYS),
  deliveryFee: z.number().min(0).max(10_000_000).optional(),
  address: z.object({ street: z.string().trim().max(300), city: z.string().trim().max(120), state: z.string().trim().max(120).optional() }).optional().nullable(),
  channel: z.enum(RECORDED_SALE_CHANNELS),
  notes: z.string().trim().max(1000).optional().nullable(),
});
export type RecordSaleInput = z.infer<typeof RecordSaleSchema>;

function orderNumber() {
  return `SB-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export class RecordSaleError extends Error {}

export async function recordSale(storeId: string, input: RecordSaleInput) {
  if (input.delivery === "deliver" && !input.address?.street) throw new RecordSaleError("Add the delivery address");

  // Catalogue items use the store's product (its image, and the stock count goes down). Prices can be
  // changed per sale: sellers often agree a price on WhatsApp.
  const productIds = [...new Set(input.items.map((item) => item.productId).filter((id): id is string => Boolean(id)))];
  const products = productIds.length
    ? await db.storeProduct.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, images: true } })
    : [];
  const known = new Map(products.map((product) => [product.id, product]));
  if (known.size !== productIds.length) throw new RecordSaleError("One of those products is no longer in your store");

  const lines: SaleLine[] = input.items.map((item) => {
    const product = item.productId ? known.get(item.productId) : null;
    const line: SaleLine = { productId: product?.id ?? null, name: item.name, price: item.price, quantity: item.quantity };
    if (product?.images[0]) line.image = product.images[0];
    return line;
  });
  const { subtotal, shippingFee, total } = saleTotals(lines, input.delivery === "deliver" ? input.deliveryFee ?? 0 : 0);
  const { status, paymentMethod, delivered } = saleStatus(input.payment, input.delivery);
  const now = new Date();

  const order = await db.$transaction(async (tx) => {
    for (const line of lines) {
      if (!line.productId) continue;
      // The sale already happened, so it's recorded even if the stock count was off; stock stops at 0.
      const product = await tx.storeProduct.findUnique({ where: { id: line.productId }, select: { currentStock: true } });
      const taken = Math.min(product?.currentStock ?? 0, line.quantity);
      await tx.storeProduct.update({
        where: { id: line.productId },
        data: { currentStock: { decrement: taken }, soldStock: { increment: line.quantity } },
      });
    }
    return tx.retailOrder.create({
      data: {
        storeId,
        orderNumber: orderNumber(),
        buyerName: input.buyerName,
        buyerEmail: input.buyerEmail || "",
        buyerPhone: input.buyerPhone || null,
        deliveryAddress: input.delivery === "deliver" && input.address ? input.address : {},
        items: lines.map((line) => Object.fromEntries(Object.entries(line).filter(([, value]) => value !== null && value !== undefined))),
        subtotal,
        shippingFee,
        total,
        status,
        paymentMethod,
        paystackStatus: null,
        channel: input.channel,
        notes: input.notes || null,
        logisticsDetails: input.delivery === "collected" ? { type: "collected" } : undefined,
        deliveredAt: delivered ? now : null,
      },
    });
  });
  // Dropship items in a sale to deliver go to their supplier straight away, the same as a storefront order (paid, or
  // pay on delivery). Handed over in person means the seller already had it, so nothing is sent.
  if (input.delivery === "deliver") await ensureSupplierOrdersSafely(order.id);
  return order;
}
