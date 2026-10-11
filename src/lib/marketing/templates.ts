import "server-only";

import { db } from "@/lib/db/client";
import { TEMPLATE_LIBRARY } from "./email-layout";
import { MarketingError } from "./segments";

// Email templates: the shop's saved ones (EmailTemplate) plus the starter library.

export async function listTemplates(storeId: string) {
  const saved = await db.emailTemplate.findMany({ where: { storeId }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, name: true, subject: true, category: true, bodyHtml: true, updatedAt: true } });
  return {
    saved,
    library: TEMPLATE_LIBRARY.map((template) => ({ key: template.key, name: template.name, subject: template.subject, category: template.category, preheader: template.preheader, bodyHtml: template.bodyHtml })),
  };
}

export async function saveTemplate(storeId: string, input: { id?: string | null; name: string; subject: string; bodyHtml: string; category?: string }) {
  const name = input.name.trim().slice(0, 120);
  const subject = input.subject.trim().slice(0, 200);
  if (!name || !subject) throw new MarketingError("A template needs a name and a subject");
  const data = { name, subject, bodyHtml: input.bodyHtml.slice(0, 200_000), category: (input.category || "general").slice(0, 40) };
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
  return db.emailTemplate.create({ data: { storeId, name: template.name, subject: template.subject, bodyHtml: template.bodyHtml, category: template.category } });
}

export async function deleteTemplate(storeId: string, id: string) {
  const existing = await db.emailTemplate.findFirst({ where: { id, storeId }, select: { id: true } });
  if (!existing) throw new MarketingError("Template not found");
  await db.emailTemplate.delete({ where: { id } });
}
