// Every message namespace, registered once. To add one: create messages/<area>/{en,pcm,yo,ha,ig}.ts plus an
// index.ts (copy any existing one), then add one import line and one entry below. See README.md.
import { createT, LOCALES, type Catalog, type Locale, type TFunction } from "./index.ts";
import { mergeLocale, type MergedMessages } from "./merged.ts";
import { PURCHASE_CTA } from "../store-payments.ts";
import common from "./messages/common/index.ts";
import shell from "./messages/shell/index.ts";
import tour from "./messages/tour/index.ts";
import help from "./messages/help/index.ts";
import support from "./messages/support/index.ts";
import notifications from "./messages/notifications/index.ts";
import errors from "./messages/errors/index.ts";
import ui from "./messages/ui/index.ts";
import nav from "./messages/nav/index.ts";
import settings from "./messages/settings/index.ts";
import learn from "./messages/learn/index.ts";
import glossary from "./messages/glossary/index.ts";
import intros from "./messages/intros/index.ts";
import introTitles from "./messages/introTitles/index.ts";
import supplier from "./messages/supplier/index.ts";
import supplierJoin from "./messages/supplierJoin/index.ts";
import logistics from "./messages/logistics/index.ts";
import delivery from "./messages/delivery/index.ts";
import rider from "./messages/rider/index.ts";
import handoff from "./messages/handoff/index.ts";
import m_supplier from "./messages/m_supplier/index.ts";
import m_partner from "./messages/m_partner/index.ts";
import m_rider from "./messages/m_rider/index.ts";
import m_ui from "./messages/m_ui/index.ts";
import m_home from "./messages/m_home/index.ts";
import m_delivery from "./messages/m_delivery/index.ts";
import m_familiar from "./messages/m_familiar/index.ts";
import m_orders from "./messages/m_orders/index.ts";
import m_products from "./messages/m_products/index.ts";
import m_find from "./messages/m_find/index.ts";
import m_shop from "./messages/m_shop/index.ts";
import m_banner from "./messages/m_banner/index.ts";
import m_looks from "./messages/m_looks/index.ts";
import m_marketing from "./messages/m_marketing/index.ts";
import m_chats from "./messages/m_chats/index.ts";
import m_onboarding from "./messages/m_onboarding/index.ts";
import m_auth from "./messages/m_auth/index.ts";
import m_notifications from "./messages/m_notifications/index.ts";
import m_help from "./messages/m_help/index.ts";
import m_reviews from "./messages/m_reviews/index.ts";
import m_customers from "./messages/m_customers/index.ts";
import m_rex from "./messages/m_rex/index.ts";
import m_channels from "./messages/m_channels/index.ts";
import m_legal from "./messages/m_legal/index.ts";
import m_productedit from "./messages/m_productedit/index.ts";
import m_label from "./messages/m_label/index.ts";
import m_settings from "./messages/m_settings/index.ts";
import m_paylinks from "./messages/m_paylinks/index.ts";
import m_domain from "./messages/m_domain/index.ts";
import m_packaging from "./messages/m_packaging/index.ts";
import m_campaigns from "./messages/m_campaigns/index.ts";
import m_video from "./messages/m_video/index.ts";
import m_grow from "./messages/m_grow/index.ts";
import m_money from "./messages/m_money/index.ts";
import wallet from "./messages/wallet/index.ts";
import m_ads from "./messages/m_ads/index.ts";
import m_kyc from "./messages/m_kyc/index.ts";
import verification from "./messages/verification/index.ts";
import partnerKyc from "./messages/partnerKyc/index.ts";
import contracts from "./messages/contracts/index.ts";
import briefs from "./messages/briefs/index.ts";
import marketing from "./messages/marketing/index.ts";
import emailBuilder from "./messages/emailBuilder/index.ts";
import automations from "./messages/automations/index.ts";
import inbox from "./messages/inbox/index.ts";
import social from "./messages/social/index.ts";
import socialPosts from "./messages/socialPosts/index.ts";
import ads from "./messages/ads/index.ts";
import packaging from "./messages/packaging/index.ts";
import video from "./messages/video/index.ts";
import affiliates from "./messages/affiliates/index.ts";
import resell from "./messages/resell/index.ts";
import analytics from "./messages/analytics/index.ts";
import traffic from "./messages/traffic/index.ts";
import reviews from "./messages/reviews/index.ts";
import discounts from "./messages/discounts/index.ts";
import campaigns from "./messages/campaigns/index.ts";
import peggy from "./messages/peggy/index.ts";
import rex from "./messages/rex/index.ts";
import auth from "./messages/auth/index.ts";
import builder from "./messages/builder/index.ts";
import seo from "./messages/seo/index.ts";
import cms from "./messages/cms/index.ts";
import legal from "./messages/legal/index.ts";
import account from "./messages/account/index.ts";
import store from "./messages/store/index.ts";
import domain from "./messages/domain/index.ts";
import shopLink from "./messages/shopLink/index.ts";
import marketplace from "./messages/marketplace/index.ts";
import shipping from "./messages/shipping/index.ts";
import payments from "./messages/payments/index.ts";
import paylinks from "./messages/paylinks/index.ts";
import customers from "./messages/customers/index.ts";
import products from "./messages/products/index.ts";
import bundles from "./messages/bundles/index.ts";
import orders from "./messages/orders/index.ts";
import home from "./messages/home/index.ts";
import onboarding from "./messages/onboarding/index.ts";
import sellerStart from "./messages/sellerStart/index.ts";
import faults from "./messages/faults/index.ts";
import m_faults from "./messages/m_faults/index.ts";
import media from "./messages/media/index.ts";
import productTypes from "./messages/productTypes/index.ts";
import tips from "./messages/tips/index.ts";
import mail from "./messages/mail/index.ts";
import bulkAdd from "./messages/bulkAdd/index.ts";
import details from "./messages/details/index.ts";
import followers from "./messages/followers/index.ts";
import productVideos from "./messages/productVideos/index.ts";
import rexJobs from "./messages/rexJobs/index.ts";

