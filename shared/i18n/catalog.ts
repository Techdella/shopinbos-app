// Every message namespace, registered once. To add one: create messages/<area>/{en,pcm,yo,ha,ig}.ts plus an
// index.ts (copy any existing one), then add one import line and one entry below. See README.md.
import { createT, LOCALES, type Catalog, type Locale, type TFunction } from "./index.ts";
import common from "./messages/common/index.ts";
import nav from "./messages/nav/index.ts";
import settings from "./messages/settings/index.ts";
import learn from "./messages/learn/index.ts";
import glossary from "./messages/glossary/index.ts";
import intros from "./messages/intros/index.ts";
import supplier from "./messages/supplier/index.ts";
import logistics from "./messages/logistics/index.ts";
import rider from "./messages/rider/index.ts";
import verification from "./messages/verification/index.ts";
import marketing from "./messages/marketing/index.ts";
import emailBuilder from "./messages/emailBuilder/index.ts";
import automations from "./messages/automations/index.ts";
import inbox from "./messages/inbox/index.ts";
import social from "./messages/social/index.ts";
import ads from "./messages/ads/index.ts";
import video from "./messages/video/index.ts";
import affiliates from "./messages/affiliates/index.ts";
import analytics from "./messages/analytics/index.ts";
import reviews from "./messages/reviews/index.ts";
import discounts from "./messages/discounts/index.ts";
import peggy from "./messages/peggy/index.ts";
import rex from "./messages/rex/index.ts";
import auth from "./messages/auth/index.ts";

export const CATALOGS = {
  common,
  nav,
  settings,
  learn,
  glossary,
  intros,
  supplier,
  logistics,
  rider,
  verification,
  marketing,
  emailBuilder,
  automations,
  inbox,
  social,
  ads,
  video,
  affiliates,
  analytics,
  reviews,
  discounts,
  peggy,
  rex,
  auth,
} satisfies Record<string, Catalog>;

export type Namespace = keyof typeof CATALOGS;
export const NAMESPACES = Object.keys(CATALOGS) as Namespace[];
/** The keys of a namespace (from its English file); for a union of namespaces, every key of each. */
export type MessageKey<N extends Namespace> = N extends Namespace ? keyof (typeof CATALOGS)[N]["en"] & string : never;
/** The keys of several namespaces together. */
export type KeysOf<NS extends readonly Namespace[]> = MessageKey<NS[number]>;

/** A translate function over the given namespaces (earlier ones win on a shared key). */
export function tFor<const NS extends readonly Namespace[]>(locale: Locale, ...namespaces: NS): TFunction<KeysOf<NS>> {
  return createT<KeysOf<NS>>(locale, namespaces.map((namespace) => CATALOGS[namespace] as Catalog));
}

/** One language's messages per namespace, with English filling the gaps: what the web server hands the browser. */
export type MergedMessages = Partial<Record<Namespace, Record<string, string>>>;

export function mergedMessages(locale: Locale, namespaces: readonly Namespace[] = NAMESPACES): MergedMessages {
  const out: MergedMessages = {};
  for (const namespace of namespaces) {
    const catalog = CATALOGS[namespace] as Catalog;
    const own = locale === "en" ? {} : (catalog[locale] ?? {});
    const merged: Record<string, string> = { ...catalog.en };
    for (const [key, text] of Object.entries(own)) if (typeof text === "string" && text) merged[key] = text;
    out[namespace] = merged;
  }
  return out;
}

/** Turns merged messages back into catalogs createT understands (English slot holds the merged text). */
export function catalogsFromMerged(messages: MergedMessages, namespaces: readonly Namespace[]): Catalog[] {
  return namespaces.map((namespace) => ({ en: messages[namespace] ?? {} }));
}

export { LOCALES };
