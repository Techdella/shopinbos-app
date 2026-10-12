import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { MarketingError } from "./segments";
import { CUSTOMER_EVENTS, readTransactional, validSenderId, type CustomerEventSetting, type CustomerEvent, type TransactionalSettings } from "./text-channels";

// Per-store SMS/WhatsApp settings: SMS sender ID, the price of one SMS segment (for cost estimates), and which
// order and cart messages go to customers by WhatsApp or SMS (src/lib/notifications/customer-messages.ts).

export interface MessagingSettings {
  smsSenderId: string | null;
  smsCostPerSegment: number | null;
  transactional: TransactionalSettings;
}

/** The platform's price per SMS segment, when the seller hasn't set their own. */
function platformSmsCost() {
  const value = Number(process.env.SMS_COST_PER_SEGMENT);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function getMessagingSettings(storeId: string): Promise<MessagingSettings> {
  const row = await db.storeMessagingSettings.findUnique({ where: { storeId } }).catch(() => null);
  return {
    smsSenderId: row?.smsSenderId ?? null,
    smsCostPerSegment: row?.smsCostPerSegment ?? platformSmsCost(),
    transactional: readTransactional(row?.transactional),
  };
}

export interface MessagingSettingsInput {
  smsSenderId?: string | null;
  smsCostPerSegment?: number | null;
  transactional?: Partial<Record<CustomerEvent, Partial<CustomerEventSetting>>>;
}

export async function updateMessagingSettings(storeId: string, input: MessagingSettingsInput) {
  const current = await getMessagingSettings(storeId);
  const senderId = input.smsSenderId === undefined ? current.smsSenderId : input.smsSenderId?.trim() || null;
  if (senderId && !validSenderId(senderId)) throw new MarketingError("A sender ID is 3-11 letters or numbers (at least one letter), registered with your SMS provider.");
  const transactional = { ...current.transactional };
  for (const event of CUSTOMER_EVENTS) {
    const patch = input.transactional?.[event.key];
    if (!patch) continue;
    const next = { ...transactional[event.key], ...patch };
    if (next.templateId) {
      const template = await db.whatsAppTemplate.findFirst({ where: { id: next.templateId, storeId }, select: { id: true } });
      if (!template) throw new MarketingError(`The WhatsApp template chosen for "${event.label}" doesn't exist any more.`);
    }
    next.smsText = (next.smsText || event.sms).slice(0, 480);
    transactional[event.key] = next;
  }
  const cost = input.smsCostPerSegment === undefined ? undefined : input.smsCostPerSegment && input.smsCostPerSegment > 0 ? input.smsCostPerSegment : null;
  await db.storeMessagingSettings.upsert({
    where: { storeId },
    create: { storeId, smsSenderId: senderId, smsCostPerSegment: cost ?? null, transactional: transactional as unknown as Prisma.InputJsonValue },
    update: { smsSenderId: senderId, ...(cost !== undefined ? { smsCostPerSegment: cost } : {}), transactional: transactional as unknown as Prisma.InputJsonValue },
  });
  return getMessagingSettings(storeId);
}
