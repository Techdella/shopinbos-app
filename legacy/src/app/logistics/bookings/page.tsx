import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { updateDeliveryBookingStatus } from "@/app/actions/logistics";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, FilterBar, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }

export default async function LogisticsBookingsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const bookings = await db.deliveryBooking.findMany({
    where: { logisticsPartnerId: partner.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, pickupLocation: true, destination: true, deliveryFee: true,
      currency: true, status: true, trackingCode: true, estimatedDelivery: true,
      createdAt: true, packageDetails: true,
      seller: { select: { name: true } },
    },
  });

  const today = bookings.filter((b) => new Date(b.createdAt).toDateString() === new Date().toDateString());

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
          title="Bookings"
          sub={`${today.length} active today · ${bookings.length} total`}
          actions={<>
            <button className="dbtn dBtn-ghost"><Icon name="download" size={14} /> Export</button>
            <button className="dbtn dBtn-mint"><Icon name="plus" size={14} /> Manual booking</button>
          </>}
        />

        <div style={{ display: "flex", gap: 6, marginBottom: 0, padding: 5, background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10, alignSelf: "flex-start" }}>
          {[
            { l: "All today", n: today.length, on: true },
            { l: "Pending pickup", n: bookings.filter((b) => b.status === "pending").length, color: "var(--warning)" },
            { l: "Picked up", n: bookings.filter((b) => b.status === "picked_up").length },
            { l: "In transit", n: bookings.filter((b) => b.status === "in_transit").length },
            { l: "Out for delivery", n: bookings.filter((b) => b.status === "confirmed").length },
            { l: "Delivered", n: bookings.filter((b) => b.status === "delivered").length },
            { l: "Failed / returns", n: bookings.filter((b) => b.status === "failed").length, color: "var(--danger)" },
          ].map((t, i) => (
            <button key={i} className={"dbtn " + (t.on ? "dBtn-soft" : "dBtn-ghost")} style={{ padding: "6px 12px", fontSize: 12.5, color: t.on ? "var(--teal-800)" : t.color || "var(--ink-700)" }}>
              {t.l} <span style={{ marginLeft: 4, fontFamily: "var(--font-mono)", opacity: 0.7, fontSize: 11 }}>{t.n}</span>
            </button>
          ))}
        </div>

        <FilterBar search="Search by booking #, seller, address…" />

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Seller</th>
                <th>Route</th>
                <th>Package</th>
                <th>Fee</th>
                <th>Pickup time</th>
                <th>Rider</th>
                <th>Status</th>
                <th>SLA</th>
                <th>Dispatch controls</th>
              </tr>
            </thead>
            <tbody>
              {bookings.slice(0, 20).map((b, i) => {
                const pkg = b.packageDetails && typeof b.packageDetails === "object"
                  ? (b.packageDetails as { description?: string; weight?: number }) 
                  : null;
                const pkgStr = pkg ? `${pkg.description ?? "Box"} · ${pkg.weight ?? "0.5"}kg` : "Package";
                return (
                  <tr key={b.id}>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--teal-700)", fontSize: 12 }}>
                      #{b.id.slice(-6).toUpperCase()}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{b.seller.name}</td>
                    <td style={{ fontSize: 11.5 }}>
                      <strong>{b.pickupLocation}</strong> → {b.destination}
                    </td>
                    <td style={{ fontSize: 11.5, color: "var(--ink-600)" }}>{pkgStr}</td>
                    <td className="money" style={{ fontWeight: 600 }}>{fmt(b.deliveryFee)}</td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{new Date(b.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td style={{ fontSize: 11.5, color: b.trackingCode ? "var(--ink-700)" : "var(--warning)", fontWeight: b.trackingCode ? 400 : 600 }}>
                      {b.trackingCode ?? "Auto-assigning…"}
                    </td>
                    <td>
                      <Badge variant={b.status === "delivered" ? "mint" : b.status === "failed" || b.status === "cancelled" ? "danger" : b.status === "picked_up" || b.status === "in_transit" ? "info" : "warn"} dot>
                        {b.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td style={{ fontSize: 11.5, color: "var(--ink-500)" }}>-</td>
                    <td>
                      <form action={updateDeliveryBookingStatus} style={{ display: "grid", gridTemplateColumns: "120px 120px 150px auto", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <select name="status" className="inp" defaultValue={b.status} aria-label="Dispatch status">
                          {["pending", "confirmed", "picked_up", "in_transit", "delivered", "failed", "cancelled"].map((status) => (
                            <option key={status} value={status}>{status.replace(/_/g, " ")}</option>
                          ))}
                        </select>
                        <input name="trackingCode" className="inp" defaultValue={b.trackingCode ?? ""} placeholder="Tracking code" aria-label="Tracking code" />
                        <input name="estimatedDelivery" className="inp" type="datetime-local" defaultValue={b.estimatedDelivery ? new Date(b.estimatedDelivery).toISOString().slice(0, 16) : ""} aria-label="Estimated delivery" />
                        <button className="dbtn dBtn-mint" type="submit" style={{ padding: "7px 10px", fontSize: 12 }}>Update</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {bookings.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>No bookings yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppFrame>
  );
}
