import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import type { Metadata } from "next";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { Card, CardHead, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, SplitLayout, StatGrid, StatTile, type Tone } from "@/components/app-kit";
import { Field, buttonClass, formatDate, humanize, inputClass, selectClass } from "@/components/growth/kit";
import { revalidatePath } from "next/cache";
import { createManualInvoice } from "@/lib/seller-money.server";
import { ManualInvoiceSchema, readManualInvoices } from "@/lib/seller-invoices";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatMoney } from "@shared/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("orders");
  return { title: t("inv.title") };
}

async function createManualInvoiceAction(formData: FormData) {
  "use server";
  const user = await requireRole(["seller"], "/login");
  // Same rules and saving as POST /api/app/invoices (the phone app); the form's required fields catch most mistakes first.
  const parsed = ManualInvoiceSchema.safeParse({
    direction: formData.get("direction") || "sent",
    partyType: formData.get("partyType") || "supplier",
    partyName: formData.get("partyName") ?? "",
    partyEmail: formData.get("partyEmail") ?? "",
    amount: formData.get("amount") || 0,
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return;
  const result = await createManualInvoice({ id: user.id, email: user.email }, parsed.data);
  if (!result) redirect("/builder?firstRun=1");
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
  const t = await getT("orders", "common");
  const locale = await getLocale();
  const money = (n: number) => formatMoney(Math.round(n), locale);
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
      title={t("inv.title")}
      sub={t("inv.sub")}
      actions={<PillLink href="/home/payments" icon="coin">{t("inv.money")}</PillLink>}
    >
      <SplitLayout
        main={
          <>
            <StatGrid>
              <StatTile tone="card" label={t("inv.orderInvoices")} value={orders.length} hint={t("inv.latest100")} />
              <StatTile tone="card" label={t("inv.waiting")} value={money(pendingValue)} hint={t("count.orders", { count: pendingOrders.length })} />
              <StatTile tone="card" label={t("inv.paid")} value={paidOrders.length} hint={t("inv.ordersHint")} />
              <StatTile tone="card" label={t("inv.totalOrdered")} value={money(grossValue)} />
            </StatGrid>

            <FilterChips
              items={[
                { label: t("inv.orderInvoices"), href: "/home/invoices", count: orders.length, active: show === "orders" },
                { label: t("inv.youMade"), href: "/home/invoices?show=manual", count: manualInvoices.length, active: show === "manual" },
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
                        <span className="block truncate">{t.dynamic(`party.${invoice.partyType}`, humanize(invoice.partyType))} · {formatDate(invoice.createdAt, false, locale)}</span>
                      </span>
                      <Pill tone={invoice.direction === "sent" ? "info" : "accent"}>{invoice.direction === "sent" ? t("inv.sent") : t("inv.received")}</Pill>
                      <span className="text-[14px] font-extrabold sm:w-[100px] sm:text-right">{money(invoice.amount)}</span>
                    </ListRow>
                  ))}
                </ListCard>
              ) : (
                <EmptyState icon="document" title={t("inv.noneMade")}>{t("inv.noneMadeSub")}</EmptyState>
              )
            ) : orders.length ? (
              <ListCard>
                {orders.slice(0, 50).map((o) => (
                  <ListRow key={o.id} href={`/home/orders/${o.id}`}>
                    <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <span className="block truncate text-[14.5px] font-extrabold">{o.buyerName || t("inv.customer")}</span>
                      <span className="block truncate text-[13px] text-app-ink-soft">{t("inv.plusDelivery", { subtotal: money(Number(o.subtotal)), fee: money(Number(o.shippingFee)) })}{o.buyerEmail ? ` · ${o.buyerEmail}` : ""}</span>
                    </span>
                    <span className="min-w-0 text-[13px] text-app-ink-soft sm:w-[150px]">
                      <span className="block truncate font-mono">{o.orderNumber}</span>
                      <span className="block truncate">{formatDate(o.createdAt, false, locale)}</span>
                    </span>
                    <Pill tone={orderTone(o.status)}>{t.dynamic(`status.${o.status}`, humanize(o.status))}</Pill>
                    <span className="text-[14px] font-extrabold sm:w-[100px] sm:text-right">{money(Number(o.total))}</span>
                  </ListRow>
                ))}
              </ListCard>
            ) : (
              <EmptyState icon="document" title={t("inv.noOrders")}>{t("inv.noOrdersSub")}</EmptyState>
            )}
          </>
        }
        side={
          <Card className="p-5">
            <CardHead title={t("inv.new")} sub={t("inv.newSub")} />
            <form id="new-invoice" action={createManualInvoiceAction} className="mt-4 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label={t("inv.type")} htmlFor="inv-direction">
                  <select id="inv-direction" name="direction" className={selectClass}>
                    <option value="sent">{t("inv.sending")}</option>
                    <option value="received">{t("inv.gotIt")}</option>
                  </select>
                </Field>
                <Field label={t("inv.who")} htmlFor="inv-party">
                  <select id="inv-party" name="partyType" className={selectClass}>
                    <option value="supplier">{t("party.supplier")}</option>
                    <option value="logistics">{t("party.logistics")}</option>
                    <option value="customer">{t("party.customer")}</option>
                  </select>
                </Field>
              </div>
              <Field label={t("inv.theirName")} htmlFor="inv-name"><input id="inv-name" name="partyName" className={inputClass} required placeholder={t("inv.businessName")} /></Field>
              <Field label={t("inv.theirEmail")} htmlFor="inv-email"><input id="inv-email" name="partyEmail" type="email" className={inputClass} placeholder="billing@example.com" /></Field>
              <Field label={t("inv.amount")} htmlFor="inv-amount"><input id="inv-amount" name="amount" type="number" min={1} step="0.01" className={inputClass} required placeholder="50000" /></Field>
              <Field label={t("inv.forWhat")} htmlFor="inv-desc"><input id="inv-desc" name="description" className={inputClass} required placeholder={t("inv.forPlaceholder")} /></Field>
              <button type="submit" className={buttonClass("ink", "md", "w-full")}>{t("inv.create")}</button>
            </form>
          </Card>
        }
      />
    </SellerPage>
  );
}
