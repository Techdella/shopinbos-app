import { z } from "zod";
import { created } from "@/lib/api/response";
import { triggerAutomations } from "@/lib/automations/engine";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { MarketingError } from "@/lib/marketing/segments";
import { addSubscriber } from "@/lib/marketing/subscribers";

const AddSchema = z.object({
  email: z.string().trim().max(200),
  name: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  birthday: z.string().trim().max(20).nullable().optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  consent: z.object({ email: z.boolean(), sms: z.boolean().default(false), whatsapp: z.boolean().default(false), note: z.string().max(300).optional() }),
  sendWelcome: z.boolean().default(false),
});

// Add one person by hand. The seller says how they agreed (in person, WhatsApp, a paper list…).
export const POST = marketingRoute(async ({ req, store }) => {
  const input = await readBody(req, AddSchema);
  const result = await addSubscriber(
    store.id,
    { email: input.email, name: input.name, phone: input.phone, country: input.country, birthday: input.birthday, tags: input.tags, source: "manual_import", consent: { ...input.consent, text: input.consent.note ?? "Added by the seller, who confirmed the person agreed" } },
    { optIn: false },
  );
  if (!result.ok) throw new MarketingError(result.error);
  if (input.sendWelcome && input.consent.email && result.created) {
    await triggerAutomations("welcome_email", { storeId: store.id, storeName: store.name, buyerEmail: input.email, buyerName: input.name ?? null, buyerPhone: input.phone ?? null, dedupe: `welcome:${input.email.toLowerCase()}` });
  }
  return created(result);
});
