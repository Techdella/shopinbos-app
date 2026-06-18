"use client";

import { useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon, MascotAvatar } from "@/components/ui";
import type { IconName } from "@/components/ui/Icon";

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  link?: string | null;
}

const activityTypes = ["all", "order", "inventory", "payment", "logistics", "product", "customer", "system"] as const;

const activityIcons: Record<string, IconName> = {
  order: "cart",
  inventory: "box",
  payment: "card",
  logistics: "truck",
  product: "tag",
  customer: "users",
  system: "settings",
};

const activityColors: Record<string, string> = {
  order: "var(--teal-500)",
  inventory: "var(--berry-500)",
  payment: "var(--success)",
  logistics: "var(--amber-500)",
  product: "var(--indigo-500)",
  customer: "var(--mint)",
  system: "var(--ink-500)",
};

function formatDateHeader(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = (today.getTime() - dStart.getTime()) / 86400000;
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[d.getDay()];
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function ActivityFeedPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filter !== "all") params.set("type", filter);
        const res = await fetch(`/api/activity?${params}`);
        const data = await res.json();
        if (Array.isArray(data.activities)) setActivities(data.activities);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [filter]);

  const grouped: Record<string, ActivityItem[]> = {};
  for (const act of activities) {
    const header = formatDateHeader(act.timestamp);
    if (!grouped[header]) grouped[header] = [];
    grouped[header].push(act);
  }

  return (
    <AppFrame role="seller" storeName="Your Store">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead title="Activity Feed" sub="Store history and event timeline" />

        <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 4 }}>
          {activityTypes.map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={filter === t ? "dbtn dBtn-mint dBtn-sm" : "dbtn dBtn-ghost dBtn-sm"}
              style={{
                border: filter === t ? "none" : "1px solid var(--ink-150)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-sec)" }}>Loading activity...</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="card" style={{ padding: "60px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <MascotAvatar role="seller" size={56} />
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-600)" }}>No activity yet</div>
            <div style={{ fontSize: 13, color: "var(--ink-400)", maxWidth: 300 }}>
              Store activity will appear here as you manage your business.
            </div>
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <div style={{
              position: "absolute", left: 72, top: 0, bottom: 0,
              width: 2, background: "var(--ink-100)",
            }} />
            {Object.entries(grouped).map(([dateLabel, items]) => (
              <div key={dateLabel} style={{ marginBottom: 24 }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: "var(--ink-400)",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                  marginBottom: 8, paddingLeft: 4,
                }}>
                  {dateLabel}
                </div>
                {items.map(act => {
                  const icon = activityIcons[act.type] ?? "settings";
                  const color = activityColors[act.type] ?? "var(--ink-500)";
                  return (
                    <div key={act.id} style={{
                      display: "flex", gap: 14, padding: "8px 0",
                      position: "relative", alignItems: "flex-start",
                    }}>
                      <div style={{
                        width: 44, textAlign: "right", flexShrink: 0,
                        fontSize: 11.5, color: "var(--ink-400)", paddingTop: 4,
                      }}>
                        {formatTime(act.timestamp)}
                      </div>
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%",
                        background: color + "18", color: color,
                        display: "grid", placeItems: "center", flexShrink: 0,
                        position: "relative", zIndex: 1, marginTop: 2,
                      }}>
                        <Icon name={icon} size={12} />
                      </div>
                      <div className="flex-1 min-w-0" style={{ paddingTop: 2 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink-800)" }}>
                          {act.title}
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 1, lineHeight: 1.4 }}>
                          {act.description}
                        </div>
                        {act.link && (
                          <a href={act.link} style={{
                            fontSize: 12, fontWeight: 600, color: "var(--teal-700)",
                            textDecoration: "none", marginTop: 4, display: "inline-block",
                          }}>
                            View details <Icon name="arrow" size={10} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppFrame>
  );
}
