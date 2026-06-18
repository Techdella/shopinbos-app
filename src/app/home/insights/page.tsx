import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon } from "@/components/ui";
import type { IconName } from "@/components/ui/Icon";
import { InsightsExportButton } from "./InsightsExportButton";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }
function fmtK(n: number) { return "₦" + (n / 1000).toFixed(0) + "K"; }

const revenueData = [180, 210, 190, 250, 260, 290, 310, 340, 320, 370, 400, 420, 450, 440, 480, 520, 500, 540, 612];
const revLabels = ["May 1", "", "", "", "May 5", "", "", "", "", "May 10", "", "", "", "", "May 15", "", "", "", "May 19"];
const hoursData = [2, 1, 1, 3, 5, 7, 9, 11, 13, 12, 10, 9, 8, 11, 14, 12, 9, 7, 5, 3, 2, 2, 1, 1];
const hoursLabels = ["12a", "", "", "3a", "", "", "6a", "", "", "9a", "", "", "12p", "", "", "3p", "", "", "6p", "", "", "9p", "", ""];

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
  const orders = store ? await db.retailOrder.findMany({
    where: { storeId: store.id },
    select: { id: true, total: true, status: true, createdAt: true, items: true },
    take: 100,
  }) : [];

  const paidOrders = orders.filter((o) => ["paid", "processing", "shipped", "delivered"].includes(o.status));
  const revenue = paidOrders.reduce((t, o) => t + Number(o.total), 0);
  const aov = paidOrders.length > 0 ? revenue / paidOrders.length : 0;
  const productStats = new Map<string, { n: string; c: number; v: number }>();
  for (const order of orders as Array<typeof orders[number] & { items?: unknown }>) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const rawItem of items) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      const name = String(item.name ?? item.title ?? "Product");
      const qty = Number(item.quantity ?? item.qty ?? 1) || 1;
      const price = Number(item.price ?? item.unitPrice ?? item.total ?? 0) || 0;
      const current = productStats.get(name) ?? { n: name, c: 0, v: 0 };
      current.c += qty;
      current.v += price * qty;
      productStats.set(name, current);
    }
  }
  const topProducts = Array.from(productStats.values()).sort((a, b) => b.v - a.v).slice(0, 4);
  const topValue = Math.max(...topProducts.map((product) => product.v), 1);

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
          sub={`${store?.name ?? "Store"} · live order data · settled in NGN`}
          actions={<><div className="btn dBtn-ghost" style={{ fontSize: 12.5, padding: "7px 13px", display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="calendar" size={14} /> Last 100 orders</div><InsightsExportButton /></>}
        />

        <div className="tabs" style={{ margin: 0 }}>
          {["Sales", "Products", "Customers", "Traffic", "AI usage"].map((t, i) => (
            <div key={t} className={`t${i === 0 ? " on" : ""}`}>{t}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatTileCard label="GMV" value={fmt(revenue)} delta="live" deltaDir="flat" icon="coin" money />
          <StatTileCard label="Orders" value={String(paidOrders.length)} delta={`${orders.length} total`} deltaDir="flat" icon="cart" />
          <StatTileCard label="AOV" value={fmt(Math.round(aov))} delta="paid orders" deltaDir="flat" icon="chart" />
          <StatTileCard label="Repeat rate" value="—" delta="needs customer history" deltaDir="flat" icon="users" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Revenue · by city</div>
              <div style={{ fontSize: 12, color: "var(--ink-500)" }}>Top 6 of 38</div>
            </div>
            <LineChart data={revenueData} labels={revLabels} height={220} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginTop: 14 }}>
              {[
                { c: "Lagos", v: "₦1.62M", p: "38%" },
                { c: "Abuja", v: "₦820K", p: "19%" },
                { c: "Port Harcourt", v: "₦580K", p: "14%" },
                { c: "Kano", v: "₦410K", p: "10%" },
                { c: "Accra", v: "₦340K", p: "8%" },
                { c: "Nairobi", v: "₦220K", p: "5%" },
              ].map((r, i) => (
                <div key={i} style={{ padding: "10px 12px", background: "var(--ink-50)", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{r.c}</div>
                  <div style={{ fontFamily: "var(--font-accent)", fontSize: 16, fontWeight: 500 }}>{r.v}</div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-500)" }}>{r.p}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Top products</div>
            {(topProducts.length > 0 ? topProducts : [{ n: "No product sales yet", c: 0, v: 0 }]).map((p, i) => (
              <div key={i} style={{ padding: "10px 0", borderTop: i ? "1px dashed var(--ink-150)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.n}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{p.c} sold</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 6, background: "var(--ink-100)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ width: `${Math.round((p.v / topValue) * 100)}%`, height: "100%", background: "var(--teal-600)" }} />
                  </div>
                  <div style={{ fontFamily: "var(--font-accent)", fontSize: 14, fontWeight: 500, minWidth: 80, textAlign: "right" }}>{fmtK(p.v)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Hours of the day</div>
            <BarChart data={hoursData} labels={hoursLabels} height={120} color="var(--teal-500)" />
            <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 8 }}>
              Peak: <strong style={{ color: "var(--ink-800)" }}>3pm – 4pm Lagos time</strong> — schedule WA broadcasts here.
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Customer cohort retention</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                { m: "Jan", v: [100, 42, 28, 20, 18] },
                { m: "Feb", v: [100, 38, 24, 22] },
                { m: "Mar", v: [100, 45, 30] },
                { m: "Apr", v: [100, 48] },
                { m: "May", v: [100] },
              ].map((row, i) => (
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
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>AI usage · this month</div>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <Donut
                size={110} stroke={14}
                data={[
                  { v: 1200, color: "var(--teal-600)" },
                  { v: 850, color: "var(--amber-500)" },
                  { v: 320, color: "var(--berry-500)" },
                  { v: 130, color: "var(--ink-200)" },
                ]}
                center={{ value: "2.5K", label: "tokens" }}
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                {[
                  { c: "var(--teal-600)", l: "Peggy chat", v: "1.2K" },
                  { c: "var(--amber-500)", l: "Product copy", v: "850" },
                  { c: "var(--berry-500)", l: "Broadcasts", v: "320" },
                  { c: "var(--ink-200)", l: "Reserve", v: "130" },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: r.c }} />
                    <span style={{ flex: 1 }}>{r.l}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
            <hr className="hr" />
            <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
              You&apos;re on <strong style={{ color: "var(--ink-800)" }}>Pro</strong>. ~₦340 spent of ₦8,000 monthly AI budget.
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
