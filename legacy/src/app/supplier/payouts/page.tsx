import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { PayoutBankSection } from "@/components/payments/PayoutBankSection";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }

export default async function SupplierPayoutsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const payoutAccount = await db.supplierPayoutAccount.findUnique({
    where: { supplierId: supplier.id },
  });
  const payoutBank = payoutAccount
    ? {
        bankName: payoutAccount.bankName,
        accountNumber: payoutAccount.accountNumberMask,
        accountName: payoutAccount.accountName,
      }
    : null;

  const orders = await db.wholesaleOrder.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      totalPrice: true,
      currency: true,
      status: true,
      createdAt: true,
      seller: { select: { name: true } },
      supplierProduct: { select: { name: true } },
    },
  });

  const payable = orders.filter((o) => ["shipped", "delivered"].includes(o.status));
  const payableValue = payable.reduce((s, o) => s + Number(o.totalPrice), 0);

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
          title="Payouts"
          sub={payoutAccount?.verificationStatus === "verified"
            ? `${payoutAccount.bankName} ${payoutAccount.accountNumberMask} · Paystack recipient ready`
            : `${payable.length} orders ready for settlement · total ${fmt(payableValue)}`}
          actions={<button className="dbtn dBtn-ghost"><Icon name="download" size={14} /> Export</button>}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div className="stat">
            <div className="stat-lbl">Payable orders</div>
            <div className="stat-val">{payable.length}</div>
            <div className="stat-delta delta-up">
              <Icon name="package" size={12} />
              <span>shipped or delivered</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Estimated payout</div>
            <div className="stat-val money">{fmt(payableValue)}</div>
            <div className="stat-delta delta-flat">
              <Icon name="coin" size={12} />
              <span>settles after delivery</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">All orders</div>
            <div className="stat-val">{orders.length}</div>
            <div className="stat-delta delta-up">
              <Icon name="refresh" size={12} />
              <span>lifetime</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Payout schedule</div>
            <div className="stat-val">D+3</div>
            <div className="stat-delta delta-flat">
              <Icon name="clock" size={12} />
              <span>after buyer confirms</span>
            </div>
          </div>
        </div>

        <PayoutBankSection role="supplier" payoutBank={payoutBank} displayName={supplier.displayName} />

        {/* Payout schedule */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Payout schedule · this month</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Mon 12 May", orders: 4, amount: payableValue * 0.32, status: "Settled" },
                { label: "Mon 19 May", orders: 3, amount: payableValue * 0.24, status: "Settled" },
                { label: "Mon 26 May (est.)", orders: payable.length - 7, amount: payableValue * 0.44, status: "Pending" },
              ].map((p, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 12px", background: "var(--ink-50)", borderRadius: 8,
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{p.orders} orders</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="money" style={{ fontWeight: 600, fontSize: 13 }}>{fmt(p.amount)}</div>
                    <Badge variant={p.status === "Settled" ? "mint" : "info"}>{p.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>Payout settings</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              {[
                ["Bank", payoutBank ? `${payoutBank.bankName} ··${payoutBank.accountNumber.slice(-4)}` : "Not connected"],
                ["Paystack", payoutAccount?.verificationStatus ?? "Not configured"],
                ["Recipient", payoutAccount?.paystackRecipientCode ? "Connected" : "Not created"],
                ["Auto-settlement", "Every Monday"],
                ["Hold period", "3 days after delivery"],
                ["Min. payout", "₦5,000"],
                ["Fees", "0% platform fee"],
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: i ? "1px solid var(--ink-100)" : "none" }}>
                  <span style={{ color: "var(--ink-500)" }}>{r[0]}</span>
                  <strong>{r[1]}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent settlements */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Product</th>
                <th>Seller</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 15).map((o) => (
                <tr key={o.id}>
                  <td>{o.supplierProduct.name}</td>
                  <td>{o.seller.name}</td>
                  <td className="money" style={{ fontWeight: 600 }}>{fmt(Number(o.totalPrice))}</td>
                  <td>
                    <Badge variant={o.status === "delivered" || o.status === "shipped" ? "mint" : o.status === "pending" ? "warn" : "info"}>{o.status}</Badge>
                  </td>
                  <td style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
                    {new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>No payouts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Explanation card */}
        <div className="card" style={{
          padding: 16, background: "var(--amber-50)", border: "1px solid var(--amber-200)",
          display: "flex", alignItems: "flex-start", gap: 11,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: "var(--amber-100)",
            display: "grid", placeItems: "center", color: "var(--amber-700)", fontSize: 14, flexShrink: 0,
          }}>
            <Icon name="info" size={14} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 12.5, color: "var(--amber-800)" }}>Payout schedule explained</div>
            <div style={{ fontSize: 12, color: "var(--amber-700)", marginTop: 3 }}>
              Payouts are batched every Monday. Orders settle 3 days after the buyer confirms delivery.
              No platform fees on supplier payouts — you keep 100% of the listed price.
            </div>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
