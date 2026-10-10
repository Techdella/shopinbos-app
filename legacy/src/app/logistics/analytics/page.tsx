import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import type { IconName } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

function fmtK(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n}`;
}
function Av({ name, size = 36, seed = 0, square }: { name: string; size?: number; seed?: number; square?: boolean }) {
  const initials = name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  const g = [["#D4A574","#6B4A2C"],["#F2C8B4","#D4A574"],["#195754","#0c4a44"],["#E86A4F","#6B4A2C"],["#5b6ad0","#3a4ba6"]][seed % 5];
  return (
    <div style={{ width: size, height: size, borderRadius: square ? 7 : "50%", background: `linear-gradient(135deg,${g[0]},${g[1]})`, display: "grid", placeItems: "center", color: "white", fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// --- Inline SVG chart components ---

function LineChart({ data, labels, height = 220 }: { data: number[]; labels: string[]; height?: number }) {
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

function StatTileCard({ label, value, delta, deltaDir = "flat", icon, money }: { label: string; value: string; delta: string; deltaDir: "up" | "down" | "flat"; icon: IconName; money?: boolean }) {
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

export default async function LogisticsAnalyticsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const bookings = await db.deliveryBooking.findMany({
    where: { logisticsPartnerId: partner.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, pickupLocation: true, destination: true, deliveryFee: true, currency: true, status: true, createdAt: true, seller: { select: { name: true } } },
  });

  const revenue = bookings.reduce((s, b) => s + b.deliveryFee, 0);
  const delivered = bookings.filter((b) => b.status === "delivered");
  const deliveryRate = bookings.length > 0 ? Math.round((delivered.length / bookings.length) * 100) : 0;
  const onTime = deliveryRate > 0 ? Math.max(0, deliveryRate - 8) : 92;

  const base = bookings.length || 50;
  const revTrendData = [12, 15, 11, 18, 20, 24, 22, 25, 28, 26, 30, 32, 35, 31].map(v => Math.round(v * (base / 50)));
  const revTrendLabels = ["May 6", "", "", "", "May 10", "", "", "", "", "May 14", "", "", "", "May 19"];

  const zoneData = [45, 38, 32, 18, 12];
  const zoneLabels = ["Yaba", "Ikeja", "Lekki", "VI", "Apapa"];

  const statusSegments = [
    { v: Math.round(base * 0.42), color: "var(--teal-600)" },
    { v: Math.round(base * 0.28), color: "var(--amber-500)" },
    { v: Math.round(base * 0.15), color: "var(--berry-500)" },
    { v: Math.round(base * 0.10), color: "var(--rose-500)" },
    { v: Math.round(base * 0.05), color: "var(--ink-200)" },
  ];
  const statusTotal = statusSegments.reduce((s, d) => s + d.v, 0);

  const dailyData = [8, 12, 9, 15, 18, 14, 10].map(v => Math.round(v * (base / 50)));
  const dailyLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <AppFrame
      role="logistics_partner"
      storeName={partner.displayName}
      storeSlug={`${partner.city ?? "Lagos"} · Fleet`}
      storeInitial={partner.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Analytics"
          sub={`${partner.displayName} · last 30 days`}
          actions={<><button className="dbtn dBtn-ghost"><Icon name="calendar" size={14} /> May 1 – 19</button><button className="dbtn dBtn-ghost"><Icon name="download" size={14} /> Export</button></>}
        />

        <div className="design-tabs">
          {["Overview", "Zones", "Riders", "Sellers", "SLA"].map((t, i) => (
            <button key={t} className={`tab${i === 0 ? " on" : ""}`}>{t}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <StatTileCard label="Bookings" value={String(bookings.length)} delta="+18% MoM" deltaDir="up" icon="cart" />
          <StatTileCard label="Revenue" value={fmtK(revenue)} delta="+24% MoM" deltaDir="up" icon="coin" money />
          <StatTileCard label="Delivery rate" value={`${deliveryRate}%`} delta="+5 pts" deltaDir="up" icon="document" />
          <StatTileCard label="On-time %" value={`${onTime}%`} delta="+3 pts" deltaDir="up" icon="refresh" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Revenue trend</div>
              <div style={{ fontSize: 12, color: "var(--ink-500)" }}>Last 14 days</div>
            </div>
            <LineChart data={revTrendData} labels={revTrendLabels} height={220} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--ink-100)", fontSize: 12 }}>
              {[
                ["Same-day", String(Math.round(bookings.length * 0.67)), "67%", "var(--teal-600)"],
                ["Next-day", String(Math.round(bookings.length * 0.23)), "23%", "var(--amber-500)"],
                ["Cross-border", String(Math.round(bookings.length * 0.07)), "7%", "var(--berry-500)"],
                ["Returns", String(Math.round(bookings.length * 0.03)), "3%", "var(--rose-500)"],
              ].map((r, i) => (
                <div key={i}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-500)", fontSize: 11 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: r[3] }} />{r[0]}
                  </div>
                  <div style={{ fontFamily: "var(--font-accent)", fontSize: 18, fontWeight: 500, marginTop: 3 }}>{r[1]}</div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-500)" }}>{r[2]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Zone breakdown</div>
            <BarChart data={zoneData} labels={zoneLabels} height={160} color="var(--teal-500)" />
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 14 }}>
              {zoneData.map((v, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: `var(${["--teal-600","--amber-500","--berry-500","--indigo-500","--rose-500"][i]})` }} />
                  <span style={{ flex: 1 }}>{zoneLabels[i]}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{v} delivers</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Status distribution</div>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <Donut
                size={110} stroke={14}
                data={statusSegments}
                center={{ value: String(statusTotal), label: "bookings" }}
              />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                {[
                  { c: "var(--teal-600)", l: "Delivered", v: statusSegments[0].v },
                  { c: "var(--amber-500)", l: "In transit", v: statusSegments[1].v },
                  { c: "var(--berry-500)", l: "Pending", v: statusSegments[2].v },
                  { c: "var(--rose-500)", l: "Cancelled", v: statusSegments[3].v },
                  { c: "var(--ink-200)", l: "Returned", v: statusSegments[4].v },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: r.c }} />
                    <span style={{ flex: 1 }}>{r.l}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Daily bookings</div>
            <BarChart data={dailyData} labels={dailyLabels} height={120} color="var(--teal-500)" />
            <div style={{ fontSize: 11.5, color: "var(--ink-500)", marginTop: 8 }}>
              Peak: <strong style={{ color: "var(--ink-800)" }}>{Math.max(...dailyData)} bookings on {dailyLabels[dailyData.indexOf(Math.max(...dailyData))]}</strong>
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>SLA performance</div>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ position: "relative", width: 120, height: 120 }}>
                <svg width="120" height="120" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--ink-100)" strokeWidth="12" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="var(--success)" strokeWidth="12"
                    strokeDasharray={`${onTime * 2.51} 251`} transform="rotate(-90 50 50)" />
                  <text x="50" y="48" textAnchor="middle" fill="var(--ink-900)" fontSize="18" fontFamily="var(--font-accent)">{onTime}%</text>
                  <text x="50" y="62" textAnchor="middle" fill="var(--ink-500)" fontSize="9">on-time</text>
                </svg>
              </div>
              <div style={{ flex: 1, fontSize: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)" }} />On-time
                  </span>
                  <strong>{onTime}%</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warning)" }} />Late &lt; 1hr
                  </span>
                  <strong>5%</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)" }} />Failed
                  </span>
                  <strong>3%</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Bookings · last 30 days</div>
            </div>
            <svg viewBox="0 0 400 220" width="100%" style={{ display: "block" }}>
              <defs>
                <linearGradient id="lg-book" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--teal-600)" stopOpacity="0.18" />
                  <stop offset="1" stopColor="var(--teal-600)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
                <g key={i}>
                  <line x1={40} x2={380} y1={20 + t * 180} y2={20 + t * 180} stroke="var(--ink-100)" strokeWidth="1" />
                  <text x={36} y={24 + t * 180} fill="var(--ink-400)" fontSize={9} textAnchor="end">{Math.round(bookings.length * (1 - t))}</text>
                </g>
              ))}
              <path d="M40 200 Q90 190 140 180 T240 120 T340 40" fill="none" stroke="var(--teal-600)" strokeWidth="2" />
              <path d="M40 200 Q90 190 140 180 T240 120 T340 40 L340 200 L40 200 Z" fill="url(#lg-book)" />
            </svg>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--ink-100)", fontSize: 12 }}>
              {[
                ["Same-day", String(Math.round(bookings.length * 0.67)), "67%", "var(--teal-600)"],
                ["Next-day", String(Math.round(bookings.length * 0.23)), "23%", "var(--amber-500)"],
                ["Cross-border", String(Math.round(bookings.length * 0.07)), "7%", "var(--berry-500)"],
                ["Returns", String(Math.round(bookings.length * 0.03)), "3%", "var(--rose-500)"],
              ].map((r, i) => (
                <div key={i}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-500)", fontSize: 11 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: r[3] }} />{r[0]}
                  </div>
                  <div style={{ fontFamily: "var(--font-accent)", fontSize: 18, fontWeight: 500, marginTop: 3 }}>{r[1]}</div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-500)" }}>{r[2]}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Top sellers</div>
            {bookings.reduce<{ name: string; bookings: number; revenue: number }[]>((acc, b) => {
              const existing = acc.find((a) => a.name === b.seller.name);
              if (existing) { existing.bookings++; existing.revenue += b.deliveryFee; }
              else acc.push({ name: b.seller.name, bookings: 1, revenue: b.deliveryFee });
              return acc;
            }, []).sort((a, b) => b.revenue - a.revenue).slice(0, 5).map((s, i) => (
              <div key={s.name} style={{ padding: "10px 0", borderTop: i ? "1px dashed var(--ink-150)" : "none", display: "flex", alignItems: "center", gap: 11 }}>
                <Av name={s.name} size={32} seed={i + 8} square />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{s.bookings} bookings</div>
                </div>
                <div style={{ fontFamily: "var(--font-accent)", fontSize: 14, fontWeight: 500 }}>{fmtK(s.revenue)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
