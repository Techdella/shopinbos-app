import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { readJson } from "@/lib/inbox/channels/types";
import { whatsappError, whatsappGraphBase } from "@/lib/inbox/channels/whatsapp";
import { storeUrl } from "./brand";
import { getMessagingSettings, updateMessagingSettings } from "./messaging-settings";
import {
  DELIVERY_MESSAGE_EVENTS_ON,
  DELIVERY_MESSAGE_PRESETS,
  LIBRARY_USECASES,
  ORDER_MESSAGE_EVENTS_ON,
  ORDER_MESSAGE_PRESETS,
  planLibraryTemplate,
  presetTemplate,
  readTemplateContent,
  type CustomerEvent,
  type CustomerEventSetting,
  type LibraryTemplate,
} from "./text-channels";
import { draftFromPreset, submitWhatsAppTemplate, syncWhatsAppTemplates, wabaAccess, type WabaAccess } from "./whatsapp-templates.server";

// WhatsApp order messages without any setup: when a store connects WhatsApp (src/lib/inbox/connect.ts), the
// order templates (order confirmed, shipped with tracking, delivered) are created on the store's own WhatsApp
// Business Account and those order events are switched on. Each one comes from Meta's Template Library when a
// library template fits (approved the moment it's created); otherwise our own ready-made wording is sent for
// review, which Meta does automatically for utility templates, usually within minutes. Until one is approved the
// event is recorded as "not sent"
// on Marketing › Order messages, and src/lib/notifications/customer-messages.ts re-checks a pending template
// with Meta before each send, so the first order after approval goes out. Running it again is safe: templates
// already approved or waiting are left alone, and the seller's own on/off choices are only set the first time.
// The delivery partner updates (booked, out for delivery with the code, at the pickup point, a problem) go in with
// them in our own wording (no library template has a delivery code); a store set up before they existed gets them
// the next time this runs (the "Set up" card on Marketing › Order messages comes back until they're there), and
// their events are switched on the first time their own templates are made.

const LIVE = new Set(["APPROVED", "PENDING", "IN_APPEAL"]);

export interface OrderMessagesSetup {
  ok: boolean;
  error?: string;
  templates: Array<{ preset: string; name: string; status: string; error?: string; library?: boolean }>;
  switchedOn: CustomerEvent[];
}

