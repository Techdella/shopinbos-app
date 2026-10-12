import "server-only";

import { db } from "@/lib/db/client";
import { formatFromAddress, isEmailConfigured, sendEmail } from "@/lib/notifications/resend";
import { readPreheader, withPreheader } from "./blocks";
import { MARKETING_STORE_SELECT, emailBrand, storeUrl } from "./brand";
import { previewSubject, renderEmailPreview } from "./preview";
import { sanitizeEmailHtml } from "./sanitize";
import { TEMPLATE_LIBRARY } from "./template-library";
import { MarketingError } from "./segments";

// Email templates: the shop's saved ones (EmailTemplate) plus the starter library. A template's preview line
// (preheader) is saved inside its body (see withPreheader), so EmailTemplate needs no extra column.

export async function listTemplates(storeId: string) {
  const saved = await db.emailTemplate.findMany({ where: { storeId }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, name: true, subject: true, category: true, bodyHtml: true, updatedAt: true } });
  return {
    saved: saved.map((template) => ({ ...template, preheader: readPreheader(template.bodyHtml) })),
    library: TEMPLATE_LIBRARY.map((template) => ({ key: template.key, name: template.name, description: template.description, subject: template.subject, category: template.category, flow: template.flow, style: template.style, series: template.series ?? null, preheader: template.preheader, bodyHtml: template.bodyHtml })),
  };
}

export interface TemplateInput {
  id?: string | null;
  name: string;
  subject: string;
  bodyHtml: string;
  category?: string;
  preheader?: string | null;
}

export async function saveTemplate(storeId: string, input: TemplateInput) {
  const name = input.name.trim().slice(0, 120);
  const subject = input.subject.trim().slice(0, 200);
  if (!name || !subject) throw new MarketingError("A template needs a name and a subject");
  const body = sanitizeEmailHtml(input.bodyHtml.slice(0, 200_000));
  const data = { name, subject, bodyHtml: input.preheader === undefined ? body : withPreheader(body, input.preheader ?? ""), category: (input.category || "general").slice(0, 40) };
  if (input.id) {
    const existing = await db.emailTemplate.findFirst({ where: { id: input.id, storeId }, select: { id: true } });
    if (!existing) throw new MarketingError("Template not found");
    return db.emailTemplate.update({ where: { id: input.id }, data });
  }
  return db.emailTemplate.create({ data: { storeId, ...data } });
}

/** Copies a library template into the shop so it can be edited. */
export async function copyLibraryTemplate(storeId: string, key: string) {
  const template = TEMPLATE_LIBRARY.find((item) => item.key === key);
  if (!template) throw new MarketingError("Template not found");
  return db.emailTemplate.create({ data: { storeId, name: template.name, subject: template.subject, bodyHtml: withPreheader(template.bodyHtml, template.preheader), category: template.category } });
}

export async function deleteTemplate(storeId: string, id: string) {
  const existing = await db.emailTemplate.findFirst({ where: { id, storeId }, select: { id: true } });
  if (!existing) throw new MarketingError("Template not found");
  await db.emailTemplate.delete({ where: { id } });
}

/** Sends the template as it is in the editor to the seller only, marked [Test]. Nothing is saved. */
export async function testSendTemplate(storeId: string, input: { subject: string; preheader?: string | null; bodyHtml: string }, to: string | null | undefined) {
  if (!to) throw new MarketingError("Add an email address to your account to get test emails");
  if (!isEmailConfigured()) throw new MarketingError("Email isn't set up yet (RESEND_API_KEY)");
  if (!input.bodyHtml.trim()) throw new MarketingError("Write the email first");
  const store = await db.store.findUnique({ where: { id: storeId }, select: MARKETING_STORE_SELECT });
  if (!store) throw new MarketingError("Store not found");
  const shop = { name: store.name, url: storeUrl(store) };
  const html = renderEmailPreview({ bodyHtml: sanitizeEmailHtml(input.bodyHtml), preheader: input.preheader, brand: emailBrand(store), shop });
  const result = await sendEmail({ to: [to], subject: `[Test] ${previewSubject(input.subject || store.name, shop)}`, html, from: formatFromAddress(store.name) });
  if (!result.success) throw new MarketingError(result.message ?? "The test email couldn't be sent");
  return { to };
}
