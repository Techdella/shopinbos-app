import "server-only";

import { db } from "@/lib/db/client";
import { getPublicEnv } from "@/lib/env";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { findLegalPage, legalPagePath, legalPageStatus } from "@/lib/legal/pages";
import { emailBrand, type MarketingStore } from "@/lib/marketing/brand";
import { sendEmail, type EmailSendResult } from "@/lib/notifications/resend";
import {
  SHOPINBOS_LEGAL_DEFAULTS,
  formatPostalAddress,
  hasPostalAddress,
  listUnsubscribeHeaders,
  platformEmail,
  readBusinessAddress,
  unsubscribeMailto,
  type EmailKind,
  type PlatformLegal,
  type StoreSender,
} from "./shell";
import { emailLinks, type EmailLinks } from "./tokens";
import { platformEmailAllowed } from "./preferences.server";
import type { PlatformTopic } from "./preferences";

// Server glue for the email shell: who Shopinbos is (legal footer), what a store's footer says (business name,
// address, contact and privacy links), signed preference links, and sendPlatformEmail for Shopinbos's own notices.

export function appBase() {
  return getPublicEnv().appUrl.replace(/\/+$/, "");
}

/** Shopinbos's legal name and postal address for (A) footers. Env overrides the built-in details. */
export function platformLegal(): PlatformLegal {
  return {
    name: process.env.SHOPINBOS_LEGAL_NAME?.trim() || SHOPINBOS_LEGAL_DEFAULTS.name,
    address: process.env.SHOPINBOS_POSTAL_ADDRESS?.trim() || SHOPINBOS_LEGAL_DEFAULTS.address,
  };
}

export type SenderStore = Pick<MarketingStore, "id" | "name" | "slug" | "customDomain" | "logoUrl" | "brandSettings"> & Partial<Pick<MarketingStore, "status" | "currency">>;

export const SENDER_STORE_SELECT = { id: true, name: true, slug: true, customDomain: true, logoUrl: true, brandSettings: true, status: true, currency: true } as const;

/** The store as an email sender: header logo, footer business details, contact and privacy links, button colour. */
export function storeSender(store: SenderStore): StoreSender & { hasAddress: boolean } {
  const address = readBusinessAddress(store.brandSettings);
  const website = buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain });
  const base = website.replace(/\/+$/, "");
  const published = (key: string) => {
    const page = findLegalPage(store.brandSettings, key);
    return page && legalPageStatus(page) === "published";
  };
  const contactUrl = address.email ? `mailto:${address.email}` : published("contact-information") ? `${base}${legalPagePath("contact-information")}` : website;
  const brand = emailBrand({ status: "active", currency: "NGN", ...store });
  return {
    name: store.name,
    legalName: address.legalName || store.name,
    logoUrl: store.logoUrl,
    address: formatPostalAddress(address),
    hasAddress: hasPostalAddress(address),
    websiteUrl: website,
    contactUrl,
    privacyUrl: published("privacy-policy") ? `${base}${legalPagePath("privacy-policy")}` : `${base}/policies`,
    accent: brand.accent,
  };
}

export async function loadStoreSender(storeId: string) {
  const store = await db.store.findUnique({ where: { id: storeId }, select: SENDER_STORE_SELECT });
  return store ? storeSender(store) : null;
}

export function contactLinks(storeId: string, email: string): EmailLinks | null {
  try {
    return emailLinks(appBase(), { kind: "contact", storeId, email });
  } catch {
    return null; // no signing secret configured
  }
}

export function userLinks(userId: string): EmailLinks | null {
  try {
    return emailLinks(appBase(), { kind: "user", userId });
  } catch {
    return null;
  }
}

/** The List-Unsubscribe headers for a signed link (plus mailto when UNSUBSCRIBE_MAILTO names a processed inbox). */
export function unsubscribeHeaders(links: Pick<EmailLinks, "oneClick" | "token">) {
  return listUnsubscribeHeaders(links.oneClick, unsubscribeMailto(process.env.UNSUBSCRIBE_MAILTO, links.token));
}

const ROLE_REASON: Record<string, string> = {
  seller: "you have a Shopinbos seller account",
  supplier: "you have a Shopinbos supplier account",
  logistics_partner: "you have a Shopinbos delivery partner account",
  admin: "you're a Shopinbos admin",
};

export function roleReason(role: string | null | undefined) {
  return ROLE_REASON[role ?? ""] ?? "you have a Shopinbos account";
}

/** In-app notification settings for each portal (linked from notification emails). */
export function notificationSettingsUrl(role: string | null | undefined) {
  const path = role === "supplier" ? "/supplier/settings" : role === "logistics_partner" ? "/logistics/settings" : role === "admin" ? "/admin/settings" : "/home/settings?tab=Notifications";
  return `${appBase()}${path}`;
}

export interface PlatformSendInput {
  to: string;
  /** The recipient's account; needed for lifecycle mail (preferences) and notification settings links. */
  user?: { id: string; role?: string | null } | null;
  kind: EmailKind;
  /** Lifecycle mail only: the preference it falls under. Skipped (not sent) when the user turned it off. */
  topic?: PlatformTopic;
  subject: string;
  heading: string;
  bodyHtml: string;
  preheader?: string | null;
  eyebrow?: string | null;
  cta?: { label: string; url: string } | null;
  reason?: string;
  replyTo?: string;
  from?: string;
  serviceNote?: string | null;
}

/** Builds the (A) email in the shell and sends it, honouring email preferences for lifecycle mail. */
export function buildPlatformEmail(input: Omit<PlatformSendInput, "to">) {
  const unsubscribing = input.kind === "lifecycle" || input.kind === "marketing";
  const links = unsubscribing && input.user?.id ? userLinks(input.user.id) : null;
  const html = platformEmail({
    appUrl: appBase(),
    kind: unsubscribing && !links ? "notification" : input.kind,
    heading: input.heading,
    bodyHtml: input.bodyHtml,
    preheader: input.preheader,
    eyebrow: input.eyebrow,
    cta: input.cta,
    reason: input.reason ?? roleReason(input.user?.role),
    legal: platformLegal(),
    unsubscribeUrl: links?.unsubscribe,
    preferencesUrl: unsubscribing ? links?.preferences : input.kind === "notification" ? notificationSettingsUrl(input.user?.role) : null,
    serviceNote: input.serviceNote,
  });
  return { html, headers: unsubscribing && links ? unsubscribeHeaders(links) : undefined };
}

export async function sendPlatformEmail(input: PlatformSendInput): Promise<EmailSendResult> {
  if (input.kind === "lifecycle" || input.kind === "marketing") {
    if (!input.user) return { success: false, message: "Lifecycle email needs the recipient's account" };
    if (input.topic && !(await platformEmailAllowed(input.user.id, input.topic))) return { success: false, message: "Turned off in email preferences" };
  }
  const { html, headers } = buildPlatformEmail(input);
  return sendEmail({ to: [input.to], subject: input.subject, html, headers, replyTo: input.replyTo, from: input.from });
}
