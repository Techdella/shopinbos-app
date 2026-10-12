import { Linking } from "react-native";
import { api } from "./api";

// Help: a person on WhatsApp, or the in-app chat with the Shopinbos team (the same support tickets as the
// web's "Talk to a person", /api/support/tickets).

/**
 * The support team's WhatsApp number, digits only with the country code (e.g. 234…).
 * TODO: set EXPO_PUBLIC_SUPPORT_WHATSAPP (the web uses NEXT_PUBLIC_SUPPORT_WHATSAPP) to the real support number.
 * Until it is set, "Chat with a person" opens the in-app chat with the team instead of WhatsApp.
 */
export const SUPPORT_WHATSAPP = (process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "");

/** Opens WhatsApp to the support number. Returns false when there's no number, or WhatsApp couldn't open. */
export async function openSupportWhatsApp(text = "Hello Shopinbos, I need help with my shop.") {
  if (!SUPPORT_WHATSAPP) return false;
  try {
    await Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`);
    return true;
  } catch {
    return false;
  }
}

export interface SupportTicketSummary {
  id: string;
  number: number;
  subject: string;
  topic: string;
  status: "open" | "pending" | "solved" | "closed";
  lastMessageAt: string;
  unread: boolean;
  preview: string;
}

export interface SupportMessage {
  id: string;
  authorType: "user" | "agent" | "ai" | "system";
  authorName: string | null;
  body: string;
  createdAt: string;
  attachments: Array<{ name: string; url: string }>;
}

export interface SupportTicket {
  id: string;
  number: number;
  subject: string;
  status: SupportTicketSummary["status"];
  answered: boolean;
  messages: SupportMessage[];
}

export const fetchSupportTickets = () => api<{ tickets: SupportTicketSummary[]; unread: number; ready: boolean }>("/api/support/tickets");

export const fetchSupportTicket = (number: number | string) => api<SupportTicket>(`/api/support/tickets/${encodeURIComponent(String(number))}`);

export const startSupportChat = (message: string, where: string) =>
  api<SupportTicket>("/api/support/tickets", { method: "POST", json: { topic: "other", message, path: `mobile app: ${where}`.slice(0, 300) } });

export const replySupportChat = (number: number | string, message: string) =>
  api<SupportTicket>(`/api/support/tickets/${encodeURIComponent(String(number))}/messages`, { method: "POST", json: { message } });
