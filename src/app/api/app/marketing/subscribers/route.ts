import { z } from "zod";
import { NextResponse } from "next/server";
import { created } from "@/lib/api/response";
import { triggerAutomations } from "@/lib/automations/engine";
import { marketingRoute, readBody } from "@/lib/marketing/api";
import { MarketingError } from "@/lib/marketing/segments";
import { addSubscriber, consentSummary, listSubscribers } from "@/lib/marketing/subscribers";

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

const ListQuery = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(["active", "unsubscribed", "bounced", "spam"]).optional().catch(undefined),
  tag: z.string().max(40).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
});

// GET ?q=&status=&tag=&page=&limit= → { data: people, meta: { page, limit, total, pages, counts, newThisMonth, tags } }:
// the shop's list, the same as /home/marketing/subscribers (src/lib/marketing/subscribers.ts listSubscribers).
export const GET = marketingRoute(async ({ req, store }) => {
  const parsed = ListQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) throw new MarketingError("Search for a shorter name, email or phone number.");
  const list = await listSubscribers(store.id, parsed.data);
  return NextResponse.json({
    data: list.rows.map((row) => {
      const consent = consentSummary(row.metadata);
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        phone: row.phone,
        status: row.status,
        source: row.source,
        tags: row.tags,
        createdAt: row.createdAt.toISOString(),
        consent: consent ? { email: consent.email, text: consent.sms || consent.whatsapp } : null,
      };
    }),
    meta: { page: list.page, limit: list.limit, total: list.filtered, pages: list.pages, counts: list.counts, newThisMonth: list.newThisMonth, tags: list.tags },
  });
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
