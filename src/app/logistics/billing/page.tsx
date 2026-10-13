import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { updateFeeBearer } from "@/app/actions/billing";
import { Card, CardHead, EmptyState, ListCard, ListRow, StatGrid, StatTile } from "@/components/app-kit";
import { KeyValue, PartnerPage, StatusPill, SubmitButton, inputClass, labelClass, lagosDate, naira } from "@/components/logistics/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fees" };

const BEARERS: Record<string, string> = {
  seller: "The seller (added to their delivery cost)",
  supplier: "The supplier on the order",
  logistics_partner: "You (taken from your payout)",
};

export default async function LogisticsBillingPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const [feeConfig, bookings] = await Promise.all([
    db.platformFeeConfig.findFirst({ where: { active: true } }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true, deliveryFee: true, platformFee: true, feeBearer: true,
        netAmount: true, currency: true, status: true, createdAt: true,
        seller: { select: { name: true } },
      },
    }),
  ]);

  const rate = feeConfig?.rate ?? 1.5;
  const bearer = feeConfig?.bearer ?? "seller";
  const feeOf = (booking: (typeof bookings)[number]) => booking.platformFee || Math.round((booking.deliveryFee * rate) / 100);
  const delivered = bookings.filter((booking) => booking.status === "delivered");
  const totalGross = delivered.reduce((sum, booking) => sum + booking.deliveryFee, 0);
  const totalFees = delivered.reduce((sum, booking) => sum + feeOf(booking), 0);
  const totalNet = delivered.reduce((sum, booking) => sum + (booking.netAmount || booking.deliveryFee - feeOf(booking)), 0);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Fees"
      sub={`Shopinbos takes ${rate}% of each delivery. Right now it's paid by ${(BEARERS[bearer] ?? bearer).split(" (")[0].toLowerCase()}.`}
    >
      <StatGrid className="mb-5 md:grid-cols-3">
        <StatTile tone="card" label="Delivery fees earned" value={naira(totalGross)} hint={`${delivered.length} delivered jobs`} />
        <StatTile tone="card" label={`Shopinbos fees (${rate}%)`} value={naira(totalFees)} />
        <StatTile tone="card" label="Yours after fees" value={naira(totalNet)} className="col-span-2 md:col-span-1" />
      </StatGrid>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
        <section aria-labelledby="fee-history" className="min-w-0">
          <h2 id="fee-history" className="m-0 mb-3 text-[18px] font-extrabold">Fee on each job</h2>
          {bookings.length === 0 ? (
            <EmptyState icon="document" title="No jobs yet">Fees show here once sellers book you.</EmptyState>
          ) : (
            <ListCard>
              {bookings.slice(0, 50).map((booking) => {
                const fee = feeOf(booking);
                return (
                  <ListRow key={booking.id}>
                    <div className="min-w-0 flex-1 basis-[160px]">
                      <div className="truncate text-[15px] font-extrabold">{booking.seller.name}</div>
                      <div className="truncate text-[15px] text-app-ink-soft">
                        {lagosDate(booking.createdAt)} · fee paid by {(booking.feeBearer || bearer).replace(/_/g, " ")}
                      </div>
                    </div>
                    <StatusPill status={booking.status} />
                    <div className="text-[15px] text-app-ink-soft">{naira(booking.deliveryFee)} − {naira(fee)}</div>
                    <div className="ml-auto text-[15px] font-extrabold">{naira(booking.netAmount || booking.deliveryFee - fee)}</div>
                  </ListRow>
                );
              })}
            </ListCard>
          )}
        </section>

        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title="Who pays the fee" />
            <form action={updateFeeBearer} className="mt-4 grid gap-3">
              <div>
                <label htmlFor="feeBearer" className={labelClass}>The {rate}% fee is paid by</label>
                <select id="feeBearer" name="feeBearer" defaultValue={bearer} className={inputClass}>
                  {Object.entries(BEARERS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <SubmitButton>Save</SubmitButton>
            </form>
          </Card>
          <Card className="p-5">
            <CardHead title="Summary" />
            <div className="mt-2 divide-y divide-app-line">
              <KeyValue label="Fee rate">{rate}%</KeyValue>
              <KeyValue label="Paid by">{bearer.replace(/_/g, " ")}</KeyValue>
              <KeyValue label="Delivered jobs">{delivered.length}</KeyValue>
              <KeyValue label="Fees so far">{naira(totalFees)}</KeyValue>
            </div>
          </Card>
        </div>
      </div>
    </PartnerPage>
  );
}
