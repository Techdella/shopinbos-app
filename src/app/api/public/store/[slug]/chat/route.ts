import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { handleOptions, withCors } from "@/lib/api/cors";
import { apiError, ok } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/rate-limit";
import { ingestInbound } from "@/lib/inbox/service";
import { isSellerOnline, normaliseEmail, normalisePhone } from "@/lib/inbox/pure";
import { chatbotOnDuty } from "@/lib/inbox/assistant";
import { loadAutomation } from "@/lib/inbox/automation.server";
import { hasAiProvider } from "@/lib/inbox/ai";
import { upsertStoreVisitor } from "@/lib/storefront/visitor-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The storefront live-chat widget. GET returns the widget settings, whether the seller is online and this
// shopper's conversation (polled while the chat is open); POST adds the shopper's message to the seller's
// inbox. The visitor key (random, kept in the shopper's browser) is the conversation's thread id.

const CORS = { methods: ["GET", "POST", "OPTIONS"], headers: ["Content-Type"] };

export async function OPTIONS(req: NextRequest) {
  return handleOptions(req, CORS);
}

const visitorKey = z.string().trim().min(16).max(80).regex(/^[A-Za-z0-9-]+$/);

async function loadStore(slug: string) {
  return db.store.findUnique({ where: { slug }, select: { id: true, name: true, status: true, logoUrl: true } });
}

/** The chatbot answering this shop's live chat right now (name and greeting), or null. */
async function activeAssistant(storeId: string, sellerLastSeenAt: Date | null | undefined) {
  if (!hasAiProvider()) return null;
  const { chatbot, autoReply } = await loadAutomation(storeId);
  return chatbotOnDuty(chatbot, autoReply, isSellerOnline(sellerLastSeenAt)) ? { name: chatbot.name, greeting: chatbot.greeting } : null;
}

function ip(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);
  if (!checkRateLimit(`chat:get:${ip(req)}`, { maxRequests: 90, windowMs: 60_000 }).allowed) {
    return withCors(req, apiError("RATE_LIMITED", "Slow down a little.", 429), CORS);
  }

  const [config, settings] = await Promise.all([
    db.liveChatConfig.findUnique({ where: { storeId: store.id } }),
    db.inboxSettings.findUnique({ where: { storeId: store.id }, select: { sellerLastSeenAt: true } }),
  ]);
  const assistant = await activeAssistant(store.id, settings?.sellerLastSeenAt);
  const key = visitorKey.safeParse(req.nextUrl.searchParams.get("visitorKey"));
  const open = req.nextUrl.searchParams.get("open") === "1";

  let messages: Array<{ id: string; from: "shopper" | "shop"; body: string; at: string; auto: boolean; bot: boolean }> = [];
  let handedOff = false;
  let contact: { name: string | null; email: string | null; phone: string | null } | null = null;
  if (key.success) {
    const conversation = await db.inboxConversation.findUnique({
      where: { storeId_channel_externalThreadId: { storeId: store.id, channel: "livechat", externalThreadId: key.data } },
      include: { messages: { where: { direction: { in: ["inbound", "outbound"] }, status: { not: "failed" } }, orderBy: { createdAt: "asc" }, take: 200 } },
    });
    if (conversation) {
      contact = { name: conversation.contactName, email: conversation.contactEmail, phone: conversation.contactPhone };
      messages = conversation.messages.map((m) => ({ id: m.id, from: m.direction === "inbound" ? "shopper" : "shop", body: m.body, at: m.createdAt.toISOString(), auto: m.kind === "auto_reply", bot: Boolean((m.meta as { bot?: unknown } | null)?.bot) }));
      handedOff = conversation.tags.includes("needs-human");
      // While the chat window is open the shopper sees replies live, so we don't also email them.
      if (open) await db.inboxConversation.update({ where: { id: conversation.id }, data: { visitorSeenAt: new Date() } }).catch(() => null);
    }
  }

  return withCors(
    req,
    ok({
      store: { name: store.name, logoUrl: store.logoUrl },
      config: {
        mode: config?.mode ?? "contact_form",
        greeting: config?.greeting ?? "Hi there! Need help?",
        whatsappNumber: config?.whatsappNumber ?? null,
        whatsappGreeting: config?.whatsappGreeting ?? null,
        color: config?.whatsappColor ?? "#25D366",
        position: config?.whatsappPosition === "left" ? "left" : "right",
        widgetStyle: config?.widgetStyle ?? "bubble",
        showOnMobile: config?.showOnMobile ?? true,
        showOnDesktop: config?.showOnDesktop ?? true,
        enabled: Boolean(config),
      },
      online: isSellerOnline(settings?.sellerLastSeenAt),
      // Peggy answers shoppers live; after a hand-off the shopper is asked how the seller can reach them.
      assistant: assistant ? { ...assistant, handedOff } : null,
      contact,
      messages,
    }),
    CORS,
  );
}

