import "server-only";

import { metaWhatsAppConfig, sendMetaTemplate } from "@/lib/lead-growth/whatsapp-meta.server";
import { memberTemplate, memberTemplateImageUrl } from "./whatsapp-templates";

/**
 * Sends one of Shopinbos's own approved WhatsApp templates (whatsapp-templates.ts) from the Shopinbos number. Extra to
 * email and the bell: a template Meta hasn't approved yet, or a number without WhatsApp, is logged and skipped.
 */
export async function sendShopinbosTemplate(name: string, phone: string | null | undefined, params: string[], buttonUrlSuffix?: string | null) {
  const config = metaWhatsAppConfig();
  const template = memberTemplate(name);
  if (!config || !template || !phone || phone.replace(/\D/g, "").length < 10) return false;
  const result = await sendMetaTemplate(config, {
    to: phone,
    template: template.name,
    language: template.language,
    // Meta refuses variables with line breaks, tabs or long runs of spaces.
    params: params.map((value) => value.replace(/\s+/g, " ").trim().slice(0, 900) || "-"),
    headerImage: memberTemplateImageUrl(template),
    buttonUrlSuffix: buttonUrlSuffix ?? null,
  }).catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : "send failed" }));
  if (!result.ok) console.warn(`[whatsapp] ${template.name} not sent: ${result.error}`);
  return result.ok;
}
