"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Mascot, PillButton, Spinner, cx } from "@/components/app-ui";

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
  { key: "logistics", label: "Delivery" },
  { key: "product", label: "Products" },
  { key: "customer", label: "Customers" },
  { key: "supplier", label: "Suppliers" },
  { key: "storeBuilder", label: "Store builder" },
  { key: "marketing", label: "Marketing" },
  { key: "rexai", label: "Rex" },
  { key: "system", label: "System" },
] as const;

const priorities = ["all", "critical", "warning", "info", "success"] as const;

const PRIORITY_STYLE: Record<string, { tile: string; label: string; dot: string }> = {
  critical: { tile: "bg-app-danger-tint text-app-danger", label: "Urgent", dot: "bg-app-danger" },
  warning: { tile: "bg-[#FDF0D5] text-[#8A5A00]", label: "Heads up", dot: "bg-[#F2A93B]" },
  info: { tile: "bg-app-canvas text-app-ink", label: "Info", dot: "bg-app-ink-faint" },
  success: { tile: "bg-app-success-tint text-app-success", label: "Good news", dot: "bg-app-success" },
};

const TYPE_ICON: Record<string, IconName> = {
  order: "cart",
  inventory: "box",
  payment: "card",
  logistics: "truck",
  product: "tag",
  customer: "users",
  supplier: "people",
  storeBuilder: "layers",
  marketing: "megaphone",
  rexai: "sparkle",
  system: "settings",
};

const PRIORITY_LABEL: Record<(typeof priorities)[number], string> = { all: "Any", critical: "Urgent", warning: "Heads up", info: "Info", success: "Good news" };

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

export function NotificationCenter() {
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

  const chip = (on: boolean) =>
    cx(
      "inline-flex min-h-[40px] shrink-0 items-center rounded-full border px-4 text-[14px] font-bold transition",
      on ? "border-app-ink bg-app-ink text-white" : "border-app-line bg-white text-app-ink hover:border-app-line-strong",
    );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[14.5px] text-app-ink-soft" role="status">
          {loading ? "Loading…" : unreadCount > 0 ? `${unreadCount} unread on this page` : "You're all caught up."}
        </p>
        {unreadCount > 0 && (
          <PillButton tone="ink" size="md" onClick={handleMarkAllRead}>
            <Icon name="check" size={16} /> Mark all read
          </PillButton>
        )}
      </div>

      <nav aria-label="Notification type" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible">
        {categories.map(c => (
          <button key={c.key} type="button" aria-pressed={category === c.key} onClick={() => { setCategory(c.key); setPage(1); }} className={chip(category === c.key)}>
            {c.label}
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Priority">
        <span className="mr-1 text-[14px] font-bold text-app-ink-soft">Priority</span>
        {priorities.map(p => (
          <button key={p} type="button" aria-pressed={priority === p} onClick={() => { setPriority(p); setPage(1); }} className={chip(priority === p)}>
            {PRIORITY_LABEL[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <div role="status" className="flex items-center justify-center gap-3 rounded-[22px] border border-app-line bg-white py-16 text-[14px] text-app-ink-soft">
          <Spinner /> Loading notifications
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center rounded-[22px] border border-app-line bg-white px-6 py-14 text-center">
          <Mascot name="peggy" className="h-16 w-16" />
          <h2 className="mb-0 mt-3 text-[18px] font-extrabold">No notifications</h2>
          <p className="mb-0 mt-1.5 max-w-[360px] text-[14.5px] text-app-ink-soft">Nothing matches these filters right now.</p>
        </div>
      ) : (
        <>
          <ul className="m-0 list-none divide-y divide-app-line overflow-hidden rounded-[22px] border border-app-line bg-white p-0">
            {notifications.map((n) => {
              const style = PRIORITY_STYLE[n.priority] ?? PRIORITY_STYLE.info;
              const href = n.actionUrl ?? n.link ?? null;
              return (
                <li key={n.id} className={cx("flex gap-3 px-4 py-4 sm:gap-4 sm:px-5", !n.read && "bg-app-canvas/60")}>
                  <span className={cx("relative grid h-11 w-11 shrink-0 place-items-center rounded-[14px]", style.tile)}>
                    <Icon name={TYPE_ICON[n.type] ?? "settings"} size={18} />
                    {n.priority === "critical" && <span className={cx("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full", style.dot)} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                      <h3 className={cx("m-0 min-w-0 text-[14.5px]", n.read ? "font-semibold" : "font-extrabold")}>
                        {!n.read && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </h3>
                      <span className="shrink-0 whitespace-nowrap text-[12.5px] text-app-ink-soft">{formatTimeAgo(n.timestamp)}</span>
                    </div>
                    <p className="mb-0 mt-1 text-[13.5px] leading-[1.45] text-app-ink-soft">{n.description}</p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      {n.priority !== "info" && (
                        <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold", style.tile)}>
                          <span className={cx("h-1.5 w-1.5 rounded-full", style.dot)} />{style.label}
                        </span>
                      )}
                      {n.actionLabel && href && (
                        <a href={href} className="inline-flex min-h-[38px] items-center rounded-full bg-app-ink px-4 text-[13px] font-bold text-white no-underline hover:bg-black">
                          {n.actionLabel}
                        </a>
                      )}
                      <PillButton tone="white" size="sm" onClick={() => handleToggleRead(n.id, n.read)}>
                        <Icon name={n.read ? "eye" : "check"} size={14} />
                        {n.read ? "Mark unread" : "Mark read"}
                      </PillButton>
                    </div>
                  </div>
                  {!n.read && <span aria-hidden className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-app-accent" />}
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-center gap-2">
              <PillButton tone="white" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</PillButton>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} type="button" aria-current={page === p ? "page" : undefined} onClick={() => setPage(p)} className={cx("grid h-10 min-w-10 place-items-center rounded-full px-3 text-[13.5px] font-bold", page === p ? "bg-app-ink text-white" : "border border-app-line bg-white")}>
                  {p}
                </button>
              ))}
              <PillButton tone="white" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</PillButton>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
