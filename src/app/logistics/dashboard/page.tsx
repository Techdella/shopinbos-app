import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }
function fmtK(n: number) {
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${Math.round(n)}`;
}



export default async function LogisticsDashboardPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const [bookings, pendingQuotes] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, pickupLocation: true, destination: true, deliveryFee: true,
        currency: true, status: true, trackingCode: true, estimatedDelivery: true,
        createdAt: true, packageDetails: true,
        seller: { select: { name: true } },
      },
    }),
    db.deliveryQuoteRequest.findMany({
      where: { logisticsPartnerId: partner.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, pickupLocation: true, destination: true,
        seller: { select: { name: true } },
      },
    }),
  ]);

  const delivered = bookings.filter((b) => b.status === "delivered");
  const totalRevenue = bookings.reduce((s, b) => s + b.deliveryFee, 0);
  const onTime = delivered.length > 0 ? Math.round((delivered.length / Math.max(bookings.length, 1)) * 100) : 92;

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
      verificationStatus={partner.verificationStatus}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title={`Morning, ${user.name.split(" ")[0]}.`}
          sub={`${partner.city ?? "Lagos"} depot. ${bookings.filter((b) => b.status !== "delivered" && b.status !== "cancelled").length} active today · ${onTime}% on-time this week`}
          actions={<>
            <button className="dbtn dBtn-ghost"><Icon name="pin" size={14} /> Live map</button>
            <button className="dbtn dBtn-mint"><Icon name="plus" size={14} /> Manual booking</button>
          </>}
        />

        {/* Operation strip */}
        <div className="card" style={{
          padding: 14, background: "linear-gradient(120deg, #dfe5f7 0%, #c4cdf0 60%, var(--paper))",
          borderColor: "#c4cdf0",
        }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            <div style={{
              width: 46, height: 46, borderRadius: 12,
              background: "var(--indigo-100)", color: "var(--indigo-500)",
              display: "grid", placeItems: "center", flexShrink: 0,
            }}>
              <Icon name="truck" size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#3a4ba6", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} WAT
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
                {[
                  { v: bookings.length, l: "Total bookings" },
                  { v: bookings.filter((b) => b.status === "in_transit").length, l: "In transit", c: "var(--info)" },
                  { v: bookings.filter((b) => b.status === "picked_up").length, l: "Out for delivery", c: "var(--warning)" },
                  { v: delivered.length, l: "Delivered" },
                  { v: `₦${Math.round(totalRevenue / 1000)}K`, l: "Revenue", c: "var(--success)" },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "10px 14px", background: "var(--paper)", borderRadius: 10, border: "1px solid var(--ink-100)" }}>
                    <div style={{ fontFamily: "var(--font-accent)", fontSize: 28, fontWeight: 500, lineHeight: 1, color: s.c || "var(--ink-900)" }}>
                      {s.v}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, color: "var(--ink-700)" }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
          <div className="stat">
            <div className="stat-lbl">Bookings · 30d</div>
            <div className="stat-val">{bookings.length}</div>
            <div className="stat-delta"><Icon name="cart" size={12} /><span>All time</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Earnings · 30d</div>
            <div className="stat-val money">{fmtK(totalRevenue)}</div>
            <div className="stat-delta"><Icon name="coin" size={12} /><span>All time</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">On-time rate</div>
            <div className="stat-val">{onTime}%</div>
            <div className="stat-delta"><Icon name="clock" size={12} /><span>Current</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Active bookings</div>
            <div className="stat-val">{bookings.filter((b) => b.status !== "delivered" && b.status !== "cancelled").length}</div>
            <div className="stat-delta"><Icon name="bolt" size={12} /><span>In progress</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Reliability</div>
            <div className="stat-val">{partner.reliabilityScore}/100</div>
            <div className="stat-delta"><Icon name="star" size={12} /><span>Score</span></div>
          </div>
        </div>

        {/* Live ops + Riders */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 16 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--ink-100)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Live ops · {partner.city ?? "Lagos"}</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>riders · last ping &lt; 30s ago</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="dbtn dBtn-soft" style={{ fontSize: 12, padding: "5px 10px" }}>All</button>
                <button className="dbtn dBtn-ghost" style={{ fontSize: 12, padding: "5px 10px" }}>Pickups</button>
                <button className="dbtn dBtn-ghost" style={{ fontSize: 12, padding: "5px 10px" }}>In transit</button>
              </div>
            </div>
            <svg viewBox="0 0 800 380" width="100%" height="380" style={{ background: "#eef2ec", display: "block" }}>
              <defs><pattern id="ldot" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="0.6" fill="#c8d4cd"/></pattern></defs>
              <rect width="800" height="380" fill="url(#ldot)"/>
              <path d="M0 240 Q200 200 380 240 Q540 280 720 230 L800 250 L800 310 Q600 290 400 310 Q200 330 0 310 Z" fill="#bcd2e0" opacity="0.7"/>
              <path d="M40 80 Q220 120 400 80 T780 60" stroke="#fff" strokeWidth="3" fill="none" opacity="0.7"/>
              <path d="M100 360 Q300 340 480 360 T780 340" stroke="#fff" strokeWidth="3" fill="none" opacity="0.7"/>
              <polygon points="80,80 220,60 280,150 200,180 100,160" fill="rgba(42,174,160,0.18)" stroke="var(--teal-700)" strokeWidth="1.5"/>
              <text x="160" y="115" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--teal-800)">Ikeja</text>
              <polygon points="340,80 460,90 480,180 360,200 320,150" fill="rgba(42,174,160,0.18)" stroke="var(--teal-700)" strokeWidth="1.5"/>
              <text x="400" y="135" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--teal-800)">Yaba</text>
              <polygon points="540,90 660,80 720,170 620,200 540,180" fill="rgba(42,174,160,0.18)" stroke="var(--teal-700)" strokeWidth="1.5"/>
              <text x="620" y="135" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--teal-800)">Lekki Ph 1</text>
              <circle cx="380" cy="280" r="11" fill="var(--rose-500)" stroke="white" strokeWidth="3"/>
              <text x="380" y="306" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink-900)">Depot · {partner.city ?? "Yaba"}</text>
              {bookings.length > 0 && bookings.slice(0, 4).map((b, i) => {
                const positions = [
                  { x: 165, y: 145 },
                  { x: 410, y: 160 },
                  { x: 600, y: 145 },
                  { x: 240, y: 200 },
                ];
                const p = positions[i % positions.length];
                const colors = ["var(--success)", "var(--info)", "var(--warning)", "var(--info)"];
                return (
                  <g key={b.id}>
                    <circle cx={p.x} cy={p.y} r="9" fill={colors[i]} stroke="white" strokeWidth="2"/>
                    <circle cx={p.x} cy={p.y} r="14" fill={colors[i]} opacity="0.2"/>
                    <text x={p.x} y={p.y + 2} fontSize="7" fontWeight="700" fill="white" textAnchor="middle">&#x1F6F5;</text>
                  </g>
                );
              })}
              <path d="M380 280 Q380 220 600 145" stroke="var(--teal-700)" strokeWidth="2" fill="none" strokeDasharray="5 3"/>
              <path d="M380 280 Q300 220 165 145" stroke="var(--teal-700)" strokeWidth="2" fill="none" strokeDasharray="5 3"/>
            </svg>
            <div style={{
              position: "absolute", bottom: 14, left: 14,
              padding: "8px 12px", background: "var(--paper)", borderRadius: 10,
              display: "flex", gap: 14, fontSize: 11.5,
            }}>
              {[
                { c: "var(--success)", l: "Active" },
                { c: "var(--info)", l: "In transit" },
                { c: "var(--warning)", l: "Out for delivery" },
                { c: "var(--ink-300)", l: "Idle" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.c }} />{r.l}
                </div>
              ))}
            </div>
          </div>

          {/* Riders */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Riders on shift</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>0 of {partner.vehicleTypes.length} active</div>
              </div>
              <button className="btn-link" style={{ fontSize: 12 }}>Roster →</button>
            </div>
            <div style={{ padding: "20px 16px", textAlign: "center", fontSize: 13, color: "var(--ink-500)" }}>
              No riders on shift yet. Riders will appear here once added to your fleet.
            </div>
          </div>
        </div>

        {/* Next pickups */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Next pickups · ordered by time</div>
            <button className="btn-link" style={{ fontSize: 12 }}>All bookings →</button>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Time</th>
                <th>Booking</th>
                <th>Seller</th>
                <th>From → To</th>
                <th>Package</th>
                <th>Fee</th>
                <th>Rider</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.slice(0, 6).map((b) => {
                const pkg = b.packageDetails && typeof b.packageDetails === "object" && !Array.isArray(b.packageDetails)
                  ? (b.packageDetails as { description?: string; weight?: number }).description ?? "Package"
                  : "Package";
                const w = b.packageDetails && typeof b.packageDetails === "object"
                  ? (b.packageDetails as { weight?: number }).weight
                  : null;
                return (
                  <tr key={b.id}>
                    <td>
                      <div style={{ fontFamily: "var(--font-accent)", fontSize: 18, fontWeight: 500 }}>
                        {new Date(b.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-500)" }}>WAT</div>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--teal-700)", fontSize: 12 }}>
                      #{b.id.slice(-6).toUpperCase()}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{b.seller.name}</td>
                    <td style={{ fontSize: 12 }}><strong>{b.pickupLocation}</strong> → {b.destination}</td>
                    <td style={{ fontSize: 12, color: "var(--ink-600)" }}>{pkg}{w ? ` · ${w}kg` : ""}</td>
                    <td className="money" style={{ fontWeight: 600 }}>{fmt(b.deliveryFee)}</td>
                    <td style={{ fontSize: 12 }}>
                      {b.trackingCode ? b.trackingCode : <span style={{ color: "var(--warning)", fontWeight: 600 }}>Auto-assign</span>}
                    </td>
                    <td><Badge variant={b.status === "delivered" ? "mint" : b.status === "failed" || b.status === "cancelled" ? "danger" : b.status === "picked_up" || b.status === "in_transit" ? "info" : "warn"} dot>{b.status.replace(/_/g, " ")}</Badge></td>
                  </tr>
                );
              })}
              {bookings.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>No bookings yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppFrame>
  );
}
