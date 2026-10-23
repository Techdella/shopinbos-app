import "server-only";

import { metaWhatsAppConfig, sendMetaTemplate } from "@/lib/lead-growth/whatsapp-meta.server";
import { memberTemplate, memberTemplateImageUrl } from "@/lib/member-messaging/whatsapp-templates";

// Referral messages on WhatsApp (approved templates only: these go to people who may not have messaged us in the
// last 24 hours). The bell, push and email go through notify() regardless; WhatsApp is extra, so a template that
// isn't approved yet, or a number that can't get WhatsApp, is logged and skipped.

const TEMPLATE = { joined: "shopinbos_referral_joined", reward: "shopinbos_referral_reward", welcome: "shopinbos_referral_welcome" } as const;

export async function sendReferralWhatsApp(kind: keyof typeof TEMPLATE, phone: string | null | undefined, params: string[]) {
  const config = metaWhatsAppConfig();
  const template = memberTemplate(TEMPLATE[kind]);
  if (!config || !template || !phone || phone.replace(/\D/g, "").length < 10) return false;
  const result = await sendMetaTemplate(config, {
    to: phone,
    template: template.name,
    language: template.language,
    params: params.map((value) => value.replace(/\s+/g, " ").trim().slice(0, 200) || "-"),
    headerImage: memberTemplateImageUrl(template),
  }).catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : "send failed" }));
  if (!result.ok) console.warn(`[referrals] WhatsApp ${template.name} not sent: ${result.error}`);
  return result.ok;
}
