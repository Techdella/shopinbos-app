"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import type { IconName } from "@/components/ui/Icon";
import { MascotAvatar } from "@/components/ui/MascotAvatar";
import { useRouter } from "next/navigation";

type Priority = "critical" | "warning" | "info" | "success";
type NotificationType = "order" | "inventory" | "payment" | "logistics" | "product" | "marketing" | "rexai" | "system";

interface Notification {
  id: string;
  type: NotificationType;
  priority: Priority;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  link?: string | null;
  actionLabel?: string | null;
  actionUrl?: string | null;
}

type SectionTab = "unread" | "orders" | "inventory" | "payments" | "logistics" | "products" | "marketing" | "rexai" | "system";

const sectionTabs: { key: SectionTab; label: string }[] = [
  { key: "unread", label: "Unread" },
  { key: "orders", label: "Orders" },
  { key: "inventory", label: "Inventory" },
  { key: "payments", label: "Payments" },
  { key: "logistics", label: "Logistics" },
  { key: "products", label: "Products" },
  { key: "marketing", label: "Marketing" },
  { key: "rexai", label: "RexAI" },
  { key: "system", label: "System" },
];

const typeConfig: Record<NotificationType, { icon: IconName; label: string }> = {
  order:     { icon: "cart",      label: "Order" },
  inventory: { icon: "box",       label: "Inventory" },
  payment:   { icon: "card",      label: "Payment" },
  logistics: { icon: "truck",     label: "Logistics" },
  product:   { icon: "tag",       label: "Product" },
  marketing: { icon: "megaphone", label: "Marketing" },
  rexai:     { icon: "chip",      label: "RexAI" },
  system:    { icon: "settings",  label: "System" },
};

const priorityColors: Record<Priority, { bg: string; text: string; dot: string }> = {
  critical: { bg: "var(--rose-50)", text: "var(--rose-600)", dot: "var(--rose-500)" },
  warning:  { bg: "var(--amber-50)", text: "var(--amber-600)", dot: "var(--amber-500)" },
  info:     { bg: "var(--teal-50)", text: "var(--teal-700)", dot: "var(--teal-500)" },
  success:  { bg: "var(--success-bg)", text: "var(--success)", dot: "var(--success)" },
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function groupByDay(items: Notification[]): Array<{ label: string; items: Notification[] }> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());

  const groups = [
    { label: "Today", items: [] as Notification[] },
    { label: "Yesterday", items: [] as Notification[] },
    { label: "This Week", items: [] as Notification[] },
    { label: "Earlier", items: [] as Notification[] },
  ];

  for (const n of items) {
    const d = new Date(n.timestamp);
    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (dStart.getTime() === today.getTime()) {
      groups[0].items.push(n);
    } else if (dStart.getTime() === yesterday.getTime()) {
      groups[1].items.push(n);
    } else if (d >= startOfWeek) {
      groups[2].items.push(n);
    } else {
      groups[3].items.push(n);
    }
  }
  return groups.filter(g => g.items.length > 0);
}

interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
}

function SkeletonRow() {
  return (
    <div style={{ display: "flex", gap: 12, padding: "10px 20px", alignItems: "center" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--ink-100)", flexShrink: 0, animation: "pulse 1.5s infinite" }} />
      <div className="flex-1" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ height: 12, width: "60%", borderRadius: 4, background: "var(--ink-100)", animation: "pulse 1.5s infinite" }} />
        <div style={{ height: 10, width: "85%", borderRadius: 4, background: "var(--ink-100)", animation: "pulse 1.5s infinite" }} />
      </div>
      <div style={{ height: 10, width: 30, borderRadius: 4, background: "var(--ink-100)", animation: "pulse 1.5s infinite" }} />
    </div>
  );
}

