import "server-only";

import type { Prisma } from "@prisma/client";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { aiText } from "@/lib/ai/text";
import { markdownToDoc } from "@/lib/cms/markdown";
import { sanitizeDoc, type RichDoc } from "@/lib/cms/richtext";
import { cleanSeo } from "@/lib/seo/fields";
import { loadShopperInfo } from "@/lib/storefront/shopper-info.server";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import {
  MAX_CUSTOM_LEGAL_PAGES,
  MAX_LEGAL_DOC_BYTES,
  customLegalKeyError,
  docBytes,
  isStandardLegalKey,
  legacyLegalCopies,
  legalPageStatus,
  legalSlug,
  legalTemplate,
  normalizeLegalStyle,
  readLegalPages,
  standardLegalPage,
  storedLegalPages,
  withReviewNote,
  type LegalPage,
  type LegalTemplateContext,
} from "@/lib/legal/pages";

// Legal pages on the server: saving them into Store.brandSettings.legalPages (plus the plain-text copies in
// brandSettings.legal that older readers use), the seller's custom pages, Peggy's drafts and what the
// storefront reads. Pure rules live in ./pages.

export class LegalError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "VALIDATION_ERROR") {
    super(message);
  }
}

const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export const LegalSaveSchema = z.object({
  title: z.string().trim().min(1, "Add a title").max(120),
  doc: z.unknown().refine((value) => rec(value).type === "doc", "The page content is missing"),
  style: z.record(z.string(), z.unknown()).optional(),
  seo: z.record(z.string(), z.unknown()).optional(),
  published: z.boolean(),
});

export const LegalCreateSchema = z.object({ title: z.string().trim().min(1, "Give the page a name").max(120) });

export async function legalStore(userId: string) {
  return db.store.findUnique({ where: { userId }, select: { id: true, slug: true, name: true, city: true, country: true, customDomain: true, brandSettings: true } });
}

type LegalStoreRow = NonNullable<Awaited<ReturnType<typeof legalStore>>>;

async function writePages(store: Pick<LegalStoreRow, "id" | "brandSettings">, pages: LegalPage[]) {
  const settings = rec(store.brandSettings);
  const next = {
    ...settings,
    legalPages: storedLegalPages(pages),
    legal: { ...rec(settings.legal), ...legacyLegalCopies(pages) },
  };
  await db.store.update({ where: { id: store.id }, data: { brandSettings: next as unknown as Prisma.InputJsonValue } });
}

/** Saves one page (validated, document sanitised and size-checked). */
export async function saveLegalPage(store: LegalStoreRow, key: string, body: unknown) {
  const pages = readLegalPages(store.brandSettings);
  const index = pages.findIndex((page) => page.key === key);
  if (index < 0) throw new LegalError("That legal page doesn't exist", 404, "NOT_FOUND");
  const input = LegalSaveSchema.parse(body);
  const doc = sanitizeDoc(input.doc);
  if (docBytes(doc) > MAX_LEGAL_DOC_BYTES) throw new LegalError("This page is too long to save. Split it into two pages or remove some pictures and tables.", 413, "PAYLOAD_TOO_LARGE");
  const page: LegalPage = {
    ...pages[index],
    title: input.title,
    doc,
    style: normalizeLegalStyle(input.style),
    seo: cleanSeo(input.seo ?? {}),
    published: input.published,
    updatedAt: new Date().toISOString(),
  };
  if (page.published && legalPageStatus(page) === "empty") throw new LegalError("Write something before you publish this page");
  pages[index] = page;
  await writePages(store, pages);
  return page;
}

export async function createCustomLegalPage(store: LegalStoreRow, body: unknown) {
  const { title } = LegalCreateSchema.parse(body);
  const pages = readLegalPages(store.brandSettings);
  const custom = pages.filter((page) => page.custom);
  if (custom.length >= MAX_CUSTOM_LEGAL_PAGES) throw new LegalError(`You can add up to ${MAX_CUSTOM_LEGAL_PAGES} pages of your own`, 409, "CONFLICT");
  const base = legalSlug(title);
  let key = base;
  for (let n = 2; key && pages.some((page) => page.key === key); n++) key = `${base}-${n}`;
  const problem = customLegalKeyError(key, pages.map((page) => page.key));
  if (problem) throw new LegalError(problem);
  const page: LegalPage = { ...readLegalPages({ legalPages: { [key]: { title } } }).find((entry) => entry.key === key)!, updatedAt: new Date().toISOString() };
  await writePages(store, [...pages, page]);
  return page;
}

