"use client";

import { useState, useEffect } from "react";
import { Icon, MascotAvatar } from "@/components/ui";

interface SupportChatModalProps {
  open: boolean;
  onClose: () => void;
}

export function SupportChatModal({ open, onClose }: SupportChatModalProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<Array<{ role: "agent" | "user"; text: string }>>([
    { role: "agent", text: "Hi there! I'm Rex, your support assistant. How can I help you today?" },
  ]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleSend = () => {
    if (!message.trim()) return;
    setChat((prev) => [...prev, { role: "user", text: message.trim() }]);
    setMessage("");
    setTimeout(() => {
      setChat((prev) => [...prev, {
        role: "agent",
        text: "Thanks for your message! Our team will review this and get back to you shortly. For urgent issues, you can also reach us at support@shopinbos.com.",
      }]);
    }, 800);
  };

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
        className="absolute bottom-0 right-0 h-full flex flex-col"
        style={{
          width: 420,
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
          <div className="flex items-center gap-3">
            <MascotAvatar role="supplier" size={34} />
            <div>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>
                Need help?
              </h2>
              <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>Support chat · 24/7</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: "var(--ink-75)", border: "1px solid var(--ink-150)",
              cursor: "pointer", color: "var(--ink-500)",
            }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
          {chat.map((msg, i) => (
            <div key={i} style={{
              display: "flex", gap: 10, marginBottom: 14,
              flexDirection: msg.role === "user" ? "row-reverse" : "row",
            }}>
              {msg.role === "agent" && (
                <MascotAvatar role="supplier" size={30} />
              )}
              <div style={{
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                background: msg.role === "user" ? "var(--teal-600)" : "var(--ink-50)",
                color: msg.role === "user" ? "white" : "var(--ink-800)",
                fontSize: 13,
                lineHeight: 1.5,
              }}>
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid var(--ink-100)",
          display: "flex", gap: 10,
        }}>
          <input
            className="inp"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            placeholder="Type your message..."
            style={{ flex: 1 }}
          />
          <button
            type="button"
            onClick={handleSend}
            className="dbtn dBtn-mint"
            style={{ padding: "8px 16px", flexShrink: 0 }}
            disabled={!message.trim()}
          >
            <Icon name="arrow" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
