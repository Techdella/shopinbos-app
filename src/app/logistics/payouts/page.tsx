import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { EmptyState, ListCard, ListRow, StatGrid, StatTile } from "@/components/app-kit";
import { PayoutBankSection } from "@/components/payments/PayoutBankSection";
import { ACTIVE_STATUSES, PartnerPage, Route, bookingNet, jobId, lagosDate, lagosStartOfToday, naira } from "@/components/logistics/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Earnings" };

export default async function LogisticsPayoutsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const startOfToday = lagosStartOfToday();
  const thirtyDaysAgo = new Date(startOfToday.getTime() - 29 * 24 * 60 * 60 * 1000);

  const [payoutAccount, delivered, inProgress] = await Promise.all([
    db.logisticsPayoutAccount.findUnique({ where: { logisticsPartnerId: partner.id } }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, status: "delivered" },
      orderBy: [{ deliveredAt: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true, pickupLocation: true, destination: true, deliveryFee: true, platformFee: true, netAmount: true,
        deliveredAt: true, createdAt: true, seller: { select: { name: true } },
      },
    }),
    db.deliveryBooking.aggregate({
      where: { logisticsPartnerId: partner.id, status: { in: ACTIVE_STATUSES } },
      _sum: { deliveryFee: true },
      _count: { _all: true },
    }),
  ]);

  const payoutBank = payoutAccount
    ? { bankName: payoutAccount.bankName, accountNumber: payoutAccount.accountNumberMask, accountName: payoutAccount.accountName }
    : null;
  const doneAt = (booking: (typeof delivered)[number]) => booking.deliveredAt ?? booking.createdAt;
  const sumNet = (rows: typeof delivered) => rows.reduce((sum, booking) => sum + bookingNet(booking), 0);
  const today = delivered.filter((booking) => doneAt(booking) >= startOfToday);
  const lastThirty = delivered.filter((booking) => doneAt(booking) >= thirtyDaysAgo);
  const lifetimeFees = delivered.reduce((sum, booking) => sum + (booking.platformFee || 0), 0);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Earnings"
      sub={payoutBank ? `Paid to ${payoutBank.bankName} · ${payoutBank.accountNumber}` : "Add your bank account so we can pay you for delivered jobs."}
    >
      <StatGrid className="mb-5">
        <StatTile tone="card" label="Earned today" value={naira(sumNet(today))} hint={`${today.length} delivered`} />
        <StatTile tone="card" label="Last 30 days" value={naira(sumNet(lastThirty))} hint={`${lastThirty.length} delivered`} />
        <StatTile tone="card" label="On the road now" value={naira(inProgress._sum.deliveryFee ?? 0)} hint={`${inProgress._count._all} active jobs, paid once delivered`} />
        <StatTile tone="card" label="Shopinbos fees" value={naira(lifetimeFees)} hint={delivered.length >= 200 ? "Last 200 deliveries" : "All delivered jobs"} />
      </StatGrid>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
        <section aria-labelledby="delivered-jobs" className="min-w-0">
          <h2 id="delivered-jobs" className="m-0 mb-3 text-[18px] font-extrabold">Delivered jobs</h2>
          {delivered.length === 0 ? (
            <EmptyState icon="coin" title="Nothing earned yet">Your earnings show here once your first job is delivered.</EmptyState>
          ) : (
            <ListCard>
              {delivered.slice(0, 50).map((booking) => (
                <ListRow key={booking.id}>
                  <div className="min-w-0 flex-1 basis-[200px]">
                    <Route from={booking.pickupLocation} to={booking.destination} className="block truncate text-[15px]" />
                    <div className="truncate text-[15px] text-app-ink-soft">{jobId(booking.id)} · {booking.seller.name} · {lagosDate(doneAt(booking))}</div>
                  </div>
                  <div className="text-[15px] text-app-ink-soft">
                    {naira(booking.deliveryFee)}{booking.platformFee ? ` − ${naira(booking.platformFee)} fee` : ""}
                  </div>
                  <div className="ml-auto text-[15px] font-extrabold">{naira(bookingNet(booking))}</div>
                </ListRow>
              ))}
            </ListCard>
          )}
        </section>

        <div className="min-w-0">
          <PayoutBankSection role="logistics_partner" payoutBank={payoutBank} displayName={partner.displayName} />
        </div>
      </div>
    </PartnerPage>
  );
}
