import "server-only";

import { db } from "@/lib/db/client";
import { getMessagingSettings, updateMessagingSettings } from "./messaging-settings";
import { ORDER_MESSAGE_EVENTS_ON, ORDER_MESSAGE_PRESETS, presetTemplate, readTemplateContent, type CustomerEvent, type CustomerEventSetting } from "./text-channels";
import { draftFromPreset, submitWhatsAppTemplate, syncWhatsAppTemplates, wabaAccess } from "./whatsapp-templates.server";

// WhatsApp order messages without any setup: when a store connects WhatsApp (src/lib/inbox/connect.ts), the
// ready-made utility templates (order confirmed, shipped with tracking, delivered) are created on the store's own
// WhatsApp Business Account and sent to Meta, and those order events are switched on. Meta reviews utility
// templates automatically, usually within minutes; until one is approved the event is recorded as "not sent"
// on Marketing › Order messages, and src/lib/notifications/customer-messages.ts re-checks a pending template
// with Meta before each send, so the first order after approval goes out. Running it again is safe: templates
// already approved or waiting are left alone, and the seller's own on/off choices are only set the first time.

const LIVE = new Set(["APPROVED", "PENDING", "IN_APPEAL"]);

export interface OrderMessagesSetup {
  ok: boolean;
  error?: string;
  templates: Array<{ preset: string; name: string; status: string; error?: string }>;
  switchedOn: CustomerEvent[];
}

export async function setUpWhatsAppOrderMessages(storeId: string): Promise<OrderMessagesSetup> {
  const access = await wabaAccess(storeId);
  if (!access.ok) return { ok: false, error: access.error, templates: [], switchedOn: [] };

  const before = await db.whatsAppTemplate.count({ where: { storeId, preset: { in: [...ORDER_MESSAGE_PRESETS] } } });
  // Templates already on the WhatsApp account (made earlier, or before a reconnect) come in first, so we reuse
  // them instead of submitting a second copy Meta would refuse as a duplicate name.
  await syncWhatsAppTemplates(storeId).catch(() => null);

  const templates: OrderMessagesSetup["templates"] = [];
  for (const key of ORDER_MESSAGE_PRESETS) {
    const preset = presetTemplate(key)!;
    // A copy synced from Meta with exactly our wording becomes the ready-made one (it has no mapping yet).
    const adopt = await db.whatsAppTemplate.findFirst({ where: { storeId, preset: null, name: preset.name, language: "en" } });
    if (adopt && readTemplateContent(adopt.components).body === preset.content.body) {
      await db.whatsAppTemplate.update({ where: { id: adopt.id }, data: { preset: key, variables: [...preset.variables] } });
    }
    const rows = await db.whatsAppTemplate.findMany({ where: { storeId, preset: key }, orderBy: { updatedAt: "desc" } });
    const live = rows.find((row) => LIVE.has(row.status));
    if (live) {
      templates.push({ preset: key, name: live.name, status: live.status });
      continue;
    }
    const draft = rows.find((row) => row.status === "DRAFT" || row.status === "LOCAL_ERROR") ?? (await draftFromPreset(storeId, key).catch(() => null));
    if (!draft) {
      templates.push({ preset: key, name: preset.name, status: "LOCAL_ERROR", error: "Couldn't create the template." });
      continue;
    }
    try {
      const submitted = await submitWhatsAppTemplate(storeId, draft.id);
      templates.push({ preset: key, name: submitted.name, status: submitted.status });
    } catch (error) {
      templates.push({ preset: key, name: draft.name, status: "LOCAL_ERROR", error: error instanceof Error ? error.message : String(error) });
    }
  }

  // First time only: switch the order events on for WhatsApp. Later runs keep whatever the seller chose.
  const switchedOn: CustomerEvent[] = [];
  if (before === 0) {
    const current = (await getMessagingSettings(storeId)).transactional;
    const patch: Partial<Record<CustomerEvent, Partial<CustomerEventSetting>>> = {};
    for (const event of ORDER_MESSAGE_EVENTS_ON) {
      if (current[event].whatsapp) continue;
      patch[event] = { whatsapp: true };
      switchedOn.push(event);
    }
    if (switchedOn.length) await updateMessagingSettings(storeId, { transactional: patch });
  }

  return { ok: templates.some((t) => LIVE.has(t.status)), templates, switchedOn };
}
