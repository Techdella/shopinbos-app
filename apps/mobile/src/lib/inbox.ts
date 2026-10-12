import { api } from "./api";
import type { InboxChannel } from "./inbox-pure";

// The all-in-one inbox: /api/app/inbox/** (src/lib/inbox on the web side). Customer conversations on every
// channel plus the seller's supplier and delivery-partner chats, in one list.

export type { InboxChannel };

export interface InboxListItem {
  key: string;
  source: "inbox" | "partner";
  id: string;
  channel: InboxChannel;
  name: string;
  sub: string | null;
  preview: string;
  at: string;
  unread: number;
  status: "open" | "snoozed" | "closed";
  snoozedUntil: string | null;
  assigneeEmail: string | null;
  tags: string[];
  avatarUrl: string | null;
  partner: { contactUserId: string; role: string } | null;
}

export interface InboxMessage {
  id: string;
  direction: "inbound" | "outbound" | "note";
  kind: string;
  body: string;
  status: string;
  error: string | null;
  authorName: string | null;
  attachments: Array<{ type: string; url?: string | null; name?: string | null; contentType?: string | null; mediaId?: string | null }>;
  createdAt: string;
}

export interface InboxThread {
  conversation: {
    id: string;
    channel: InboxChannel;
    channelLabel: string;
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    contactHandle: string | null;
    subject: string | null;
    status: "open" | "snoozed" | "closed";
    snoozedUntil: string | null;
    tags: string[];
    createdAt: string;
  };
  messages: InboxMessage[];
}

export const fetchInbox = () => api<InboxListItem[]>("/api/app/inbox/conversations");

export const fetchThread = (id: string) => api<InboxThread>(`/api/app/inbox/conversations/${encodeURIComponent(id)}`);

/** Reply on the conversation's own channel, or add a private note. */
export const sendInboxMessage = (id: string, body: string, mode: "reply" | "note" = "reply") =>
  api<{ id: string; status: string }>(`/api/app/inbox/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", json: { body, mode } });

/** Done (closed), back to open, or snoozed for some hours. */
export const setConversationStatus = (id: string, status: "open" | "snoozed" | "closed", snoozeHours?: number) =>
  api<{ id: string; status: string; snoozedUntil: string | null }>(`/api/app/inbox/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    json: { status, ...(status === "snoozed" ? { snoozeHours: snoozeHours ?? 24 } : {}) },
  });

// ─── Auto-replies and the Peggy chatbot ──────────────────────────────────────

export interface AutoReplySettings {
  autoReplyEnabled: boolean;
  autoReplyMode: "message" | "peggy";
  awayMessage: string;
}

/** The parts of the auto-reply rules the app edits; the rest is sent back as it came. */
export interface AutoReplyRules {
  hours: { enabled: boolean; days: Record<string, { open: boolean; from: string; to: string }> };
  channels: Record<string, boolean>;
  keywordsEnabled: boolean;
  keywords: Array<{ id: string; keywords: string[]; reply: string }>;
  ack: { enabled: boolean; message: string };
  mentionHours: boolean;
}

export interface ChatbotSettings {
  enabled: boolean;
  name: string;
  greeting: string;
  tone: "friendly" | "professional" | "playful";
  sources: { products: boolean; delivery: boolean; policies: boolean; faqs: boolean };
  faqs: Array<{ q: string; a: string }>;
  handoff: { keywords: string[]; message: string };
  when: "always" | "outside_hours";
}

export interface InboxAutomation {
  /** False until the database has the auto-reply table (the web shows the same note). */
  ready: boolean;
  autoReply: AutoReplyRules;
  chatbot: ChatbotSettings;
}

export const fetchAutomation = () => api<InboxAutomation>("/api/app/inbox/automation");

export const saveAutomation = (input: { autoReply?: AutoReplyRules; chatbot?: ChatbotSettings }) =>
  api<InboxAutomation>("/api/app/inbox/automation", { method: "PUT", json: input });

/** Away message on/off and its text (InboxSettings). GET is a mobile route; saving uses the web's PUT. */
export const fetchAutoReplySettings = () => api<AutoReplySettings & { aiAvailable: boolean }>("/api/mobile/inbox/auto-replies");

export const saveAutoReplySettings = (input: Partial<AutoReplySettings>) => api<AutoReplySettings>("/api/app/inbox/settings", { method: "PUT", json: input });
