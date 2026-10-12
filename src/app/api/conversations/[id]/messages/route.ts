import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { threadQuerySchema } from "@/lib/conversations/pure";
import { getThread, sendPartnerMessage } from "@/lib/conversations/service.server";
import { MESSAGING_ROLES, conversationError } from "@/lib/conversations/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One partner conversation. [id] is the conversation id; older links pass the other person's
// user/supplier/partner id instead, which still works (a first message starts the chat).
// GET  ?after=<iso> (poll) | ?before=<iso> (older page) → messages, oldest first; marks theirs read.
// POST { text, attachments?, context?, clientId? } → the sent message.

export const GET = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const query = threadQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const thread = await getThread(user, String(params.id), query);
    // `messages` is the older shape (apps/mobile/src/lib/partners.ts reads it).
    const messages = thread.messages.map((message) => ({ id: message.id, from: message.mine ? "me" : "them", text: message.text, createdAt: message.createdAt }));
    return NextResponse.json({ data: thread.messages, meta: { conversation: thread.conversation, hasMore: thread.hasMore, seenUpTo: thread.seenUpTo }, messages });
  } catch (error) {
    return conversationError(error);
  }
}, [...MESSAGING_ROLES]);

export const POST = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const body = await req.json().catch(() => null);
    const sent = await sendPartnerMessage(user, String(params.id), body);
    // `message` is the older shape (apps/mobile/src/lib/partners.ts reads it).
    return NextResponse.json({ data: sent, message: { id: sent.id, text: sent.text, from: "me", createdAt: sent.createdAt } }, { status: 201 });
  } catch (error) {
    return conversationError(error);
  }
}, [...MESSAGING_ROLES]);