export async function setUpWhatsAppOrderMessages(storeId: string): Promise<OrderMessagesSetup> {
  const access = await wabaAccess(storeId);
  if (!access.ok) return { ok: false, error: access.error, templates: [], switchedOn: [] };

  const store = await db.store.findUnique({ where: { id: storeId }, select: { slug: true, customDomain: true } });
  if (!store) return { ok: false, error: "Store not found", templates: [], switchedOn: [] };
  const before = await db.whatsAppTemplate.count({ where: { storeId, preset: { in: [...ORDER_MESSAGE_PRESETS] } } });
  const deliveryBefore = await db.whatsAppTemplate.count({ where: { storeId, preset: { in: [...DELIVERY_MESSAGE_PRESETS] } } });
  // Templates already on the WhatsApp account (made earlier, or before a reconnect) come in first, so we reuse
  // them instead of submitting a second copy Meta would refuse as a duplicate name.
  await syncWhatsAppTemplates(storeId).catch(() => null);

  const templates: OrderMessagesSetup["templates"] = [];
  for (const key of [...ORDER_MESSAGE_PRESETS, ...DELIVERY_MESSAGE_PRESETS]) {
    const preset = presetTemplate(key)!;
    const libraryKey = (ORDER_MESSAGE_PRESETS as readonly string[]).includes(key) ? (key as (typeof ORDER_MESSAGE_PRESETS)[number]) : null;
    // A copy synced from Meta with exactly our wording becomes the ready-made one (it has no mapping yet).
    const adopt = await db.whatsAppTemplate.findFirst({ where: { storeId, preset: null, name: preset.name, language: "en" } });
    if (adopt && readTemplateContent(adopt.components).body === preset.content.body) {
      await db.whatsAppTemplate.update({ where: { id: adopt.id }, data: { preset: key, variables: [...preset.variables] } });
    }
    const rows = await db.whatsAppTemplate.findMany({ where: { storeId, preset: key }, orderBy: { updatedAt: "desc" } });
    const live = rows.find((row) => row.status === "APPROVED") ?? rows.find((row) => LIVE.has(row.status));
    // Not approved yet: a library template is (instantly). A pending one of ours stays as a fallback.
    if (libraryKey && live?.status !== "APPROVED") {
      const library = await createFromLibrary(storeId, access.access, libraryKey, store).catch((error) => {
        console.warn(`[whatsapp] template library for ${key}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
      if (library) {
        templates.push({ preset: key, name: library.name, status: library.status, library: true });
        continue;
      }
    }
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
  const events = [...(before === 0 ? ORDER_MESSAGE_EVENTS_ON : []), ...(deliveryBefore === 0 ? DELIVERY_MESSAGE_EVENTS_ON : [])];
  if (events.length) {
    const current = (await getMessagingSettings(storeId)).transactional;
    const patch: Partial<Record<CustomerEvent, Partial<CustomerEventSetting>>> = {};
    for (const event of events) {
      if (current[event].whatsapp) continue;
      patch[event] = { whatsapp: true };
      switchedOn.push(event);
    }
    if (switchedOn.length) await updateMessagingSettings(storeId, { transactional: patch });
  }

  return { ok: templates.some((t) => LIVE.has(t.status)), templates, switchedOn };
}

/** GET /message_template_library?usecase=…&language=en_US, every page we need (a handful of templates each). */
async function libraryTemplates(accessToken: string, usecase: string): Promise<LibraryTemplate[]> {
  const params = new URLSearchParams({ usecase, language: "en_US", limit: "50" });
  const res = await fetch(`${whatsappGraphBase()}/message_template_library?${params}`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res) throw new Error("Couldn't reach Meta's template library");
  const json = await readJson(res);
  if (!res.ok) throw new Error(whatsappError(json, "Meta's template library didn't answer"));
  return Array.isArray(json.data) ? (json.data as LibraryTemplate[]) : [];
}

/**
 * Creates the store's order template from Meta's Template Library: the first library template under the preset's
 * use cases whose blanks are all order details we have. Returns the saved row, or null when none fits (or Meta
 * didn't approve it straight away, in which case our own wording is used instead).
 */
async function createFromLibrary(storeId: string, access: WabaAccess, key: (typeof ORDER_MESSAGE_PRESETS)[number], store: { slug: string; customDomain: string | null }) {
  const already = await db.whatsAppTemplate.findFirst({ where: { storeId, preset: key, name: { startsWith: `${presetTemplate(key)!.name}_quick` } }, orderBy: { updatedAt: "desc" } });
  if (already) return already.status === "APPROVED" ? already : null;
  const orderPageBase = storeUrl(store, "/order");
  for (const usecase of LIBRARY_USECASES[key]) {
    for (const candidate of await libraryTemplates(access.accessToken, usecase)) {
      const plan = planLibraryTemplate(candidate, orderPageBase);
      if (!plan) continue;
      let name = `${presetTemplate(key)!.name}_quick`;
      for (let i = 2; await db.whatsAppTemplate.findFirst({ where: { storeId, name, language: "en_US" }, select: { id: true } }); i++) name = `${presetTemplate(key)!.name}_quick_${i}`;
      const res = await fetch(`${whatsappGraphBase()}/${encodeURIComponent(access.wabaId)}/message_templates`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category: "UTILITY",
          language: "en_US",
          library_template_name: plan.libraryName,
          ...(plan.buttonInputs.length ? { library_template_button_inputs: JSON.stringify(plan.buttonInputs) } : {}),
        }),
        signal: AbortSignal.timeout(20_000),
      }).catch(() => null);
      if (!res) throw new Error("Couldn't reach Meta to create the template");
      const json = await readJson(res);
      if (!res.ok) {
        console.warn(`[whatsapp] library template ${plan.libraryName}: ${whatsappError(json, "refused")}`);
        continue;
      }
      const status = typeof json.status === "string" ? json.status.toUpperCase() : "PENDING";
      const row = await db.whatsAppTemplate.create({
        data: {
          storeId,
          name,
          language: "en_US",
          category: "UTILITY",
          components: plan.content as unknown as Prisma.InputJsonValue,
          variables: plan.variables as unknown as Prisma.InputJsonValue,
          status,
          metaId: typeof json.id === "string" ? json.id : null,
          preset: key,
          submittedAt: new Date(),
          syncedAt: new Date(),
        },
      });
      // One try per store: a library template Meta didn't approve on the spot is kept (it may still be), and our
      // own wording goes in as well.
      return status === "APPROVED" ? row : null;
    }
  }
  return null;
}