/** Deletes a custom page. Standard pages can only be emptied or unpublished. */
export async function deleteLegalPage(store: LegalStoreRow, key: string) {
  if (isStandardLegalKey(key)) throw new LegalError("Standard pages can't be deleted. Unpublish it instead.", 409, "CONFLICT");
  const pages = readLegalPages(store.brandSettings);
  if (!pages.some((page) => page.key === key)) throw new LegalError("That legal page doesn't exist", 404, "NOT_FOUND");
  await writePages(store, pages.filter((page) => page.key !== key));
}

/** What the templates and Peggy know about the store: name, place, contacts, delivery zones, payments. */
export async function legalContext(store: Pick<LegalStoreRow, "id" | "name" | "slug" | "city" | "country" | "customDomain" | "brandSettings">, owner: { email?: string | null; phone?: string | null }): Promise<LegalTemplateContext> {
  const shopper = await loadShopperInfo(store.id, store.brandSettings).catch(() => null);
  return {
    storeName: store.name,
    city: store.city,
    country: store.country,
    email: owner.email ?? null,
    phone: owner.phone ?? null,
    whatsapp: shopper?.whatsappNumber ?? null,
    storeUrl: buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain ?? null }),
    delivery: shopper?.delivery.map((zone) => ({ name: zone.name, regions: zone.regions, fee: zone.fee, freeOver: zone.freeOver, alwaysFree: zone.alwaysFree, estimatedDays: zone.estimatedDays })) ?? [],
    flatRate: shopper?.flatRate ?? null,
    payOnDelivery: shopper?.payOnDelivery ?? false,
    paymentLabels: shopper?.paymentLabels ?? [],
  };
}

/**
 * Peggy's first draft of a legal page (not saved; the editor shows it for the seller to review). Falls back
 * to the template when no AI provider is set up or the model doesn't answer.
 */
export async function draftLegalPage(key: string, title: string, ctx: LegalTemplateContext, brief = ""): Promise<{ doc: RichDoc; source: "ai" | "template" }> {
  const template = legalTemplate(key, ctx);
  const written = await aiText({
    maxTokens: 3500,
    system: `You write the legal and policy pages of ${ctx.storeName}, a small online shop in ${ctx.country || "Nigeria"}. Plain, friendly Nigerian English a shopper understands. Follow Nigerian law (Nigeria Data Protection Act 2023, Federal Competition and Consumer Protection Act 2018) where relevant. Never invent facts about the shop: where you need a detail you were not given, write [Check: what the seller must fill in]. No emojis.`,
    prompt: [
      `Write the "${title}" page.`,
      brief ? `The seller says: ${brief.slice(0, 1000)}` : "",
      `What we know about the shop: ${JSON.stringify({ ...ctx, delivery: ctx.delivery?.slice(0, 12) })}`,
      template ? "Cover at least what a standard page of this kind covers." : "",
      "Return Markdown only: use # for section headings (no page title, it is shown separately), short paragraphs, bullet lists and pipe tables where useful.",
    ]
      .filter(Boolean)
      .join("\n"),
  }).catch(() => null);
  const markdown = written?.text.replace(/^```(?:markdown|md)?\s*|\s*```$/g, "").trim();
  if (markdown) {
    const doc = sanitizeDoc(markdownToDoc(markdown));
    if (docBytes(doc) <= MAX_LEGAL_DOC_BYTES) return { doc: withReviewNote(doc), source: "ai" };
  }
  if (template) return { doc: template, source: "template" };
  throw new LegalError("Peggy couldn't write this page right now. Try again in a moment, or start writing yourself.", 503, "AI_UNAVAILABLE");
}

/** The editor's starting point for a key, or null when it isn't one of the store's pages. */
export function sellerLegalPage(store: Pick<LegalStoreRow, "brandSettings">, key: string) {
  return readLegalPages(store.brandSettings).find((page) => page.key === key) ?? null;
}

export function legalTitle(key: string) {
  return standardLegalPage(key)?.title ?? key;
}

// ─── Storefront ──────────────────────────────────────────────────────────────

const storeSelect = { id: true, userId: true, name: true, slug: true, description: true, logoUrl: true, currency: true, customDomain: true, brandSettings: true, status: true } as const;

/** A store and its legal pages for the storefront (loaded once per request). Inactive stores return null. */
export const storefrontLegal = cache(async (storeSlug: string) => {
  const row = await db.store.findUnique({ where: { slug: storeSlug }, select: storeSelect }).catch(() => null);
  if (!row) return null;
  const { userId, ...store } = row;
  return { store, ownerId: userId, active: store.status === "active", pages: readLegalPages(store.brandSettings) };
});