export function NotificationsDrawer({ open, onClose }: NotificationsDrawerProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionTab>("unread");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

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

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (activeSection !== "unread") {
        params.set("type", activeSection);
      }
      const res = await fetch(`/api/notifications?${params}`);
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeSection]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      // silent
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {
      // silent
    }
  };

  const handleClick = async (n: Notification) => {
    if (!n.read) await handleMarkRead(n.id);
    if (n.link) router.push(n.link);
    onClose();
  };

  const filtered = activeSection === "unread"
    ? notifications.filter(n => !n.read)
    : notifications.filter(n => n.type === activeSection);

  const groups = groupByDay(filtered);
  const unreadCount = notifications.filter(n => !n.read).length;

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
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 700,
                color: "var(--ink-900)",
                fontFamily: "var(--font-display)",
              }}
            >
              Notifications
            </h2>
            {unreadCount > 0 && (
              <span
                style={{
                  background: "var(--teal-600)",
                  color: "white",
                  fontSize: 10.5,
                  fontWeight: 700,
                  borderRadius: "50%",
                  width: 20,
                  height: 20,
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="flex items-center gap-1"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--teal-700)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                  fontFamily: "inherit",
                }}
              >
                <Icon name="check" size={12} /> Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center"
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "var(--ink-75)",
                border: "1px solid var(--ink-150)",
                cursor: "pointer",
                color: "var(--ink-500)",
              }}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        </div>

        <div
          className="flex gap-1 px-5 pt-3 pb-0 shrink-0 overflow-x-auto"
          style={{ borderBottom: "1px solid var(--ink-100)" }}
        >
          {sectionTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveSection(tab.key)}
              style={{
                padding: "8px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                fontFamily: "inherit",
                color: activeSection === tab.key ? "var(--teal-700)" : "var(--ink-600)",
                borderBottom: activeSection === tab.key ? "2px solid var(--teal-700)" : "2px solid transparent",
                marginBottom: -1,
                cursor: "pointer",
                background: "none",
                borderTop: 0,
                borderLeft: 0,
                borderRight: 0,
                whiteSpace: "nowrap",
                transition: "color 0.12s, border-color 0.12s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div style={{ padding: "16px 0" }}>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
              <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
            </div>
          ) : groups.length > 0 ? (
            <div>
              {groups.map(group => (
                <div key={group.label}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--ink-400)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      padding: "12px 20px 6px",
                    }}
                  >
                    {group.label}
                  </div>
                  {group.items.map(n => {
                    const cfg = typeConfig[n.type] ?? typeConfig.system;
                    const pc = priorityColors[n.priority] ?? priorityColors.info;
                    const bg = n.read ? "transparent" : "var(--ink-50)";
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleClick(n)}
                        style={{
                          display: "flex",
                          gap: 12,
                          padding: "10px 20px",
                          background: bg,
                          borderBottom: "1px solid var(--ink-75)",
                          cursor: "pointer",
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = "var(--ink-75)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = bg; }}
                      >
                        <div
                          className="shrink-0 flex items-center justify-center"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: pc.dot + "18",
                            color: pc.dot,
                            position: "relative",
                          }}
                        >
                          <Icon name={cfg.icon} size={16} />
                          {n.priority === "critical" && (
                            <span
                              style={{
                                position: "absolute",
                                top: -2,
                                right: -2,
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: pc.dot,
                              }}
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div
                              style={{
                                fontWeight: n.read ? 500 : 650,
                                fontSize: 13,
                                color: "var(--ink-800)",
                                lineHeight: 1.3,
                              }}
                            >
                              {n.title}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0" style={{ marginTop: 1 }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "var(--ink-400)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatTimeAgo(n.timestamp)}
                              </span>
                              {!n.read && (
                                <span
                                  style={{
                                    width: 7,
                                    height: 7,
                                    borderRadius: "50%",
                                    background: "var(--teal-500)",
                                    display: "inline-block",
                                  }}
                                />
                              )}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: 12.5,
                              color: "var(--ink-500)",
                              marginTop: 1,
                              lineHeight: 1.4,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {n.description}
                          </div>
                          {n.actionLabel && (
                            <button
                              onClick={e => { e.stopPropagation(); if (n.actionUrl) router.push(n.actionUrl); }}
                              className="dbtn dBtn-sm dBtn-mint"
                              style={{
                                marginTop: 6,
                                border: "none",
                                cursor: "pointer",
                                fontFamily: "inherit",
                                fontSize: 11.5,
                                padding: "4px 10px",
                              }}
                            >
                              {n.actionLabel}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 24px",
                gap: 12,
              }}
            >
              <MascotAvatar role="seller" size={56} />
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink-600)", textAlign: "center" }}>
                {activeSection === "unread" ? "No unread notifications" : "No notifications"}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-400)", textAlign: "center", maxWidth: 240 }}>
                {activeSection === "unread"
                  ? "You're all caught up!"
                  : "No notifications in this category yet."}
              </div>
            </div>
          )}
        </div>

        <div
          className="shrink-0 px-5 py-3"
          style={{ borderTop: "1px solid var(--ink-100)" }}
        >
          <button
            onClick={() => { onClose(); router.push("/home/notifications"); }}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--teal-700)",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 6,
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
              width: "100%",
            }}
          >
            View all notifications
            <Icon name="arrow" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
