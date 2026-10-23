// Member messages in each person's app language (User.preferences.language): the mail wording
// (shared/i18n/messages/mail), the 40 weekly tips and the WhatsApp templates (./<lang>.ts). English is the source;
// anything missing in a language falls back to English. Pure (relative imports), tested in tests/member-i18n.test.mjs.

import { DEFAULT_LOCALE, isLocale, type Locale } from "../../../../shared/i18n/index.ts";
import type { Tip, TipText } from "../tips-library.ts";
import type { TemplateText } from "../whatsapp-templates.ts";
import * as pcm from "./pcm.ts";
import * as yo from "./yo.ts";
import * as ha from "./ha.ts";
import * as ig from "./ig.ts";

export { mailT, type MailKey, type MailT } from "../../../../shared/i18n/mail.ts";

export const MEMBER_TRANSLATIONS: Record<Exclude<Locale, "en">, { tips: Record<string, TipText>; templates: Record<string, TemplateText> }> = { pcm, yo, ha, ig };

/** A person's language from User.preferences (the same field the app's language picker saves), else English. */
export function memberLocale(preferences: unknown): Locale {
  const value = preferences && typeof preferences === "object" ? (preferences as { language?: unknown }).language : undefined;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** The tip in this language (English when it isn't translated yet). Ids, topic, sender and link never change. */
export function localizedTip(tip: Tip, locale: Locale): Tip {
  if (locale === "en") return tip;
  const text = MEMBER_TRANSLATIONS[locale]?.tips[tip.id];
  if (!text || text.points.length !== tip.points.length) return tip;
  return { ...tip, ...text, example: tip.example ? text.example ?? tip.example : undefined, cta: { label: text.cta, path: tip.cta.path } };
}

/** A template's words in this language, or null (send the English template). */
export function templateText(name: string, locale: Locale): TemplateText | null {
  return locale === "en" ? null : MEMBER_TRANSLATIONS[locale]?.templates[name] ?? null;
}

/** Meta's language code for a translated template: Hausa has its own; Meta has none for Pidgin, Yorùbá or Igbo. */
export function metaLanguage(locale: Locale) {
  return locale === "ha" ? "ha" : "en";
}

/** The name a translated template is submitted under ("shopinbos_tip_seller_yo"); English keeps the plain name. */
export function localizedTemplateName(name: string, locale: Locale) {
  return locale === "en" ? name : `${name}_${locale}`;
}
