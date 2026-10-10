import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { updateFeeBearer } from "@/app/actions/billing";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }

export default async function LogisticsBillingPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const [feeConfig, bookings] = await Promise.all([
    db.platformFeeConfig.findFirst({ where: { active: true } }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, deliveryFee: true, platformFee: true, feeBearer: true,
        netAmount: true, currency: true, status: true, createdAt: true,
        seller: { select: { name: true } },
      },
    }),
  ]);

  const rate = feeConfig?.rate ?? 1.5;
  const bearer = feeConfig?.bearer ?? "seller";
  const delivered = bookings.filter((b) => b.status === "delivered");
  const totalGross = delivered.reduce((s, b) => s + b.deliveryFee, 0);
  const totalFees = delivered.reduce((s, b) => s + (b.platformFee || Math.round(b.deliveryFee * rate / 100)), 0);
  const totalNet = delivered.reduce((s, b) => s + (b.netAmount || b.deliveryFee - (b.platformFee || Math.round(b.deliveryFee * rate / 100))), 0);

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
          title="Billing & fees"
          sub={`${rate}% platform fee per delivery · currently borne by the ${bearer}`}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="stat">
            <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--success-bg)", color: "var(--success)", display: "grid", placeItems: "center", marginBottom: 8 }}>
              <Icon name="coin" size={18} />
            </div>
            <div className="stat-lbl">Gross revenue (delivered)</div>
            <div className="stat-val money">{fmt(totalGross)}</div>
            <div className="stat-delta delta-up"><Icon name="cart" size={11} /> {delivered.length} deliveries</div>
          </div>
          <div className="stat">
            <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--info-bg)", color: "var(--info)", display: "grid", placeItems: "center", marginBottom: 8 }}>
              <Icon name="clock" size={18} />
            </div>
            <div className="stat-lbl">Platform fees ({rate}%)</div>
            <div className="stat-val money" style={{ color: "var(--ink-700)" }}>{fmt(totalFees)}</div>
            <div className="stat-delta delta-flat"><Icon name="shop" size={11} /> goes to Shopinbos</div>
          </div>
          <div className="stat">
            <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--success-bg)", color: "var(--success)", display: "grid", placeItems: "center", marginBottom: 8 }}>
              <Icon name="bank" size={18} />
            </div>
            <div className="stat-lbl">Net revenue to you</div>
            <div className="stat-val money">{fmt(totalNet)}</div>
            <div className="stat-delta delta-up"><Icon name="arrowUp" size={11} /> lifetime</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--ink-100)" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Transaction history</div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Seller</th>
                  <th>Delivery fee</th>
                  <th>Platform fee</th>
                  <th>Bearer</th>
                  <th>Net</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.length > 0 ? bookings.slice(0, 50).map((b) => {
                  const fee = b.platformFee || Math.round(b.deliveryFee * rate / 100);
                  const net = b.netAmount || b.deliveryFee - fee;
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600, fontSize: 12 }}>{new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                      <td style={{ fontSize: 12.5 }}>{b.seller.name}</td>
                      <td className="money">{fmt(b.deliveryFee)}</td>
                      <td className="money" style={{ color: "var(--ink-500)" }}>−{fmt(fee)}</td>
                      <td><Badge variant="info" style={{ fontSize: 10 }}>{b.feeBearer || bearer}</Badge></td>
                      <td className="money" style={{ fontWeight: 600 }}>{fmt(net)}</td>
                      <td><Badge variant={b.status === "delivered" ? "success" : "info"} dot>{b.status.replace(/_/g, " ")}</Badge></td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={7} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>No transactions yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Fee configuration</div>
              <form action={updateFeeBearer}>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label className="label">Who bears the {rate}% platform fee?</label>
                  <select name="feeBearer" className="inp" defaultValue={bearer}>
                    <option value="seller">Seller (buyer pays)</option>
                    <option value="supplier">Supplier</option>
                    <option value="logistics_partner">Logistics partner (you)</option>
                  </select>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-500)", lineHeight: 1.5, marginBottom: 12 }}>
                  This setting determines who the {rate}% platform fee is deducted from on each completed delivery.
                  {bearer === "seller" && " The fee is added to the seller's delivery cost at checkout."}
                  {bearer === "logistics_partner" && " The fee is deducted from your payout on each delivery."}
                  {bearer === "supplier" && " The fee is charged to the supplier associated with the order."}
                </div>
                <button className="dbtn dBtn-mint" style={{ width: "100%", justifyContent: "center" }}>
                  <Icon name="check" size={13} /> Save fee bearer
                </button>
              </form>
            </div>

            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 12 }}>Fee summary</div>
              <div style={{ display: "grid", gap: 10, fontSize: 12.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--ink-100)" }}>
                  <span>Platform fee rate</span>
                  <strong style={{ color: "var(--teal-700)" }}>{rate}%</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--ink-100)" }}>
                  <span>Fee bearer</span>
                  <strong style={{ textTransform: "capitalize" }}>{bearer.replace(/_/g, " ")}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--ink-100)" }}>
                  <span>Completed deliveries</span>
                  <strong>{delivered.length}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--ink-100)" }}>
                  <span>Gross revenue</span>
                  <strong>{fmt(totalGross)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Total fees paid</span>
                  <strong style={{ color: "var(--ink-500)" }}>{fmt(totalFees)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
