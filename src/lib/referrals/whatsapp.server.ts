import "server-only";

import { metaTemplates, metaWhatsAppConfig, sendMetaTemplate } from "@/lib/lead-growth/whatsapp-meta.server";
import { memberTemplateFor, memberTemplateImageUrl } from "@/lib/member-messaging/whatsapp-templates";
import type { Locale } from "@shared/i18n";

// Referral messages on WhatsApp (approved templates only: these go to people who may not have messaged us in the
// last 24 hours). The bell, push and email go through notify() regardless; WhatsApp is extra, so a template that
// isn't approved yet, or a number that can't get WhatsApp, is logged and skipped.

const TEMPLATE = { joined: "shopinbos_referral_joined", reward: "shopinbos_referral_reward", welcome: "shopinbos_referral_welcome" } as const;

/** Sends it in the person's language when that template is approved (else English); `params` fills it in that language. */
export async function sendReferralWhatsApp(kind: keyof typeof TEMPLATE, phone: string | null | undefined, locale: Locale, params: (locale: Locale) => string[]) {
  const config = metaWhatsAppConfig();
  if (!config || !phone || phone.replace(/\D/g, "").length < 10) return false;
  const list = locale === "en" ? null : await metaTemplates(config).catch(() => null);
  const approved = new Set(list?.ok ? list.templates.filter((t) => t.status === "APPROVED").map((t) => t.name) : []);
  const picked = memberTemplateFor(TEMPLATE[kind], locale, approved);
  if (!picked) return false;
  const template = picked.template;
  const result = await sendMetaTemplate(config, {
    to: phone,
    template: template.name,
    language: template.language,
    params: params(picked.locale).map((value) => value.replace(/\s+/g, " ").trim().slice(0, 200) || "-"),
    headerImage: memberTemplateImageUrl(template),
  }).catch((error) => ({ ok: false as const, error: error instanceof Error ? error.message : "send failed" }));
  if (!result.ok) console.warn(`[referrals] WhatsApp ${template.name} not sent: ${result.error}`);
  return result.ok;
}