export const CATALOGS = {
  common,
  shell,
  tour,
  help,
  support,
  notifications,
  errors,
  ui,
  nav,
  settings,
  learn,
  glossary,
  intros,
  introTitles,
  supplier,
  supplierJoin,
  logistics,
  delivery,
  rider,
  handoff,
  m_supplier,
  m_partner,
  m_rider,
  m_ui,
  m_home,
  m_delivery,
  m_familiar,
  m_orders,
  m_products,
  m_find,
  m_shop,
  m_banner,
  m_looks,
  m_marketing,
  m_chats,
  m_onboarding,
  m_auth,
  m_notifications,
  m_help,
  m_reviews,
  m_customers,
  m_rex,
  m_channels,
  m_legal,
  m_productedit,
  m_label,
  m_settings,
  m_paylinks,
  m_domain,
  m_packaging,
  m_campaigns,
  m_video,
  m_grow,
  m_money,
  wallet,
  m_ads,
  m_kyc,
  verification,
  partnerKyc,
  contracts,
  briefs,
  marketing,
  emailBuilder,
  automations,
  inbox,
  social,
  socialPosts,
  ads,
  packaging,
  video,
  affiliates,
  resell,
  analytics,
  traffic,
  reviews,
  discounts,
  campaigns,
  peggy,
  rex,
  auth,
  builder,
  seo,
  cms,
  legal,
  account,
  store,
  domain,
  shopLink,
  marketplace,
  shipping,
  payments,
  paylinks,
  customers,
  products,
  bundles,
  orders,
  home,
  onboarding,
  sellerStart,
  faults,
  m_faults,
  media,
  productTypes,
  tips,
  mail,
  bulkAdd,
  details,
  productVideos,
  rexJobs,
  followers,
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

// ── Pages the phone app opened (src/lib/app-session.ts) ───────────────────────
// App store rules: nothing there may say to upgrade, top up or buy credits. A message that is more than that ("You've
// reached the free plan limit for products. Upgrade to Supplier Max to add more.") loses its purchase sentences, in
// every language: the sentences dropped are the ones the English drops, by position. A message that is only a
// purchase prompt ("Upgrade to Pro") is a button or link label, and those are hidden on those pages, so it stays.

const SENTENCE_BREAK = /(?<=[.!?])\s+/;
const ICU_BRANCHES = /\{[^{}]*,\s*(plural|select)\b/;

/** One message for a page the phone app opened: `en` decides which sentences go, `text` is the language shown. */
export function storeSafeText(en: string, text: string): string {
  if (!PURCHASE_CTA.test(en) || ICU_BRANCHES.test(en)) return text;
  const english = en.split(SENTENCE_BREAK);
  const drop = english.map((sentence) => PURCHASE_CTA.test(sentence));
  if (drop.every(Boolean)) return text;
  const parts = text.split(SENTENCE_BREAK);
  if (parts.length === english.length) return parts.filter((_, index) => !drop[index]).join(" ");
  // The translation splits differently: its own purchase sentences if it has recognisable ones, else the English.
  const own = parts.filter((sentence) => !PURCHASE_CTA.test(sentence));
  return own.length && own.length < parts.length ? own.join(" ") : english.filter((_, index) => !drop[index]).join(" ");
}

const storeSafeCache = new WeakMap<Catalog, Catalog>();

/** A namespace catalog with storeSafeText applied to every message, every language (computed once). */
export function storeSafeCatalog(catalog: Catalog): Catalog {
  const cached = storeSafeCache.get(catalog);
  if (cached) return cached;
  const out: Record<string, Record<string, string>> = {};
  for (const locale of LOCALES) {
    const messages = (catalog as Partial<Record<Locale, Readonly<Partial<Record<string, string>>>>>)[locale];
    if (!messages) continue;
    const next: Record<string, string> = {};
    for (const [key, text] of Object.entries(messages)) {
      if (typeof text !== "string") continue;
      const en = catalog.en[key];
      next[key] = typeof en === "string" ? storeSafeText(en, text) : text;
    }
    out[locale] = next;
  }
  const safe = out as unknown as Catalog;
  storeSafeCache.set(catalog, safe);
  return safe;
}

function catalogOf(namespace: Namespace, storeSafe: boolean): Catalog {
  const catalog = CATALOGS[namespace] as Catalog;
  return storeSafe ? storeSafeCatalog(catalog) : catalog;
}

/** tFor for a page the phone app opened (storeSafe) or any other page. */
export function tForPage<const NS extends readonly Namespace[]>(locale: Locale, storeSafe: boolean, ...namespaces: NS): TFunction<KeysOf<NS>> {
  return createT<KeysOf<NS>>(locale, namespaces.map((namespace) => catalogOf(namespace, storeSafe)));
}

export type { MergedMessages } from "./merged.ts";
export { catalogsFromMerged } from "./merged.ts";

export function mergedMessages(locale: Locale, namespaces: readonly Namespace[] = NAMESPACES, options: { storeSafe?: boolean } = {}): MergedMessages {
  const out: MergedMessages = {};
  for (const namespace of namespaces) {
    const catalog = catalogOf(namespace, options.storeSafe ?? false);
    out[namespace] = mergeLocale(catalog.en as Record<string, string>, locale === "en" ? null : (catalog[locale] as Record<string, string> | undefined));
  }
  return out;
}

export { LOCALES };
