// Peggy's inbox tools: input schemas. Pure, merged into PEGGY_TOOL_SPECS in ./pure.

import { z } from "zod";

const conversationRef = z.string().trim().min(1).max(160).describe("The conversation id from inbox_list_unread, or the customer's name, email or phone");

export const INBOX_TOOL_SPECS = {
  inbox_list_unread: {
    write: false,
    description:
      "The seller's customer inbox: open conversations with unread messages first (WhatsApp, Instagram, Messenger, SMS, email, Telegram, phone calls, live chat, contact forms), with the latest messages of each. Use it before drafting or sending a reply.",
    schema: z.object({ limit: z.number().int().min(1).max(20).nullable().describe("How many conversations (1-20); null for 8") }).strict(),
  },
  inbox_draft_reply: {
    write: false,
    description:
      "Write a reply to one customer conversation from the shop's real details and the conversation so far. Returns the draft text only; nothing is sent. Show the draft to the seller in full.",
    schema: z.object({ conversation: conversationRef, instruction: z.string().trim().max(500).nullable().describe("What the seller wants the reply to say, or null") }).strict(),
  },
  inbox_send_reply: {
    write: true,
    description:
      "Send a reply to a customer on the channel they wrote on (WhatsApp, email, SMS, Instagram, Messenger, Telegram or live chat). This really sends. Call first with confirmCode null: nothing is sent and you get a confirmation code tied to this exact text. Show the seller the exact message and who it goes to, and only after they clearly say yes (in their next message) call again with the same text and that code.",
    schema: z
      .object({
        conversation: conversationRef,
        message: z.string().trim().min(1).max(4000).describe("The exact text to send"),
        confirmCode: z.string().trim().max(12).nullable().describe("null on the first call; then the code the tool gave, only after the seller says yes to this exact text"),
      })
      .strict(),
  },
} as const;
