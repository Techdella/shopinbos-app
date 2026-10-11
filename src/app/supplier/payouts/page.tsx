import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage, Card, CardHead, EmptyState, ListCard, Pill, SplitLayout, StatGrid, StatTile, Thumb } from "@/components/app-kit";
import { PayoutBankSection } from "@/components/payments/PayoutBankSection";
import { ORDER_STATUS, money, orderRef, shortDate, statusOf, supplierFrame } from "@/components/supplier/supplier-kit";

export const dynamic = "force-dynamic";

const PAYABLE = ["shipped", "delivered"];
const OPEN = ["pending", "confirmed", "processing"];

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
      supplierProduct: { select: { name: true, images: true } },
    },
  });

  const payable = orders.filter((o) => PAYABLE.includes(o.status));
  const payableValue = payable.reduce((s, o) => s + Number(o.totalPrice), 0);
  const open = orders.filter((o) => OPEN.includes(o.status));
  const openValue = open.reduce((s, o) => s + Number(o.totalPrice), 0);
  const verifiedBank = payoutAccount?.verificationStatus === "verified";

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title="Payouts"
      sub={payoutAccount && verifiedBank
        ? `${payoutAccount.bankName} ${payoutAccount.accountNumberMask} · Paystack recipient ready`
        : `${payable.length} order${payable.length === 1 ? "" : "s"} shipped or delivered, worth ${money(payableValue)}. Connect a bank account to get paid.`}
    >
      <StatGrid className="mb-5">
        <StatTile tone="card" label="Earned" value={money(payableValue)} hint={`${payable.length} shipped or delivered`} />
        <StatTile tone="card" label="Still to ship" value={money(openValue)} hint={`${open.length} open order${open.length === 1 ? "" : "s"}`} />
        <StatTile tone="card" label="All orders" value={orders.length} hint={orders.length === 100 ? "latest 100" : "all time"} />
        <StatTile tone="card" label="Bank account" value={verifiedBank ? "Ready" : payoutAccount ? "Checking" : "Not set"} hint={payoutAccount ? payoutAccount.bankName : "Add one below"} />
      </StatGrid>

      <SplitLayout
        main={
          <section className="min-w-0">
            <h2 className="mb-3 mt-0 text-[17px] font-extrabold">Orders and what they&apos;re worth</h2>
            {orders.length === 0 ? (
              <EmptyState icon="coin" title="Nothing to pay out yet">
                Orders count toward your payout once you ship them.
              </EmptyState>
            ) : (
              <ListCard>
                {orders.slice(0, 30).map((o) => {
                  const stage = statusOf(ORDER_STATUS, o.status);
                  return (
                    <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:flex-nowrap sm:px-5">
                      <Thumb src={o.supplierProduct.images[0]} label={o.supplierProduct.name} size={44} />
                      <span className="min-w-0 flex-1 basis-[calc(100%-72px)] sm:basis-0">
                        <span className="block truncate text-[14px] font-extrabold">{o.supplierProduct.name}</span>
                        <span className="block truncate text-[12.5px] text-app-ink-soft">{orderRef(o.id)} · {o.seller.name} · {shortDate(o.createdAt)}</span>
                      </span>
                      <Pill tone={stage.tone}>{stage.label}</Pill>
                      <span className="w-[110px] text-right text-[14px] font-extrabold">{money(Number(o.totalPrice), o.currency)}</span>
                    </li>
                  );
                })}
              </ListCard>
            )}
          </section>
        }
        side={
          <>
            <PayoutBankSection role="supplier" payoutBank={payoutBank} displayName={supplier.displayName} />
            <Card className="p-5">
              <CardHead title="Payout account" />
              <dl className="m-0 mt-3 divide-y divide-app-line text-[14px]">
                {[
                  ["Bank", payoutBank ? `${payoutBank.bankName} ··${payoutBank.accountNumber.slice(-4)}` : "Not connected"],
                  ["Paystack check", payoutAccount?.verificationStatus ?? "Not set up"],
                  ["Transfer recipient", payoutAccount?.paystackRecipientCode ? "Connected" : "Not created"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 py-2.5">
                    <dt className="text-app-ink-soft">{label}</dt>
                    <dd className="m-0 truncate font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </>
        }
      />
    </AppPage>
  );
}
