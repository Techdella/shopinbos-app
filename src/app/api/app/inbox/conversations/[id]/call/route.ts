import { NextRequest } from "next/server";
import { z } from "zod";
import { withSeller } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { db } from "@/lib/db/client";
import { startCallBack } from "@/lib/inbox/channels/sms";
import { sellerStore } from "@/lib/inbox/auth";
import { normalisePhone } from "@/lib/inbox/pure";
import { addNote, getChannel } from "@/lib/inbox/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.discriminatedUnion("mode", [
  // Africa's Talking rings the seller's phone, then connects them to the customer from the store's number.
  z.object({ mode: z.literal("click"), sellerPhone: z.string().trim().min(6).max(30) }),
  // A call made outside Shopinbos, written down so the whole team sees it.
  z.object({ mode: z.literal("log"), direction: z.enum(["incoming", "outgoing"]), outcome: z.enum(["answered", "missed", "voicemail"]), minutes: z.number().int().min(0).max(600).nullable(), notes: z.string().trim().max(2000).default("") }),
]);

export const POST = withSeller(async (req: NextRequest, { user, params }) => {
  const store = await sellerStore(user.id);
  if (!store) return apiError("NOT_FOUND", "Store not found", 404);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Invalid call");
  const conversation = await db.inboxConversation.findFirst({ where: { id: String(params.id), storeId: store.id } });
  if (!conversation) return apiError("NOT_FOUND", "Conversation not found", 404);

  if (parsed.data.mode === "log") {
    const { direction, outcome, minutes, notes } = parsed.data;
    const label = `${direction === "incoming" ? "Incoming" : "Outgoing"} call, ${outcome === "answered" ? (minutes ? `${minutes} min` : "answered") : outcome}`;
    const note = await addNote({ storeId: store.id, conversationId: conversation.id, body: notes ? `${label}. ${notes}` : label, authorName: user.name ?? "You", kind: "call", meta: { direction, outcome, minutes } });
    return ok({ id: note?.id ?? null });
  }

  const customer = normalisePhone(conversation.contactPhone ?? conversation.externalThreadId);
  const sellerPhone = normalisePhone(parsed.data.sellerPhone);
  if (!customer) return apiError("BAD_REQUEST", "This conversation has no phone number to call.");
  if (!sellerPhone) return apiError("BAD_REQUEST", "Enter your phone number with the country code.");
  const voice = await getChannel(store.id, "voice");
  if (!voice) return apiError("NOT_CONNECTED", "Connect Phone calls (Africa's Talking) in Inbox → Channels to call from the inbox.", 409);

  const result = await startCallBack(voice.credentials, { sellerPhone, conversationId: conversation.id });
  if (!result.ok) return apiError("CALL_FAILED", result.error, 502);
  // The voice webhook finds this note by the AT session id to know which customer to dial once the seller answers.
  const note = await db.inboxMessage.create({
    data: {
      conversationId: conversation.id,
      storeId: store.id,
      direction: "note",
      kind: "call",
      body: `Calling ${customer}…`,
      status: "logged",
      externalId: result.externalId ? `at:${result.externalId}` : null,
      authorName: user.name ?? "You",
      meta: { provider: "africastalking", customer, sellerPhone },
    },
  });
  return ok({ id: note.id, sessionId: result.externalId });
});
