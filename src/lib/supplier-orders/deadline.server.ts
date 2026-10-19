import "server-only";
import { db } from "@/lib/db/client";
import { sendSms, sendWhatsAppMessage } from "@/lib/notifications/service";
import { acceptDeadline, acceptHours, hoursInWords, type SupplierOrderKind } from "@shared/supplier-pickup";

// The deadline a new supplier order gets, and the short phone message suppliers get about it. Used when orders
// are created (service.server.ts, wholesale.server.ts) and by the acceptance cron (acceptance.server.ts).

export function supplierAcceptHours(kind: SupplierOrderKind, supplier?: { acceptHoursDropship?: number | null; acceptHoursWholesale?: number | null } | null) {
  return acceptHours(
    kind,
    { dropship: process.env.SUPPLIER_ACCEPT_HOURS_DROPSHIP, wholesale: process.env.SUPPLIER_ACCEPT_HOURS_WHOLESALE },
    kind === "dropship" ? supplier?.acceptHoursDropship : supplier?.acceptHoursWholesale,
  );
}

/** When a new order of this kind for this supplier must be accepted by. */
export function acceptByFor(kind: SupplierOrderKind, supplier: { acceptHoursDropship?: number | null; acceptHoursWholesale?: number | null } | null | undefined, from = new Date()) {
  const hours = supplierAcceptHours(kind, supplier);
  return { acceptBy: acceptDeadline(from, hours), hours, words: hoursInWords(hours) };
}

/**
 * A short WhatsApp message (or SMS when WhatsApp isn't set up) to the supplier's number, where the platform has a
 * provider. Never throws; in-app and email notifications are the main channel.
 */
export async function messageSupplierPhone(supplierId: string, text: string) {
  try {
    const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { whatsappNumber: true, user: { select: { phone: true } } } });
    const whatsapp = supplier?.whatsappNumber?.trim();
    const phone = supplier?.user.phone?.trim() || whatsapp;
    if (whatsapp) {
      const sent = await sendWhatsAppMessage({ to: [whatsapp], message: text }).catch(() => null);
      if (sent?.success) return "whatsapp";
    }
    if (phone) {
      const sent = await sendSms({ to: [phone], message: text.slice(0, 300) }).catch(() => null);
      if (sent?.success) return "sms";
    }
  } catch (error) {
    console.warn(`[supplier acceptance] could not message supplier ${supplierId}`, error);
  }
  return null;
}

