import "server-only";

import { metaTemplates, metaWhatsAppConfig, submitTemplateWithImage, type MetaTemplateStatus } from "@/lib/lead-growth/whatsapp-meta.server";
import { MEMBER_TEMPLATES, memberTemplateImageUrl, memberTemplatePayload } from "./whatsapp-templates";

// Members' WhatsApp templates on Meta: their approval status, and submitting the ones Meta doesn't have yet. Part of
// "Submit all" in Admin › Leads › WhatsApp, and the button in Admin › Referrals.

export async function memberTemplateStatuses(): Promise<{ ok: true; byName: Map<string, MetaTemplateStatus> } | { ok: false; error: string }> {
  const config = metaWhatsAppConfig();
  if (!config) return { ok: false, error: "Connect the WhatsApp number first." };
  const list = await metaTemplates(config);
  if (!list.ok) return list;
  return { ok: true, byName: new Map(list.templates.map((t) => [`${t.name}:${t.language}`, t])) };
}

export async function submitMemberTemplates(): Promise<{ submitted: number; failures: string[] }> {
  const config = metaWhatsAppConfig();
  if (!config?.wabaId) return { submitted: 0, failures: ["Set WHATSAPP_LEADS_WABA_ID to submit templates."] };
  const existing = await metaTemplates(config);
  if (!existing.ok) return { submitted: 0, failures: [existing.error] };
  const have = new Set(existing.templates.map((t) => `${t.name}:${t.language}`));
  let submitted = 0;
  const failures: string[] = [];
  for (const template of MEMBER_TEMPLATES.filter((t) => !have.has(`${t.name}:${t.language}`))) {
    const result = await submitTemplateWithImage(config, memberTemplateImageUrl(template), (handle) => memberTemplatePayload(template, handle));
    if (result.ok) submitted += 1;
    else failures.push(`${template.name}: ${result.error}`);
  }
  return { submitted, failures };
}
