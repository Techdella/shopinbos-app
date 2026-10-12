import { NextResponse } from "next/server";
import { z } from "zod";
import { created, ok } from "@/lib/api/response";
import { meterAi } from "@/lib/ai/usage";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { channelStatus } from "@/lib/marketing/channels";
import { draftFromPreset, draftTemplateWithPeggy, listWhatsAppTemplates, saveWhatsAppTemplate, syncWhatsAppTemplates } from "@/lib/marketing/whatsapp-templates.server";
import { WhatsAppTemplateSchema } from "../schemas";

// WhatsApp message templates for the signed-in seller's store (its own WhatsApp Business Account).
//   GET                                  list, with whether templates can be managed
//   POST { action: "create", … }         save a draft (not sent to Meta)
//   POST { action: "preset", key }       draft from a ready-made template
//   POST { action: "sync" }              read statuses from Meta
//   POST { action: "assist", … }         Peggy writes a draft for the form (saves nothing)

export const GET = marketingRoute(async ({ store }) => {
  const [templates, channels] = await Promise.all([listWhatsAppTemplates(store.id), channelStatus(store.id)]);
  return NextResponse.json({ data: templates, meta: { page: 1, limit: templates.length, total: templates.length, whatsapp: channels.whatsapp } });
});

const ActionSchema = z.discriminatedUnion("action", [
  WhatsAppTemplateSchema.extend({ action: z.literal("create") }),
  z.object({ action: z.literal("preset"), key: z.string().max(40) }),
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("assist"), instruction: z.string().trim().min(3, "Tell Peggy what the message is for").max(600), category: z.enum(["MARKETING", "UTILITY"]).default("MARKETING") }),
]);

export const POST = marketingRoute(async ({ req, user, store }) => {
  const input = await readBody(req, ActionSchema);
  switch (input.action) {
    case "create":
      return created(await saveWhatsAppTemplate(store.id, null, { name: input.name, language: input.language, category: input.category, content: input.content, variables: input.variables }));
    case "preset":
      return created(await draftFromPreset(store.id, input.key));
    case "sync":
      return ok(await syncWhatsAppTemplates(store.id));
    case "assist": {
      const limited = await meterAi(user.id, "text");
      if (limited) return limited;
      return ok(await draftTemplateWithPeggy(store.id, input.instruction, input.category));
    }
  }
});
