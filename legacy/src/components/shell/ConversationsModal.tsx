"use client";

import { useState, useEffect } from "react";
import { Icon, MascotAvatar } from "@/components/ui";

interface ConversationsModalProps {
  open: boolean;
  onClose: () => void;
  preselectedContactId?: string | null;
}

type ContactType = "supplier" | "logistics_partner";

interface Contact {
  id: string;
  name: string;
  type: ContactType;
  lastMessage?: string;
  unread?: number;
}

export function ConversationsModal({ open, onClose, preselectedContactId }: ConversationsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [tab, setTab] = useState<"all" | ContactType>("all");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const [messages, setMessages] = useState<Array<{ from: "me" | string; text: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [sendError, setSendError] = useState("");
  const [initialPreselect, setInitialPreselect] = useState(preselectedContactId ?? null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
      fetchContacts();
    } else {
      setVisible(false);
      setSelectedContact(null);
      setMessages([]);
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (preselectedContactId && preselectedContactId !== initialPreselect) {
      setInitialPreselect(preselectedContactId);
    }
  }, [preselectedContactId, initialPreselect]);

  useEffect(() => {
    if (contacts.length > 0 && initialPreselect && !selectedContact) {
      const match = contacts.find((c) => c.id === initialPreselect);
      if (match) {
        openContact(match.id);
        setInitialPreselect(null);
      }
    }
  }, [contacts, initialPreselect, selectedContact]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (res.ok) {
        setContacts(data.contacts ?? []);
      }
    } catch {
      // fallback — empty
    } finally {
      setLoading(false);
    }
  };

  const openContact = async (id: string) => {
    setSelectedContact(id);
    setSendError("");
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      const data = await res.json();
      if (res.ok) {
        setMessages(data.messages ?? []);
      }
    } catch {
      setMessages([]);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedContact) return;
    const text = messageText.trim();
    setMessageText("");
    setSendError("");
    setMessages((prev) => [...prev, { from: "me", text }]);
    try {
      const res = await fetch(`/api/conversations/${selectedContact}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message ?? "Message could not be sent");
      }
    } catch {
      setMessages((prev) => prev.filter((msg, index) => !(index === prev.length - 1 && msg.from === "me" && msg.text === text)));
      setMessageText(text);
      setSendError("Message could not be sent. Please try again.");
    }
  };

  const filtered = tab === "all" ? contacts : contacts.filter((c) => c.type === tab);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        onClick={onClose}
        className="absolute inset-0"
        style={{
          background: "rgba(15,25,22,0.35)",
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms ease-out",
        }}
      />
      <div
        className="absolute right-0 top-0 h-full flex flex-col"
        style={{
          width: 480,
          background: "var(--paper)",
          borderLeft: "1px solid var(--ink-150)",
          boxShadow: "var(--shd-lg)",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 200ms ease-out",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: "1px solid var(--ink-100)" }}
        >
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "var(--ink-900)", fontFamily: "var(--font-display)" }}>
            Messages
          </h2>
          <button
            type="button" onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: "var(--ink-75)", border: "1px solid var(--ink-150)",
              cursor: "pointer", color: "var(--ink-500)",
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3 pb-0 shrink-0" style={{ borderBottom: "1px solid var(--ink-100)" }}>
          {[
            { id: "all", label: "All" },
            { id: "supplier", label: "Suppliers" },
            { id: "logistics_partner", label: "Logistics" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              style={{
                padding: "8px 12px", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit",
                color: tab === t.id ? "var(--teal-700)" : "var(--ink-600)",
                borderBottom: tab === t.id ? "2px solid var(--teal-700)" : "2px solid transparent",
                marginBottom: -1, cursor: "pointer", background: "none",
                borderTop: 0, borderLeft: 0, borderRight: 0, whiteSpace: "nowrap",
              }}
            >{t.label}</button>
          ))}
        </div>

        <div className="flex-1 flex" style={{ minHeight: 0 }}>
          {selectedContact ? (
            <>
              <div className="flex-1 flex flex-col">
                <div
                  className="flex items-center gap-3 px-4 py-3 shrink-0"
                  style={{ borderBottom: "1px solid var(--ink-100)" }}
                >
                  <button onClick={() => setSelectedContact(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-500)" }}
                  >
                    <Icon name="arrowLeft" size={16} />
                  </button>
                  <MascotAvatar role={contacts.find((c) => c.id === selectedContact)?.type === "logistics_partner" ? "logistics_partner" : "supplier"} size={30} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-900)" }}>
                    {contacts.find((c) => c.id === selectedContact)?.name ?? "Contact"}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
                  {messages.map((msg, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: msg.from === "me" ? "flex-end" : "flex-start",
                      marginBottom: 10,
                    }}>
                      <div style={{
                        maxWidth: "70%",
                        padding: "8px 14px",
                        borderRadius: msg.from === "me" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                        background: msg.from === "me" ? "var(--teal-600)" : "var(--ink-50)",
                        color: msg.from === "me" ? "white" : "var(--ink-800)",
                        fontSize: 13,
                      }}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && (
                    <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--ink-400)", fontSize: 13 }}>
                      No messages yet. Start the conversation!
                    </div>
                  )}
                </div>
                <div style={{ padding: "10px 14px", borderTop: "1px solid var(--ink-100)", display: "flex", gap: 8 }}>
                  <input className="inp" value={messageText} onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                    placeholder="Type a message..." style={{ flex: 1 }}
                  />
                  <button className="dbtn dBtn-mint" onClick={sendMessage} disabled={!messageText.trim()} style={{ padding: "8px 14px" }}>
                    <Icon name="arrow" size={14} />
                  </button>
                </div>
                {sendError ? (
                  <div style={{ padding: "0 14px 10px", fontSize: 12, color: "var(--danger)" }}>{sendError}</div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--ink-400)" }}>Loading contacts...</div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--ink-400)" }}>
                  <MascotAvatar role="seller" size={48} />
                  <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: "var(--ink-600)" }}>No conversations yet</div>
                  <div style={{ fontSize: 12.5, marginTop: 4 }}>Contact suppliers or logistics partners to get started.</div>
                </div>
              ) : (
                filtered.map((contact) => (
                  <div key={contact.id} onClick={() => openContact(contact.id)}
                    style={{
                      display: "flex", gap: 12, padding: "12px 20px", cursor: "pointer",
                      borderBottom: "1px solid var(--ink-75)",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--ink-50)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <MascotAvatar role={contact.type === "logistics_partner" ? "logistics_partner" : "supplier"} size={38} />
                    <div className="flex-1 min-w-0">
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink-900)" }}>{contact.name}</span>
                        {contact.unread ? (
                          <span style={{
                            background: "var(--teal-600)", color: "white", fontSize: 10.5,
                            borderRadius: "50%", width: 18, height: 18,
                            display: "grid", placeItems: "center", fontWeight: 700,
                          }}>{contact.unread}</span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {contact.lastMessage ?? "No messages yet"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
