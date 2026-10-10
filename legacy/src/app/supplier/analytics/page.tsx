import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }
function fmtK(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${Math.round(n)}`;
}

/* ── SVG chart components (inlined from insights page) ── */

function LineChart({ data, labels, height = 220, money }: { data: number[]; labels: string[]; height?: number; money?: boolean }) {
  const w = 600;
  const max = Math.max(...data) * 1.12;
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
      {labels.filter(Boolean).map((l, i) => (
        <text key={i} x={(i / (data.length - 1)) * w} y={height - 4} textAnchor="middle" fill="var(--ink-400)" fontSize={10.5} fontFamily="var(--font-mono)">
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

function Donut({ data, size = 110, stroke = 14, center }: { data: Array<{ v: number; color: string }>; size?: number; stroke?: number; center: { value: string; label: string } }) {
  const total = data.reduce((s, d) => s + d.v, 0) || 1;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} style={{ display: "block" }}>
      {data.map((d, i) => {
        const seg = (d.v / total) * circ;
        const dash = `${seg} ${circ - seg}`;
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={stroke} strokeDasharray={dash} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} strokeLinecap="round" />
        );
        offset += seg;
        return el;
      })}
      <text x={size / 2} y={size / 2 - 6} textAnchor="middle" fill="var(--ink-900)" fontSize={20} fontWeight={700} fontFamily="var(--font-accent)">{center.value}</text>
      <text x={size / 2} y={size / 2 + 10} textAnchor="middle" fill="var(--ink-500)" fontSize={10.5}>{center.label}</text>
    </svg>
  );
}

function StatTileCard({ label, value, delta, deltaDir = "flat", icon, money }: { label: string; value: string; delta: string; deltaDir?: "up" | "down" | "flat"; icon: string; money?: boolean }) {
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

/* ── Horizontal bar chart for top products ── */

function HBarChart({ data, labels, color = "var(--teal-500)" }: { data: number[]; labels: string[]; color?: string }) {
  const max = Math.max(...data) || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((v, i) => (
        <div key={i}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
            <span style={{ color: "var(--ink-700)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{labels[i]}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--ink-800)" }}>{fmtK(v)}</span>
          </div>
          <div style={{ height: 8, background: "var(--ink-100)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${(v / max) * 100}%`, height: "100%", background: color, borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function SupplierAnalyticsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const orders = await db.wholesaleOrder.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { seller: { select: { name: true } }, supplierProduct: { select: { name: true } } },
  });

  const totalRevenue = orders.reduce((s, o) => s + Number(o.totalPrice), 0);
  const fulfilled = orders.filter((o) => o.status === "delivered" || o.status === "shipped");
  const products = await db.supplierProduct.count({ where: { supplierId: supplier.id } });
  const fulfillmentRate = orders.length > 0 ? Math.round((fulfilled.length / orders.length) * 100) : 0;

  /* ── Compute chart data ── */

  const now = new Date();
  const sevenDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const dailyRevenue = sevenDays.map(day => {
    const dayOrders = orders.filter(o => {
      const d = new Date(o.createdAt);
      return d.getDate() === day.getDate() && d.getMonth() === day.getMonth() && d.getFullYear() === day.getFullYear();
    });
    return dayOrders.length > 0 ? dayOrders.reduce((s, o) => s + Number(o.totalPrice), 0) : 0;
  });
  const revenueTrend = dailyRevenue;
  const revLabels = sevenDays.map(d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));

  const productAgg = new Map<string, { qty: number; rev: number }>();
  orders.forEach(o => {
    const name = o.supplierProduct?.name ?? "Unknown Product";
    const cur = productAgg.get(name) ?? { qty: 0, rev: 0 };
    cur.qty += o.quantity;
    cur.rev += Number(o.totalPrice);
    productAgg.set(name, cur);
  });
  const topProducts = [...productAgg.entries()]
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.rev - a.rev)
    .slice(0, 5);
  const topNames = topProducts.map(p => p.name);
  const topRevs = topProducts.map(p => p.rev);

  const statusAgg: Record<string, number> = {};
  orders.forEach(o => { statusAgg[o.status] = (statusAgg[o.status] ?? 0) + 1; });
  const statusColors: Record<string, string> = {
    pending: "var(--amber-500)",
    confirmed: "var(--teal-400)",
    processing: "var(--teal-500)",
    shipped: "var(--teal-600)",
    delivered: "var(--success)",
    cancelled: "var(--ink-300)",
    returned: "var(--berry-500)",
  };
  const statusLabels: Record<string, string> = {
    pending: "Pending", confirmed: "Confirmed", processing: "Processing",
    shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", returned: "Returned",
  };
  const donutData = Object.entries(statusAgg).map(([s, v]) => ({ v, color: statusColors[s] ?? "var(--ink-200)" }));
  const totalOrders = orders.length;

  const weekLabels = ["3 wk ago", "2 wk ago", "Last wk", "This wk"];
  const weekCounts = Array.from({ length: 4 }, (_, i) => {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay() - (3 - i) * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return orders.filter(o => { const d = new Date(o.createdAt); return d >= start && d < end; }).length;
  });

  return (
    <AppFrame
      role="supplier"
      storeName={supplier.displayName}
      storeSlug={`${supplier.city ?? "Aba"} · ${supplier.country ?? "Nigeria"}`}
      storeInitial={supplier.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Analytics"
          sub={`${supplier.displayName} · ${orders.length} orders · ${fmt(totalRevenue)} total revenue`}
          actions={
            <>
              <button className="dbtn dBtn-ghost"><Icon name="calendar" size={14} /> Last 30 days</button>
              <button className="dbtn dBtn-ghost"><Icon name="download" size={14} /> Export</button>
            </>
          }
        />

        <div className="design-tabs">
          {["Overview", "Products", "Buyers", "Quality"].map((t, i) => (
            <button key={t} className={`tab${i === 0 ? " on" : ""}`}>{t}</button>
          ))}
        </div>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div className="stat">
            <div className="stat-lbl">Revenue</div>
            <div className="stat-val money">{fmt(totalRevenue)}</div>
            <div className="stat-delta delta-up">
              <Icon name="coin" size={12} />
              <span>+18% MoM</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Orders fulfilled</div>
            <div className="stat-val">{fulfilled.length}</div>
            <div className="stat-delta delta-up">
              <Icon name="package" size={12} />
              <span>+24% MoM</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Products</div>
            <div className="stat-val">{products}</div>
            <div className="stat-delta delta-up">
              <Icon name="box" size={12} />
              <span>active catalog</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Fulfillment rate</div>
            <div className="stat-val">{fulfillmentRate}%</div>
            <div className="stat-delta delta-up">
              <Icon name="checkCircle" size={12} />
              <span>{fulfilled.length}/{orders.length} orders</span>
            </div>
          </div>
        </div>

        {/* Revenue trend + Top products */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Revenue trend</div>
              <div style={{ fontSize: 12, color: "var(--ink-500)" }}>7-day · daily settlement</div>
            </div>
            <LineChart data={revenueTrend} labels={revLabels} height={220} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginTop: 14, textAlign: "center" }}>
              {revLabels.map((l, i) => (
                <div key={i} style={{ fontSize: 10.5, color: "var(--ink-500)", fontFamily: "var(--font-mono)" }}>
                  {l}<br /><strong style={{ color: "var(--ink-800)", fontSize: 11 }}>{fmtK(revenueTrend[i])}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Top products</div>
            {topProducts.length > 0 ? (
              <HBarChart data={topRevs} labels={topNames} color="var(--teal-600)" />
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--ink-500)", padding: 12 }}>
                No products yet.
              </div>
            )}
          </div>
        </div>

        {/* Order status + Orders by week + Quality metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Order status</div>
            {donutData.length > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <Donut
                  size={110} stroke={14}
                  data={donutData}
                  center={{ value: String(totalOrders), label: "orders" }}
                />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7, fontSize: 12 }}>
                  {Object.entries(statusAgg).map(([s, v]) => (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", background: statusColors[s] ?? "var(--ink-200)" }} />
                      <span style={{ flex: 1, color: "var(--ink-600)" }}>{statusLabels[s] ?? s}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--ink-500)", padding: 12 }}>
                No orders yet.
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Orders by week</div>
            <BarChart data={weekCounts} labels={weekLabels} height={120} color="var(--teal-500)" />
            <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 8 }}>
              {weekCounts[3] > weekCounts[2]
                ? <>This week is trending <strong style={{ color: "var(--success)" }}>up</strong> vs last week.</>
                : weekCounts[3] < weekCounts[2]
                ? <>This week is trending <strong style={{ color: "var(--berry-500)" }}>down</strong> vs last week.</>
                : <>Steady volume vs last week.</>}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Quality metrics</div>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ position: "relative", width: 100, height: 100 }}>
                <svg width="100" height="100" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--ink-100)" strokeWidth="12" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--success)" strokeWidth="12"
                    strokeDasharray={`${Math.min(fulfillmentRate, 100) * 2.51} 251`} transform="rotate(-90 50 50)" />
                  <text x="50" y="48" textAnchor="middle" fill="var(--ink-900)" fontSize="18"
                    fontFamily="var(--font-accent)">{fulfillmentRate}%</text>
                  <text x="50" y="62" textAnchor="middle" fill="var(--ink-500)" fontSize="9">fulfilled</text>
                </svg>
              </div>
              <div style={{ flex: 1, fontSize: 12, lineHeight: 1.6 }}>
                {[
                  ["Defect rate", "0.3%", "var(--success)"],
                  ["Returns rate", "0.8%", "var(--success)"],
                  ["Avg rating", "★ 4.8", "var(--amber-500)"],
                  ["Response time", "1h 42m", ""],
                  ["Quote win rate", "68%", ""],
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{r[0]}</span>
                    <strong style={{ color: r[2] || "inherit" }}>{r[1]}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
