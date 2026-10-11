import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { recordCodRemittance } from "@/app/actions/logistics";
import { Card, CardHead, ListCard, ListRow, Pill, SplitLayout, StatGrid, StatTile } from "@/components/app-kit";
import { cashToPayIn } from "@/lib/logistics/job-rules";
import {
  ACTIVE_STATUSES,
  ActionNotice,
  PartnerPage,
  Route,
  StatusPill,
  SubmitButton,
  cashToCollect,
  inputClass,
  jobId,
  labelClass,
  lagosDate,
  lagosStartOfToday,
  lagosTime,
  naira,
} from "@/components/logistics/kit";

// Cash on delivery: what riders collect at the door, what the partner still has to pay in, and the pay-ins.
// Transfers go straight from the buyer to the seller, so they're shown apart and never owed.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cash on delivery" };

const DAY = 24 * 60 * 60 * 1000;

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h2 id={id} className="m-0 text-[18px] font-extrabold">{title}</h2>
      {sub && <p className="m-0 mb-3 mt-0.5 text-[13.5px] text-app-ink-soft">{sub}</p>}
      <div className={sub ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <Card className="px-5 py-8 text-center text-[14.5px] text-app-ink-soft">{children}</Card>;
}

export default async function LogisticsCashPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error } = await searchParams;

  const startOfToday = lagosStartOfToday();
  const monthAgo = new Date(startOfToday.getTime() - 29 * DAY);
  const jobSelect = {
    id: true, orderId: true, pickupLocation: true, destination: true, status: true, codAmount: true, codCollected: true,
    codMethod: true, codCollectedAt: true, remittanceId: true, deliveredAt: true, createdAt: true,
    seller: { select: { name: true } }, rider: { select: { name: true } },
  } as const;

  const [openJobs, heldCash, transfers, collectedRecent, remittances] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, status: { in: ["pending", ...ACTIVE_STATUSES] }, OR: [{ codAmount: { gt: 0 } }, { codAmount: null, orderId: { not: null } }] },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: jobSelect,
    }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, codMethod: "cash", remittanceId: null, codCollected: { gt: 0 } },
      orderBy: [{ codCollectedAt: "asc" }, { createdAt: "asc" }],
      take: 300,
      select: jobSelect,
    }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, codMethod: "transfer", codCollected: { gt: 0 } },
      orderBy: { codCollectedAt: "desc" },
      take: 30,
      select: jobSelect,
    }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, codCollected: { gt: 0 }, codCollectedAt: { gte: monthAgo } },
      select: { codCollected: true, codMethod: true, codCollectedAt: true },
    }),
    db.codRemittance.findMany({
      where: { logisticsPartnerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, amount: true, method: true, reference: true, note: true, createdAt: true, _count: { select: { bookings: true } } },
    }),
  ]);

  // Older jobs were booked before codAmount existed: fall back to the linked order's unpaid total.
  const legacyOrderIds = openJobs.filter((job) => job.codAmount === null && job.orderId).map((job) => job.orderId!);
  const orders = legacyOrderIds.length
    ? await db.retailOrder.findMany({ where: { id: { in: legacyOrderIds } }, select: { id: true, orderNumber: true, total: true, status: true, paymentMethod: true } })
    : [];
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const toCollect = openJobs
    .map((job) => ({ ...job, cash: job.codAmount ?? (job.orderId ? cashToCollect(orderById.get(job.orderId)) : 0) }))
    .filter((job) => job.cash > 0);

  const owed = cashToPayIn(heldCash);
  const byRider = new Map<string, { name: string; amount: number; jobs: number }>();
  for (const job of heldCash) {
    const key = job.rider?.name ?? "Not assigned";
    const entry = byRider.get(key) ?? { name: key, amount: 0, jobs: 0 };
    entry.amount += job.codCollected ?? 0;
    entry.jobs += 1;
    byRider.set(key, entry);
  }
  const sum = (rows: Array<{ codCollected: number | null }>) => rows.reduce((total, row) => total + (row.codCollected ?? 0), 0);
  const collectedToday = collectedRecent.filter((row) => row.codCollectedAt && row.codCollectedAt >= startOfToday);
  const paidInMonth = remittances.filter((row) => row.createdAt >= monthAgo).reduce((total, row) => total + row.amount, 0);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Cash on delivery"
      sub="Cash your riders collect at the door, what you still have to pay in, and the pay-ins you've made."
    >
      <ActionNotice saved={saved} error={error} savedText="Pay-in recorded." />

      <StatGrid className="mb-5">
        <StatTile tone="card" label="Cash to pay in" value={naira(owed)} hint={`${heldCash.length} ${heldCash.length === 1 ? "job" : "jobs"} not paid in yet`} />
        <StatTile tone="card" label="To collect on open jobs" value={naira(toCollect.reduce((total, job) => total + job.cash, 0))} hint={`${toCollect.length} ${toCollect.length === 1 ? "job" : "jobs"}`} />
        <StatTile tone="card" label="Collected today" value={naira(sum(collectedToday))} hint={`${collectedToday.filter((row) => row.codMethod === "transfer").length} by transfer`} />
        <StatTile tone="card" label="Paid in, last 30 days" value={naira(paidInMonth)} hint={`Collected ${naira(sum(collectedRecent.filter((row) => row.codMethod === "cash")))} in cash`} />
      </StatGrid>

      <SplitLayout
        main={
          <>
            <Section id="held" title="Cash not paid in yet" sub="Collected in cash by your riders. Oldest first; a pay-in settles these in this order.">
              {heldCash.length === 0 ? (
                <Empty>All collected cash has been paid in.</Empty>
              ) : (
                <>
                  {byRider.size > 1 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {[...byRider.values()].map((entry) => (
                        <Pill key={entry.name} tone="warning">{entry.name}: {naira(entry.amount)}</Pill>
                      ))}
                    </div>
                  )}
                  <ListCard>
                    {heldCash.map((job) => (
                      <ListRow key={job.id}>
                        <div className="min-w-0 flex-1 basis-[200px]">
                          <Route from={job.pickupLocation} to={job.destination} className="block truncate text-[15px]" />
                          <div className="truncate text-[13px] text-app-ink-soft">
                            {jobId(job.id)} · {job.rider?.name ?? "No rider"} · {lagosDate(job.codCollectedAt ?? job.deliveredAt ?? job.createdAt)}
                          </div>
                        </div>
                        <div className="ml-auto text-[15px] font-extrabold">{naira(job.codCollected ?? 0)}</div>
                      </ListRow>
                    ))}
                  </ListCard>
                </>
              )}
            </Section>

            <Section id="to-collect" title="To collect" sub="Pay-on-delivery jobs that are still open.">
              {toCollect.length === 0 ? (
                <Empty>Nothing to collect on open jobs.</Empty>
              ) : (
                <ListCard>
                  {toCollect.map((job) => (
                    <ListRow key={job.id}>
                      <div className="min-w-0 flex-1 basis-[200px]">
                        <Route from={job.pickupLocation} to={job.destination} className="block truncate text-[15px]" />
                        <div className="truncate text-[13px] text-app-ink-soft">{jobId(job.id)} · {job.seller.name} · {job.rider?.name ?? "No rider yet"}</div>
                      </div>
                      <StatusPill status={job.status} />
                      <div className="ml-auto text-[15px] font-extrabold">{naira(job.cash)}</div>
                    </ListRow>
                  ))}
                </ListCard>
              )}
            </Section>

            <Section id="transfers" title="Paid by transfer" sub="The buyer paid the seller directly, so there's nothing for you to pay in.">
              {transfers.length === 0 ? (
                <Empty>No transfers recorded yet.</Empty>
              ) : (
                <ListCard>
                  {transfers.map((job) => (
                    <ListRow key={job.id}>
                      <div className="min-w-0 flex-1 basis-[200px]">
                        <Route from={job.pickupLocation} to={job.destination} className="block truncate text-[15px]" />
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {jobId(job.id)} · {job.seller.name} · {job.rider?.name ?? "No rider"} · {lagosDate(job.codCollectedAt ?? job.createdAt)}
                        </div>
                      </div>
                      <div className="ml-auto text-[15px] font-extrabold">{naira(job.codCollected ?? 0)}</div>
                    </ListRow>
                  ))}
                </ListCard>
              )}
            </Section>
          </>
        }
        side={
          <>
            <Card className="p-5">
              <CardHead title="Record a pay-in" sub={owed > 0 ? `You owe ${naira(owed)} from cash jobs.` : "Nothing owed right now."} />
              <form action={recordCodRemittance} className="mt-4 grid gap-3">
                <div>
                  <label htmlFor="payin-amount" className={labelClass}>Amount (₦)</label>
                  <input id="payin-amount" name="amount" type="number" min="1" step="any" inputMode="decimal" required defaultValue={owed > 0 ? String(owed) : ""} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="payin-reference" className={labelClass}>Reference</label>
                  <input id="payin-reference" name="reference" maxLength={120} placeholder="Bank transfer reference" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="payin-method" className={labelClass}>How you paid</label>
                  <select id="payin-method" name="method" defaultValue="transfer" className={inputClass}>
                    <option value="transfer">Bank transfer</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="payin-note" className={labelClass}>Note</label>
                  <input id="payin-note" name="note" maxLength={300} placeholder="Optional" className={inputClass} />
                </div>
                <SubmitButton>Record pay-in</SubmitButton>
                <p className="m-0 text-[12.5px] leading-[1.5] text-app-ink-soft">
                  The pay-in settles your oldest cash jobs it fully covers. Anything left over stays on the record.
                </p>
              </form>
            </Card>

            <section aria-labelledby="history" className="min-w-0">
              <h2 id="history" className="m-0 mb-3 text-[18px] font-extrabold">Pay-ins</h2>
              {remittances.length === 0 ? (
                <Empty>No pay-ins yet.</Empty>
              ) : (
                <ListCard>
                  {remittances.map((row) => (
                    <ListRow key={row.id}>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-extrabold">{naira(row.amount)}</div>
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {lagosDate(row.createdAt)}, {lagosTime(row.createdAt)} · {row.method === "cash" ? "Cash" : row.method === "api" ? "API" : "Transfer"}
                          {row.reference ? ` · ${row.reference}` : ""}
                        </div>
                      </div>
                      <span className="text-[13px] text-app-ink-soft">{row._count.bookings} {row._count.bookings === 1 ? "job" : "jobs"}</span>
                    </ListRow>
                  ))}
                </ListCard>
              )}
            </section>
          </>
        }
      />
    </PartnerPage>
  );
}
