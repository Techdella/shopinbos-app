import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { PayoutBankSection } from "@/components/payments/PayoutBankSection";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }
function fmtDate(d: Date) { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(d)); }

export default async function SellerPaymentsPage() {
  const user = await requireRole(["seller"], "/login");

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, currency: true, brandSettings: true },
  });

  const brandSettings = (store?.brandSettings as any) || {};
  const payoutBank = brandSettings.payoutBank || null;

  const orders = store
    ? await db.retailOrder.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, orderNumber: true, buyerName: true, total: true, currency: true, status: true, createdAt: true },
      })
    : [];

  const paidOrders = orders.filter((o) => ["paid", "processing", "shipped", "delivered"].includes(o.status));
  const grossTotal = paidOrders.reduce((s, o) => s + Number(o.total), 0);
  const available = grossTotal * 0.975;
  const onHold = grossTotal * 0.025;

  return (
    <AppFrame
      role="seller"
      storeName={store?.name}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Payments"
          sub="Shopinbos handles checkout. You add your bank, we send the money."
          actions={<Link href="/home/payments/statement" className="dbtn dBtn-ghost"><Icon name="download" size={14} /> Statement</Link>}
        />

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div className="stat">
            <div className="stat-lbl">Available balance</div>
            <div className="stat-val money">{fmt(available)}</div>
            <div className="stat-delta delta-flat">
              <Icon name="bank" size={12} />
              <span>settles tomorrow 6am</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">On hold</div>
            <div className="stat-val money">{fmt(onHold)}</div>
            <div className="stat-delta delta-flat">
              <Icon name="lock" size={12} />
              <span>dispute window</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Paid · 30d</div>
            <div className="stat-val money">{fmt(grossTotal)}</div>
            <div className="stat-delta delta-up">
              <Icon name="coin" size={12} />
              <span>42 settlements</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Shopinbos fee</div>
            <div className="stat-val">1.5%</div>
            <div className="stat-delta delta-flat">Pro plan</div>
          </div>
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
          {/* Left: scheduled payout + recent payouts */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Scheduled payout card */}
            <div className="card" style={{
              padding: 22,
              background: "linear-gradient(135deg, var(--teal-900), var(--teal-700))",
              color: "white",
            }}>
              <div style={{
                fontSize: 11.5, color: "var(--teal-200)", fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8,
              }}>
                Tomorrow morning · {fmtDate(new Date(Date.now() + 86400000))}
              </div>
              <div style={{ fontFamily: "var(--font-accent)", fontSize: 44, fontWeight: 500, lineHeight: 1 }}>
                {fmt(available)}
              </div>
              <div style={{ fontSize: 13, color: "var(--teal-200)", marginTop: 8 }}>
                Sent to <strong style={{ color: "white" }}>
                  {payoutBank ? `${payoutBank.bankName} ••${payoutBank.accountNumber.slice(-2)}` : "unlinked bank account"}
                </strong> · usually arrives within 1 hour
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18,
                marginTop: 22, paddingTop: 18,
                borderTop: "1px solid rgba(255,255,255,0.15)",
              }}>
                {[
                  { l: "From orders", v: fmt(grossTotal) },
                  { l: "Refunded", v: "−₦0" },
                  { l: "Shopinbos fee", v: `−${fmt(grossTotal * 0.015)}` },
                  { l: "Tax withheld", v: "₦0" },
                ].map((r, i) => (
                  <div key={i}>
                    <div style={{ color: "var(--teal-200)", fontSize: 11.5 }}>{r.l}</div>
                    <div style={{ fontWeight: 600, marginTop: 3, fontSize: 14 }}>{r.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent payouts */}
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{
                padding: "14px 16px", borderBottom: "1px solid var(--ink-100)",
                display: "flex", justifyContent: "space-between",
              }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Recent payouts</div>
                <Link href="/home/payouts" className="dbtn dBtn-link" style={{ fontSize: 12 }}>All →</Link>
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Orders</th>
                    <th>Gross</th>
                    <th>Fee</th>
                    <th>Net</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paidOrders.slice(0, 6).map((o, i) => (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600 }}>{fmtDate(o.createdAt)}</td>
                      <td>{1}</td>
                      <td className="money" style={{ fontWeight: 600 }}>{fmt(Number(o.total))}</td>
                      <td className="money" style={{ color: "var(--ink-500)" }}>−{fmt(Math.round(Number(o.total) * 0.015))}</td>
                      <td className="money" style={{ fontWeight: 600 }}>{fmt(Math.round(Number(o.total) * 0.985))}</td>
                      <td><Badge variant="success" dot>Settled</Badge></td>
                    </tr>
                  ))}
                  {paidOrders.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 16, color: "var(--ink-500)", textAlign: "center" }}>
                        No payouts yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: bank account + settings */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <PayoutBankSection role="seller" payoutBank={payoutBank} displayName={user.name} />

            {/* Payout settings */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Payout settings</div>
              {[
                { l: "Schedule", v: "Daily · 6am WAT" },
                { l: "Threshold", v: "No minimum" },
                { l: "Currency", v: "₦ Naira" },
                { l: "FX spread (cross-border)", v: "1.5% (Pro default)" },
                { l: "Auto-hold disputes", v: "72 hours · standard" },
              ].map((r, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "8px 0", borderTop: i ? "1px solid var(--ink-100)" : "none",
                }}>
                  <div style={{ fontSize: 12.5, color: "var(--ink-700)" }}>{r.l}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.v}</div>
                </div>
              ))}
            </div>

            {/* How checkout works */}
            <div className="card" style={{
              padding: 14,
              background: "linear-gradient(160deg, var(--teal-50), var(--paper))",
            }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9,
                  background: "var(--paper)", color: "var(--teal-700)",
                  display: "grid", placeItems: "center", flexShrink: 0,
                }}>
                  <Icon name="lock" size={16} />
                </div>
                <div>
                  <div style={{
                    fontSize: 11, color: "var(--teal-700)", fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3,
                  }}>
                    How checkout works
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.55 }}>
                    Customers pay through Shopinbos and Paystack handles secure checkout. The money settles to your bank account the next morning. <strong>You don&apos;t manage any payment providers.</strong>
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
