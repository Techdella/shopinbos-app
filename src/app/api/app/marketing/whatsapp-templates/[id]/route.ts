import { z } from "zod";
import { ok } from "@/lib/api/response";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { deleteWhatsAppTemplate, saveWhatsAppTemplate, submitWhatsAppTemplate } from "@/lib/marketing/whatsapp-templates.server";
import { WhatsAppTemplateSchema } from "../../schemas";

// One WhatsApp template of the signed-in seller's store: edit a draft, submit it to Meta, or delete it.

export const PATCH = marketingRoute(async ({ req, store, params }) => {
  const input = await readBody(req, WhatsAppTemplateSchema);
  return ok(await saveWhatsAppTemplate(store.id, params.id, input));
});

export const POST = marketingRoute(async ({ req, store, params }) => {
  const input = await readBody(req, z.object({ action: z.literal("submit"), headerImageUrl: z.string().trim().max(1000).regex(/^https:\/\/\S+$/, "The sample image must be an https:// link").nullable().optional() }));
  return ok(await submitWhatsAppTemplate(store.id, params.id, { headerImageUrl: input.headerImageUrl ?? null }));
});

export const DELETE = marketingRoute(async ({ store, params }) => {
  await deleteWhatsAppTemplate(store.id, params.id);
  return ok({ deleted: true });
});
