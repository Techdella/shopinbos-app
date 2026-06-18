import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon, MascotAvatar } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }

export default async function SellerLogisticsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;

  const active = workspace.deliveryBookings.filter((b) => ["pending", "confirmed", "picked_up", "in_transit"].includes(b.status));
  const delivered = workspace.deliveryBookings.filter((b) => b.status === "delivered");
  const topPartners = workspace.logisticsPartners.slice(0, 6);
  const recentQuotes = workspace.deliveryQuotes.slice(0, 5);
  const recentBookings = workspace.deliveryBookings.slice(0, 5);

  return (
    <AppFrame
      role="seller"
      storeName={workspace.store?.name ?? "Store"}
      storeSlug={workspace.store?.slug ?? ""}
      storeInitial={workspace.store?.name?.charAt(0).toUpperCase() ?? "S"}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Logistics Desk"
          sub={`${workspace.logisticsPartners.length} verified partners · ${workspace.deliveryQuotes.length} quote requests · ${active.length} active bookings`}
          actions={<>
            <a href="/marketplace?type=logistics" className="dbtn dBtn-ghost" style={{ textDecoration: "none" }}><Icon name="truck" size={14} /> Find partners</a>
            <a href="/home/logistics?intent=book_delivery" className="dbtn dBtn-mint" style={{ textDecoration: "none" }}><Icon name="plus" size={14} /> Book delivery</a>
          </>}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 18 }}>
          {/* Available partners */}
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--ink-100)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Available partners</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>Verified fleets you can use at checkout or for manual bookings</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {["All partners", "Same-day", "Nationwide"].map((f, i) => {
                  const filter = i === 0 ? "all" : i === 1 ? "same_day" : "nationwide";
                  return (
                    <a key={f} href={`/home/logistics?filter=${filter}`} className={`dbtn ${i === 0 ? "dBtn-soft" : "dBtn-ghost"}`} style={{ fontSize: 12, padding: "6px 10px", textDecoration: "none" }}>{f}</a>
                  );
                })}
              </div>
            </div>
            {topPartners.length === 0 ? (
              <div style={{ padding: 24, fontSize: 13, color: "var(--ink-500)" }}>Verified logistics partners will appear here as soon as they are approved.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {topPartners.map((p) => (
                  <div key={p.id} style={{ padding: "14px 16px", borderTop: "1px solid var(--ink-100)", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--teal-100)", color: "var(--teal-700)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <Icon name="truck" size={19} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.displayName}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-500)" }}>{p.city}, {p.country} · reliability {p.reliabilityScore}/100</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-600)" }}>
                        <strong>Base {fmt(p.basePrice)}</strong> · {p.coverageZones.join(", ")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <Badge variant={p.verificationStatus === "verified" ? "mint" : "warn"}>{p.verificationStatus}</Badge>
                      <Link href={`/home/logistics?intent=quote&partner=${p.id}`} className="dbtn dBtn-ghost" style={{ fontSize: 12, padding: "6px 10px", textDecoration: "none" }}>Quote</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar: quotes + bookings */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--ink-100)" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Quote requests</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>Routes waiting for a partner answer</div>
              </div>
              {recentQuotes.length === 0 ? (
                <div style={{ padding: 20, fontSize: 13, color: "var(--ink-500)" }}>When you request delivery pricing, those conversations will show up here.</div>
              ) : (
                recentQuotes.map((q) => (
                  <div key={q.id} style={{ padding: "12px 16px", borderTop: "1px solid var(--ink-100)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{q.logisticsPartner.displayName}</div>
                      <Badge variant={q.status === "pending" ? "warn" : q.status === "accepted" ? "mint" : "info"}>{q.status}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-600)" }}>{q.pickupLocation} → {q.destination}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 2 }}>
                      {new Date(q.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--ink-100)" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Delivery bookings</div>
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>Latest movements across your store</div>
              </div>
              {recentBookings.length === 0 ? (
                <div style={{ padding: 20, fontSize: 13, color: "var(--ink-500)" }}>Delivery bookings will appear here once you confirm a logistics partner.</div>
              ) : (
                recentBookings.map((b) => (
                  <div key={b.id} style={{ padding: "12px 16px", borderTop: "1px solid var(--ink-100)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{b.logisticsPartner.displayName}</div>
                      <Badge variant={b.status === "delivered" ? "mint" : b.status === "failed" ? "danger" : b.status === "in_transit" ? "info" : "warn"}>{b.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--ink-600)" }}>{b.pickupLocation} → {b.destination}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-400)", marginTop: 2 }}>
                      {fmt(b.deliveryFee)} · {new Date(b.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="card" style={{ padding: 14, background: "linear-gradient(160deg, var(--teal-50), var(--paper))" }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <MascotAvatar role="seller" size={36} />
                <div>
                  <div style={{ fontSize: 11, color: "var(--teal-700)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Peggy</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-700)", marginTop: 4 }}>
                    Peggy compares reliability, price, and response time before you book. Same-day partners tend to reply fastest before noon.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
