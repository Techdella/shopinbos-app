import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

function formatTime(date: Date) {
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

export default async function SellerAutomationsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const storeId = workspace?.store?.id;
  const recentOrders = storeId
    ? await db.retailOrder.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 8 })
    : [];

  return (
    <AppFrame role="seller" searchPlaceholder="Search automations...">
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Automations"
          sub="Automate your email workflows"
        />

        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: "var(--teal-100)", color: "var(--teal-700)", display: "grid", placeItems: "center" }}>
                <Icon name="mail" size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Order confirmation email</div>
                <div style={{ fontSize: 13, color: "var(--ink-600)", lineHeight: 1.5 }}>
                  When a customer checks out, Shopinbos creates the order, sends a receipt to the buyer, sends a seller email notification, and writes an in-app notification.
                </div>
              </div>
            </div>
            <Badge variant="success" dot>Active</Badge>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Recent run</th>
                <th>Buyer</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => (
                <tr key={order.id}>
                  <td style={{ fontWeight: 600 }}>{order.orderNumber}</td>
                  <td>{order.buyerEmail}</td>
                  <td><Badge variant={order.status === "paid" ? "success" : "soft"}>{order.status}</Badge></td>
                  <td>{formatTime(order.createdAt)}</td>
                </tr>
              ))}
              {recentOrders.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--ink-500)", padding: 28 }}>No automation runs yet. New checkout orders will appear here.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AppFrame>
  );
}
