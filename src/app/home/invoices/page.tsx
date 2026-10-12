import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import type { Metadata } from "next";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, SplitLayout, StatGrid, StatTile, type Tone } from "@/components/app-kit";
import { Field, buttonClass, formatDate, humanize, inputClass, selectClass } from "@/components/growth/kit";
import { revalidatePath } from "next/cache";
import { formatFromAddress, sendEmail } from "@/lib/notifications/resend";
import { appBase, SENDER_STORE_SELECT, storeSender } from "@/lib/email/compliance.server";
import { invoiceEmail } from "@/lib/email/store-emails";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoices" };

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
  const store = await db.store.findUnique({ where: { userId: user.id }, select: SENDER_STORE_SELECT });
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
    const email = invoiceEmail({ appUrl: appBase(), store: storeSender(store), invoiceId: invoice.id, description: invoice.description, amount: fmt(invoice.amount) });
    await sendEmail({
      to: [invoice.partyEmail],
      subject: `${store.name} invoice ${invoice.id}`,
      html: email,
      from: formatFromAddress(store.name),
      replyTo: user.email ?? undefined,
    });
  }

  revalidatePath("/home/invoices");
}

const PAID = ["paid", "processing", "packed", "shipped", "delivered"];

function orderTone(status: string): Tone {
  if (status === "delivered") return "success";
  if (PAID.includes(status)) return "info";
  if (status === "pending" || status === "awaiting_payment") return "warning";
  return "muted";
}

export default async function SellerInvoicesPage({ searchParams }: { searchParams?: Promise<{ show?: string }> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true } });
  if (!store) redirect("/builder?firstRun=1");

  const orders = await db.retailOrder.findMany({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, orderNumber: true, buyerName: true, buyerEmail: true,
      subtotal: true, shippingFee: true, total: true, currency: true,
      status: true, paystackStatus: true, createdAt: true,
    },
  });

  const paidOrders = orders.filter((o) => PAID.includes(o.status));
  const pendingOrders = orders.filter((o) => o.status === "pending" || o.status === "awaiting_payment");
  const pendingValue = pendingOrders.reduce((s, o) => s + Number(o.total), 0);
  const grossValue = orders.reduce((s, o) => s + Number(o.total), 0);
  const manualInvoices = readManualInvoices(store.brandSettings);
  const show = params?.show === "manual" ? "manual" : "orders";

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Invoices"
      sub="Invoices for your orders, and ones you send to or get from suppliers, delivery partners and customers."
      actions={<PillLink href="/home/payments" icon="coin">Money</PillLink>}
    >
      <SplitLayout
        main={
          <>
            <StatGrid>
              <StatTile tone="card" label="Order invoices" value={orders.length} hint="Latest 100 orders" />
              <StatTile tone="card" label="Waiting for payment" value={fmt(pendingValue)} hint={`${pendingOrders.length} order${pendingOrders.length === 1 ? "" : "s"}`} />
              <StatTile tone="card" label="Paid" value={paidOrders.length} hint="orders" />
              <StatTile tone="card" label="Total ordered" value={fmt(grossValue)} />
            </StatGrid>

            <FilterChips
              items={[
                { label: "Order invoices", href: "/home/invoices", count: orders.length, active: show === "orders" },
                { label: "Invoices you made", href: "/home/invoices?show=manual", count: manualInvoices.length, active: show === "manual" },
              ]}
            />

            {show === "manual" ? (
              manualInvoices.length ? (
                <ListCard>
                  {manualInvoices.map((invoice) => (
                    <ListRow key={invoice.id}>
                      <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                        <span className="block truncate text-[14.5px] font-extrabold">{invoice.partyName}</span>
                        <span className="block truncate text-[13px] text-app-ink-soft">{invoice.description}{invoice.partyEmail ? ` · ${invoice.partyEmail}` : ""}</span>
                      </span>
                      <span className="min-w-0 text-[13px] text-app-ink-soft sm:w-[150px]">
                        <span className="block truncate font-mono">{invoice.id}</span>
                        <span className="block truncate">{humanize(invoice.partyType)} · {formatDate(invoice.createdAt)}</span>
                      </span>
                      <Pill tone={invoice.direction === "sent" ? "info" : "accent"}>{invoice.direction === "sent" ? "Sent" : "Received"}</Pill>
                      <span className="text-[14px] font-extrabold sm:w-[100px] sm:text-right">{fmt(invoice.amount)}</span>
                    </ListRow>
                  ))}
                </ListCard>
              ) : (
                <EmptyState icon="document" title="No invoices made yet">Use the form to send an invoice, or to note one you got from a supplier or delivery partner.</EmptyState>
              )
            ) : orders.length ? (
              <ListCard>
                {orders.slice(0, 50).map((o) => (
                  <ListRow key={o.id} href={`/home/orders/${o.id}`}>
                    <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <span className="block truncate text-[14.5px] font-extrabold">{o.buyerName || "Customer"}</span>
                      <span className="block truncate text-[13px] text-app-ink-soft">{fmt(Number(o.subtotal))} + {fmt(Number(o.shippingFee))} delivery{o.buyerEmail ? ` · ${o.buyerEmail}` : ""}</span>
                    </span>
                    <span className="min-w-0 text-[13px] text-app-ink-soft sm:w-[150px]">
                      <span className="block truncate font-mono">{o.orderNumber}</span>
                      <span className="block truncate">{formatDate(o.createdAt)}</span>
                    </span>
                    <Pill tone={orderTone(o.status)}>{humanize(o.status)}</Pill>
                    <span className="text-[14px] font-extrabold sm:w-[100px] sm:text-right">{fmt(Number(o.total))}</span>
                  </ListRow>
                ))}
              </ListCard>
            ) : (
              <EmptyState icon="document" title="No orders yet">Every order gets an invoice. They show up here once orders come in.</EmptyState>
            )}
          </>
        }
        side={
          <Card className="p-5">
            <CardHead title="New invoice" sub="Sent invoices are emailed when you add an email." />
            <form id="new-invoice" action={createManualInvoice} className="mt-4 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label="Type" htmlFor="inv-direction">
                  <select id="inv-direction" name="direction" className={selectClass}>
                    <option value="sent">I&apos;m sending it</option>
                    <option value="received">I got it</option>
                  </select>
                </Field>
                <Field label="Who" htmlFor="inv-party">
                  <select id="inv-party" name="partyType" className={selectClass}>
                    <option value="supplier">Supplier</option>
                    <option value="logistics">Delivery partner</option>
                    <option value="customer">Customer</option>
                  </select>
                </Field>
              </div>
              <Field label="Their name" htmlFor="inv-name"><input id="inv-name" name="partyName" className={inputClass} required placeholder="Business name" /></Field>
              <Field label="Their email (optional)" htmlFor="inv-email"><input id="inv-email" name="partyEmail" type="email" className={inputClass} placeholder="billing@example.com" /></Field>
              <Field label="Amount (₦)" htmlFor="inv-amount"><input id="inv-amount" name="amount" type="number" min={1} step="0.01" className={inputClass} required placeholder="50000" /></Field>
              <Field label="What it's for" htmlFor="inv-desc"><input id="inv-desc" name="description" className={inputClass} required placeholder="Stock supplied, delivery, wholesale order" /></Field>
              <button type="submit" className={buttonClass("ink", "md", "w-full")}>Create invoice</button>
            </form>
          </Card>
        }
      />
    </SellerPage>
  );
}
