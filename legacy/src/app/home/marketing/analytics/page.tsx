"use client";

import { useCallback, useEffect, useState } from "react";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

interface AnalyticsData {
  totalSubscribers: number;
  emailsSent: number;
  openRate: number;
  clickRate: number;
  revenueFromEmail: number;
  couponsUsed: number;
  abandonedCarts: number;
  formSubmissions: number;
  topCampaigns: Array<{
    name: string;
    sent: number;
    opened: number;
    clicked: number;
    revenue: number;
  }>;
  recentActivity: Array<{
    type: string;
    message: string;
    timestamp: string;
  }>;
  subscriberGrowth: Array<{
    month: string;
    count: number;
  }>;
  revenueOverTime: Array<{
    month: string;
    amount: number;
  }>;
}

function fmtCurrency(amount: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

const EMPTY_DATA: AnalyticsData = {
  totalSubscribers: 0, emailsSent: 0, openRate: 0, clickRate: 0,
  revenueFromEmail: 0, couponsUsed: 0, abandonedCarts: 0, formSubmissions: 0,
  topCampaigns: [], recentActivity: [], subscriberGrowth: [], revenueOverTime: [],
};

function ChartPlaceholder({ title, height = 180, children }: {
  title: string;
  height?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--ink-900)" }}>{title}</h3>
      <div style={{
        height, borderRadius: 8, background: "var(--ink-50)",
        display: "flex", alignItems: "flex-end", gap: 4, padding: "10px 8px",
        position: "relative", overflow: "hidden",
      }}>
        {children || (
          <div style={{ width: "100%", textAlign: "center", alignSelf: "center", color: "var(--ink-400)", fontSize: 13 }}>
            Chart loading...
          </div>
        )}
      </div>
    </div>
  );
}

function BarChart({ data, color = "var(--teal-500)" }: {
  data: { month: string; count?: number; amount?: number }[];
  color?: string;
}) {
  const maxVal = Math.max(...data.map((d) => d.count ?? d.amount ?? 0), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: "100%", width: "100%" }}>
      {data.map((d) => {
        const val = d.count ?? d.amount ?? 0;
        const pct = (val / maxVal) * 100;
        return (
          <div key={d.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
            <div style={{
              width: "100%", maxWidth: 40, borderRadius: "4px 4px 0 0",
              height: `${Math.max(pct, 4)}%`,
              background: color,
              opacity: 0.7 + (pct / 100) * 0.3,
              transition: "height 0.3s",
              minHeight: 4,
            }} />
            <span style={{ fontSize: 9, color: "var(--ink-500)", whiteSpace: "nowrap" }}>{d.month}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function MarketingAnalyticsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/analytics/marketing");
      const json = await res.json();
      if (json.data) setData(json.data);
      else setData(EMPTY_DATA);
    } catch {
      setData(EMPTY_DATA);
      toast("Could not load analytics", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void fetchAnalytics(); }, [fetchAnalytics]);

  const d = data || EMPTY_DATA;

  return (
    <AppFrame role="seller">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead title="Marketing Analytics" sub="Track your marketing performance" />

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-500)" }}>Loading analytics...</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {[
                { label: "Total Subscribers", value: String(d.totalSubscribers), color: "var(--teal-600)" },
                { label: "Emails Sent", value: String(d.emailsSent), color: "var(--berry-500)" },
                { label: "Open Rate", value: `${d.openRate}%`, color: "var(--success)" },
                { label: "Click Rate", value: `${d.clickRate}%`, color: "var(--mint)" },
                { label: "Revenue from Email", value: fmtCurrency(d.revenueFromEmail), color: "var(--amber-600)" },
                { label: "Coupons Used", value: String(d.couponsUsed), color: "var(--coral-500)" },
                { label: "Abandoned Carts", value: String(d.abandonedCarts), color: "var(--rose-400)" },
                { label: "Form Submissions", value: String(d.formSubmissions), color: "var(--ink-600)" },
              ].map((s) => (
                <div key={s.label} className="card" style={{ padding: "10px 12px", borderLeft: `3px solid ${s.color}` }}>
                  <div style={{ fontSize: 10, color: "var(--ink-500)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 1, color: "var(--ink-900)" }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <ChartPlaceholder title="Subscriber Growth" height={200}>
                {d.subscriberGrowth.length > 0 && <BarChart data={d.subscriberGrowth.map((s) => ({ month: s.month, count: s.count }))} color="var(--teal-500)" />}
              </ChartPlaceholder>
              <ChartPlaceholder title="Revenue Over Time" height={200}>
                {d.revenueOverTime.length > 0 && <BarChart data={d.revenueOverTime.map((r) => ({ month: r.month, amount: r.amount }))} color="var(--amber-500)" />}
              </ChartPlaceholder>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div className="card" style={{ padding: 16 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--ink-900)" }}>Top Campaigns</h3>
                {d.topCampaigns.length === 0 ? (
                  <div style={{ padding: 20, textAlign: "center", color: "var(--ink-400)", fontSize: 13 }}>No campaign data yet</div>
                ) : (
                  <table className="tbl" style={{ fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th style={{ textAlign: "center" }}>Sent</th>
                        <th style={{ textAlign: "center" }}>Opened</th>
                        <th style={{ textAlign: "center" }}>Clicked</th>
                        <th style={{ textAlign: "right" }}>Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.topCampaigns.map((c, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{c.name}</td>
                          <td style={{ textAlign: "center" }}>{c.sent}</td>
                          <td style={{ textAlign: "center" }}>{c.opened}</td>
                          <td style={{ textAlign: "center" }}>{c.clicked}</td>
                          <td style={{ textAlign: "right", fontWeight: 600 }}>{fmtCurrency(c.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="card" style={{ padding: 16 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "var(--ink-900)" }}>Recent Activity</h3>
                {d.recentActivity.length === 0 ? (
                  <div style={{ padding: 20, textAlign: "center", color: "var(--ink-400)", fontSize: 13 }}>No recent activity</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {d.recentActivity.map((a, i) => (
                      <div key={i} style={{
                        display: "flex", gap: 10, padding: "8px 10px", borderRadius: 8,
                        background: "var(--ink-50)", fontSize: 12.5, lineHeight: 1.4,
                      }}>
                        <Icon name={a.type === "campaign" ? "send" : a.type === "subscriber" ? "users" : a.type === "form" ? "file" : "code"}
                          size={14} color="var(--teal-600)" style={{ marginTop: 1, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "var(--ink-700)" }}>{a.message}</div>
                          <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 2 }}>{a.timestamp}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppFrame>
  );
}
