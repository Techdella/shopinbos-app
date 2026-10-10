"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { RexAICopywriter } from "@/components/marketing/RexAICopywriter";

interface Campaign {
  id: string;
  name: string;
  subject: string;
  campaignType: string;
  status: string;
  sentCount: number;
  openCount: number;
  clickCount: number;
  revenueGenerated: number;
  conversionCount: number;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

function fmtCurrency(amount: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { dateStyle: "medium" });
}

function statusBadgeVariant(status: string): "success" | "mint" | "warn" | "soft" {
  const map: Record<string, "success" | "mint" | "warn" | "soft"> = {
    sent: "success",
    sending: "mint",
    scheduled: "mint",
    draft: "soft",
    cancelled: "warn",
  };
  return map[status] ?? "soft";
}

const STATUS_FILTERS = ["All", "Draft", "Scheduled", "Sent", "Cancelled"];

export default function CampaignsPage() {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "All") params.set("status", statusFilter.toLowerCase());
      const res = await fetch(`/api/store/campaigns?${params}`);
      const data = await res.json();
      if (Array.isArray(data.data)) setCampaigns(data.data);
    } catch {
      toast("Could not load campaigns", "error");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => { void fetchCampaigns(); }, [fetchCampaigns]);

  const totalSent = campaigns.reduce((sum, c) => sum + (c.status === "sent" ? c.sentCount : 0), 0);
  const totalOpens = campaigns.reduce((sum, c) => sum + (c.status === "sent" ? c.openCount : 0), 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + (c.status === "sent" ? c.clickCount || 0 : 0), 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.revenueGenerated || 0), 0);
  const openRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;
  const clickRate = totalOpens > 0 ? Math.round((totalClicks / totalOpens) * 100) : 0;

  return (
    <AppFrame role="seller">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Email Campaigns"
          sub="Manage your broadcast email campaigns"
          actions={
            <div style={{ display: "flex", gap: 8 }}>
              <RexAICopywriter />
              <a href="/home/marketing/campaigns/new"
                className="dbtn dBtn-mint" style={{ textDecoration: "none" }}>
                <Icon name="plus" size={14} /> New Campaign
              </a>
            </div>
          }
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "Total Sent", value: String(totalSent), color: "var(--teal-600)" },
            { label: "Open Rate", value: `${openRate}%`, color: "var(--success)" },
            { label: "Click Rate", value: `${clickRate}%`, color: "var(--berry-500)" },
            { label: "Revenue Generated", value: fmtCurrency(totalRevenue), color: "var(--amber-600)" },
          ].map((s) => (
            <div key={s.label} className="card" style={{ padding: "12px 14px", borderLeft: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 11, color: "var(--ink-500)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: "var(--ink-900)" }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {STATUS_FILTERS.map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: f === statusFilter ? "var(--teal-600)" : "var(--ink-100)",
                color: f === statusFilter ? "white" : "var(--ink-600)",
              }}>
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="card" style={{ padding: "60px 24px", textAlign: "center", color: "var(--ink-500)" }}>
            <Icon name="send" size={32} color="var(--ink-300)" />
            <div style={{ marginTop: 8, fontWeight: 600 }}>No campaigns yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Create your first email campaign to reach your subscribers.</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Sent</th>
                  <th>Opened</th>
                  <th>Clicked</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td><Badge variant="soft">{(c.campaignType || "broadcast").replace(/_/g, " ")}</Badge></td>
                    <td style={{ fontSize: 12.5 }}>{c.sentCount}</td>
                    <td style={{ fontSize: 12.5 }}>{c.openCount}</td>
                    <td style={{ fontSize: 12.5 }}>{c.clickCount || 0}</td>
                    <td><Badge variant={statusBadgeVariant(c.status)}>{c.status}</Badge></td>
                    <td style={{ fontSize: 12 }}>{c.scheduledAt ? fmtDate(c.scheduledAt) : fmtDate(c.sentAt)}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <a href={`/home/marketing/campaigns/${c.id}`}
                          className="dbtn dBtn-ghost dBtn-xs" style={{ textDecoration: "none" }}>
                          {c.status === "draft" || c.status === "scheduled" ? "Edit" : "View"}
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppFrame>
  );
}
