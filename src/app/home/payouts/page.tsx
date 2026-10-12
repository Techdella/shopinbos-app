import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, EmptyState, FilterChips, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { formatDate, humanize } from "@/components/growth/kit";
import { naira } from "@shared/onboarding";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Money sent to your bank" };

const PAID = ["paid", "processing", "packed", "shipped", "delivered"] as const;

function isOnline(method: string | null) {
  return !method || method === "paystack";
}

export default async function SellerPayoutsPage({ searchParams }: { searchParams?: Promise<{ show?: string }> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true } });

  const paidOrders = store
    ? await db.retailOrder.findMany({
        where: { storeId: store.id, status: { in: [...PAID] } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, orderNumber: true, buyerName: true, total: true, status: true, paymentMethod: true, createdAt: true },
      })
    : [];

  const online = paidOrders.filter((order) => isOnline(order.paymentMethod));
  const offline = paidOrders.filter((order) => !isOnline(order.paymentMethod));
  const onlineTotal = online.reduce((sum, order) => sum + order.total, 0);
  const offlineTotal = offline.reduce((sum, order) => sum + order.total, 0);
  const show = params?.show === "offline" ? "offline" : params?.show === "all" ? "all" : "online";
  const shown = show === "online" ? online : show === "offline" ? offline : paidOrders;
  const brand = store?.brandSettings && typeof store.brandSettings === "object" ? (store.brandSettings as Record<string, unknown>) : {};
  const hasBank = Boolean(brand.payoutBank && typeof brand.payoutBank === "object" && (brand.payoutBank as Record<string, unknown>).bankName);

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Money sent to your bank"
      sub="Paid orders and where the money for each one went."
      actions={<PillLink href="/home/payments" icon="coin">Money</PillLink>}
    >
      <div className="grid gap-5">
        {!hasBank && (
          <AssistantNote action={<PillLink href="/home/payments" tone="ink" size="sm">Add your bank</PillLink>}>
            You haven&apos;t added your bank yet. Add it so we can send you the money from online orders.
          </AssistantNote>
        )}

        <StatGrid>
          <StatTile tone="card" label="Paid online" value={naira(onlineTotal)} hint={`${online.length} order${online.length === 1 ? "" : "s"}`} />
          <StatTile tone="card" label="Collected yourself" value={naira(offlineTotal)} hint={`${offline.length} order${offline.length === 1 ? "" : "s"}`} />
          <StatTile tone="card" label="Paid orders" value={paidOrders.length} hint="Latest 100" />
          <StatTile tone="card" label="Your bank" value={hasBank ? "Added" : "Not added"} />
        </StatGrid>

        <FilterChips
          items={[
            { label: "Paid online", href: "/home/payouts", count: online.length, active: show === "online" },
            { label: "Collected yourself", href: "/home/payouts?show=offline", count: offline.length, active: show === "offline" },
            { label: "All", href: "/home/payouts?show=all", count: paidOrders.length, active: show === "all" },
          ]}
        />

        {shown.length ? (
          <ListCard>
            {shown.map((order) => (
              <ListRow key={order.id} href={`/home/orders/${order.id}`}>
                <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <span className="block truncate text-[14.5px] font-extrabold">{order.buyerName || "Customer"}</span>
                  <span className="block truncate font-mono text-[12.5px] text-app-ink-soft">{order.orderNumber}</span>
                </span>
                <span className="text-[13px] text-app-ink-soft sm:w-[150px]">
                  {isOnline(order.paymentMethod) ? "Online, to your bank" : `${PAYMENT_METHOD_LABEL[order.paymentMethod!] ?? order.paymentMethod}, kept by you`}
                </span>
                <span className="text-[13px] text-app-ink-soft sm:w-[100px]">{formatDate(order.createdAt)}</span>
                <Pill tone={order.status === "delivered" ? "success" : "info"}>{humanize(order.status)}</Pill>
                <span className="text-[14px] font-extrabold sm:w-[100px] sm:text-right">{naira(order.total)}</span>
              </ListRow>
            ))}
          </ListCard>
        ) : (
          <EmptyState icon="coin" title="Nothing here yet">Paid orders show up here once customers start paying.</EmptyState>
        )}

        <p className="m-0 text-[13px] leading-[1.5] text-app-ink-soft">Shopinbos doesn&apos;t show individual bank transfers here yet. Check your bank or Paystack statement to match payments.</p>
      </div>
    </SellerPage>
  );
}
