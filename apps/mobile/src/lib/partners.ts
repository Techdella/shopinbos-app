import { apiBody } from "./api";
import { fetchInbox } from "./inbox";

// Messages with suppliers and delivery partners. Everything that knows the shape of /api/conversations is in
// this file, so when that API changes only these few functions need to follow.
//
//   GET  /api/conversations                 → { contacts: [{ id, name, type, lastMessage?, unread?, lastMessageAt? }] }
//   GET  /api/conversations/:id/messages    → { messages: [{ id, from: "me" | senderId, text, createdAt }] }
//   POST /api/conversations/:id/messages    { text } → { message: { id, text, from: "me", createdAt } }
//
// `id` is the supplier or delivery partner's id, or their user id (the API accepts either).

export type PartnerKind = "supplier" | "logistics_partner";

export interface PartnerContact {
  id: string;
  name: string;
  kind: PartnerKind;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

export interface PartnerMessage {
  id: string;
  mine: boolean;
  text: string;
  createdAt: string;
  /** The product, order, wholesale order or delivery linked to the message (newer servers, from `data`). */
  context?: PartnerContext | null;
}

export interface PartnerContext {
  kind: "product" | "order" | "wholesale_order" | "booking";
  id: string;
  label: string;
  sub?: string | null;
}

interface RawContact {
  id: string;
  name: string;
  type?: string;
  lastMessage?: string | null;
  unread?: number | null;
  lastMessageAt?: string | null;
}

interface RawMessage {
  id: string;
  from?: string;
  text?: string;
  createdAt?: string;
}

const kindOf = (type: string | undefined): PartnerKind => (type === "logistics_partner" ? "logistics_partner" : "supplier");

/** Everyone the seller can message: suppliers and delivery partners, latest conversation first. */
export async function fetchPartnerContacts(): Promise<PartnerContact[]> {
  try {
    const body = await apiBody<{ contacts?: RawContact[] }>("/api/conversations");
    return (body.contacts ?? [])
      .filter((contact) => contact.type !== "seller")
      .map((contact) => ({
        id: contact.id,
        name: contact.name,
        kind: kindOf(contact.type),
        lastMessage: contact.lastMessage ?? null,
        lastMessageAt: contact.lastMessageAt ?? null,
        unread: contact.unread ?? 0,
      }));
  } catch (error) {
    // Until /api/conversations accepts the app's Bearer token, show the partner chats the inbox already lists.
    const items = await fetchInbox().catch(() => null);
    if (!items) throw error;
    return items
      .filter((item) => item.source === "partner" && item.partner)
      .map((item) => ({
        id: item.partner!.contactUserId,
        name: item.name,
        kind: kindOf(item.partner!.role),
        lastMessage: item.preview || null,
        lastMessageAt: item.at,
        unread: item.unread,
      }));
  }
}

export async function fetchPartnerMessages(contactId: string): Promise<PartnerMessage[]> {
  const body = await apiBody<{ messages?: RawMessage[]; data?: { id: string; context?: PartnerContext | null }[] }>(`/api/conversations/${encodeURIComponent(contactId)}/messages`);
  const contexts = new Map((Array.isArray(body.data) ? body.data : []).map((message) => [message.id, message.context ?? null]));
  return (body.messages ?? []).map((message) => ({
    id: message.id,
    mine: message.from === "me",
    text: message.text ?? "",
    createdAt: message.createdAt ?? new Date().toISOString(),
    context: contexts.get(message.id) ?? null,
  }));
}

export async function sendPartnerMessage(contactId: string, text: string): Promise<PartnerMessage> {
  const body = await apiBody<{ message?: RawMessage }>(`/api/conversations/${encodeURIComponent(contactId)}/messages`, { method: "POST", json: { text } });
  const message = body.message;
  return { id: message?.id ?? `local-${Date.now()}`, mine: true, text: message?.text ?? text, createdAt: message?.createdAt ?? new Date().toISOString() };
}

export const PARTNER_LABEL: Record<PartnerKind, string> = { supplier: "Supplier", logistics_partner: "Delivery partner" };
