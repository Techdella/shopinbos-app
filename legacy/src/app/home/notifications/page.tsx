"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon, MascotAvatar } from "@/components/ui";

type Priority = "critical" | "warning" | "info" | "success";
type NotificationType = "order" | "inventory" | "payment" | "logistics" | "product" | "customer" | "supplier" | "storeBuilder" | "marketing" | "rexai" | "system";

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

const categories = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "order", label: "Orders" },
  { key: "inventory", label: "Inventory" },
  { key: "payment", label: "Payments" },
  { key: "logistics", label: "Logistics" },
  { key: "product", label: "Products" },
  { key: "customer", label: "Customers" },
  { key: "supplier", label: "Suppliers" },
  { key: "storeBuilder", label: "Store Builder" },
  { key: "marketing", label: "Marketing" },
  { key: "rexai", label: "RexAI" },
  { key: "system", label: "System" },
] as const;

const priorities = ["all", "critical", "warning", "info", "success"] as const;

const priorityColors: Record<string, { bg: string; text: string }> = {
  critical: { bg: "var(--rose-50)", text: "var(--rose-600)" },
  warning:  { bg: "var(--amber-50)", text: "var(--amber-600)" },
  info:     { bg: "var(--teal-50)", text: "var(--teal-700)" },
  success:  { bg: "var(--success-bg)", text: "var(--success)" },
};

const typeInfo: Record<string, { icon: string; color: string }> = {
  order:       { icon: "cart",      color: "var(--teal-500)" },
  inventory:   { icon: "box",       color: "var(--berry-500)" },
  payment:     { icon: "card",      color: "var(--success)" },
  logistics:   { icon: "truck",     color: "var(--amber-500)" },
  product:     { icon: "tag",       color: "var(--indigo-500)" },
  customer:    { icon: "users",     color: "var(--mint)" },
  supplier:    { icon: "people",    color: "var(--ink-600)" },
  storeBuilder:{ icon: "layers",    color: "var(--berry-500)" },
  marketing:   { icon: "megaphone", color: "var(--rose-500)" },
  rexai:       { icon: "chip",      color: "var(--lime-500)" },
  system:      { icon: "settings",  color: "var(--ink-500)" },
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function NotificationCenterPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", page: String(page) });
      if (category !== "all") params.set("type", category);
      if (priority !== "all") params.set("priority", priority);
      const res = await fetch(`/api/notifications?${params}`);
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications ?? []);
        setTotalPages(data.totalPages ?? 1);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [category, priority, page]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleToggleRead = async (id: string, currentRead: boolean) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, read: !currentRead }),
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: !currentRead } : n));
    } catch {
      // silent
    }
  };

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

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <AppFrame role="seller" storeName="Your Store">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Notification Center"
          sub={unreadCount > 0 ? `${unreadCount} unread` : "Stay updated with your store activity"}
          actions={
            unreadCount > 0 ? (
              <button onClick={handleMarkAllRead}
                className="dbtn dBtn-mint"
                style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <Icon name="check" size={14} /> Mark all read
              </button>
            ) : undefined
          }
        />

        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 4 }}>
          {categories.map(c => (
            <button
              key={c.key}
              onClick={() => { setCategory(c.key); setPage(1); }}
              className={category === c.key ? "dbtn dBtn-mint dBtn-sm" : "dbtn dBtn-ghost dBtn-sm"}
              style={{
                border: category === c.key ? "none" : "1px solid var(--ink-150)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-500)" }}>Priority:</span>
          {priorities.map(p => (
            <button
              key={p}
              onClick={() => { setPriority(p); setPage(1); }}
              className={priority === p ? "dbtn dBtn-sm" : "dbtn dBtn-ghost dBtn-sm"}
              style={{
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-sec)" }}>Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="card" style={{ padding: "60px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <MascotAvatar role="seller" size={56} />
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-600)" }}>No notifications</div>
            <div style={{ fontSize: 13, color: "var(--ink-400)", maxWidth: 300 }}>
              No notifications match your current filters.
            </div>
          </div>
        ) : (
          <>
            <div className="card" style={{ padding: 0, overflow: "hidden", borderRadius: 14 }}>
              {notifications.map((n, idx) => {
                const info = typeInfo[n.type] ?? typeInfo.system;
                const pc = priorityColors[n.priority] ?? priorityColors.info;
                return (
                  <div key={n.id} style={{
                    display: "flex", gap: 14, padding: "14px 18px",
                    borderBottom: idx < notifications.length - 1 ? "1px solid var(--ink-100)" : "none",
                    background: n.read ? "transparent" : "var(--teal-50)",
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12,
                      background: pc.bg,
                      display: "grid", placeItems: "center", flexShrink: 0,
                      color: pc.text,
                      position: "relative",
                    }}>
                      <Icon name={info.icon as any} size={18} />
                      {n.priority === "critical" && (
                        <span style={{
                          position: "absolute", top: -2, right: -2,
                          width: 10, height: 10, borderRadius: "50%",
                          background: pc.text,
                        }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ fontWeight: n.read ? 500 : 650, fontSize: 14, color: "var(--ink-900)" }}>
                          {n.title}
                        </div>
                        <span style={{ fontSize: 11.5, color: "var(--ink-400)", whiteSpace: "nowrap", marginTop: 2 }}>
                          {formatTimeAgo(n.timestamp)}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 3, lineHeight: 1.4 }}>
                        {n.description}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        {n.actionLabel && (
                          <button className="dbtn dBtn-sm dBtn-mint" style={{ border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                            {n.actionLabel}
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleRead(n.id, n.read)}
                          className="dbtn dBtn-sm dBtn-ghost"
                          style={{ border: "1px solid var(--ink-150)", cursor: "pointer", fontFamily: "inherit" }}
                        >
                          <Icon name={n.read ? "eye" : "check"} size={12} />
                          {n.read ? "Mark unread" : "Mark read"}
                        </button>
                      </div>
                    </div>
                    {!n.read && (
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: "var(--teal-600)", marginTop: 6, flexShrink: 0,
                      }} />
                    )}
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 8, alignItems: "center" }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="dbtn dBtn-sm dBtn-ghost"
                  style={{ border: "1px solid var(--ink-150)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={page === p ? "dbtn dBtn-sm dBtn-mint" : "dbtn dBtn-sm dBtn-ghost"}
                    style={{
                      border: page === p ? "none" : "1px solid var(--ink-150)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="dbtn dBtn-sm dBtn-ghost"
                  style={{ border: "1px solid var(--ink-150)", cursor: "pointer", fontFamily: "inherit" }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AppFrame>
  );
}
