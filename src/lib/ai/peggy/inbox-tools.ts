import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { CHANNELS, isChannelKey } from "@/lib/inbox/pure";
import { contactLabel } from "@/lib/inbox/queries";
import { draftReplyWithPeggy, sendReply } from "@/lib/inbox/service";
import { meterAi } from "@/lib/ai/usage";
import { checkConfirmationCode, confirmationCode } from "@/lib/marketing/brand";
import { replyConfirmationParts, type PeggyToolInput } from "./pure";
import { ToolError, type PeggyToolContext, type ToolOutput } from "./tools";

// Peggy's inbox tools: read unread conversations, draft a reply, and send one only after the seller confirms
// with the code the first call hands out (tied to the conversation and the exact words, and expiring).

const channelLabel = (channel: string) => (isChannelKey(channel) ? CHANNELS[channel].label : channel);

async function findConversation(ctx: PeggyToolContext, ref: string) {
  const byId = await db.inboxConversation.findFirst({ where: { id: ref.trim(), storeId: ctx.store.id } });
  if (byId) return byId;
  const q = ref.trim();
  const digits = q.replace(/\D/g, "");
  const matches = await db.inboxConversation.findMany({
    where: {
      storeId: ctx.store.id,
      OR: [
        { contactName: { contains: q, mode: "insensitive" } },
        { contactEmail: { contains: q, mode: "insensitive" } },
        { contactHandle: { contains: q, mode: "insensitive" } },
        ...(digits.length >= 7 ? [{ contactPhone: { contains: digits.slice(-10) } }] : []),
      ],
    },
    orderBy: { lastMessageAt: "desc" },
    take: 5,
  });
  if (!matches.length) throw new ToolError(`No conversation matches "${q}". Use inbox_list_unread to see conversation ids.`);
  if (matches.length > 1 && new Set(matches.map((m) => m.channel)).size > 1) {
    throw new ToolError(`"${q}" matches ${matches.length} conversations: ${matches.map((m) => `${contactLabel(m)} on ${channelLabel(m.channel)} (id ${m.id})`).join("; ")}. Ask which one, or call again with the id.`);
  }
  return matches[0];
}

async function listUnread(ctx: PeggyToolContext, input: PeggyToolInput<"inbox_list_unread">): Promise<ToolOutput> {
  const conversations = await db.inboxConversation.findMany({
    where: { storeId: ctx.store.id, status: { not: "closed" } },
    orderBy: [{ unreadCount: "desc" }, { lastMessageAt: "desc" }],
    take: input.limit ?? 8,
    include: { messages: { orderBy: { createdAt: "desc" }, take: 4, where: { direction: { in: ["inbound", "outbound"] } }, select: { direction: true, body: true, createdAt: true } } },
  });
  const unread = await db.inboxConversation.count({ where: { storeId: ctx.store.id, unreadCount: { gt: 0 }, status: { not: "closed" } } });
  return {
    content: JSON.stringify({
      unreadConversations: unread,
      conversations: conversations.map((c) => ({
        id: c.id,
        customer: contactLabel(c),
        channel: channelLabel(c.channel),
        unread: c.unreadCount,
        status: c.status,
        lastMessageAt: c.lastMessageAt.toISOString(),
        recent: c.messages.reverse().map((m) => `${m.direction === "inbound" ? "Customer" : "Shop"}: ${m.body.slice(0, 400)}`),
      })),
      note: "Open the inbox at /home/messages.",
    }),
  };
}

async function draftReply(ctx: PeggyToolContext, input: PeggyToolInput<"inbox_draft_reply">): Promise<ToolOutput> {
  const conversation = await findConversation(ctx, input.conversation);
  if (await meterAi(ctx.userId, "text")) throw new ToolError("The seller has used today's AI writing allowance. Tell them it resets within 24 hours or with a plan upgrade.");
  const text = await draftReplyWithPeggy(ctx.store.id, conversation.id, { instruction: input.instruction });
  if (!text) throw new ToolError("The writing service didn't answer. Write the reply yourself in your message instead.");
  return {
    content: `Draft reply to ${contactLabel(conversation)} on ${channelLabel(conversation.channel)} (conversation id ${conversation.id}). Nothing was sent. Show it in full and ask whether to send it:\n${text}`,
  };
}

async function sendReplyTool(ctx: PeggyToolContext, input: PeggyToolInput<"inbox_send_reply">): Promise<ToolOutput> {
  const conversation = await findConversation(ctx, input.conversation);
  const who = `${contactLabel(conversation)} on ${channelLabel(conversation.channel)}`;
  if (!isChannelKey(conversation.channel) || !CHANNELS[conversation.channel].replies) {
    throw new ToolError(`${channelLabel(conversation.channel)} conversations can't be answered from Shopinbos. Suggest calling back or replying in that app.`);
  }
  const parts = replyConfirmationParts(ctx.store.id, conversation.id, input.message);
  if (!checkConfirmationCode(input.confirmCode, parts)) {
    return {
      content: `NOT SENT YET. Show the seller this exact message for ${who} and ask them to confirm. Confirmation code: ${confirmationCode(parts)}. Only call inbox_send_reply again, with the same text and this code, after they clearly say yes.${input.confirmCode ? " (The code given was wrong, expired, or for different words.)" : ""}\n${input.message}`,
    };
  }
  const result = await sendReply({ storeId: ctx.store.id, conversationId: conversation.id, body: input.message, authorName: "Peggy" });
  if (!result.ok) throw new ToolError(`The message to ${who} was not sent: ${result.error}`);
  const summary = `Sent your reply to ${who}.`;
  await db.activityEvent
    .create({
      data: {
        storeId: ctx.store.id,
        userId: ctx.userId,
        type: "customers",
        title: `Peggy replied to ${contactLabel(conversation)}`,
        description: input.message.slice(0, 500),
        metadata: { source: "peggy", tool: "inbox_send_reply", link: `/home/messages?c=${conversation.id}` } as Prisma.InputJsonValue,
      },
    })
    .catch((error) => console.error("[peggy] activity log failed", error));
  return { content: summary, action: { summary, href: `/home/messages?c=${conversation.id}` } };
}

export const INBOX_TOOL_RUNNERS = {
  inbox_list_unread: listUnread,
  inbox_draft_reply: draftReply,
  inbox_send_reply: sendReplyTool,
};
