import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { revalidatePath } from "next/cache";
import { sendEmail } from "@/lib/notifications/resend";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }

type ManualInvoice = {
  id: string;
  direction: "sent" | "received";
  partyType: "customer" | "supplier" | "logistics";
  partyName: string;
  partyEmail: string;
  description: string;
  amount: number;
  status: "sent" | "received" | "paid";
  createdAt: string;
};

function readManualInvoices(settings: unknown): ManualInvoice[] {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return [];
  const value = (settings as Record<string, unknown>).manualInvoices;
  return Array.isArray(value) ? (value as ManualInvoice[]) : [];
}

async function createManualInvoice(formData: FormData) {
  "use server";
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, brandSettings: true } });
  if (!store) redirect("/builder?firstRun=1");

  const direction = String(formData.get("direction") || "sent") === "received" ? "received" : "sent";
  const invoice: ManualInvoice = {
    id: `INV-${Date.now().toString(36).toUpperCase()}`,
    direction,
    partyType: (String(formData.get("partyType") || "supplier") as ManualInvoice["partyType"]),
    partyName: String(formData.get("partyName") || "").trim(),
    partyEmail: String(formData.get("partyEmail") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    amount: Number(formData.get("amount") || 0),
    status: direction,
    createdAt: new Date().toISOString(),
  };

  const settings = typeof store.brandSettings === "object" && store.brandSettings ? (store.brandSettings as Record<string, unknown>) : {};
  const manualInvoices = [invoice, ...readManualInvoices(settings)].slice(0, 100);
  await db.store.update({
    where: { id: store.id },
    data: { brandSettings: { ...settings, manualInvoices } as Prisma.InputJsonValue },
  });

  if (invoice.direction === "sent" && invoice.partyEmail) {
    await sendEmail({
      to: [invoice.partyEmail],
      subject: `${store.name} invoice ${invoice.id}`,
      html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px"><h2>Invoice ${invoice.id}</h2><p>${invoice.description}</p><p><strong>Total: ${fmt(invoice.amount)}</strong></p><p>Sent by ${store.name} via Shopinbos.</p></div>`,
    });
  }

  revalidatePath("/home/invoices");
}

export default async function SellerInvoicesPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  if (!workspace.store) redirect("/builder?firstRun=1");

  const orders = await db.retailOrder.findMany({
    where: { storeId: workspace.store.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, orderNumber: true, buyerName: true, buyerEmail: true,
      subtotal: true, shippingFee: true, total: true, currency: true,
      status: true, paystackStatus: true, createdAt: true,
    },
  });

  const paidOrders = orders.filter((o) => ["paid", "processing", "shipped", "delivered"].includes(o.status));
  const pendingOrders = orders.filter((o) => o.status === "pending");
  const pendingValue = pendingOrders.reduce((s, o) => s + Number(o.total), 0);
  const grossValue = orders.reduce((s, o) => s + Number(o.total), 0);
  const manualInvoices = readManualInvoices(workspace.store.brandSettings);

  return (
    <AppFrame
      role="seller"
      storeName={workspace.store.name}
      storeSlug={workspace.store.slug ?? ""}
      storeInitial={workspace.store.name.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Invoicing"
          sub={`${orders.length} invoice candidates · ${pendingOrders.length} pending ${fmt(pendingValue)}`}
          actions={<><a href="/home/payments" className="dbtn dBtn-ghost" style={{ textDecoration: "none" }}>Payment activity</a><a href="#new-invoice" className="dbtn dBtn-mint" style={{ textDecoration: "none" }}>New invoice</a></>}
        />

        <form id="new-invoice" action={createManualInvoice} className="card" style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, alignItems: "end" }}>
          <label className="field"><span className="label">Direction</span><select name="direction" className="sel"><option value="sent">Send invoice</option><option value="received">Receive invoice</option></select></label>
          <label className="field"><span className="label">Party</span><select name="partyType" className="sel"><option value="supplier">Supplier</option><option value="logistics">Logistics</option><option value="customer">Customer</option></select></label>
          <label className="field"><span className="label">Name</span><input name="partyName" className="inp" required placeholder="Business name" /></label>
          <label className="field"><span className="label">Email</span><input name="partyEmail" type="email" className="inp" placeholder="billing@example.com" /></label>
          <label className="field"><span className="label">Amount</span><input name="amount" type="number" min={1} step="0.01" className="inp" required placeholder="50000" /></label>
          <button type="submit" className="dbtn dBtn-mint">Create</button>
          <label className="field" style={{ gridColumn: "1 / -1" }}><span className="label">Description</span><input name="description" className="inp" required placeholder="Products supplied, delivery service, or wholesale order details" /></label>
        </form>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div className="stat">
            <div className="stat-lbl">Invoice candidates</div>
            <div className="stat-val">{orders.length}</div>
            <div className="stat-delta delta-up"><Icon name="document" size={12} /><span>orders</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Pending payment</div>
            <div className="stat-val">{pendingOrders.length}</div>
            <div className="stat-delta delta-down"><Icon name="clock" size={12} /><span>{fmt(pendingValue)}</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Paid</div>
            <div className="stat-val">{paidOrders.length}</div>
            <div className="stat-delta delta-up"><Icon name="check" size={12} /><span>fulfilled</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Gross ordered</div>
            <div className="stat-val money">{fmt(grossValue)}</div>
            <div className="stat-delta delta-up"><Icon name="coin" size={12} /><span>total</span></div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Subtotal</th>
                <th>Shipping</th>
                <th>Total</th>
                <th>Order</th>
                <th>Payment</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {manualInvoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600 }}>{invoice.id}</td>
                  <td>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{invoice.partyName}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{invoice.partyType} · {invoice.partyEmail || "no email"}</div>
                    </div>
                  </td>
                  <td className="money">{fmt(invoice.amount)}</td>
                  <td className="money">—</td>
                  <td className="money" style={{ fontWeight: 600 }}>{fmt(invoice.amount)}</td>
                  <td><Badge variant={invoice.direction === "sent" ? "info" : "mint"}>{invoice.direction}</Badge></td>
                  <td style={{ fontSize: 12.5 }}>{invoice.status}</td>
                  <td style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
                    {new Date(invoice.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
              {orders.slice(0, 30).map((o) => (
                <tr key={o.id}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600 }}>{o.orderNumber}</td>
                  <td>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{o.buyerName}</div>
                      <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{o.buyerEmail}</div>
                    </div>
                  </td>
                  <td className="money">{fmt(Number(o.subtotal))}</td>
                  <td className="money">{fmt(Number(o.shippingFee))}</td>
                  <td className="money" style={{ fontWeight: 600 }}>{fmt(Number(o.total))}</td>
                  <td>
                    <Badge variant={o.status === "delivered" ? "mint" : o.status === "paid" || o.status === "processing" || o.status === "shipped" ? "info" : "warn"}>{o.status}</Badge>
                  </td>
                  <td style={{ fontSize: 12.5 }}>{o.paystackStatus ?? "pending"}</td>
                  <td style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
                    {new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppFrame>
  );
}
