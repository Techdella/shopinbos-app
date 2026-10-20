import { z } from "zod";
import { withAdmin } from "@/lib/auth/middleware";
import { apiError, ok } from "@/lib/api/response";
import { startConversation, supportQueue } from "@/lib/support/service.server";
import { supportError } from "@/lib/support/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/support/tickets?status=active|open|pending|solved|closed|all&priority=&topic=&portal=
//     &channel=app|web|email|whatsapp&assignee=me|none|<userId>&q=&page=: the support queue with counts per status.
export const GET = withAdmin(async (req, { user }) => {
  try {
    const params = req.nextUrl.searchParams;
    const queue = await supportQueue(user.id, {
      status: params.get("status") ?? undefined,
      priority: params.get("priority") ?? undefined,
      topic: params.get("topic") ?? undefined,
      portal: params.get("portal") ?? undefined,
      channel: params.get("channel") ?? undefined,
      assignee: params.get("assignee") ?? undefined,
      q: params.get("q") ?? undefined,
      page: Number(params.get("page")) || 1,
    });
    return ok(queue);
  } catch (error) {
    return supportError(error);
  }
});

const startSchema = z.discriminatedUnion("channel", [
  z.object({ channel: z.literal("email"), name: z.string().max(120).default(""), email: z.string().max(200), subject: z.string().max(160), message: z.string().max(5000) }),
  z.object({ channel: z.literal("whatsapp"), name: z.string().max(120).default(""), phone: z.string().max(40), template: z.string().max(80), note: z.string().max(900).optional() }),
]);

// POST /api/admin/support/tickets: the team starts a conversation.
//   { channel: "email", name, email, subject, message }
//   { channel: "whatsapp", name, phone, template, note? }   (a team template; joins an open WhatsApp conversation)
export const POST = withAdmin(async (req, { user }) => {
  try {
    const parsed = startSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError("BAD_REQUEST", parsed.error.issues[0]?.message ?? "Check the message.");
    return ok(await startConversation(user, parsed.data), 201);
  } catch (error) {
    return supportError(error);
  }
});
