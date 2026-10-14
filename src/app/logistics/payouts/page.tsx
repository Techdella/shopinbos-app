import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { EmptyState, ListCard, ListRow, StatGrid, StatTile } from "@/components/app-kit";
import { PayoutBankSection } from "@/components/payments/PayoutBankSection";
import { ACTIVE_STATUSES, PartnerPage, Route, bookingNet, jobId, lagosDate, lagosStartOfToday, naira } from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("earnings.title") };
}

export default async function LogisticsPayoutsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const t = await getT("logistics", "common");

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
      title={t("earnings.title")}
      sub={payoutBank ? t("earnings.paidTo", { bank: payoutBank.bankName, account: payoutBank.accountNumber }) : t("earnings.addBank")}
    >
      <StatGrid className="mb-5">
        <StatTile tone="card" label={t("today.earnedToday")} value={naira(sumNet(today))} hint={t("earnings.delivered", { count: today.length })} />
        <StatTile tone="card" label={t("earnings.last30")} value={naira(sumNet(lastThirty))} hint={t("earnings.delivered", { count: lastThirty.length })} />
        <StatTile tone="card" label={t("earnings.onRoad")} value={naira(inProgress._sum.deliveryFee ?? 0)} hint={t("earnings.onRoadHint", { count: inProgress._count._all })} />
        <StatTile tone="card" label={t("earnings.fees")} value={naira(lifetimeFees)} hint={delivered.length >= 200 ? t("earnings.last200") : t("earnings.allDelivered")} />
      </StatGrid>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
        <section aria-labelledby="delivered-jobs" className="min-w-0">
          <h2 id="delivered-jobs" className="m-0 mb-3 text-[18px] font-extrabold">{t("earnings.deliveredJobs")}</h2>
          {delivered.length === 0 ? (
            <EmptyState icon="coin" title={t("earnings.emptyTitle")}>{t("earnings.emptyBody")}</EmptyState>
          ) : (
            <ListCard>
              {delivered.slice(0, 50).map((booking) => (
                <ListRow key={booking.id}>
                  <div className="min-w-0 flex-1 basis-[200px]">
                    <Route from={booking.pickupLocation} to={booking.destination} className="block truncate text-[15px]" toLabel={t("kit.to")} />
                    <div className="truncate text-[15px] text-app-ink-soft">{jobId(booking.id)} · {booking.seller.name} · {lagosDate(doneAt(booking), undefined, new Date(), t)}</div>
                  </div>
                  <div className="text-[15px] text-app-ink-soft">
                    {naira(booking.deliveryFee)}{booking.platformFee ? ` − ${t("earnings.fee", { amount: naira(booking.platformFee) })}` : ""}
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
