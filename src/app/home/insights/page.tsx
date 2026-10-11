import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon } from "@/components/ui";
import type { IconName } from "@/components/ui/Icon";
import { InsightsExportButton } from "./InsightsExportButton";
import { computeSellerInsights } from "@/lib/insights";
import { isProPlan } from "@/lib/plan-limits";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }
function fmtK(n: number) { return "₦" + (n / 1000).toFixed(0) + "K"; }

const HOUR_LABELS = Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}` : ""));

function hourLabel(hour: number) {
  const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "am" : "pm"}`;
  return `${fmtHour(hour)} – ${fmtHour((hour + 1) % 24)}`;
}

function LineChart({ data, labels, height = 220, money }: { data: number[]; labels: string[]; height?: number; money?: boolean }) {
  const w = 600;
  const max = Math.max(...data, 1) * 1.12;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - (v / max) * (height - 24) + 4;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: "100%", height, display: "block" }}>
      {[0.25, 0.5, 0.75].map((r, i) => (
        <line key={i} x1={0} y1={height - (height - 24) * r - 4} x2={w} y2={height - (height - 24) * r - 4} stroke="var(--ink-100)" strokeWidth={1} />
      ))}
      <polyline points={pts} fill="none" stroke="var(--teal-600)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`0,${height} ${pts} ${w},${height}`} fill="var(--teal-600)" opacity={0.08} />
      {labels.map((l, i) => l && (
        <text key={i} x={(i / Math.max(data.length - 1, 1)) * w} y={height - 4} textAnchor="middle" fill="var(--ink-400)" fontSize={10.5} fontFamily="var(--font-mono)">
          {l}
        </text>
      ))}
    </svg>
  );
}

