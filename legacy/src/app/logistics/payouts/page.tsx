import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { PayoutBankSection } from "@/components/payments/PayoutBankSection";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }

export default async function LogisticsPayoutsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const payoutAccount = await db.logisticsPayoutAccount.findUnique({
    where: { logisticsPartnerId: partner.id },
  });
  const payoutBank = payoutAccount
    ? { bankName: payoutAccount.bankName, accountNumber: payoutAccount.accountNumberMask, accountName: payoutAccount.accountName }
    : null;

  const bookings = await db.deliveryBooking.findMany({
    where: { logisticsPartnerId: partner.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, pickupLocation: true, destination: true, deliveryFee: true, currency: true, status: true, createdAt: true, seller: { select: { name: true } } },
  });

  const delivered = bookings.filter((b) => b.status === "delivered");
  const deliveredValue = delivered.reduce((s, b) => s + b.deliveryFee, 0);
  const pending_delivery = bookings.filter((b) => b.status === "in_transit" || b.status === "picked_up");

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
          title="Payouts"
          sub={payoutBank ? `${payoutBank.bankName} · ••${payoutBank.accountNumber.slice(-2)} · paid daily after delivery confirmation` : "Link your bank account to collect payout settlements."}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="card" style={{ padding: 20, background: "linear-gradient(135deg, #dfe5f7, #c4cdf0 50%, #a0afe8)", borderColor: "#a0afe8" }}>
            <div style={{ fontSize: 11.5, color: "#3a4ba6", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Tomorrow&apos;s payout</div>
            <div style={{ fontFamily: "var(--font-accent)", fontSize: 38, fontWeight: 500, lineHeight: 1, color: "var(--ink-900)" }}>{fmt(deliveredValue * 0.3)}</div>
            <div style={{ fontSize: 13, color: "#3a4ba6", marginTop: 8 }}>From {delivered.length} confirmed deliveries · 70% rider cuts</div>
          </div>
          <div className="stat">
            <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--info-bg)", color: "var(--info)", display: "grid", placeItems: "center", marginBottom: 8 }}>
              <Icon name="clock" size={18} />
            </div>
            <div className="stat-lbl">Awaiting delivery confirmation</div>
            <div className="stat-val money">{fmt(pending_delivery.reduce((s, b) => s + b.deliveryFee, 0))}</div>
            <div className="stat-delta delta-flat"><Icon name="clock" size={11} /> {pending_delivery.length} deliveries pending</div>
          </div>
          <div className="stat">
            <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--teal-100)", color: "var(--teal-700)", display: "grid", placeItems: "center", marginBottom: 8 }}>
              <Icon name="chart" size={18} />
            </div>
            <div className="stat-lbl">YTD revenue</div>
            <div className="stat-val money">{fmt(deliveredValue)}</div>
            <div className="stat-delta delta-up"><Icon name="arrowUp" size={11} /> lifetime</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--ink-100)" }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Payout history</div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Deliveries</th>
                  <th>Gross</th>
                  <th>Rider cuts</th>
                  <th>Shopinbos fee</th>
                  <th>Net to you</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.length > 0 ? bookings.slice(0, 6).map((b) => {
                  const gross = b.deliveryFee;
                  const riderCut = gross * 0.28;
                  const platformFee = gross * 0.024;
                  const net = gross * 0.7;
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{new Date(b.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                      <td>1</td>
                      <td className="money">{fmt(gross)}</td>
                      <td className="money" style={{ color: "var(--ink-500)" }}>−{fmt(riderCut)}</td>
                      <td className="money" style={{ color: "var(--ink-500)" }}>−{fmt(platformFee)}</td>
                      <td className="money" style={{ fontWeight: 600 }}>{fmt(net)}</td>
                      <td><Badge variant={b.status === "delivered" ? "success" : "info"} dot>{b.status.replace(/_/g, " ")}</Badge></td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={7} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>No delivery history yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <PayoutBankSection role="logistics_partner" payoutBank={payoutBank} displayName={partner.displayName} />
            <div className="card" style={{ padding: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Rider commissions · today</div>
              <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "var(--ink-500)" }}>
                No rider commissions data yet. Commissions will appear after deliveries are completed.
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
