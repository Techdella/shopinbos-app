import { NextRequest } from "next/server";
import { z } from "zod";
import type { SubscriberSource } from "@prisma/client";
import { db } from "@/lib/db/client";
import { withCors, handleOptions } from "@/lib/api/cors";
import { created, apiError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { triggerAutomations } from "@/lib/automations/engine";
import { normalizeEmail, normalizePhone } from "@/lib/marketing/segment-rules";
import { addSubscriber } from "@/lib/marketing/subscribers";
import { upsertStoreVisitor } from "@/lib/storefront/visitor-data";
import { GameError } from "@/lib/gamification/config.server";
import { playGame } from "@/lib/gamification/play.server";

// A shopper spins the wheel, scratches the card, or takes their post-purchase spin. The server draws the
// prize (the page only animates to it) and issues a unique one-use code. Rate-limited per connection; one
// play per email/phone per period (and one post-purchase spin per order). Joining the list is a separate,
// unticked-by-default choice: playing never signs anyone up on its own.

const CORS = { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const Body = z.object({
  game: z.enum(["wheel", "scratch", "post_purchase"]),
  email: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  name: z.string().max(80).optional(),
  orderId: z.string().max(64).optional(),
  visitorKey: z.string().min(8).max(80).optional(),
  consent: z.object({ marketing: z.boolean().default(false), text: z.string().max(300).optional() }).default({ marketing: false }),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(`game:${ip}`, { maxRequests: 6, windowMs: 60_000 }).allowed || !checkRateLimit(`game:${slug}:${ip}`, { maxRequests: 20, windowMs: 3_600_000 }).allowed) {
    return withCors(req, apiError("RATE_LIMITED", "Too many tries. Wait a little and try again.", 429), CORS);
  }
  const store = await db.store.findUnique({ where: { slug }, select: { id: true, name: true, status: true } });
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", "Check your details and try again."), CORS);
  const input = parsed.data;
  const email = input.email?.trim() ? normalizeEmail(input.email) : null;
  if (input.email?.trim() && !email) return withCors(req, apiError("BAD_REQUEST", "Enter a valid email address."), CORS);
  const phone = input.phone?.trim() ? normalizePhone(input.phone) : null;
  if (input.phone?.trim() && !phone) return withCors(req, apiError("BAD_REQUEST", "Enter a valid WhatsApp number, like 0803 123 4567."), CORS);
  if (input.game !== "post_purchase" && !email && !phone) return withCors(req, apiError("BAD_REQUEST", "Enter your email or WhatsApp number so we can keep your prize."), CORS);
  const contact = email ?? phone ?? input.orderId ?? "";
  if (!checkRateLimit(`game:${store.id}:${contact}`, { maxRequests: 3, windowMs: 600_000 }).allowed) {
    return withCors(req, apiError("RATE_LIMITED", "You've already played. Check your code below or try again later.", 429), CORS);
  }

  const marketing = input.game !== "post_purchase" && input.consent.marketing;
  const consentRecord = { marketing, email: marketing && Boolean(email), whatsapp: marketing && Boolean(phone), text: input.consent.text ?? null, ip, at: new Date().toISOString() };

  let result;
  try {
    result = await playGame({ storeId: store.id, game: input.game, email, phone, orderId: input.orderId ?? null, consent: consentRecord });
  } catch (error) {
    if (error instanceof GameError) return withCors(req, apiError("BAD_REQUEST", error.message), CORS);
    console.error("[gamification] play failed", error);
    return withCors(req, apiError("INTERNAL_ERROR", "Something went wrong. Try again.", 500), CORS);
  }

  // Only with their say-so: join the list (email), remember them on this browser's visitor record.
  await Promise.allSettled([
    marketing && email
      ? addSubscriber(
          store.id,
          { email, name: input.name ?? null, phone, source: "popup" as SubscriberSource, consent: { email: true, sms: false, whatsapp: Boolean(phone), text: input.consent.text ?? null, ip, source: `game:${input.game}` } },
          { optIn: true },
        ).then((added) =>
          added.ok && (added.created || added.reactivated)
            ? triggerAutomations("welcome_email", { storeId: store.id, storeName: store.name, buyerEmail: email, buyerName: input.name ?? null, buyerPhone: phone, dedupe: `welcome:${email}`, discountCode: result.code })
            : undefined,
        )
      : null,
    input.visitorKey && (email || phone) ? upsertStoreVisitor({ storeId: store.id, visitorKey: input.visitorKey, email, phone, name: input.name ?? null }) : null,
  ]);

  return withCors(req, created(result), CORS);
}