function BarChart({ data, labels, height = 120, color = "var(--teal-500)" }: { data: number[]; labels: string[]; height?: number; color?: string }) {
  const max = Math.max(...data) || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height, width: "100%" }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: "60%", maxWidth: 14, height: (v / max) * (height - 24), background: color, borderRadius: "3px 3px 0 0", minHeight: v > 0 ? 2 : 0 }} />
          {labels[i] && <span style={{ fontSize: 8, color: "var(--ink-400)", writingMode: "vertical-lr", textOrientation: "mixed", transform: "rotate(180deg)", marginTop: 4 }}>{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

interface StatCard { label: string; value: string; delta: string; deltaDir: "up" | "down" | "flat"; icon: IconName; iconBg?: string; money?: boolean }

function StatTileCard({ label, value, delta, deltaDir = "flat", icon, iconBg, money }: StatCard) {
  return (
    <div className="stat">
      <div className="stat-lbl">{label}</div>
      <div className={`stat-val${money ? " money" : ""}`}>{value}</div>
      <div className={`stat-delta delta-${deltaDir}`}>
        {deltaDir === "up" && <Icon name="arrowUp" size={11} />}
        {deltaDir === "down" && <Icon name="arrowDown" size={11} />}
        {deltaDir === "flat" && <Icon name="minus" size={11} />}
        <span>{delta}</span>
      </div>
    </div>
  );
}

export default async function SellerInsightsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;

  const store = workspace.store;
  const since = new Date(Date.now() - 180 * 86_400_000);
  const [orders, account] = await Promise.all([
    store
      ? db.retailOrder.findMany({
          where: { storeId: store.id, createdAt: { gte: since } },
          select: { total: true, status: true, createdAt: true, buyerEmail: true, deliveryAddress: true, items: true },
          orderBy: { createdAt: "desc" },
          take: 5000,
        })
      : Promise.resolve([]),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
  ]);

  const insights = computeSellerInsights(orders);
  const topValue = Math.max(...insights.topProducts.map((product) => product.revenue), 1);
  const aiCredits = account?.aiCredits ?? 0;
  const proPlan = isProPlan({ aiCredits });

  return (
    <AppFrame
      role="seller"
      storeName={store?.name ?? "Store"}
      storeSlug={store?.slug ?? ""}
      storeInitial={store?.name?.charAt(0).toUpperCase() ?? "S"}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Analytics"
          sub={`${store?.name ?? "Store"} · live order data · last 180 days`}
          actions={<><div className="btn dBtn-ghost" style={{ fontSize: 12.5, padding: "7px 13px", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="calendar" size={14} /> Last 180 days</div><InsightsExportButton /></>}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatTileCard label="GMV" value={fmt(insights.revenue)} delta="paid orders" deltaDir="flat" icon="coin" money />
          <StatTileCard label="Orders" value={String(insights.paidOrders)} delta={`${insights.totalOrders} total`} deltaDir="flat" icon="cart" />
          <StatTileCard label="AOV" value={fmt(Math.round(insights.aov))} delta="paid orders" deltaDir="flat" icon="chart" />
          <StatTileCard
            label="Repeat rate"
            value={insights.repeatRate == null ? "—" : `${Math.round(insights.repeatRate * 100)}%`}
            delta={insights.repeatRate == null ? "no paying buyers yet" : "buyers with 2+ orders"}
            deltaDir="flat"
            icon="users"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Revenue · last 30 days</div>
              <div style={{ fontSize: 12, color: "var(--ink-500)" }}>
                {insights.cityCount > 0 ? `Top ${insights.cities.length} of ${insights.cityCount} cities` : "No delivery cities yet"}
              </div>
            </div>
            <LineChart data={insights.daily.data} labels={insights.daily.labels} height={220} />
            {insights.cities.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginTop: 14 }}>
                {insights.cities.map((r) => (
                  <div key={r.city} style={{ padding: "10px 12px", background: "var(--ink-50)", borderRadius: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.city}</div>
                    <div style={{ fontFamily: "var(--font-accent)", fontSize: 16, fontWeight: 500 }}>{fmtK(r.revenue)}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-500)" }}>{Math.round(r.share * 100)}%</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Top products</div>
            {(insights.topProducts.length > 0 ? insights.topProducts : [{ name: "No product sales yet", quantity: 0, revenue: 0 }]).map((p, i) => (
              <div key={i} style={{ padding: "10px 0", borderTop: i ? "1px dashed var(--ink-150)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{p.quantity} sold</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 6, background: "var(--ink-100)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${Math.round((p.revenue / topValue) * 100)}%`, height: "100%", background: "var(--teal-600)" }} />
                  </div>
                  <div style={{ fontFamily: "var(--font-accent)", fontSize: 14, fontWeight: 500, minWidth: 80, textAlign: "right" }}>{fmtK(p.revenue)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Hours of the day</div>
            <BarChart data={insights.hours} labels={HOUR_LABELS} height={120} color="var(--teal-500)" />
            <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 8 }}>
              {insights.peakHour == null ? (
                "Peak order hour appears once you have paid orders."
              ) : (
                <>Peak: <strong style={{ color: "var(--ink-800)" }}>{hourLabel(insights.peakHour)} Lagos time</strong> — schedule WA broadcasts here.</>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Customer cohort retention</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {insights.cohorts.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--ink-500)", padding: "8px 0" }}>Retention appears once buyers start paying.</div>
              )}
              {insights.cohorts.map((row) => ({ m: row.month, v: row.retention })).map((row, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "30px repeat(5, 1fr)", gap: 3, alignItems: "center" }}>
                  <div style={{ fontSize: 10.5, color: "var(--ink-500)", fontFamily: "var(--font-mono)" }}>{row.m}</div>
                  {Array.from({ length: 5 }, (_, j) => {
                    const v = row.v[j];
                    if (v == null) return <div key={j} />;
                    return (
                      <div key={j} style={{
                        height: 24,
                        background: `rgba(30,144,133,${Math.min(0.9, v / 120)})`,
                        borderRadius: 4,
                        display: "grid",
                        placeItems: "center",
                        color: v > 40 ? "white" : "var(--teal-800)",
                        fontSize: 10,
                        fontWeight: 600,
                      }}>
                        {v}%
                      </div>
                    );
                  })}
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "30px repeat(5, 1fr)", gap: 3, fontSize: 10, color: "var(--ink-500)", marginTop: 4 }}>
                <div /><div style={{ textAlign: "center" }}>M0</div><div style={{ textAlign: "center" }}>M1</div><div style={{ textAlign: "center" }}>M2</div><div style={{ textAlign: "center" }}>M3</div><div style={{ textAlign: "center" }}>M4</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>AI credits</div>
            <div style={{ fontFamily: "var(--font-accent)", fontSize: 34, fontWeight: 500, lineHeight: 1 }}>{aiCredits.toLocaleString("en-US")}</div>
            <div style={{ fontSize: 12, color: "var(--ink-500)", marginTop: 6 }}>credits available for Rex copy, images and store edits</div>
            <hr className="hr" />
            <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
              You&apos;re on <strong style={{ color: "var(--ink-800)" }}>{proPlan ? "Pro" : "Starter"}</strong>.{" "}
              <a href="/home/settings?tab=Billing" style={{ color: "var(--teal-700)" }}>Manage plan</a>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
