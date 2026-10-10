"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@/components/ui";
import { sendMessage, getMessages, markConversationAsRead } from "@/app/actions/messaging";
import { useToast } from "@/components/ui/Toast";

interface Participant {
  id: string;
  name: string;
  role: string;
}

interface LastMessage {
  text: string;
  createdAt: string;
  read: boolean;
  senderId: string;
}

export interface InboxConversationSummary {
  id: string;
  participant1: Participant;
  participant2: Participant;
  lastMessage: LastMessage | null;
  updatedAt: string;
}

interface MessageItem {
  id: string;
  text: string;
  senderId: string;
  read: boolean;
  createdAt: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Avatar({ name, size = 32, role }: { name: string; size?: number; role?: string }) {
  const initials = name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  const colors: Record<string, string[]> = {
    seller: ["#f15928", "#d24414"],
    supplier: ["#195754", "#0c4a44"],
    logistics_partner: ["#5b6ad0", "#3a4ba6"],
    admin: ["#8aa843", "#5a7a28"],
  };
  const gradient = colors[role ?? ""] ?? ["#5b6ad0", "#3a4ba6"];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg,${gradient[0]},${gradient[1]})`,
        display: "grid",
        placeItems: "center",
        color: "white",
        fontWeight: 700,
        fontSize: size * 0.38,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export function InboxClient({
  conversations,
  currentUserId,
  emptyMessage = "No conversations yet. Messages will appear here.",
}: {
  conversations: InboxConversationSummary[];
  currentUserId: string;
  emptyMessage?: string;
}) {
  const [activeConvId, setActiveConvId] = useState<string | null>(conversations[0]?.id ?? null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!activeConvId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    getMessages(activeConvId)
      .then((items) => {
        setMessages(items);
        return markConversationAsRead(activeConvId);
      })
      .finally(() => setLoading(false));
  }, [activeConvId]);

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const otherParticipant = activeConv
    ? activeConv.participant1.id === currentUserId ? activeConv.participant2 : activeConv.participant1
    : null;

  async function handleSend(formData: FormData) {
    setSending(true);
    const res = await sendMessage(formData);
    setSending(false);
    if (res.success) {
      setText("");
      if (res.conversationId) {
        setActiveConvId(res.conversationId);
        const nextMessages = await getMessages(res.conversationId);
        setMessages(nextMessages);
      }
    } else {
      toast(res.error ?? "Failed to send", "error");
    }
  }

  return (
    <div className="card" style={{ display: "flex", height: "68vh", minHeight: 520, padding: 0, overflow: "hidden" }}>
      <div style={{ width: 330, borderRight: "1px solid var(--ink-100)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--ink-100)", fontWeight: 600, fontSize: 13 }}>
          Conversations ({conversations.length})
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {conversations.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}>
              {emptyMessage}
            </div>
          ) : conversations.map((conv) => {
            const other = conv.participant1.id === currentUserId ? conv.participant2 : conv.participant1;
            const isUnread = conv.lastMessage && !conv.lastMessage.read && conv.lastMessage.senderId !== currentUserId;
            return (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "10px 14px",
                  width: "100%",
                  border: "none",
                  borderBottom: "1px solid var(--ink-100)",
                  cursor: "pointer",
                  textAlign: "left",
                  background: activeConvId === conv.id ? "var(--teal-50)" : "transparent",
                }}
              >
                <Avatar name={other.name} role={other.role} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
                    <span style={{ fontWeight: isUnread ? 700 : 500, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isUnread ? "var(--ink-900)" : "var(--ink-700)" }}>
                      {other.name}
                    </span>
                    {conv.lastMessage && (
                      <span style={{ fontSize: 10.5, color: "var(--ink-500)", whiteSpace: "nowrap" }}>{formatTime(conv.lastMessage.createdAt)}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: "var(--ink-500)", textTransform: "capitalize" }}>{other.role.replace(/_/g, " ")}</span>
                    {isUnread && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--teal-600)" }} />}
                  </div>
                  {conv.lastMessage && (
                    <div style={{ fontSize: 11.5, color: isUnread ? "var(--ink-800)" : "var(--ink-500)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                      {conv.lastMessage.senderId === currentUserId ? "You: " : ""}{conv.lastMessage.text}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {activeConv && otherParticipant ? (
          <>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--ink-100)", display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 13 }}>
              <Avatar name={otherParticipant.name} size={30} role={otherParticipant.role} />
              <div>
                <div>{otherParticipant.name}</div>
                <div style={{ fontSize: 10.5, color: "var(--ink-500)", fontWeight: 400, textTransform: "capitalize" }}>{otherParticipant.role.replace(/_/g, " ")}</div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              {loading ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}>Loading messages...</div>
              ) : messages.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: "var(--ink-500)", fontSize: 13 }}>No messages yet. Send a message to start the conversation.</div>
              ) : messages.map((msg) => {
                const isMe = msg.senderId === currentUserId;
                return (
                  <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                    <div
                      style={{
                        maxWidth: "70%",
                        padding: "8px 12px",
                        borderRadius: 12,
                        background: isMe ? "var(--teal-600)" : "var(--ink-100)",
                        color: isMe ? "white" : "var(--ink-900)",
                        fontSize: 12.5,
                        lineHeight: 1.4,
                      }}
                    >
                      <div>{msg.text}</div>
                      <div style={{ fontSize: 9.5, marginTop: 4, opacity: 0.6, textAlign: "right" }}>
                        {formatTime(msg.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <form action={handleSend} style={{ padding: "8px 14px", borderTop: "1px solid var(--ink-100)", display: "flex", gap: 8 }}>
              <input type="hidden" name="conversationId" value={activeConv.id} />
              <input
                name="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="inp"
                placeholder="Type a message..."
                style={{ flex: 1 }}
                disabled={sending}
              />
              <button className="dbtn dBtn-mint" type="submit" disabled={sending || !text.trim()}>
                {sending ? "..." : <Icon name="send" size={14} />}
              </button>
            </form>
          </>
        ) : (
          <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--ink-500)", fontSize: 13, padding: 24, textAlign: "center" }}>
            <div>
              <Icon name="message" size={32} />
              <div style={{ marginTop: 8 }}>Select a conversation to view messages</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
