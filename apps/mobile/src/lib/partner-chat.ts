import { apiBody } from "./api";

// Messages for suppliers and delivery partners: the same partner conversations the web portals show
// (/api/conversations, which accepts the app's Bearer token). For sellers, see partners.ts.
//   GET /api/conversations → { contacts: [{ id: other user's id, name, type: their role, lastMessage?, unread?, lastMessageAt? }] }
// Opening and sending reuse fetchPartnerMessages / sendPartnerMessage from partners.ts.

export interface ChatContact {
  id: string;
  name: string;
  role: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}

export async function fetchChatContacts(): Promise<ChatContact[]> {
  const body = await apiBody<{ contacts?: Array<{ id: string; name: string; type?: string; lastMessage?: string | null; unread?: number | null; lastMessageAt?: string | null }> }>("/api/conversations");
  return (body.contacts ?? []).map((contact) => ({
    id: contact.id,
    name: contact.name,
    role: contact.type ?? "seller",
    lastMessage: contact.lastMessage ?? null,
    lastMessageAt: contact.lastMessageAt ?? null,
    unread: contact.unread ?? 0,
  }));
}

export const ROLE_LABEL: Record<string, string> = { seller: "Shop", supplier: "Supplier", logistics_partner: "Delivery partner", admin: "Shopinbos" };
