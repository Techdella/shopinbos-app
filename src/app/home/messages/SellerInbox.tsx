"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/app-ui";
import { useToast } from "@/components/ui/Toast";
import type { InboxConversationSummary } from "@/components/messaging/InboxClient";
import { sendMessage, getMessages, markConversationAsRead } from "@/app/actions/messaging";
import { Avatar } from "@/components/seller-core";

// The seller inbox in the 2026 look: conversation list and thread side by side on laptops,
// one at a time on phones. Same server actions as the shared InboxClient.

interface MessageItem {
  id: string;
  text: string;
  senderId: string;
  read: boolean;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  supplier: "Supplier",
  logistics_partner: "Delivery partner",
  seller: "Seller",
  admin: "Shopinbos",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (diff < 604800000) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function SellerInbox({
  conversations,
  currentUserId,
  emptyMessage,
}: {
  conversations: InboxConversationSummary[];
  currentUserId: string;
  emptyMessage: string;
}) {
  const [activeConvId, setActiveConvId] = useState<string | null>(conversations[0]?.id ?? null);
  const [pane, setPane] = useState<"list" | "thread">("list");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    <div className="flex h-[calc(100dvh-220px)] min-h-[480px] overflow-hidden rounded-[22px] border border-app-line bg-white">
      {/* Conversation list */}
      <section aria-label="Conversations" className={cx("min-w-0 flex-col border-app-line lg:flex lg:w-[340px] lg:shrink-0 lg:border-r 2xl:w-[400px]", pane === "list" ? "flex w-full" : "hidden")}>
        <h2 className="m-0 border-b border-app-line px-4 py-3.5 text-[15px] font-extrabold sm:px-5">
          Conversations <span className="font-semibold text-app-ink-soft">· {conversations.length}</span>
        </h2>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="m-0 p-6 text-center text-[14px] text-app-ink-soft">{emptyMessage}</p>
          ) : (
            <ul className="m-0 list-none divide-y divide-app-line p-0">
              {conversations.map((conv) => {
                const other = conv.participant1.id === currentUserId ? conv.participant2 : conv.participant1;
                const isUnread = Boolean(conv.lastMessage && !conv.lastMessage.read && conv.lastMessage.senderId !== currentUserId);
                const active = activeConvId === conv.id;
                return (
                  <li key={conv.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveConvId(conv.id);
                        setPane("thread");
                      }}
                      aria-current={active ? "true" : undefined}
                      className={cx("flex w-full items-start gap-3 px-4 py-3 text-left transition sm:px-5", active ? "bg-app-canvas" : "hover:bg-app-canvas/60")}
                    >
                      <Avatar name={other.name} size={42} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className={cx("truncate text-[14.5px]", isUnread ? "font-extrabold" : "font-bold")}>{other.name}</span>
                          {conv.lastMessage && <span className="shrink-0 text-[12px] text-app-ink-soft">{formatTime(conv.lastMessage.createdAt)}</span>}
                        </span>
                        <span className="flex items-center gap-1.5 text-[12.5px] text-app-ink-soft">
                          {ROLE_LABEL[other.role] ?? other.role.replace(/_/g, " ")}
                          {isUnread && (
                            <>
                              <span aria-hidden className="h-2 w-2 rounded-full bg-app-accent" />
                              <span className="sr-only">Unread</span>
                            </>
                          )}
                        </span>
                        {conv.lastMessage && (
                          <span className={cx("mt-0.5 block truncate text-[13px]", isUnread ? "font-semibold text-app-ink" : "text-app-ink-soft")}>
                            {conv.lastMessage.senderId === currentUserId ? "You: " : ""}{conv.lastMessage.text}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Thread */}
      <section aria-label="Messages" className={cx("min-w-0 flex-1 flex-col lg:flex", pane === "thread" ? "flex" : "hidden")}>
        {activeConv && otherParticipant ? (
          <>
            <div className="flex items-center gap-3 border-b border-app-line px-3 py-2.5 sm:px-5">
              <button type="button" onClick={() => setPane("list")} aria-label="Back to conversations" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-app-canvas lg:hidden">
                <Icon name="arrowLeft" size={18} />
              </button>
              <Avatar name={otherParticipant.name} size={38} />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-extrabold">{otherParticipant.name}</div>
                <div className="text-[12.5px] text-app-ink-soft">{ROLE_LABEL[otherParticipant.role] ?? otherParticipant.role.replace(/_/g, " ")}</div>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-app-canvas/50 px-3 py-4 sm:px-5" aria-live="polite">
              {loading ? (
                <p className="m-0 p-6 text-center text-[14px] text-app-ink-soft">Loading messages…</p>
              ) : messages.length === 0 ? (
                <p className="m-0 p-6 text-center text-[14px] text-app-ink-soft">No messages yet. Send a message to start the conversation.</p>
              ) : messages.map((msg) => {
                const isMe = msg.senderId === currentUserId;
                return (
                  <div key={msg.id} className={cx("flex", isMe ? "justify-end" : "justify-start")}>
                    <div className={cx("max-w-[85%] rounded-[18px] px-3.5 py-2.5 text-[14px] leading-[1.45] sm:max-w-[70%]", isMe ? "rounded-br-[6px] bg-app-ink text-white" : "rounded-bl-[6px] border border-app-line bg-white")}>
                      <div className="whitespace-pre-wrap break-words">{msg.text}</div>
                      <div className={cx("mt-1 text-right text-[11px]", isMe ? "text-white/60" : "text-app-ink-faint")}>{formatTime(msg.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <form action={handleSend} className="flex items-center gap-2 border-t border-app-line px-3 py-2.5 sm:px-5">
              <input type="hidden" name="conversationId" value={activeConv.id} />
              <input
                name="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-label={`Message ${otherParticipant.name}`}
                placeholder="Write a message"
                disabled={sending}
                className="h-11 min-w-0 flex-1 rounded-full border border-app-line bg-white px-4 text-[16px] outline-none placeholder:text-app-ink-faint focus:border-app-ink sm:text-[15px]"
              />
              <button type="submit" disabled={sending || !text.trim()} aria-label="Send" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-app-accent text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
                <Icon name="send" size={17} />
              </button>
            </form>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center text-[14px] text-app-ink-soft">
            <div>
              <Icon name="message" size={30} className="mx-auto" />
              <p className="mb-0 mt-2">Pick a conversation to read it.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
