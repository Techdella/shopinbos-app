import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { filterConversations, listQuerySchema, startConversationSchema } from "@/lib/conversations/pure";
import { detailsReady, listConversations, startConversation } from "@/lib/conversations/service.server";
import { MESSAGING_ROLES, conversationError } from "@/lib/conversations/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Partner messages (seller ↔ supplier ↔ delivery partner).
// GET  ?tab=all|supplier|logistics_partner|seller&q=  → the viewer's conversations, newest first.
// POST { with }  → starts (or finds) the chat with a user, supplier or delivery partner id.

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const query = listQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
    const all = await listConversations(user);
    const data = filterConversations(all, query.tab, query.q);
    const unread = all.reduce((sum, item) => sum + item.unread, 0);
    // `contacts` is the older shape (apps/mobile/src/lib/partners.ts reads it); `id` there is the other user's id.
    const contacts = data.map((item) => ({ id: item.with.userId, name: item.with.name, type: item.with.role, lastMessage: item.lastMessage?.text, unread: item.unread, lastMessageAt: item.lastMessage?.createdAt }));
    return NextResponse.json({ data, meta: { page: 1, limit: data.length, total: data.length, unread, filesEnabled: await detailsReady() }, contacts });
  } catch (error) {
    return conversationError(error);
  }
}, [...MESSAGING_ROLES]);

export const POST = withAuth(async (req: NextRequest, { user }) => {
  const parsed = startConversationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError("BAD_REQUEST", "Say who to message.");
  try {
    return ok(await startConversation(user, parsed.data.with), 201);
  } catch (error) {
    return conversationError(error);
  }
}, [...MESSAGING_ROLES]);
