import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { billingEmail } from "@/lib/auth/billing-email";
import { initializePaystackTransaction, verifyPaystackTransaction } from "@/lib/paystack";
import { buildPlatformEmail } from "@/lib/email/compliance.server";
import { html } from "@/lib/email/shell";
import { sendEmail } from "@/lib/notifications/resend";
import { supportInbox } from "@/lib/support/email.server";
import { appOrigin } from "@/lib/ads";
import { cleanDesign, PACK_FORMAT_INFO } from "@shared/packaging";
import { DELIVERY_ZONES, PRINT_ORDER_REFERENCE_PREFIX, quotePrint, type PrintOrderInput } from "@shared/print-orders";

// Ordering prints of a saved packaging design: the price is worked out here from the saved design (never trusted
// from the browser), the design is frozen into the order, the seller pays with Paystack, and the team prints it
// from /admin/print-orders.

export class PrintOrderError extends Error {}

export async function createPrintOrder(input: { user: { id: string; email: string | null }; storeId: string; order: PrintOrderInput }) {
  const row = await db.printDesign.findFirst({ where: { id: input.order.designId, storeId: input.storeId, kind: "packaging" } });
  if (!row) throw new PrintOrderError("That design isn't here any more. Save it again and retry.");
  const design = cleanDesign(row.data);
  const quote = quotePrint({ format: design.format, size: design.size, quantity: input.order.quantity, material: input.order.material, finish: input.order.finish, zone: input.order.zone });
  if (input.order.zone !== "pickup" && (!input.order.address?.trim() || !input.order.city?.trim())) throw new PrintOrderError("Add the delivery address and city.");
  const reference = `${PRINT_ORDER_REFERENCE_PREFIX}${crypto.randomUUID()}`;
  const order = await db.printOrder.create({
    data: {
      storeId: input.storeId,
      userId: input.user.id,
      designId: row.id,
      title: row.title,
      format: design.format,
      design: design as unknown as Prisma.InputJsonValue,
      previewUrl: row.previewUrl,
      quantity: quote.quantity,
      material: quote.material.name,
      finish: quote.finish.name,
      unitPrice: quote.unitPrice,
      setupFee: quote.setupFee,
      deliveryFee: quote.deliveryFee,
      total: quote.total,
      days: quote.days,
      zone: input.order.zone,
      contactName: input.order.contactName,
      contactPhone: input.order.contactPhone,
      contactEmail: input.user.email,
      address: input.order.address ?? null,
      city: input.order.city ?? null,
      state: input.order.state ?? null,
      notes: input.order.notes ?? null,
      paymentRef: reference,
    },
  });
  const callback = new URL("/api/app/print-orders/callback", appOrigin());
  const session = await initializePaystackTransaction({
    email: billingEmail(input.user),
    amountKobo: quote.total * 100,
    reference,
    callbackUrl: callback.toString(),
    metadata: { purpose: "print_order", order_id: order.id, user_id: input.user.id },
  });
  return { id: order.id, authorizationUrl: session.authorization_url };
}

/** Marks a verified payment once (callback and webhook may both call this) and tells the team. */
export async function completePrintOrderPayment(reference: string): Promise<"paid" | "failed" | "pending"> {
  const row = await db.printOrder.findUnique({ where: { paymentRef: reference } });
  if (!row) return "failed";
  if (row.paidAt) return "paid";
  const verified = await verifyPaystackTransaction(reference);
  if (verified.status !== "success") return verified.status === "abandoned" || verified.status === "failed" ? "failed" : "pending";
  if (Number(verified.amount) < row.total * 100) return "failed";
  const updated = await db.printOrder.updateMany({ where: { id: row.id, paidAt: null }, data: { paidAt: new Date(), status: "paid" } });
  if (updated.count) await notifyTeam(row.id).catch((error) => console.error("[print-orders] team email failed", error));
  return "paid";
}

const naira = (n: number) => `₦${n.toLocaleString("en-NG")}`;

async function notifyTeam(id: string) {
  const row = await db.printOrder.findUnique({ where: { id } });
  if (!row) return;
  const store = await db.store.findUnique({ where: { id: row.storeId }, select: { name: true, slug: true } });
  const zone = DELIVERY_ZONES.find((item) => item.id === row.zone)?.name ?? row.zone;
  const body = buildPlatformEmail({
    kind: "transactional",
    eyebrow: "Print order",
    heading: `${store?.name ?? "A seller"} paid ${naira(row.total)} for ${row.quantity.toLocaleString("en-NG")} × ${PACK_FORMAT_INFO[row.format as keyof typeof PACK_FORMAT_INFO]?.name ?? row.format}`,
    preheader: row.title,
    bodyHtml: html.list([
      `Design: ${row.title}`,
      `Material: ${row.material} · Finish: ${row.finish}`,
      `Delivery: ${zone}${row.address ? ` · ${row.address}, ${row.city ?? ""} ${row.state ?? ""}` : ""}`,
      `Contact: ${row.contactName} · ${row.contactPhone}`,
      row.notes ? `Notes: ${row.notes}` : "",
      `Promised in about ${row.days} working days.`,
    ].filter(Boolean)),
    cta: { label: "Open print orders", url: `${appOrigin()}/admin/print-orders` },
    reason: "you're on the Shopinbos print team",
  }).html;
  await sendEmail({ to: [process.env.PRINT_TEAM_EMAIL?.trim() || process.env.PACKAGING_TEAM_EMAIL?.trim() || supportInbox()], subject: `Print order: ${row.title} (${store?.name ?? "store"})`, html: body, replyTo: row.contactEmail ?? undefined });
}

/** Tells the seller their prints are on the way (or delivered). */
export async function notifySellerOfStatus(id: string) {
  const row = await db.printOrder.findUnique({ where: { id } });
  if (!row?.contactEmail || (row.status !== "shipped" && row.status !== "delivered")) return;
  const shipped = row.status === "shipped";
  const body = buildPlatformEmail({
    kind: "transactional",
    eyebrow: "Your prints",
    heading: shipped ? `Your ${row.title} prints are on the way` : `Your ${row.title} prints were delivered`,
    preheader: shipped ? "Track them from Labels and print." : "Thank you for printing with Shopinbos.",
    bodyHtml: html.list([`${row.quantity.toLocaleString("en-NG")} pieces · ${row.material}`, row.tracking ? `Tracking: ${row.tracking}` : ""].filter(Boolean)),
    cta: { label: "See your print orders", url: `${appOrigin()}/home/labels/orders` },
    reason: "you ordered prints on Shopinbos",
  }).html;
  await sendEmail({ to: [row.contactEmail], subject: shipped ? "Your prints are on the way" : "Your prints were delivered", html: body });
}