const PostSchema = z.object({
  visitorKey,
  body: z.string().trim().min(1, "Write a message").max(2000),
  name: z.string().trim().max(80).optional(),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(30).optional(),
  page: z.string().trim().max(300).optional(),
  /** "whatsapp": written in the store's WhatsApp chat window (shoppers stay on the store instead of going to wa.me). */
  via: z.enum(["chat", "whatsapp"]).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await loadStore(slug);
  if (!store || store.status !== "active") return withCors(req, apiError("NOT_FOUND", "Store not found", 404), CORS);

  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return withCors(req, apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid message"), CORS);
  const input = parsed.data;
  if (!checkRateLimit(`chat:post:${ip(req)}:${input.visitorKey}`, { maxRequests: 12, windowMs: 60_000 }).allowed) {
    return withCors(req, apiError("RATE_LIMITED", "You're sending messages very fast. Wait a moment.", 429), CORS);
  }

  const email = normaliseEmail(input.email);
  const phone = normalisePhone(input.phone);
  if (input.email && !email) return withCors(req, apiError("BAD_REQUEST", "Check your email address."), CORS);
  if (input.phone && !phone) return withCors(req, apiError("BAD_REQUEST", "Check your phone number."), CORS);

  const [settings, existing] = await Promise.all([
    db.inboxSettings.findUnique({ where: { storeId: store.id }, select: { sellerLastSeenAt: true } }),
    db.inboxConversation.findUnique({
      where: { storeId_channel_externalThreadId: { storeId: store.id, channel: "livechat", externalThreadId: input.visitorKey } },
      select: { contactEmail: true, contactPhone: true, tags: true },
    }),
  ]);
  // When nobody is online we need a way to get back to the shopper (unless the chatbot is answering live).
  const assistant = await activeAssistant(store.id, settings?.sellerLastSeenAt);
  const botAnswers = Boolean(assistant) && !existing?.tags.includes("needs-human");
  // The WhatsApp window always asks for the shopper's WhatsApp number, so the seller can carry on there.
  if (input.via === "whatsapp" && !phone && !existing?.contactPhone) {
    return withCors(req, apiError("CONTACT_REQUIRED", "Add your WhatsApp number so the shop can reply to you there."), CORS);
  }
  if (!botAnswers && !isSellerOnline(settings?.sellerLastSeenAt) && !email && !phone && !existing?.contactEmail && !existing?.contactPhone) {
    return withCors(req, apiError("CONTACT_REQUIRED", "We're away right now. Leave your email or phone number so we can reply."), CORS);
  }

  const visitorId = await upsertStoreVisitor({ storeId: store.id, visitorKey: input.visitorKey, email, name: input.name ?? null, phone }).catch(() => null);
  const result = await ingestInbound({
    storeId: store.id,
    channel: "livechat",
    threadId: input.visitorKey,
    contact: { name: input.name || null, email, phone, visitorId: typeof visitorId === "string" ? visitorId : null },
    message: { body: input.body, meta: { ...(input.page ? { page: input.page } : {}), ...(input.via === "whatsapp" ? { via: "whatsapp" } : {}) } },
    visitorSeen: true,
  });
  return withCors(req, ok({ id: result.messageId }), CORS);
}
